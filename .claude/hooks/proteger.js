#!/usr/bin/env node
// Trava de segurança do Claude Code para o Vilasa-Manut.
// Roda antes de cada chamada de ferramenta (hook PreToolUse em .claude/settings.json).
// Lê o JSON da chamada na entrada padrão e decide: deixar seguir, pedir aprovação
// do Lucca ("ask") ou bloquear ("deny"). As regras estão em CLAUDE.md e
// docs/agentes/README.md; mude as duas coisas juntas.
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const PRODUCAO = 'yoignpytyegagpfuvoxu';
const HOMOLOGACAO = 'zqjgruwmqomgguxoxiuv';
const BRANCHES_PROTEGIDAS = ['main', 'homologacao'];

/**
 * @typedef {{ decisao: 'seguir' | 'ask' | 'deny', motivo?: string }} Decisao
 */

/** @param {string} cmd @returns {Decisao} */
function decidirBash(cmd) {
  const c = ' ' + cmd.replace(/\s+/g, ' ') + ' ';

  if (c.includes(PRODUCAO)) {
    return { decisao: 'deny', motivo: 'Comando cita o banco de produção (' + PRODUCAO + '). A produção é só do Lucca.' };
  }

  if (/\bgit push\b/.test(c)) {
    if (/--force\b|\s-f\s|--force-with-lease/.test(c)) {
      return { decisao: 'deny', motivo: 'Push forçado não é permitido. Crie um commit novo.' };
    }
    for (const b of BRANCHES_PROTEGIDAS) {
      const alvo = new RegExp('(\\s|:)' + b + '(\\s|$)');
      if (alvo.test(c)) {
        return { decisao: 'deny', motivo: 'Push direto em "' + b + '" não é permitido. Abra PR a partir de uma branch claude/...' };
      }
    }
    if (/\bgit push\s*$/.test(c.trim()) || /\bgit push origin\s*$/.test(c.trim())) {
      const atual = branchAtual();
      if (atual && BRANCHES_PROTEGIDAS.includes(atual)) {
        return { decisao: 'deny', motivo: 'Você está em "' + atual + '". Crie uma branch claude/... antes do push.' };
      }
    }
  }

  if (/\bgh pr merge\b/.test(c) || /pulls\/\d+\/merge\b/.test(c)) {
    return { decisao: 'ask', motivo: 'Merge de PR é commit principal: precisa da aprovação do Lucca.' };
  }

  if (/\bgit (merge|rebase|reset --hard|commit)\b/.test(c)) {
    const atual = branchAtual();
    if (atual && BRANCHES_PROTEGIDAS.includes(atual)) {
      return { decisao: 'deny', motivo: 'Não altere "' + atual + '" localmente. Trabalhe numa branch claude/...' };
    }
  }

  if (/\bpsql\b/.test(c) && /supabase\.(co|com)/.test(c)) {
    return { decisao: 'ask', motivo: 'psql contra um banco Supabase: confirme qual banco e o que será feito.' };
  }

  return { decisao: 'seguir' };
}

/** @param {string} ferramenta @param {any} entrada @returns {Decisao} */
function decidirSupabase(ferramenta, entrada) {
  const projeto = String((entrada && (entrada.project_id || entrada.projectId || entrada.ref)) || '');
  const acao = ferramenta.split('__').pop() || '';
  const grava = /apply_migration|deploy_edge_function|create_branch|merge_branch|reset_branch|delete_branch|pause_project|restore_project|create_project|edge_function_secret/.test(acao);

  if (projeto === PRODUCAO) {
    if (grava) return { decisao: 'deny', motivo: 'Ação de escrita no banco de produção. Isso é feito só pelo Lucca.' };
    if (acao === 'execute_sql') return { decisao: 'ask', motivo: 'SQL no banco de PRODUÇÃO. Confirme que é só leitura e que o Lucca pediu.' };
    return { decisao: 'seguir' };
  }
  if (acao === 'create_project') {
    return { decisao: 'ask', motivo: 'Criar projeto Supabase gera custo mensal.' };
  }
  if (grava) {
    const nome = projeto === HOMOLOGACAO ? 'homologação' : (projeto || 'projeto não informado');
    return { decisao: 'ask', motivo: 'Aplicar mudança no banco (' + nome + ') precisa da aprovação do Lucca.' };
  }
  return { decisao: 'seguir' };
}

/** @param {string} arquivo @param {string} raiz @returns {Decisao} */
function decidirEdicao(arquivo, raiz) {
  if (!arquivo) return { decisao: 'seguir' };
  const rel = path.relative(raiz, path.resolve(raiz, arquivo)).split(path.sep).join('/');
  if (/(^|\/)\.env(\.|$)/.test(rel)) {
    return { decisao: 'deny', motivo: 'Arquivos .env não são editados pelo agente.' };
  }
  if (/^banco\/migracoes\/(reverter\/)?\d{4}_.*\.sql$/.test(rel) && existeNaHomologacao(rel, raiz)) {
    return { decisao: 'deny', motivo: 'Esta migração já está na homologação e não pode ser editada. Crie uma migração nova.' };
  }
  return { decisao: 'seguir' };
}

/** @param {any} dados @param {string} raiz @returns {Decisao} */
function decidir(dados, raiz) {
  const ferramenta = String((dados && dados.tool_name) || '');
  const entrada = (dados && dados.tool_input) || {};
  if (ferramenta === 'Bash') return decidirBash(String(entrada.command || ''));
  if (/^mcp__.*supabase/i.test(ferramenta)) return decidirSupabase(ferramenta, entrada);
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(ferramenta)) {
    return decidirEdicao(String(entrada.file_path || entrada.notebook_path || ''), raiz);
  }
  return { decisao: 'seguir' };
}

function branchAtual() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return ''; }
}

/** @param {string} rel @param {string} raiz */
function existeNaHomologacao(rel, raiz) {
  try {
    execFileSync('git', ['-C', raiz, 'cat-file', '-e', 'origin/homologacao:' + rel], { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}

function principal() {
  let bruto = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (p) => { bruto += p; });
  process.stdin.on('end', () => {
    let dados = {};
    try { dados = JSON.parse(bruto || '{}'); } catch (_) { process.exit(0); }
    const raiz = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const r = decidir(dados, raiz);
    if (r.decisao === 'seguir') process.exit(0);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: r.decisao,
        permissionDecisionReason: r.motivo
      }
    }));
    process.exit(0);
  });
}

if (require.main === module) principal();

module.exports = { decidir, decidirBash, decidirSupabase, decidirEdicao, PRODUCAO, HOMOLOGACAO };

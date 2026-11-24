'use strict';

const fs = require('fs');
const path = require('path');
const { carregarVilasa } = require('./carregar-sandbox');

const CATEGORIAS = new Set(['manutencao', 'producao', 'suprimentos', 'pessoas', 'plataforma']);
const ESTAGIOS = new Set(['beta', 'estavel', 'descontinuado']);
const TIPOS_SCRIPT = new Set(['classico', 'esm']);

/**
 * @param {string} faixa
 */
function faixaValida(faixa) {
  const texto = String(faixa || '').trim();
  if (texto === '*') return true;
  const corpo = texto.startsWith('^') || texto.startsWith('~') ? texto.slice(1) : texto;
  return /^\d+\.\d+\.\d+$/.test(corpo);
}

/**
 * @param {any[]} lista
 * @param {{ existe: (rel: string) => boolean, resolver: Function }} opcoes
 * @returns {string[]}
 */
function validarRegistros(lista, opcoes) {
  /** @type {string[]} */
  const erros = [];
  const manifestos = Array.isArray(lista) ? lista : [];
  /** @type {Map<string, any>} */
  const porId = new Map();
  /** @type {Set<string>} */
  const permissoes = new Set();
  /** @type {Set<string>} */
  const telas = new Set();
  /** @type {Set<string>} */
  const relatorios = new Set();
  /** @type {Set<string>} */
  const acoesLegadas = new Set();
  /** @type {Set<string>} */
  const abasLegadas = new Set();

  for (const manifesto of manifestos) {
    if (!manifesto || typeof manifesto.id !== 'string' || !manifesto.id) {
      erros.push('Manifesto sem id.');
      continue;
    }
    if (porId.has(manifesto.id)) erros.push(`Id de módulo repetido: ${manifesto.id}.`);
    porId.set(manifesto.id, manifesto);
  }

  for (const manifesto of porId.values()) {
    const id = manifesto.id;
    const onde = `Módulo ${id}`;
    for (const campo of ['nome', 'versao', 'categoria', 'estagio']) {
      if (typeof manifesto[campo] !== 'string' || !manifesto[campo]) erros.push(`${onde}: campo obrigatório "${campo}".`);
    }
    if (typeof manifesto.obrigatorio !== 'boolean') erros.push(`${onde}: "obrigatorio" precisa ser boolean.`);
    if (typeof manifesto.versao === 'string' && !/^\d+\.\d+\.\d+$/.test(manifesto.versao)) {
      erros.push(`${onde}: versão "${manifesto.versao}" não é semver x.y.z.`);
    }
    if (manifesto.categoria && !CATEGORIAS.has(manifesto.categoria)) erros.push(`${onde}: categoria inválida.`);
    if (manifesto.estagio && !ESTAGIOS.has(manifesto.estagio)) erros.push(`${onde}: estágio inválido.`);
    if (!manifesto.permissoes || typeof manifesto.permissoes !== 'object' || Array.isArray(manifesto.permissoes)) {
      erros.push(`${onde}: "permissoes" precisa ser um objeto.`);
    } else {
      for (const perm of Object.keys(manifesto.permissoes)) {
        if (permissoes.has(perm)) erros.push(`Permissão repetida: ${perm}.`);
        permissoes.add(perm);
        const prefixoNucleo = id === 'nucleo' && (perm.startsWith('nucleo.') || perm.startsWith('relatorios.'));
        if (!prefixoNucleo && !perm.startsWith(`${id}.`)) {
          erros.push(`${onde}: permissão "${perm}" não usa o prefixo "${id}."`);
        }
      }
    }

    const depende = manifesto.depende || {};
    const opcionais = manifesto.opcionais || {};
    if (manifesto.depende && (typeof depende !== 'object' || Array.isArray(depende))) erros.push(`${onde}: "depende" inválido.`);
    for (const [dep, faixa] of Object.entries(depende)) {
      if (!faixaValida(String(faixa))) erros.push(`${onde}: faixa "${faixa}" de "${dep}" é inválida.`);
    }
    for (const [dep, faixa] of Object.entries(opcionais)) {
      if (!faixaValida(String(faixa))) erros.push(`${onde}: faixa opcional "${faixa}" de "${dep}" é inválida.`);
    }

    const scripts = manifesto.scripts;
    if (!Array.isArray(scripts)) {
      erros.push(`${onde}: "scripts" precisa ser uma lista.`);
    } else if (!manifesto.embutido && scripts.length === 0) {
      erros.push(`${onde}: declare ao menos um script.`);
    } else {
      for (const script of scripts) {
        if (!script || typeof script.src !== 'string' || !script.src) {
          erros.push(`${onde}: script sem src.`);
          continue;
        }
        if (!TIPOS_SCRIPT.has(script.tipo)) erros.push(`${onde}: tipo de script inválido em ${script.src}.`);
        if (script.src.includes('..') || path.isAbsolute(script.src)) erros.push(`${onde}: caminho de script inválido: ${script.src}.`);
        else if (!opcoes.existe(script.src)) erros.push(`${onde}: script não encontrado: ${script.src}.`);
      }
    }
    for (const vendor of manifesto.vendor || []) {
      if (!opcoes.existe(vendor)) erros.push(`${onde}: vendor não encontrado: ${vendor}.`);
    }

    const listaTelas = manifesto.telas || [];
    if (!manifesto.embutido && (!Array.isArray(listaTelas) || listaTelas.length === 0)) {
      erros.push(`${onde}: declare ao menos uma tela.`);
    }
    for (const tela of listaTelas) {
      if (!tela || !tela.id) {
        erros.push(`${onde}: tela sem id.`);
        continue;
      }
      if (telas.has(tela.id)) erros.push(`Id de tela repetido: ${tela.id}.`);
      telas.add(tela.id);
      for (const campo of ['rotulo', 'icone', 'permissao', 'abrir', 'titulo_relatorio']) {
        if (typeof tela[campo] !== 'string' || !tela[campo]) erros.push(`${onde}: tela "${tela.id}" sem ${campo}.`);
      }
      if (typeof tela.ordem !== 'number') erros.push(`${onde}: tela "${tela.id}" sem ordem numérica.`);
      if (tela.permissao && manifesto.permissoes && !manifesto.permissoes[tela.permissao]) {
        erros.push(`${onde}: tela "${tela.id}" usa a permissão "${tela.permissao}", que o módulo não declara.`);
      }
    }

    const padrao = manifesto.cargos_padrao || {};
    for (const [cargo, perms] of Object.entries(padrao)) {
      if (!Array.isArray(perms)) {
        erros.push(`${onde}: cargos_padrao.${cargo} precisa ser uma lista.`);
        continue;
      }
      for (const perm of perms) {
        if (!manifesto.permissoes || !manifesto.permissoes[perm]) {
          erros.push(`${onde}: o cargo ${cargo} recebe "${perm}", que o módulo não declara.`);
        }
      }
    }

    for (const acao of Object.keys(manifesto.acoes_legadas || {})) {
      if (acoesLegadas.has(acao)) erros.push(`Ação legada repetida: ${acao}.`);
      acoesLegadas.add(acao);
      const destino = manifesto.acoes_legadas[acao];
      if (!permissoes.has(destino) && !(manifesto.permissoes && manifesto.permissoes[destino])) {
        erros.push(`${onde}: a ação legada "${acao}" aponta para "${destino}", que ninguém declara.`);
      }
    }
    for (const aba of Object.keys(manifesto.abas_legadas || {})) {
      if (abasLegadas.has(aba)) erros.push(`Aba legada repetida: ${aba}.`);
      abasLegadas.add(aba);
    }

    const ext = manifesto.extensoes || {};
    for (const rel of ext.relatorios || []) {
      if (!rel || !rel.id) {
        erros.push(`${onde}: relatório sem id.`);
        continue;
      }
      if (relatorios.has(rel.id)) erros.push(`Id de relatório repetido: ${rel.id}.`);
      relatorios.add(rel.id);
      if (!rel.funcao) erros.push(`${onde}: relatório "${rel.id}" sem função.`);
      if (!rel.permissao) erros.push(`${onde}: relatório "${rel.id}" sem permissão.`);
    }
    for (const acao of ext.qr || []) {
      if (!acao || !acao.id || !acao.funcao) erros.push(`${onde}: ação de QR incompleta.`);
      if (acao && acao.exige_login && !acao.permissao) erros.push(`${onde}: a ação de QR "${acao.id}" exige login e não tem permissão.`);
    }
  }

  for (const manifesto of porId.values()) {
    const ext = manifesto.extensoes || {};
    for (const rel of ext.relatorios || []) {
      if (rel && rel.permissao && !permissoes.has(rel.permissao)) {
        erros.push(`Módulo ${manifesto.id}: relatório "${rel.id}" usa "${rel.permissao}", que ninguém declara.`);
      }
    }
    for (const acao of ext.qr || []) {
      if (acao && acao.permissao && !permissoes.has(acao.permissao)) {
        erros.push(`Módulo ${manifesto.id}: a ação de QR "${acao.id}" usa "${acao.permissao}", que ninguém declara.`);
      }
    }
  }

  const ids = new Set(porId.keys());
  for (const manifesto of porId.values()) {
    for (const dep of Object.keys(manifesto.depende || {})) {
      if (dep !== 'nucleo' && !ids.has(dep)) erros.push(`Módulo ${manifesto.id}: dependência "${dep}" não existe.`);
    }
    for (const dep of Object.keys(manifesto.opcionais || {})) {
      if (dep !== 'nucleo' && !ids.has(dep)) erros.push(`Módulo ${manifesto.id}: opcional "${dep}" não existe.`);
    }
  }

  if (typeof opcoes.resolver === 'function') {
    const resultado = opcoes.resolver({ todos: true }, [...porId.values()]);
    for (const bloqueio of resultado.bloqueados || []) {
      erros.push(`Resolução bloqueou ${bloqueio.id}: ${bloqueio.motivo}`);
    }
    for (const aviso of resultado.avisos || []) erros.push(`Resolução: ${aviso}`);
  }

  return erros;
}

/**
 * @param {string} raiz
 */
function validarRepositorio(raiz) {
  const { Vilasa } = carregarVilasa(raiz);
  return validarRegistros(Vilasa.modulos.lista(), {
    existe: (rel) => fs.existsSync(path.join(raiz, rel)),
    resolver: Vilasa.modulos.resolver
  });
}

function main() {
  const raiz = path.resolve(__dirname, '..');
  const erros = validarRepositorio(raiz);
  if (erros.length) {
    for (const erro of erros) console.error(erro);
    process.exit(1);
  }
  console.log('Manifestos ok.');
}

if (require.main === module) main();

module.exports = { validarRegistros, validarRepositorio };

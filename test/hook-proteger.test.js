// Testes da trava de segurança dos agentes (.claude/hooks/proteger.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { decidir, PRODUCAO, HOMOLOGACAO } = require('../.claude/hooks/proteger.js');

const raiz = path.resolve(__dirname, '..');
const bash = (command) => decidir({ tool_name: 'Bash', tool_input: { command } }, raiz).decisao;
const supa = (acao, project_id) => decidir({ tool_name: 'mcp__Supabase__' + acao, tool_input: { project_id } }, raiz).decisao;

test('bloqueia qualquer comando que cite a produção', () => {
  assert.equal(bash('psql postgres://x@db.' + PRODUCAO + '.supabase.co/postgres'), 'deny');
  assert.equal(bash('curl https://' + PRODUCAO + '.supabase.co/rest/v1/x'), 'deny');
});

test('bloqueia push em main e homologacao, e push forçado', () => {
  assert.equal(bash('git push origin main'), 'deny');
  assert.equal(bash('git push origin HEAD:homologacao'), 'deny');
  assert.equal(bash('git push -u origin claude/x --force'), 'deny');
  assert.equal(bash('git push -f origin claude/x'), 'deny');
});

test('libera push da branch de trabalho', () => {
  assert.equal(bash('git push -u origin claude/alerta-diesel'), 'seguir');
  assert.equal(bash('git push origin claude/main-menu'), 'seguir');
});

test('merge de PR pede aprovação', () => {
  assert.equal(bash('gh pr merge 12 --merge'), 'ask');
  assert.equal(bash('gh api -X PUT repos/a/b/pulls/12/merge'), 'ask');
});

test('Supabase: produção só leitura com aprovação, escrita bloqueada', () => {
  assert.equal(supa('apply_migration', PRODUCAO), 'deny');
  assert.equal(supa('execute_sql', PRODUCAO), 'ask');
  assert.equal(supa('list_tables', PRODUCAO), 'seguir');
});

test('Supabase: homologação lê livre e pede aprovação para migração', () => {
  assert.equal(supa('execute_sql', HOMOLOGACAO), 'seguir');
  assert.equal(supa('apply_migration', HOMOLOGACAO), 'ask');
  assert.equal(supa('create_project', ''), 'ask');
});

test('não deixa editar .env', () => {
  assert.equal(decidir({ tool_name: 'Write', tool_input: { file_path: path.join(raiz, '.env') } }, raiz).decisao, 'deny');
  assert.equal(decidir({ tool_name: 'Edit', tool_input: { file_path: path.join(raiz, 'frota.js') } }, raiz).decisao, 'seguir');
});

test('ferramentas sem regra seguem o fluxo normal', () => {
  assert.equal(decidir({ tool_name: 'Read', tool_input: { file_path: 'x' } }, raiz).decisao, 'seguir');
  assert.equal(decidir({}, raiz).decisao, 'seguir');
});

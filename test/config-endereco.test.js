'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const codigo = fs.readFileSync(path.join(raiz, 'config.js'), 'utf8');
const REF_PRODUCAO = 'yoignpytyegagpfuvoxu';
const REF_HOMOLOGACAO = 'zqjgruwmqomgguxoxiuv';

/**
 * Roda o config.js como o navegador, num endereço qualquer.
 * @param {string} hostname
 */
function abrirEm(hostname) {
  /** @type {Record<string, any>} */
  const criados = [];
  const sandbox = {
    console: { warn() {} },
    location: { hostname },
    supabase: { createClient: (url, chave) => { criados.push({ url, chave }); return { url }; } }
  };
  sandbox.window = sandbox;
  vm.runInContext(codigo, vm.createContext(sandbox), { filename: 'config.js' });
  return { sandbox, criados };
}

test('o endereço de produção usa o banco de produção', () => {
  const { sandbox, criados } = abrirEm('vilasa-manut.vercel.app');
  assert.equal(sandbox.AMBIENTE_ATUAL.producao, true);
  assert.match(sandbox.SUPABASE_URL, new RegExp(REF_PRODUCAO));
  assert.equal(criados.length, 1);
  assert.match(criados[0].url, new RegExp(REF_PRODUCAO));
});

test('preview, homologação, localhost e endereço desconhecido caem na homologação', () => {
  const enderecos = [
    'vilasa-manut-git-homologacao-lucca.vercel.app',
    'vilasa-manut-abc123-lucca.vercel.app',
    'vilasa-manut.vercel.app.outro.com',
    'xvilasa-manut.vercel.app',
    'localhost',
    '127.0.0.1',
    'cliente-novo.com.br',
    ''
  ];
  for (const host of enderecos) {
    const { sandbox } = abrirEm(host);
    assert.equal(sandbox.AMBIENTE_ATUAL.producao, false, host);
    assert.match(sandbox.SUPABASE_URL, new RegExp(REF_HOMOLOGACAO), host);
    assert.equal(sandbox.SUPABASE_ANON_KEY.includes(REF_PRODUCAO), false, host);
  }
});

test('maiúsculas e ponto final no endereço não mudam a escolha', () => {
  assert.equal(abrirEm('VILASA-MANUT.vercel.app').sandbox.AMBIENTE_ATUAL.producao, true);
  assert.equal(abrirEm('vilasa-manut.vercel.app.').sandbox.AMBIENTE_ATUAL.producao, true);
});

test('cada chave pertence ao projeto da própria URL e é só anon/publishable', () => {
  const { sandbox } = abrirEm('localhost');
  const ambientes = [sandbox.AMBIENTES.homologacao, ...sandbox.AMBIENTES.producao];
  for (const amb of ambientes) {
    const ref = new URL(amb.url).hostname.split('.')[0];
    if (amb.chave.startsWith('sb_publishable_')) continue;
    const carga = JSON.parse(Buffer.from(amb.chave.split('.')[1], 'base64url').toString('utf8'));
    assert.equal(carga.ref, ref, amb.id);
    assert.equal(carga.role, 'anon', `${amb.id}: só chave anon pode ficar no config.js`);
  }
  // Nenhum endereço aparece em dois clientes.
  const todos = sandbox.AMBIENTES.producao.flatMap((a) => a.enderecos);
  assert.equal(new Set(todos).size, todos.length);
});

test('sem a biblioteca do Supabase (offline) o config.js não quebra', () => {
  const sandbox = { console: { warn() {} }, location: { hostname: 'localhost' } };
  sandbox.window = sandbox;
  vm.runInContext(codigo, vm.createContext(sandbox));
  assert.equal(sandbox.db, null);
});

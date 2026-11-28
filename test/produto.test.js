'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const raiz = path.resolve(__dirname, '..');
const codigo = fs.readFileSync(path.join(raiz, 'nucleo/produto.js'), 'utf8');

/**
 * localStorage em memória, com limite de tamanho opcional (simula celular cheio).
 * @param {Record<string, string>} inicial
 * @param {number} [limite] total de caracteres que cabe
 */
function armazem(inicial, limite) {
  /** @type {Map<string, string>} */
  const dados = new Map(Object.entries(inicial));
  const total = () => Array.from(dados.entries()).reduce((s, [k, v]) => s + k.length + v.length, 0);
  return {
    dados,
    get length() { return dados.size; },
    key(i) { return Array.from(dados.keys())[i] ?? null; },
    getItem(k) { return dados.has(k) ? /** @type {string} */ (dados.get(k)) : null; },
    setItem(k, v) {
      const antes = dados.get(k);
      dados.set(k, String(v));
      if (limite && total() > limite) {
        if (antes === undefined) dados.delete(k); else dados.set(k, antes);
        throw new Error('QuotaExceededError');
      }
    },
    removeItem(k) { dados.delete(k); }
  };
}

/**
 * Roda o produto.js com o armazém dado, como o navegador ao abrir a página.
 * @param {ReturnType<typeof armazem>} storage
 */
function abrir(storage) {
  const sandbox = { console: { warn() {} }, localStorage: storage };
  sandbox.window = sandbox;
  vm.runInContext(codigo, vm.createContext(sandbox));
  return sandbox;
}

test('o produto não tem nome de cliente e gera chaves com o prefixo próprio', () => {
  const s = abrir(armazem({}));
  assert.equal(s.PlataformaProduto.chave('sessao_v3'), 'plat_sessao_v3');
  assert.equal(/vilasa/i.test(s.PLATAFORMA_PRODUTO.nome), false);
  assert.equal(Object.isFrozen(s.PLATAFORMA_PRODUTO), true);
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  assert.equal(sw.includes(`const PREFIXO_CACHE = '${s.PLATAFORMA_PRODUTO.prefixoCacheSw}'`), true);
});

test('ao abrir, as chaves antigas mudam de nome e as de fora ficam', () => {
  const fila = JSON.stringify([{ tabela: 'ordens_servico', operacao: 'INSERT', payload: { id: 'a' } }]);
  const st = armazem({
    vilasa_sessao_v3: '{"perfil":{"id":"1"}}',
    vilasa_fila_sync_v2: fila,
    vilasa_empresa_codigo: 'VILASA',
    vilasa_obra_ativa_v2: 'L1',
    vilasa_cache_equip: '[1,2]',
    outra_coisa: 'x'
  });
  const s = abrir(st);
  assert.equal(st.getItem('plat_sessao_v3'), '{"perfil":{"id":"1"}}');
  assert.equal(st.getItem('plat_fila_sync_v2'), fila);
  assert.equal(st.getItem('plat_empresa_codigo'), 'VILASA');
  assert.equal(st.getItem('plat_local_ativo'), 'L1');
  assert.equal(st.getItem('plat_cache_equip'), '[1,2]');
  assert.equal(st.getItem('outra_coisa'), 'x');
  // Sessão, empresa e local ficam também no nome antigo (aba antiga aberta).
  const sobraram = Array.from(st.dados.keys()).filter((k) => k.startsWith('vilasa_')).sort();
  assert.equal(JSON.stringify(sobraram), JSON.stringify(['vilasa_empresa_codigo', 'vilasa_obra_ativa_v2', 'vilasa_sessao_v3']));
  assert.equal(s.PlataformaProduto.ultimaMigracao().movidas.length, 5);
  // O "sair" apaga as cópias antigas.
  s.PlataformaProduto.esquecerLegado(['sessao_v3', 'local_ativo'], st);
  assert.equal(st.getItem('vilasa_sessao_v3'), null);
  assert.equal(st.getItem('vilasa_obra_ativa_v2'), null);
  assert.equal(st.getItem('vilasa_empresa_codigo'), 'VILASA');
  // Rodar de novo não muda nada.
  const depois = JSON.stringify(Array.from(st.dados.entries()));
  s.PlataformaProduto.migrarChavesLegadas(st);
  assert.equal(JSON.stringify(Array.from(st.dados.entries())), depois);
});

test('fila nas duas chaves: junta sem repetir e sem perder item', () => {
  const a = { tabela: 't', operacao: 'INSERT', payload: { id: 'a' } };
  const b = { tabela: 't', operacao: 'UPDATE', payload: { x: 1 }, idRegistro: 'b' };
  const c = { tabela: 't', operacao: 'INSERT', payload: { id: 'c' } };
  const st = armazem({
    plat_fila_sync_v2: JSON.stringify([a, b]),
    vilasa_fila_sync_v2: JSON.stringify([b, c])
  });
  abrir(st);
  assert.equal(st.getItem('plat_fila_sync_v2'), JSON.stringify([a, b, c]));
  assert.equal(st.getItem('vilasa_fila_sync_v2'), null);
});

test('fila nova corrompida: vale a antiga, que é legível', () => {
  const fila = JSON.stringify([{ tabela: 't', operacao: 'INSERT', payload: { id: 'x' } }]);
  for (const corrompida of ['null', '{oops', '"texto"']) {
    const st = armazem({ plat_fila_sync_v2: corrompida, vilasa_fila_sync_v2: fila });
    abrir(st);
    assert.equal(st.getItem('plat_fila_sync_v2'), fila, corrompida);
    assert.equal(st.getItem('vilasa_fila_sync_v2'), null, corrompida);
  }
});

test('fila antiga ilegível não é apagada', () => {
  const st = armazem({ plat_fila_sync_v2: '[]', vilasa_fila_sync_v2: '[{quebrado' });
  const s = abrir(st);
  assert.equal(st.getItem('vilasa_fila_sync_v2'), '[{quebrado');
  assert.equal(s.PlataformaProduto.ultimaMigracao().pendentes.includes('vilasa_fila_sync_v2'), true);
});

test('aba antiga grava com o nome velho depois da migração: a próxima rodada junta', () => {
  const a = { tabela: 't', operacao: 'INSERT', payload: { id: 'a' }, empresa_id: 'E1' };
  const b = { tabela: 't', operacao: 'INSERT', payload: { id: 'b' }, empresa_id: 'E1' };
  const st = armazem({ vilasa_fila_sync_v2: JSON.stringify([a]), vilasa_sessao_v3: '{"perfil":{"id":"1"}}' });
  const s = abrir(st);
  // A aba antiga ainda lê a sessão pelo nome velho (põe empresa no item)...
  assert.equal(st.getItem('vilasa_sessao_v3'), '{"perfil":{"id":"1"}}');
  // ...e grava um item novo na fila antiga.
  st.setItem('vilasa_fila_sync_v2', JSON.stringify([b]));
  s.PlataformaProduto.migrarAgora();
  assert.equal(st.getItem('plat_fila_sync_v2'), JSON.stringify([a, b]));
  assert.equal(st.getItem('vilasa_fila_sync_v2'), null);
});

test('celular cheio: fila antiga fica onde está; cache antigo é descartado', () => {
  const fila = JSON.stringify(Array.from({ length: 20 }, (_, i) => ({ tabela: 't', operacao: 'INSERT', payload: { id: String(i) } })));
  const cache = 'x'.repeat(200);
  const inicial = { vilasa_fila_sync_v2: fila, vilasa_cache_grande: cache };
  const tamanho = Object.entries(inicial).reduce((s, [k, v]) => s + k.length + v.length, 0);
  // Cabe o que já existe, mas não uma segunda cópia da fila.
  const st = armazem(inicial, tamanho + 10);
  const s = abrir(st);
  const r = s.PlataformaProduto.ultimaMigracao();
  // A fila nunca é apagada antes de a cópia nova existir.
  assert.equal(st.getItem('vilasa_fila_sync_v2') === fila || st.getItem('plat_fila_sync_v2') === fila, true);
  if (st.getItem('plat_fila_sync_v2') !== fila) {
    assert.equal(r.pendentes.includes('vilasa_fila_sync_v2'), true);
  }
  assert.equal(st.getItem('vilasa_cache_grande'), null);
});

test('sem localStorage (página fechada ao armazenamento) não quebra', () => {
  const sandbox = { console: { warn() {} } };
  sandbox.window = sandbox;
  vm.runInContext(codigo, vm.createContext(sandbox));
  assert.equal(typeof sandbox.PlataformaProduto.chave, 'function');
});

test('nenhum arquivo entregue ao navegador grava chave com o prefixo antigo', () => {
  const arquivos = ['core.js', 'offline_sync.js', 'qr.html', 'index.html', ...['base', 'resolver', 'permissoes', 'sessao', 'telas', 'marca', 'carregador', 'termos'].map((p) => `nucleo/${p}.js`), 'nucleo/nucleo.js', 'nucleo/contexto.js', 'nucleo/ativos.js', 'nucleo/qr.js', 'nucleo/manifestos.js'];
  for (const rel of arquivos) {
    const texto = fs.readFileSync(path.join(raiz, rel), 'utf8');
    // Única exceção: o nome histórico do IndexedDB (trocar apaga o cache offline).
    assert.equal(/['"`]vilasa_(?!dados_v1['"`])/.test(texto), false, rel);
  }
  for (const pagina of ['index.html', 'qr.html']) {
    const html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
    const produto = html.indexOf('src="nucleo/produto.js"');
    assert.ok(produto > 0 && produto < html.indexOf('src="nucleo/base.js"'), pagina);
    assert.ok(produto < html.indexOf('src="offline_sync.js"'), pagina);
  }
});

'use strict';

// O núcleo dividido em partes: ordem de carga, objeto interno fechado e a
// mesma API de antes.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarPlataforma, PARTES_DO_NUCLEO } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

test('as partes aparecem na mesma ordem no index.html, no qr.html e no sw.js, antes do nucleo.js', () => {
  const nomes = [...PARTES_DO_NUCLEO, 'nucleo'];
  for (const pagina of ['index.html', 'qr.html']) {
    const html = fs.readFileSync(path.join(raiz, pagina), 'utf8');
    const posicoes = nomes.map((n) => html.indexOf(`src="nucleo/${n}.js"`));
    assert.ok(posicoes.every((p) => p > 0), `${pagina}: falta parte`);
    assert.deepEqual(posicoes.slice().sort((a, b) => a - b), posicoes, `${pagina}: ordem`);
    assert.ok(html.indexOf('src="nucleo/produto.js"') < posicoes[0], `${pagina}: produto antes`);
    assert.ok(html.indexOf('src="nucleo/contexto.js"') > posicoes[posicoes.length - 1], `${pagina}: contexto depois`);
  }
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  const posSw = nomes.map((n) => sw.indexOf(`'./nucleo/${n}.js'`));
  assert.ok(posSw.every((p) => p > 0), 'sw.js: falta parte no precache');
});

test('o objeto interno não fica no window depois da montagem', () => {
  const { sandbox } = carregarPlataforma(raiz);
  assert.equal(Object.prototype.hasOwnProperty.call(sandbox, '__PlataformaInterno'), false);
  assert.equal(sandbox.Vilasa, sandbox.Plataforma);
});

test('parte carregada fora de ordem avisa na hora', () => {
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  assert.throws(() => vm.runInContext(fs.readFileSync(path.join(raiz, 'nucleo/telas.js'), 'utf8'), ctx), /Carregue nucleo\/base.js antes/);
});

test('cada parte só se liga ao resto pelo objeto interno (sem variável solta entre arquivos)', () => {
  for (const parte of PARTES_DO_NUCLEO) {
    const texto = fs.readFileSync(path.join(raiz, `nucleo/${parte}.js`), 'utf8');
    assert.match(texto, /^\(function \(root\) \{$/m, parte);
    assert.match(texto, /Object\.assign\(N, \{/, `${parte}: publica as funções em N`);
  }
});

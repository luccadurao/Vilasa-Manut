'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { carregarPlataforma } = require('../scripts/carregar-sandbox');

const raiz = path.resolve(__dirname, '..');

/**
 * Roda modulos/indice.js como o service worker faria (self, sem window).
 */
function lerIndice() {
  const sandbox = {};
  sandbox.self = sandbox;
  vm.runInContext(fs.readFileSync(path.join(raiz, 'modulos/indice.js'), 'utf8'), vm.createContext(sandbox));
  return /** @type {any} */ (sandbox).PLATAFORMA_MODULOS;
}

test('o índice roda sem window e não pode ser alterado', () => {
  const indice = lerIndice();
  assert.equal(Array.isArray(indice), true);
  assert.equal(Object.isFrozen(indice), true);
  assert.equal(new Set(indice).size, indice.length);
});

test('o índice tem exatamente os módulos com manifesto, e eles são os registrados', () => {
  const indice = Array.from(lerIndice()).sort();
  const pastas = fs.readdirSync(path.join(raiz, 'modulos'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(raiz, 'modulos', d.name, 'manifesto.js')))
    .map((d) => d.name)
    .sort();
  assert.equal(JSON.stringify(indice), JSON.stringify(pastas));
  const { Plataforma } = carregarPlataforma(raiz);
  const registrados = Plataforma.modulos.lista().map((m) => m.id).filter((id) => id !== 'nucleo').sort();
  assert.equal(JSON.stringify(indice), JSON.stringify(registrados));
});

test('o índice está no precache do service worker', () => {
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  assert.equal(sw.includes("'./modulos/indice.js'"), true);
});

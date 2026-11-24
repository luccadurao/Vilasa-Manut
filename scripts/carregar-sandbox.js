'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Carrega o núcleo (e, por padrão, os manifestos) num sandbox, sem navegador e sem rede.
 * @param {string} raiz
 * @param {{ manifestos?: boolean }} [opcoes]
 */
function carregarVilasa(raiz, opcoes = {}) {
  /** @type {Record<string, any>} */
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const contexto = vm.createContext(sandbox);

  function rodar(rel) {
    const arquivo = path.join(raiz, rel);
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });
  }

  rodar('nucleo/nucleo.js');
  rodar('nucleo/ativos.js');
  if (opcoes.manifestos !== false) {
    const pasta = path.join(raiz, 'modulos');
    const nomes = fs.readdirSync(pasta, { withFileTypes: true })
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort();
    for (const nome of nomes) {
      const manifesto = path.join('modulos', nome, 'manifesto.js');
      if (fs.existsSync(path.join(raiz, manifesto))) rodar(manifesto);
    }
  }
  return { Vilasa: sandbox.Vilasa, sandbox, contexto };
}

module.exports = { carregarVilasa };

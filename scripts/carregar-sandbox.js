'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/** Partes do núcleo, na ordem de carga (antes de nucleo/nucleo.js). */
const PARTES_DO_NUCLEO = ['base', 'resolver', 'permissoes', 'sessao', 'telas', 'marca', 'carregador', 'termos'];

/**
 * Carrega o núcleo (e, por padrão, os manifestos) num sandbox, sem navegador e sem rede.
 * @param {string} raiz
 * @param {{ manifestos?: boolean }} [opcoes]
 */
function carregarPlataforma(raiz, opcoes = {}) {
  /** @type {Record<string, any>} */
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const contexto = vm.createContext(sandbox);

  function rodar(rel) {
    const arquivo = path.join(raiz, rel);
    vm.runInContext(fs.readFileSync(arquivo, 'utf8'), contexto, { filename: arquivo });
  }

  rodar('nucleo/produto.js');
  for (const parte of PARTES_DO_NUCLEO) rodar(`nucleo/${parte}.js`);
  rodar('nucleo/nucleo.js');
  rodar('nucleo/contexto.js');
  rodar('nucleo/ctx.js');
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
  // Como nas páginas: índice e carregador. Sem document, o carregador só marca
  // os manifestos como prontos (quem chamou já os registrou acima).
  rodar('modulos/indice.js');
  rodar('nucleo/manifestos.js');
  return { Plataforma: sandbox.Plataforma, sandbox, contexto };
}

module.exports = { carregarPlataforma, PARTES_DO_NUCLEO };

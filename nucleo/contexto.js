// @ts-check
// ============================================================================
// NÚCLEO — CONTEXTO COMPARTILHADO
// Guarda o estado que o núcleo e os módulos leem em comum: quem está logado,
// o local ativo e os caches de cadastro.
//
// Por que existe: o core.js declarava esse estado com `let` no topo. Variável
// `let` de topo não vira propriedade de `window`, então o núcleo lia
// `window.usuarioLogado` e recebia `undefined` (permissão negada sem motivo,
// termos da empresa ignorados, lista de locais vazia no cadastro de ativos).
//
// Aqui cada nome antigo vira uma propriedade de `window` com get/set, guardada
// num lugar só. O código antigo continua escrevendo `usuarioLogado = x` e
// lendo `cacheObras` como antes; o núcleo passa a ler o mesmo valor por
// `Vilasa.contexto`. Carregue logo depois de nucleo/nucleo.js e antes do core.js.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /** Valor inicial de cada nome antigo. 'TODAS' = nenhum local escolhido. */
  const INICIAIS = {
    usuarioLogado: () => null,
    obraAtivaId: () => 'TODAS',
    abaAtivaGlobal: () => null,
    cacheObras: () => [],
    cacheEquipamentos: () => [],
    cacheUsuarios: () => [],
    cachePecas: () => [],
    cacheOrdens: () => []
  };

  /** Mudança nestes nomes avisa quem ouve `nucleo.contexto_mudou`. */
  const AVISAM = new Set(['usuarioLogado', 'obraAtivaId']);

  /** @type {Record<string, any>} */
  const estado = {};

  /**
   * @param {string} nome
   * @param {any} anterior
   */
  function avisar(nome, anterior) {
    const eventos = root.Vilasa && root.Vilasa.eventos;
    if (!eventos || typeof eventos.emitir !== 'function') return;
    eventos.emitir('nucleo.contexto_mudou', { campo: nome, anterior, atual: estado[nome] });
  }

  /**
   * @param {string} nome
   */
  function ler(nome) {
    if (!Object.prototype.hasOwnProperty.call(INICIAIS, nome)) {
      throw new Error(`Contexto não tem o campo "${nome}"`);
    }
    return estado[nome];
  }

  /**
   * @param {string} nome
   * @param {any} valor
   */
  function definir(nome, valor) {
    if (!Object.prototype.hasOwnProperty.call(INICIAIS, nome)) {
      throw new Error(`Contexto não tem o campo "${nome}"`);
    }
    const anterior = estado[nome];
    estado[nome] = valor;
    if (AVISAM.has(nome) && anterior !== valor) avisar(nome, anterior);
  }

  for (const nome of Object.keys(INICIAIS)) {
    const inicial = /** @type {Record<string, () => any>} */ (INICIAIS)[nome];
    // Se alguém já pôs o nome em window antes (ex.: teste), mantém o valor.
    const existente = Object.prototype.hasOwnProperty.call(root, nome) ? root[nome] : undefined;
    estado[nome] = existente === undefined ? inicial() : existente;
    Object.defineProperty(root, nome, {
      configurable: true,
      enumerable: true,
      get() { return estado[nome]; },
      set(valor) { definir(nome, valor); }
    });
  }

  const contexto = {
    ler,
    definir,
    /** Pessoa logada (perfil da sessão) ou null. */
    get usuario() { return estado.usuarioLogado; },
    /** Id do local ativo, ou 'TODAS' quando nenhum foi escolhido. */
    get localAtivoId() { return estado.obraAtivaId; },
    /** Nomes guardados aqui. */
    campos: () => Object.keys(INICIAIS)
  };

  if (root.Vilasa) root.Vilasa.contexto = contexto;
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

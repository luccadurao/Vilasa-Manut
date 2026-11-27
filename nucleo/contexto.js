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
// Aqui cada nome vira uma propriedade de `window` com get/set, guardada num
// lugar só. Os nomes oficiais são genéricos (localAtivoId, cacheLocais,
// cacheAtivos). Os antigos (obraAtivaId, cacheObras, cacheEquipamentos) são
// apelidos do mesmo valor, para os módulos que ainda usam esses nomes.
// Carregue logo depois de nucleo/nucleo.js e antes do core.js.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /** Valor inicial de cada campo oficial. 'TODAS' = nenhum local escolhido. */
  const INICIAIS = {
    usuarioLogado: () => null,
    localAtivoId: () => 'TODAS',
    abaAtivaGlobal: () => null,
    cacheLocais: () => [],
    cacheAtivos: () => [],
    cacheUsuarios: () => [],
    cachePecas: () => [],
    cacheOrdens: () => []
  };

  /** Nome antigo → campo oficial. Os dois leem e gravam o mesmo valor. */
  const APELIDOS = Object.freeze({
    obraAtivaId: 'localAtivoId',
    cacheObras: 'cacheLocais',
    cacheEquipamentos: 'cacheAtivos'
  });

  /** Mudança nestes campos avisa quem ouve `nucleo.contexto_mudou`. */
  const AVISAM = new Set(['usuarioLogado', 'localAtivoId']);

  /**
   * @param {string} nome
   * @returns {string}
   */
  function oficial(nome) {
    if (Object.prototype.hasOwnProperty.call(APELIDOS, nome)) {
      return /** @type {Record<string, string>} */ (APELIDOS)[nome];
    }
    if (Object.prototype.hasOwnProperty.call(INICIAIS, nome)) return nome;
    throw new Error(`Contexto não tem o campo "${nome}"`);
  }

  /** @type {Record<string, any>} */
  const estado = {};

  /**
   * @param {string} nome
   * @param {any} anterior
   */
  function avisar(nome, anterior) {
    const eventos = root.Plataforma && root.Plataforma.eventos;
    if (!eventos || typeof eventos.emitir !== 'function') return;
    eventos.emitir('nucleo.contexto_mudou', { campo: nome, anterior, atual: estado[nome] });
  }

  /**
   * @param {string} nome
   */
  function ler(nome) {
    return estado[oficial(nome)];
  }

  /**
   * @param {string} nome
   * @param {any} valor
   */
  function definir(nome, valor) {
    const campo = oficial(nome);
    const anterior = estado[campo];
    estado[campo] = valor;
    if (AVISAM.has(campo) && anterior !== valor) avisar(campo, anterior);
  }

  for (const nome of Object.keys(INICIAIS)) {
    const inicial = /** @type {Record<string, () => any>} */ (INICIAIS)[nome];
    estado[nome] = inicial();
  }
  for (const nome of [...Object.keys(INICIAIS), ...Object.keys(APELIDOS)]) {
    const campo = oficial(nome);
    // Se alguém já pôs o nome em window antes (ex.: teste), mantém o valor.
    const existente = Object.prototype.hasOwnProperty.call(root, nome) ? root[nome] : undefined;
    if (existente !== undefined) estado[campo] = existente;
    Object.defineProperty(root, nome, {
      configurable: true,
      enumerable: true,
      get() { return estado[campo]; },
      set(valor) { definir(campo, valor); }
    });
  }

  const contexto = {
    ler,
    definir,
    /** Pessoa logada (perfil da sessão) ou null. */
    get usuario() { return estado.usuarioLogado; },
    /** Id do local ativo, ou 'TODAS' quando nenhum foi escolhido. */
    get localAtivoId() { return estado.localAtivoId; },
    /** Campos oficiais guardados aqui. */
    campos: () => Object.keys(INICIAIS),
    /** Nomes antigos aceitos como apelido: { antigo: oficial }. */
    apelidos: () => Object.assign({}, APELIDOS)
  };

  if (root.Plataforma) root.Plataforma.contexto = contexto;
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

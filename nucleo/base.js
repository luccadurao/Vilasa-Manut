// @ts-check
// ============================================================================
// NÚCLEO — BASE: estado compartilhado, registro de manifestos, definirModulo e busca de função
// Parte do núcleo (ver nucleo/nucleo.js, que monta a API pública).
// As partes conversam pelo objeto interno N; função de outra parte é chamada
// por um repasse de uma linha, resolvido na hora da chamada.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /** Objeto interno das partes do núcleo. Sai do window quando nucleo.js monta a API. */
  /** @type {any} */
  const N = {};
  Object.defineProperty(root, '__PlataformaInterno', { value: N, configurable: true });
  /** Estado que muda (antes eram let no nucleo.js). */
  N.estado = {
    /** @type {import('./tipos.js').ResultadoResolucao | null} */
    resolucaoGuardada: null,
    /** @type {import('./tipos.js').ResultadoCarga | null} */
    resultadoCarga: null,
    /** @type {Promise<import('./tipos.js').ResultadoCarga> | null} */
    cargaPromise: null
  };


  /** @type {import('./tipos.js').Manifesto[]} */
  const registros = [];
  /** @type {Map<string, Set<(dados?: any) => void>>} */
  const ouvintes = new Map();
  /** @type {import('./tipos.js').ResultadoResolucao | null} */
  /** @type {import('./tipos.js').ResultadoCarga | null} */
  /** @type {Promise<import('./tipos.js').ResultadoCarga> | null} */
  /** O que cada módulo entregou por definirModulo. */
  /** @type {Map<string, any>} */
  const implementacoes = new Map();
  /** ctx entregue a cada módulo carregado (para o parar). */
  /** @type {Map<string, any>} */
  const contextos = new Map();
  /** Módulos que já receberam o aviso de compatibilidade. */
  const avisosGlobal = new Set();
  /** Scripts já injetados nesta página: uma segunda carga não injeta de novo. */
  /** @type {Set<string>} */
  const scriptsJaCarregados = new Set();

  const VERSAO_NUCLEO = '1.0.0';

  /**
   * Ambiente escolhido pelo config.js (banco, site, empresa padrão, marca).
   * @returns {{ site?: string | null, empresa_padrao?: string, marca?: string | null, termos?: Record<string, string> | null } | null}
   */
  function ambienteAtual() {
    const amb = root.AMBIENTE_ATUAL;
    return amb && typeof amb === 'object' ? amb : null;
  }

  /**
   * Endereço do site: o oficial do ambiente, ou o endereço em que a página abriu.
   * @returns {string}
   */
  function siteAtual() {
    const amb = ambienteAtual();
    if (amb && typeof amb.site === 'string' && amb.site) return amb.site.replace(/\/+$/, '');
    const loc = root.location;
    if (loc && typeof loc.origin === 'string' && /^https?:/.test(String(loc.protocol || loc.origin))) {
      return loc.origin.replace(/\/+$/, '');
    }
    return '';
  }

  /** Base das etiquetas de QR: `<site>/qr.html`. */
  function urlBaseQr() {
    return `${siteAtual()}/qr.html`;
  }

  /**
   * @param {string | null | undefined} nome
   * @param {string} [moduloId]
   * @returns {Function | null}
   */
  function resolverFuncao(nome, moduloId) {
    if (!nome) return null;
    // 1. O que o módulo entregou por definirModulo (contrato v2).
    const impl = moduloId ? implementacoes.get(moduloId) : null;
    if (impl) {
      for (const grupo of ['telas', 'relatorios', 'qr', 'funcoes']) {
        const mapa = impl[grupo];
        if (mapa && typeof mapa[nome] === 'function') return mapa[nome];
      }
    }
    // 2. PlataformaMod[<id>][nome] (forma intermediária, ainda aceita).
    const grupos = root.PlataformaMod;
    if (moduloId && grupos && grupos[moduloId] && typeof grupos[moduloId][nome] === 'function') {
      return grupos[moduloId][nome];
    }
    // 3. Compatibilidade: função global solta. Avisa uma vez por módulo.
    if (typeof root[nome] === 'function') {
      const chaveAviso = moduloId || '(sem módulo)';
      const naProducao = !!(root.AMBIENTE_ATUAL && root.AMBIENTE_ATUAL.producao);
      if (moduloId && !implementacoes.has(moduloId) && !avisosGlobal.has(chaveAviso)) {
        avisosGlobal.add(chaveAviso);
        if (root.console && !naProducao) root.console.info(`Módulo ${moduloId} usa funções globais (compatibilidade). Migre para Plataforma.definirModulo.`);
      }
      return root[nome];
    }
    return null;
  }

  /**
   * Contrato v2: o módulo entrega ao núcleo o que ele implementa, em vez de
   * deixar funções soltas no window. Chame no script do módulo, depois que o
   * manifesto dele foi registrado.
   * @param {string} id
   * @param {import('./tipos.js').ImplementacaoModulo} impl
   */
  function definirModulo(id, impl) {
    const manifesto = registros.find((item) => item.id === id);
    if (!manifesto) throw new Error(`definirModulo("${id}"): o manifesto desse módulo não foi registrado.`);
    if (!impl || typeof impl !== 'object') throw new Error(`definirModulo("${id}"): passe um objeto.`);
    if (implementacoes.has(id)) throw new Error(`definirModulo("${id}"): o módulo já foi definido.`);
    const fornece = manifesto.fornece || {};
    /** @type {Record<string, any>} */
    const servicos = {};
    for (const [nome, valor] of Object.entries(impl.servicos || {})) {
      if (!Object.prototype.hasOwnProperty.call(fornece, nome)) {
        throw new Error(`definirModulo("${id}"): o serviço "${nome}" não está em fornece do manifesto.`);
      }
      servicos[nome] = valor;
    }
    implementacoes.set(id, Object.freeze({
      iniciar: typeof impl.iniciar === 'function' ? impl.iniciar : null,
      parar: typeof impl.parar === 'function' ? impl.parar : null,
      telas: Object.assign({}, impl.telas || {}),
      relatorios: Object.assign({}, impl.relatorios || {}),
      qr: Object.assign({}, impl.qr || {}),
      funcoes: Object.assign({}, impl.funcoes || {}),
      servicos: Object.freeze(servicos)
    }));
  }

  /**
   * Manifestos que valem agora: depois da carga, só o núcleo e os módulos
   * carregados para a empresa; antes dela, todos os registrados (o qr.html,
   * por exemplo, filtra pelos módulos ativos que o servidor devolve).
   * @returns {import('./tipos.js').Manifesto[]}
   */
  function manifestosAtivos() {
    // Carga "vazia" (sessão sem módulos contratados por algum erro: só os
    // obrigatórios entraram) não pode esvaziar a tela. Nesse caso vale o
    // comportamento antigo: todos os registrados.
    if (!N.estado.resultadoCarga) return registros;
    const contratados = N.estado.resultadoCarga.carregados.filter((/** @type {string} */ id) => {
      const m = registros.find((item) => item.id === id);
      return m && !m.obrigatorio;
    });
    if (contratados.length === 0) return registros;
    const ok = new Set(['nucleo', ...N.estado.resultadoCarga.carregados]);
    return registros.filter((m) => ok.has(m.id));
  }

  /**
   * @param {import('./tipos.js').Manifesto} manifesto
   */
  function registrar(manifesto) {
    if (!manifesto || !manifesto.id) return;
    const ja = registros.find((item) => item.id === manifesto.id);
    if (ja) return;
    registros.push(manifesto);
  }

  function lista() {
    return registros.slice();
  }

  Object.assign(N, {
    VERSAO_NUCLEO,
    ambienteAtual,
    avisosGlobal,
    contextos,
    definirModulo,
    implementacoes,
    lista,
    manifestosAtivos,
    ouvintes,
    registrar,
    registros,
    resolverFuncao,
    scriptsJaCarregados,
    siteAtual,
    urlBaseQr
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

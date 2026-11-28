// @ts-check
// ============================================================================
// NÚCLEO — CARREGADOR: injeta os scripts na ordem da resolução, cria o ctx e descarrega
// Parte do núcleo (ver nucleo/nucleo.js, que monta a API pública).
// As partes conversam pelo objeto interno N; função de outra parte é chamada
// por um repasse de uma linha, resolvido na hora da chamada.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /** @type {any} */
  const N = root.__PlataformaInterno;
  if (!N) throw new Error('Carregue nucleo/base.js antes das outras partes do núcleo.');

  const contextos = N.contextos;
  const implementacoes = N.implementacoes;
  const registros = N.registros;
  const scriptsJaCarregados = N.scriptsJaCarregados;

  /** @param {...any} a */ function contratoDe(...a) { return N.contratoDe(...a); }
  /** @param {...any} a */ function resolverEGuardar(...a) { return N.resolverEGuardar(...a); }

  /**
   * @returns {string}
   */
  function versaoApp() {
    return typeof PLATAFORMA_VERSAO_APP === 'string' ? PLATAFORMA_VERSAO_APP : '';
  }

  /**
   * @param {string} src
   * @param {import('./tipos.js').TipoScriptModulo} tipo
   * @returns {Promise<void>}
   */
  function carregarScriptNoDocumento(src, tipo) {
    const doc = root.document;
    if (!doc || typeof doc.createElement !== 'function') {
      return Promise.reject(new Error('Documento indisponível para ' + src));
    }
    switch (tipo) {
      case 'classico':
        return new Promise((resolve, reject) => {
          const el = /** @type {HTMLScriptElement} */ (doc.createElement('script'));
          let terminou = false;
          const fim = (/** @type {Error | null} */ erro) => {
            if (terminou) return;
            terminou = true;
            if (erro) reject(erro);
            else resolve();
          };
          const timer = setTimeout(() => fim(new Error(src + ' (tempo esgotado)')), 20000);
          el.async = false;
          el.src = src;
          el.onload = () => {
            clearTimeout(timer);
            fim(null);
          };
          el.onerror = () => {
            clearTimeout(timer);
            fim(new Error(src));
          };
          const pai = doc.body || doc.head || doc.documentElement;
          if (!pai || typeof pai.appendChild !== 'function') {
            clearTimeout(timer);
            fim(new Error(src));
            return;
          }
          pai.appendChild(el);
        });
      case 'esm': {
        const base = (root.location && root.location.href) || doc.baseURI || 'http://localhost/';
        const url = new URL(src, base).href;
        return import(url).then(() => undefined);
      }
      default: {
        /** @type {never} */
        const nunca = tipo;
        return Promise.reject(new Error('Tipo de script desconhecido: ' + String(nunca)));
      }
    }
  }

  /**
   * @param {import('./tipos.js').ResultadoResolucao} resolucao
   * @param {import('./tipos.js').Manifesto[]} manifestos
   * @param {{ carregarScript: (src: string, tipo: import('./tipos.js').TipoScriptModulo) => Promise<void>, criarCtx?: (manifesto: import('./tipos.js').Manifesto) => any }} io
   * @returns {Promise<import('./tipos.js').ResultadoCarga>}
   */
  async function carregar(resolucao, manifestos, io) {
    /** @type {Map<string, import('./tipos.js').Manifesto>} */
    const porId = new Map();
    for (const manifesto of manifestos || []) {
      if (manifesto && manifesto.id && !porId.has(manifesto.id)) porId.set(manifesto.id, manifesto);
    }
    /** @type {import('./tipos.js').BloqueioModulo[]} */
    const bloqueados = (resolucao.bloqueados || []).map((item) => ({ id: item.id, motivo: item.motivo }));
    const bloqueadosIds = new Set(bloqueados.map((item) => item.id));
    /** @type {string[]} */
    const avisos = (resolucao.avisos || []).slice();
    /** @type {string[]} */
    const carregados = [];
    /** @type {string[]} */
    const arquivos = [];
    const vistos = new Set();
    const baixar = io && io.carregarScript;

    /**
     * @param {string} src
     * @param {import('./tipos.js').TipoScriptModulo} tipo
     */
    async function baixarUm(src, tipo) {
      if (!src || vistos.has(src)) return;
      vistos.add(src);
      arquivos.push(src);
      // Já rodou nesta página (carga anterior): não roda de novo, senão o
      // definirModulo do módulo seria chamado duas vezes.
      if (scriptsJaCarregados.has(src)) return;
      if (typeof baixar !== 'function') throw new Error('Carregador de script ausente');
      try {
        await baixar(src, tipo);
      } catch (erro) {
        vistos.delete(src);
        arquivos.pop();
        throw erro;
      }
      scriptsJaCarregados.add(src);
    }

    for (const id of resolucao.ordem || []) {
      if (bloqueadosIds.has(id)) continue;
      const manifesto = porId.get(id);
      if (!manifesto) continue;
      const depende = manifesto.depende || {};
      let dependenciaParada = '';
      for (const dep of Object.keys(depende)) {
        if (dep !== 'nucleo' && bloqueadosIds.has(dep)) {
          dependenciaParada = dep;
          break;
        }
      }
      if (dependenciaParada) {
        const motivo = `A dependência "${dependenciaParada}" não carregou.`;
        bloqueados.push({ id, motivo });
        bloqueadosIds.add(id);
        avisos.push(`Módulo "${id}" bloqueado: ${motivo}`);
        continue;
      }
      try {
        for (const vendor of manifesto.vendor || []) {
          await baixarUm(String(vendor), 'classico');
        }
        for (const script of manifesto.scripts || []) {
          if (!script || !script.src) throw new Error('script sem src');
          if (script.tipo !== 'classico' && script.tipo !== 'esm') {
            throw new Error('Tipo de script desconhecido: ' + script.tipo);
          }
          await baixarUm(script.src, script.tipo);
        }
        // iniciar só do próprio módulo (definirModulo ou PlataformaMod), nunca
        // uma função global solta chamada "iniciar", que valeria para todos.
        const impl = implementacoes.get(id);
        const grupos = root.PlataformaMod;
        const iniciar = (impl && impl.iniciar)
          || (grupos && grupos[id] && typeof grupos[id].iniciar === 'function' ? grupos[id].iniciar : null);
        const fabrica = io && typeof io.criarCtx === 'function' ? io.criarCtx : criarCtxPadrao;
        const ctx = fabrica(manifesto);
        contextos.set(id, ctx);
        if (typeof iniciar === 'function') await iniciar(ctx);
        carregados.push(id);
      } catch (erro) {
        const detalhe = erro && /** @type {Error} */ (erro).message ? /** @type {Error} */ (erro).message : String(erro);
        const motivo = `Falha ao carregar script: ${detalhe}`;
        bloqueados.push({ id, motivo });
        bloqueadosIds.add(id);
        avisos.push(`Módulo "${id}" bloqueado: ${motivo}`);
        const ctxFalho = contextos.get(id);
        if (ctxFalho && typeof ctxFalho.__soltar === 'function') ctxFalho.__soltar();
        contextos.delete(id);
      }
    }

    bloqueados.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    avisos.sort();
    // A carga feita passa a valer para menu, relatórios, QR, eventos e serviços.
    N.estado.resultadoCarga = { carregados, bloqueados, avisos, arquivos };
    return N.estado.resultadoCarga;
  }

  /**
   * @returns {string[]}
   */
  function scriptsEstaticosForaDoNucleo() {
    const doc = root.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    /** @type {string[]} */
    const fora = [];
    const nos = doc.querySelectorAll('script[src]');
    for (let i = 0; i < nos.length; i += 1) {
      const src = nos[i].getAttribute('src') || '';
      if (!src || src.includes('://')) continue;
      const limpo = src.replace(/^\.\//, '');
      if (limpo === 'config.js' || limpo === 'core.js' || limpo === 'offline_sync.js') continue;
      if (limpo.startsWith('nucleo/') || limpo.startsWith('modulos/')) continue;
      if (limpo.startsWith('vendor/supabase') || limpo.startsWith('vendor/html2canvas')) continue;
      fora.push(limpo);
    }
    return fora;
  }

  /**
   * @param {string[]} arquivos
   */
  function enviarPrecache(arquivos) {
    const nav = root.navigator;
    if (!nav || !nav.serviceWorker || !nav.serviceWorker.ready) return;
    const lista = [...new Set([...(arquivos || []), ...scriptsEstaticosForaDoNucleo()].filter(Boolean))];
    if (!lista.length) return;
    nav.serviceWorker.ready.then((/** @type {{ active?: { postMessage: Function } }} */ registro) => {
      const alvo = (registro && registro.active) || nav.serviceWorker.controller;
      if (!alvo || typeof alvo.postMessage !== 'function') return;
      alvo.postMessage({ tipo: 'precache', arquivos: lista, versao: versaoApp() });
    }).catch((/** @type {unknown} */ erro) => {
      console.warn('Precache:', erro);
    });
  }

  /**
   * ctx do módulo. O completo vem de nucleo/ctx.js (Plataforma.modulos.criarCtx);
   * sem ele, um ctx mínimo só com o id.
   * @param {import('./tipos.js').Manifesto} manifesto
   * @param {any} [usuario] quem está carregando (config da empresa dele)
   */
  function criarCtxPadrao(manifesto, usuario) {
    const fabrica = root.Plataforma && root.Plataforma.modulos && root.Plataforma.modulos.criarCtx;
    if (typeof fabrica === 'function') return fabrica(manifesto, usuario);
    return { id: manifesto.id };
  }

  /**
   * Para os módulos carregados (parar de cada um, ouvintes soltos) e zera a
   * carga, para a próxima pessoa ou empresa carregar de novo.
   */
  async function descarregar() {
    const ids = N.estado.resultadoCarga ? N.estado.resultadoCarga.carregados.slice().reverse() : [];
    for (const id of ids) {
      const impl = implementacoes.get(id);
      const ctx = contextos.get(id);
      try {
        if (impl && impl.parar) await impl.parar(ctx);
      } catch (erro) {
        if (root.console) root.console.error(`Módulo ${id}: erro no parar`, erro);
      }
      if (ctx && typeof ctx.__soltar === 'function') ctx.__soltar();
    }
    contextos.clear();
    N.estado.resultadoCarga = null;
    N.estado.resolucaoGuardada = null;
    N.estado.cargaPromise = null;
  }

  /**
   * @param {any} [usuario]
   * @returns {Promise<import('./tipos.js').ResultadoCarga>}
   */
  function garantirCarregados(usuario) {
    if (!N.estado.cargaPromise) {
      const pessoa = usuario === undefined ? root.usuarioLogado : usuario;
      N.estado.cargaPromise = (async () => {
        // Manifestos injetados pelo índice (nucleo/manifestos.js): resolver
        // antes de todos chegarem bloquearia módulo contratado.
        const P = root.Plataforma;
        if (P && P.modulos && typeof P.modulos.manifestosProntos === 'function') await P.modulos.manifestosProntos();
        const resolucao = resolverEGuardar(contratoDe(pessoa));
        const resultado = await carregar(resolucao, registros.slice(), {
          carregarScript: carregarScriptNoDocumento,
          criarCtx: (/** @type {import('./tipos.js').Manifesto} */ m) => criarCtxPadrao(m, pessoa)
        });
        N.estado.resultadoCarga = resultado;
        for (const bloqueio of resultado.bloqueados) {
          console.warn(`Módulo bloqueado: ${bloqueio.id}. ${bloqueio.motivo}`);
        }
        enviarPrecache(resultado.arquivos);
        return resultado;
      })().catch((erro) => {
        N.estado.cargaPromise = null;
        throw erro;
      });
    }
    return N.estado.cargaPromise;
  }

  Object.assign(N, {
    carregar,
    carregarScriptNoDocumento,
    criarCtxPadrao,
    descarregar,
    enviarPrecache,
    garantirCarregados,
    scriptsEstaticosForaDoNucleo,
    versaoApp
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

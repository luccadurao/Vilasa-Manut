// @ts-check
// ============================================================================
// NÚCLEO — CTX DO MÓDULO
// Monta o objeto que cada módulo recebe no iniciar(ctx). Tudo é escopado
// pelo manifesto: o módulo só emite, ouve, consome, grava e lê o que declarou.
// Pedido fora do declarado dá erro na hora, com a explicação, em vez de
// funcionar "por acaso" e quebrar em outra empresa que não tem o outro módulo.
//
// Carregue depois de nucleo/nucleo.js e de nucleo/contexto.js.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /**
   * @param {unknown} v
   * @returns {string[]}
   */
  function lista(v) {
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  }

  /**
   * @param {unknown} v
   * @returns {Record<string, any>}
   */
  function objeto(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, any>} */ (v) : {};
  }

  function plataforma() {
    return root.Plataforma;
  }

  /**
   * @param {string} id
   */
  function manifestoDe(id) {
    const P = plataforma();
    return P ? P.modulos.lista().find((/** @type {any} */ m) => m.id === id) || null : null;
  }

  /**
   * @param {unknown} valor
   * @param {string} tipo
   */
  function valorDoTipo(valor, tipo) {
    if (tipo === 'numero') return typeof valor === 'number' && Number.isFinite(valor);
    if (tipo === 'texto') return typeof valor === 'string';
    if (tipo === 'booleano') return typeof valor === 'boolean';
    if (tipo === 'lista') return Array.isArray(valor) && valor.every((x) => typeof x === 'string');
    return false;
  }

  /**
   * Config da empresa (empresa_modulos.config, vinda na sessão) com os padrões
   * do manifesto. Valor de tipo errado ou fora dos limites cai no padrão e
   * gera um aviso; chave que o manifesto não declara é ignorada.
   * @param {any} manifesto
   * @param {any} usuario
   * @returns {{ config: Record<string, any>, avisos: string[] }}
   */
  function montarConfig(manifesto, usuario) {
    const esquema = objeto(manifesto.config);
    const modulos = Array.isArray(usuario && usuario.modulos) ? usuario.modulos : [];
    const daEmpresa = objeto((modulos.find((/** @type {any} */ m) => m && typeof m === 'object' && m.id === manifesto.id) || {}).config);
    /** @type {Record<string, any>} */
    const config = {};
    /** @type {string[]} */
    const avisos = [];
    for (const [campo, def] of Object.entries(esquema)) {
      const d = objeto(def);
      let valor = d.padrao;
      if (Object.prototype.hasOwnProperty.call(daEmpresa, campo)) {
        const v = daEmpresa[campo];
        const tipoOk = valorDoTipo(v, String(d.tipo));
        const minOk = !(typeof d.min === 'number' && typeof v === 'number' && v < d.min);
        const maxOk = !(typeof d.max === 'number' && typeof v === 'number' && v > d.max);
        if (tipoOk && minOk && maxOk) valor = v;
        else avisos.push(`config.${campo} da empresa é inválido (${JSON.stringify(v)}); vale o padrão ${JSON.stringify(d.padrao)}.`);
      }
      config[campo] = Array.isArray(valor) ? Object.freeze(valor.slice()) : valor;
    }
    return { config: Object.freeze(config), avisos };
  }

  /**
   * @param {any} manifesto
   * @returns {import('./tipos.js').CtxModulo & { __soltar: () => void }}
   */
  function criarCtx(manifesto) {
    const P = plataforma();
    if (!P) throw new Error('criarCtx: Plataforma não carregou.');
    const id = String(manifesto.id);
    const onde = `Módulo ${id}`;
    /** @type {Array<() => void>} */
    const soltar = [];

    const emite = new Set([...lista(objeto(manifesto.eventos).emite), ...lista(objeto(manifesto.extensoes).emite)]);
    const ouve = new Set([
      ...Object.keys(objeto(objeto(manifesto.eventos).ouve)),
      ...Object.keys(objeto(objeto(manifesto.extensoes).ouve))
    ]);
    const consome = new Set(lista(manifesto.consome));
    const off = objeto(manifesto.offline);
    const offEscrita = new Set([...lista(off.tabelas), ...lista(off.rpcs)]);
    const offCache = new Set(lista(off.cache));
    const nucleo = manifestoDe('nucleo') || {};
    const tabelasLiberadas = new Set([...lista(manifesto.tabelas), ...lista(nucleo.tabelas)]);
    const rpcsLiberadas = new Set([...lista(manifesto.rpcs), ...lista(nucleo.rpcs)]);

    const { config, avisos } = montarConfig(manifesto, root.usuarioLogado);
    for (const aviso of avisos) if (root.console) root.console.warn(`${onde}: ${aviso}`);

    function cliente() {
      if (typeof root.obterClienteSupabase === 'function') {
        const c = root.obterClienteSupabase();
        if (c) return c;
      }
      if (root.db) return root.db;
      throw new Error(`${onde}: sem conexão com o banco.`);
    }

    const ctx = {
      id,
      manifesto: Object.freeze(Object.assign({}, manifesto)),
      pode: (/** @type {string} */ permissao) => P.permissoes.pode(permissao),
      termo: (/** @type {string} */ chave) => P.termo(chave),
      marca: Object.freeze({
        nome: () => P.marca.nome(),
        prefixoArquivo: () => P.marca.prefixoArquivo()
      }),
      contexto: Object.freeze({
        get usuario() { return root.usuarioLogado || null; },
        get empresa() { return (root.usuarioLogado && root.usuarioLogado.empresa) || null; },
        get localAtivoId() { return root.localAtivoId; }
      }),
      config,
      avisos,
      eventos: Object.freeze({
        /**
         * @param {string} nome
         * @param {any} [dados]
         */
        emitir(nome, dados) {
          if (!emite.has(nome)) throw new Error(`${onde}: o evento "${nome}" não está em eventos.emite do manifesto.`);
          P.eventos.emitir(nome, dados);
        },
        /**
         * @param {string} nome
         * @param {(dados?: any) => void} fn
         */
        ouvir(nome, fn) {
          if (!ouve.has(nome)) throw new Error(`${onde}: o evento "${nome}" não está em eventos.ouve do manifesto.`);
          const desligar = P.eventos.ouvir(nome, fn);
          soltar.push(desligar);
          return desligar;
        }
      }),
      /**
       * Serviço de outro módulo, declarado em consome. Fornecedor opcional que
       * não está ligado para a empresa devolve null.
       * @param {string} nome
       */
      servico(nome) {
        if (!consome.has(nome)) throw new Error(`${onde}: o serviço "${nome}" não está em consome do manifesto.`);
        const dono = nome.split('.')[0];
        const carregados = P.modulos.carregados();
        if (dono !== 'nucleo' && !carregados.includes(dono)) return null;
        const impl = P.modulos.implementacao(dono);
        const valor = impl && impl.servicos ? impl.servicos[nome] : undefined;
        return valor === undefined ? null : valor;
      },
      offline: Object.freeze({
        /**
         * @param {string} tabela tabela ou RPC declarada em offline
         * @param {string} operacao
         * @param {any} payload
         * @param {any} [idRegistro]
         * @param {any} [opcoes]
         */
        gravar(tabela, operacao, payload, idRegistro, opcoes) {
          if (!offEscrita.has(tabela)) {
            return Promise.reject(new Error(`${onde}: "${tabela}" não está em offline.tabelas nem em offline.rpcs do manifesto.`));
          }
          if (typeof root.gravarDadosOfflineSafe !== 'function') {
            return Promise.reject(new Error(`${onde}: a fila offline não carregou.`));
          }
          return root.gravarDadosOfflineSafe(tabela, operacao, payload, idRegistro == null ? null : idRegistro,
            Object.assign({}, opcoes || {}, { modulo: id }));
        },
        /**
         * @param {string} chave chave declarada em offline.cache
         * @param {() => any} consulta
         * @param {any} [meta]
         */
        ler(chave, consulta, meta) {
          if (!offCache.has(chave)) {
            return Promise.reject(new Error(`${onde}: a chave de cache "${chave}" não está em offline.cache do manifesto.`));
          }
          if (typeof root.lerDadosComFallbackOffline !== 'function') {
            return Promise.reject(new Error(`${onde}: a fila offline não carregou.`));
          }
          return root.lerDadosComFallbackOffline(chave, consulta, Object.assign({}, meta || {}, { modulo: id }));
        }
      }),
      db: Object.freeze({
        /**
         * Só tabela do próprio módulo ou do núcleo. De outro módulo: use o serviço dele.
         * @param {string} tabela
         */
        from(tabela) {
          if (!tabelasLiberadas.has(tabela)) {
            throw new Error(`${onde}: a tabela "${tabela}" não é do módulo nem do núcleo. Use o serviço do módulo dono (consome).`);
          }
          return cliente().from(tabela);
        },
        /**
         * @param {string} nome
         * @param {any} [args]
         */
        rpc(nome, args) {
          if (!rpcsLiberadas.has(nome)) {
            throw new Error(`${onde}: a RPC "${nome}" não é do módulo nem do núcleo. Use o serviço do módulo dono (consome).`);
          }
          return cliente().rpc(nome, args);
        }
      }),
      /** Uso interno do núcleo: solta os ouvintes deste módulo. */
      __soltar() {
        while (soltar.length) {
          const fn = soltar.pop();
          try { if (fn) fn(); } catch (e) { /* ignora */ }
        }
      }
    };
    Object.defineProperty(ctx, '__soltar', { enumerable: false });
    return Object.freeze(ctx);
  }

  const P = plataforma();
  if (P && P.modulos) {
    P.modulos.criarCtx = criarCtx;
    P.modulos.montarConfig = montarConfig;
  }
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

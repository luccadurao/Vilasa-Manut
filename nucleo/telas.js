// @ts-check
// ============================================================================
// NÚCLEO — TELAS: eventos, relatórios, ações de QR, menu, seções e abertura isolada de tela
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

  const ouvintes = N.ouvintes;

  /** @param {...any} a */ function lista(...a) { return N.lista(...a); }
  /** @param {...any} a */ function manifestosAtivos(...a) { return N.manifestosAtivos(...a); }
  /** @param {...any} a */ function pode(...a) { return N.pode(...a); }
  /** @param {...any} a */ function resolverFuncao(...a) { return N.resolverFuncao(...a); }

  /** @type {Record<import('./tipos.js').EstiloRelatorio, { icone: string, classe: string }>} */
  const ESTILOS_RELATORIO = {
    csv: {
      icone: 'fa-solid fa-file-csv',
      classe: 'px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow flex items-center gap-1.5'
    },
    impressao: {
      icone: 'fa-solid fa-print',
      classe: 'px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow flex items-center gap-1.5'
    },
    enxuto: {
      icone: 'fa-solid fa-bolt',
      classe: 'px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow flex items-center gap-1.5'
    },
    png: {
      icone: 'fa-solid fa-image',
      classe: 'px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/40 font-black text-xs shadow flex items-center gap-1.5'
    }
  };

  /**
   * @param {import('./tipos.js').Manifesto[]} [manifestos]
   * @returns {import('./tipos.js').TelaResolvida[]}
   */
  function telasDe(manifestos) {
    /** @type {import('./tipos.js').TelaResolvida[]} */
    const telas = [];
    for (const manifesto of (Array.isArray(manifestos) ? manifestos : manifestosAtivos())) {
      const listaTelas = Array.isArray(manifesto.telas) ? manifesto.telas : [];
      for (const tela of listaTelas) {
        telas.push({
          id: tela.id,
          rotulo: tela.rotulo,
          icone: tela.icone,
          ordem: Number(tela.ordem) || 0,
          permissao: tela.permissao,
          abrir: tela.abrir,
          abrirArgs: tela.abrirArgs,
          titulo_relatorio: tela.titulo_relatorio,
          moduloId: manifesto.id
        });
      }
    }
    telas.sort((a, b) => a.ordem - b.ordem || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return telas;
  }

  /**
   * @param {string} nome
   * @param {any} [dados]
   */
  function emitir(nome, dados) {
    const diretos = ouvintes.get(nome);
    if (diretos) {
      for (const fn of [...diretos]) {
        try { fn(dados); } catch (erro) { console.error(erro); }
      }
    }
    for (const manifesto of manifestosAtivos()) {
      // Contrato v2: eventos.ouve; o antigo extensoes.ouve continua aceito.
      const v2 = manifesto.eventos && manifesto.eventos.ouve;
      const v1 = manifesto.extensoes && manifesto.extensoes.ouve;
      const nomeFn = (v2 && v2[nome]) || (v1 && v1[nome]);
      if (!nomeFn) continue;
      const fn = resolverFuncao(nomeFn, manifesto.id);
      if (typeof fn !== 'function') continue;
      try { fn(dados); } catch (erro) { console.error(erro); }
    }
  }

  /**
   * @param {string} nome
   * @param {(dados?: any) => void} fn
   */
  function ouvir(nome, fn) {
    if (!ouvintes.has(nome)) ouvintes.set(nome, new Set());
    ouvintes.get(nome)?.add(fn);
    return () => ouvintes.get(nome)?.delete(fn);
  }

  /**
   * @param {string} telaId
   * @returns {import('./tipos.js').RelatorioResolvido[]}
   */
  function relatoriosDaTela(telaId) {
    /** @type {import('./tipos.js').RelatorioResolvido[]} */
    const listaRel = [];
    for (const manifesto of manifestosAtivos()) {
      const relatorios = manifesto.extensoes && manifesto.extensoes.relatorios;
      if (!Array.isArray(relatorios)) continue;
      for (const rel of relatorios) {
        if (rel.tela !== telaId) continue;
        listaRel.push({
          id: rel.id,
          tela: rel.tela,
          rotulo: rel.rotulo,
          titulo: rel.titulo,
          formato: rel.formato,
          estilo: rel.estilo,
          coleta: rel.coleta,
          permissao: rel.permissao,
          funcao: rel.funcao,
          moduloId: manifesto.id
        });
      }
    }
    return listaRel;
  }

  /**
   * @param {string} valor
   * @returns {valor is import('./tipos.js').EstiloRelatorio}
   */
  function ehEstiloRelatorio(valor) {
    return valor === 'csv' || valor === 'impressao' || valor === 'enxuto' || valor === 'png';
  }

  /**
   * @param {import('./tipos.js').EstiloRelatorio} estilo
   */
  function apresentacaoRelatorio(estilo) {
    switch (estilo) {
      case 'csv':
      case 'impressao':
      case 'enxuto':
      case 'png':
        return ESTILOS_RELATORIO[estilo];
      default: {
        /** @type {never} */
        const nunca = estilo;
        return nunca;
      }
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {string} telaId
   * @param {(rel: import('./tipos.js').RelatorioResolvido) => void} aoClicar
   */
  function montarBarra(container, telaId, aoClicar) {
    if (!container) return;
    container.textContent = '';
    const doc = container.ownerDocument || root.document;
    if (!doc) return;
    for (const rel of relatoriosDaTela(telaId)) {
      // Cada relatório tem a própria permissão (antes só valia a global).
      if (rel.permissao && !pode(rel.permissao)) continue;
      const botao = doc.createElement('button');
      botao.type = 'button';
      botao.id = `rel-${rel.id}`;
      const estilo = ehEstiloRelatorio(rel.estilo) ? rel.estilo : 'csv';
      const apresentacao = apresentacaoRelatorio(estilo);
      botao.className = apresentacao.classe;
      if (rel.titulo) botao.title = rel.titulo;
      botao.onclick = () => aoClicar(rel);
      const icone = doc.createElement('i');
      icone.className = apresentacao.icone;
      const texto = doc.createElement('span');
      texto.textContent = rel.rotulo;
      botao.append(icone, texto);
      container.appendChild(botao);
    }
  }

  function acoesQr() {
    /** @type {{ moduloId: string, id: string, rotulo: string, exige_login: boolean, permissao: string | null, funcao: string }[]} */
    const acoes = [];
    for (const manifesto of manifestosAtivos()) {
      const listaQr = manifesto.extensoes && manifesto.extensoes.qr;
      if (!Array.isArray(listaQr)) continue;
      for (const acao of listaQr) {
        acoes.push({
          moduloId: manifesto.id,
          id: acao.id,
          rotulo: acao.rotulo,
          exige_login: acao.exige_login === true,
          permissao: acao.permissao || null,
          funcao: acao.funcao
        });
      }
    }
    return acoes;
  }

  /**
   * @param {HTMLElement} nav
   */
  function montarMenu(nav) {
    if (!nav) return;
    const doc = nav.ownerDocument || root.document;
    if (!doc) return;
    nav.textContent = '';
    for (const tela of telasDe()) {
      const botao = doc.createElement('button');
      botao.type = 'button';
      botao.id = `nav-${tela.id}`;
      botao.className = 'w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 flex items-center gap-2.5 transition';
      botao.onclick = () => {
        if (typeof root.navegarPara === 'function') root.navegarPara(tela.id);
      };
      const icone = doc.createElement('i');
      icone.className = `fa-solid ${tela.icone} w-4 text-center`;
      const texto = doc.createElement('span');
      texto.textContent = tela.rotulo;
      botao.append(icone, texto);
      const visivel = !idsBloqueados().has(tela.moduloId) && (typeof root.podeVerAba === 'function'
        ? root.podeVerAba(tela.id)
        : pode(tela.permissao, root.usuarioLogado));
      if (!visivel) botao.classList.add('hidden');
      nav.appendChild(botao);
    }
  }

  /**
   * @param {HTMLElement} container
   */
  function garantirSecoes(container) {
    const doc = (container && container.ownerDocument) || root.document;
    if (!doc || !container) return;
    for (const tela of telasDe()) {
      const id = `sec-${tela.id}`;
      if (doc.getElementById(id)) continue;
      const secao = doc.createElement('section');
      secao.id = id;
      secao.className = 'hidden';
      container.appendChild(secao);
    }
  }

  /**
   * Mostra, só na seção da tela, que ela falhou. As outras telas seguem.
   * @param {import('./tipos.js').TelaResolvida} tela
   * @param {unknown} erro
   */
  function mostrarFalhaDaTela(tela, erro) {
    const detalhe = erro && /** @type {Error} */ (erro).message ? /** @type {Error} */ (erro).message : String(erro);
    if (root.console) root.console.error(`Tela ${tela.id} (módulo ${tela.moduloId}) falhou:`, erro);
    const doc = root.document;
    const secao = doc && typeof doc.getElementById === 'function' ? doc.getElementById(`sec-${tela.id}`) : null;
    if (!secao) return;
    let aviso = doc.getElementById(`falha-${tela.id}`);
    if (!aviso) {
      aviso = doc.createElement('div');
      aviso.id = `falha-${tela.id}`;
      aviso.setAttribute('role', 'alert');
      aviso.className = 'bg-rose-50 border border-rose-300 text-rose-900 rounded-2xl p-3 text-xs font-bold mb-3';
      secao.prepend(aviso);
    }
    aviso.textContent = `Esta tela teve um erro e não abriu. As outras continuam funcionando. Detalhe: ${detalhe}`;
  }

  /**
   * Abre a tela pelo que o manifesto diz, isolando a falha: erro (na hora ou
   * na promessa) vira aviso na própria seção, sem derrubar o resto do app.
   * @param {string} telaId
   * @returns {Promise<boolean>} true se abriu sem erro
   */
  async function abrirTela(telaId) {
    const tela = telasDe().find((t) => t.id === telaId);
    if (!tela || !tela.abrir) return false;
    const doc = root.document;
    const anterior = doc && typeof doc.getElementById === 'function' ? doc.getElementById(`falha-${telaId}`) : null;
    if (anterior && typeof anterior.remove === 'function') anterior.remove();
    const fn = resolverFuncao(tela.abrir, tela.moduloId);
    if (typeof fn !== 'function') {
      mostrarFalhaDaTela(tela, new Error(`a função "${tela.abrir}" não foi encontrada`));
      return false;
    }
    try {
      const args = Array.isArray(tela.abrirArgs) ? tela.abrirArgs : [];
      await fn(...args);
      return true;
    } catch (erro) {
      mostrarFalhaDaTela(tela, erro);
      return false;
    }
  }

  function idsBloqueados() {
    const lista = N.estado.resultadoCarga && N.estado.resultadoCarga.bloqueados;
    return new Set((lista || []).map((/** @type {{ id: string }} */ item) => item.id));
  }

  function primeiraVisivel() {
    const bloqueados = idsBloqueados();
    for (const tela of telasDe()) {
      if (bloqueados.has(tela.moduloId)) continue;
      const visivel = typeof root.podeVerAba === 'function'
        ? root.podeVerAba(tela.id)
        : pode(tela.permissao, root.usuarioLogado);
      if (visivel) return tela.id;
    }
    return null;
  }

  Object.assign(N, {
    ESTILOS_RELATORIO,
    abrirTela,
    acoesQr,
    apresentacaoRelatorio,
    ehEstiloRelatorio,
    emitir,
    garantirSecoes,
    idsBloqueados,
    montarBarra,
    montarMenu,
    mostrarFalhaDaTela,
    ouvir,
    primeiraVisivel,
    relatoriosDaTela,
    telasDe
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

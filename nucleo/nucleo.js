// @ts-check
// ============================================================================
// VILASA CMMS — NÚCLEO
// Registro de módulos, resolução, permissões por id, eventos locais e os
// pontos de extensão de tela, relatório e QR.
// Este arquivo não cita módulo de produto pelo nome: só percorre o que cada
// manifesto registrou. Os scripts dos módulos entram daqui, na ordem da
// resolução, e não por tag fixa no index.html.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /** @type {import('./tipos.js').Manifesto[]} */
  const registros = [];
  /** @type {Map<string, Set<(dados?: any) => void>>} */
  const ouvintes = new Map();
  /** @type {import('./tipos.js').ResultadoResolucao | null} */
  let resolucaoGuardada = null;
  /** @type {import('./tipos.js').ResultadoCarga | null} */
  let resultadoCarga = null;
  /** @type {Promise<import('./tipos.js').ResultadoCarga> | null} */
  let cargaPromise = null;

  const URL_BASE_QR = 'https://vilasa-manut.vercel.app/qr.html';
  const VERSAO_NUCLEO = '1.0.0';

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
   * @param {string | null | undefined} nome
   * @param {string} [moduloId]
   * @returns {Function | null}
   */
  function resolverFuncao(nome, moduloId) {
    if (!nome) return null;
    const grupos = root.VilasaMod;
    if (moduloId && grupos && grupos[moduloId] && typeof grupos[moduloId][nome] === 'function') {
      return grupos[moduloId][nome];
    }
    if (typeof root[nome] === 'function') return root[nome];
    return null;
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

  /**
   * @param {string} versao
   * @returns {[number, number, number] | null}
   */
  function lerSemver(versao) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(versao || '').trim());
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  /**
   * @param {[number, number, number]} a
   * @param {[number, number, number]} b
   */
  function compararSemver(a, b) {
    for (let i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
  }

  /**
   * @param {string} versao
   * @param {string} faixa
   */
  function versaoCabe(versao, faixa) {
    const pedida = String(faixa || '').trim();
    if (!pedida || pedida === '*') return true;
    const atual = lerSemver(versao);
    if (!atual) return false;
    if (pedida.startsWith('^')) {
      const base = lerSemver(pedida.slice(1));
      if (!base) return false;
      if (compararSemver(atual, base) < 0) return false;
      if (base[0] > 0) return atual[0] === base[0];
      if (base[1] > 0) return atual[0] === 0 && atual[1] === base[1];
      return atual[0] === 0 && atual[1] === 0 && atual[2] === base[2];
    }
    if (pedida.startsWith('~')) {
      const base = lerSemver(pedida.slice(1));
      if (!base) return false;
      return atual[0] === base[0] && atual[1] === base[1] && compararSemver(atual, base) >= 0;
    }
    const exata = lerSemver(pedida);
    if (!exata) return false;
    return compararSemver(atual, exata) === 0;
  }

  /**
   * @param {import('./tipos.js').Manifesto} manifesto
   */
  function ordemDaTela(manifesto) {
    const telas = Array.isArray(manifesto.telas) ? manifesto.telas : [];
    if (!telas.length) return 1000;
    let menor = 1000;
    for (const tela of telas) {
      const n = Number(tela.ordem);
      if (!Number.isNaN(n) && n < menor) menor = n;
    }
    return menor;
  }

  /**
   * @param {string} a
   * @param {string} b
   * @param {Map<string, import('./tipos.js').Manifesto>} porId
   */
  function compararPrioridade(a, b, porId) {
    const ma = porId.get(a);
    const mb = porId.get(b);
    const oa = ma ? ordemDaTela(ma) : 1000;
    const ob = mb ? ordemDaTela(mb) : 1000;
    if (oa !== ob) return oa - ob;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /**
   * @param {import('./tipos.js').ContratoModulos | string[] | null | undefined} contrato
   * @param {Map<string, import('./tipos.js').Manifesto>} porId
   * @returns {{ ativos: string[], permissoes: string[] | null, todos: boolean }}
   */
  function normalizarContrato(contrato, porId) {
    if (Array.isArray(contrato)) {
      return { ativos: contrato.map((id) => String(id)), permissoes: null, todos: false };
    }
    const origem = contrato && typeof contrato === 'object' ? contrato : {};
    const todos = origem.todos === true;
    let ativos = Array.isArray(origem.ativos) ? origem.ativos.map((id) => String(id)) : [];
    if (todos && ativos.length === 0) {
      ativos = [...porId.keys()].filter((id) => id !== 'nucleo');
    }
    const permissoes = Array.isArray(origem.permissoes) ? origem.permissoes.map((id) => String(id)) : null;
    return { ativos, permissoes, todos };
  }

  /**
   * Função pura: não lê o registro global e não mexe na tela.
   * @param {import('./tipos.js').ContratoModulos | string[]} contrato
   * @param {import('./tipos.js').Manifesto[]} manifestos
   * @returns {import('./tipos.js').ResultadoResolucao}
   */
  function resolver(contrato, manifestos) {
    /** @type {string[]} */
    const avisos = [];
    /** @type {import('./tipos.js').BloqueioModulo[]} */
    const bloqueados = [];
    /** @type {Map<string, import('./tipos.js').Manifesto>} */
    const porId = new Map();
    const lista = Array.isArray(manifestos) ? manifestos : [];

    for (const manifesto of lista) {
      if (!manifesto || !manifesto.id) continue;
      if (porId.has(manifesto.id)) {
        avisos.push(`Manifesto duplicado ignorado: ${manifesto.id}.`);
        continue;
      }
      porId.set(manifesto.id, manifesto);
    }

    const entrada = normalizarContrato(contrato, porId);
    /** @type {Set<string>} */
    const ativos = new Set(entrada.ativos);
    for (const manifesto of porId.values()) {
      if (manifesto.obrigatorio) ativos.add(manifesto.id);
    }
    ativos.add('nucleo');

    for (const id of [...ativos]) {
      if (id === 'nucleo') continue;
      if (!porId.has(id)) {
        avisos.push(`Módulo "${id}" está no contrato e não tem manifesto.`);
        ativos.delete(id);
      }
    }

    /** @type {Set<string>} */
    const jaBloqueado = new Set();
    /**
     * @param {string} id
     * @param {string} motivo
     */
    function bloquear(id, motivo) {
      if (id === 'nucleo' || jaBloqueado.has(id)) return;
      jaBloqueado.add(id);
      bloqueados.push({ id, motivo });
      ativos.delete(id);
    }

    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const id of [...ativos]) {
        if (id === 'nucleo') continue;
        const manifesto = porId.get(id);
        if (!manifesto) continue;
        const depende = manifesto.depende || {};
        for (const dep of Object.keys(depende)) {
          const faixa = depende[dep];
          if (dep === 'nucleo') {
            if (!versaoCabe(VERSAO_NUCLEO, faixa)) {
              bloquear(id, `A versão ${VERSAO_NUCLEO} do núcleo não cabe na faixa ${faixa}.`);
              mudou = true;
            }
            continue;
          }
          if (!porId.has(dep)) {
            bloquear(id, `A dependência "${dep}" não existe.`);
            mudou = true;
            break;
          }
          if (!ativos.has(dep)) {
            bloquear(id, `A dependência "${dep}" não está ativa.`);
            mudou = true;
            break;
          }
          const versaoDep = porId.get(dep)?.versao || '';
          if (!versaoCabe(versaoDep, faixa)) {
            bloquear(id, `A versão ${versaoDep} de "${dep}" não cabe na faixa ${faixa}.`);
            mudou = true;
            break;
          }
        }
      }
    }

    const nos = [...ativos].filter((id) => id !== 'nucleo');
    /** @type {Map<string, number>} */
    const grau = new Map(nos.map((id) => [id, 0]));
    /** @type {Map<string, string[]>} */
    const seguintes = new Map(nos.map((id) => [id, []]));
    for (const id of nos) {
      const depende = porId.get(id)?.depende || {};
      for (const dep of Object.keys(depende)) {
        if (dep === 'nucleo' || !grau.has(dep)) continue;
        seguintes.get(dep)?.push(id);
        grau.set(id, (grau.get(id) || 0) + 1);
      }
    }

    /** @type {string[]} */
    let fila = nos.filter((id) => grau.get(id) === 0);
    fila.sort((a, b) => compararPrioridade(a, b, porId));
    /** @type {string[]} */
    const ordem = [];
    while (fila.length) {
      const id = fila.shift();
      if (!id) break;
      ordem.push(id);
      for (const vizinho of seguintes.get(id) || []) {
        const restante = (grau.get(vizinho) || 0) - 1;
        grau.set(vizinho, restante);
        if (restante === 0) fila.push(vizinho);
      }
      fila.sort((a, b) => compararPrioridade(a, b, porId));
    }

    for (const id of nos) {
      if (!ordem.includes(id)) bloquear(id, 'Ciclo de dependências.');
    }

    let carregaveis = ordem.filter((id) => !jaBloqueado.has(id));
    if (entrada.permissoes) {
      const concedidas = new Set(entrada.permissoes);
      /** @type {Set<string>} */
      const usados = new Set();
      let avancar = true;
      while (avancar) {
        avancar = false;
        for (const id of carregaveis) {
          if (usados.has(id)) continue;
          const chaves = Object.keys(porId.get(id)?.permissoes || {});
          if (chaves.some((chave) => concedidas.has(chave))) {
            usados.add(id);
            avancar = true;
          }
        }
        for (const id of [...usados]) {
          const depende = porId.get(id)?.depende || {};
          for (const dep of Object.keys(depende)) {
            if (dep === 'nucleo' || !carregaveis.includes(dep) || usados.has(dep)) continue;
            usados.add(dep);
            avancar = true;
          }
        }
      }
      carregaveis = carregaveis.filter((id) => usados.has(id));
    }

    bloqueados.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    avisos.sort();
    return {
      ordem: carregaveis,
      ativos: ['nucleo', ...carregaveis],
      bloqueados,
      avisos
    };
  }

  /**
   * @param {import('./tipos.js').ContratoModulos | string[]} contrato
   */
  function resolverEGuardar(contrato) {
    resolucaoGuardada = resolver(contrato, registros.slice());
    return resolucaoGuardada;
  }

  /**
   * @param {any} usuario
   * @returns {string[]}
   */
  function cargosDe(usuario) {
    const bruto = usuario && Array.isArray(usuario.cargos_lista) ? usuario.cargos_lista : [];
    return [...new Set(bruto.map((/** @type {unknown} */ cargo) => String(cargo).toLowerCase().trim()).filter(Boolean))];
  }

  /**
   * @param {import('./tipos.js').Manifesto[]} [manifestos]
   */
  function manifestosUsados(manifestos) {
    return Array.isArray(manifestos) ? manifestos : registros;
  }

  /**
   * @param {string[]} cargos
   * @param {import('./tipos.js').Manifesto[]} [manifestos]
   * @returns {string[]}
   */
  function efetivas(cargos, manifestos) {
    const mods = manifestosUsados(manifestos);
    const nomes = [...new Set((cargos || []).map((cargo) => String(cargo).toLowerCase().trim()).filter(Boolean))];
    /** @type {Set<string>} */
    const set = new Set();
    if (nomes.includes('admin')) {
      for (const manifesto of mods) {
        for (const id of Object.keys(manifesto.permissoes || {})) set.add(id);
      }
      return [...set].sort();
    }
    for (const manifesto of mods) {
      const padrao = manifesto.cargos_padrao || {};
      for (const cargo of nomes) {
        const listaCargo = padrao[cargo] || [];
        for (const id of listaCargo) set.add(id);
      }
    }
    return [...set].sort();
  }

  /**
   * Lista vinda do meu_perfil. Null significa banco antigo: vale a matriz dos manifestos.
   * @param {any} pessoa
   * @returns {string[] | null}
   */
  function permissoesDeclaradas(pessoa) {
    if (!pessoa || !Object.prototype.hasOwnProperty.call(pessoa, 'permissoes')) return null;
    if (!Array.isArray(pessoa.permissoes)) return null;
    return pessoa.permissoes.map((/** @type {unknown} */ id) => String(id));
  }

  /**
   * @param {string} permissao
   * @param {any} [usuario]
   * @param {import('./tipos.js').Manifesto[]} [manifestos]
   */
  function pode(permissao, usuario, manifestos) {
    const pessoa = usuario === undefined ? root.usuarioLogado : usuario;
    const declaradas = permissoesDeclaradas(pessoa);
    if (declaradas) return declaradas.includes(String(permissao));
    const cargos = cargosDe(pessoa);
    if (!cargos.length) return false;
    if (cargos.includes('admin')) return true;
    return efetivas(cargos, manifestos).includes(permissao);
  }

  const CHAVE_SESSAO = 'vilasa_sessao_v3';
  const CHAVE_SESSAO_ANTERIOR = 'vilasa_sessao_v2';

  /**
   * @param {any} entrada
   * @returns {import('./tipos.js').SessaoGuardada['perfil'] | null}
   */
  function copiarPerfil(entrada) {
    if (!entrada || entrada.id == null || entrada.id === '') return null;
    return {
      id: String(entrada.id),
      matricula: entrada.matricula,
      nome: entrada.nome,
      cargos_lista: entrada.cargos_lista,
      obras_permitidas: entrada.obras_permitidas,
      ativo: entrada.ativo
    };
  }

  /**
   * @param {any} entrada
   * @returns {Record<string, any>}
   */
  function copiarFlags(entrada) {
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return {};
    return entrada;
  }

  /**
   * Aceita o jsonb do meu_perfil (campos no topo) ou uma sessão v3 já embrulhada.
   * @param {any} entrada
   * @returns {import('./tipos.js').SessaoGuardada | null}
   */
  function embrulharSessao(entrada) {
    if (!entrada || typeof entrada !== 'object') return null;
    const brutoPerfil = entrada.perfil && typeof entrada.perfil === 'object' ? entrada.perfil : entrada;
    const perfil = copiarPerfil(brutoPerfil);
    if (!perfil) return null;
    const origem = entrada.perfil && typeof entrada.perfil === 'object' ? entrada : entrada;
    return {
      perfil,
      empresa: origem.empresa && typeof origem.empresa === 'object' ? origem.empresa : null,
      modulos: Array.isArray(origem.modulos) ? origem.modulos : null,
      permissoes: Array.isArray(origem.permissoes) ? origem.permissoes.map((/** @type {unknown} */ id) => String(id)) : null,
      flags: copiarFlags(origem.flags),
      gerado_em: typeof origem.gerado_em === 'string' ? origem.gerado_em : new Date().toISOString()
    };
  }

  /**
   * @param {import('./tipos.js').SessaoGuardada | null} sessao
   */
  function usuarioDeSessao(sessao) {
    if (!sessao || !sessao.perfil) return null;
    /** @type {any} */
    const usuario = {
      id: sessao.perfil.id,
      matricula: sessao.perfil.matricula,
      nome: sessao.perfil.nome,
      cargos_lista: sessao.perfil.cargos_lista,
      obras_permitidas: sessao.perfil.obras_permitidas,
      ativo: sessao.perfil.ativo
    };
    if (sessao.empresa) usuario.empresa = sessao.empresa;
    if (Array.isArray(sessao.modulos)) usuario.modulos = sessao.modulos;
    if (Array.isArray(sessao.permissoes)) usuario.permissoes = sessao.permissoes;
    return usuario;
  }

  /**
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @param {string} chave
   * @returns {import('./tipos.js').SessaoGuardada | null}
   */
  function lerChaveSessao(storage, chave) {
    const texto = storage.getItem(chave);
    if (!texto) return null;
    try {
      return embrulharSessao(JSON.parse(texto));
    } catch (erro) {
      return null;
    }
  }

  /**
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @param {any} entrada
   * @returns {import('./tipos.js').SessaoGuardada | null}
   */
  function gravarSessao(storage, entrada) {
    const sessao = embrulharSessao(entrada);
    if (!sessao) return null;
    storage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    storage.removeItem(CHAVE_SESSAO_ANTERIOR);
    return sessao;
  }

  /**
   * Lê a v3. Se só houver a v2, copia para a v3 e apaga a chave antiga.
   * @param {import('./tipos.js').ArmazemSessao} storage
   * @returns {import('./tipos.js').SessaoGuardada | null}
   */
  function lerSessao(storage) {
    const atual = lerChaveSessao(storage, CHAVE_SESSAO);
    if (atual) {
      storage.removeItem(CHAVE_SESSAO_ANTERIOR);
      return atual;
    }
    const antiga = lerChaveSessao(storage, CHAVE_SESSAO_ANTERIOR);
    if (!antiga) return null;
    storage.setItem(CHAVE_SESSAO, JSON.stringify(antiga));
    storage.removeItem(CHAVE_SESSAO_ANTERIOR);
    return antiga;
  }

  /**
   * Sem módulos nem permissões no perfil, o contrato continua "todos ativos".
   * @param {any} [usuario]
   * @returns {import('./tipos.js').ContratoModulos}
   */
  function contratoDe(usuario) {
    const pessoa = usuario === undefined ? root.usuarioLogado : usuario;
    const temModulos = !!(pessoa && Array.isArray(pessoa.modulos));
    const temPermissoes = !!(pessoa && Array.isArray(pessoa.permissoes));
    if (!temModulos && !temPermissoes) return { todos: true };
    /** @type {import('./tipos.js').ContratoModulos} */
    const contrato = {};
    if (temModulos) {
      contrato.ativos = pessoa.modulos.map((/** @type {any} */ item) => {
        if (typeof item === 'string') return item;
        return item && item.id ? String(item.id) : '';
      }).filter(Boolean);
    } else {
      contrato.todos = true;
    }
    if (temPermissoes) contrato.permissoes = pessoa.permissoes.map((/** @type {unknown} */ id) => String(id));
    return contrato;
  }

  /**
   * @param {import('./tipos.js').Manifesto[]} mods
   * @param {'acoes_legadas' | 'abas_legadas'} campo
   */
  function mapaLegado(mods, campo) {
    /** @type {Record<string, string>} */
    const mapa = {};
    for (const manifesto of mods) {
      const parcial = manifesto[campo] || {};
      for (const chave of Object.keys(parcial)) {
        if (!mapa[chave]) mapa[chave] = parcial[chave];
      }
    }
    return mapa;
  }

  /**
   * @param {string} acao
   * @param {import('./tipos.js').Manifesto[]} [manifestos]
   * @returns {string | null}
   */
  function traduzirAcao(acao, manifestos) {
    const mapa = mapaLegado(manifestosUsados(manifestos), 'acoes_legadas');
    return mapa[acao] || null;
  }

  /**
   * @param {string} abaId
   * @param {import('./tipos.js').Manifesto[]} [manifestos]
   * @returns {string | null}
   */
  function traduzirAba(abaId, manifestos) {
    const mods = manifestosUsados(manifestos);
    for (const tela of telasDe(mods)) {
      if (tela.id === abaId) return tela.permissao;
    }
    const mapa = mapaLegado(mods, 'abas_legadas');
    return mapa[abaId] || null;
  }

  /**
   * @param {string} acao
   * @param {any} [usuario]
   */
  function podeAcaoLegada(acao, usuario) {
    const id = traduzirAcao(acao);
    if (!id) return false;
    return pode(id, usuario);
  }

  /**
   * @param {string} abaId
   * @param {any} [usuario]
   */
  function podeVerTela(abaId, usuario) {
    const id = traduzirAba(abaId);
    if (!id) return false;
    return pode(id, usuario);
  }

  /**
   * @param {import('./tipos.js').Manifesto[]} [manifestos]
   * @returns {import('./tipos.js').TelaResolvida[]}
   */
  function telasDe(manifestos) {
    /** @type {import('./tipos.js').TelaResolvida[]} */
    const telas = [];
    for (const manifesto of manifestosUsados(manifestos)) {
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
   * @param {import('./tipos.js').Manifesto[]} [manifestos]
   */
  function matrizTraduzida(manifestos) {
    const mods = manifestosUsados(manifestos);
    /** @type {Set<string>} */
    const cargos = new Set();
    for (const manifesto of mods) {
      for (const cargo of Object.keys(manifesto.cargos_padrao || {})) cargos.add(cargo);
    }
    const telas = telasDe(mods);
    const acoes = Object.keys(mapaLegado(mods, 'acoes_legadas')).sort();
    /** @type {Record<string, { abas: string[], acoes: string[], permissoes: string[] }>} */
    const saida = {};
    for (const cargo of [...cargos].sort()) {
      const usuario = { cargos_lista: [cargo] };
      saida[cargo] = {
        abas: telas.filter((tela) => pode(tela.permissao, usuario, mods)).map((tela) => tela.id),
        acoes: acoes.filter((acao) => {
          const id = traduzirAcao(acao, mods);
          return Boolean(id) && pode(id || '', usuario, mods);
        }),
        permissoes: efetivas([cargo], mods)
      };
    }
    return saida;
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
    for (const manifesto of registros) {
      const mapa = manifesto.extensoes && manifesto.extensoes.ouve;
      const nomeFn = mapa && mapa[nome];
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
    for (const manifesto of registros) {
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
    for (const manifesto of registros) {
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

  function idsBloqueados() {
    const lista = resultadoCarga && resultadoCarga.bloqueados;
    return new Set((lista || []).map((item) => item.id));
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

  /**
   * @param {string} id
   */
  function urlCanonica(id) {
    const texto = String(id == null ? '' : id).trim();
    if (!texto) return URL_BASE_QR;
    return `${URL_BASE_QR}?id=${encodeURIComponent(texto)}`;
  }

  /**
   * @returns {string}
   */
  function versaoApp() {
    return typeof VILASA_VERSAO_APP === 'string' ? VILASA_VERSAO_APP : '';
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
   * @param {{ carregarScript: (src: string, tipo: import('./tipos.js').TipoScriptModulo) => Promise<void> }} io
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
      if (typeof baixar !== 'function') throw new Error('Carregador de script ausente');
      await baixar(src, tipo);
      vistos.add(src);
      arquivos.push(src);
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
        const iniciar = resolverFuncao('iniciar', id);
        if (typeof iniciar === 'function') await iniciar({ id });
        carregados.push(id);
      } catch (erro) {
        const detalhe = erro && /** @type {Error} */ (erro).message ? /** @type {Error} */ (erro).message : String(erro);
        const motivo = `Falha ao carregar script: ${detalhe}`;
        bloqueados.push({ id, motivo });
        bloqueadosIds.add(id);
        avisos.push(`Módulo "${id}" bloqueado: ${motivo}`);
      }
    }

    bloqueados.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    avisos.sort();
    return { carregados, bloqueados, avisos, arquivos };
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
   * @returns {Promise<import('./tipos.js').ResultadoCarga>}
   */
  /**
   * @param {any} [usuario]
   * @returns {Promise<import('./tipos.js').ResultadoCarga>}
   */
  function garantirCarregados(usuario) {
    if (!cargaPromise) {
      const pessoa = usuario === undefined ? root.usuarioLogado : usuario;
      cargaPromise = (async () => {
        const resolucao = resolverEGuardar(contratoDe(pessoa));
        const resultado = await carregar(resolucao, registros.slice(), {
          carregarScript: carregarScriptNoDocumento
        });
        resultadoCarga = resultado;
        for (const bloqueio of resultado.bloqueados) {
          console.warn(`Módulo bloqueado: ${bloqueio.id}. ${bloqueio.motivo}`);
        }
        enviarPrecache(resultado.arquivos);
        return resultado;
      })().catch((erro) => {
        cargaPromise = null;
        throw erro;
      });
    }
    return cargaPromise;
  }

  registrar({
    id: 'nucleo',
    nome: 'Núcleo',
    versao: VERSAO_NUCLEO,
    categoria: 'plataforma',
    estagio: 'estavel',
    obrigatorio: true,
    embutido: true,
    depende: {},
    scripts: [],
    permissoes: {
      'relatorios.exportar': 'Exportar e imprimir os relatórios da tela atual'
    },
    cargos_padrao: {
      almoxarife: ['relatorios.exportar'],
      pcm: ['relatorios.exportar'],
      gestor: ['relatorios.exportar'],
      engenheiro: ['relatorios.exportar'],
      admin: ['relatorios.exportar']
    },
    acoes_legadas: {
      exportar_relatorios: 'relatorios.exportar'
    },
    telas: [],
    extensoes: {}
  });

  /** @type {import('./tipos.js').ApiNucleo} */
  const api = {
    modulos: {
      registrar,
      lista,
      resolver,
      resolverEGuardar,
      carregar,
      garantirCarregados,
      ultimaResolucao: () => resolucaoGuardada,
      ultimaCarga: () => resultadoCarga
    },
    permissoes: {
      pode,
      traduzirAcao,
      traduzirAba,
      podeAcaoLegada,
      podeVerTela,
      efetivas,
      matrizTraduzida
    },
    sessao: {
      CHAVE: CHAVE_SESSAO,
      CHAVE_ANTERIOR: CHAVE_SESSAO_ANTERIOR,
      embrulhar: embrulharSessao,
      gravar: gravarSessao,
      ler: lerSessao,
      usuarioDe: usuarioDeSessao,
      contratoDe
    },
    eventos: { emitir, ouvir },
    extensoes: { relatoriosDaTela, montarBarra, qr: acoesQr },
    telas: { ordenadas: () => telasDe(), montarMenu, garantirSecoes, primeiraVisivel },
    resolverFuncao,
    qr: { URL_BASE: URL_BASE_QR, urlCanonica }
  };

  root.Vilasa = api;
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

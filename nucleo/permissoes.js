// @ts-check
// ============================================================================
// NÚCLEO — PERMISSÕES: cargos, permissões efetivas e tradução das ações antigas
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

  const registros = N.registros;

  /** @param {...any} a */ function telasDe(...a) { return N.telasDe(...a); }

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
        abas: telas.filter((/** @type {any} */ tela) => pode(tela.permissao, usuario, mods)).map((/** @type {any} */ tela) => tela.id),
        acoes: acoes.filter((acao) => {
          const id = traduzirAcao(acao, mods);
          return Boolean(id) && pode(id || '', usuario, mods);
        }),
        permissoes: efetivas([cargo], mods)
      };
    }
    return saida;
  }

  Object.assign(N, {
    cargosDe,
    efetivas,
    manifestosUsados,
    mapaLegado,
    matrizTraduzida,
    permissoesDeclaradas,
    pode,
    podeAcaoLegada,
    podeVerTela,
    traduzirAba,
    traduzirAcao
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

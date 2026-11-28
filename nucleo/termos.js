// @ts-check
// ============================================================================
// NÚCLEO — TERMOS: nomes genéricos (Local, Ativo) e os da empresa
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

  /** @param {...any} a */ function ambienteAtual(...a) { return N.ambienteAtual(...a); }

  /** Termos da empresa 1. Outra empresa só muda o que gravar em empresas.termos. */
  /** @type {Record<string, string>} */
  // Termos genéricos. Cada empresa troca em empresas.termos (ex.: Obra/Frente
  // com gênero 'f' numa construtora, Fazenda/Talhão numa empresa agrícola).
  // 'local.nivel1.genero': 'm' (o local) ou 'f' (a obra), para as frases.
  const TERMOS_PADRAO = {
    'local.nivel1': 'Local',
    'local.nivel2': 'Setor',
    'local.nivel1.plural': 'Locais',
    'local.nivel1.genero': 'm',
    'ativo': 'Ativo',
    'ativo.plural': 'Ativos',
    'os': 'Ordem de Serviço'
  };

  /**
   * @param {any} pessoa
   * @returns {Record<string, string> | null}
   */
  function termosDaPessoa(pessoa) {
    const origem = pessoa === undefined ? root.usuarioLogado : pessoa;
    const empresa = origem && origem.empresa && typeof origem.empresa === 'object' ? origem.empresa : null;
    const termos = empresa && empresa.termos && typeof empresa.termos === 'object' ? empresa.termos : null;
    return termos;
  }

  /**
   * @param {string} chave
   * @param {Record<string, string> | null | undefined} termos
   */
  function lerTermo(chave, termos) {
    const fonte = termos === undefined ? termosDaPessoa(undefined) : termos;
    const bruto = fonte && typeof fonte[chave] === 'string' ? fonte[chave].trim() : '';
    if (bruto) return bruto;
    // Reserva do ambiente (config.js), para sessão antiga sem empresa.termos.
    const amb = ambienteAtual();
    const doAmbiente = amb && /** @type {any} */ (amb).termos && typeof /** @type {any} */ (amb).termos[chave] === 'string'
      ? /** @type {any} */ (amb).termos[chave].trim() : '';
    if (doAmbiente && termos === undefined) return doAmbiente;
    return TERMOS_PADRAO[chave] || chave;
  }

  /**
   * Gênero do nível 1. Empresa que deu nome próprio ao local sem dizer o
   * gênero mantém o feminino de antes (era o texto fixo de "Obra").
   * @param {Record<string, string> | null | undefined} termos
   */
  function generoDoLocal(termos) {
    const fonte = termos === undefined ? termosDaPessoa(undefined) : termos;
    const explicito = fonte && typeof fonte['local.nivel1.genero'] === 'string' ? fonte['local.nivel1.genero'].trim().toLowerCase() : '';
    if (explicito === 'f' || explicito === 'm') return explicito;
    const nomeProprio = lerTermo('local.nivel1', termos);
    if (nomeProprio && nomeProprio !== TERMOS_PADRAO['local.nivel1']) {
      const amb = ambienteAtual();
      const genAmb = amb && /** @type {any} */ (amb).termos && /** @type {any} */ (amb).termos['local.nivel1.genero'];
      if (genAmb === 'f' || genAmb === 'm') return genAmb;
      return 'f';
    }
    return TERMOS_PADRAO['local.nivel1.genero'];
  }

  /**
   * @param {Record<string, string> | null | undefined} termos
   * @returns {import('./tipos.js').TextosLocal}
   */
  function textosDoLocal(termos) {
    const nivel1 = lerTermo('local.nivel1', termos);
    const nivel2 = lerTermo('local.nivel2', termos);
    const plural = lerTermo('local.nivel1.plural', termos);
    const feminino = generoDoLocal(termos) === 'f';
    return {
      nivel1,
      nivel2,
      plural,
      etiqueta: `${nivel2} / ${nivel1} ${feminino ? 'Ativa' : 'Ativo'}:`,
      consolidado: `${feminino ? 'TODAS AS' : 'TODOS OS'} ${plural.toUpperCase()} (CONSOLIDADO)`,
      selecionada: `${nivel1} ${feminino ? 'Selecionada' : 'Selecionado'}`,
      /**
       * @param {string | null | undefined} codigo
       * @param {string | null | undefined} nome
       */
      unica(codigo, nome) {
        if (codigo) return `${nivel1}: ${codigo} - ${nome || ''}`;
        return `${nivel1}: Matriz Geral`;
      }
    };
  }

  /** @type {import('./tipos.js').TermoFn} */
  const termo = Object.assign(lerTermo, { textos: textosDoLocal, padrao: TERMOS_PADRAO });


  Object.assign(N, {
    TERMOS_PADRAO,
    generoDoLocal,
    lerTermo,
    termo,
    termosDaPessoa,
    textosDoLocal
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

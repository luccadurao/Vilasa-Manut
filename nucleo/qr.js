// @ts-check
// Portal QR. As ações saem dos manifestos dos módulos ativos.
// A máquina entra só pelo id da URL: a leitura não pede para escolher nem digitar.

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  /**
   * @typedef {Object} AcaoQr
   * @property {string} moduloId
   * @property {string} id
   * @property {string} rotulo
   * @property {boolean} exige_login
   * @property {string | null} permissao
   * @property {string} funcao
   */

  /**
   * @typedef {Object} ContextoQr
   * @property {AcaoQr[]} [acoes]
   * @property {string[] | null} [modulosAtivos]
   * @property {boolean} [logado]
   * @property {string[] | null} [permissoes]
   * @property {(permissao: string) => boolean} [pode]
   */

  /**
   * @param {ContextoQr} [opcoes]
   * @returns {AcaoQr[]}
   */
  function acoesParaContexto(opcoes) {
    const ctx = opcoes || {};
    const todas = Array.isArray(ctx.acoes) ? ctx.acoes : [];
    const modulos = Array.isArray(ctx.modulosAtivos) ? ctx.modulosAtivos.map(id => String(id)) : null;
    const logado = ctx.logado === true;
    const permissoes = Array.isArray(ctx.permissoes) ? ctx.permissoes.map(id => String(id)) : null;
    const pode = typeof ctx.pode === 'function' ? ctx.pode : function () { return false; };
    return todas.filter(acao => {
      if (!acao || !acao.id) return false;
      if (modulos && modulos.indexOf(String(acao.moduloId)) < 0) return false;
      if (acao.exige_login && !logado) return false;
      if (acao.permissao) {
        if (permissoes) return permissoes.indexOf(String(acao.permissao)) >= 0;
        return pode(String(acao.permissao)) === true;
      }
      return true;
    });
  }

  /**
   * A URL sem id é etiqueta antiga. tag, nome e un não escolhem a máquina.
   * @param {string} search
   */
  function leituraDaUrl(search) {
    const api = root.Vilasa && root.Vilasa.qr && root.Vilasa.qr.lerUrl;
    if (typeof api === 'function') return api(search);
    return { id: '', etiquetaAntiga: true, mensagem: 'Etiqueta antiga: peça a reimpressão', tag: '', nome: '', un: '' };
  }

  /**
   * Corpo da RPC os_abrir_pelo_qr. Só o id do equipamento. Sem tag e sem lista.
   * @param {any} dados
   */
  function payloadAbrirOs(dados) {
    const corpo = dados || {};
    const horimetro = corpo.horimetro != null ? corpo.horimetro : corpo.p_horimetro;
    return {
      p_equipamento: corpo.equipamentoId || corpo.p_equipamento || null,
      p_problema: corpo.problema != null ? corpo.problema : (corpo.p_problema || ''),
      p_localizacao: corpo.localizacao != null ? corpo.localizacao : (corpo.p_localizacao || ''),
      p_horimetro: horimetro == null || horimetro === '' ? null : horimetro,
      p_mecanico: corpo.mecanico || corpo.p_mecanico || '',
      p_assumir: corpo.assumir === true || corpo.p_assumir === true,
      p_id: corpo.id || corpo.p_id || null
    };
  }

  const api = root.Vilasa;
  if (!api || !api.qr) return;
  api.qr.acoesParaContexto = acoesParaContexto;
  api.qr.leituraDaUrl = leituraDaUrl;
  api.qr.payloadAbrirOs = payloadAbrirOs;
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

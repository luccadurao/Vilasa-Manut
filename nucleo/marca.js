// @ts-check
// ============================================================================
// NÚCLEO — MARCA E QR: site do ambiente, nome da marca e leitura da URL do QR
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
  /** @param {...any} a */ function urlBaseQr(...a) { return N.urlBaseQr(...a); }

  /**
   * @param {string} id
   */
  function urlCanonica(id) {
    const texto = String(id == null ? '' : id).trim();
    const base = urlBaseQr();
    if (!texto) return base;
    return `${base}?id=${encodeURIComponent(texto)}`;
  }

  /**
   * Nome mostrado na tela e nos relatórios: a empresa logada; antes do
   * login, a marca do ambiente; sem nada disso, o nome do produto.
   * @param {any} [usuario]
   * @returns {string}
   */
  function nomeDaMarca(usuario) {
    const pessoa = usuario === undefined ? root.usuarioLogado : usuario;
    const empresa = pessoa && pessoa.empresa && typeof pessoa.empresa === 'object' ? pessoa.empresa : null;
    const marca = empresa && empresa.marca && typeof empresa.marca === 'object' ? empresa.marca : null;
    if (marca && typeof marca.nome === 'string' && marca.nome.trim()) return marca.nome.trim();
    if (empresa && typeof empresa.nome === 'string' && empresa.nome.trim()) return empresa.nome.trim();
    const amb = ambienteAtual();
    if (amb && typeof amb.marca === 'string' && amb.marca.trim()) return amb.marca.trim();
    const produto = root.PLATAFORMA_PRODUTO;
    return produto && produto.nome ? String(produto.nome) : '';
  }

  /**
   * Preenche os elementos [data-marca] com o nome da marca.
   * @param {any} [usuario]
   */
  function aplicarMarca(usuario) {
    const doc = root.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    const nome = nomeDaMarca(usuario);
    const nos = doc.querySelectorAll('[data-marca]');
    for (let i = 0; i < nos.length; i += 1) nos[i].textContent = nome;
  }

  /**
   * Prefixo dos arquivos exportados: o código da empresa, ou o nome da marca.
   * @param {any} [usuario]
   * @returns {string}
   */
  function prefixoArquivo(usuario) {
    const pessoa = usuario === undefined ? root.usuarioLogado : usuario;
    const empresa = pessoa && pessoa.empresa && typeof pessoa.empresa === 'object' ? pessoa.empresa : null;
    const base = (empresa && empresa.codigo) || nomeDaMarca(pessoa) || 'RELATORIO';
    return String(base).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'RELATORIO';
  }

  /**
   * @param {string} search
   * @param {string} nome
   * @returns {string}
   */
  function parametroUrl(search, nome) {
    const texto = String(search || '').replace(/^\?/, '');
    const partes = texto.split('&');
    for (let i = 0; i < partes.length; i += 1) {
      const parte = partes[i];
      if (!parte) continue;
      const idx = parte.indexOf('=');
      const bruto = idx === -1 ? parte : parte.slice(0, idx);
      let chave = bruto;
      try { chave = decodeURIComponent(bruto.replace(/\+/g, ' ')); } catch (erro) { chave = bruto; }
      if (chave !== nome) continue;
      const valorBruto = idx === -1 ? '' : parte.slice(idx + 1);
      try { return decodeURIComponent(valorBruto.replace(/\+/g, ' ')); } catch (erro) { return valorBruto; }
    }
    return '';
  }

  /**
   * A máquina só entra pelo id. Sem id, a etiqueta antiga não vira campo para digitar.
   * @param {string} search
   */
  function lerUrlQr(search) {
    const id = parametroUrl(search, 'id').trim();
    if (!id) {
      return {
        id: '',
        etiquetaAntiga: true,
        mensagem: 'Etiqueta antiga: peça a reimpressão',
        tag: '',
        nome: '',
        un: ''
      };
    }
    return {
      id,
      etiquetaAntiga: false,
      mensagem: '',
      tag: parametroUrl(search, 'tag'),
      nome: parametroUrl(search, 'nome'),
      un: parametroUrl(search, 'un') || 'H'
    };
  }

  Object.assign(N, {
    aplicarMarca,
    lerUrlQr,
    nomeDaMarca,
    parametroUrl,
    prefixoArquivo,
    urlCanonica
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

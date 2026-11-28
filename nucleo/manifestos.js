// @ts-check
// ============================================================================
// NÚCLEO — CARGA DOS MANIFESTOS PELO ÍNDICE
// A página não lista manifesto nenhum: carrega modulos/indice.js e este
// arquivo, que injeta modulos/<id>/manifesto.js de cada módulo do índice.
// Módulo novo = uma linha no índice, nada nas páginas nem no núcleo.
//
// Os manifestos chegam depois do HTML. Quem precisa deles espera
// Plataforma.modulos.manifestosProntos() (o login, o portal QR e a fila
// offline). Manifesto que falha (arquivo faltando, erro no script) não trava
// os outros: fica em Plataforma.modulos.manifestosComFalha().
//
// Carregue depois de modulos/indice.js, nucleo/nucleo.js e nucleo/ctx.js.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  const P = root.Plataforma;
  if (!P || !P.modulos) return;

  /** @type {Array<{ id: string, motivo: string }>} */
  const falhas = [];
  // Rede ruim sem service worker não pode deixar a página em branco.
  const TEMPO_LIMITE_MS = 8000;
  let prontos = false;

  /**
   * Ids válidos do índice (sem repetir, sem caminho estranho).
   * @returns {string[]}
   */
  function idsDoIndice() {
    const lista = Array.isArray(root.PLATAFORMA_MODULOS) ? root.PLATAFORMA_MODULOS : [];
    /** @type {string[]} */
    const ids = [];
    for (const bruto of lista) {
      const id = String(bruto);
      if (!/^[a-z][a-z0-9_]*$/.test(id)) {
        falhas.push({ id, motivo: 'id inválido no índice' });
        continue;
      }
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }

  /**
   * Endereço do manifesto, com a versão do app para não pegar cópia velha.
   * @param {string} id
   */
  function enderecoDoManifesto(id) {
    const versao = root.PLATAFORMA_VERSAO_APP ? '?v=' + encodeURIComponent(String(root.PLATAFORMA_VERSAO_APP)) : '';
    return `modulos/${id}/manifesto.js${versao}`;
  }

  /**
   * @param {string} id
   * @returns {Promise<void>}
   */
  function injetar(id) {
    return new Promise((fim) => {
      const doc = root.document;
      const registrado = () => P.modulos.lista().some((/** @type {any} */ m) => m && m.id === id);
      if (registrado()) { fim(); return; }
      let terminou = false;
      const resolve = () => { if (!terminou) { terminou = true; fim(); } };
      const espera = typeof root.setTimeout === 'function' ? root.setTimeout(() => {
        if (terminou) return;
        falhas.push({ id, motivo: 'tempo esgotado ao baixar o manifesto' });
        resolve();
      }, TEMPO_LIMITE_MS) : null;
      const limpar = () => { if (espera != null && typeof root.clearTimeout === 'function') root.clearTimeout(espera); };
      const script = doc.createElement('script');
      script.src = enderecoDoManifesto(id);
      // Ordem garantida entre eles, sem bloquear a página.
      script.async = false;
      script.onload = () => {
        limpar();
        if (terminou) {
          // Chegou depois do tempo limite: se registrou, deixa de ser falha
          // (a fila volta a andar; o módulo entra ao recarregar a carga).
          const i = falhas.findIndex((f) => f.id === id && /tempo esgotado/.test(f.motivo));
          if (i >= 0 && registrado()) falhas.splice(i, 1);
          return;
        }
        if (!registrado()) falhas.push({ id, motivo: 'o arquivo carregou, mas não registrou o manifesto' });
        resolve();
      };
      script.onerror = () => {
        limpar();
        if (terminou) return;
        falhas.push({ id, motivo: 'não consegui baixar o manifesto' });
        resolve();
      };
      (doc.head || doc.documentElement).appendChild(script);
    });
  }

  /** @type {Promise<void>} */
  const promessa = (function () {
    const ids = idsDoIndice();
    if (!root.document || typeof root.document.createElement !== 'function') {
      // Fora do navegador (testes): quem chamou já registrou os manifestos.
      prontos = true;
      return Promise.resolve();
    }
    return Promise.all(ids.map(injetar)).then(() => {
      prontos = true;
      for (const f of falhas) if (root.console) root.console.warn(`Manifesto ${f.id}: ${f.motivo}.`);
    });
  })();

  /** Resolve quando todos os manifestos do índice terminaram (com ou sem falha). */
  P.modulos.manifestosProntos = () => promessa;
  /** true quando a carga terminou (a fila offline só classifica depois disso). */
  P.modulos.manifestosCarregados = () => prontos;
  /** Manifestos do índice que não entraram, com o motivo. */
  P.modulos.manifestosComFalha = () => falhas.map((f) => Object.assign({}, f));
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

// @ts-check
// ============================================================================
// NÚCLEO — RESOLVER: semver, contrato e ordem de carga dos módulos
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

  const VERSAO_NUCLEO = N.VERSAO_NUCLEO;
  const registros = N.registros;

  /** @param {...any} a */ function lista(...a) { return N.lista(...a); }

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
    N.estado.resolucaoGuardada = resolver(contrato, registros.slice());
    return N.estado.resolucaoGuardada;
  }

  Object.assign(N, {
    compararPrioridade,
    compararSemver,
    lerSemver,
    normalizarContrato,
    ordemDaTela,
    resolver,
    resolverEGuardar,
    versaoCabe
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

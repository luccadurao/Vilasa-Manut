// @ts-check
// ============================================================================
// NÚCLEO — IDENTIDADE DO PRODUTO
// O único lugar com o nome do produto e os prefixos do que o app guarda no
// aparelho. Nome de cliente (Vilasa ou outro) não entra aqui: vem da empresa
// (banco) ou do ambiente (config.js).
//
// Carregue antes de qualquer script que leia o localStorage (logo depois do
// config.js e do nucleo/versao.js). Ao carregar, este arquivo muda de nome as
// chaves antigas "vilasa_*" para "plat_*", sem perder a fila offline.
// ============================================================================

/**
 * @param {any} root
 */
(function (root) {
  'use strict';

  const PRODUTO = Object.freeze({
    /** Nome curto do produto, usado antes de saber a empresa (login, PWA). */
    nome: 'Manut',
    /** Linha que acompanha o nome. */
    descricao: 'Gestão de Manutenção',
    /** Prefixo de tudo que o app guarda no localStorage. */
    prefixoChave: 'plat_',
    /** Prefixo do cache do service worker (o sw.js repete este valor). */
    prefixoCacheSw: 'plat-pwa-',
    /**
     * Nome do IndexedDB. Nome histórico: trocar apaga o cache offline de quem
     * já usa o app. Fica assim até existir uma migração de IndexedDB.
     */
    bancoLocal: 'vilasa_dados_v1'
  });

  /** Prefixos antigos que este arquivo migra. */
  const PREFIXOS_LEGADOS = ['vilasa_'];

  /** Chaves que, além do prefixo, mudaram de nome. */
  const RENOMEADAS = Object.freeze({
    vilasa_obra_ativa_v2: 'plat_local_ativo'
  });

  /** Cópias que se recuperam na próxima leitura online: dá para descartar. */
  const DESCARTAVEIS = /^(?:cache_|qr_equip_)/;

  /**
   * Copiadas sem apagar a antiga, nesta versão: uma aba antiga ainda aberta
   * continua lendo a sessão, a empresa e o local pelo nome velho (e põe a
   * empresa nos lançamentos). O "sair" apaga as duas (esquecerLegado).
   * A cópia antiga deixa de existir numa versão futura.
   */
  const ESPELHADAS = new Set(['sessao_v3', 'sessao_v2', 'empresa_codigo', 'local_ativo']);

  /**
   * Chave do localStorage com o prefixo do produto.
   * @param {string} nome ex.: 'sessao_v3'
   */
  function chave(nome) {
    return PRODUTO.prefixoChave + String(nome);
  }

  /**
   * @param {string} antiga
   * @returns {string | null}
   */
  function chaveNova(antiga) {
    if (Object.prototype.hasOwnProperty.call(RENOMEADAS, antiga)) {
      return /** @type {Record<string, string>} */ (RENOMEADAS)[antiga];
    }
    for (const prefixo of PREFIXOS_LEGADOS) {
      if (antiga.startsWith(prefixo)) return chave(antiga.slice(prefixo.length));
    }
    return null;
  }

  /**
   * @param {string | null} texto
   */
  function lerLista(texto) {
    try {
      const v = JSON.parse(texto || 'null');
      return Array.isArray(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Muda as chaves antigas de nome. Pode rodar quantas vezes for preciso
   * (roda ao abrir, quando outra aba grava e antes de cada sincronização).
   * - Sessão, empresa e local: copia se a nova está vazia e mantém a antiga.
   * - Chave nova ainda vazia: copia e só então apaga a antiga.
   * - As duas existem e são listas (fila, rejeitados, suspensos): junta,
   *   sem repetir item igual, mantendo primeiro a ordem da chave nova.
   * - Só a antiga é uma lista válida (a nova está corrompida): a antiga vale.
   * - Antiga ilegível: fica onde está (não se apaga o que não se leu).
   * - As duas existem e não são listas: vale a nova; a antiga sai.
   * - Cópia de cache que não cabe: descarta (volta na próxima leitura online).
   * - Item da fila que não cabe: a chave antiga fica, e a próxima abertura tenta de novo.
   * @param {{ length: number, key: (i: number) => string | null, getItem: (k: string) => string | null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void } | null | undefined} storage
   * @returns {{ movidas: string[], juntadas: string[], descartadas: string[], pendentes: string[] }}
   */
  function migrarChavesLegadas(storage) {
    const resultado = { movidas: /** @type {string[]} */ ([]), juntadas: /** @type {string[]} */ ([]), descartadas: /** @type {string[]} */ ([]), pendentes: /** @type {string[]} */ ([]) };
    if (!storage) return resultado;
    /** @type {string[]} */
    const antigas = [];
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (k && chaveNova(k)) antigas.push(k);
      }
    } catch (e) {
      return resultado;
    }
    for (const antiga of antigas) {
      const nova = /** @type {string} */ (chaveNova(antiga));
      const resto = nova.slice(PRODUTO.prefixoChave.length);
      try {
        const valorAntigo = storage.getItem(antiga);
        if (valorAntigo == null) continue;
        const valorNovo = storage.getItem(nova);
        if (DESCARTAVEIS.test(resto)) {
          // Libera o espaço antes de gravar: é só uma cópia do servidor.
          storage.removeItem(antiga);
          if (valorNovo == null) {
            try { storage.setItem(nova, valorAntigo); resultado.movidas.push(antiga); }
            catch (e) { resultado.descartadas.push(antiga); }
          } else {
            resultado.descartadas.push(antiga);
          }
          continue;
        }
        if (ESPELHADAS.has(resto)) {
          if (valorNovo == null) {
            storage.setItem(nova, valorAntigo);
            resultado.movidas.push(antiga);
          }
          continue;
        }
        if (valorNovo == null) {
          storage.setItem(nova, valorAntigo);
          storage.removeItem(antiga);
          resultado.movidas.push(antiga);
          continue;
        }
        const listaNova = lerLista(valorNovo);
        const listaAntiga = lerLista(valorAntigo);
        const pareceLista = /^\s*\[/.test(valorAntigo) || /^\s*\[/.test(valorNovo);
        if (listaAntiga && listaNova) {
          const vistos = new Set(listaNova.map((item) => JSON.stringify(item)));
          const junta = listaNova.slice();
          for (const item of listaAntiga) {
            const texto = JSON.stringify(item);
            if (!vistos.has(texto)) { vistos.add(texto); junta.push(item); }
          }
          storage.setItem(nova, JSON.stringify(junta));
          resultado.juntadas.push(antiga);
        } else if (listaAntiga && !listaNova) {
          // A nova está corrompida: vale a antiga, que é uma lista legível.
          storage.setItem(nova, valorAntigo);
          resultado.movidas.push(antiga);
        } else if (!listaAntiga && pareceLista) {
          // Antiga ilegível de uma chave de lista: não se apaga o que não se leu.
          resultado.pendentes.push(antiga);
          continue;
        }
        storage.removeItem(antiga);
      } catch (e) {
        // Não coube: a chave antiga fica onde está e a próxima abertura tenta de novo.
        resultado.pendentes.push(antiga);
      }
    }
    return resultado;
  }

  /**
   * Apaga as cópias antigas de chaves espelhadas (usado no "sair").
   * @param {string[]} nomes ex.: ['sessao_v3', 'sessao_v2']
   * @param {{ removeItem: (k: string) => void } | null | undefined} [storage]
   */
  function esquecerLegado(nomes, storage) {
    const alvo = storage || root.localStorage;
    if (!alvo) return;
    for (const nome of nomes || []) {
      for (const [antiga, nova] of Object.entries(RENOMEADAS)) {
        if (nova === chave(nome)) { try { alvo.removeItem(antiga); } catch (e) { /* ignora */ } }
      }
      for (const prefixo of PREFIXOS_LEGADOS) {
        try { alvo.removeItem(prefixo + nome); } catch (e) { /* ignora */ }
      }
    }
  }

  /** @type {ReturnType<typeof migrarChavesLegadas> | null} */
  let migracao = null;
  function migrarAgora() {
    try {
      migracao = migrarChavesLegadas(root.localStorage);
      if (migracao.pendentes.length && root.console) {
        root.console.warn('Chaves antigas que ficam para a próxima tentativa:', migracao.pendentes);
      }
    } catch (e) {
      /* sem localStorage */
    }
    return migracao;
  }
  migrarAgora();
  // Uma aba antiga ainda aberta pode gravar com o nome velho: migra na hora.
  try {
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('storage', (/** @type {any} */ ev) => {
        if (ev && typeof ev.key === 'string' && chaveNova(ev.key)) migrarAgora();
      });
    }
  } catch (e) { /* sem eventos */ }

  root.PLATAFORMA_PRODUTO = PRODUTO;
  root.PlataformaProduto = Object.freeze({
    ...PRODUTO,
    chave,
    migrarChavesLegadas,
    migrarAgora,
    esquecerLegado,
    ultimaMigracao: () => migracao
  });
})(/** @type {any} */ (typeof globalThis !== 'undefined' ? globalThis : window));

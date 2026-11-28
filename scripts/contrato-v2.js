'use strict';

// ============================================================================
// Regras do contrato v2 dos manifestos (fase 1 do núcleo).
// Funções puras: recebem os manifestos e o texto dos arquivos, devolvem a
// lista de erros. scripts/validar-manifestos.js junta tudo com o repositório
// real; os testes chamam com dados em memória.
// ============================================================================

const TIPOS_CONFIG = new Set(['numero', 'texto', 'booleano', 'lista']);
/** Arquivo com funções comuns do núcleo que os manifestos podem citar. */
const FONTE_COMUM = 'core.js';

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

/**
 * Tira comentários de SQL (linha e bloco) para não contar objeto citado em texto.
 * @param {string} sql
 */
function semComentarios(sql) {
  return String(sql || '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Tabelas, views e funções public.* criadas pelas migrações.
 * Considera ALTER TABLE ... RENAME TO (ex.: obras → obras_base).
 * @param {string} sql texto de todas as migrações, em ordem
 * @returns {{ tabelas: Set<string>, funcoes: Set<string> }}
 */
function objetosDoSql(sql) {
  const texto = semComentarios(sql);
  /** @type {Set<string>} */
  const tabelas = new Set();
  /** @type {Set<string>} */
  const funcoes = new Set();
  // Um só padrão, percorrido em ordem: renomear tira o nome antigo, e um
  // CREATE posterior com o mesmo nome (ex.: a view obras) devolve.
  const re = new RegExp([
    'CREATE\\s+(?:UNLOGGED\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?public\\.([a-z_][a-z0-9_]*)',
    'CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:MATERIALIZED\\s+)?VIEW\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?public\\.([a-z_][a-z0-9_]*)',
    'ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:ONLY\\s+)?public\\.([a-z_][a-z0-9_]*)\\s+RENAME\\s+TO\\s+([a-z_][a-z0-9_]*)',
    'CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.([a-z_][a-z0-9_]*)\\s*\\('
  ].join('|'), 'gi');
  let m;
  while ((m = re.exec(texto))) {
    if (m[1]) tabelas.add(m[1].toLowerCase());
    else if (m[2]) tabelas.add(m[2].toLowerCase());
    else if (m[3]) { tabelas.delete(m[3].toLowerCase()); tabelas.add(m[4].toLowerCase()); }
    else if (m[5]) funcoes.add(m[5].toLowerCase());
  }
  return { tabelas, funcoes };
}

/**
 * Lê um mapa `const NOME = { chave: 'valor', ... };` do texto de um script.
 * @param {string} texto
 * @param {string} nome
 * @returns {Record<string, string> | null}
 */
function lerMapaDoScript(texto, nome) {
  const re = new RegExp(`const\\s+${nome}\\s*=\\s*\\{([\\s\\S]*?)\\};`);
  const achou = re.exec(String(texto || ''));
  if (!achou) return null;
  /** @type {Record<string, string>} */
  const mapa = {};
  const reItem = /([a-z_][a-z0-9_]*)\s*:\s*'([a-z_][a-z0-9_]*)'/gi;
  let m;
  while ((m = reItem.exec(achou[1]))) mapa[m[1]] = m[2];
  return mapa;
}

/**
 * @param {string} texto
 * @param {string} nome
 */
function defineFuncao(texto, nome) {
  return new RegExp(`(?:^|[^\\w.])function\\s+${nome}\\s*\\(`).test(String(texto || ''));
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
 * @typedef {Object} FontesContrato
 * @property {string[]} indice ids de modulos/indice.js
 * @property {string[]} pastas pastas de modulos/ que têm manifesto.js
 * @property {{ index: string, qr: string, sw: string }} paginas texto de index.html, qr.html e sw.js
 * @property {string} sql texto de todas as migrações, em ordem
 * @property {string} offlineSync texto de offline_sync.js
 * @property {(src: string) => string} ler texto de um arquivo do site ('' se não existe)
 */

/**
 * @param {any[]} manifestos todos os registrados, inclusive o núcleo
 * @param {FontesContrato} fontes
 * @returns {string[]}
 */
function validarContratoV2(manifestos, fontes) {
  /** @type {string[]} */
  const erros = [];
  /** @type {Map<string, any>} */
  const porId = new Map();
  for (const m of manifestos || []) if (m && m.id) porId.set(m.id, m);

  // --- 1. índice ------------------------------------------------------------
  const indice = lista(fontes.indice);
  const noIndice = new Set(indice);
  if (noIndice.size !== indice.length) erros.push('Índice: id repetido em modulos/indice.js.');
  for (const pasta of fontes.pastas) {
    if (!noIndice.has(pasta)) erros.push(`Índice: a pasta modulos/${pasta} não está em modulos/indice.js.`);
  }
  for (const id of indice) {
    if (!fontes.pastas.includes(id)) erros.push(`Índice: "${id}" não tem modulos/${id}/manifesto.js.`);
    const rel = `modulos/${id}/manifesto.js`;
    if (!fontes.paginas.index.includes(`src="${rel}"`)) erros.push(`Índice: index.html não carrega ${rel}.`);
    if (!fontes.paginas.qr.includes(`src="${rel}"`)) erros.push(`Índice: qr.html não carrega ${rel}.`);
    if (!fontes.paginas.sw.includes(`'./${rel}'`)) erros.push(`Índice: sw.js não guarda ${rel} no precache.`);
  }
  for (const id of porId.keys()) {
    if (id !== 'nucleo' && !noIndice.has(id)) erros.push(`Índice: o módulo ${id} está registrado, mas fora de modulos/indice.js.`);
  }

  // --- donos de tabela e RPC; serviços e eventos declarados ----------------
  const { tabelas: tabelasSql, funcoes: funcoesSql } = objetosDoSql(fontes.sql);
  /** @type {Map<string, string>} */
  const donoTabela = new Map();
  /** @type {Map<string, string>} */
  const donoRpc = new Map();
  /** @type {Map<string, string>} */
  const donoServico = new Map();
  /** @type {Set<string>} */
  const emitidos = new Set();
  /** @type {Map<string, string>} */
  const donoCache = new Map();

  for (const [id, m] of porId) {
    const onde = `Módulo ${id}`;

    // 2. depende.nucleo
    if (id !== 'nucleo' && !Object.prototype.hasOwnProperty.call(objeto(m.depende), 'nucleo')) {
      erros.push(`${onde}: declare depende.nucleo.`);
    }

    // 3. tabelas e rpcs
    if (!Array.isArray(m.tabelas)) erros.push(`${onde}: declare "tabelas" (lista, pode ser vazia).`);
    for (const t of lista(m.tabelas)) {
      if (donoTabela.has(t)) erros.push(`Tabela ${t} tem dois donos: ${donoTabela.get(t)} e ${id}.`);
      donoTabela.set(t, id);
      if (!tabelasSql.has(t)) erros.push(`${onde}: a tabela "${t}" não existe em nenhuma migração.`);
    }
    for (const r of lista(m.rpcs)) {
      if (donoRpc.has(r)) erros.push(`RPC ${r} tem dois donos: ${donoRpc.get(r)} e ${id}.`);
      donoRpc.set(r, id);
      if (!funcoesSql.has(r)) erros.push(`${onde}: a RPC "${r}" não existe em nenhuma migração.`);
    }

    // 4. fornece
    for (const servico of Object.keys(objeto(m.fornece))) {
      if (!servico.startsWith(`${id}.`)) erros.push(`${onde}: o serviço "${servico}" não usa o prefixo "${id}."`);
      if (donoServico.has(servico)) erros.push(`Serviço ${servico} declarado duas vezes.`);
      donoServico.set(servico, id);
    }

    // 5. eventos emitidos (v2 e o antigo extensoes.emite)
    const emite = [...lista(objeto(m.eventos).emite), ...lista(objeto(m.extensoes).emite)];
    for (const ev of emite) {
      if (!ev.startsWith(`${id}.`)) erros.push(`${onde}: o evento "${ev}" não usa o prefixo "${id}."`);
      emitidos.add(ev);
    }

    // 7. cache sem dono repetido
    for (const chave of lista(objeto(m.offline).cache)) {
      if (donoCache.has(chave)) erros.push(`Chave de cache ${chave} tem dois donos: ${donoCache.get(chave)} e ${id}.`);
      donoCache.set(chave, id);
    }
  }

  for (const t of tabelasSql) {
    if (!donoTabela.has(t)) erros.push(`A tabela public.${t} não tem dono: declare em "tabelas" de um manifesto.`);
  }
  for (const f of funcoesSql) {
    if (!donoRpc.has(f)) erros.push(`A função public.${f} não tem dono: declare em "rpcs" de um manifesto.`);
  }

  for (const [id, m] of porId) {
    const onde = `Módulo ${id}`;
    const depende = objeto(m.depende);
    const opcionais = objeto(m.opcionais);

    // 4. consome
    for (const servico of lista(m.consome)) {
      const dono = donoServico.get(servico);
      if (!dono) {
        erros.push(`${onde}: consome "${servico}", que nenhum módulo fornece.`);
        continue;
      }
      if (dono !== id && dono !== 'nucleo'
          && !Object.prototype.hasOwnProperty.call(depende, dono)
          && !Object.prototype.hasOwnProperty.call(opcionais, dono)) {
        erros.push(`${onde}: consome "${servico}" de ${dono}, mas ${dono} não está em depende nem em opcionais.`);
      }
    }

    // 5. eventos ouvidos (v2 e o antigo extensoes.ouve)
    const ouve = { ...objeto(objeto(m.extensoes).ouve), ...objeto(objeto(m.eventos).ouve) };
    for (const ev of Object.keys(ouve)) {
      if (!emitidos.has(ev)) erros.push(`${onde}: ouve "${ev}", que nenhum módulo emite.`);
    }

    // 6. config
    for (const [campo, def] of Object.entries(objeto(m.config))) {
      const c = objeto(def);
      const tipo = String(c.tipo || '');
      if (!TIPOS_CONFIG.has(tipo)) {
        erros.push(`${onde}: config.${campo} com tipo "${tipo}" inválido.`);
        continue;
      }
      if (!valorDoTipo(c.padrao, tipo)) erros.push(`${onde}: config.${campo} tem padrão que não é do tipo ${tipo}.`);
      if ((c.min !== undefined || c.max !== undefined) && tipo !== 'numero') {
        erros.push(`${onde}: config.${campo} só pode ter min/max se for numero.`);
      }
      if (tipo === 'numero' && typeof c.padrao === 'number') {
        if (typeof c.min === 'number' && c.padrao < c.min) erros.push(`${onde}: config.${campo} tem padrão abaixo do mínimo.`);
        if (typeof c.max === 'number' && c.padrao > c.max) erros.push(`${onde}: config.${campo} tem padrão acima do máximo.`);
        if (typeof c.min === 'number' && typeof c.max === 'number' && c.min > c.max) erros.push(`${onde}: config.${campo} tem min maior que max.`);
      }
    }

    // 7. offline: só o que é do módulo
    const off = objeto(m.offline);
    const proprias = new Set(lista(m.tabelas));
    const rpcsProprias = new Set(lista(m.rpcs));
    for (const t of lista(off.tabelas)) {
      if (!proprias.has(t)) erros.push(`${onde}: offline.tabelas tem "${t}", que não é do módulo.`);
    }
    for (const r of lista(off.rpcs)) {
      if (!rpcsProprias.has(r)) erros.push(`${onde}: offline.rpcs tem "${r}", que não é do módulo.`);
    }

    // 8. funções citadas existem
    if (m.embutido) continue;
    const textos = lista((m.scripts || []).map((/** @type {any} */ s) => s && s.src)).map((src) => fontes.ler(src));
    const comum = fontes.ler(FONTE_COMUM);
    const qrHtml = fontes.paginas.qr;
    /**
     * @param {string} nome
     * @param {string} oque
     * @param {boolean} [podeNoQr]
     */
    const conferir = (nome, oque, podeNoQr) => {
      if (!nome) return;
      const achou = textos.some((t) => defineFuncao(t, nome)) || defineFuncao(comum, nome)
        || (podeNoQr === true && defineFuncao(qrHtml, nome));
      if (!achou) erros.push(`${onde}: ${oque} "${nome}" não existe nos scripts do módulo nem em ${FONTE_COMUM}.`);
    };
    for (const tela of m.telas || []) conferir(tela && tela.abrir, `a tela "${tela && tela.id}" abre`);
    const ext = objeto(m.extensoes);
    for (const rel of ext.relatorios || []) conferir(rel && rel.funcao, `o relatório "${rel && rel.id}" chama`);
    for (const acao of ext.qr || []) conferir(acao && acao.funcao, `a ação de QR "${acao && acao.id}" chama`, true);
    for (const [ev, fn] of Object.entries(ouve)) conferir(String(fn), `o evento "${ev}" chama`);
  }

  // 7. mapas fixos do offline_sync.js batem com o declarado (até a fase 3)
  const porTabela = lerMapaDoScript(fontes.offlineSync, 'MODULO_POR_TABELA');
  const porChave = lerMapaDoScript(fontes.offlineSync, 'MODULO_POR_CHAVE');
  if (!porTabela || !porChave) {
    erros.push('offline_sync.js: não achei MODULO_POR_TABELA ou MODULO_POR_CHAVE.');
  } else {
    for (const [nome, dono] of Object.entries(porTabela)) {
      const off = objeto(objeto(porId.get(dono)).offline);
      if (!lista(off.tabelas).includes(nome) && !lista(off.rpcs).includes(nome)) {
        erros.push(`offline_sync.js põe "${nome}" no módulo ${dono}, mas o manifesto de ${dono} não declara em offline.`);
      }
    }
    for (const [chave, dono] of Object.entries(porChave)) {
      if (!lista(objeto(objeto(porId.get(dono)).offline).cache).includes(chave)) {
        erros.push(`offline_sync.js põe a chave de cache "${chave}" no módulo ${dono}, mas o manifesto de ${dono} não declara.`);
      }
    }
    for (const [id, m] of porId) {
      const off = objeto(m.offline);
      for (const nome of [...lista(off.tabelas), ...lista(off.rpcs)]) {
        if (porTabela[nome] !== id) erros.push(`Módulo ${id}: offline declara "${nome}", mas offline_sync.js não o liga a ${id}.`);
      }
      for (const chave of lista(off.cache)) {
        if (porChave[chave] !== id) erros.push(`Módulo ${id}: offline.cache declara "${chave}", mas offline_sync.js não o liga a ${id}.`);
      }
    }
  }

  return erros;
}

module.exports = { validarContratoV2, objetosDoSql, lerMapaDoScript, defineFuncao };

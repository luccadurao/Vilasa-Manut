// ============================================================================
// MÓDULO 2: OFFLINE_SYNC.JS (CACHE LOCAL E FILA DE SINCRONIZAÇÃO) - V3
//
// Regras desta versão:
//  1. Todo INSERT ganha um id (UUID) criado no aparelho. Assim o reenvio não duplica
//     e dá para editar offline um registro que também foi criado offline.
//  2. A ordem das gravações é preservada: se já existe algo pendente, a nova gravação
//     entra atrás na fila (nunca "fura" a fila).
//  3. Erro de rede/servidor fora do ar => a gravação FICA na fila e tenta de novo.
//  4. Erro definitivo (ex.: dado recusado pelo banco) => vai para a lista de REJEITADOS
//     para revisão. Nada é descartado em silêncio.
//  5. Só sai da fila o que o banco confirmou que gravou.
//  6. Item que não pode ser enviado (módulo desligado, outra empresa, aplicativo
//     abaixo de versao_minima_app ou recusa VM403/403) vai para SUSPENSOS.
//     Não é apagado. Volta para a fila quando o motivo passa, na ordem original.
// ============================================================================

// Chaves do localStorage com o prefixo do produto (nucleo/produto.js).
function chaveLocalApp(nome) {
  const produto = typeof window !== 'undefined' ? window.PlataformaProduto : null;
  return produto ? produto.chave(nome) : 'plat_' + nome;
}
const CHAVE_FILA_OFFLINE = chaveLocalApp('fila_sync_v2');
const CHAVE_FILA_REJEITADOS = chaveLocalApp('fila_rejeitados_v2');
const CHAVE_FILA_SUSPENSOS = chaveLocalApp('fila_suspensos_v1');
const PREFIXO_CACHE_LOCAL = chaveLocalApp('cache_');
const PREFIXO_QR_EQUIP_LOCAL = chaveLocalApp('qr_equip_');
const EMPRESA_1 = '00000000-0000-0000-0000-000000000001';
const INTERVALO_TENTATIVA_MS = 30000;

// Tabela, RPC ou chave de cache -> módulo dono. Vem dos manifestos (offline.*,
// e tabelas/rpcs como reserva), não de lista fixa: módulo novo não mexe aqui.
// Ciclo, local e leitura passam o módulo na chamada; o resto cai no dono.
function manifestosDaPlataforma() {
  try {
    const P = typeof window !== 'undefined' ? window.Plataforma : null;
    if (P && P.modulos && typeof P.modulos.lista === 'function') return P.modulos.lista();
  } catch (e) { /* sem núcleo carregado */ }
  return [];
}

// Enquanto a página ainda injeta os manifestos, o mapa está incompleto: quem
// classifica a fila espera (o item não pode ganhar módulo errado nem nulo).
function manifestosProntosParaFila() {
  try {
    const P = typeof window !== 'undefined' ? window.Plataforma : null;
    if (P && P.modulos && typeof P.modulos.manifestosCarregados === 'function') return P.modulos.manifestosCarregados();
  } catch (e) { /* sem carregador: os manifestos vieram por tag */ }
  return true;
}

// Algum manifesto do índice não carregou (404, sem rede e sem cópia): o item
// sem dono pode ser desse módulo, então fica suspenso em vez de ir sem módulo.
function algumManifestoFalhou() {
  try {
    const P = typeof window !== 'undefined' ? window.Plataforma : null;
    if (P && P.modulos && typeof P.modulos.manifestosComFalha === 'function') return P.modulos.manifestosComFalha().length > 0;
  } catch (e) { /* sem carregador */ }
  return false;
}

let mapasOfflineGuardados = null;

function mapasOfflineDosManifestos() {
  const lista = manifestosDaPlataforma();
  const assinatura = lista.map((m) => m && m.id).join(',');
  if (mapasOfflineGuardados && mapasOfflineGuardados.assinatura === assinatura) return mapasOfflineGuardados;
  const porTabela = Object.create(null);
  const porChave = Object.create(null);
  const nomes = (v) => (Array.isArray(v) ? v.map(String) : []);
  // Primeiro o que vai para a fila (offline.*), depois o dono por tabelas/rpcs.
  for (const m of lista) {
    const off = (m && m.offline) || {};
    for (const t of [...nomes(off.tabelas), ...nomes(off.rpcs)]) if (!porTabela[t]) porTabela[t] = m.id;
    for (const c of nomes(off.cache)) if (!porChave[c]) porChave[c] = m.id;
  }
  for (const m of lista) {
    for (const t of [...nomes(m && m.tabelas), ...nomes(m && m.rpcs)]) if (!porTabela[t]) porTabela[t] = m.id;
  }
  mapasOfflineGuardados = { assinatura, porTabela, porChave };
  return mapasOfflineGuardados;
}

let sincronizacaoEmAndamento = false;

// ---------- utilitários -----------------------------------------------------

function novoUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function lerListaLocal(chave) {
  try {
    const v = JSON.parse(localStorage.getItem(chave) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function salvarListaLocal(chave, lista) {
  try {
    localStorage.setItem(chave, JSON.stringify(lista));
    return true;
  } catch (e) {
    alert('⚠️ A memória do celular está cheia e a gravação NÃO foi guardada. Libere espaço (limpe dados de outros sites) e tente de novo.');
    return false;
  }
}

function lerFilaOffline() { return lerListaLocal(CHAVE_FILA_OFFLINE); }
function lerRejeitadosOffline() { return lerListaLocal(CHAVE_FILA_REJEITADOS); }
function lerSuspensosOffline() { return lerListaLocal(CHAVE_FILA_SUSPENSOS); }

function versaoAppAtual() {
  return typeof PLATAFORMA_VERSAO_APP === 'string' ? PLATAFORMA_VERSAO_APP : '';
}

function numeroVersaoApp(valor) {
  const achado = String(valor || '').match(/(\d+)/);
  return achado ? Number(achado[1]) : 0;
}

function versaoAppAbaixoDaMinima(atual, minima) {
  if (minima == null || String(minima).trim() === '') return false;
  return numeroVersaoApp(atual) < numeroVersaoApp(minima);
}

function moduloDaTabela(tabela) {
  return mapasOfflineDosManifestos().porTabela[tabela] || null;
}

function sessaoOfflineAtual() {
  try {
    if (typeof window !== 'undefined' && window.Plataforma && Plataforma.sessao && typeof localStorage !== 'undefined') {
      return Plataforma.sessao.ler(localStorage);
    }
  } catch (e) { /* sessão ilegível */ }
  return null;
}

function contextoDaSessao() {
  const sessao = sessaoOfflineAtual();
  const usuarioMemoria = typeof usuarioLogado !== 'undefined' && usuarioLogado ? usuarioLogado : null;
  let usuario = usuarioMemoria;
  try {
    if (!usuario && sessao && window.Plataforma && Plataforma.sessao) usuario = Plataforma.sessao.usuarioDe(sessao);
  } catch (e) { usuario = usuarioMemoria; }
  const fonte = usuario || {};
  const modulosBrutos = fonte.modulos || (sessao && sessao.modulos) || null;
  const modulos = Array.isArray(modulosBrutos)
    ? modulosBrutos.map(item => (typeof item === 'string' ? item : item && item.id)).filter(Boolean)
    : null;
  const permissoesBrutas = Array.isArray(fonte.permissoes)
    ? fonte.permissoes
    : (sessao && Array.isArray(sessao.permissoes) ? sessao.permissoes : null);
  const empresaBruta = fonte.empresa_id || (fonte.empresa && fonte.empresa.id) || null;
  return {
    empresaId: empresaBruta ? String(empresaBruta) : null,
    modulos,
    permissoes: permissoesBrutas ? permissoesBrutas.map(id => String(id)) : null,
    versaoApp: versaoAppAtual(),
    versaoMinima: fonte.versao_minima_app || (sessao && sessao.versao_minima_app) || null
  };
}

function contextoIdOffline(ctx) {
  const base = ctx || {};
  const mods = Array.isArray(base.modulos) ? base.modulos.slice().sort().join(',') : '';
  const perms = Array.isArray(base.permissoes) ? base.permissoes.slice().sort().join(',') : '';
  return [base.empresaId || '', mods, perms, base.versaoApp || '', base.versaoMinima || ''].join('|');
}

function completarItemFila(item) {
  const bruto = item || {};
  const legado = !Object.prototype.hasOwnProperty.call(bruto, 'versao_app');
  let empresa = bruto.empresa_id || null;
  if (!empresa && bruto.payload && bruto.operacao !== 'RPC' && bruto.payload.empresa_id) {
    empresa = bruto.payload.empresa_id;
  }
  if (!empresa && legado) empresa = EMPRESA_1;
  const modulo = bruto.modulo || moduloDaTabela(bruto.tabela) || null;
  let payload = bruto.payload;
  if (payload && typeof payload === 'object' && bruto.operacao !== 'RPC' && empresa && !payload.empresa_id) {
    payload = Object.assign({}, payload, { empresa_id: empresa });
  }
  return Object.assign({}, bruto, {
    empresa_id: empresa || null,
    modulo,
    versao_app: Object.prototype.hasOwnProperty.call(bruto, 'versao_app') ? bruto.versao_app : null,
    payload
  });
}

function classificarItemFila(item, ctx) {
  const atual = completarItemFila(item);
  const contexto = ctx || contextoDaSessao();
  if (versaoAppAbaixoDaMinima(contexto.versaoApp, contexto.versaoMinima)) {
    return { destino: 'suspenso', motivo: 'versao_minima_app' };
  }
  if (atual.empresa_id && contexto.empresaId && String(atual.empresa_id) !== String(contexto.empresaId)) {
    return { destino: 'suspenso', motivo: 'outra_empresa' };
  }
  if (atual.modulo && Array.isArray(contexto.modulos) && contexto.modulos.indexOf(atual.modulo) < 0) {
    return { destino: 'suspenso', motivo: 'modulo_desligado' };
  }
  if (!atual.modulo && algumManifestoFalhou()) {
    return { destino: 'suspenso', motivo: 'manifesto_ausente' };
  }
  if (atual.motivo === 'vm403' && atual.contexto_id && atual.contexto_id === contextoIdOffline(contexto)) {
    return { destino: 'suspenso', motivo: 'vm403' };
  }
  return { destino: 'enviar', motivo: null };
}

function prepararFila(fila, suspensos, ctx) {
  const contexto = ctx || contextoDaSessao();
  const todos = [];
  const vistos = new Set();
  const origem = (Array.isArray(fila) ? fila : []).concat(Array.isArray(suspensos) ? suspensos : []);
  for (const bruto of origem) {
    const item = completarItemFila(bruto);
    const chave = item.id_temp || JSON.stringify([item.tabela, item.operacao, item.criado_em]);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    todos.push(item);
  }
  todos.sort((a, b) => String(a.criado_em || '').localeCompare(String(b.criado_em || ''))
    || String(a.id_temp || '').localeCompare(String(b.id_temp || '')));
  const novaFila = [];
  const novosSuspensos = [];
  const idsBloqueados = new Set();
  for (const item of todos) {
    let decisao = classificarItemFila(item, contexto);
    const pai = item.idRegistro ? String(item.idRegistro) : '';
    if (decisao.destino === 'enviar' && pai && idsBloqueados.has(pai)) {
      decisao = { destino: 'suspenso', motivo: 'depende_de_suspenso' };
    }
    if (decisao.destino === 'suspenso') {
      novosSuspensos.push(Object.assign({}, item, {
        motivo: decisao.motivo,
        suspenso_em: item.suspenso_em || new Date().toISOString(),
        contexto_id: decisao.motivo === 'vm403'
          ? (item.contexto_id || contextoIdOffline(contexto))
          : (item.contexto_id || null)
      }));
      if (item.operacao === 'INSERT' && item.payload && item.payload.id) {
        idsBloqueados.add(String(item.payload.id));
      }
    } else {
      const limpo = Object.assign({}, item);
      delete limpo.motivo;
      delete limpo.suspenso_em;
      delete limpo.detalhe;
      delete limpo.contexto_id;
      novaFila.push(limpo);
    }
  }
  return { fila: novaFila, suspensos: novosSuspensos };
}

function partirChaveCache(chave) {
  const texto = String(chave || '');
  const primeira = texto.indexOf(':');
  const segunda = primeira < 0 ? -1 : texto.indexOf(':', primeira + 1);
  if (primeira < 1 || segunda < 0 || segunda === primeira + 1) return null;
  return {
    empresa: texto.slice(0, primeira),
    modulo: texto.slice(primeira + 1, segunda),
    chave: texto.slice(segunda + 1)
  };
}

function montarChaveCache(empresaId, modulo, chave) {
  const empresa = empresaId ? String(empresaId) : 'sem-empresa';
  const mod = modulo ? String(modulo) : 'nucleo';
  return empresa + ':' + mod + ':' + String(chave || '');
}

function resolverChaveLeitura(chaveCache, meta) {
  if (meta && meta.chavePronta) return String(chaveCache || '');
  const modulo = (meta && meta.modulo) || mapasOfflineDosManifestos().porChave[chaveCache] || 'nucleo';
  const nome = meta && meta.periodo ? String(chaveCache) + ':' + String(meta.periodo) : String(chaveCache || '');
  const empresa = (meta && meta.empresaId) || empresaIdDaSessao();
  return montarChaveCache(empresa, modulo, nome);
}

function chavesObsoletas(chaves, ctx) {
  const contexto = ctx || {};
  const empresa = contexto.empresaId ? String(contexto.empresaId) : '';
  const ativas = Array.isArray(contexto.modulosAtivos) ? new Set(contexto.modulosAtivos.map(String)) : null;
  return (Array.isArray(chaves) ? chaves : []).filter(chave => {
    const partes = partirChaveCache(chave);
    if (!partes) return true;
    if (empresa && partes.empresa !== empresa) return true;
    if (ativas && !ativas.has(partes.modulo)) return true;
    return false;
  });
}

// O erro é "temporário"? (sem sinal, servidor fora, sessão vencida): então mantém na fila.
function erroEhRecuperavel(res) {
  if (!res || !res.error) return false;
  if (erroEhSuspensao(res)) return false;
  const status = Number(res.status || 0);
  const msg = String(res.error.message || res.error).toLowerCase();
  if (status === 0) return true;                       // sem resposta = sem rede
  if (status >= 500) return true;                      // servidor com problema
  if (status === 401 || status === 408 || status === 429) return true;
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|fetch failed|jwt expired/.test(msg);
}

function erroEhSuspensao(res) {
  if (!res || !res.error) return false;
  const status = Number(res.status || 0);
  const codigo = String((res.error && (res.error.code || res.error.sqlstate)) || '');
  const msg = descreverErro(res);
  if (status === 403 || codigo === 'VM403') return true;
  return /vm403|sem permiss[aã]o/i.test(msg);
}

function descreverErro(res) {
  const e = res && res.error;
  if (!e) return '';
  return [e.message, e.details, e.hint].filter(Boolean).join(' | ') || String(e);
}

// Executa UMA operação no Supabase e devolve { data, error, status }.
async function executarOperacaoNoBanco(item, modoReenvio = false) {
  const { tabela, operacao, payload, idRegistro } = item;
  try {
    // Funções do servidor (ex.: lancar_horimetro do QR) funcionam SEM login, com id próprio (idempotentes).
    if (operacao === 'RPC') {
      return await db.rpc(tabela, payload);
    }
    // Todo o resto exige login ativo. Sem login a gravação fica guardada na fila (não é rejeitada).
    try {
      const { data: dSess } = await db.auth.getSession();
      if (!dSess || !dSess.session) {
        return { data: null, error: { message: 'Sem login ativo: entre no sistema para enviar os registros pendentes.' }, status: 401 };
      }
    } catch (e) {
      return { data: null, error: { message: 'Sessão indisponível' }, status: 401 };
    }
    if (operacao === 'INSERT') {
      // No reenvio usamos "ignorar duplicado": se o servidor já recebeu, não cria outro.
      if (modoReenvio) {
        return await db.from(tabela).upsert([payload], { onConflict: 'id', ignoreDuplicates: true });
      }
      return await db.from(tabela).insert([payload]).select().maybeSingle();
    }
    if (operacao === 'UPDATE') {
      return await db.from(tabela).update(payload).eq('id', idRegistro).select().maybeSingle();
    }
    if (operacao === 'DELETE') {
      return await db.from(tabela).delete().eq('id', idRegistro);
    }
    // Horímetro de equipamento: só sobe, nunca desce (protege contra reenvio fora de ordem).
    if (operacao === 'HORIMETRO_MAX') {
      return await db.from('equipamentos')
        .update({ horimetro_atual: payload.horimetro_atual })
        .eq('id', idRegistro)
        .lt('horimetro_atual', payload.horimetro_atual);
    }
    return { data: null, error: { message: `Operação desconhecida: ${operacao}` }, status: 400 };
  } catch (err) {
    return { data: null, error: { message: String((err && err.message) || err) }, status: 0 };
  }
}

// ---------- limite de salto do horímetro (mesma regra do servidor) -----------
// Horas: só pode subir o tempo que realmente passou desde a última leitura (+ tolerância de relógio).
// KM: no máximo 200 km por dia desde a última leitura (mínimo 1 dia).
// Sem data da última leitura: vale o limite fixo antigo (300 H / 5000 KM).
const CFG_LIMITE_PADRAO = { limite_km_dia: 200, tolerancia_horas: 0.5, fixo_horas: 300, fixo_km: 5000 };

function calcularLimiteSalto(unidade, baseEm, quandoMs, cfg) {
  const c = Object.assign({}, CFG_LIMITE_PADRAO, cfg || {});
  const km = String(unidade || 'H').toUpperCase() === 'KM';
  const base = baseEm ? new Date(baseEm).getTime() : NaN;
  if (!Number.isFinite(base)) return { limite: Number(km ? c.fixo_km : c.fixo_horas), porTempo: false, horas: null, dias: null };
  const horas = Math.max(0, ((quandoMs || Date.now()) - base) / 3600000);
  if (km) {
    const dias = Math.max(1, Math.ceil(horas / 24));
    return { limite: Number(c.limite_km_dia) * dias, porTempo: true, horas, dias };
  }
  return { limite: horas + Number(c.tolerancia_horas), porTempo: true, horas, dias: null };
}

function explicarLimiteSalto(unidade, info) {
  const un = String(unidade || 'H').toUpperCase();
  const lim = Math.floor(info.limite * 10) / 10;
  if (!info.porTempo) return `O aumento máximo aceito de uma só vez é ${lim} ${un}.`;
  if (un === 'KM') return `Desde a última leitura são ${info.dias} dia(s): o máximo é 200 km por dia, ou seja, até +${lim} KM.`;
  const h = Math.round(info.horas * 10) / 10;
  return `Desde a última leitura passaram ${h} h, então o horímetro só pode ter subido até +${lim} h.`;
}

// ---------- leitura com cache -----------------------------------------------

// Cópias dos dados para uso sem sinal ficam no IndexedDB (aguenta dezenas de MB; o localStorage
// do celular estoura em ~5 MB). Se o IndexedDB não existir, usa o localStorage como antes.
const IDB_NOME = (typeof window !== 'undefined' && window.PlataformaProduto) ? window.PlataformaProduto.bancoLocal : 'vilasa_dados_v1'; // nome histórico do IndexedDB
const IDB_TABELA = 'cache';
let _idbPromessa = null;

function abrirIDB() {
  if (_idbPromessa) return _idbPromessa;
  _idbPromessa = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null);
      const req = indexedDB.open(IDB_NOME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_TABELA);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) { resolve(null); }
  });
  return _idbPromessa;
}

function idbOperar(modo, fn) {
  return abrirIDB().then(idb => new Promise((resolve, reject) => {
    if (!idb) return reject(new Error('sem IndexedDB'));
    try {
      const tx = idb.transaction(IDB_TABELA, modo);
      const r = fn(tx.objectStore(IDB_TABELA));
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('falha IndexedDB'));
    } catch (e) { reject(e); }
  }));
}

async function cacheGravarDados(chave, dados) {
  try {
    await idbOperar('readwrite', st => st.put(dados, chave));
    try { localStorage.removeItem(PREFIXO_CACHE_LOCAL + chave); } catch (e) {} // libera a cópia antiga
    return true;
  } catch (e) {
    try { localStorage.setItem(PREFIXO_CACHE_LOCAL + chave, JSON.stringify(dados)); return true; }
    catch (e2) { console.warn('Cache local cheio:', e2); return false; }
  }
}

async function cacheLerDados(chave) {
  try {
    const v = await idbOperar('readonly', st => st.get(chave));
    if (v !== undefined && v !== null) return v;
  } catch (e) { /* cai para o localStorage */ }
  try {
    const bruto = localStorage.getItem(PREFIXO_CACHE_LOCAL + chave);
    if (bruto) return JSON.parse(bruto);
  } catch (e) { /* ignora */ }
  return null;
}

// Ao sair: apaga as cópias de dados (a fila de registros pendentes NÃO é apagada).
async function limparCacheLocalDeDados() {
  try { await idbOperar('readwrite', st => st.clear()); } catch (e) {}
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIXO_CACHE_LOCAL) || k.startsWith(PREFIXO_QR_EQUIP_LOCAL))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}
}

async function lerDadosComFallbackOffline(chaveCache, fnQuerySupabase, meta) {
  const chave = resolverChaveLeitura(chaveCache, meta);
  try {
    if (typeof obterClienteSupabase === 'function') obterClienteSupabase();
    if (navigator.onLine && typeof fnQuerySupabase === 'function') {
      const res = await fnQuerySupabase();
      if (res && !res.error && res.data) {
        await cacheGravarDados(chave, res.data);
        return { data: res.data, error: null, offline: false };
      }
      if (res && res.error && !erroEhRecuperavel(res)) {
        console.warn(`Erro ao ler ${chave}:`, res.error);
      }
    }
  } catch (err) {
    console.warn(`Modo offline para ${chave}:`, err);
  }

  const dados = await cacheLerDados(chave);
  return { data: dados || [], error: null, offline: true };
}

function listarNomesArmazem(storage) {
  const nomes = [];
  try {
    if (storage && typeof storage.length === 'number' && typeof storage.key === 'function') {
      for (let i = 0; i < storage.length; i += 1) nomes.push(storage.key(i));
    }
  } catch (e) { /* armazém sem índice */ }
  return nomes.filter(Boolean);
}

async function listarChavesCache() {
  const chaves = [];
  try {
    const lista = await idbOperar('readonly', st => st.getAllKeys());
    if (Array.isArray(lista)) chaves.push(...lista.map(item => String(item)));
  } catch (e) { /* sem IndexedDB */ }
  try {
    for (const nome of listarNomesArmazem(localStorage)) {
      if (nome.startsWith(PREFIXO_CACHE_LOCAL)) chaves.push(nome.slice(PREFIXO_CACHE_LOCAL.length));
    }
  } catch (e) { /* sem localStorage */ }
  return Array.from(new Set(chaves));
}

async function apagarChavesCache(chaves) {
  const lista = Array.isArray(chaves) ? chaves : [];
  if (lista.length === 0) return;
  const alvo = new Set(lista.map(item => String(item)));
  try {
    const idb = await abrirIDB();
    if (idb) {
      await new Promise(resolve => {
        const tx = idb.transaction(IDB_TABELA, 'readwrite');
        const st = tx.objectStore(IDB_TABELA);
        const req = st.getAllKeys();
        req.onsuccess = () => {
          for (const k of req.result || []) {
            if (alvo.has(String(k))) st.delete(k);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => resolve();
      });
    }
  } catch (e) { /* segue no localStorage */ }
  try {
    for (const chave of alvo) localStorage.removeItem(PREFIXO_CACHE_LOCAL + chave);
  } catch (e) { /* ignora */ }
}

async function aplicarContextoOffline(ctx) {
  const contexto = ctx || contextoDaSessao();
  const chaves = await listarChavesCache();
  await apagarChavesCache(chavesObsoletas(chaves, {
    empresaId: contexto.empresaId,
    modulosAtivos: contexto.modulos
  }));
  try {
    for (const nome of listarNomesArmazem(localStorage)) {
      if (nome.startsWith(PREFIXO_QR_EQUIP_LOCAL)) localStorage.removeItem(nome);
    }
  } catch (e) { /* chave antiga do QR */ }
  const preparado = prepararFila(lerFilaOffline(), lerSuspensosOffline(), contexto);
  salvarListaLocal(CHAVE_FILA_OFFLINE, preparado.fila);
  salvarListaLocal(CHAVE_FILA_SUSPENSOS, preparado.suspensos);
  if (versaoAppAbaixoDaMinima(contexto.versaoApp, contexto.versaoMinima)) {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.update) await reg.update();
      }
    } catch (e) { /* o aviso fica no badge */ }
  }
  atualizarBadgeStatusRede();
  return preparado;
}

// Mostra na lista o que ainda está na fila de envio (OS aberta/alterada sem sinal aparece na hora, marcada _pendente).
function aplicarPendentesNaLista(tabela, lista, enriquecer) {
  const base = Array.isArray(lista) ? lista.map(r => ({ ...r })) : [];
  const fila = lerFilaOffline().filter(i => i.tabela === tabela);
  for (const it of fila) {
    if (it.operacao === 'INSERT' && it.payload && it.payload.id) {
      const i = base.findIndex(r => String(r.id) === String(it.payload.id));
      let nova = { ...it.payload, _pendente: true };
      if (typeof enriquecer === 'function') nova = enriquecer(nova);
      if (i >= 0) base[i] = { ...base[i], ...nova }; else base.unshift(nova);
    } else if (it.operacao === 'UPDATE' && it.idRegistro) {
      const i = base.findIndex(r => String(r.id) === String(it.idRegistro));
      if (i >= 0) base[i] = { ...base[i], ...it.payload, _pendente: true };
    }
  }
  return base;
}
window.aplicarPendentesNaLista = aplicarPendentesNaLista;

// ---------- gravação --------------------------------------------------------

function empresaIdDaSessao() {
  try {
    if (window.Plataforma && Plataforma.sessao) {
      const sessao = Plataforma.sessao.ler(localStorage);
      if (sessao && sessao.empresa_id) return String(sessao.empresa_id);
      if (sessao && sessao.empresa && sessao.empresa.id) return String(sessao.empresa.id);
    }
  } catch (e) { /* sessão ilegível: o item segue sem empresa */ }
  try {
    if (window.equipAtualQR && window.equipAtualQR.empresa_id) return String(window.equipAtualQR.empresa_id);
  } catch (e) { /* portal QR ainda sem máquina */ }
  return null;
}

// INSERT/UPDATE grava a empresa no payload. RPC não: os argumentos da função não mudam.
function payloadComEmpresa(operacao, payload) {
  if (!payload || typeof payload !== 'object' || operacao === 'RPC') return payload;
  const empresaId = payload.empresa_id || empresaIdDaSessao();
  if (!empresaId) {
    if (!Object.prototype.hasOwnProperty.call(payload, 'empresa_id')) return payload;
    const semEmpresa = { ...payload };
    delete semEmpresa.empresa_id;
    return semEmpresa;
  }
  if (payload.empresa_id) return payload;
  return { ...payload, empresa_id: empresaId };
}

function usuarioIdDaSessao() {
  const sessao = sessaoOfflineAtual();
  if (sessao && sessao.perfil && sessao.perfil.id != null && sessao.perfil.id !== '') {
    return String(sessao.perfil.id);
  }
  try {
    if (typeof usuarioLogado !== 'undefined' && usuarioLogado && usuarioLogado.id != null) {
      return String(usuarioLogado.id);
    }
  } catch (e) { /* sem usuário na memória */ }
  return null;
}

function montarItemFila(tabela, operacao, payload, idRegistro, opcoes) {
  const payloadItem = payloadComEmpresa(operacao, payload);
  const modulo = (opcoes && opcoes.modulo) || moduloDaTabela(tabela) || null;
  const item = {
    id_temp: novoUuid(),
    tabela,
    operacao,
    payload: payloadItem,
    idRegistro,
    empresa_id: empresaIdDaSessao() || (payloadItem && payloadItem.empresa_id) || null,
    modulo,
    versao_app: versaoAppAtual(),
    usuario_id: usuarioIdDaSessao(),
    criado_em: new Date().toISOString(),
    tentativas: 0
  };
  if (operacao === 'INSERT' && item.payload && !item.payload.id) {
    item.payload = Object.assign({}, item.payload, { id: novoUuid() });
  }
  return item;
}

function guardarSuspenso(item, motivo, detalhe, ctx) {
  const contexto = ctx || contextoDaSessao();
  const suspensos = lerSuspensosOffline();
  suspensos.push(Object.assign({}, item, {
    motivo,
    detalhe: detalhe || '',
    suspenso_em: new Date().toISOString(),
    contexto_id: motivo === 'vm403' ? contextoIdOffline(contexto) : (item.contexto_id || null)
  }));
  return salvarListaLocal(CHAVE_FILA_SUSPENSOS, suspensos);
}

function enfileirarOperacaoOffline(tabela, operacao, payload, idRegistro = null, opcoes = null) {
  const item = montarItemFila(tabela, operacao, payload, idRegistro, opcoes);
  const fila = lerFilaOffline();
  fila.push(item);
  const ok = salvarListaLocal(CHAVE_FILA_OFFLINE, fila);
  atualizarBadgeStatusRede();
  return ok ? item : null;
}

async function gravarDadosOfflineSafe(tabela, operacao, payload, idRegistro = null, opcoes = null) {
  if (typeof obterClienteSupabase === 'function') obterClienteSupabase();

  // Todo INSERT nasce com id próprio (permite editar offline e evita duplicar no reenvio).
  payload = payloadComEmpresa(operacao, payload);
  if (operacao === 'INSERT' && payload && !payload.id) payload = { ...payload, id: novoUuid() };

  const ctx = contextoDaSessao();
  const previsto = montarItemFila(tabela, operacao, payload, idRegistro, opcoes);
  if (operacao === 'INSERT' && payload && payload.id) previsto.payload = payload;
  const decisao = classificarItemFila(previsto, ctx);
  if (decisao.destino === 'suspenso') {
    const ok = guardarSuspenso(previsto, decisao.motivo, '', ctx);
    atualizarBadgeStatusRede();
    if (!ok) return { data: null, error: { message: 'Memória do celular cheia' }, offline: true };
    return { data: previsto.payload, error: null, offline: true, suspenso: true, motivo: decisao.motivo };
  }

  const haPendentes = lerFilaOffline().length > 0;

  // Só grava direto se estiver online E não houver nada esperando (mantém a ordem).
  if (navigator.onLine && typeof db !== 'undefined' && db && !haPendentes) {
    const res = await executarOperacaoNoBanco({ tabela, operacao, payload, idRegistro, empresa_id: previsto.empresa_id, modulo: previsto.modulo, versao_app: previsto.versao_app });
    if (!res.error) {
      const dado = res.data || (operacao === 'INSERT' ? payload : null);
      return { data: dado, error: null, offline: false };
    }
    if (erroEhSuspensao(res)) {
      const ok = guardarSuspenso(previsto, 'vm403', descreverErro(res), ctx);
      atualizarBadgeStatusRede();
      if (!ok) return { data: null, error: { message: 'Memória do celular cheia' }, offline: true };
      return { data: previsto.payload, error: null, offline: true, suspenso: true, motivo: 'vm403' };
    }
    if (!erroEhRecuperavel(res)) {
      alert(operacao === 'RPC' ? 'Não foi possível registrar: ' + descreverErro(res) : `Erro ao gravar em ${tabela}: ` + descreverErro(res));
      return { data: null, error: res.error, offline: false };
    }
    // Erro temporário (sinal ruim): cai para a fila abaixo.
  }

  const item = enfileirarOperacaoOffline(tabela, operacao, payload, idRegistro, opcoes);
  if (!item) return { data: null, error: { message: 'Memória do celular cheia' }, offline: true };
  if (navigator.onLine) setTimeout(sincronizarFilaOffline, 500);
  return { data: item.payload, error: null, offline: true };
}

// ---------- sincronização ---------------------------------------------------

function tirarDaFila(idTemp) {
  salvarListaLocal(CHAVE_FILA_OFFLINE, lerFilaOffline().filter(i => i.id_temp !== idTemp));
}

function reclassificarFilaOffline() {
  if (!manifestosProntosParaFila()) return null;
  const preparado = prepararFila(lerFilaOffline(), lerSuspensosOffline(), contextoDaSessao());
  salvarListaLocal(CHAVE_FILA_OFFLINE, preparado.fila);
  salvarListaLocal(CHAVE_FILA_SUSPENSOS, preparado.suspensos);
  return preparado;
}

async function sincronizarFilaOffline() {
  if (sincronizacaoEmAndamento) return;
  if (!navigator.onLine || typeof db === 'undefined' || !db) return;
  if (!manifestosProntosParaFila()) return;
  // Junta o que uma aba antiga ainda tenha gravado com o nome velho da fila.
  try {
    if (typeof window !== 'undefined' && window.PlataformaProduto && typeof window.PlataformaProduto.migrarAgora === 'function') {
      window.PlataformaProduto.migrarAgora();
    }
  } catch (e) { /* segue com a fila atual */ }
  sincronizacaoEmAndamento = true;

  const idsRejeitados = new Set();
  const idsSuspensos = new Set();
  try {
    const ctx = contextoDaSessao();
    const preparado = prepararFila(lerFilaOffline(), lerSuspensosOffline(), ctx);
    salvarListaLocal(CHAVE_FILA_OFFLINE, preparado.fila);
    salvarListaLocal(CHAVE_FILA_SUSPENSOS, preparado.suspensos);
    for (const suspenso of preparado.suspensos) {
      if (suspenso.operacao === 'INSERT' && suspenso.payload && suspenso.payload.id) {
        idsSuspensos.add(String(suspenso.payload.id));
      }
    }

    while (true) {
      const fila = lerFilaOffline();
      if (fila.length === 0) break;
      const item = fila[0];

      if (item.operacao === 'INSERT' && item.payload && !item.payload.id) item.payload.id = item.id_temp;

      const dependeDeSuspenso = item.idRegistro && idsSuspensos.has(String(item.idRegistro));
      const dependeDeRejeitado = item.idRegistro && idsRejeitados.has(String(item.idRegistro));
      let res;
      if (dependeDeSuspenso) {
        res = { error: { message: 'Depende de um registro suspenso', code: 'VM403' }, status: 403 };
      } else if (dependeDeRejeitado) {
        res = { error: { message: 'Depende de um registro que foi rejeitado' }, status: 400 };
      } else {
        res = await executarOperacaoNoBanco(item, true);
      }

      if (!res.error) {
        tirarDaFila(item.id_temp);
        continue;
      }

      if (erroEhSuspensao(res)) {
        guardarSuspenso(item, dependeDeSuspenso ? 'depende_de_suspenso' : 'vm403', descreverErro(res), ctx);
        if (item.operacao === 'INSERT' && item.payload && item.payload.id) {
          idsSuspensos.add(String(item.payload.id));
        }
        tirarDaFila(item.id_temp);
        continue;
      }

      if (erroEhRecuperavel(res)) {
        // Sem sinal ou servidor instável: para aqui e tenta de novo depois, mantendo a ordem.
        const atual = lerFilaOffline().map(i => i.id_temp === item.id_temp
          ? { ...i, tentativas: (i.tentativas || 0) + 1, ultimo_erro: descreverErro(res) }
          : i);
        salvarListaLocal(CHAVE_FILA_OFFLINE, atual);
        break;
      }

      // Erro definitivo: guarda em REJEITADOS para o PCM/Engenharia revisar. Não some.
      if (item.operacao === 'INSERT' && item.payload && item.payload.id) idsRejeitados.add(item.payload.id);
      const rejeitados = lerRejeitadosOffline();
      rejeitados.push({ ...item, erro: descreverErro(res), rejeitado_em: new Date().toISOString() });
      salvarListaLocal(CHAVE_FILA_REJEITADOS, rejeitados);
      tirarDaFila(item.id_temp);
    }
  } finally {
    sincronizacaoEmAndamento = false;
    atualizarBadgeStatusRede();
  }
}

function textoSuspensos(lista) {
  return (Array.isArray(lista) ? lista : []).map((r, i) =>
    `${i + 1}) ${r.motivo || 'suspenso'} — ${r.operacao} em ${r.tabela}` +
    (r.modulo ? ` (${r.modulo})` : '') +
    (r.detalhe ? `\n   ${r.detalhe}` : '')
  ).join('\n\n');
}

function revisarSuspensosOffline() {
  const lista = lerSuspensosOffline();
  if (lista.length === 0) return alert('Nenhum lançamento suspenso.');
  const linhas = textoSuspensos(lista.slice(0, 15));
  const msg = `⏸ ${lista.length} suspensos. Nada foi apagado.\n\n${linhas}\n\n` +
    'Eles voltam sozinhos quando o módulo ligar, a empresa for a desta sessão ou o aplicativo atualizar (ou carregar por completo). Deseja exportar a lista?';
  if (!confirm(msg)) return;
  const texto = textoSuspensos(lista);
  try {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registros-suspensos.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(texto);
  }
}

function revisarRejeitadosOffline() {
  const rej = lerRejeitadosOffline();
  if (rej.length === 0) return alert('Nenhuma gravação rejeitada.');
  const linhas = rej.slice(0, 15).map((r, i) =>
    `${i + 1}) ${r.operacao} em ${r.tabela} — ${new Date(r.criado_em).toLocaleString('pt-BR')}\n   Motivo: ${r.erro}`
  ).join('\n\n');
  const msg = `⚠️ ${rej.length} gravação(ões) recusada(s) pelo servidor:\n\n${linhas}\n\n` +
    `Anote ou tire print e refaça o lançamento. Deseja LIMPAR esta lista agora?`;
  if (confirm(msg)) {
    localStorage.removeItem(CHAVE_FILA_REJEITADOS);
    atualizarBadgeStatusRede();
  }
}

// ---------- indicador na tela -----------------------------------------------

function atualizarBadgeStatusRede() {
  let badge = document.getElementById('badgeStatusRedeV2');
  if (!badge) {
    const containerUser = document.getElementById('headerCargoUsuario')?.parentElement
      || document.getElementById('qrBadgeRede');
    if (!containerUser) return;
    badge = document.createElement('div');
    badge.id = 'badgeStatusRedeV2';
    badge.className = 'mt-2 text-[10px] font-black uppercase';
    containerUser.appendChild(badge);
  }

  const pend = lerFilaOffline().length;
  const rej = lerRejeitadosOffline().length;
  const susp = lerSuspensosOffline().length;
  const partes = [];
  const ctx = contextoDaSessao();

  if (versaoAppAbaixoDaMinima(ctx.versaoApp, ctx.versaoMinima)) {
    partes.push(`<span class="text-amber-700">Atualize o aplicativo antes de enviar (mínima ${ctx.versaoMinima}).</span>`);
  }

  if (navigator.onLine) {
    partes.push(pend > 0
      ? `<span class="text-amber-600">🟡 Enviando ${pend} pendente(s)...</span> <button onclick="sincronizarFilaOffline()" class="ml-1 underline text-amber-700">enviar agora</button>`
      : '<span class="text-emerald-600">🟢 Online • tudo enviado</span>');
  } else {
    partes.push(`<span class="text-amber-600">⚡ Sem sinal • ${pend} salvo(s) no celular, serão enviados quando voltar o sinal</span>`);
  }
  if (rej > 0) {
    partes.push(`<button onclick="revisarRejeitadosOffline()" class="block mt-1 underline text-rose-600">❌ ${rej} recusada(s) pelo servidor — revisar</button>`);
  }
  if (susp > 0) {
    partes.push(`<button type="button" onclick="revisarSuspensosOffline()" class="block mt-1 underline text-amber-800">⏸ ${susp} suspensos — revisar</button>`);
  }
  badge.innerHTML = partes.join('');
}

window.lerDadosComFallbackOffline = lerDadosComFallbackOffline;
window.calcularLimiteSalto = calcularLimiteSalto;
window.explicarLimiteSalto = explicarLimiteSalto;
window.limparCacheLocalDeDados = limparCacheLocalDeDados;
window.gravarDadosOfflineSafe = gravarDadosOfflineSafe;
window.sincronizarFilaOffline = sincronizarFilaOffline;
window.enfileirarOperacaoOffline = enfileirarOperacaoOffline;
window.revisarRejeitadosOffline = revisarRejeitadosOffline;
window.revisarSuspensosOffline = revisarSuspensosOffline;
window.lerSuspensosOffline = lerSuspensosOffline;
window.prepararFila = prepararFila;
window.classificarItemFila = classificarItemFila;
window.montarChaveCache = montarChaveCache;
window.resolverChaveLeitura = resolverChaveLeitura;
window.chavesObsoletas = chavesObsoletas;
window.versaoAppAbaixoDaMinima = versaoAppAbaixoDaMinima;
window.contextoDaSessao = contextoDaSessao;
window.erroEhSuspensao = erroEhSuspensao;
window.aplicarContextoOffline = aplicarContextoOffline;
window.textoSuspensos = textoSuspensos;
window.CHAVE_FILA_SUSPENSOS = CHAVE_FILA_SUSPENSOS;

window.addEventListener('online', () => {
  reclassificarFilaOffline();
  atualizarBadgeStatusRede();
  sincronizarFilaOffline();
});
window.addEventListener('offline', atualizarBadgeStatusRede);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sincronizarFilaOffline();
});
function iniciarFilaDaPagina() {
  reclassificarFilaOffline();
  atualizarBadgeStatusRede();
  sincronizarFilaOffline();
}
document.addEventListener('DOMContentLoaded', () => {
  const P = window.Plataforma;
  // Assim que os manifestos chegam (o dono de cada item vem deles).
  if (P && P.modulos && typeof P.modulos.manifestosProntos === 'function') {
    P.modulos.manifestosProntos().then(() => setTimeout(iniciarFilaDaPagina, 300));
  } else {
    setTimeout(iniciarFilaDaPagina, 1500);
  }
});
// "online" do navegador nem sempre avisa: tenta de novo sozinho enquanto houver pendência.
setInterval(() => { if (lerFilaOffline().length > 0) sincronizarFilaOffline(); }, INTERVALO_TENTATIVA_MS);

// ============================================================================
// VILASA CMMS - MÓDULO 2: OFFLINE_SYNC.JS (CACHE LOCAL E FILA DE SINCRONIZAÇÃO) - V3
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
// ============================================================================

const CHAVE_FILA_OFFLINE = 'vilasa_fila_sync_v2';
const CHAVE_FILA_REJEITADOS = 'vilasa_fila_rejeitados_v2';
const INTERVALO_TENTATIVA_MS = 30000;

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

// O erro é "temporário"? (sem sinal, servidor fora, sessão vencida): então mantém na fila.
function erroEhRecuperavel(res) {
  if (!res || !res.error) return false;
  const status = Number(res.status || 0);
  const msg = String(res.error.message || res.error).toLowerCase();
  if (status === 0) return true;                       // sem resposta = sem rede
  if (status >= 500) return true;                      // servidor com problema
  if (status === 401 || status === 408 || status === 429) return true;
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|fetch failed|jwt expired/.test(msg);
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

// ---------- leitura com cache -----------------------------------------------

async function lerDadosComFallbackOffline(chaveCache, fnQuerySupabase) {
  try {
    if (typeof obterClienteSupabase === 'function') obterClienteSupabase();
    if (navigator.onLine && typeof fnQuerySupabase === 'function') {
      const res = await fnQuerySupabase();
      if (res && !res.error && res.data) {
        try {
          localStorage.setItem(`vilasa_cache_${chaveCache}`, JSON.stringify(res.data));
        } catch (e) {
          console.warn('Cache local cheio:', e);
        }
        return { data: res.data, error: null, offline: false };
      }
      if (res && res.error && !erroEhRecuperavel(res)) {
        console.warn(`Erro ao ler ${chaveCache}:`, res.error);
      }
    }
  } catch (err) {
    console.warn(`Modo offline para ${chaveCache}:`, err);
  }

  let dados = [];
  try {
    const cacheLocal = localStorage.getItem(`vilasa_cache_${chaveCache}`);
    if (cacheLocal) dados = JSON.parse(cacheLocal);
  } catch (e) {
    dados = [];
  }
  return { data: dados, error: null, offline: true };
}

// ---------- gravação --------------------------------------------------------

function enfileirarOperacaoOffline(tabela, operacao, payload, idRegistro = null) {
  const item = {
    id_temp: novoUuid(),
    tabela,
    operacao,
    payload,
    idRegistro,
    criado_em: new Date().toISOString(),
    tentativas: 0
  };
  if (operacao === 'INSERT' && payload && !payload.id) item.payload = { ...payload, id: novoUuid() };

  const fila = lerFilaOffline();
  fila.push(item);
  const ok = salvarListaLocal(CHAVE_FILA_OFFLINE, fila);
  atualizarBadgeStatusRede();
  return ok ? item : null;
}

async function gravarDadosOfflineSafe(tabela, operacao, payload, idRegistro = null) {
  if (typeof obterClienteSupabase === 'function') obterClienteSupabase();

  // Todo INSERT nasce com id próprio (permite editar offline e evita duplicar no reenvio).
  if (operacao === 'INSERT' && payload && !payload.id) payload = { ...payload, id: novoUuid() };

  const haPendentes = lerFilaOffline().length > 0;

  // Só grava direto se estiver online E não houver nada esperando (mantém a ordem).
  if (navigator.onLine && typeof db !== 'undefined' && db && !haPendentes) {
    const res = await executarOperacaoNoBanco({ tabela, operacao, payload, idRegistro });
    if (!res.error) {
      const dado = res.data || (operacao === 'INSERT' ? payload : null);
      return { data: dado, error: null, offline: false };
    }
    if (!erroEhRecuperavel(res)) {
      alert(operacao === 'RPC' ? 'Não foi possível registrar: ' + descreverErro(res) : `Erro ao gravar em ${tabela}: ` + descreverErro(res));
      return { data: null, error: res.error, offline: false };
    }
    // Erro temporário (sinal ruim): cai para a fila abaixo.
  }

  const item = enfileirarOperacaoOffline(tabela, operacao, payload, idRegistro);
  if (!item) return { data: null, error: { message: 'Memória do celular cheia' }, offline: true };
  if (navigator.onLine) setTimeout(sincronizarFilaOffline, 500);
  return { data: item.payload, error: null, offline: true };
}

// ---------- sincronização ---------------------------------------------------

async function sincronizarFilaOffline() {
  if (sincronizacaoEmAndamento) return;
  if (!navigator.onLine || typeof db === 'undefined' || !db) return;
  sincronizacaoEmAndamento = true;

  const idsRejeitados = new Set();
  try {
    while (true) {
      const fila = lerFilaOffline();
      if (fila.length === 0) break;
      const item = fila[0];

      if (item.operacao === 'INSERT' && item.payload && !item.payload.id) item.payload.id = item.id_temp;

      // Se o registro-pai foi rejeitado, este item que depende dele também não faz sentido.
      const dependeDeRejeitado = item.idRegistro && idsRejeitados.has(item.idRegistro);
      let res = dependeDeRejeitado
        ? { error: { message: 'Depende de um registro que foi rejeitado' }, status: 400 }
        : await executarOperacaoNoBanco(item, true);

      if (!res.error) {
        salvarListaLocal(CHAVE_FILA_OFFLINE, lerFilaOffline().filter(i => i.id_temp !== item.id_temp));
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
      salvarListaLocal(CHAVE_FILA_OFFLINE, lerFilaOffline().filter(i => i.id_temp !== item.id_temp));
    }
  } finally {
    sincronizacaoEmAndamento = false;
    atualizarBadgeStatusRede();
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
  const partes = [];

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
  badge.innerHTML = partes.join('');
}

window.lerDadosComFallbackOffline = lerDadosComFallbackOffline;
window.gravarDadosOfflineSafe = gravarDadosOfflineSafe;
window.sincronizarFilaOffline = sincronizarFilaOffline;
window.enfileirarOperacaoOffline = enfileirarOperacaoOffline;
window.revisarRejeitadosOffline = revisarRejeitadosOffline;

window.addEventListener('online', () => {
  atualizarBadgeStatusRede();
  sincronizarFilaOffline();
});
window.addEventListener('offline', atualizarBadgeStatusRede);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sincronizarFilaOffline();
});
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { atualizarBadgeStatusRede(); sincronizarFilaOffline(); }, 1500);
});
// "online" do navegador nem sempre avisa: tenta de novo sozinho enquanto houver pendência.
setInterval(() => { if (lerFilaOffline().length > 0) sincronizarFilaOffline(); }, INTERVALO_TENTATIVA_MS);

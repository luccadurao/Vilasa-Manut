// ============================================================================
// VILASA CMMS - MÓDULO 2: OFFLINE_SYNC.JS (CACHE LOCAL E FILA DE SINCRONIZAÇÃO)
// ============================================================================

const CHAVE_FILA_OFFLINE = 'vilasa_fila_sync_v2';

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
    }
  } catch (err) {
    console.warn(`Modo offline para ${chaveCache}:`, err);
  }

  const cacheLocal = localStorage.getItem(`vilasa_cache_${chaveCache}`);
  return {
    data: cacheLocal ? JSON.parse(cacheLocal) : [],
    error: null,
    offline: true
  };
}

async function gravarDadosOfflineSafe(tabela, operacao, payload, idRegistro = null) {
  if (typeof obterClienteSupabase === 'function') obterClienteSupabase();

  if (navigator.onLine && typeof db !== 'undefined') {
    try {
      if (operacao === 'INSERT') {
        const { data, error } = await db.from(tabela).insert([payload]).select().maybeSingle();
        if (error) throw error;
        return { data, error: null, offline: false };
      }
      if (operacao === 'UPDATE') {
        const { data, error } = await db.from(tabela).update(payload).eq('id', idRegistro).select().maybeSingle();
        if (error) throw error;
        return { data, error: null, offline: false };
      }
      if (operacao === 'DELETE') {
        const { error } = await db.from(tabela).delete().eq('id', idRegistro);
        if (error) throw error;
        return { data: null, error: null, offline: false };
      }
    } catch (err) {
      alert(`Erro ao gravar em ${tabela}: ` + (err.message || err));
      return { data: null, error: err, offline: false };
    }
  }

  // Se estiver sem internet no trecho, guarda na fila local para sincronizar depois
  const fila = JSON.parse(localStorage.getItem(CHAVE_FILA_OFFLINE) || '[]');
  fila.push({
    id_temp: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    tabela,
    operacao,
    payload,
    idRegistro,
    criado_em: new Date().toISOString()
  });
  localStorage.setItem(CHAVE_FILA_OFFLINE, JSON.stringify(fila));
  atualizarBadgeStatusRede();
  return { data: payload, error: null, offline: true };
}

async function sincronizarFilaOffline() {
  if (!navigator.onLine || typeof db === 'undefined') return;
  const fila = JSON.parse(localStorage.getItem(CHAVE_FILA_OFFLINE) || '[]');
  if (fila.length === 0) return;

  const pendentes = [];
  for (const item of fila) {
    try {
      if (item.operacao === 'INSERT') await db.from(item.tabela).insert([item.payload]);
      if (item.operacao === 'UPDATE') await db.from(item.tabela).update(item.payload).eq('id', item.idRegistro);
      if (item.operacao === 'DELETE') await db.from(item.tabela).delete().eq('id', item.idRegistro);
    } catch (e) {
      pendentes.push(item);
    }
  }

  localStorage.setItem(CHAVE_FILA_OFFLINE, JSON.stringify(pendentes));
  atualizarBadgeStatusRede();
}

function atualizarBadgeStatusRede() {
  let badge = document.getElementById('badgeStatusRedeV2');
  if (!badge) {
    const containerUser = document.getElementById('headerCargoUsuario')?.parentElement;
    if (!containerUser) return;
    badge = document.createElement('div');
    badge.id = 'badgeStatusRedeV2';
    badge.className = 'mt-2 text-[10px] font-black uppercase';
    containerUser.appendChild(badge);
  }

  const fila = JSON.parse(localStorage.getItem(CHAVE_FILA_OFFLINE) || '[]');
  if (navigator.onLine) {
    badge.innerHTML = `<span class="text-emerald-600">🟢 Online</span> ${fila.length > 0 ? `<button onclick="sincronizarFilaOffline()" class="ml-1 underline text-amber-600">(${fila.length} pendente)</button>` : ''}`;
  } else {
    badge.innerHTML = `<span class="text-amber-600">⚡ Modo Offline (${fila.length} na fila)</span>`;
  }
}

window.addEventListener('online', () => {
  atualizarBadgeStatusRede();
  sincronizarFilaOffline();
});
window.addEventListener('offline', atualizarBadgeStatusRede);
document.addEventListener('DOMContentLoaded', () => setTimeout(atualizarBadgeStatusRede, 1000));

// ============================================================================
// VILASA CMMS - SERVICE WORKER V3 (abre e funciona sem internet)
//
//  • Arquivos do próprio site: tenta a rede por até 4 s; se falhar/demorar, usa a cópia
//    guardada no celular (sinal "fraco" não trava a tela).
//  • Bibliotecas externas (Tailwind, Font Awesome, Supabase, html2canvas): usa a cópia
//    guardada na hora e atualiza em segundo plano.
//  • Chamadas ao banco (supabase.co) NUNCA passam por aqui: o app trata offline sozinho.
// ============================================================================
const VERSAO = 'v3';
const CACHE_NAME = `vilasa-pwa-${VERSAO}`;
const TEMPO_LIMITE_REDE_MS = 4000;

const ARQUIVOS_LOCAIS = [
  './', './index.html', './qr.html', './manifest.webmanifest',
  './config.js', './core.js', './offline_sync.js', './os_rep.js', './pcm_sap.js',
  './frota.js', './estoque.js', './kpis.js', './admin.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

const LIBS_EXTERNAS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];
const HOSTS_EXTERNOS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Um arquivo que falhe não impede os demais de serem guardados.
    await Promise.all(ARQUIVOS_LOCAIS.map(u => cache.add(u).catch(() => {})));
    await Promise.all(LIBS_EXTERNAS.map(async (u) => {
      try { await cache.put(u, await fetch(u, { mode: 'no-cors' })); } catch (e) {}
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    await Promise.all(nomes.filter(n => n.startsWith('vilasa-pwa-') && n !== CACHE_NAME).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

function guardar(req, resp) {
  if (resp && (resp.ok || resp.type === 'opaque')) {
    const copia = resp.clone();
    caches.open(CACHE_NAME).then(c => c.put(req, copia)).catch(() => {});
  }
  return resp;
}

function redeComLimite(req) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), TEMPO_LIMITE_REDE_MS);
    fetch(req).then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Biblioteca externa: cópia guardada primeiro, atualiza em segundo plano.
  if (HOSTS_EXTERNOS.includes(url.hostname)) {
    event.respondWith((async () => {
      const guardada = await caches.match(req);
      const atualiza = fetch(req).then(r => guardar(req, r)).catch(() => null);
      if (guardada) { event.waitUntil(atualiza); return guardada; }
      const r = await atualiza;
      return r || Response.error();
    })());
    return;
  }

  // Arquivos do próprio site.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        return guardar(req, await redeComLimite(req));
      } catch (e) {
        const guardada = await caches.match(req, { ignoreSearch: true });
        if (guardada) return guardada;
        if (req.mode === 'navigate') {
          const inicio = await caches.match('./index.html');
          if (inicio) return inicio;
        }
        return Response.error();
      }
    })());
  }
  // Qualquer outro host (ex.: banco de dados): não interfere.
});

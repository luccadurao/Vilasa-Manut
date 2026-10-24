// ============================================================================
// VILASA CMMS - SERVICE WORKER (CACHE DE PÁGINAS E SCRIPTS OFFLINE)
// ============================================================================
const CACHE_NAME = 'vilasa-pwa-cache-v2';
const ARQUIVOS_ESSENCIAIS = [
  './',
  './index.html',
  './qr.html',
  './config.js',
  './core.js',
  './offline_sync.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Estratégia Network-First com Fallback imediato para o Cache do Aparelho quando sem sinal
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se carregou da rede com sucesso, atualiza a cópia guardada no celular
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Sem internet: entrega a página ou script direto da memória interna do celular
        return caches.match(event.request, { ignoreSearch: true });
      })
  );
});

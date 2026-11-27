// ============================================================================
// VILASA CMMS - SERVICE WORKER
//
//  • Arquivos do próprio site: tenta a rede por até 4 s; se falhar/demorar, usa a cópia
//    guardada no celular (sinal "fraco" não trava a tela).
//  • Bibliotecas externas (Tailwind, Font Awesome, Supabase, html2canvas): usa a cópia
//    guardada na hora e atualiza em segundo plano.
//  • Chamadas ao banco (supabase.co) NUNCA passam por aqui: o app trata offline sozinho.
//  • ARQUIVOS_NUCLEO entra sempre no precache. Os scripts dos módulos entram depois,
//    por postMessage, quando o núcleo resolve o contrato.
// ============================================================================
importScripts('./nucleo/versao.js');

const VERSAO = VILASA_VERSAO_APP;
const CACHE_NAME = `vilasa-pwa-${VERSAO}`;
const TEMPO_LIMITE_REDE_MS = 4000;
const CHAVE_MODULOS = './nucleo/precache-modulos.json';

const ARQUIVOS_NUCLEO = [
  './', './index.html', './qr.html', './manifest.webmanifest',
  './config.js', './core.js', './offline_sync.js',
  './nucleo/versao.js', './nucleo/nucleo.js', './nucleo/qr.js', './nucleo/ativos.js', './nucleo/globais.js', './nucleo/tipos.js',
  './modulos/os/manifesto.js', './modulos/frota/manifesto.js',
  './modulos/preventivas/manifesto.js', './modulos/estoque/manifesto.js',
  './modulos/diesel/manifesto.js', './modulos/painel/manifesto.js',
  './modulos/admin/manifesto.js',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './vendor/tailwind.css', './vendor/supabase.js', './vendor/html2canvas.min.js',
  './vendor/fa/css/all.min.css', './vendor/fa/webfonts/fa-solid-900.woff2',
  './vendor/fa/webfonts/fa-regular-400.woff2', './vendor/fa/webfonts/fa-brands-400.woff2'
];

// As bibliotecas agora ficam dentro do próprio site (pasta vendor/): nada depende de sites externos.
const LIBS_EXTERNAS = [];
const HOSTS_EXTERNOS = [];

/**
 * @param {string} caminho
 */
function normalizarArquivo(caminho) {
  let texto = String(caminho || '').trim();
  if (!texto || texto.includes('..')) return '';
  try {
    if (texto.includes('://')) texto = new URL(texto).pathname;
  } catch (e) { /* caminho relativo */ }
  texto = texto.split('?')[0].split('#')[0].replace(/^\.\//, '').replace(/^\//, '');
  if (!texto) return './';
  return './' + texto;
}

const NUCLEO_NORMALIZADO = new Set(ARQUIVOS_NUCLEO.map(normalizarArquivo));

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Um arquivo que falhe não impede os demais de serem guardados.
    await Promise.all(ARQUIVOS_NUCLEO.map(u => cache.add(u).catch(() => {})));
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

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.tipo !== 'precache' || !Array.isArray(data.arquivos)) return;
  if (data.versao !== VERSAO) return;
  event.waitUntil(atualizarPrecacheModulos(data.arquivos));
});

/**
 * @param {string[]} arquivos
 */
async function atualizarPrecacheModulos(arquivos) {
  const desejados = [...new Set(arquivos.map(normalizarArquivo).filter((item) => item && item !== './'))];
  if (!desejados.length) return;
  const cache = await caches.open(CACHE_NAME);
  /** @type {string[]} */
  let anteriores = [];
  try {
    const salvo = await cache.match(CHAVE_MODULOS);
    if (salvo) {
      const lido = await salvo.json();
      if (Array.isArray(lido)) anteriores = lido.map((item) => normalizarArquivo(String(item))).filter(Boolean);
    }
  } catch (e) { anteriores = []; }

  const conjunto = new Set(desejados);
  const chaves = await cache.keys();
  await Promise.all(anteriores.map(async (antigo) => {
    if (conjunto.has(antigo) || NUCLEO_NORMALIZADO.has(antigo)) return;
    await Promise.all(chaves.map(async (req) => {
      if (normalizarArquivo(req.url) === antigo) await cache.delete(req);
    }));
  }));
  await Promise.all(desejados.map((u) => cache.add(u).catch(() => {})));
  await cache.put(CHAVE_MODULOS, new Response(JSON.stringify(desejados), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

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

  // Bibliotecas do próprio site (vendor/): não mudam, então a cópia guardada vale na hora (sem esperar a rede).
  if (url.origin === self.location.origin && url.pathname.includes('/vendor/')) {
    event.respondWith((async () => {
      const guardada = await caches.match(req, { ignoreSearch: true });
      if (guardada) return guardada;
      try { return guardar(req, await fetch(req)); } catch (e) { return Response.error(); }
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

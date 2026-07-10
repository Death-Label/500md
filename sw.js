// 500MD — Service Worker (Rodada 4)
// Estratégia:
//   - HTML/navegação: network-first com fallback pro cache (você sempre vê a versão mais nova quando tem rede)
//   - Assets estáticos (ícones, manifest, fontes, CDN): stale-while-revalidate (rápido, atualiza no fundo)
//   - Supabase (API, Auth, Realtime): nunca interceptado — sempre direto pro servidor

const VERSION = 'v2';
const CACHE = '500md-' + VERSION;
const APP_SHELL = [
  './',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(APP_SHELL))
      .catch((e) => console.warn('[sw] precache:', e))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Nunca interceptar Supabase nem WebSocket
  if (url.hostname.includes('supabase.co') || url.protocol === 'wss:' || url.protocol === 'ws:') {
    return;
  }

  // Navegação (HTML): network-first
  const accept = req.headers.get('accept') || '';
  const isNav = req.mode === 'navigate' || accept.includes('text/html');
  if (isNav || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match(req).then((m) => m || caches.match('./')))
    );
    return;
  }

  // Outros (ícones, fontes, CDN): stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkPromise = fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => cached);
      return cached || networkPromise;
    })
  );
});

// Permite forçar atualização via mensagem (caso queira no futuro)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

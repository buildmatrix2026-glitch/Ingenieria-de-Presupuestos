// ══════════════════════════════════════════════════════
//  BuildMatrix — Service Worker
//  Estrategia: Cache-First con actualización en segundo plano
// ══════════════════════════════════════════════════════

const CACHE_NAME  = 'buildmatrix-v2';   // v2 → limpia buildmatrix-v1 Y pwa-cache-v1
const OFFLINE_URL = './index.html';

// Recursos que se cachean al instalar el SW
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap'
];

// ── INSTALL: precachear recursos esenciales ──────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Promise.allSettled: si una URL falla (ej. fuente offline) no rompe todo
      return Promise.allSettled(
        PRECACHE_URLS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[BM-SW] No se pudo cachear:', url, err);
          });
        })
      );
    }).then(function() {
      // Activa inmediatamente sin esperar a que cierren otras pestañas
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE: limpiar caches antiguas (buildmatrix-v1, pwa-cache-v1, etc.) ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) {
            console.log('[BM-SW] Eliminando caché antigua:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      // Toma control de todas las pestañas abiertas de inmediato
      return self.clients.claim();
    })
  );
});

// ── FETCH: Cache-First → Network → Fallback ──────────
self.addEventListener('fetch', function(event) {
  // Solo interceptar peticiones GET
  if (event.request.method !== 'GET') return;

  // Ignorar extensiones de Chrome y URLs no-http
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        // Está en caché: devolver inmediatamente y actualizar en background
        fetch(event.request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, responseClone);
            });
          }
        }).catch(function() {
          // Sin red → no hacer nada, ya tenemos la versión cacheada
        });
        return cachedResponse;
      }

      // No está en caché: ir a la red
      return fetch(event.request).then(function(networkResponse) {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        var responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(function() {
        // Sin red y sin caché → devolver la página principal como fallback
        return caches.match(OFFLINE_URL);
      });
    })
  );
});

// ── MESSAGE: forzar actualización desde la app ────────
self.addEventListener('message', function(event) {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

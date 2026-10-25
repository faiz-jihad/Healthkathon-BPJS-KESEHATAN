// AURA-JKN Progressive Web App (PWA) Service Worker
// Memberikan kapabilitas Desktop App mandiri & caching shell aplikasi

const CACHE_NAME = 'aura-jkn-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/aura-jkn-logo.png'
];

// Install: Cache core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[AURA-JKN SW] Precaching asset warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Bersihkan cache lama & ambil alih klien
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[AURA-JKN SW] Menghapus cache versi lama:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-first untuk API, Cache-first/Stale-while-revalidate untuk static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jangan sentuh request non-GET atau request WebSocket/HMR
  if (event.request.method !== 'GET') return;
  if (url.pathname.includes('/@vite/') || url.pathname.includes('/@react-refresh')) return;

  // Permintaan API: Network-First (Pastikan data live dari PostgreSQL BPJS tidak basi)
  if (url.pathname.startsWith('/api/') || url.port === '3001') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Permintaan Static Assets: Stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        // Offline mode fallback
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});

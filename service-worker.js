const CACHE_NAME = 'madplan-cache-v2';
const FILES_TO_CACHE = [
  './madplan.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './frida-data.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Rør kun ved egne filer (samme origin). Eksterne kald (fx CORS-proxy til at hente opskrifter)
  // skal passere uberørt, ellers kan de blive forstyrret af cache-logikken herunder.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request)
        .then(res => {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

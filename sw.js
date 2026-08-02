const CACHE_NAME = 'pennylens-v8';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css?v=8',
  '/app.js?v=8',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
      await self.clients.claim();
      const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      tabs.forEach(tab => tab.navigate(tab.url));
    })()
  );
});

// Network-first everywhere: always show the freshest code, cache only for offline fallback.
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

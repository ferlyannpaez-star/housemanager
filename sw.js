/* Montalban Home Manager — service worker (spec §10.2 R2, §10.10).
   Keeps a copy of the app files so the app opens without internet.
   Network first: when online you always get the newest files (code updates arrive on reload);
   offline, the saved copy is used. Household data is not here — it stays in IndexedDB. */
const CACHE = 'mhm-app-v3';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css', './css/print.css',
  './js/recipe-book.js', './js/seed.js', './js/engine.js', './js/payroll.js', './js/handbook-text.js', './js/phase4.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // leave other sites alone
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});

// BudgetFlow offline support.
// - Pages: network first, falling back to the cached copy when offline, so a
//   new release is picked up on the next online visit.
// - Hashed build assets: cache first (their names change every release).
// Requests to other origins (Firebase, Gemini) are never touched.

const CACHE = 'budgetflow-v4';
const SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('budgetflow-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Drop cached assets that the current page no longer references.
const pruneAssets = async (html) => {
  const wanted = new Set([...html.matchAll(/assets\/[\w.-]+/g)].map((m) => m[0]));
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.map((req) => {
    const m = new URL(req.url).pathname.match(/assets\/[\w.-]+$/);
    return m && !wanted.has(m[0]) ? cache.delete(req) : null;
  }));
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          const cache = await caches.open(CACHE);
          await cache.put('./', copy.clone());
          copy.text().then(pruneAssets).catch(() => {});
        }
        return res;
      } catch {
        return (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.includes('/assets/') || SHELL.some((p) => url.pathname.endsWith(p.replace('./', '/')))) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
  }
});

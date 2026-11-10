// Keeps the talk screen opening when the network is weak or gone, so the
// 108 / 104 call buttons are always reachable. Answers are never cached.
const CACHE = 'jd-shell-v1';
const SHELL = ['/', '/voice.css', '/voice.js', '/voice-i18n.js', '/favicon.svg', '/manifest.webmanifest'];
const WAIT_MS = 4000; // on a slow network, show the saved copy after this long

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (/^\/(api|media|webhooks)\//.test(url.pathname)) return;
  event.respondWith(freshFirst(req));
});

async function freshFirst(req) {
  const cache = await caches.open(CACHE);
  const saved = (await cache.match(req)) || (req.mode === 'navigate' ? await cache.match('/') : undefined);
  const fresh = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  });
  if (!saved) return fresh;
  fresh.catch(() => { /* the saved copy answers instead */ });
  const late = new Promise((resolve) => { setTimeout(() => resolve(saved), WAIT_MS); });
  return Promise.race([fresh.catch(() => saved), late]);
}

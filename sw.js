/* 餘溫 service worker —— 網路優先,確保主畫面版每次都拿到最新程式碼,離線時退回快取 */
const CACHE = "ember-cache-v1";

self.addEventListener("install", (e) => { self.skipWaiting(); });

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith((async () => {
    try {
      const net = await fetch(req);            // 先試網路(拿最新)
      const cache = await caches.open(CACHE);
      cache.put(req, net.clone());             // 順手更新快取
      return net;
    } catch (err) {
      const cached = await caches.match(req);  // 沒網路 → 退回上次快取
      if (cached) return cached;
      throw err;
    }
  })());
});

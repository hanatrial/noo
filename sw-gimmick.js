// Service worker Stok Gimmick Sehat Indah: halaman dicoba dari jaringan dulu, cadangan dari cache. Data (Firestore) selalu langsung ke jaringan.
const C = "gimmick-v1";
const SHELL = ["./stok-gimmick.html", "./manifest-gimmick.webmanifest", "./gimmick-192.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C && k.startsWith("gimmick-")).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

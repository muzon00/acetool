/* 인테리어 견적 설치용 서비스 워커 — 늘 최신 화면을 먼저 받고(네트워크 우선), 인터넷이 끊겼을 때만 마지막으로 받은 화면을 보여줌.
   쇼핑몰 · 클라우드(Firebase) 같은 다른 사이트 요청은 건드리지 않음 */
const CACHE = 'int-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { if (res.ok && !u.search.includes('b=')) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(r, c)); } return res; })
    .catch(() => caches.match(r, { ignoreSearch: true }).then(m => m || caches.match('./index.html'))));
});

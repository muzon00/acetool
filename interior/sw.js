/* 인테리어 견적 설치용 서비스 워커 — 늘 최신 화면을 먼저 받고(네트워크 우선), 인터넷이 끊기거나 4초 넘게 응답이 없으면 마지막으로 받은 화면을 보여줌.
   쇼핑몰 · 클라우드(Firebase) 같은 다른 사이트 요청은 건드리지 않음 */
const CACHE = 'int-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.search.includes('b=')) return;
  /* 브라우저 저장본(최대 10분)을 그냥 쓰지 않고 서버에 바뀌었는지 물어봄 — 안 바뀌었으면 작은 응답만 와서 빠름 */
  const req = r.mode === 'navigate' ? new Request(r.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(r, { cache: 'no-cache' });
  const net = fetch(req).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(ca => ca.put(r, c)); } return res; });
  const cached = () => caches.match(r, { ignoreSearch: true }).then(m => m || (r.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : undefined));
  /* 4초 안에 오면 새 것, 늦으면 저장된 것 먼저 (저장된 게 없으면 계속 기다림) */
  e.respondWith(new Promise(resolve => {
    let done = false; const fin = v => { if (!done && v) { done = true; resolve(v); } };
    const t = setTimeout(() => cached().then(fin), 4000);
    net.then(res => { clearTimeout(t); fin(res); }).catch(() => { clearTimeout(t); cached().then(m => { if (m) fin(m); else { done = true; resolve(Response.error()); } }); });
  }));
});

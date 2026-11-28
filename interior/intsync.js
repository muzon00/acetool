/* 📊 매출 현황 → 🧾 인테리어 견적 연동
   매출 현황에 POS 판매 원본을 올리면, 그 판매 줄로 인테리어 상품 목록(int_db)을 고침:
   ① 재고: 재고 기준 시각 뒤에 팔린 것 빼기 (인테리어 화면과 같은 방식 · 같은 줄은 한 번만)
   ② 판매 건수 · 수량: 상품 목록 기간(baseTo) 다음 날부터 날짜별로 더함 — 같은 날을 다시 올리면 그날 값만 바꿔서 두 번 세지 않음
   ③ 처음 팔린 상품은 목록에 추가 (최근 판매 단가)
   같이 산 상품 · 자주 사는 구성은 긴 기간 판매 파일로 만든 그대로 둠 (하루치로는 흔들림)
   120일 넘은 날짜별 값은 기본 값에 합쳐 목록이 너무 커지지 않게 함 */
window.INTSYNC = (function () {
  'use strict';
  const ymdAdd = (d, n) => { const t = new Date(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100 + n); return t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate(); };
  /* 영업일자 + 영업시간(1830 · 18:30) → 시각(ms) — 인테리어 화면 dtOf와 같음 */
  function dtOf(d, tm) { if (!d) return null; const t = String(tm == null ? '' : tm).replace(/\D/g, ''); if (!t) return null; const v = t.padStart(4, '0'), hh = +v.slice(0, 2), mm = +v.slice(2, 4); if (hh > 23 || mm > 59) return null; return new Date(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100, hh, mm).getTime(); }
  function merge(db, rows) {
    if (!db || !Array.isArray(db.products) || !db.products.length) return { skip: '인테리어 견적에 상품 목록이 아직 없어요 (인테리어 화면에서 긴 기간 판매 파일을 한 번 올려 주세요)' };
    const use = db.interior ? rows.filter(r => /인테리어/.test(r.c1)) : rows;
    if (!use.length) return { skip: '이 파일에 인테리어 상품 판매가 없어요' };
    const out = Object.assign({}, db);
    /* ① 재고 빼기 */
    let nAdd = 0, qAdd = 0;
    if (out.stock && out.stockT) {
      const tx = out.soldTx = Object.assign({}, out.soldTx || {}), d0 = new Date(out.stockT), sd = d0.getFullYear() * 10000 + (d0.getMonth() + 1) * 100 + d0.getDate(), occ = new Map();
      use.forEach(r => { if (!out.stock[r.c]) return; const dt = r.dt != null ? r.dt : dtOf(r.d, r.tm), after = dt != null ? dt >= out.stockT : r.d > sd; if (!after) return;
        const k0 = r.tx + '|' + r.c + '|' + r.q + '|' + r.p, n = (occ.get(k0) || 0) + 1; occ.set(k0, n); const k = k0 + '|' + n; if (!tx[k]) { tx[k] = [r.c, r.q]; nAdd++; qAdd += r.q; } });
    }
    /* ② 판매 건수 · 수량 (날짜별) */
    if (out.baseTo == null) out.baseTo = out.to || 0;
    if (out.baseTxN == null) out.baseTxN = out.txN || 0;
    const inc = out.inc = Object.assign({}, out.inc || {}), P = {};
    out.products = out.products.map(p => { const q = Object.assign({}, p); if (q.k0 == null) { q.k0 = q.k || 0; q.q0 = q.q || 0; } P[q.c] = q; return q; });
    const byDay = {}; let older = 0;
    use.forEach(r => { if (!r.d) return; if (r.d > out.baseTo) (byDay[r.d] = byDay[r.d] || []).push(r); else older++; });
    let newP = 0;
    Object.keys(byDay).forEach(d => {
      const rs = byDay[d], returned = new Set(rs.filter(r => r.org).map(r => r.org)), m = {}, txs = new Set();
      rs.forEach(r => { if (r.q <= 0) return;
        if (!P[r.c]) { const np = { c: r.c, b: r.b, n: r.n, s: r.c3 || r.c2, m: r.c2, p: Math.round(r.p), k: 0, q: 0, k0: 0, q0: 0, nw: +d }; P[r.c] = np; out.products.push(np); newP++; }
        const x = m[r.c] || (m[r.c] = [new Set(), 0]); x[1] += r.q; if (!returned.has(r.tx)) { x[0].add(r.tx); txs.add(r.tx); } });
      const o = { _n: txs.size }; Object.keys(m).forEach(c => { o[c] = [m[c][0].size, Math.round(m[c][1] * 100) / 100]; });
      inc[d] = o;
    });
    /* 120일 넘은 날은 기본 값으로 */
    const days = Object.keys(inc).map(Number).sort((a, b) => a - b), cut = days.length ? ymdAdd(days[days.length - 1], -120) : 0;
    days.filter(d => d < cut).forEach(d => { const o = inc[d]; Object.keys(o).forEach(c => { if (c === '_n') { out.baseTxN += o._n; return; } const p = P[c]; if (p) { p.k0 += o[c][0]; p.q0 = Math.round((p.q0 + o[c][1]) * 100) / 100; } }); delete inc[d]; out.baseTo = Math.max(out.baseTo, d); });
    const sk = {}, sq = {}; let tn = 0;
    Object.values(inc).forEach(o => Object.keys(o).forEach(c => { if (c === '_n') { tn += o._n; return; } sk[c] = (sk[c] || 0) + o[c][0]; sq[c] = (sq[c] || 0) + o[c][1]; }));
    out.products.forEach(p => { p.k = p.k0 + (sk[p.c] || 0); p.q = Math.round((p.q0 + (sq[p.c] || 0)) * 100) / 100; });
    out.txN = out.baseTxN + tn;
    const left = Object.keys(inc).map(Number); out.to = left.length ? Math.max(out.baseTo, ...left) : Math.max(out.to || 0, out.baseTo);
    out.syncAt = Date.now();
    return { db: out, days: Object.keys(byDay).map(Number).sort((a, b) => a - b), older, newP, nAdd, qAdd, rows: use.length };
  }
  /* 재고 파일 (LOC 재고조회 등): 상품코드 + 재고수량(가용재고수량 먼저) · 상품상태 · 입고예정수량 — 인테리어 화면 stockRows와 같음 */
  const hn = v => String(v == null ? '' : v).replace(/\s+/g, '');
  function num(v) { if (typeof v === 'number') return v; const t = String(v == null ? '' : v).replace(/[,\s원₩]/g, ''); if (t === '' || t === '-') return 0; const n = Number(t); return Number.isFinite(n) ? n : NaN; }
  function stockRows(aoa) {
    let h = -1; for (let i = 0; i < Math.min(aoa.length, 30); i++) { const z = (aoa[i] || []).map(hn); if (z.includes('상품코드') && (z.some(x => /재고수량/.test(x)) || z.includes('상품상태'))) { h = i; break; } }
    if (h < 0) return null;
    const z = aoa[h].map(hn), col = (...ns) => { for (const n of ns) { const k = z.indexOf(n); if (k >= 0) return k; } return -1; };
    const qa = z.findIndex(x => /가용재고수량/.test(x));
    const K = { c: col('상품코드'), st: col('상품상태'), q: qa >= 0 ? qa : z.findIndex(x => /재고수량/.test(x)), inb: col('입고예정수량'), n: col('상품명'), s: col('소분류(N)', '소분류'), p: col('상품판매가', '판매가', '판매기준가') };
    const RANK = { '정상': 3, '발주중단': 2, '중단': 1 }, out = {};
    for (let i = h + 1; i < aoa.length; i++) {
      const r = aoa[i] || [], c = String(r[K.c] == null ? '' : r[K.c]).trim(); if (!c) continue;
      const g = k => K[k] >= 0 ? r[K[k]] : '', q = num(g('q')), inb = num(g('inb')), st = String(g('st') || '').trim(), pr = num(g('p'));
      const o = out[c] || (out[c] = { q: 0, st: '', inb: 0, n: String(g('n') || '').trim(), s: String(g('s') || '').trim(), p: 0 });
      if (!Number.isNaN(q)) o.q += q; if (!Number.isNaN(inb) && inb > 0) o.inb += inb;
      if ((RANK[st] || 0) > (RANK[o.st] || 0)) o.st = st; if (!Number.isNaN(pr) && pr > o.p) o.p = Math.round(pr);
    }
    Object.values(out).forEach(o => { o.q = Math.round(o.q * 100) / 100; if (!o.inb) delete o.inb; });
    return Object.keys(out).length ? out : null;
  }
  /* 재고 붙이기: 새 재고로 바꾸고, 재고 기준 시각(파일 받은 시각) 뒤 판매 빼기는 처음부터 다시 */
  function applyStock(db, stock, stockT, names) {
    const out = Object.assign({}, db); out.stock = stock; out.stockAt = names; out.stockT = stockT; out.soldTx = {};
    return { db: out, n: Object.keys(stock).length, have: Object.values(stock).filter(x => x.q > 0).length };
  }
  return { merge, dtOf, stockRows, applyStock };
})();

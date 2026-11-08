/* ☁️ 인테리어 견적 — PC · 태블릿 연동 (Firebase, 매출현황 · 근무표와 같은 프로젝트)
   int_db/meta  : 버전 · 조각 수 · 올린 시각 (다른 기기는 이 문서가 바뀌면 받음)
   int_db/bm_N  : 상품 목록 · 같이 산 상품 · 구성 · 재고 · 전산 바코드 전체를 JSON 글자로 25만 자씩 나눔 (문서 하나 1MB 제한)
   int_cfg/pkg  : 욕실 PKG 목록 · 추가 시공비 · 공급자 정보
   읽기: 등록된 계정(관리자 · 근무표 관리자)으로 로그인한 기기 / 상품 목록 쓰기: 관리자만 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, writeBatch, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const app = initializeApp({ apiKey: 'AIzaSyCIL_n5H8sYTEWb4jhISM5yS_6y_ci5Rnk', authDomain: 'acetool-923f6.firebaseapp.com', projectId: 'acetool-923f6', storageBucket: 'acetool-923f6.firebasestorage.app', messagingSenderId: '961124023870', appId: '1:961124023870:web:8753a14fa706f34255db6f' }, 'int');
const auth = getAuth(app), fs = getFirestore(app);
const C = { user: null, role: null, meta: null, pendingVer: 0, pkgAt: 0 };
window.CLOUD = C;
const emit = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d }));
const say = m => { if (typeof window.toast === 'function') window.toast(m); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
C.canRead = () => !!(C.user && C.role);
C.canWrite = () => C.role === 'admin';
C.logout = () => signOut(auth);

/* 상품 목록 올리기 (관리자): 목록 전체(바코드 · 재고 포함)를 JSON 글자로 만들어 25만 자씩 int_db/bm_0, bm_1 … 에 나눠 담고, meta에는 버전 · 조각 수만 (v2)
   예전(v1: meta.j + 바코드 조각) 자료도 그대로 읽음 */
const CH = 250000;
C.pushDB = async (DB) => {
  if (!C.canWrite()) throw new Error('상품 목록은 관리자 계정으로 로그인해야 올릴 수 있어요');
  const ver = Date.now(), body = Object.assign({}, DB); delete body.ver;
  const j = JSON.stringify(body), chunks = [];
  for (let i = 0; i < j.length; i += CH) chunks.push(j.slice(i, i + CH));
  if (chunks.length > 99) throw new Error('상품 목록이 너무 커요 (' + Math.round(j.length / 1e6) + 'MB)');
  C.pendingVer = ver;
  const oldN = (C.meta && C.meta.bmN) || 0;
  /* 한 번에 보내는 양(10MB) 제한 때문에 조각은 몇 개씩 나눠 보내고, meta는 맨 마지막에 (다른 기기는 meta가 바뀔 때만 받음) */
  for (let i = 0; i < chunks.length; i += 8) { const b = writeBatch(fs); chunks.slice(i, i + 8).forEach((s, k) => b.set(doc(fs, 'int_db', 'bm_' + (i + k)), { j: s, ver })); await b.commit(); }
  const b = writeBatch(fs);
  for (let i = chunks.length; i < oldN; i++) b.delete(doc(fs, 'int_db', 'bm_' + i));
  b.set(doc(fs, 'int_db', 'meta'), { v: 2, ver, bmN: chunks.length, at: serverTimestamp(), by: (C.user && C.user.email) || '' });
  await b.commit();
  return ver;
};
async function pullDB(m) {
  const parts = await Promise.all(Array.from({ length: m.bmN || 0 }, (_, i) => getDoc(doc(fs, 'int_db', 'bm_' + i))));
  for (const p of parts) if (!p.exists()) throw new Error('상품 목록 일부를 받지 못했어요');
  let body;
  if (m.v === 2) { if (parts.some(p => p.data().ver !== m.ver)) throw new Error('상품 목록이 올라가는 중이에요 — 잠시 뒤 다시 받아요'); body = JSON.parse(parts.map(p => p.data().j).join('')); }
  else { body = JSON.parse(m.j); if (m.bmN) { const bm = {}; for (const p of parts) Object.assign(bm, JSON.parse(p.data().j)); body.bm = bm; } }
  body.ver = m.ver; return body;
}
C.pushPkg = async (cfg) => { if (!C.canRead()) return false; const at = Date.now(); C.pkgAt = at; await setDoc(doc(fs, 'int_cfg', 'pkg'), { j: JSON.stringify(cfg), at, by: (C.user && C.user.email) || '' }); return true; };

let unsubs = [];
onAuthStateChanged(auth, async u => {
  unsubs.forEach(f => f()); unsubs = [];
  C.user = u; C.role = null; C.meta = null;
  if (u) { try { const s = await getDoc(doc(fs, 'pos_roles', u.uid)); C.role = s.exists() ? s.data().role : null; } catch (e) { C.role = null; } }
  btn(); emit('cloud-auth', C);
  if (!C.canRead()) return;
  unsubs.push(onSnapshot(doc(fs, 'int_db', 'meta'), async s => {
    if (!s.exists()) { C.meta = null; btn(); emit('cloud-db', null); return; }
    const m = s.data(); C.meta = m; btn();
    if (m.ver === C.pendingVer || (window.dbVer && window.dbVer() === m.ver)) return;
    try { emit('cloud-db', await pullDB(m)); } catch (e) { say('☁️ 상품 목록을 받지 못했어요: ' + (e.message || e)); }
  }, e => say('☁️ 연동 오류: ' + (/permission/i.test(e.code || '') ? '이 계정은 인테리어 자료를 볼 수 없어요 (Firebase 규칙 확인)' : e.message))));
  unsubs.push(onSnapshot(doc(fs, 'int_cfg', 'pkg'), s => { if (!s.exists()) { emit('cloud-pkg', null); return; } const d = s.data(); if (d.at === C.pkgAt) return; try { emit('cloud-pkg', JSON.parse(d.j)); } catch (e) { } }, () => { }));
});

/* 맨 위 ☁️ 버튼 · 로그인 창 */
function btn() {
  const b = document.getElementById('cloudBtn'); if (!b) return;
  b.textContent = !C.user ? '☁️ 로그인 (기기 연동)' : !C.role ? '☁️ 권한 없는 계정' : '☁️ 연동 중' + (C.meta && C.meta.at && C.meta.at.toDate ? ' · ' + C.meta.at.toDate().toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  b.classList.toggle('on', C.canRead());
}
function openLogin() {
  const box = document.createElement('div'); box.className = 'modal';
  const body = C.user ? '<p>로그인한 계정: <b>' + esc(C.user.email) + '</b> (' + (C.role === 'admin' ? '관리자 — 상품 목록 올리기 가능' : C.role ? '보기 · 견적 쓰기' : '<span style="color:#d71920">권한 없음</span>') + ')</p>' +
      (C.meta ? '<p class="muted">클라우드 상품 목록: ' + esc(C.meta.at && C.meta.at.toDate ? C.meta.at.toDate().toLocaleString('ko-KR') : '') + ' · ' + esc(C.meta.by || '') + '</p>' : '<p class="muted">클라우드에 아직 상품 목록이 없어요. 관리자 계정으로 📥 판매 데이터 + PMS를 올리면 모든 기기에 연동돼요.</p>')
    : '<p class="muted" style="margin-top:0">한 번 로그인하면 이 기기에서 계속 유지돼요. 매출현황 · 근무표 관리자 계정으로 로그인하세요.</p><div class="info" style="grid-template-columns:1fr"><div><label>이메일<input type="email" id="clE" autocomplete="username"></label></div><div><label>비밀번호<input type="password" id="clP" autocomplete="current-password"></label></div></div><div id="clM" style="margin-top:8px"></div>';
  box.innerHTML = '<div class="mbox" style="width:min(460px,100%)"><div class="mh"><b>☁️ PC · 태블릿 연동</b><button class="btn sm x" data-cl="x" type="button">닫기 ✕</button></div><div class="mb">' + body + '</div><div class="mf"><span style="margin-left:auto"></span>' +
    (C.user ? '<button class="btn" data-cl="out" type="button">로그아웃</button>' : '<button class="btn pri" data-cl="in" type="button">로그인</button>') + '</div></div>';
  try { const em = localStorage.getItem('int.loginEmail'); if (em && box.querySelector('#clE')) box.querySelector('#clE').value = em; } catch (e) { }
  const go = async () => { const e = box.querySelector('#clE').value.trim(), p = box.querySelector('#clP').value, m = box.querySelector('#clM'); m.textContent = '로그인 중…';
    try { await signInWithEmailAndPassword(auth, e, p); try { localStorage.setItem('int.loginEmail', e); } catch (er) { } box.remove(); say('☁️ 로그인했어요 — 상품 목록을 받는 중'); }
    catch (er) { const c = er.code || ''; m.innerHTML = '<div class="errb">' + (/invalid|wrong|not-found/.test(c) ? '이메일 또는 비밀번호가 틀렸어요' : /too-many/.test(c) ? '시도가 너무 많아요. 잠시 뒤에 해 주세요' : '로그인 실패: ' + esc(er.message)) + '</div>'; } };
  box.addEventListener('click', e => { const b = e.target.closest('[data-cl]'); if (e.target === box || (b && b.dataset.cl === 'x')) box.remove(); else if (b && b.dataset.cl === 'in') go(); else if (b && b.dataset.cl === 'out') { signOut(auth); box.remove(); say('로그아웃했어요 (이 기기의 자료는 남아 있어요)'); } });
  box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'clP') go(); });
  document.body.appendChild(box); const f = box.querySelector('#clE'); if (f) (f.value ? box.querySelector('#clP') : f).focus();
}
document.addEventListener('click', e => { if (e.target.closest('#cloudBtn')) openLogin(); });
btn();

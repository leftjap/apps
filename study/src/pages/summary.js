/**
 * summary.js — 학습 완료 요약 (spec §10).
 *
 * Wave A.8.1: mocks/summary.html 의 인라인 IIFE 를 module 로 이전.
 * DOM 구조는 mocks/summary.html 그대로 — id 기반 textContent 갱신만 담당.
 *
 * 데이터 source: sessionStorage 'studySummary' (JSON).
 *  스키마: { mode, durationSec, newCount, judged:{got,hmm,no}, tryCount, passCount, total, pronAvg?, weakTop3?, returnTo? }
 *  부재 시 fallback (시안 노출 — Wave A.8.2 에서 실 데이터 주입 예정).
 */

const FALLBACK = {
  mode: 'normal',
  durationSec: 18 * 60,
  newCount: 3,
  judged: { got: 6, hmm: 1, no: 1 },
  tryCount: 15,
  passCount: 11,
  total: 8,
  pronAvg: undefined,
  weakTop3: undefined,
  returnTo: 'home',
};

function readSummary() {
  try {
    const raw = sessionStorage.getItem('studySummary');
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return FALLBACK;
    return { ...FALLBACK, ...parsed, judged: { ...FALLBACK.judged, ...(parsed.judged || {}) } };
  } catch {
    return FALLBACK;
  }
}

function pronCls(score) {
  if (score >= 90) return 'sage';
  if (score >= 70) return '';
  if (score >= 50) return 'amber';
  return 'danger';
}

export function mountSummary(host) {
  const data = readSummary();

  const set = (id, val) => { const el = host.querySelector(`#${id}`); if (el) el.textContent = String(val); };

  const mins = Math.max(1, Math.round((Number(data.durationSec) || 0) / 60));
  set('timeVal', mins);
  set('newN', data.newCount);
  set('gotN', data.judged.got);
  set('hmmN', data.judged.hmm);
  set('noN', data.judged.no);
  set('tryN', data.tryCount);
  set('passN', data.passCount);

  // 평균 발음 점수 (spec §10-1).
  // 우선: data.pronAvg → 통과율 fallback. tryCount 0 시 "—".
  const avgEl = host.querySelector('#pronAvg');
  if (avgEl) {
    avgEl.className = 'pron-score';
    if (Number(data.tryCount) === 0) {
      avgEl.textContent = '—';
    } else {
      const avg = (typeof data.pronAvg === 'number')
        ? data.pronAvg
        : Math.round((Number(data.passCount) / Number(data.tryCount)) * 80 + 20);
      avgEl.textContent = String(avg);
      const cls = pronCls(avg);
      if (cls) avgEl.classList.add(cls);
    }
  }

  // 약점 음소 Top 3 (spec §10-1).
  const pronLine = host.querySelector('.pron-line');
  if (pronLine) {
    if (Number(data.tryCount) === 0) {
      pronLine.querySelectorAll('.weak-tag').forEach((t) => t.remove());
    } else if (Array.isArray(data.weakTop3)) {
      pronLine.querySelectorAll('.weak-tag').forEach((t) => t.remove());
      for (const sym of data.weakTop3.slice(0, 3)) {
        const tag = document.createElement('span');
        tag.className = 'weak-tag';
        tag.textContent = sym;
        pronLine.appendChild(tag);
      }
    }
  }

  // CTA — SPA 라우터 hash 사용 (mocks 의 .html link 는 app.js rewriteMockLinks 가 이미 변환).
  const btnDone = host.querySelector('#btnDone');
  if (btnDone) btnDone.addEventListener('click', () => {
    const returnTo = data.returnTo || 'home';
    try {
      sessionStorage.removeItem('studySummary');
      sessionStorage.removeItem('studyReturnTo');
    } catch { /* noop */ }
    if (returnTo === 'stats') window.location.hash = '#/stats';
    else if (returnTo === 'sentList') window.location.hash = '#/stats?tab=sent';
    else window.location.hash = '#/home';
  });
  const btnStats = host.querySelector('#btnStats');
  if (btnStats) btnStats.addEventListener('click', () => { window.location.hash = '#/stats'; });
}

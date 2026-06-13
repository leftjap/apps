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

import { h } from '../components/d1/dom.js';
import { pickSize } from '../components/session/index.js';
import { renderSummaryV2 } from './summaryV2.js';

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

  // 전 사이즈 = C 파이널 v2 요약 (renderSummaryV2 내부 size 분기). 구 mock-fill 미사용(후속 정리).
  renderSummaryV2(host, data); return;

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
  if (btnDone) {
    const rt = data.returnTo || 'home';
    if (rt === 'stats') btnDone.textContent = '확인 · 캘린더로';
    else if (rt === 'sentList') btnDone.textContent = '확인 · 문장 목록으로';
    btnDone.addEventListener('click', () => {
      try {
        sessionStorage.removeItem('studySummary');
        sessionStorage.removeItem('studyReturnTo');
      } catch { /* noop */ }
      if (rt === 'stats') window.location.hash = '#/stats';
      else if (rt === 'sentList') window.location.hash = '#/stats?tab=sent';
      else window.location.hash = '#/home';
    });
  }
  const btnStats = host.querySelector('#btnStats');
  if (btnStats) btnStats.addEventListener('click', () => { window.location.hash = '#/stats'; });

  // Wave A.14 — 정규 review 완료 시 "자유 복습" CTA. mode='free' 자체는 이미 자유복습이라 표시 X.
  // returnTo 가 stats/sentList 면 (이미 stats 에서 진입) 자유복습 권유 어색 → home 일 때만 표시.
  const isHomeReturn = !data.returnTo || data.returnTo === 'home';
  if (data.mode === 'review' && Number(data.total) > 0 && isHomeReturn) {
    mountFreeReviewCta(host).catch((e) => console.error('[summary] free cta', e));
  }
}

async function mountFreeReviewCta(host) {
  const db = window.studyDB;
  if (!db?.reviewQueue) return;
  const lang = sessionStorage.getItem('studyLang') === 'ja' ? 'ja' : 'en';
  const rows = await db.reviewQueue.where('lang').equals(lang).toArray();
  if (!Array.isArray(rows) || rows.length === 0) return;

  const anchor = host.querySelector('#btnDone') || host.querySelector('#btnStats');
  if (!anchor) return;
  if (host.querySelector('#btnFreeReview')) return;

  const btn = document.createElement('button');
  btn.id = 'btnFreeReview';
  btn.type = 'button';
  btn.textContent = `자유 복습 (${rows.length}장 사용 가능)`;
  btn.style.cssText = 'display:block;margin:12px auto 0;padding:14px 28px;background:none;border:1px solid var(--sage);border-radius:var(--r-md);color:var(--sage);font-family:var(--font-display);font-size:14px;font-weight:600;cursor:pointer;';
  btn.addEventListener('click', () => {
    try { sessionStorage.removeItem('studySummary'); } catch { /* noop */ }
    window.location.hash = '#/session-review?mode=free';
  });
  anchor.parentElement?.insertBefore(btn, anchor.nextSibling);
}

/* ────────── D1 desktop — ⑥ 학습 완료 요약 ──────────
 * 중앙 760 집중형. 배지 → 지표 3분할 → 기억 판정 3칩 → 약점 음소 → 확인/자유복습.
 * subject/scene/date 는 summary 데이터에 없어 mode 기반 부제로 graceful 처리. phone/tablet 미변경.
 */
function renderD1Summary(host, data) {
  host.innerHTML = '';
  const mins = Math.max(1, Math.round((Number(data.durationSec) || 0) / 60));
  const tryN = Number(data.tryCount) || 0;
  let avgText = '—', avgColor = 'var(--ink)';
  if (tryN > 0) {
    const avg = (typeof data.pronAvg === 'number') ? data.pronAvg : Math.round((Number(data.passCount) / tryN) * 80 + 20);
    avgText = String(avg);
    const cls = pronCls(avg);
    avgColor = cls === 'sage' ? 'var(--sage)' : cls === 'amber' ? 'var(--amber)' : cls === 'danger' ? 'var(--danger)' : 'var(--ink)';
  }

  const unit = (u) => h('span', { style: 'font-size:18px;color:var(--mut);font-weight:700;' }, u);
  const metric = (label, valueNode) => h('div', { class: 'd1-metric' }, h('div', { class: 'ml' }, label), h('div', { class: 'mv' }, valueNode));
  const divider = () => h('div', { style: 'width:1px;height:56px;background:var(--line);' });

  const judges = [
    { n: data.judged.got, l: '완벽', c: 'var(--sage)', bg: 'var(--sage-bg)' },
    { n: data.judged.hmm, l: '애매', c: 'var(--ink)', bc: 'var(--faint)', bg: '#fff' },
    { n: data.judged.no, l: '다시', c: 'var(--terra)', bg: '#fff' },
  ];
  const weak = Array.isArray(data.weakTop3) ? data.weakTop3.slice(0, 3) : [];
  const subtitle = data.mode === 'review' ? '복습 완료' : '신규 학습 완료';

  const rt = data.returnTo || 'home';
  const doneLabel = rt === 'stats' ? '확인 · 캘린더로' : rt === 'sentList' ? '확인 · 문장 목록으로' : '확인';
  const goDone = () => {
    try { sessionStorage.removeItem('studySummary'); sessionStorage.removeItem('studyReturnTo'); } catch { /* noop */ }
    if (rt === 'stats') window.location.hash = '#/stats';
    else if (rt === 'sentList') window.location.hash = '#/stats?tab=sent';
    else window.location.hash = '#/home';
  };
  const ctaRow = h('div', { style: 'display:flex;gap:12px;justify-content:center;margin-top:40px;' },
    h('button', { class: 'd1-btn d1-btn--primary lg', style: 'min-width:150px;', onClick: goDone }, doneLabel));

  const col = h('div', { style: 'max-width:760px;margin:0 auto;padding:60px 40px 52px;width:100%;' },
    h('div', { class: 'd1-badge' }, '✓'),
    h('div', { class: 'd1-eyebrow', style: 'text-align:center;color:var(--faint);letter-spacing:.06em;margin-top:22px;' }, '학습 완료'),
    h('h1', { class: 'd1-h1', style: 'text-align:center;margin-top:12px;' }, '오늘 분량, 끝까지 해냈어요'),
    h('div', { style: 'text-align:center;font-size:15.5px;color:var(--mut);margin-top:14px;' }, subtitle),
    h('div', { style: 'display:flex;align-items:center;margin-top:42px;border:1px solid var(--line);border-radius:18px;padding:26px 0;' },
      metric('학습 시간', h('span', {}, String(mins), unit('분'))),
      divider(),
      metric('새 표현', h('span', {}, String(data.newCount), unit('개'))),
      divider(),
      metric('평균 발음', h('span', { style: 'color:' + avgColor + ';' }, avgText)),
    ),
    h('div', { class: 'd1-panel-lab', style: 'margin-top:34px;margin-bottom:12px;' }, '오늘의 기억 판정'),
    h('div', { style: 'display:flex;gap:12px;' }, judges.map((x) => h('div', { class: 'd1-rchip', style: 'border-color:' + (x.bc || x.c) + ';background:' + x.bg + ';' },
      h('span', { class: 'rn', style: 'color:' + x.c + ';' }, String(x.n)),
      h('span', { class: 'rl', style: 'color:' + x.c + ';' }, x.l)))),
    weak.length ? h('div', { class: 'd1-panel-lab', style: 'margin-top:30px;margin-bottom:12px;' }, '더 연습할 발음') : null,
    weak.length ? h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;' }, weak.map((w) => h('span', { class: 'd1-tag' }, w))) : null,
    ctaRow,
  );

  host.appendChild(h('div', { class: 'd1-root', style: 'display:block;min-height:100vh;min-height:100dvh;' }, col));

  // 자유 복습 CTA — 정규 review 완료 + reviewQueue 有 + home 복귀 시.
  const isHomeReturn = !data.returnTo || data.returnTo === 'home';
  if (data.mode === 'review' && Number(data.total) > 0 && isHomeReturn) {
    (async () => {
      const db = window.studyDB;
      if (!db?.reviewQueue) return;
      const lang = sessionStorage.getItem('studyLang') === 'ja' ? 'ja' : 'en';
      const rows = await db.reviewQueue.where('lang').equals(lang).toArray();
      if (!Array.isArray(rows) || rows.length === 0) return;
      ctaRow.appendChild(h('button', { class: 'd1-btn d1-btn--sage lg', onClick: () => { try { sessionStorage.removeItem('studySummary'); } catch { /* noop */ } window.location.hash = '#/session-review?mode=free'; } }, '자유 복습 ' + rows.length + '장'));
    })().catch((e) => console.error('[summary d1] free cta', e));
  }
}

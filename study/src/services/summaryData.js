/**
 * summaryData.js — session 종료 시 studySummary sessionStorage payload 빌드 (spec §10).
 *
 * Wave A.8.2 — session-new / session-review 의 endSession 이 사용.
 * 순수 함수 — DOM/IO 무관, state snapshot 만 입력.
 */

export function buildSummaryData({ mode, state, durationSec, completedNewCount, completedReviewCount, returnTo = 'home' } = {}) {
  const tryCount = Number(state?.tried) || 0;
  const passCount = Number(state?.passed) || 0;
  const judged = (state?.judged && typeof state.judged === 'object')
    ? { got: Number(state.judged.got) || 0, hmm: Number(state.judged.hmm) || 0, no: Number(state.judged.no) || 0 }
    : { got: 0, hmm: 0, no: 0 };

  const newCount = mode === 'new' ? (Number(completedNewCount) || 0) : 0;
  const total = mode === 'new' ? newCount : (Number(completedReviewCount) || 0);

  const scores = Array.isArray(state?.pronScores) ? state.pronScores.filter((n) => Number.isFinite(n)) : [];
  const pronAvg = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : undefined;

  const weakCounter = (state?.weakInSession && typeof state.weakInSession === 'object') ? state.weakInSession : {};
  const weakTop3 = Object.entries(weakCounter)
    .filter(([, c]) => Number(c) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 3)
    .map(([sym]) => sym);

  // 음성복습 프롬프트용 타깃 표현 — scene 제외, explanation.key 의 '=' 앞 청크(없으면 sentence).
  const cards = Array.isArray(state?.cards) ? state.cards : [];
  const exprs = [...new Set(cards
    .filter((c) => c && !(c.explanation && Array.isArray(c.explanation.dialogue)))
    .map((c) => {
      const left = String(c.explanation?.key ?? '').split('=')[0].trim();
      return left || c.sentence || '';
    })
    .filter(Boolean))];

  return { mode, durationSec: Number(durationSec) || 0, newCount, judged, tryCount, passCount, total, pronAvg, weakTop3, exprs, returnTo };
}

export function persistSummary(payload) {
  try {
    sessionStorage.setItem('studySummary', JSON.stringify(payload));
  } catch (e) {
    console.error('[summaryData] persist 실패', e);
  }
}

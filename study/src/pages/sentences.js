/* 문장 모아보기 — 지금까지 공부한 기본 문장을 한 화면에 (2026-07-18 사용자 요청).
 * 좌측 한글 해석 / 우측 영문(기본 가림). '정답 보기'로 그 문장만 토글 공개하고,
 * 옆 버튼을 눌러야 복습 세션으로 넘어간다 — 넘어가지 않고 영문만 확인하는 게 기본 동선.
 *
 * 데이터: reviewQueue(현재 과목). 실측(2026-07-18) 현 트랙 en 54장으로 todayLessons 와 완전 일치한다.
 *   구 트랙 80장은 schema v6 트랙 전환("복습도 기존 전부 없애고 #1부터", 사용자 지시)에서 삭제돼
 *   문장 텍스트 자체가 없다 → 복원 불가하며 복원 대상도 아니다.
 *   한계: SRS 졸업(60일 통과)한 문장은 reviewQueue 에서 제거되므로 이 목록에서도 사라진다
 *   (현재 졸업 임박 0건이라 무영향. 졸업분까지 남기려면 별도 보관 테이블이 필요하다).
 *
 * 복습 진입 규약은 stats.goReview 와 동일 — sessionStorage.studyReviewQueue + '#/session-review?lang='.
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';

function getLang() { try { const v = sessionStorage.getItem('studyLang'); return v === 'ja' ? 'ja' : 'en'; } catch { return 'en'; } }
function ttsLangOf(l) { return l === 'ja' ? 'ja-JP' : 'en-US'; }

const VL_CSS = `
.vl{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.vl *{box-sizing:border-box;margin:0}
.vl-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.vl-top-in{width:100%;max-width:1064px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.vl-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0;cursor:pointer;font-family:inherit}
.vl-wrap{width:100%;max-width:1064px;margin:0 auto;padding:26px 20px 48px}
.vl-hd{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.vl-h1{font-family:Outfit;font-size:26px;font-weight:700;letter-spacing:-0.02em}
.vl-cnt{font-family:Outfit;font-size:13px;font-weight:600;color:var(--faint)}
.vl-hint{margin-top:8px;font-size:12.5px;color:var(--mut)}
.vl-list{margin-top:20px;border-top:1px solid var(--line)}
.vl-row{display:flex;align-items:center;gap:16px;padding:15px 4px;border-bottom:1px solid var(--line)}
.vl-row .ko{flex:1 1 38%;min-width:0;font-size:15px;color:var(--ink);line-height:1.5}
.vl-row .en{flex:1 1 46%;min-width:0;font-size:15.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.45;transition:filter .18s ease}
/* 가림 — 블러. 문장 길이는 남겨 회상 단서가 되게 하고, 선택/복사는 막는다. */
.vl-row .en.masked{filter:blur(6px);user-select:none;-webkit-user-select:none;color:var(--mut)}
.vl-acts{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.vl-reveal{font:inherit;font-size:12.5px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border:0;border-radius:999px;padding:8px 14px;cursor:pointer;white-space:nowrap;min-height:36px}
.vl-reveal.on{background:#efebde;color:var(--mut)}
.vl-cir{width:36px;height:36px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;padding:0}
.vl-go{width:auto;padding:0 14px;border-radius:999px;gap:6px;display:inline-flex;align-items:center;font:inherit;font-size:12.5px;font-weight:700;color:var(--coral-deep);background:var(--coral-soft);border:0;min-height:36px;cursor:pointer;white-space:nowrap}
.vl-empty{margin-top:40px;text-align:center;color:var(--faint);font-size:14px}
@media (max-width:720px){
  .vl-wrap{padding:20px 16px 40px}
  .vl-row{flex-wrap:wrap;gap:8px 12px;padding:14px 2px}
  .vl-row .ko{flex:1 1 100%;font-size:14px;color:var(--mut)}
  .vl-row .en{flex:1 1 100%;font-size:15px}
  .vl-acts{flex:1 1 100%;justify-content:flex-end}
}
`;

/* reviewQueue + sessionLogs → 표시용 행 목록. 학습일(최신) 내림차순, 학습일 없는 카드는 뒤로. */
export function buildSentenceRows(cards, logs) {
  const lastBy = {};
  for (const l of logs ?? []) {
    for (const id of [...(l?.sentenceIds ?? []), ...(l?.newSentenceIds ?? [])]) {
      if (!lastBy[id] || (l.date ?? '') > lastBy[id]) lastBy[id] = l.date ?? '';
    }
  }
  return (cards ?? []).map((c) => ({
    id: c.id,
    en: c.sentence ?? '',
    ko: c.meaning || c.ko || '',
    _iso: lastBy[c.id] || (c.createdAt ? String(c.createdAt).slice(0, 10) : ''),
  })).sort((a, b) => (b._iso || '').localeCompare(a._iso || ''));
}

/* 복습 진입 — stats.goReview 와 동일 규약 (session-review.js 가 studyReviewQueue 를 우선 사용). */
function goReviewOne(row, lang) {
  try {
    sessionStorage.setItem('studyReviewQueue', JSON.stringify([row]));
    sessionStorage.setItem('studyReturnTo', 'sentences');
  } catch { /* noop */ }
  window.location.hash = `#/session-review?lang=${lang}`;
}

export function mountSentences(host) {
  ensureV2Fonts();
  const lang = getLang();
  const root = h('div', { class: 'vl' }, v2Style(VL_CSS));
  const listEl = h('div', { class: 'vl-list' });
  const cntEl = h('span', { class: 'vl-cnt' }, '');

  root.append(
    h('div', { class: 'vl-top' }, h('div', { class: 'vl-top-in' },
      h('button', { class: 'vl-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } },
        vIcon(VI.HOME, { size: 15 }), '홈으로'),
      h('span', { class: 'vl-cnt' }, lang === 'ja' ? '일본어' : '영어'))),
    h('div', { class: 'vl-wrap' },
      h('div', { class: 'vl-hd' }, h('h1', { class: 'vl-h1' }, '문장 모아보기'), cntEl),
      h('div', { class: 'vl-hint' }, '한글을 보고 영어를 떠올려 보세요 — 정답 보기를 누르면 문장이 드러나요'),
      listEl),
  );
  host.appendChild(root);

  (async () => {
    let rows = [];
    try {
      const db = window.studyDB;
      const cards = await db.reviewQueue.where('lang').equals(lang).toArray();
      let logs = [];
      try { logs = await db.sessionLogs.where('lang').equals(lang).toArray(); } catch { /* 로그 없으면 정렬만 약해짐 */ }
      rows = buildSentenceRows(cards, logs);
    } catch (e) {
      console.error('[sentences] load', e);
    }

    if (!rows.length) {
      listEl.replaceWith(h('div', { class: 'vl-empty' }, '아직 공부한 문장이 없어요'));
      return;
    }
    cntEl.textContent = `${rows.length}문장`;
    for (const r of rows) {
      const enEl = h('div', { class: 'en masked' }, r.en);
      const revealBtn = h('button', { class: 'vl-reveal', type: 'button' }, '정답 보기');
      revealBtn.addEventListener('click', () => {
        const masked = enEl.classList.toggle('masked');
        revealBtn.textContent = masked ? '정답 보기' : '가리기';
        revealBtn.classList.toggle('on', !masked);
      });
      listEl.appendChild(h('div', { class: 'vl-row' },
        h('div', { class: 'ko' }, r.ko),
        enEl,
        h('div', { class: 'vl-acts' },
          revealBtn,
          h('button', {
            class: 'vl-cir', type: 'button', 'aria-label': '듣기',
            onClick: () => { if (r.en && window.studySpeech?.speak) window.studySpeech.speak(r.en, { lang: ttsLangOf(lang) }); },
          }, vIcon(VI.PLAY, { size: 11, fill: true })),
          h('button', { class: 'vl-go', type: 'button', onClick: () => goReviewOne(r, lang) },
            vIcon(VI.MIC, { size: 12, sw: 2 }), '복습'),
        ),
      ));
    }
  })();

  return () => { host.innerHTML = ''; };
}

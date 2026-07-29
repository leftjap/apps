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
import { speakWithFeedback } from '../components/session/atoms.js';
import { firstWordsHint } from '../components/session/applied.js';
import { localISODate } from '../utils/today.js';

/* 난이도 칩 — 복습 세션 판정(got/hmm/no)과 같은 체계·같은 순서(쉬움→보통→어려움) 표기.
 * 저장은 reviewQueue 정본 형식(O/△/X). 목록 정렬은 어려움(X)이 위, 쉬움(O)이 아래. */
const LEVELS = [
  { level: 'O', label: '쉬움' },
  { level: '△', label: '보통' },
  { level: 'X', label: '어려움' },
];

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
.vl-row .ko{flex:1 1 26%;min-width:0;font-size:15px;color:var(--ink);line-height:1.5}
.vl-row .en{flex:1 1 30%;min-width:0;font-size:15.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.45;transition:filter .18s ease}
/* 난이도 평가 — 세그먼트 컨트롤 하나로 묶는다 (버튼 3개가 아니라 컨트롤 1개로 읽히게, 2026-07-24 위계 재설계) */
.vl-levels{display:inline-flex;flex:0 0 auto;border:1.5px solid var(--line);border-radius:999px;overflow:hidden}
.vl-lv{font:inherit;font-size:11.5px;font-weight:700;color:var(--faint);background:transparent;border:0;border-left:1px solid var(--line);padding:6px 12px;cursor:pointer;white-space:nowrap;min-height:32px}
.vl-lv:first-child{border-left:0}
.vl-lv[data-level="X"].on{background:var(--coral-soft);color:var(--coral-deep)}
.vl-lv[data-level="△"].on{background:#f6efdc;color:#8a6d1f}
.vl-lv[data-level="O"].on{background:var(--teal-soft);color:var(--teal-deep)}
/* 가림 — 블러. 문장 길이는 남겨 회상 단서가 되게 하고, 선택/복사는 막는다. */
.vl-row .en.masked{filter:blur(6px);user-select:none;-webkit-user-select:none;color:var(--mut)}
.vl-acts{display:flex;align-items:center;gap:8px;flex:0 0 auto}
/* 정답 = 1차 액션(솔리드) — 이 페이지의 핵심 행동. 공개 중(.on)엔 소진 표시. */
.vl-reveal{font:inherit;font-size:12.5px;font-weight:700;color:#fff;background:var(--teal);border:0;border-radius:999px;padding:8px 16px;cursor:pointer;white-space:nowrap;min-height:36px}
.vl-reveal.on{background:#efebde;color:var(--mut)}
/* 힌트 — 정답 전 단계 (핵심 표현만). 누르면 ko 아래에 표현이 떠오르고 버튼은 소진 표시. */
.vl-hintb{font:inherit;font-size:12.5px;font-weight:700;color:var(--mut);background:transparent;border:1.5px solid var(--line);border-radius:999px;padding:8px 14px;cursor:pointer;white-space:nowrap;min-height:36px}
.vl-hintb.on{border-color:transparent;background:#efebde;color:var(--faint)}
.vl-hintline{margin-top:5px;font-size:12.5px;font-weight:700;color:var(--teal-deep)}
/* 오늘 N문장 라운드 — 상단 진행 스트립 + 목표 행 '오늘' 칩 */
.vl-round{margin-top:18px;display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px}
.vl-round .t{font-family:Outfit;font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--mut);white-space:nowrap}
.vl-round .n{font-family:Outfit;font-size:13px;font-weight:700;color:var(--teal-deep);white-space:nowrap}
.vl-round .bar{flex:1;height:5px;border-radius:3px;background:#e7e3d4;overflow:hidden}
.vl-round .bar i{display:block;height:100%;background:var(--teal);border-radius:3px;transition:width .25s ease}
.vl-round .fin{font-size:12.5px;font-weight:800;color:var(--teal-deep);white-space:nowrap}
.vl-todaychip{display:inline-block;margin-left:8px;vertical-align:2px;font-family:Outfit;font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:2px 7px}
.vl-cir{position:relative;width:36px;height:36px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;padding:0}
.vl-cir.eqq{border-color:var(--blue-line);color:var(--blue)}
.vl-cir.playing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
/* 복습 = 부가(고스트) — 화면 이동 액션이라 코랄·마이크를 쓰지 않는다(코랄=녹음 규약) */
.vl-go{width:auto;padding:0 10px;display:inline-flex;align-items:center;font:inherit;font-size:12.5px;font-weight:600;color:var(--faint);background:none;border:0;min-height:36px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.vl-go:hover{color:var(--teal-deep);text-decoration:underline}
.vl-empty{margin-top:40px;text-align:center;color:var(--faint);font-size:14px}
@media (max-width:720px){
  .vl-wrap{padding:20px 16px 40px}
  .vl-row{flex-wrap:wrap;gap:8px 10px;padding:14px 2px}
  .vl-row .ko{flex:1 1 100%;font-size:14.5px;color:var(--ink);font-weight:600}
  .vl-row .en{order:9;flex:1 1 100%;font-size:15px}   /* 가려진 영문은 항상 마지막 줄 */
  .vl-levels{order:6;flex:1 1 100%;display:flex}
  .vl-lv{flex:1 1 0;padding:6px 4px;text-align:center}
  .vl-acts{flex:1 1 auto}
  .vl-go{margin-left:auto}
}
`;

/* 난이도(lastResult) 정렬 우선순위 — 사용자 지시: "어렵다고 한 게 맨 위, 쉽다고 한 건 맨 밑".
 * 미평가는 중립이라 보통과 쉬움 사이에 둔다(명시적으로 '쉬움'인 것만 확실히 아래로 민다). */
const LEVEL_RANK = { X: 0, '△': 1, O: 3 };
const rankOf = (lv) => (LEVEL_RANK[lv] ?? 2);

/* 정렬 비교자 — **오늘 평가 완료가 최우선으로 가라앉는다** → 난이도(어려움→보통→미평가→쉬움)
 * → 최근 발음 점수 낮은 순 → 학습일 최신순.
 * 오늘-완료 가라앉힘(2026-07-28 사용자 보고): 구 규칙은 맨 위 문장을 어려움으로 평가하면
 * 어려움-우선 정렬이 그 문장을 1위에 재고정해 "계속 뜸" — 보통 이하로 눌러야만 다음 문장이
 * 나오는 강요가 됐다. 평가한 문장은 그날은 아래로 빠지고(라운드 '완료'와 같은 의미), 날이
 * 바뀌면 어려움 우선이 복원된다. 오늘-완료 그룹 안에서도 난이도순은 유지.
 * 점수 없는 문장은 같은 난이도의 점수 있는 문장 뒤(정보 없음 → 우선 연습 대상 아님).
 * 최초 렌더와 평가 직후 재배치가 같은 규칙을 쓰도록 한 곳에 둔다. */
export function compareSentenceRows(a, b) {
  const dt = (a._doneToday ? 1 : 0) - (b._doneToday ? 1 : 0);
  if (dt !== 0) return dt;
  const d = rankOf(a.level) - rankOf(b.level);
  if (d !== 0) return d;
  const sa = a.score ?? Infinity;
  const sb = b.score ?? Infinity;
  if (sa !== sb) return sa - sb;
  return (b._iso || '').localeCompare(a._iso || '');
}

/* 힌트 사다리 (2026-07-24 사용자 승인) — 통문장 회상과 정답 공개 사이의 디딤돌.
 * en: 해설 key 의 표현부('=' 앞)가 힌트. 단 실측(실계정 80장) 31%는 표현부 == 문장 전체라
 * 그대로 보여주면 정답 공개가 됨 → 첫 1~2단어 폴백. key 없어도 폴백. ja 는 key 자체가
 * 없어(0/26) 힌트 미제공(null → 버튼 미표시). */
const normHint = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
export function sentenceHint(card) {
  if (!card || card.lang === 'ja') return null;
  const sentence = card.sentence ?? '';
  if (!sentence) return null;
  const chunk = String(card.explanation?.key ?? '').split('=')[0].trim();
  if (chunk && normHint(chunk) !== normHint(sentence)) return chunk;
  return firstWordsHint(sentence);
}

/* 오늘 N문장 미니 라운드 (2026-07-24 사용자 승인) — 정렬 상위 10개(어려움·저득점 우선)가
 * 오늘의 목표. 평가(라운드 완료)가 곧 진행. 같은 날 재방문 시 목표를 고정 복원한다 —
 * 평가로 순위가 바뀌어도 목표가 흔들리면 완료감이 사라지기 때문. 날짜가 바뀌면 새 상위 10개. */
export function pickTodayRound(rows, saved, todayISO) {
  const alive = new Set((rows ?? []).map((r) => r.id));
  if (saved && saved.date === todayISO) {
    const ids = (saved.ids ?? []).filter((id) => alive.has(id));
    if (ids.length) return { date: todayISO, ids, done: (saved.done ?? []).filter((id) => ids.includes(id)) };
  }
  return { date: todayISO, ids: (rows ?? []).slice(0, 10).map((r) => r.id), done: [] };
}

/* reviewQueue + sessionLogs + pronunciationLog → 표시용 행 목록. 정렬은 compareSentenceRows.
 * todayISO — lastResultAt(평가 시각, 로컬 전용 필드)이 오늘이면 _doneToday 로 가라앉힌다. */
export function buildSentenceRows(cards, logs, pronLogs, todayISO) {
  const lastBy = {};
  for (const l of logs ?? []) {
    for (const id of [...(l?.sentenceIds ?? []), ...(l?.newSentenceIds ?? [])]) {
      if (!lastBy[id] || (l.date ?? '') > lastBy[id]) lastBy[id] = l.date ?? '';
    }
  }
  // 문장별 최근 발음 점수 — 최근 날짜 기록이 정본 (오늘 실력에 가장 가까움)
  const scoreBy = {};
  for (const p of pronLogs ?? []) {
    if (!p?.sentenceId) continue;
    const cur = scoreBy[p.sentenceId];
    if (!cur || (p.date ?? '') > cur.date) scoreBy[p.sentenceId] = { date: p.date ?? '', score: Number(p.overallScore) || 0 };
  }
  return (cards ?? []).map((c) => ({
    id: c.id,
    en: c.sentence ?? '',
    ko: c.meaning || c.ko || '',
    level: c.lastResult ?? null,
    score: scoreBy[c.id]?.score ?? null,
    hint: sentenceHint(c),
    _iso: lastBy[c.id] || (c.createdAt ? String(c.createdAt).slice(0, 10) : ''),
    _doneToday: !!todayISO && String(c.lastResultAt ?? '').slice(0, 10) === todayISO,
  })).sort(compareSentenceRows);
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
      let pron = [];
      try { pron = await db.pronunciationLog.where('lang').equals(lang).toArray(); } catch { /* 점수 없으면 정렬만 약해짐 */ }
      rows = buildSentenceRows(cards, logs, pron, localISODate());
    } catch (e) {
      console.error('[sentences] load', e);
    }

    if (!rows.length) {
      listEl.replaceWith(h('div', { class: 'vl-empty' }, '아직 공부한 문장이 없어요'));
      return;
    }
    cntEl.textContent = `${rows.length}문장`;
    const rowEls = new Map(); // id → 행 엘리먼트 (평가 직후 제자리 이동용)

    // ── 오늘 N문장 라운드 — 정렬 상위 10개 고정 목표 + 평가 진행 카운트 (localStorage 하루 유지)
    const roundKey = `studySentRound:${lang}`;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(roundKey) || 'null'); } catch { /* 손상 시 새로 */ }
    const round = pickTodayRound(rows, saved, localISODate());
    const saveRound = () => { try { localStorage.setItem(roundKey, JSON.stringify(round)); } catch { /* noop */ } };
    saveRound();
    const roundSet = new Set(round.ids);
    const doneEl = h('b', {}, String(round.done.length));
    const barFill = h('i', { style: `width:${round.ids.length ? (round.done.length / round.ids.length) * 100 : 0}%;` });
    const finEl = h('span', { class: 'fin', style: round.done.length >= round.ids.length ? '' : 'display:none;' }, '완료 ✓');
    const roundEl = h('div', { class: 'vl-round' },
      h('span', { class: 't' }, `오늘 ${round.ids.length}문장`),
      h('div', { class: 'bar' }, barFill),
      h('span', { class: 'n' }, doneEl, ` / ${round.ids.length}`),
      finEl);
    listEl.before(roundEl);
    const bumpRound = (id) => {
      if (!roundSet.has(id) || round.done.includes(id)) return;
      round.done.push(id);
      saveRound();
      doneEl.textContent = String(round.done.length);
      barFill.style.width = `${(round.done.length / round.ids.length) * 100}%`;
      if (round.done.length >= round.ids.length) finEl.style.display = '';
    };

    /* 평가 즉시 정렬 위치로 옮긴다 (사용자 지시: "쉬움 클릭하면 맨 밑으로").
     * 전체 재렌더가 아니라 그 행만 insertBefore — 다른 행의 정답 공개 상태가 유지된다. */
    const reposition = (r) => {
      const sorted = [...rows].sort(compareSentenceRows);
      const idx = sorted.indexOf(r);
      const after = sorted[idx + 1];
      listEl.insertBefore(rowEls.get(r.id), after ? rowEls.get(after.id) : null);
    };

    for (const r of rows) {
      const enEl = h('div', { class: 'en masked' }, r.en);
      const revealBtn = h('button', { class: 'vl-reveal', type: 'button' }, '정답');
      revealBtn.addEventListener('click', () => {
        const masked = enEl.classList.toggle('masked');
        revealBtn.textContent = masked ? '정답' : '가림';
        revealBtn.classList.toggle('on', !masked);
      });

      // 힌트 사다리 — 정답 전에 핵심 표현만 (sentenceHint. ja 등 소스 없으면 버튼 미표시)
      const hintLine = h('div', { class: 'vl-hintline', style: 'display:none;' }, '');
      const hintBtn = r.hint ? h('button', { class: 'vl-hintb', type: 'button' }, '힌트') : null;
      hintBtn?.addEventListener('click', () => {
        hintLine.textContent = `힌트 · ${r.hint}`;
        hintLine.style.display = '';
        hintBtn.classList.add('on');
      });
      const hideHint = () => { hintLine.style.display = 'none'; hintBtn?.classList.remove('on'); };

      // 난이도 평가 — 복습 세션과 같은 판정(어려움 X / 보통 △ / 쉬움 O).
      // SRS 간격은 건드리지 않는다(발화 없이 눈으로만 훑는 화면이라 복습일을 밀면 학습 손상).
      // 재생 버튼 — 재생 중 이퀄라이저 + 블루 펄스 (2026-07-22 사용자 보고: 피드백 없음)
      const playBtn = h('button', { class: 'vl-cir', type: 'button', 'aria-label': '재생' }, vIcon(VI.PLAY, { size: 11, fill: true }));
      playBtn.addEventListener('click', () => speakWithFeedback(playBtn, r.en, { lang: ttsLangOf(lang) }));

      /* 칩은 '이번 라운드 입력'이다 (2026-07-24 사용자 지시) — 저장된 평가는 위치로만 반영하고
       * 켜둔 채 남기지 않는다. 평가 클릭 = 라운드 완료: 즉시 재배치 + 잠깐의 피드백 뒤
       * 정답을 다시 가리고 칩을 끈다 → 목록이 다음 라운드 대기 상태로 돌아간다. */
      const levels = h('div', { class: 'vl-levels' });
      let resetTimer = null;
      const levelBtns = LEVELS.map(({ level, label }) => {
        const b = h('button', { class: 'vl-lv', type: 'button', 'data-level': level }, label);
        b.addEventListener('click', async () => {
          levelBtns.forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          r.level = level;
          r._doneToday = true; // 오늘 평가 완료 — 난이도 불문 미평가 아래로 (2026-07-28)
          reposition(r); // 평가 즉시 제 위치로 — 오늘-완료 그룹으로 가라앉음
          bumpRound(r.id); // 오늘 라운드 진행 (목표 문장 + 첫 평가만)
          clearTimeout(resetTimer);
          resetTimer = setTimeout(() => { // 라운드 완료 리셋 — 피드백이 보일 만큼만 켰다 끈다
            levelBtns.forEach((x) => x.classList.remove('on'));
            hideHint();
            if (!enEl.classList.contains('masked')) {
              enEl.classList.add('masked');
              revealBtn.textContent = '정답';
              revealBtn.classList.remove('on');
            }
          }, 600);
          try { await window.studyDB?.reviewQueue?.update(r.id, { lastResult: level, lastResultAt: new Date().toISOString() }); }
          catch (e) { console.error('[sentences] level save', e); }
        });
        levels.appendChild(b);
        return b;
      });

      /* 위계 재배치 (2026-07-24 사용자 지적 "버튼에 시각적 위계·구분이 없음") —
       * 배치가 흐름을 따른다: 떠올리기(ko) → 힌트/정답/듣기(액션) → 평가(세그먼트) → 복습(부가).
       * 복습은 화면 이동이라 마이크 아이콘 금지 — 코랄=녹음 규약은 실제 녹음 CTA 전용. */
      const rowEl = h('div', { class: 'vl-row' },
        h('div', { class: 'ko' }, r.ko,
          roundSet.has(r.id) ? h('span', { class: 'vl-todaychip' }, '오늘') : null,
          hintLine),
        h('div', { class: 'vl-acts' }, hintBtn, revealBtn, playBtn),
        levels,
        h('button', { class: 'vl-go', type: 'button', onClick: () => goReviewOne(r, lang) }, '복습'),
        enEl,
      );
      rowEls.set(r.id, rowEl);
      listEl.appendChild(rowEl);
    }
  })();

  return () => { host.innerHTML = ''; };
}

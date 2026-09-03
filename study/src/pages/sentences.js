/* 문장 모아보기 — 지금까지 공부한 기본 문장을 한 화면에 (2026-07-18 사용자 요청).
 * v12 데스크톱 개편 (2026-09-03 작업지시서, 정본 = 시안 '문장 모아보기 v12.dc.html' 의 인라인 스타일·상태 머신):
 *   한글 프롬프트(핵심 구문 밑줄)를 보고 떠올려 **말한다**(정답 공개 전 녹음이 본 시도 → 채점 → 정답 자동 공개).
 *   힌트 3단(어순 · 첫 글자 · 빈칸)은 정답 전 디딤돌이고, 정답 패널(조각 정렬·음차·핵심 표현·문형·재생·녹음)
 *   에서 쉬움/보통/어려움 판정 → 우측 이력(떠올림/복습 분수 + 결과 막대)이 그 자리에서 갱신된다.
 *   어려움은 목록 하단 '다시 떠올리기' 묶음에 재시도 행으로 복제된다. 판정 후 행 이동·자동 가리기 없음.
 *
 * 데이터: reviewQueue(현재 과목) + sessionLogs + pronunciationLog — 현행 조회 그대로.
 *   SRS 간격 불변 — 판정은 reviewQueue.update(id, { lastResult, lastResultAt, resultHistory }) 만.
 *   resultHistory 는 로컬 전용 필드(sync 매핑 밖, pull 이월은 sync.preserveLocalOnlyFields). 복습 세션의
 *   자기평가도 같은 필드에 append 한다(srs.applySrsUpdate).
 *   한계: SRS 졸업(60일 통과)한 문장은 reviewQueue 에서 제거되므로 이 목록에서도 사라진다.
 * 범위: 데스크톱(>720px). 모바일은 새 구조를 세로로 쌓는 최소 규칙만 두고 시안 적용은 후속.
 * 복습 진입 규약은 stats.goReview 와 동일 — sessionStorage.studyReviewQueue + '#/session-review?lang='.
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, V_DOT_CSS, VI, vIcon, v2Style, ensureV2Fonts, scoreDot } from '../components/v2/atoms.js';
import { speakWithFeedback } from '../components/session/atoms.js';
import { exprMatch } from '../components/session/applied.js';
import { showRecordToast, recordErrorMessage } from '../components/session/recordToast.js';
import { recordGateMessage } from './sessionExprV2.js';
import { startMicRecording, stopAndAnalyze } from '../services/sessionAnalyze.js';
import { judgeRecording } from '../services/coverageJudge.js';
import { scoreForDisplay, computeDeductionScore } from '../services/deductionScore.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../services/weakPhonemes.js';
import { localISODate } from '../utils/today.js';

/* 판정 — 복습 세션 판정(got/hmm/no)과 같은 체계·같은 순서(쉬움→보통→어려움). 저장은 정본 형식(O/△/X). */
const LEVELS = [
  { level: 'O', label: '쉬움', cls: 'O' },
  { level: '△', label: '보통', cls: 'M' },
  { level: 'X', label: '어려움', cls: 'X' },
];
const LV = Object.fromEntries(LEVELS.map((l) => [l.level, l]));
const RUNGS = ['어순', '첫 글자', '빈칸'];

function getLang() { try { const v = sessionStorage.getItem('studyLang'); return v === 'ja' ? 'ja' : 'en'; } catch { return 'en'; } }
function ttsLangOf(l) { return l === 'ja' ? 'ja-JP' : 'en-US'; }

/* 수치·색은 시안 인라인 스타일 그대로 (작업지시서 §2~§9). keyframes 는 페이지 이름공간(vl-)으로 두어
 * 공용 V_KEYS(v-grow 는 scaleY, v-settle 은 다른 곡선)를 덮어쓰지 않는다. */
const VL_CSS = `
.vl{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.vl *{box-sizing:border-box;margin:0}
.vl button{font-family:inherit}
@keyframes vl-settle{0%{transform:translateY(6px) scale(.96);opacity:0}100%{transform:none;opacity:1}}
@keyframes vl-grow{from{transform:scaleX(0)}}
@keyframes vl-pop{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.12)}100%{transform:scale(1);opacity:1}}
@keyframes vl-ringC{0%{box-shadow:0 0 0 0 oklch(58% .115 32/.45)}100%{box-shadow:0 0 0 9px oklch(58% .115 32/0)}}
${V_DOT_CSS}
.vl .v-dot.fresh{animation:vl-pop .45s both}
.vl-top{height:60px;border-bottom:1px solid var(--line);display:flex;align-items:center}
.vl-top-in{width:100%;max-width:1064px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between}
.vl-home{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0;cursor:pointer}
.vl-wrap{width:100%;max-width:1064px;margin:0 auto;padding:26px 20px 56px}
.vl-hd{display:flex;align-items:flex-end;gap:14px}
.vl-hd-l{display:flex;align-items:baseline;gap:14px}
.vl-h1{font-family:Outfit,Pretendard,sans-serif;font-size:26px;font-weight:700;letter-spacing:-0.02em}
.vl-cnt{font-family:Outfit,sans-serif;font-size:13px;font-weight:600;color:var(--faint)}
.vl-stats{margin-left:auto;display:flex;gap:22px}
.vl-stat{display:flex;flex-direction:column;align-items:center;gap:2px}
.vl-stat span{font-size:11.5px;font-weight:600;color:var(--faint);white-space:nowrap}
.vl-stat b{font-family:Outfit,sans-serif;font-size:19px;font-weight:700;letter-spacing:-0.02em;line-height:1}
.vl-stat b.o{color:var(--teal-deep)}.vl-stat b.m{color:#8a6d1f}.vl-stat b.x{color:var(--coral-deep)}.vl-stat b.s{color:var(--ink)}
.vl-list{margin-top:22px;background:var(--card);border-radius:20px;padding:4px 26px}
.vl-row{display:grid;grid-template-columns:20px minmax(0,1fr) 280px;gap:12px 20px;align-items:start;padding:18px 0;border-bottom:1px solid #f1ede0;transition:opacity .2s}
.vl-row.dim{opacity:.72}
.vl-num{font-family:Outfit,sans-serif;font-size:12px;font-weight:700;color:#b6b0a3;text-align:right;padding-top:6px;font-variant-numeric:tabular-nums}
.vl-ko{font-size:18px;font-weight:600;line-height:1.5;letter-spacing:-0.01em}
.vl-anchor{background:linear-gradient(oklch(44% .062 192/.28),oklch(44% .062 192/.28)) 0 100%/100% 4px no-repeat;padding-bottom:2px}
.vl-hintline{margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.vl-hlabel{font-family:Outfit,Pretendard,sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.vl-seg{display:inline-flex;gap:2px;padding:3px;background:#efebde;border-radius:999px}
.vl-seg button{font-size:12.5px;font-weight:700;border-radius:999px;padding:0 13px;min-height:28px;border:0;background:transparent;color:var(--mut);cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}
.vl-seg button.lit{color:var(--ink)}
.vl-seg button.cur{background:var(--card);color:var(--teal-deep)}
.vl-seg button.off{opacity:.6;cursor:default}
.vl-seg.locked button{cursor:default}
.vl-seg.locked button:not(.lit):not(.cur){opacity:.6}
.vl-hused{font-size:12px;color:var(--faint)}
.vl-hbox{margin-top:10px;background:#f8f6ee;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;animation:vl-settle .2s both}
.vl-chips{display:flex;flex-wrap:wrap;gap:6px}
.vl-chip{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:#3f4845;background:var(--card);border-radius:8px;padding:6px 11px}
.vl-chip i{font-style:normal;font-family:Outfit,sans-serif;font-size:10px;color:#b6b0a3}
.vl-chip.shape{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;font-weight:500;letter-spacing:.02em;color:var(--teal-deep)}
.vl-first{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;animation:vl-settle .2s both}
.vl-mask{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:16px;letter-spacing:.02em;color:var(--teal-deep);background:var(--card);border-radius:6px;padding:3px 9px}
.vl-first .ko{font-size:13px;color:var(--mut)}
.vl-frame{font-family:Outfit,Pretendard,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.01em;color:var(--ink);line-height:1.5;animation:vl-settle .2s both}
.vl-frame .vl-mask{font-weight:500;padding:2px 7px}
.vl-col3{display:flex;flex-direction:column;gap:10px;align-items:stretch}
.vl-hist{background:#f8f6ee;border-radius:12px;padding:10px 14px 12px}
.vl-hist-top{display:flex;align-items:flex-end;gap:12px}
.vl-frac{display:flex;align-items:baseline;gap:6px}
.vl-frac b{font-family:Outfit,Pretendard,sans-serif;font-size:24px;font-weight:700;letter-spacing:-.03em;line-height:1;font-variant-numeric:tabular-nums}
.vl-frac b.hi{color:var(--teal-deep)}.vl-frac b.md{color:oklch(50% .09 82)}.vl-frac b.lo{color:var(--coral-deep)}
.vl-frac b.first{font-size:15px;color:var(--faint)}
.vl-frac span{font-size:12px;font-weight:600;color:var(--faint);white-space:nowrap}
.vl-last{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-size:11.5px;color:var(--faint)}
.vl-nolast{margin-left:auto;font-size:11.5px;color:#b6b0a3}
.vl-bars{display:flex;gap:3px;margin-top:9px;height:8px}
.vl-bars i{flex:1;border-radius:3px;background:var(--teal);animation:vl-grow .5s cubic-bezier(.3,.7,.3,1) both;transform-origin:left center}
.vl-bars i.x{background:oklch(58% .115 32/.35)}
.vl-bars i.pop{animation:vl-pop .45s both}
.vl-bars i.none{background:#e7e3d4;animation:none}
.vl-acts{display:flex;justify-content:flex-end;align-items:center;gap:10px}
.vl-rectext{font-size:12.5px;font-weight:700;color:var(--coral-deep)}
.vl-mic{position:relative;width:36px;height:36px;border-radius:50%;border:0;background:var(--coral);color:#fff;display:grid;place-items:center;cursor:pointer;padding:0;flex:0 0 auto;transition:background .15s}
.vl-mic.rec{background:var(--coral-deep);animation:vl-ringC 1.5s ease-out infinite}
.vl-mic.scoring{background:var(--coral-deep)}
.vl-mic .dots{font-family:Outfit,sans-serif;font-size:11px;font-weight:700;letter-spacing:.08em}
.vl-reveal{font-size:13px;font-weight:700;color:var(--ink);background:#fff;border:1.5px solid var(--line);border-radius:999px;padding:0 18px;min-height:36px;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,border-color .15s}
.vl-reveal.on{background:#efebde;border-color:transparent;color:var(--mut)}
.vl-panel{grid-column:2 / 4;background:#f8f6ee;border-radius:14px;padding:18px 20px 14px;animation:vl-settle .22s both}
.vl-ptop{display:flex;align-items:flex-start;gap:18px}
.vl-pl{flex:1;min-width:0}
.vl-pairs{display:flex;gap:6px 12px;flex-wrap:wrap;align-items:flex-start}
.vl-pair{display:inline-flex;flex-direction:column;gap:3px}
.vl-pair .en{font-family:Outfit,Pretendard,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.02em;line-height:1.25;white-space:nowrap;color:var(--ink)}
.vl-pair .en.key{background:linear-gradient(oklch(44% .062 192/.35),oklch(44% .062 192/.35)) 0 100%/100% 5px no-repeat;padding-bottom:4px}
.vl-pair .en.miss{color:var(--coral-deep)}
.vl-pair .ko{font-size:12.5px;color:var(--faint);white-space:nowrap}
.vl-pron{margin-top:10px;font-size:13.5px;color:#8b8579}
.vl-meta{margin-top:10px;display:flex;gap:6px 16px;flex-wrap:wrap;font-size:13px;color:var(--mut);align-items:baseline}
.vl-meta .k{white-space:nowrap}
.vl-meta .k b{color:var(--teal-deep)}
.vl-meta .st{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:12.5px;color:var(--faint)}
.vl-pr{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.vl-cir{position:relative;width:36px;height:36px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;padding:0;transition:background .15s,border-color .15s}
.vl-cir.playing{border-color:oklch(50% .075 235/.4);color:var(--blue)}
.vl-pbot{display:flex;align-items:center;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid #ece8da;flex-wrap:wrap;min-height:34px}
.vl-ded{font-size:12px;color:var(--mut);white-space:nowrap}
.vl-ded b{font-family:Outfit,sans-serif;color:var(--coral-deep)}
.vl-sp{flex:1}
.vl-levels{display:inline-flex;border:1.5px solid var(--line);border-radius:999px;overflow:hidden;background:var(--card)}
.vl-lv{font-size:12px;font-weight:700;color:var(--mut);background:transparent;border:0;border-left:1px solid var(--line);padding:0 14px;min-height:32px;cursor:pointer;white-space:nowrap}
.vl-lv:first-child{border-left:0}
.vl-jchip{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:7px 13px;animation:vl-pop .4s both}
.vl-jchip.O{background:var(--teal-soft);color:var(--teal-deep)}
.vl-jchip.M{background:#f6efdc;color:#8a6d1f}
.vl-jchip.X{background:var(--coral-soft);color:var(--coral-deep)}
.vl-go{font-size:12.5px;font-weight:600;color:var(--faint);background:none;border:0;padding:0 8px;min-height:32px;cursor:pointer;white-space:nowrap}
.vl-again{margin:26px -26px 0;padding:14px 26px 12px;background:#f8f6ee;display:flex;align-items:center;gap:12px}
.vl-again .t{font-family:Outfit,Pretendard,sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.vl-again .n{font-family:Outfit,sans-serif;font-size:13px;font-weight:700;color:var(--coral-deep)}
.vl-again .vl-go{margin-left:auto;padding:0;min-height:30px}
.vl-empty{margin-top:40px;text-align:center;color:var(--faint);font-size:14px}
@media (prefers-reduced-motion:reduce){.vl .vl-mic.rec{animation-iteration-count:1}.vl .v-eq i{animation-iteration-count:1}}
@media (max-width:720px){
  .vl-wrap{padding:20px 16px 40px}
  .vl-hd{flex-wrap:wrap}
  .vl-list{padding:4px 16px}
  .vl-row{grid-template-columns:20px minmax(0,1fr);gap:12px 12px}
  .vl-col3,.vl-panel{grid-column:1 / 3}
  .vl-again{margin:26px -16px 0;padding:14px 16px 12px}
  .vl-pair .en{font-size:19px}
}
`;

/* 난이도(lastResult) 정렬 우선순위 — 사용자 지시: "어렵다고 한 게 맨 위, 쉽다고 한 건 맨 밑".
 * 미평가는 중립이라 보통과 쉬움 사이에 둔다(명시적으로 '쉬움'인 것만 확실히 아래로 민다). */
const LEVEL_RANK = { X: 0, '△': 1, O: 3 };
const rankOf = (lv) => (LEVEL_RANK[lv] ?? 2);

/* 정렬 비교자 — **오늘 평가 완료가 최우선으로 가라앉는다** → 난이도(어려움→보통→미평가→쉬움)
 * → 최근 발음 점수 낮은 순 → 학습일 최신순. 초기 정렬 전용 — 판정 직후 재배치는 하지 않는다(v12 §0).
 * 점수 없는 문장은 같은 난이도의 점수 있는 문장 뒤(정보 없음 → 우선 연습 대상 아님). */
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

/* ── 힌트 재료 (작업지시서 §3.2·§12) ───────────────────────────────────────── */
/** 단어 마스크 — 첫 글자 + 밑줄(길이-1), 뒤 구두점 유지. 영문 단어가 아니면 원문. */
export function wordMask(w) {
  const m = String(w).match(/^([A-Za-z'’]+)([.,?!;:]*)$/);
  if (!m) return String(w);
  return m[1][0] + '_'.repeat(Math.max(m[1].length - 1, 0)) + m[2];
}

/** 단어 윤곽 — 글자 수만큼 밑줄, 뒤 구두점 유지 (어순 폴백용: 첫 글자보다 한 단계 약한 힌트). */
export function wordShape(w) {
  const m = String(w).match(/^([A-Za-z'’]+)([.,?!;:]*)$/);
  if (!m) return String(w);
  return '_'.repeat(m[1].length) + m[2];
}

/* key 좌변의 자리표시자(`~`, 단독 대문자 X/Y)는 표시·마스크에서 뺀다 — "Let me see if ~" → "Let me see if".
 * 문장 안 위치 찾기는 applied.exprMatch(와일드카드 처리 포함)가 맡는다. */
const PLACEHOLDER = /^(?:~+|[A-Z])$/;
export function keyPartsOf(card) {
  const key = String(card?.explanation?.key ?? '');
  const eq = key.indexOf('=');
  const rawLeft = (eq < 0 ? key : key.slice(0, eq)).trim();
  const left = rawLeft.split(/\s+/).filter((t) => t && !PLACEHOLDER.test(t)).join(' ');
  const right = eq < 0 ? '' : key.slice(eq + 1);
  const dot = right.indexOf('.');
  const ko = (dot < 0 ? right : right.slice(0, dot)).trim();
  return { rawLeft, left, ko };
}

/** 문장에서 핵심 표현이 실제로 매치된 구간(원문 대소문자 유지)과 그 마스크. 못 찾으면 null. */
export function keyMaskOf(sentence, keyLeft, rawLeft = keyLeft) {
  const src = String(sentence ?? '');
  const m = exprMatch(src, keyLeft) || (rawLeft && rawLeft !== keyLeft ? exprMatch(src, rawLeft) : null);
  if (!m) return null;
  const span = src.slice(m.index, m.index + m.length);
  return { pre: src.slice(0, m.index), span, post: src.slice(m.index + m.length), mask: span.split(' ').map(wordMask).join(' '), index: m.index, end: m.index + m.length };
}

/** 이력 분수 — 분자 = 떠올림(O·△), 분모 = 판정 전체. */
export function recallStats(history) {
  const hist = Array.isArray(history) ? history : [];
  const total = hist.length;
  const recalled = hist.filter((x) => x?.result !== 'X').length;
  return { recalled, total, ratio: total ? recalled / total : 0 };
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
  // 문장별 최신 발음 점수 — 날짜 → createdAt 순으로 최신이 정본. sentenceId 완전 일치라 드릴·체이닝(#…) 행은 제외된다.
  const scoreBy = {};
  for (const p of pronLogs ?? []) {
    if (!p?.sentenceId) continue;
    const stamp = `${p.date ?? ''}|${p.createdAt ?? ''}`;
    const cur = scoreBy[p.sentenceId];
    if (!cur || stamp > cur.stamp) scoreBy[p.sentenceId] = { stamp, score: Number(p.overallScore) || 0 };
  }
  const rows = (cards ?? []).map((c) => {
    const chunks = Array.isArray(c.explanation?.chunks) ? c.explanation.chunks.filter(Array.isArray) : [];
    const key = keyPartsOf(c);
    const oi = Number(c.order_index);
    return {
      id: c.id,
      card: c,
      num: c.order_index != null && Number.isFinite(oi) ? oi : null,
      en: c.sentence ?? '',
      ko: c.meaning || c.ko || '',
      /* ja 보조 표기 (2026-08-28) — reading 이 원문과 같으면(한자 0개 카드) 비운다. */
      reading: (c.reading && c.reading !== (c.sentence ?? '')) ? c.reading : '',
      /* 복습 큐 서버 테이블엔 phonetic_kr 컬럼이 없어 pull 로 덮인 행은 비어 있다 (2026-09-03 실계정 확인).
       * 게이트(validate-seed)가 phonetic_kr === chunks 음차 이어붙임을 강제하므로 같은 문자열을 복원한다 — 가공이 아니다. */
      pron: c.phonetic_kr || chunks.map((x) => String(x?.[1] ?? '')).join(' ').trim(),
      chunks,
      hasKoc: chunks.length > 0 && chunks.every((x) => String(x?.[2] ?? '').trim().length > 0),
      anchor: String(c.explanation?.anchor ?? ''),
      key,
      keyMask: keyMaskOf(c.sentence ?? '', key.left, key.rawLeft),
      struct: String(c.explanation?.grammar?.[0]?.struct ?? ''),
      history: Array.isArray(c.resultHistory) ? [...c.resultHistory] : [],
      level: c.lastResult ?? null,
      score: scoreBy[c.id]?.score ?? null,
      lastScore: scoreBy[c.id]?.score ?? null,
      fresh: false,
      hintable: (c.lang ?? 'en') !== 'ja',
      _iso: lastBy[c.id] || (c.createdAt ? String(c.createdAt).slice(0, 10) : ''),
      _doneToday: !!todayISO && String(c.lastResultAt ?? '').slice(0, 10) === todayISO,
    };
  }).sort(compareSentenceRows);
  rows.forEach((r, i) => { if (r.num == null) r.num = i + 1; });
  return rows;
}

/* 복습 진입 — stats.goReview 와 동일 규약 (cardLoader.loadQueueFromSession 은 항목의 id 만 쓴다). */
function goReview(entries, lang) {
  try {
    sessionStorage.setItem('studyReviewQueue', JSON.stringify(entries.map((e) => ({ id: e.id }))));
    sessionStorage.setItem('studyReturnTo', 'sentences');
  } catch { /* noop */ }
  window.location.hash = `#/session-review?lang=${lang}`;
}

function promptNodes(ko, anchor) {
  const i = anchor ? ko.indexOf(anchor) : -1;
  if (i < 0) return [ko];
  return [ko.slice(0, i), h('span', { class: 'vl-anchor' }, anchor), ko.slice(i + anchor.length)];
}

const tokensOf = (s) => String(s).toLowerCase().split(/[^a-z']+/).filter(Boolean);

/* 행 하나 — 원본 행과 '다시 떠올리기' 재시도 행이 같은 컴포넌트. 상태(at)는 행마다 별개, 이력·최신 점수는
 * 카드(r)를 공유한다. 부분 재렌더(힌트·이력·액션·패널 하단)로 등장 애니메이션이 불필요하게 되풀이되지 않게 한다. */
function makeRow(r, key, ctx) {
  const { lang, ttsLang } = ctx;
  const st = { rung: 0, open: false, spoke: false, judged: null, rec: null, score: null, ded: [], omissions: [] };
  const isRetry = key !== r.id;
  let recCtrl = null;
  let panelEl = null;
  let pairsEl = null;
  let panelMicHost = null;
  let panelBot = null;

  const el = h('div', { class: 'vl-row', 'data-id': r.id, 'data-key': key });
  const hintWrap = h('div', { class: 'vl-hintwrap' });
  const col2 = h('div', { class: 'vl-col2' }, h('div', { class: 'vl-ko' }, ...promptNodes(r.ko, r.anchor)), hintWrap);
  const histTop = h('div', { class: 'vl-hist-top' });
  const bars = h('div', { class: 'vl-bars' });
  const actsWrap = h('div', { class: 'vl-actswrap' });
  const col3 = h('div', { class: 'vl-col3' }, h('div', { class: 'vl-hist' }, histTop, bars), actsWrap);
  el.append(h('div', { class: 'vl-num' }, String(r.num)), col2, col3);

  const locked = () => st.open || !!st.judged;
  const syncDim = () => el.classList.toggle('dim', !!st.judged && !st.open);

  // ── 힌트 3단 ──
  function tapRung(i) {
    if (locked() || !r.hintable) return;
    st.rung = st.rung === i + 1 ? i : i + 1;
    renderHint();
  }
  function hintBox() {
    const box = h('div', { class: 'vl-hbox' });
    /* 어순 — 조각 뜻(chunks[i][2])이 있으면 그 뜻, 없으면 조각별 단어 윤곽(글자 수만, 영어 글자 0).
     * 실계정 113장 중 조각 뜻 보유 0장(2026-09-03) — 비활성으로 두면 사용자에겐 '죽은 버튼'이라(사용자 보고) 폴백을 둔다. */
    const chipText = (c) => (r.hasKoc ? String(c[2]) : String(c[0] ?? '').split(' ').map(wordShape).join(' '));
    if (r.chunks.length) box.appendChild(h('div', { class: 'vl-chips' }, ...r.chunks.map((c, i) => h('span', { class: 'vl-chip' + (r.hasKoc ? '' : ' shape') }, h('i', {}, String(i + 1)), chipText(c)))));
    // 핵심 표현을 못 찾은 카드는 문장 전체를 마스크 — 힌트가 정답 공개가 되면 안 된다.
    const km = r.keyMask || { pre: '', post: '', mask: r.en.split(' ').map(wordMask).join(' ') };
    if (st.rung === 2) box.appendChild(h('div', { class: 'vl-first' }, h('span', { class: 'vl-mask' }, km.mask), r.key.ko ? h('span', { class: 'ko' }, r.key.ko) : null));
    if (st.rung === 3) box.appendChild(h('div', { class: 'vl-frame' }, km.pre, h('span', { class: 'vl-mask' }, km.mask), km.post));
    return box;
  }
  function renderHint() {
    const lk = locked();
    const seg = h('div', { class: 'vl-seg' + (lk ? ' locked' : '') });
    RUNGS.forEach((label, i) => {
      const lit = i < st.rung;
      const cur = i === st.rung - 1;
      const off = !r.hintable;
      seg.appendChild(h('button', { type: 'button', class: [cur ? 'cur' : lit ? 'lit' : '', off ? 'off' : ''].filter(Boolean).join(' '), onClick: () => tapRung(i) }, label));
    });
    const nodes = [h('div', { class: 'vl-hintline' }, h('span', { class: 'vl-hlabel' }, '힌트'), seg,
      (lk && st.rung > 0) ? h('span', { class: 'vl-hused' }, `힌트 ${st.rung}단계`) : null)];
    if (!lk && st.rung > 0) nodes.push(hintBox());
    hintWrap.replaceChildren(...nodes);
  }

  // ── 이력 블록 ──
  function renderHistTop() {
    const { recalled, total, ratio } = recallStats(r.history);
    const frac = total
      ? h('span', { class: 'vl-frac' }, h('b', { class: ratio >= 0.7 ? 'hi' : ratio >= 0.4 ? 'md' : 'lo' }, `${recalled}/${total}`), h('span', {}, '떠올림'))
      : h('span', { class: 'vl-frac' }, h('b', { class: 'first' }, '첫 복습'));
    const last = r.lastScore != null
      ? h('span', { class: 'vl-last' }, '발화', scoreDot(r.lastScore, { size: 26, fresh: !!r.fresh }))
      : h('span', { class: 'vl-nolast' }, '발화 없음');
    histTop.replaceChildren(frac, last);
  }
  function renderBars(popLast) {
    const seg = r.history.slice(-12);
    const nodes = seg.length
      ? seg.map((x, i) => {
        const isX = x?.result === 'X';
        const label = LV[x?.result]?.label ?? '';
        return h('i', { class: [isX ? 'x' : '', (popLast && i === seg.length - 1) ? 'pop' : ''].filter(Boolean).join(' '), title: isX ? `못 떠올림 · ${label}` : `떠올림 · ${label}` });
      })
      : [h('i', { class: 'none' })];
    bars.replaceChildren(...nodes);
  }

  // ── 녹음 원 · 정답 버튼 ──
  function micBtn() {
    const cls = 'vl-mic' + (st.rec === 'rec' ? ' rec' : st.rec === 'scoring' ? ' scoring' : '');
    const title = st.rec === 'rec' ? '녹음 멈추기' : st.spoke ? '다시 녹음' : '녹음';
    return h('button', { type: 'button', class: cls, 'aria-label': '녹음', title, onClick: speak },
      st.rec === 'scoring' ? h('span', { class: 'dots' }, '···') : vIcon(VI.MIC, { size: 15 }));
  }
  const recText = () => h('span', { class: 'vl-rectext' }, st.rec === 'rec' ? '녹음 중' : '채점 중');
  // 정답 버튼은 한 요소를 유지한다(토글만 — 포커스·참조 보존). 왼쪽의 녹음 상태·녹음 원만 다시 그린다.
  const revealBtn = h('button', { type: 'button', class: 'vl-reveal', onClick: () => toggle() }, '정답');
  function renderActs() {
    revealBtn.textContent = st.open ? '가리기' : '정답';
    revealBtn.classList.toggle('on', st.open);
    const nodes = [];
    if (!st.open) { if (st.rec) nodes.push(recText()); nodes.push(micBtn()); }
    nodes.push(revealBtn);
    actsWrap.replaceChildren(h('div', { class: 'vl-acts' }, ...nodes));
  }
  function toggle() {
    st.open = !st.open;
    renderActs(); renderPanel(); renderHint(); syncDim();
  }

  // ── 정답 패널 ──
  function renderPairs() {
    const km = r.keyMask;
    let cursor = 0;
    const nodes = r.chunks.map((c) => {
      const en = String(c?.[0] ?? '');
      const start = r.en.indexOf(en, cursor);
      const end = start < 0 ? -1 : start + en.length;
      if (end > 0) cursor = end;
      const inKey = !!km && start >= 0 && start < km.end && end > km.index;
      const toks = tokensOf(en);
      const miss = st.spoke && st.omissions.some((m) => toks.includes(String(m).toLowerCase()));
      return h('span', { class: 'vl-pair' },
        h('span', { class: ['en', inKey ? 'key' : '', miss ? 'miss' : ''].filter(Boolean).join(' ') }, en),
        r.hasKoc ? h('span', { class: 'ko' }, String(c[2])) : null);
    });
    if (!nodes.length) nodes.push(h('span', { class: 'vl-pair' }, h('span', { class: 'en' }, r.en)));
    pairsEl.replaceChildren(...nodes);
  }
  function renderPanelMic() { if (panelMicHost) panelMicHost.replaceChildren(micBtn()); }
  function renderPanelBot() {
    if (!panelBot) return;
    const nodes = [];
    if (st.spoke && st.score != null && !st.rec) {
      nodes.push(scoreDot(st.score, { size: 30, fresh: true }));
      for (const d of st.ded) nodes.push(h('span', { class: 'vl-ded' }, `${d.label} `, h('b', {}, `−${d.points}`)));
    }
    if (st.rec) nodes.push(recText());
    nodes.push(h('div', { class: 'vl-sp' }));
    if (!st.judged) {
      nodes.push(h('div', { class: 'vl-levels' }, ...LEVELS.map(({ level, label }) =>
        h('button', { type: 'button', class: 'vl-lv', 'data-level': level, onClick: () => judge(level) }, label))));
    } else {
      nodes.push(h('span', { class: `vl-jchip ${LV[st.judged].cls}` }, LV[st.judged].label));
    }
    // 복습은 항상 판정 영역의 마지막 요소 — 해설·듣기·녹음·판정을 거친 뒤의 마지막 선택지.
    nodes.push(h('button', { type: 'button', class: 'vl-go', onClick: () => goReview([r], lang) }, '복습'));
    panelBot.replaceChildren(...nodes);
  }
  function buildPanel() {
    pairsEl = h('div', { class: 'vl-pairs' });
    renderPairs();
    const pronLine = [r.reading, r.pron].filter(Boolean).join(' · ');
    const left = h('div', { class: 'vl-pl' }, pairsEl,
      pronLine ? h('div', { class: 'vl-pron' }, pronLine) : null, // phonetic_kr 원문 한 줄 그대로 (가공·분절 금지)
      h('div', { class: 'vl-meta' },
        r.key.left ? h('span', { class: 'k' }, h('b', {}, r.key.left), r.key.ko ? ` · ${r.key.ko}` : '') : null,
        r.struct ? h('span', { class: 'st' }, r.struct) : null));
    const playBtn = h('button', { type: 'button', class: 'vl-cir', 'aria-label': '재생', title: '재생' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    playBtn.addEventListener('click', () => speakWithFeedback(playBtn, r.en, { lang: ttsLang }));
    panelMicHost = h('span', { class: 'vl-pmic' }, micBtn());
    panelBot = h('div', { class: 'vl-pbot' });
    renderPanelBot();
    return h('div', { class: 'vl-panel' }, h('div', { class: 'vl-ptop' }, left, h('div', { class: 'vl-pr' }, playBtn, panelMicHost)), panelBot);
  }
  function renderPanel() {
    if (!st.open) { panelEl?.remove(); panelEl = null; pairsEl = null; panelMicHost = null; panelBot = null; return; }
    const next = buildPanel();
    if (panelEl) panelEl.replaceWith(next); else el.appendChild(next);
    panelEl = next;
  }
  function syncRec() { renderActs(); renderPanelMic(); renderPanelBot(); }

  // ── 녹음·채점 — 복습 세션 finishRecording 과 같은 순서·옵션 (작업지시서 §8) ──
  async function speak() {
    if (st.rec === 'scoring') return;
    if (st.rec === 'rec') { finish(); return; } // 수동 멈추기 — 복습 세션과 같은 계약
    st.rec = 'rec'; syncRec();
    const rec = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: r.en, card: r.card }, onAutoStop: () => { finish(); } });
    if (rec.error) { st.rec = null; recCtrl = null; syncRec(); showRecordToast(recordErrorMessage(rec.error)); return; }
    recCtrl = rec.controller;
  }
  async function finish() {
    if (st.rec !== 'rec' || !recCtrl) return;
    const ctrlR = recCtrl; recCtrl = null;
    st.rec = 'scoring'; syncRec();
    const result = await stopAndAnalyze(ctrlR, r.en, r.card, { enableMiscue: true });
    if (result?.mockFallback) { st.rec = null; syncRec(); showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
    const judged = judgeRecording(result, r.en);
    if (!judged.record) { st.rec = null; syncRec(); showRecordToast(recordGateMessage(judged.reason)); return; }
    const scored = scoreForDisplay(result, r.en, lang);
    st.rec = null; st.spoke = true; st.score = scored.score;
    st.ded = (computeDeductionScore(result, r.en).deductions || []).slice(0, 2);
    st.omissions = Array.isArray(result?.omissions) ? result.omissions : [];
    r.lastScore = scored.score; r.fresh = true;
    // 채점 완료 → 정답 자동 공개 (복습 세션 applyScore → reveal 과 같은 순서: 시도 뒤 피드백)
    if (!st.open) { st.open = true; renderActs(); renderPanel(); renderHint(); syncDim(); }
    else { syncRec(); renderPairs(); }
    renderHistTop();
    ctx.onSpoke(key);
    try {
      await savePronunciationLog(window.studyDB, { result: scored, sentenceId: r.id, lang, date: localISODate() });
      await applyWeakPhonemesUpdate(window.studyDB, lang, result?.weakPhonemes);
    } catch (e) { console.error('[sentences] pron persist', e); }
  }

  // ── 판정 — SRS 불변. lastResult·lastResultAt(KST 오늘)·resultHistory append 만 저장. 행 이동 없음. ──
  async function judge(level) {
    if (st.judged) return;
    const today = localISODate();
    st.judged = level;
    r.history.push({ date: today, result: level, source: 'sentences' });
    r.level = level;
    renderPanelBot(); renderHistTop(); renderBars(true); renderHint(); syncDim();
    ctx.onJudge(key, level);
    if (level === 'X' && !isRetry) ctx.addRetry(r);
    // lastResultAt 은 KST 날짜(localISODate) — toISOString(UTC)이면 KST 새벽 평가가 전날로 귀속된다.
    try { await window.studyDB?.reviewQueue?.update(r.id, { lastResult: level, lastResultAt: today, resultHistory: [...r.history] }); }
    catch (e) { console.error('[sentences] level save', e); }
  }

  renderHint(); renderHistTop(); renderBars(false); renderActs();
  return { el, refreshHist() { renderHistTop(); renderBars(false); } };
}

export function mountSentences(host) {
  ensureV2Fonts();
  const lang = getLang();
  const ttsLang = ttsLangOf(lang);
  const root = h('div', { class: 'vl' }, v2Style(VL_CSS));
  const listEl = h('div', { class: 'vl-list' });
  const cntEl = h('span', { class: 'vl-cnt' }, '');
  const statEls = { O: h('b', { class: 'o' }, '0'), '△': h('b', { class: 'm' }, '0'), X: h('b', { class: 'x' }, '0'), spoke: h('b', { class: 's' }, '0') };
  const statsEl = h('div', { class: 'vl-stats' },
    ...[['쉬움', statEls.O], ['보통', statEls['△']], ['어려움', statEls.X], ['발화', statEls.spoke]]
      .map(([label, v]) => h('div', { class: 'vl-stat' }, h('span', {}, label), v)));

  root.append(
    h('div', { class: 'vl-top' }, h('div', { class: 'vl-top-in' },
      h('button', { class: 'vl-home', type: 'button', onClick: () => { window.location.hash = '#/home'; } },
        vIcon(VI.HOME, { size: 15 }), '홈으로'),
      h('span', { class: 'vl-cnt' }, lang === 'ja' ? '일본어' : '영어'))),
    h('div', { class: 'vl-wrap' },
      h('div', { class: 'vl-hd' }, h('div', { class: 'vl-hd-l' }, h('h1', { class: 'vl-h1' }, '문장 모아보기'), cntEl), statsEl),
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

    // 상단 집계 — 오늘 이 화면에서의 판정 O/△/X 수, 채점된 문장 수 (원본 행 기준. 낙관적 즉시 반영)
    const originals = new Set(rows.map((r) => r.id));
    const counts = { O: 0, '△': 0, X: 0 };
    const spoken = new Set();
    const rowObjs = new Map(); // key → 행 (재시도 행이 원본 이력을 공유하므로 판정 뒤 양쪽 이력 블록을 새로 그린다)
    let againEl = null;
    let againCnt = null;
    let againGo = null;
    const retry = [];
    const ctx = {
      lang,
      ttsLang,
      onJudge(key, level) {
        if (originals.has(key)) { counts[level] += 1; statEls[level].textContent = String(counts[level]); }
        for (const [k, obj] of rowObjs) if (k !== key && (k === key.replace(/-2$/, '') || k === `${key}-2`)) obj.refreshHist();
      },
      onSpoke(key) {
        if (originals.has(key)) { spoken.add(key); statEls.spoke.textContent = String(spoken.size); }
        for (const [k, obj] of rowObjs) if (k !== key && (k === key.replace(/-2$/, '') || k === `${key}-2`)) obj.refreshHist();
      },
      addRetry(r) {
        if (retry.some((x) => x.id === r.id)) return;
        if (!againEl) {
          againCnt = h('span', { class: 'n' }, '0');
          againGo = h('button', { type: 'button', class: 'vl-go', onClick: () => goReview(retry, lang) }, '');
          againEl = h('div', { class: 'vl-again' }, h('span', { class: 't' }, '다시 떠올리기'), againCnt, againGo);
          listEl.appendChild(againEl);
        }
        retry.push(r);
        againCnt.textContent = String(retry.length);
        againGo.textContent = `복습 · ${retry.length}문장`;
        const key = `${r.id}-2`;
        const obj = makeRow(r, key, ctx);
        rowObjs.set(key, obj);
        listEl.appendChild(obj.el);
      },
    };
    for (const r of rows) {
      const obj = makeRow(r, r.id, ctx);
      rowObjs.set(r.id, obj);
      listEl.appendChild(obj.el);
    }
  })();

  return () => { host.innerHTML = ''; };
}

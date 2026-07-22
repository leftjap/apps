/* 복습 세션 — 데스크톱 C 파이널 v2 (작업지시서 §5)
 * 떠올리기 우선: '떠올려 말하기'가 1순위 CTA, 듣기는 보조. 해설 기본 접힘.
 * SRS 메타(회차·지난 점수·다음 복습일) + 문장별 점수 기록 노출.
 * 정본 시안: 작업지시서 v-review.jsx (SessReview)
 *
 * SRS 판정(2026-07-10 사용자 결정): **자기평가(다시/애매/완료)가 유일한 입력**.
 *   발음 점수는 SRS 를 정하지 않는다 — 약점 음소 수집·표시용. 구 자동채점(deriveKind)은 폐기.
 *   이유: 영어는 정답을 숨기므로 첫 시도 점수가 '기억'이 아니라 '발음'을 재고, 공개 후 재녹음은 낭독이다.
 * 라이브 녹음/채점은 기존 services 재사용. 데모(?demo=1)는 마이크 없이 시뮬.
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, vEq, vCheck, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { exprOf, bumpRecLog } from '../components/d1/sessionShell.js';
import { startMicRecording, stopAndAnalyze } from '../services/sessionAnalyze.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../services/weakPhonemes.js';
import { recordErrorMessage, showRecordToast } from '../components/session/recordToast.js';
import { createJudgeRow } from '../components/session/atoms.js';
import { filterNearDupDrills } from '../components/session/applied.js';
import { localISODate } from '../utils/today.js';
// 해설·응용문장·체이닝은 신규 세션과 **같은 컴포넌트**를 쓴다 (2026-07-10 사용자 지시).
// 복습 전용 체이닝('전체 재현 → 단계 폴백')은 폐기 — 두 화면이 달라지지 않게.
import { explainPanel, drillRows, chainBlockEl, VS_CSS, VSM_CSS } from './sessionExprV2.js';

const PASS_THRESHOLD = 80;
const SVG_NS = 'http://www.w3.org/2000/svg';
function getTodayISO() { return window.studyDay?.TODAY_ISO || localISODate(); }

/* 회상 모드 — 한글 뜻만 보여주고 영어를 떠올려 말하게 한다 (en 한정, 2026-07-10 사용자 결정).
 * 구 rung 1/2/3(수용→클로즈→생산)은 폐기: interval≥21 이라야 닿는 3단계가 사실상 안 쓰였고,
 * 1단계는 영어를 띄운 채 "떠올려 보세요"라 낭독이었으며, 그 낭독 발음 점수가 SRS 를 정했다.
 * 힌트는 두지 않는다 — 미리 주는 단서는 인출을 쉽게 만들어 이득의 근거가 없다.
 * 실패는 그대로 두고 시도 직후 정답을 공개한다(피드백). ja 는 현행 유지(문장 노출). */
export function isRecallMode(lang) {
  return lang === 'en';
}

const wordCountOf = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

const VR_CSS = `
.vr{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;display:flex;word-break:keep-all;${V_VARS}}
.vr *{box-sizing:border-box;margin:0}
.vr-rail{width:88px;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;padding:24px 0;gap:8px;flex:0 0 auto}
.vr-rail .hm{color:var(--faint);margin-bottom:16px;background:none;border:0;cursor:pointer;display:inline-flex}
.vr-rstep{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;font-family:Outfit;font-size:13.5px;font-weight:700;color:var(--faint);cursor:pointer;background:none;border:0}
.vr-rstep.on{background:var(--coral-soft);color:var(--coral-deep);animation:v-haloC 2.4s ease-in-out infinite}
.vr-rstep.done{color:var(--coral-deep)}
@keyframes v-haloC{0%,100%{box-shadow:inset 0 0 0 1.5px oklch(58% .115 32/.4),0 0 0 0 oklch(58% .115 32/.25)}55%{box-shadow:inset 0 0 0 1.5px oklch(58% .115 32/.4),0 0 0 7px oklch(58% .115 32/0)}}
.vr-rail .sp{flex:1}
.vr-rail .tm{font-family:Outfit;font-size:11px;color:var(--faint);letter-spacing:.08em;white-space:nowrap}
.vr-mainwrap{flex:1;display:flex;justify-content:center;gap:26px;padding:38px 46px 40px}
.vr-main{width:760px;max-width:100%}
.vr-crumb{display:flex;align-items:center;gap:14px}
.vr-scene{font-size:12px;font-weight:700;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:6px 13px;white-space:nowrap}
.vr-prog{flex:1;display:flex;gap:5px}
.vr-prog i{flex:1;height:4px;border-radius:2px;background:#e7e3d4}
.vr-prog i.f{background:var(--teal)}
.vr-prog-t{font-family:Outfit;font-size:12px;color:var(--faint);font-weight:600;white-space:nowrap}
.vr-hint{margin-top:20px;font-size:13px;color:var(--mut);display:inline-flex;align-items:center;gap:8px}
.vr-hint i{width:6px;height:6px;border-radius:50%;background:var(--coral);animation:v-blink 1.6s infinite;flex:0 0 auto}
.vr-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:36px 44px;margin-top:12px;
  box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.14)}
.vr-h1{font-family:Outfit;font-size:46px;font-weight:700;letter-spacing:-0.03em;line-height:1.12}
.vr-ko{font-size:17px;color:var(--mut);margin-top:13px}
.vr-srs{display:flex;gap:18px;margin-top:14px;font-size:12.5px;color:var(--faint);flex-wrap:wrap}
.vr-srs b{color:var(--mut);font-weight:700}
.vr-ctrl{display:flex;align-items:center;gap:12px;margin-top:26px;flex-wrap:wrap;min-height:56px}
.vr-pill{position:relative;display:inline-flex;align-items:center;gap:9px;border-radius:999px;padding:13px 23px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1.5px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap}
/* 녹음 CTA 는 코랄 — 색 규약 '코랄=녹음'(v2/atoms.js 머리주석)과 구 D1(terra) 관례. 2026-07-22 복원. */
.vr-pill.pri{background:var(--coral);border-color:var(--coral);color:#fff;animation:v-breatheC 2.6s ease-in-out infinite}
.vr-pill.recing{background:var(--coral-deep);border-color:var(--coral-deep);color:#fff;animation:none}
.vr-pill.recing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vr-pill.playing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vr-pill.playing{border-color:var(--blue-line);color:var(--blue-deep);background:var(--blue-soft)}
.vr-ring{position:relative;width:52px;height:52px;flex:0 0 auto}
.vr-ring svg{transform:rotate(-90deg)}
.vr-ring .cn{position:absolute;inset:0;display:grid;place-items:center;font-family:Outfit;font-size:15px;font-weight:700;color:var(--teal-deep)}
.vr-cap{font-size:11.5px;color:var(--faint);white-space:nowrap}
.vr-meta{display:flex;align-items:center;gap:20px;margin-top:16px;flex-wrap:wrap}
.vr-say{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;color:var(--mut);font-weight:600;white-space:nowrap}
.vr-hist{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--faint);white-space:nowrap;flex-wrap:wrap}
.vr-hist .hh{font-family:Outfit;font-weight:700;color:var(--mut);background:#f1eee2;border-radius:999px;padding:3px 10px;font-size:11.5px}
.vr-hist .hh.q{color:var(--coral-deep);background:var(--coral-soft)}
.vr-side{width:324px;flex:0 0 auto}
.vr-rec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px 20px;margin-bottom:13px}
.vr-rec .lb{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vr-rec .nr{display:flex;align-items:baseline;gap:7px;margin-top:7px}
.vr-rec .n{font-family:Outfit;font-size:27px;font-weight:700;line-height:1}
.vr-rec .u{font-size:12px;color:var(--faint);font-weight:600}
.vr-rec .v-bar{height:5px;margin-top:10px}
.vr-rec .v-bar > i{background:var(--teal)}
.vr-rec .msg{font-size:11.5px;color:var(--mut);margin-top:9px;line-height:1.5}
.vr-rec .msg b{color:var(--coral-deep)}
.vr-fold{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 22px}
.vr-fold .hd{display:flex;justify-content:space-between;align-items:center;cursor:pointer}
.vr-fold .t{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vr-fold .chev{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;color:var(--mut);transition:transform .2s}
.vr-fold.open .chev{transform:rotate(180deg)}
.vr-fold .bd{font-size:12.5px;color:var(--mut);margin-top:12px;line-height:1.6}
.vr-fold .bd .vs-klab{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase;margin-top:12px}
.vr-fold .bd .kx{background:var(--teal-soft);border-radius:10px;padding:10px 12px;color:#3f4845}
.vr-fold .vs-panel{padding:0;border:0;background:none;margin:0}
.vr-fold .vs-panel .inner{padding:0;max-height:none;overflow:visible}
.vr-gate{font-size:11.5px;color:var(--faint);text-align:center;margin-top:9px}
.vr-pill:disabled,.vr .judge-btn:disabled{opacity:.35;cursor:not-allowed;animation:none}
@media (max-width:1100px){.vr-mainwrap{flex-direction:column;align-items:center}.vr-side{width:760px;max-width:100%}}
`;

function ringEl(score) {
  const wrap = h('div', { class: 'vr-ring' });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '52'); svg.setAttribute('height', '52'); svg.setAttribute('viewBox', '0 0 52 52');
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', '26'); track.setAttribute('cy', '26'); track.setAttribute('r', '23');
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', '#eae6d8'); track.setAttribute('stroke-width', '5');
  svg.appendChild(track);
  if (score != null) {
    const arc = document.createElementNS(SVG_NS, 'circle');
    const off = 144 - Math.round((Math.min(Math.max(score, 0), 100) / 100) * 124);
    arc.setAttribute('cx', '26'); arc.setAttribute('cy', '26'); arc.setAttribute('r', '23');
    arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', 'oklch(44% .062 192)'); arc.setAttribute('stroke-width', '5');
    arc.setAttribute('stroke-linecap', 'round'); arc.setAttribute('stroke-dasharray', '144'); arc.setAttribute('stroke-dashoffset', String(off));
    svg.appendChild(arc);
  }
  wrap.append(svg, h('span', { class: 'cn' }, score != null ? String(score) : '—'));
  return wrap;
}

// 점수 → SRS 판정 (수동 판정 없는 시안 대응). 점수 미측정 시 중립('hmm').
/* 모바일(phone/tablet) — 회상 우선 단일 칼럼 (작업지시서 모바일 §3-4). 코랄 step. */
const VRM_CSS = `
.vr{min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;display:flex;flex-direction:column;${V_VARS}}
.vr *{box-sizing:border-box;margin:0}
.vr button{font:inherit;background:none;border:0;cursor:pointer;padding:0;color:inherit}
@keyframes v-haloC{0%,100%{box-shadow:inset 0 0 0 1.5px oklch(58% .115 32/.4),0 0 0 0 oklch(58% .115 32/.25)}55%{box-shadow:inset 0 0 0 1.5px oklch(58% .115 32/.4),0 0 0 7px oklch(58% .115 32/0)}}
.m-topb{position:sticky;top:0;z-index:6;background:oklch(97.5% .009 95/.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:calc(9px + env(safe-area-inset-top)) 16px 11px;flex:0 0 auto}
.m-topb-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.m-home{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mut)}
.m-topb-meta{font-family:Outfit,sans-serif;font-size:12px;color:var(--faint);letter-spacing:.04em;white-space:nowrap}
.m-topb-time{font-family:Outfit,sans-serif;font-size:12px;font-weight:600;color:var(--faint)}
.m-prog{display:flex;gap:4px;margin-top:9px}
.m-prog i{flex:1;height:4px;border-radius:2px;background:#e7e3d4}
.m-prog i.fc{background:var(--coral)}
.m-steps{display:flex;align-items:center;gap:7px;padding:11px 20px 3px;flex:0 0 auto;overflow-x:auto}
.m-rstep{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-family:Outfit;font-size:12.5px;font-weight:700;color:var(--faint);flex:0 0 auto}
.m-rstep.on.c{background:var(--coral-soft);color:var(--coral-deep);animation:v-haloC 2.4s ease-in-out infinite}
.m-rstep.done.c{color:var(--coral-deep)}
.m-steps .sp{flex:1}
.m-steps .pt{font-family:Outfit;font-size:12px;font-weight:600;color:var(--faint);white-space:nowrap}
.m-pad{padding:0 20px 24px;max-width:560px;margin:0 auto;width:100%}
.vr-pill:disabled,.vr .judge-btn:disabled{opacity:.35;cursor:not-allowed;animation:none}
.vr-hint{margin-top:13px;font-size:12.5px;color:var(--mut);display:inline-flex;align-items:center;gap:7px}
.vr-hint i{width:6px;height:6px;border-radius:50%;background:var(--coral);animation:v-blink 1.6s infinite;flex:0 0 auto}
.vr-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px 22px;margin-top:10px;box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.14)}
.vr-h1{font-family:Outfit;font-size:28px;font-weight:700;letter-spacing:-.03em;line-height:1.15}
.vr-ko{font-size:16px;color:var(--mut);margin-top:10px}
.vr-srs{display:flex;gap:14px;margin-top:12px;font-size:12px;color:var(--faint);flex-wrap:wrap}
.vr-srs b{color:var(--mut);font-weight:700}
.vr-ctrl{display:flex;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap}
/* 셀렉터에 button 을 붙여 명시도(0,0,1,1)를 위 '.vr button' 리셋과 동률로 올린다 — 안 그러면
   '.vr button' 의 padding:0 (0,0,1,1)이 '.vr-pill'(0,0,1,0)을 이겨 패딩이 0 이 되고, 타원 버튼
   경계에 글자가 붙어 삐져나온다(2026-07-18 iPhone 보고, sessionExprV2 와 동일 뿌리). 파생(0,0,2,0)은 회귀 없음. */
button.vr-pill{position:relative;display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:12px 18px;font-size:13.5px;font-weight:700;border:1.5px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap;min-height:46px}
/* 녹음 CTA 는 코랄 — 색 규약 '코랄=녹음'(v2/atoms.js 머리주석)과 구 D1(terra) 관례. 2026-07-22 복원. */
.vr-pill.pri{background:var(--coral);border-color:var(--coral);color:#fff;animation:v-breatheC 2.6s ease-in-out infinite}
.vr-pill.playing{border-color:var(--blue-line);color:var(--blue-deep);background:var(--blue-soft)}
.vr-pill.recing{background:var(--coral-deep);border-color:var(--coral-deep);color:#fff;animation:none}
.vr-pill.recing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vr-pill.playing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vr-ring{position:relative;width:50px;height:50px;flex:0 0 auto}
.vr-ring svg{transform:rotate(-90deg)}
.vr-ring .cn{position:absolute;inset:0;display:grid;place-items:center;font-family:Outfit;font-size:15px;font-weight:700;color:var(--teal-deep)}
.vr-cap{font-size:11px;color:var(--faint);white-space:nowrap}
.vr-meta{display:flex;align-items:center;gap:14px;margin-top:15px;flex-wrap:wrap}
.vr-say{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--mut);font-weight:600;white-space:nowrap}
.vr-hist{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--faint);flex-wrap:wrap}
.vr-hist .hh{font-family:Outfit;font-weight:700;color:var(--mut);background:#f1eee2;border-radius:999px;padding:3px 9px;font-size:11px}
.vr-hist .hh.q{color:var(--coral-deep);background:var(--coral-soft)}
.vr-rec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 18px;margin-top:12px}
.vr-rec .lb{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vr-rec .nr{display:flex;align-items:baseline;gap:6px;margin-top:7px}
.vr-rec .n{font-family:Outfit;font-size:26px;font-weight:700;line-height:1}
.vr-rec .u{font-size:11.5px;color:var(--faint);font-weight:600}
.vr-rec .v-bar{height:5px;margin-top:9px}
.vr-rec .v-bar > i{background:var(--teal)}
.vr-rec .msg{font-size:11.5px;color:var(--mut);margin-top:8px;line-height:1.5}
.vr-rec .msg b{color:var(--coral-deep)}
.vr-fold{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-top:12px}
.vr-fold .hd{display:flex;justify-content:space-between;align-items:center;cursor:pointer}
.vr-fold .t{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vr-fold .chev{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;color:var(--mut);transition:transform .2s}
.vr-fold.open .chev{transform:rotate(180deg)}
.vr-fold .bd{margin-top:13px;font-size:12.5px;line-height:1.6;color:var(--mut)}
.vr-fold .bd .kx{background:var(--teal-soft);border-radius:12px;padding:12px 14px}
.vr-fold .vs-panel{padding:0;border:0;background:none;margin:0}
.vr-fold .vs-panel .inner{padding:0;max-height:none;overflow:visible}
.vr-fold .bd .vs-klab{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase;margin-top:12px}
`;

export function renderSessionReviewV2(host, state, handlers = {}) {
  ensureV2Fonts();
  const lang = state.sentence?.lang || 'en';
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const subjLabel = lang === 'ja' ? '일본어' : '영어';
  const s = state.sentence;
  const ex = s?.explanation || {};
  const card = state.cards[state.step - 1] || {};
  const total = state.total || state.cards.length;
  const idx = state.step;
  const expr = exprOf(s || {});
  const prevRecord = state.prevRecord || 27;

  if (total === 0 || !s?.sentence) {
    let root;
    if (state.size !== 'desktop') {
      // 모바일 빈 상태 — 데스크톱 레일(.vr-main 760px) 대신 모바일 셸 (가로 오버플로 방지)
      root = h('div', { class: 'vr' }, v2Style(VRM_CSS),
        h('div', { class: 'm-topb' },
          h('div', { class: 'm-topb-row' },
            h('button', { class: 'm-home', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
            h('span', { class: 'm-topb-meta' }, '복습 · ' + subjLabel),
            h('span', { class: 'm-topb-time' }, ''))),
        h('div', { class: 'm-pad', style: 'text-align:center;padding-top:64px;color:var(--mut);' },
          h('div', { class: 'vr-h1', style: 'font-size:24px;' }, '복습할 문장이 없어요'),
          h('div', { style: 'margin-top:10px;' }, '신규 학습 후 다시 오세요.')));
    } else {
      root = h('div', { class: 'vr' }, v2Style(VR_CSS),
        h('div', { class: 'vr-rail' }, h('button', { class: 'hm', onClick: () => { window.location.hash = '#/home'; } }, vIcon(VI.HOME, { size: 17 }))),
        h('div', { class: 'vr-mainwrap' }, h('div', { class: 'vr-main', style: 'text-align:center;padding-top:80px;color:var(--mut);' },
          h('div', { class: 'vr-h1', style: 'font-size:30px;' }, '복습할 문장이 없어요'),
          h('div', { style: 'margin-top:12px;' }, '신규 학습 후 다시 오세요.'))));
    }
    host.appendChild(root);
    return { cleanup: () => { host.innerHTML = ''; }, layout: { update() {} } };
  }

  // 회상 모드(en) — 답을 숨겼다가 시도 후(또는 해설 펼침 시) 공개.
  // micBlocked 로 자동 공개하지 말 것: 데모 모드가 그 플래그를 세우고(session-review.js:206),
  // 마이크 없는 기기에서 정답이 그냥 노출된다. 해설 펼침이 공개 경로라 막다른 길이 아니다.
  const recallMode = isRecallMode(lang);
  let revealed = !recallMode;
  const h1El = h('h1', { class: 'vr-h1' }, revealed ? s.sentence : (s.ko || ''));
  const koEl = h('div', { class: 'vr-ko' },
    revealed ? (s.ko || '') : `영어로 떠올려 말해 보세요 · ${wordCountOf(s.sentence)}단어`);
  function reveal() {
    if (revealed) return;
    revealed = true;
    h1El.textContent = s.sentence;
    koEl.textContent = s.ko || '';
    listenPill.disabled = false;
    if (drillsBlock) drillsBlock.style.display = '';   // 응용·체이닝도 정답을 품으므로 함께 공개
    if (chainBlock) chainBlock.style.display = '';
    openFold();  // 평가는 해설 안에 있다 — 정답을 공개했으면 평가에도 닿아야 한다
    refreshJudge();
  }

  // SRS 메타
  const reviewNo = (Number.isInteger(card.reviewCount) ? card.reviewCount + 1 : 1);
  const lastScore = Number.isFinite(card.lastScore) ? card.lastScore : null;
  const nextDate = card.nextReviewLabel || (state.cards[idx - 1]?.nextReview) || '';

  // 좌측 레일
  const rail = h('div', { class: 'vr-rail' },
    h('button', { class: 'hm', type: 'button', 'aria-label': '홈', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 17 })),
    Array.from({ length: total }, (_, i) => h('button', {
      class: 'vr-rstep' + (i + 1 === idx ? ' on' : i + 1 < idx ? ' done' : ''), type: 'button',
      onClick: () => handlers.onJump?.(i + 1),
    }, String(i + 1))),
    h('span', { class: 'sp' }),
    h('span', { class: 'tm' }, state.time || '00:00'),
  );

  // 컨트롤 — 떠올려 말하기(1순위 mic) + 듣기 + 점수 링
  let playing = false, recCtrl = null;
  const recPill = h('button', { class: 'vr-pill pri', type: 'button' }, vIcon(VI.MIC, { size: 14, sw: 2 }), '떠올려 말하기');
  // 듣기는 정답 오디오다 — 회상 시도 전에는 잠근다 (공개 후 해제).
  const listenPill = h('button', { class: 'vr-pill vr-listen', type: 'button' }, vIcon(VI.PLAY, { size: 12, fill: true }), '듣기');
  listenPill.disabled = !revealed;
  let curRing = ringEl(state.lastScore);
  const ringHost = h('div', { style: 'margin-left:auto;display:flex;align-items:center;gap:10px;' }, curRing, h('span', { class: 'vr-cap' }, lastScore != null ? `지난 점수` : '첫 복습'));
  const ctrl = h('div', { class: 'vr-ctrl' }, recPill, listenPill, ringHost);

  // 복습에서 발화는 전진 조건이 아니다 (사용자 지시) — 목표 없이 횟수만 센다.
  const recCount = () => state.recLog?.[s?.id]?.count ?? 0;
  const sayLine = h('span', { class: 'vr-say' }, h('span', {}, '발화'), h('span', { class: 'vr-say-n' }, ''));
  const todayHist = h('span', { class: 'hh q' }, '오늘 ?');
  const histRow = h('span', { class: 'vr-hist' }, h('span', {}, '이 문장 기록'),
    ...(Array.isArray(card.history) ? card.history.map((hv, i) => h('span', { class: 'hh' }, `${i + 1}차 ${hv}`)) : (lastScore != null ? [h('span', { class: 'hh' }, `지난 ${lastScore}`)] : [])),
    todayHist);
  const meta = h('div', { class: 'vr-meta' }, sayLine, histRow);

  // 우측 — 오늘 발화 위젯
  const recN = h('span', { class: 'n' }, String(state.tried || 0));
  const recBar = h('div', { class: 'v-bar' }, h('i', { style: `width:${Math.min(Math.round(((state.tried || 0) / Math.max(prevRecord, 1)) * 100), 100)}%` }));
  const recMsg = h('div', { class: 'msg' }, '');
  const recWidget = h('div', { class: 'vr-rec' }, h('span', { class: 'lb' }, '오늘 발화'),
    h('div', { class: 'nr' }, recN, h('span', { class: 'u' }, `회 / 직전 세션 기록 ${prevRecord}회`)), recBar, recMsg);

  // 자기평가가 SRS 의 유일한 입력 — 발음 점수는 약점 음소 수집용일 뿐 간격을 정하지 않는다.
  const judgeRow = createJudgeRow({
    size: state.size === 'desktop' ? 'desktop' : 'phone',
    onJudge: (kind) => {
      if (!revealed) { showRecordToast('먼저 떠올려 말해 보세요'); return; }
      handlers.onJudge?.(kind);
    },
  });
  const judgeBtns = [...judgeRow.el.querySelectorAll('.judge-btn')];
  const refreshJudge = () => { judgeBtns.forEach((b) => { b.disabled = !revealed; }); };
  refreshJudge();
  const gateEl = h('div', { class: 'vr-gate' }, '어땠나요? 아래에서 골라주세요');

  // 응용/체이닝 발화 집계 — '오늘 발화'·약점 음소에만 반영. SRS 는 자기평가가 정한다.
  const onAppliedScore = (result) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) {
      if (!state.weakInSession) state.weakInSession = {};
      for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1;
    }
    bumpRecLog(state, s?.id, score);
    refreshDots(); refreshRec();
    handlers.saveSnapshot?.();
  };

  // 응용 연습 — 신규 세션과 동일 (근접중복은 렌더에서 제외).
  const drills = filterNearDupDrills(s?.sentence, ex.drills);
  const drillCountEl = h('b', {}, '0');
  const recordedDrills = new Set();
  const drillsBlock = drills.length ? h('div', { class: 'vr-drills' },
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '응용 연습 — 듣고, 따라 말하고, 녹음하기'),
      h('span', { class: 'ct' }, '녹음 ', drillCountEl, ' / ' + drills.length)),
    h('div', { style: 'margin-top:4px;' }, drillRows(drills, expr, lang, s?.speaker, (i, result) => {
      if (!recordedDrills.has(i)) { recordedDrills.add(i); drillCountEl.textContent = String(recordedDrills.size); }
      onAppliedScore(result);
    }, state.demo)),
  ) : null;

  // 체이닝 — 신규 세션과 동일 컴포넌트 (무자막, 단계 누적).
  const chainBlock = chainBlockEl(ex.chain, lang, s, state.demo, onAppliedScore);

  // 응용·체이닝은 신규와 같은 자리(메인 칼럼)에 두되, 정답을 품으므로 공개 전에는 감춘다.
  if (!revealed) {
    if (drillsBlock) drillsBlock.style.display = 'none';
    if (chainBlock) chainBlock.style.display = 'none';
  }

  // 해설 접힘 — 펼치면 정답이 드러나므로 그때 공개 처리한다. 안쪽은 해설 패널 + 하단 평가.
  const foldBd = h('div', { class: 'bd' },
    explainPanel(ex, false),
    h('div', { style: 'margin-top:18px;border-top:1px solid var(--line);padding-top:14px;' }, gateEl, judgeRow.el),
  );
  foldBd.style.display = 'none';
  const fold = h('div', { class: 'vr-fold' },
    h('div', {
      class: 'hd',
      onClick: () => {
        const open = fold.classList.toggle('open');
        foldBd.style.display = open ? '' : 'none';
        if (open) reveal(); // 해설엔 영어가 들어 있다 — 펼치는 순간이 곧 정답 공개
      },
    }, h('span', { class: 't' }, '표현 해설'), h('span', { class: 'chev' }, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 }))),
    foldBd);
  // 자기평가(judge-row)는 해설 fold 안 하단에 있다 — 접힌 채로 두면 녹음해도 평가에 닿지 못한다
  // (2026-07-17 사용자 보고: 녹음하면 응용연습만 펼쳐지고 해설·평가는 접힌 채).
  // 이미 열려 있으면 그대로 둔다 — 헤더 클릭 경로(위 toggle)와 겹쳐도 안전.
  function openFold() {
    if (fold.classList.contains('open')) return;
    fold.classList.add('open');
    foldBd.style.display = '';
  }

  const refreshDots = () => {
    sayLine.querySelector('.vr-say-n').textContent = `${recCount()}회`;
    if (state.lastScore != null) todayHist.textContent = `오늘 ${state.lastScore}`;
  };
  const refreshRec = () => {
    recN.textContent = String(state.tried || 0);
    recBar.firstChild.style.width = Math.min(Math.round(((state.tried || 0) / Math.max(prevRecord, 1)) * 100), 100) + '%';
    if ((state.tried || 0) > prevRecord) { recBar.firstChild.style.background = 'var(--coral)'; recMsg.innerHTML = '직전 세션 기록을 <b>넘었어요!</b>'; }
    else recMsg.innerHTML = `<b>${Math.max(prevRecord - (state.tried || 0), 0)}회</b>만 더 말하면 직전 세션 기록을 깨요!`;
  };

  function applyScore(score) {
    state.lastScore = score; state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    bumpRecLog(state, s?.id, score);
    const nr = ringEl(score); curRing.replaceWith(nr); curRing = nr;
    ringHost.lastChild.textContent = `${recCount()}회 떠올림`;
    if (!revealed) reveal(); // 시도 직후 정답 공개 (피드백) — 실패해도 학습된다
    refreshDots(); refreshRec();
  }
  const setRecVisual = (on) => {
    recPill.classList.toggle('recing', on); recPill.classList.toggle('pri', !on);
    recPill.replaceChild(on ? vEq(4) : vIcon(VI.MIC, { size: 14, sw: 2 }), recPill.firstChild);
    recPill.lastChild.textContent = on ? '녹음 멈추기' : (recCount() > 0 ? '다시 떠올리기' : '떠올려 말하기');
  };
  const stopPlaying = () => { playing = false; listenPill.classList.remove('playing'); listenPill.lastChild.textContent = '듣기'; };

  listenPill.addEventListener('click', () => {
    if (state.recording) return;
    if (playing) { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } stopPlaying(); return; }
    if (!s?.sentence || !window.studySpeech?.speak) return;
    playing = true; listenPill.classList.add('playing'); listenPill.lastChild.textContent = '재생 중';
    window.studySpeech.speak(s.sentence, { lang: ttsLang, speaker: s?.speaker, onEnd: stopPlaying });
    setTimeout(stopPlaying, 30000);
  });

  // 녹음 종료·채점 — 수동 '멈추기' 클릭과 무음 자동종료가 공유. recCtrl null 가드로 중복 방지.
  async function finishRecording() {
    if (!state.recording || !recCtrl) return;
    const ctrlR = recCtrl; recCtrl = null;
    const result = await stopAndAnalyze(ctrlR, s.sentence, s);
    state.recording = false;
    if (result?.mockFallback) { setRecVisual(false); showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
    applyScore(Number(result?.score) || 0);
    setRecVisual(false);
    try {
      await savePronunciationLog(window.studyDB, { result, sentenceId: s.id, lang, date: getTodayISO() });
      await applyWeakPhonemesUpdate(window.studyDB, lang, result?.weakPhonemes);
    } catch (e) { console.error('[sessionReviewV2] pron persist', e); }
    handlers.saveSnapshot?.();
  }

  recPill.addEventListener('click', async () => {
    if (state.demo) {
      if (state.recording) return;
      state.recording = true; setRecVisual(true);
      setTimeout(() => { state.recording = false; applyScore(Math.min(84 + Math.min(recCount(), 2) * 4, 99)); setRecVisual(false); }, 1000);
      return;
    }
    if (!state.recording) {
      state.recording = true; setRecVisual(true);
      // 말 끝나면(발화 후 1.2초 무음) 자동 종료 — 듣기처럼 손 안 대도 마무리. 수동 멈추기도 유지.
      const rec = await startMicRecording({ autoStopSilenceMs: 2000, onAutoStop: () => { finishRecording(); } });
      // 마이크 불가 — 정답을 열지 않는다. 해설을 펼치면 공개되므로 막다른 길이 아니다.
      if (rec.error) { state.recording = false; recCtrl = null; state.micBlocked = true; setRecVisual(false); showRecordToast(recordErrorMessage(rec.error)); return; }
      recCtrl = rec.controller;
    } else {
      finishRecording();
    }
  });

  const srsRow = h('div', { class: 'vr-srs' }, h('span', {}, h('b', {}, `${reviewNo}번째`), ' 복습'),
    lastScore != null ? h('span', {}, '지난 점수 ', h('b', {}, String(lastScore))) : null,
    nextDate ? h('span', {}, '통과 시 다음 복습 ', h('b', {}, String(nextDate))) : null);
  const cardEl = h('div', { class: 'vr-card' }, h1El, koEl, srsRow, ctrl, meta);
  const hintEl = h('div', { class: 'vr-hint' }, h('i'),
    recallMode ? '한글을 보고 영어로 떠올려 말해 보세요 — 안 떠오르면 그대로 두고 해설을 펼치면 정답과 평가가 나와요'
      : '듣기 전에 먼저 떠올려 말해 보세요 — 기억이 더 단단해져요');


  let root, timeUpdate;
  if (state.size !== 'desktop') {
    // ── 모바일 단일 칼럼 (회상 우선) ──
    const mTime = h('span', { class: 'm-topb-time' }, state.time || '00:00');
    const mProg = Array.from({ length: total }, (_, i) => h('i', { class: i < idx ? 'fc' : '' }));
    const mTopb = h('div', { class: 'm-topb' },
      h('div', { class: 'm-topb-row' },
        h('button', { class: 'm-home', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
        h('span', { class: 'm-topb-meta' }, '복습 · ' + subjLabel),
        mTime),
      h('div', { class: 'm-prog' }, mProg));
    const mSteps = h('div', { class: 'm-steps' },
      Array.from({ length: total }, (_, i) => h('button', { class: 'm-rstep c' + (i + 1 === idx ? ' on' : i + 1 < idx ? ' done' : ''), type: 'button', onClick: () => handlers.onJump?.(i + 1) }, String(i + 1))),
      h('span', { class: 'sp' }), h('span', { class: 'pt' }, `${idx} / ${total}`));
    root = h('div', { class: 'vr' }, v2Style(VRM_CSS), v2Style(VSM_CSS),
      mTopb, mSteps,
      h('div', { class: 'm-pad' }, hintEl, cardEl, recWidget, drillsBlock, chainBlock, fold));
    timeUpdate = (t) => { mTime.textContent = t; };
  } else {
    // ── 데스크톱 3칼럼 ──
    const progBars = Array.from({ length: total }, (_, i) => h('i', { class: i < idx ? 'f' : '' }));
    // 신규 세션과 동일한 3칼럼: main(760) = 카드·응용·체이닝 / side(324) = 오늘 발화·표현 해설(+평가).
    // 해설을 메인에 넣으면 데스크톱이 모바일 단일 칼럼처럼 보인다 (2026-07-10 사용자 지적).
    const main = h('div', { class: 'vr-main' },
      h('div', { class: 'vr-crumb' }, h('span', { class: 'vr-scene' }, '복습 · ' + subjLabel),
        h('div', { class: 'vr-prog' }, progBars), h('span', { class: 'vr-prog-t' }, `${idx} / ${total}`)),
      hintEl, cardEl, drillsBlock, chainBlock);
    const side = h('aside', { class: 'vr-side' }, recWidget, fold);
    root = h('div', { class: 'vr' }, v2Style(VR_CSS), v2Style(VS_CSS), rail, h('div', { class: 'vr-mainwrap' }, main, side));
    timeUpdate = (t) => { const el = rail.querySelector('.tm'); if (el) el.textContent = t; };
  }
  host.appendChild(root);
  refreshDots(); refreshRec();
  const layout = { update(st) { if (st && 'time' in st) timeUpdate(st.time); } };
  return { cleanup: () => { try { window.studySpeech?.cancel?.(); if (recCtrl?.stop) recCtrl.stop(); } catch { /* noop */ } host.innerHTML = ''; }, layout };
}

/* 표현 학습 세션 — 데스크톱 C 파이널 v2 (작업지시서 §3)
 * 발화 누적 + 직전 기록 비교, 응용 연습 행 리스트, 단일 해설 패널, 발화 3회 게이트·콤보·점수 링.
 * 정본 시안: 작업지시서 v-session.jsx (SessV2)
 *
 * 라이브 녹음/채점은 기존 services 재사용 (startMicRecording·stopAndAnalyze·savePronunciationLog 등).
 * 시각만 v2 로 교체. 데모(?demo=1&view=session)는 마이크 없이 정적 렌더로 검증.
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, vCheck, v2Style, ensureV2Fonts,
  V_DOT_CSS, V_MINICAL_CSS, scoreDot, passDot, emptyDot, miniCalGrid, makeMiniTier, isoShift, mondayOf, DOW_KO } from '../components/v2/atoms.js';
import { exprOf, bumpRecLog } from '../components/d1/sessionShell.js';
import { startMicRecording, stopAndAnalyze } from '../services/sessionAnalyze.js';
import { savePronunciationLog, drillLogId, chainLogId, prodLogId, miniLogId, miniLinesOf } from '../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../services/weakPhonemes.js';
import { recordErrorMessage, showRecordToast } from '../components/session/recordToast.js';
import { speakWithFeedback } from '../components/session/atoms.js';
import { buildChainSteps, chainHint, filterNearDupDrills, pickPracticeVoice, firstWordsHint, exprMatch, PRACTICE_VOICES, JA_PRACTICE_VOICES, isPersonalCard, buildDialogueGroups } from '../components/session/applied.js';
import { judgeCoverageOf, judgeProduction, judgeRecording, isTooUnclear } from '../services/coverageJudge.js';
import { scoreForDisplay } from '../services/deductionScore.js';
import { localISODate } from '../utils/today.js';

const PASS_THRESHOLD = 80;
const DRILL_DOTS_MAX = 8; // 드릴 행 점수 원 렌더 상한 (2026-08-31) — 26px 원 8개가 행 폭 한계. 데이터는 전체 보존
/* 블록 표시 스위치 (2026-09-12 사용자 결정) — 체이닝·생산 연습은 화면에서 숨긴다. 코드·시드 필드·게이트·이력 키(#chain#·#prod#)는
 * 유지하고, 되살릴지 없앨지는 추후 결정. 테스트는 이 값을 켜서 두 블록의 계약을 계속 검증한다. */
export const SESSION_BLOCKS = { chainProd: false };
const MAIN_DOTS_MAX = 10; // 메인 문장 점수 원 상한 (2026-09-03, 5→10) — 7회째부터 2개가 숨어 '누락'으로 보였다. 지시는 "일정 숫자가 넘어가면 최신순"
/* 채점을 되돌릴 때의 안내 (2026-08-29) — 되돌린 이유가 셋이라 문구를 나눈다.
 * unclear = 음소 원시 점수만 바닥 (judgeRecording 경로 — 메인·응용 드릴 — 에선 내용 판정이 misread
 *           를 세우지 않은 경우. 체이닝·생산은 isTooUnclear 단독이라 내용은 묻지 않는다 — 통과 판정이
 *           따로 있기 때문. coverageJudge.isTooUnclear 주석 참조)
 * misread = 소리는 멀쩡한데 다른 문장
 * garbled = 둘 다 바닥 — 약한 신호인지 오발화인지 가를 근거가 없다 (실사용 보고: 또렷한 오발화가
 *           "또렷하게 안 들렸어요"로 오안내되던 비대칭의 뿌리. coverageJudge 주석 참조)
 * 원인을 확정 못 한 갈래에서는 특정 원인을 지목하지 않는다 — 틀린 원인을 지목하면 사용자가
 * 엉뚱한 것을 고치게 된다. 대신 어느 원인에서든 유효한 행동만 말한다: 문장 확인, 끝까지, 또박또박. */
export function recordGateMessage(reason) {
  if (reason === 'misread') return '다른 문장을 말한 것 같아요 — 다시 말해 보세요';
  if (reason === 'garbled') return '알아듣지 못했어요 — 문장을 확인하고 끝까지 또박또박 다시 말해 보세요';
  return '또렷하게 안 들렸어요 — 끝까지 또박또박 다시';
}
const SVG_NS = 'http://www.w3.org/2000/svg';

// 점수·통과 배지 등장 애니 재트리거 (전역 .score-pop = scorePop 키프레임, src/styles/session.css).
// remove→reflow→add 로 같은 요소에 반복 재생. reduce-motion 은 CSS 가 알아서 무시.
function popScore(el) {
  if (!el) return;
  el.classList.remove('score-pop');
  void el.offsetWidth; // 강제 reflow — 애니 재시작
  el.classList.add('score-pop');
}
function getTodayISO() { return window.studyDay?.TODAY_ISO || localISODate(); }

export const VS_CSS = `
.vs{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;display:flex;justify-content:center;word-break:keep-all;${V_VARS}}
.vs *{box-sizing:border-box;margin:0}
/* 시안 12a 는 1280 컨테이너 하나가 화면이다 — 사이드바 250 + 본문 1028(대화 548 · 우측 400 · padding 28 28 32 · gap 24).
   넓은 화면에서는 사이드바까지 한 프레임으로 묶어 가운데 둔다. 사이드바만 화면 끝에 남기면 대화와 300px 넘게
   벌어지고, 프레임 없이 대화만 늘리면 1280 기준 비율이 깨진다. 프레임 안에서는 시안 그대로 대화가 남는 폭을 먹는다. */
.vs-frame{display:flex;flex:1 1 auto;max-width:1278px;min-width:0}
.vs-mainwrap{flex:1 1 0%;display:flex;gap:24px;padding:28px 28px 32px;min-width:0}
.vs-ctrl{display:flex;align-items:center;gap:12px;margin-top:24px;min-height:56px;flex-wrap:wrap}
.vs-pill{position:relative;display:inline-flex;align-items:center;gap:9px;border-radius:999px;padding:13px 23px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1.5px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap}
.vs-pill.playing{border-color:var(--blue-line);color:var(--blue-deep);background:var(--blue-soft)}
/* 녹음 CTA 는 코랄 — 색 규약 '코랄=녹음'(v2/atoms.js 머리주석)과 구 D1(terra) 관례. 2026-07-22 복원. */
.vs-pill.pri{background:var(--coral);border-color:var(--coral);color:#fff;animation:v-breatheC 2.6s ease-in-out infinite}
.vs-pill.recing{background:var(--coral-deep);border-color:var(--coral-deep);color:#fff;animation:none}
.vs-pill.recing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-pill.playing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vs-ringhost{margin-left:auto;display:flex;align-items:center;gap:10px}
.vs-ring{position:relative;width:54px;height:54px;flex:0 0 auto;animation:v-settle .5s both}
.vs-ring svg{transform:rotate(-90deg)}
.vs-ring .cn{position:absolute;inset:0;display:grid;place-items:center;font-family:Outfit;font-size:15.5px;font-weight:700;color:var(--teal-deep)}
.vs-cap{font-size:11.5px;color:var(--faint);white-space:nowrap}
.vs-meta{display:flex;align-items:center;gap:12px;margin-top:22px;min-height:30px;flex-wrap:wrap;color:var(--faint)}
.vs-meta .tot{font-family:Outfit;font-size:12px;font-weight:700;color:var(--mut);white-space:nowrap;margin-left:auto}
.vs-meta .tot b{color:var(--ink)}
.vs-labrow{display:flex;align-items:baseline;justify-content:space-between;margin-top:26px}
.vs-lab{font-family:Outfit;font-size:10.5px;letter-spacing:.15em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-labrow .ct{font-family:Outfit;font-size:12px;color:var(--mut);font-weight:600;white-space:nowrap}
.vs-labrow .ct b{color:var(--teal-deep)}
.vs-drow{display:flex;align-items:center;gap:14px;padding:13px 2px;border-bottom:1px solid var(--line)}
.vs-drow:last-of-type{border-bottom:0}
.vs-drow .ix{font-family:Outfit;font-size:11px;color:var(--faint);width:16px;flex:0 0 auto;text-align:right}
.vs-drow .en{font-size:15.5px;font-weight:700;letter-spacing:-0.01em}
.vs-drow .en b{font-weight:800;background:linear-gradient(oklch(44% .062 192/.3),oklch(44% .062 192/.3)) 0 100%/100% 2.5px no-repeat;padding-bottom:2px}
.vs-drow .sub{font-size:12px;color:var(--faint);margin-top:3px}
.vs-drow .grow{flex:1}
.vs-drow.recing{background:var(--coral-soft);margin:0 -14px;padding-left:16px;padding-right:14px;border-radius:12px;border-bottom-color:transparent}
.vs-drow.vs-prod .en{font-size:15px}
.vs-cir{width:33px;height:33px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;position:relative;padding:0}
.vs-cir.eqq{border-color:var(--blue-line);color:var(--blue)}
/* 다음 차례(체이닝 현재 단계) — 어느 원을 눌러야 하는지 색으로 (§6.5). */
.vs-cir.next{border-color:var(--coral);color:var(--coral-deep)}
.vs-cir.recing{background:var(--coral);border-color:var(--coral);color:#fff}
.vs-cir.recing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-cir.playing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vs-prod-give{display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:0 0 1px;font:inherit;font-family:Pretendard,sans-serif;font-size:12px;font-weight:700;color:var(--teal-deep);background:none;border:0;border-bottom:1px solid oklch(44% .062 192/.3);cursor:pointer}
.vs-gscore{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.vs-gdots{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.vs-side{width:400px;flex:0 0 auto;display:flex;flex-direction:column;gap:14px}
.vs-rec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px 16px}
.vs-rec .hd{display:flex;justify-content:space-between;align-items:center;min-height:21px}
.vs-rec .lb{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-rec .msg{font-size:11.5px;color:var(--mut);margin-top:9px;line-height:1.5;text-align:center}
.vs-rec .msg b{color:var(--coral-deep)}
.vs-newrec{display:inline-flex;align-items:center;gap:5px;font-family:Outfit;font-size:10.5px;font-weight:800;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:4px 10px;white-space:nowrap;animation:v-settle .5s both}
.vs-uring{position:relative;margin:12px auto 0}
.vs-uring svg{transform:rotate(-90deg)}
.vs-uring .arc{transition:stroke-dashoffset .6s cubic-bezier(.3,.7,.3,1),stroke .3s}
.vs-uring .pl{position:absolute;inset:8px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-uring .cn{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vs-uring .n{font-family:Outfit;font-size:36px;font-weight:700;line-height:1;color:var(--ink)}
.vs-uring .n em{font-style:normal;font-family:Outfit;font-size:14px;font-weight:700;color:var(--coral-deep);margin-left:5px}
.vs-uring .pv{font-family:Outfit;font-size:11.5px;font-weight:700;color:var(--teal-deep);margin-top:7px;white-space:nowrap}
.vs-uring .pv.over{color:var(--coral-deep)}
.vs-hist{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px 20px;margin-top:13px}
.vs-hist .lb{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-panel{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px;margin-top:13px}
.vs-panel .ph2d{display:flex;justify-content:space-between;align-items:center;padding:18px 20px 0;cursor:pointer}
.vs-panel .chev{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;color:var(--mut);transition:transform .2s;flex:0 0 auto}
.vs-panel.open .chev{transform:rotate(180deg)}
.vs-klab{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-panel .inner{padding:14px 20px 20px;max-height:584px;overflow-y:auto}
.vs-kbox{background:var(--teal-soft);border-radius:12px;padding:12px 14px;font-size:12.5px;line-height:1.6}
.vs-kbox b{font-weight:700}
.vs-sec{margin-top:14px}
.vs-sec .b2{font-size:12.5px;line-height:1.7;color:#4a5450;margin-top:6px;text-wrap:pretty}
.vs-sec .b2 b{color:var(--ink)}
.vs-sec .b2 + .b2{margin-top:8px}
.vs-ex{border-left:2px solid var(--teal-line);padding:2px 0 2px 12px;margin-top:8px;font-size:12.5px;line-height:1.6;color:#4a5450}
.vs-ex b{color:var(--ink)}
.vs-ex .k{color:var(--faint);font-size:11.5px}
.vs-chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;max-width:100%}
/* 2026-07-22 — nowrap 이면 긴 음소 설명이 해설 박스를 넘어갔다. 줄바꿈 허용 + 라운드 완화. */
.vs-chip{font-size:11.5px;color:var(--mut);border:1px solid var(--line);border-radius:12px;padding:5px 11px;background:#fbf9f2;max-width:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;line-height:1.5}
.vs-next{width:100%;margin-top:13px;font:inherit;font-size:14.5px;font-weight:700;border-radius:13px;padding:15px 0;cursor:pointer;border:1.5px solid var(--teal);background:var(--teal);color:#fff;box-shadow:0 8px 16px -11px oklch(44% .062 192/.7)}
.vs-gate{font-size:11.5px;color:var(--faint);text-align:center;margin-top:9px;white-space:nowrap}
/* ── 대화 스테이지 (2026-09-14 시안 12a) — 대화가 곧 연습 화면. 줄 하나가 열려 문장 카드를 대신한다. ── */
.vs-stagewrap{flex:1 1 auto;min-width:0}
.vs-stage + .vs-stage{margin-top:26px}
.vs-stage.solo + .vs-stage.solo{margin-top:0}
.vs-stage-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.vs-stage-scene{font-size:13px;line-height:1.55;color:#4a5450;margin-top:6px;text-wrap:pretty}
.vs-stage-all{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border:1.5px solid transparent;border-radius:999px;padding:7px 14px;cursor:pointer;white-space:nowrap;flex:0 0 auto}
.vs-stage-all.playing{color:var(--blue-deep);background:var(--blue-soft);border-color:var(--blue-line)}
.vs-stage-lines{margin-top:16px;display:flex;flex-direction:column}
.vs-ln-sep{height:1px;background:transparent;margin:0 14px}
.vs-ln-sep.on{background:var(--line)}
.vs-ln{display:flex;flex-direction:column;border-radius:16px;border:1px solid transparent;padding:9px 14px}
.vs-ln.card{cursor:pointer}
.vs-ln.playing{background:var(--blue-soft)}
.vs-ln.recing{background:var(--coral-soft)}
.vs-ln.sel{background:var(--card);border-color:var(--line);box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.18);animation:v-settle .5s both}
.vs-ln-top{display:flex;align-items:center;gap:12px}
.vs-ln-num{width:20px;height:20px;border-radius:50%;border:1.5px solid transparent;font-family:Outfit;font-size:10.5px;font-weight:800;display:grid;place-items:center;flex:0 0 auto;color:transparent}
.vs-ln-num.card{border-color:var(--teal-line);color:var(--teal-deep)}
.vs-ln-num.done{border-color:var(--teal-soft);background:var(--teal-soft);color:var(--teal-deep)}
.vs-ln-num.on{border-color:var(--teal);background:var(--teal);color:#fff;animation:v-haloT 2.4s ease-in-out infinite}
.vs-ln-name{font-family:Outfit;font-size:12px;font-weight:700;width:34px;flex:0 0 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--mut)}
.vs-ln-name.me{color:var(--teal-deep)}
.vs-ln-body{min-width:0;flex:1 1 auto}
.vs-ln-en{font-size:17px;font-weight:600;color:#4a5450;letter-spacing:-.005em;line-height:1.4}
.vs-ln-en b{font-weight:800;background:linear-gradient(oklch(44% .062 192/.3),oklch(44% .062 192/.3)) 0 100%/100% 2.5px no-repeat;padding-bottom:2px}
.vs-ln.card .vs-ln-en,.vs-ln.cue .vs-ln-en{color:var(--ink)}
.vs-ln.card .vs-ln-en{font-weight:700}
.vs-ln.sel .vs-ln-en{font-size:20px;font-weight:800;color:var(--teal-deep)}
.vs-ln-kr{font-size:11.5px;font-weight:500;line-height:1.45;color:var(--teal-deep);margin-top:3px;letter-spacing:.01em}
.vs-ln-kr i{font-style:normal;color:var(--faint);font-weight:400}
.vs-ln-ko{font-size:13px;color:#4a5450;margin-top:4px;line-height:1.45}
.vs-ln-ko em{font-style:normal;color:var(--faint)}
.vs-ln-trace{display:flex;align-items:center;gap:5px;margin-top:7px;flex-wrap:wrap}
.vs-ln-trace .more{font-family:Outfit;font-size:11px;font-weight:600;color:var(--faint)}
.vs-ln-slot{padding-left:66px}
.vs-ln-slot .vs-ctrl{margin-top:14px}
.vs-ln-slot .vs-meta{margin-top:12px}
/* 좌측 사이드바 — 문장 목록 · 세그먼트바 (시안 12a) */
.vs-lside{width:250px;box-sizing:border-box;flex:0 0 auto;border-right:1px solid var(--line);padding:22px 18px 20px;display:flex;flex-direction:column;gap:18px}
.vs-lside .hmrow{display:flex;align-items:center;justify-content:space-between}
.vs-lside .hm{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:600;color:var(--mut);background:none;border:0;padding:0;cursor:pointer}
.vs-lside .tm{font-family:Outfit;font-size:11px;color:var(--faint);letter-spacing:.08em;white-space:nowrap}
.vs-lside .cnt{font-family:Outfit;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1;color:var(--teal-deep);margin-top:8px}
.vs-lside .cnt em{font-style:normal;color:var(--faint);font-weight:400}
.vs-lside .sp{flex:1}
.vs-lside .endbtn{font:inherit;font-size:12px;color:var(--faint);background:none;border:0;padding:0;cursor:pointer;align-self:flex-start;white-space:nowrap}
.vs-seg{display:flex;gap:5px;margin-top:12px}
.vs-seg > span{flex:1;display:flex;align-items:center;padding:6px 0;margin:-6px 0;cursor:pointer}
.vs-seg i{width:100%;height:4px;border-radius:2px;background:#e7e3d4;transition:background .2s}
.vs-seg i.f{background:var(--teal)}
.vs-nav{display:flex;flex-direction:column;gap:2px;margin:0 -8px}
.vs-nav-it{display:flex;gap:10px;align-items:flex-start;text-align:left;padding:10px;border-radius:12px;background:transparent;border:0;width:100%;cursor:pointer;color:inherit;font:inherit}
.vs-nav-it.on{background:var(--teal-soft)}
.vs-nav-num{width:20px;height:20px;border-radius:50%;border:1.5px solid #d5d1c2;font-family:Outfit;font-size:10.5px;font-weight:800;display:grid;place-items:center;flex:0 0 auto;margin-top:1px;color:var(--faint)}
.vs-nav-num.done{border-color:var(--teal-soft);background:var(--teal-soft);color:var(--teal-deep)}
.vs-nav-num.on{border-color:var(--teal);background:var(--teal);color:#fff}
.vs-nav-tx{min-width:0;flex:1 1 auto}
.vs-nav-en{display:block;font-size:13.5px;font-weight:700;letter-spacing:-.01em;line-height:1.35;color:var(--ink)}
.vs-nav-it.on .vs-nav-en{color:var(--teal-deep)}
.vs-nav-it.done .vs-nav-en{color:var(--mut)}
.vs-nav-ko{display:block;font-size:11.5px;color:var(--faint);margin-top:2px}
.vs-nav-prog{display:block;font-family:Outfit;font-size:10.5px;font-weight:600;color:var(--teal-deep);margin-top:4px}
.vs-drills{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 20px 16px}
.vs-drills .vs-labrow{margin-top:0}
.vs-drills-expr{font-size:14.5px;font-weight:700;letter-spacing:-.01em;color:var(--teal-deep);margin-top:8px;line-height:1.35}
.vs-drow3{padding:10px 2px;gap:11px}
.vs-drow3 .ix{width:12px}
.vs-rec.prevtop .hd .pv{font-family:Outfit;font-size:11px;font-weight:700;color:var(--teal-deep);white-space:nowrap;margin:0}
.vs-rec.prevtop .hd .pv.over{color:var(--coral-deep)}
.vs-rec.prevtop{padding:14px 16px 12px}
.vs-rec.prevtop .vs-uring{margin:10px auto 0}
.vs-rec.prevtop .msg{font-size:11px;margin-top:8px;text-wrap:pretty}
.vs-rec.prevtop .hd .pv{font-family:Outfit;font-size:11px;font-weight:700;color:var(--teal-deep);white-space:nowrap;margin:0}
.vs-rec.prevtop .hd .pv.over{color:var(--coral-deep)}
.vs-rec.prevtop{padding:14px 16px 12px}
.vs-rec.prevtop .vs-uring{margin:10px auto 0}
.vs-rec.prevtop .msg{font-size:11px;margin-top:8px;text-wrap:pretty}
.vs-drow3 > div{min-width:0;flex:1 1 auto}
.vs-drow3 .en{font-size:14px}
.vs-drow3 .vs-ln-kr{font-size:11px}
.vs-drow3 .vs-ln-ko{font-size:12.5px}
/* 좁은 데스크톱(1024~1100) — 대화 옆에 400 패널이 같이 서면 대화가 355 까지 눌린다. 세로로 쌓되
   본문이 사이드바 옆 남는 폭을 그대로 채운다(가운데로 모으면 사이드바 옆이 100px 넘게 빈다). */
@media (max-width:1100px){.vs-mainwrap{flex-direction:column}.vs-stagewrap{flex:0 1 auto;width:100%;max-width:none}.vs-side{width:100%;max-width:none}}
${V_DOT_CSS}${V_MINICAL_CSS}
`;

function ringEl(score) {
  const wrap = h('div', { class: 'vs-ring' });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '54'); svg.setAttribute('height', '54'); svg.setAttribute('viewBox', '0 0 54 54');
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', '27'); track.setAttribute('cy', '27'); track.setAttribute('r', '23');
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', '#eae6d8'); track.setAttribute('stroke-width', '5');
  const arc = document.createElementNS(SVG_NS, 'circle');
  const off = 144.5 - Math.round((Math.min(Math.max(score, 0), 100) / 100) * 1245) / 10;
  arc.setAttribute('cx', '27'); arc.setAttribute('cy', '27'); arc.setAttribute('r', '23');
  arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', 'oklch(44% .062 192)'); arc.setAttribute('stroke-width', '5');
  arc.setAttribute('stroke-linecap', 'round'); arc.setAttribute('stroke-dasharray', '144.5'); arc.setAttribute('stroke-dashoffset', String(off));
  svg.append(track, arc);
  wrap.append(svg, h('span', { class: 'cn' }, score != null ? String(score) : '—'));
  return wrap;
}

/* ── 오늘 발화 링 카드 (§6.6① · §6.8) — 신규·복습 공통 ──
 * 분모는 '직전 학습일 발화 수'. 넘어서면 링이 코랄로 바뀌고 안쪽 확산 펄스(§3.3 (A) — 기존 v-pulse 재사용)가 돈다.
 * 잔여 계산 헬퍼는 pr.js 에 없다 — 여기서 (직전 − 오늘) 로 구한다.
 */
/* prevTop (2026-09-14 시안 12a §2-2 5번) — 직전 기록을 카드 윗줄 오른쪽으로 올리고 링 안에는 숫자만 둔다.
 * 기본값은 종전 구성(링 안 pv + 윗줄 기록 갱신 칩) 그대로라 복습(utterRingCard({size:140,caption:false}))은 무영향. */
export function utterRingCard({ size = 140, caption = true, prevTop = false } = {}) {
  const r = size === 140 ? 59 : Math.round((size - 22) / 2);
  const circ = Math.round(2 * Math.PI * r * 10) / 10;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const mk = (cls) => {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', String(size / 2)); c.setAttribute('cy', String(size / 2)); c.setAttribute('r', String(r));
    c.setAttribute('fill', 'none'); c.setAttribute('stroke-width', '9');
    svg.appendChild(c);
    return c;
  };
  const track = mk('tk');
  const arc = mk('arc');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('stroke-dasharray', String(circ));
  arc.setAttribute('stroke-dashoffset', String(circ));

  const nEl = h('span', { class: 'n', style: prevTop ? 'font-size:24px' : '' }, '0');
  const pvEl = h('span', { class: 'pv' }, '');
  const pulse = h('i', { class: 'pl', style: 'display:none;' });
  const ring = h('div', { class: 'vs-uring', style: `width:${size}px;height:${size}px` },
    svg, pulse, h('span', { class: 'cn' }, nEl, prevTop ? null : pvEl));
  const chip = h('span', { class: 'vs-newrec', style: 'display:none;' }, vIcon(VI.ZAP, { size: 10, fill: true }), '기록 갱신!');
  const msg = h('div', { class: 'msg' }, '');
  const el = h('div', { class: 'vs-rec' + (prevTop ? ' prevtop' : '') },
    h('div', { class: 'hd' }, h('span', { class: 'lb' }, '오늘 발화'), prevTop ? pvEl : chip),
    ring, caption ? msg : null);

  function update(today, prev) {
    const t = Math.max(0, Number(today) || 0);
    const p = Math.max(0, Number(prev) || 0);
    const over = p > 0 && t > p;
    nEl.textContent = String(t); // 자식(+N)도 함께 초기화된다
    if (over) nEl.appendChild(h('em', {}, `+${t - p}`));
    track.setAttribute('stroke', over ? 'oklch(58% .115 32/.15)' : '#ece8da');
    arc.setAttribute('stroke', over ? 'oklch(58% .115 32)' : 'oklch(44% .062 192)');
    const ratio = p > 0 ? Math.min(t / p, 1) : 0;
    arc.setAttribute('stroke-dashoffset', String(Math.round(circ * (1 - ratio) * 10) / 10));
    pulse.style.display = over ? '' : 'none';
    if (!prevTop) chip.style.display = over ? '' : 'none';
    pvEl.className = 'pv' + (over ? ' over' : '');
    pvEl.textContent = p > 0 ? (over ? `직전 ${p} 넘김` : `직전 ${p}회`) : '';
    if (!caption) return;
    // 직전 기록이 없거나 이미 넘었으면 캡션을 붙이지 않는다 (없는 숫자를 지어내지 않음).
    msg.innerHTML = (p > 0 && !over) ? `<b>${p - t}회</b>만 더 말하면 직전 세션 기록을 깨요!` : '';
  }
  update(0, 0);
  return { el, update };
}

/* ── 공부 이력 · 최근 4주 (§6.6②) — 셀 안 숫자 없이 농도만. 오늘 칸은 발화가 쌓이면 실시간으로 진해진다. */
export function historyCalCard(todayISO, dayMap, todayCount, prDays) {
  const start = isoShift(mondayOf(todayISO), -21);
  const dates = Array.from({ length: 28 }, (_, i) => isoShift(start, i));
  const el = h('div', { class: 'vs-hist' }, h('span', { class: 'lb vs-histlab' }, '공부 이력'));
  const countOf = (iso) => (iso === todayISO ? todayCount() : Number(dayMap?.[iso]) || 0);
  const pr = new Set(prDays || []); // 개인기록 달성일 = 코랄 칸
  // 하루 발화 수는 사람마다 스케일이 다르다 — 이 4주 창의 분포로 3단을 잡는다.
  const build = () => miniCalGrid(dates, {
    countOf, todayISO, prDays: pr,
    tierOf: makeMiniTier(dates.filter((iso) => iso <= todayISO).map(countOf)),
  });
  let grid = build();
  el.appendChild(grid);
  return {
    el,
    update() { const next = build(); grid.replaceWith(next); grid = next; },
  };
}

/* 핵심 표현 밑줄 — 매칭 규칙(자리표시자 와일드카드)은 applied.js exprMatch 가 정본.
 * 게이트(validate-seed)가 같은 함수를 써야 "밑줄 없음" 판정이 화면과 갈리지 않는다. */
export function hlNode(text, term) {
  if (!term) return document.createTextNode(text);
  const hit = exprMatch(text, term);
  if (!hit) return document.createTextNode(text);
  const frag = document.createDocumentFragment();
  frag.append(document.createTextNode(text.slice(0, hit.index)));
  const b = document.createElement('b'); b.textContent = text.slice(hit.index, hit.index + hit.length); frag.appendChild(b);
  frag.append(document.createTextNode(text.slice(hit.index + hit.length)));
  return frag;
}

/* 표현 해설 패널 — 단일 스크롤 (탭 금지). ex 필드 graceful.
 * 복습 세션(sessionReviewV2)도 같은 패널을 쓴다 — 해설이 두 화면에서 달라지지 않게 (2026-07-10 사용자 지시).
 * 복습은 자체 '표현 해설' 헤더를 이미 가지므로 showHeader=false 로 부른다. */
export function explainPanel(ex, showHeader = true) {
  const inner = h('div', { class: 'inner' });
  if (ex?.key) inner.appendChild(h('div', { class: 'vs-kbox', style: 'margin-top:10px;' }, hlNode(String(ex.key), null)));
  const situation = ex?.situation || ex?.whenToUse;
  if (situation) inner.appendChild(h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '이런 상황에서 써요'), h('div', { class: 'b2' }, String(situation))));
  if (Array.isArray(ex?.grammar) && ex.grammar.length) {
    const sec = h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '문법 뜯어보기'));
    ex.grammar.forEach((g, i) => {
      const struct = typeof g === 'string' ? g : (g?.struct || '');
      const body = (g && typeof g === 'object') ? g.body : '';
      if (i === 0) sec.appendChild(h('div', { class: 'b2' }, h('b', {}, struct), body ? ' — ' + body : ''));
      else sec.appendChild(h('div', { class: 'vs-ex' }, h('b', {}, struct), body ? [document.createElement('br'), h('span', { class: 'k' }, body)] : null));
    });
    inner.appendChild(sec);
  }
  if (Array.isArray(ex?.phonemes) && ex.phonemes.length) {
    inner.appendChild(h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '주의 음소'),
      h('div', { class: 'vs-chips' }, ex.phonemes.map((p) => h('span', { class: 'vs-chip' }, Array.isArray(p) ? (p[0] + ' ' + (p[1] || '')).trim() : String(p))))));
  }
  const mistake = ex?.mistake || ex?.commonMistakes;
  if (mistake) inner.appendChild(h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '한국인 실수'), h('div', { class: 'b2' }, String(mistake))));
  let similar = null;
  if (typeof ex?.similar === 'string') similar = ex.similar;
  else if (Array.isArray(ex?.similar)) similar = ex.similar.map((x) => x?.expression || x).filter(Boolean).join(' / ');
  if (similar) inner.appendChild(h('div', { class: 'vs-sec' }, h('div', { class: 'vs-klab' }, '비슷한 표현'), h('div', { class: 'b2' }, similar)));

  return h('div', { class: 'vs-panel' },
    showHeader ? h('div', { class: 'ph2d' }, h('span', { class: 'vs-klab' }, '표현 해설'), h('span', { class: 'vs-klab', style: 'letter-spacing:.08em' }, '스크롤 ↓')) : null,
    inner,
  );
}

/* 행 점수 저장 형식 정규화 — 숫자(구 스냅샷) | 숫자 배열 | 빈 값. */
export function normScores(v) {
  if (Array.isArray(v)) return v.map((x) => Math.round(Number(x) || 0));
  return Number.isFinite(v) ? [Math.round(v)] : [];
}

/* 응용 연습 행 — 듣기/녹음 (services 재사용). onScore(i, result): 채점 성공 시 세션 집계 위임.
 * demo=true 면 마이크 없이 시뮬 채점 (?demo=1 화면 검증용 — 메인 recPill 데모 분기와 동일).
 * 재생은 체이닝과 동일하게 매번 화자 변주 + 길이별 속도 — 카드 화자 고정 폐기 (2026-07-22 사용자 지시). */
/** ja 드릴의 가나 보조 표기 — 본문과 같으면(구두점 차이 포함) 중복이라 표시하지 않는다. */
export function kanaSub(kana, target) {
  if (!kana) return null;
  const strip = (x) => String(x).replace(/[、。！？\s]/g, '');
  return strip(kana) === strip(target) ? null : kana;
}

/* 드릴 행 부제의 이력 조각 — 기록이 없으면 빈 문자열이라 부제가 종전과 같다. */
function histSub(h0) {
  const count = Number(h0?.count) || 0;
  if (!count) return '';
  return Number.isFinite(h0?.avg) ? `이전 ${count}회 평균 ${h0.avg}` : `이전 ${count}회`;
}

/* threeLine (2026-09-14 시안 12a) — 우측 패널·폰에서 응용 행을 대화 줄과 같은 세 줄(영문 / [발음] / 뜻)로
 * 그리고 점수는 문장 아래 흔적 줄로 내린다. 점수 원을 버튼 옆 가로에 두면 원 6개에서 문장이 세로로 눌린다.
 * 복습(sessionReviewV2)이 같은 함수를 쓰므로 기본값은 종전 한 줄 부제 + 버튼 옆 점수다. */
export function drillRows(drills, hlTerm, lang, onScore, demo, { saved, history, threeLine = false } = {}) {
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  let recCtrl = null, recRow = null, plays = 0;
  return (Array.isArray(drills) ? drills : []).map((d, i) => {
    // saved[i] = 이 세션에서 이미 받은 점수들 (state.exLog 복원) — 재렌더에도 배지 유지.
    // 구 스냅샷은 숫자 1개로 저장돼 있다 (2026-08-21 형식) — 배열로 정규화해 읽는다.
    // 렌더는 최근 DRILL_DOTS_MAX 개만 — 이력이 길어져도 행 폭을 지킨다 (2026-08-31, 데이터는 전체 보존)
    const hist = normScores(saved?.[i]);
    const moreEl = threeLine ? h('span', { class: 'more' }) : null;
    const scoreEl = h('span', { class: threeLine ? 'vs-ln-trace' : 'vs-gscore', style: hist.length ? '' : 'display:none;' },
      hist.slice(-DRILL_DOTS_MAX).map((v) => scoreDot(v, { size: 26, fresh: false })), moreEl);
    if (moreEl) moreEl.textContent = hist.length > DRILL_DOTS_MAX ? `+${hist.length - DRILL_DOTS_MAX}` : '';
    /* ja 드릴은 본문이 d.ja 다 (en 은 d.en). d.en 만 읽던 탓에 일본어 드릴이 본문 없이
     * 음차·뜻만 뜨고 TTS·채점 대상도 빈 문자열이었다 (2026-08-28 수정). */
    const target = d.ja || d.en || '';
    // 길이 지표: en 은 단어 수, ja 는 띄어쓰기가 없어 글자 수로 센다.
    const lenUnit = lang === 'ja'
      ? target.replace(/[、。！？\s]/g, '').length
      : String(target).trim().split(/\s+/).filter(Boolean).length;
    const playBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    // 재생 중 이퀄라이저 + 블루 펄스 (2026-07-22 — 종전엔 눌러도 아무 반응이 없었다)
    playBtn.addEventListener('click', () => {
      plays += 1;
      const v = pickPracticeVoice(plays, lenUnit, lang);
      speakWithFeedback(playBtn, target, { lang: ttsLang, voice: v.voice, rate: v.rate });
    });
    const recBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    /* ja 는 가나 읽기를 함께 — 학습자가 한자를 거의 못 읽는다. 한자 0개라 가나가
     * 본문과 같으면 같은 줄이 두 번 나오므로 생략한다 (구두점 차이는 무시).
     * 이전 발화 이력 (2026-08-29 사용자 요구 "몇 번 발화했고 보통 몇 점인지") — 오늘 시도는
     * 행의 점수 원이 이미 보여주므로 오늘 이전만 센다 (pronunciationLog.summarizeDrillLog). */
    const hs = histSub(history?.[String(target).trim()]);
    const textBlock = threeLine
      ? h('div', {},
        h('div', { class: 'en' }, hlNode(target, hlTerm)),
        d.kr ? h('div', { class: 'vs-ln-kr' }, h('i', {}, '['), d.kr, h('i', {}, ']')) : null,
        h('div', { class: 'vs-ln-ko' }, [kanaSub(d.kana, target), d.ko, hs].filter(Boolean).join(' · ')),
        scoreEl)
      : h('div', {},
        h('div', { class: 'en' }, hlNode(target, hlTerm)),
        h('div', { class: 'sub' }, [kanaSub(d.kana, target), d.kr, d.ko, hs].filter(Boolean).join(' · ')));
    const row = threeLine
      ? h('div', { class: 'vs-drow vs-drow3' }, h('span', { class: 'ix' }, String(i + 1)), textBlock, playBtn, recBtn)
      : h('div', { class: 'vs-drow' }, h('span', { class: 'ix' }, String(i + 1)), textBlock,
        h('span', { class: 'grow' }), scoreEl, playBtn, recBtn);
    recBtn.addEventListener('click', async () => {
      if (demo) {
        // 데모 — 마이크 없이 시뮬 채점 (화면 검증). 행 단위 진행 표시.
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); recBtn.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); recBtn.classList.remove('recing');
          const result = { score: Math.min(82 + i * 4, 99), weakPhonemes: ['ð'] };
          pushScore(result.score);
          onScore?.(i, result);
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finishDrill(); return; }
      // 말 끝나면 자동 종료 — 메인 카드와 동일. 수동 멈추기도 유지.
      /* 무음 대기 1.4초 (2026-09-01 사용자 결정 — "채점 시간은 최대한 짧게").
       * 7월 실사고(중간 쉼>1.2초 잘림→8점 오기록, 0120130)로 2.0초였으나, 지금은 판정 게이트가
       * 잘린 녹음(단어 누락+저점)을 기록 전에 차단해 최악이 '오점수'가 아니라 '재시도 안내'다.
       * 무판정 종료(hangover)의 하한 1.2초 위는 유지. 조기 종결은 그보다 이를 수 있으나, 선채점이
       * 전 단어 발화(omissions 0)를 확인한 때만 발동한다 — 부분 발화 실측 3종(2026-09-01)에서
       * 미발화 단어가 전부 omission 으로 찍혀 중간 쉼엔 걸리지 않는다. 발화 끝 → 점수 ~1.0~1.3초. */
      const r = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: target, card: { lang } }, onAutoStop: () => finishDrill() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); recBtn.classList.add('recing');
    });
    // 드릴 녹음 종료·채점 — 수동 멈추기와 무음 자동종료 공유. recRow 가드로 중복/오행 방지.
    async function finishDrill() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); recBtn.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, target, { lang }, { enableMiscue: true });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      // 오발화(다른 문장·아무 발음)는 점수로도 발화로도 세지 않는다 — 메인 카드와 같은 계약.
      const judged = judgeRecording(result, target);
      if (!judged.record) { showRecordToast(recordGateMessage(judged.reason)); return; }
      /* 화면·기록 점수 = 감점제 (2026-08-31 3단계 전환, 사용자 지시) — 정확도 단독은 유치·단조
       * 발화를 못 깎는다(실측: 유치 발화 acc 97·pros 82). 원 acc 는 result.accuracyScore 로 행에 남는다.
       * ja 는 en 코퍼스 보정 전이라 acc 유지 (scoreForDisplay 주석). */
      const scored = scoreForDisplay(result, target, lang);
      pushScore(scored.score);
      onScore?.(i, scored);
    }
    /* 시도할 때마다 점수 원이 하나씩 붙는다 — 같은 문장을 여러 번 말한 흔적이 곧 기록이다. */
    function pushScore(raw) {
      hist.push(Math.round(Number(raw) || 0));
      const shown = hist.slice(-DRILL_DOTS_MAX);
      scoreEl.replaceChildren(...shown.map((v, k) => scoreDot(v, { size: 26, fresh: k === shown.length - 1 })));
      if (moreEl) {
        moreEl.textContent = hist.length > DRILL_DOTS_MAX ? `+${hist.length - DRILL_DOTS_MAX}` : '';
        scoreEl.appendChild(moreEl);
      }
      scoreEl.style.display = '';
      popScore(scoreEl);
    }
    return row;
  });
}

/* 체이닝 — 무자막 청각 확장 (elicited imitation, 2026-07-09 사용자 결정).
 * 단계 = chunks 누적. 화면에 영어를 보여주지 않는다(= 인출 강제, "보고 따라 읽기" 폐기).
 * 재생마다 화자·속도를 바꿔 '리듬 통째 암기'를 막는다. 통과 판정은 발음 점수가 아니라 **단어 누락 0**
 * (전사 vs 기대문 — judgeCoverage. Azure omission 판정은 false omission 실측으로 폐기 2026-07-12).
 * 3회 실패부터 힌트(뜻 → 첫 단어 → 전체 공개).
 * 체이닝 발화도 '오늘 발화' 1건 — onUtterance(result) 로 세션 집계·3회 게이트에 반영(응용 드릴과 동일).
 * demo(?demo=1) 는 마이크 없이 통과 시뮬. */
export function chainBlockEl(chain, lang, card, demo, onUtterance, { saved, onSave, scores } = {}) {
  const steps = buildChainSteps(chain);
  if (!steps.length) return null;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  // saved.cur = 이미 통과한 단계 수 (state.exLog 복원)
  let cur = Math.min(Math.max(Number(saved?.cur) || 0, 0), steps.length);
  let plays = 0, fails = 0, recCtrl = null, recRow = null;

  const hintEl = h('div', { class: 'vs-gate', style: 'text-align:left;margin-top:10px;min-height:18px;white-space:normal;' }, '');
  const countEl = h('b', {}, String(cur));
  const rowEls = [];

  // 안내문은 두지 않는다 (§4.3) — 실패했을 때 나오는 실제 힌트만 남긴다.
  const renderHint = () => {
    const step = steps[cur];
    if (!step) { hintEl.textContent = ''; return; }
    const { kind, text } = chainHint(fails, { stepText: step.text, ko: chain.ko, isLast: cur === steps.length - 1 });
    if (kind === 'none') { hintEl.textContent = ''; return; }
    if (kind === 'ko') hintEl.textContent = `힌트 · 뜻: ${text}`;
    else if (kind === 'first') hintEl.textContent = `힌트 · 시작: ${text}`;
    else hintEl.textContent = `힌트 · 전체: ${text}`;
  };
  const refresh = () => {
    rowEls.forEach((r, i) => {
      const active = i === cur;
      r.row.style.opacity = i < cur ? '0.5' : active ? '1' : '0.35';
      r.playBtn.disabled = !active;
      r.recBtn.disabled = !active;
      r.recBtn.classList.toggle('next', active);
      r.mark.style.display = i < cur ? '' : 'none';
    });
    countEl.textContent = String(cur);
    if (cur >= steps.length) hintEl.textContent = '';
    else renderHint();
  };
  const advance = () => { cur += 1; fails = 0; onSave?.({ cur }); refresh(); };

  steps.forEach((step, i) => {
    const wc = step.text.trim().split(/\s+/).filter(Boolean).length;
    const mark = h('span', { class: 'vs-gscore', style: 'display:none;' }, passDot({ size: 26 }));
    /* 단계 행 점수 원 (2026-09-03) — 드릴 행과 같은 규약: 과거 이력(scores[i]) + 이번 시도 누적, 최근 8개 렌더.
     * 통과 ✓(mark)는 커버리지 판정이라 별도 유지 — 점수 원은 '말한 흔적', ✓는 '단계 통과'. */
    const hist = normScores(scores?.[i]);
    const scoreEl = h('span', { class: 'vs-gdots', style: hist.length ? '' : 'display:none;' },
      hist.slice(-DRILL_DOTS_MAX).map((v) => scoreDot(v, { size: 26, fresh: false })));
    const pushScore = (raw) => {
      hist.push(Math.round(Number(raw) || 0));
      const shown = hist.slice(-DRILL_DOTS_MAX);
      scoreEl.replaceChildren(...shown.map((v, k) => scoreDot(v, { size: 26, fresh: k === shown.length - 1 })));
      scoreEl.style.display = '';
    };
    const playBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    const recBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const row = h('div', { class: 'vs-drow' },
      h('span', { class: 'ix' }, String(i + 1)),
      h('div', {}, h('div', { class: 'en' }, `${i + 1}단계 · ${wc}단어`)),
      h('span', { class: 'grow' }), scoreEl, mark, playBtn, recBtn);

    playBtn.addEventListener('click', () => {
      if (i !== cur || !window.studySpeech?.speak) return;
      plays += 1;
      const v = pickPracticeVoice(plays, wc); // 매 재생마다 화자 변주 + 단계 길이별 속도
      speakWithFeedback(playBtn, step.text, { lang: ttsLang, voice: v.voice, rate: v.rate });
    });

    async function finish() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); recBtn.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, step.text, card, { enableMiscue: true });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      /* 음질 게이트 (2026-08-29) — 소리가 무너진 녹음은 발화로도 세지 않는다. 통과 판정(judgeCoverage)은
       * 전사가 무너져 어차피 실패하지만, onUtterance 가 '오늘 발화'·pronScores·3회 게이트를 올린다. */
      if (isTooUnclear(result)) { showRecordToast(recordGateMessage('unclear')); return; }
      // 발화 집계 점수도 감점제 통일 (2026-08-31) — 통과 판정(judgeCoverage)은 아래에서 원본 사용.
      const scored = scoreForDisplay(result, step.text, lang);
      pushScore(scored.score);
      onUtterance?.(scored, { kind: 'chain', i, target: step.text }); // 메타로 저장·스냅샷 (2026-09-03)
      // 2026-07-12 — 통과 판정을 Azure omission(passesCoverage) → 전사 비교(judgeCoverage)로 교체.
      // Azure 가 긴 L2 문장에서 false omission 을 내던 실측(coverageJudge.js 박제) 후속 배선.
      // ※ enableMiscue:true 유지 필수 — false 면 recognizedText 가 레퍼런스를 에코해 항상 통과(실측 2026-07-12).
      // 원천은 Lexical 우선(judgeCoverageOf, 2026-09-06) — Display 의 숫자 표기("two"→"2")가 누락으로 잡히던 것.
      const judge = judgeCoverageOf(result, step.text);
      if (judge.pass) { advance(); popScore(mark); return; } // 방금 통과한 단계 mark 팝
      fails += 1;
      const miss = judge.missing.length;
      showRecordToast(miss ? `${miss}개 빠뜨렸어요 — 다시 들어보세요` : '다시 한 번 말해 보세요');
      refresh();
    }

    recBtn.addEventListener('click', async () => {
      if (i !== cur) return;
      if (demo) {
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); recBtn.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); recBtn.classList.remove('recing');
          pushScore(90);
          onUtterance?.({ score: 90, omissions: [], weakPhonemes: [] }, { kind: 'chain', i, target: step.text });
          advance(); popScore(mark); // 방금 통과한 단계 mark 팝 (실경로와 동일)
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finish(); return; }
      const r = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: step.text, card }, onAutoStop: () => finish() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); recBtn.classList.add('recing');
    });

    rowEls.push({ row, playBtn, recBtn, mark });
  });

  const block = h('div', { class: 'vs-chain', style: 'margin-top:26px;' },
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '체이닝'),
      h('span', { class: 'ct' }, '통과 ', countEl, ' / ' + steps.length)),
    h('div', { style: 'margin-top:4px;' }, rowEls.map((r) => r.row)),
    hintEl);
  refresh();
  return block;
}

/* 미니대화 (2026-09-08 작업지시서 §1~§4, 2026-09-12 대화 단위 세션 1차) — 타깃 표현이 어떤 상대 발화·상황 뒤에 나오는지 듣고 말한다.
 * 위치는 문장 카드 **아래**. 줄마다 듣기 + **녹음**(2026-09-12 사용자 결정 — 2026-09-08 '듣기 전용'을 뒤집음). 녹음은 응용 행과 같은
 * 채점·점수 원·세션 집계(onScore)·이력(#mini#)이고, 진행 조건(게이트·판정·잠금)·SRS 영향은 없다.
 * 신규 세션은 카드 아래에 바로, 복습 세션(sessionReviewV2)은 정답 공개 뒤에만 쓴다(타깃 줄이 정답을 품는다).
 * 행 구조는 응용 행(.vs-drow)과 같아 버튼 열이 같은 자리에 온다. 필드가 없으면 null. 화자 칸은 name 이 있으면 이름, 없으면 speaker 글자.
 * scene(= explanation.situation) 이 있으면 라벨 아래 장면 한 줄. demo 는 마이크 없이 시뮬. */
export const MINI_VOICES = {
  A: 'en-US-AvaMultilingualNeural',    // 여성 (소연 등)
  B: 'en-US-AndrewMultilingualNeural', // 남성 (학습자 지오 등) — 성별로만 나눈다 (사용자 2026-09-13)
};
const MINI_CSS = `
.vs-mini-all{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border:0;border-radius:999px;padding:6px 12px;cursor:pointer;white-space:nowrap}
.vs-mini-scene{font-size:12.5px;line-height:1.5;color:var(--faint);margin:6px 2px 0}
.vs-mini-line{position:relative;isolation:isolate}
.vs-mini-line .ix{width:auto;min-width:16px;max-width:48px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vs-mini-line.tgt{border-bottom-color:transparent}
.vs-mini-line.tgt::before{content:"";position:absolute;inset:2px -10px;background:var(--teal-soft);border-radius:12px;z-index:-1}
.vs-mini-line.tgt .en,.vs-mini-line.tgt .ix{color:var(--teal-deep)}
.vs-mini-line.tgt .en{font-weight:800}`;
export function miniDialogueEl(md, s, lang, expr, { demo = false, onScore, saved, scene } = {}) {
  const lines = miniLinesOf(md);
  if (!lines.length) return null;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const target = String(s?.sentence ?? '').trim();
  const voiceOf = (sp) => MINI_VOICES[String(sp ?? '').trim().toUpperCase()] || MINI_VOICES.A;
  let recCtrl = null, recRow = null;
  const rows = lines.map((l, i) => {
    const isT = l.en.trim() === target;
    const hist = normScores(saved?.[i]);
    const scoreEl = h('span', { class: 'vs-gscore', style: hist.length ? '' : 'display:none;' },
      hist.slice(-DRILL_DOTS_MAX).map((v) => scoreDot(v, { size: 26, fresh: false })));
    const play = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    play.addEventListener('click', () => speakWithFeedback(play, l.en, { lang: ttsLang, voice: voiceOf(l.speaker), rate: 1.0 }));
    const rec = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const row = h('div', { class: 'vs-drow vs-mini-line' + (isT ? ' tgt' : ''), 'data-speaker': String(l.speaker ?? '') },
      h('span', { class: 'ix' }, String(l.name || l.speaker || '')),
      // 부제 = 응용 행(drillRows)과 같은 구성: 한글 발음(kr) · 뜻(ko). 둘 다 없으면 부제 없음.
      h('div', {}, h('div', { class: 'en' }, isT ? hlNode(l.en, expr) : l.en),
        [l.kr, l.ko].filter(Boolean).length ? h('div', { class: 'sub ko' }, [l.kr, l.ko].filter(Boolean).join(' · ')) : null),
      h('span', { class: 'grow' }), scoreEl, play, rec);
    const pushScore = (raw) => {
      hist.push(Math.round(Number(raw) || 0));
      const shown = hist.slice(-DRILL_DOTS_MAX);
      scoreEl.replaceChildren(...shown.map((v, k) => scoreDot(v, { size: 26, fresh: k === shown.length - 1 })));
      scoreEl.style.display = '';
      popScore(scoreEl);
    };
    // 녹음 종료·채점 — 수동 멈추기와 무음 자동종료 공유 (응용 행과 같은 계약). recRow 가드로 오행 방지.
    async function finishRec() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); rec.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, l.en, { lang }, { enableMiscue: true });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      const judged = judgeRecording(result, l.en);
      if (!judged.record) { showRecordToast(recordGateMessage(judged.reason)); return; }
      const scored = scoreForDisplay(result, l.en, lang);
      pushScore(scored.score);
      onScore?.(i, scored);
    }
    rec.addEventListener('click', async () => {
      if (demo) {
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); rec.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); rec.classList.remove('recing');
          const result = { score: Math.min(84 + i * 4, 99), weakPhonemes: ['ð'] };
          pushScore(result.score);
          onScore?.(i, result);
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finishRec(); return; }
      const r = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: l.en, card: { lang } }, onAutoStop: () => finishRec() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); rec.classList.add('recing');
    });
    return { l, play, el: row };
  });
  const allBtn = h('button', { class: 'vs-mini-all', type: 'button', 'data-role': 'mini-all' }, vIcon(VI.PLAY, { size: 11, fill: true }), '전체 듣기');
  allBtn.addEventListener('click', () => {
    const playAt = (k) => {
      if (k >= rows.length) return;
      const r = rows[k];
      speakWithFeedback(r.play, r.l.en, { lang: ttsLang, voice: voiceOf(r.l.speaker), rate: 1.0, onEnd: () => playAt(k + 1) });
    };
    playAt(0);
  });
  return h('div', { class: 'vs-mini' }, v2Style(MINI_CSS),
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '이런 대화에서'), allBtn),
    scene ? h('div', { class: 'vs-mini-scene' }, String(scene)) : null,
    h('div', { style: 'margin-top:4px;' }, rows.map((r) => r.el)));
}

/* ── 대화 스테이지 (2026-09-14 시안 12a) ──
 * 묶음 하나(대화 1편 또는 단독 카드 1줄)를 그린다. 선택 줄은 그 자리에서 열려 조립부가 만든
 * 컨트롤(듣기·따라 말하기 필 · 링 · 본 점수 열)을 selectedSlot 으로 받는다 — 녹음·채점 배선은
 * 종전 그대로 조립부에 남는다(외과적 변경).
 * 흔적 줄: 시도마다 26px 원 하나, 최근 8개 + 넘치면 +N. 선택 줄에는 그리지 않는다(.vs-meta 가 대신).
 */
function traceRow(scores) {
  const all = normScores(scores);
  if (!all.length) return null;
  const shown = all.slice(-DRILL_DOTS_MAX);
  const row = h('div', { class: 'vs-ln-trace' }, shown.map((v) => scoreDot(v, { size: 26, fresh: false })));
  if (all.length > DRILL_DOTS_MAX) row.appendChild(h('span', { class: 'more' }, `+${all.length - DRILL_DOTS_MAX}`));
  return row;
}

export function dialogueStageEl(group, ctx = {}) {
  const { lang = 'en', selCardId, expr, cueIndex = -1, phone = false, leadSep = false } = ctx;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const voiceOf = (sp) => MINI_VOICES[String(sp ?? '').trim().toUpperCase()] || MINI_VOICES.A;
  const lines = group.lines;
  const selLineIdx = lines.findIndex((_, i) => group.cardAt[i]?.card?.id === selCardId);
  const rows = [];
  let selectedRow = null;

  const body = h('div', { class: 'vs-stage-lines' });
  lines.forEach((ln, i) => {
    const hit = group.cardAt[i];
    const card = hit?.card || null;
    const selected = !!card && card.id === selCardId;
    const utter = card ? normScores(ctx.utterOf?.(card.id)) : [];
    const done = !!card && !selected && utter.length > 0;
    const prog = card && !selected ? String(ctx.drillProgOf?.(card.id) || '') : '';

    /* 헤어라인 — 선택 줄 위 · 선택 줄 바로 다음 줄 위에는 없다(카드 테두리가 경계).
     * 첫 줄 위도 없지만, 앞 묶음이 이어지는 단독 줄이면(leadSep) 같은 열로 잇는다. */
    const sepOn = i === 0 ? (leadSep && !selected) : !(selected || i - 1 === selLineIdx);
    body.appendChild(h('div', { class: 'vs-ln-sep' + (sepOn ? ' on' : '') }));

    const num = h('span', { class: 'vs-ln-num' + (selected ? ' on' : done ? ' done' : card ? ' card' : '') },
      done ? vCheck({ size: 11, sw: 3 }) : (card ? String(hit.num) : ''));
    const gio = String(ln.speaker ?? '').trim().toUpperCase() === 'B';
    // name 이 없으면 speaker 글자 (miniDialogueEl 과 같은 계약 — 옛 시드·데모 픽스처는 name 이 없다)
    const name = h('span', { class: 'vs-ln-name' + (gio ? ' me' : '') }, String(ln.name || ln.speaker || ''));
    const enEl = h('div', { class: 'vs-ln-en' }, selected ? hlNode(ln.en, expr) : document.createTextNode(ln.en));
    const textBlock = h('div', { class: 'vs-ln-body' },
      phone ? name : null,
      enEl,
      ln.kr ? h('div', { class: 'vs-ln-kr' }, h('i', {}, '['), ln.kr, h('i', {}, ']')) : null,
      h('div', { class: 'vs-ln-ko' }, ln.ko || '', prog ? h('em', {}, ' · ' + prog) : null),
      selected ? null : traceRow(card ? utter : ctx.miniScoresOf?.(i)));

    const top = h('div', { class: 'vs-ln-top' }, num, phone ? null : name, textBlock);
    const row = h('div', { class: 'vs-ln' + (selected ? ' sel' : card ? ' card' : '') + (i === cueIndex ? ' cue' : '') }, top);

    if (!selected) {
      const play = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
      play.addEventListener('click', (e) => {
        e.stopPropagation();
        speakWithFeedback(play, ln.en, { lang: ttsLang, voice: voiceOf(ln.speaker), rate: 1.0 });
      });
      const rec = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
      rec.addEventListener('click', (e) => {
        e.stopPropagation();
        if (card) ctx.onCardRec?.(card.id);
        else ctx.onMiniRec?.(i, row, rec);
      });
      top.append(play, rec);
      rows.push({ i, line: ln, btn: play });
    } else {
      selectedRow = row;
      row.appendChild(h('div', { class: 'vs-ln-slot' }, ctx.selectedSlot || null));
      rows.push({ i, line: ln, btn: null });
    }
    // 선택 줄에는 붙이지 않는다 — 안에 든 필·버튼 클릭이 버블링돼 이동(재렌더)을 불러 녹음이 끊긴다.
    if (card && !selected) row.addEventListener('click', () => ctx.onSelect?.(card.id));
    body.appendChild(row);
  });

  const el = h('div', { class: 'vs-stage' + (group.hasDialogue ? '' : ' solo') });
  if (group.hasDialogue) {
    const allBtn = h('button', { class: 'vs-stage-all', type: 'button', 'data-role': 'stage-all' },
      vIcon(VI.PLAY, { size: 11, fill: true }), '전체 듣기');
    /* 전체 듣기 — 줄마다 onEnd 체인. 재생 중인 줄은 블루 소프트(dialogueV2 .vd-line.playing 어휘).
     * 선택 줄에는 원 버튼이 없으므로 조립부가 넘긴 듣기 필(selectedPlayBtn)이 재생 표시를 받는다
     * (2026-09-14 클로드 디자인 결정 §0-4). speakWithFeedback 은 버튼이 없으면 재생 자체를 건너뛴다. */
    let playing = -1;
    const paintPlaying = (k) => {
      const prev = body.querySelector('.vs-ln.playing');
      if (prev) prev.classList.remove('playing');
      const next = k >= 0 ? body.querySelectorAll('.vs-ln')[k] : null;
      if (next) next.classList.add('playing');
    };
    const stopAll = () => {
      playing = -1;
      paintPlaying(-1);
      allBtn.classList.remove('playing');
      allBtn.lastChild.textContent = '전체 듣기';
    };
    allBtn.addEventListener('click', () => {
      if (playing >= 0) { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } stopAll(); return; }
      allBtn.classList.add('playing');
      allBtn.lastChild.textContent = '재생 중';
      const step = (k) => {
        if (playing < 0) return; // 중단됨
        if (k >= rows.length) { stopAll(); return; }
        playing = k;
        paintPlaying(k);
        const r = rows[k];
        speakWithFeedback(r.btn || ctx.selectedPlayBtn, r.line.en, {
          lang: ttsLang, voice: voiceOf(r.line.speaker), rate: 1.0, onEnd: () => step(k + 1),
        });
      };
      playing = 0;
      step(0);
    });
    el.appendChild(h('div', { class: 'vs-stage-hd' },
      phone
        ? h('span', { class: 'vs-lab' }, '오늘의 대화')
        : h('div', {}, h('span', { class: 'vs-lab' }, '오늘의 대화'),
          group.situation ? h('div', { class: 'vs-stage-scene' }, group.situation) : null),
      phone ? h('div', { class: 'vs-stage-hdr' }, allBtn) : allBtn));
    if (phone && group.situation) el.appendChild(h('div', { class: 'vs-stage-scene' }, group.situation));
  }
  el.appendChild(body);
  return { el, selectedRow, rows };
}

/* 진행 세그먼트바 — 클릭으로 카드 이동 (사용자 2026-09-13 요구, 구 makeProgress onStepClick 과 같은 계약). */
export function progressSegEl(total, idx, onJump) {
  return h('div', { class: 'vs-seg' }, Array.from({ length: total }, (_, i) => h('span', {
    role: 'button', title: `${i + 1}번 표현으로 이동`, onClick: () => onJump?.(i + 1),
  }, h('i', { class: i < idx ? 'f' : '' }))));
}

/* 좌측 문장 목록 — 카드마다 영문·뜻·진행·마지막 점수. 헤일로는 붙이지 않는다(움직이는 표식은 대화 줄 배지 하나). */
export function sentenceNavEl(cards, { selCardId, utterOf, drillProgOf, onSelect } = {}) {
  return h('div', { class: 'vs-nav' }, (cards || []).map((c, i) => {
    const utter = normScores(utterOf?.(c.id));
    const cur = c.id === selCardId;
    const done = !cur && utter.length > 0;
    const prog = cur ? '' : [utter.length ? `말하기 ${utter.length}회` : '', String(drillProgOf?.(c.id) || '')]
      .filter(Boolean).join(' · ');
    const last = utter.length ? utter[utter.length - 1] : null;
    return h('button', {
      class: 'vs-nav-it' + (cur ? ' on' : done ? ' done' : ''), type: 'button', onClick: () => onSelect?.(c.id),
    },
    h('span', { class: 'vs-nav-num' + (cur ? ' on' : done ? ' done' : '') },
      done ? vCheck({ size: 11, sw: 3 }) : String(i + 1)),
    h('span', { class: 'vs-nav-tx' },
      h('span', { class: 'vs-nav-en' }, c.sentence || ''),
      // state.cards 는 Dexie 원본 행이라 뜻이 meaning 이다 (pickCardFields 는 state.sentence 에만 적용된다)
      h('span', { class: 'vs-nav-ko' }, c.ko || c.meaning || ''),
      prog ? h('span', { class: 'vs-nav-prog' }, prog) : null),
    last == null ? null : scoreDot(last, { size: 24, fresh: false }));
  }));
}

/* 선택 줄을 화면 안으로 (2026-09-14 시안 12a 구현 메모) — scrollIntoView 는 sticky 상단 바 아래로
 * 줄을 밀어 넣어 가려지므로 좌표를 직접 계산한다. 이미 보이면 움직이지 않는다. */
export function scrollSelectedIntoView(row, win = window, stickyTop = 0) {
  if (!row?.getBoundingClientRect || typeof win?.scrollTo !== 'function') return;
  const r = row.getBoundingClientRect();
  if (r.top >= stickyTop && r.bottom <= win.innerHeight) return;
  win.scrollTo({ top: win.scrollY + r.top - stickyTop - 24, behavior: 'smooth' });
}

/* 생산 연습(한→영) — 방금 연습한 드릴 중 3개를 한글만 보고 영어로 재현 (2026-07-22 사용자 결정).
 * 자유 작문이 아니라 직전 연습 문장의 인출 재현 — 대안 표현은 오답 처리된다(의도).
 * 통과 판정은 체이닝과 동일(전사 비교 judgeCoverage). 실패 2회 → 첫 단어 힌트, 3회 → 정답 공개 후 완료.
 * 게임 요소(연속 ✓ 스트릭·완주 뱃지)는 이 블록에만 접붙임 — 반응 나쁘면 블록째 폐기.
 * 정답(en·kr)은 공개 전 DOM 미부착 — 체이닝 자막 금지와 동일 계약. onStart: 첫 녹음 시 1회(드릴 목록 접기). */
// 생산 연습 발음 정확도 하한 — 커버리지만으로는 웅얼거림이 통과된다 (2026-07-23 사용자 지적).
// 메인 PASS_THRESHOLD(80)보다 관대: 인출이 주목적, 발음은 최소선만.
const PROD_MIN_ACCURACY = 65;

export function productionBlockEl(drills, lang, card, demo, onScore, { onStart, saved, onSave, scores } = {}) {
  const pool = (Array.isArray(drills) ? drills : []).filter((d) => d?.en && d?.ko);
  if (!pool.length) return null;
  // 출제 문항은 pool 인덱스로 고정해 저장한다 — 종전엔 재렌더마다 재추첨돼 복원 시 문항이 바뀌었다.
  // 하나라도 어긋나면(드릴 구성 변경) 저장분을 통째로 버리고 재추첨 — 부분 렌더 방지.
  const savedPicks = Array.isArray(saved?.picks)
    && saved.picks.every((n) => Number.isInteger(n) && n >= 0 && n < pool.length)
    ? saved.picks : [];
  const allIdx = pool.map((_, i) => i);
  const pickIdx = savedPicks.length
    ? savedPicks
    : (pool.length <= 3 ? allIdx : allIdx.sort(() => Math.random() - 0.5).slice(0, 3));
  const picks = pickIdx.map((n) => pool[n]);
  const rowsDone = { ...(saved?.rows || {}) }; // 행 인덱스 → 통과 여부 (공개했으면 false)
  let restoring = false;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  let recCtrl = null, recRow = null, started = false, plays = 0;
  const persist = () => { if (!restoring) onSave?.({ picks: pickIdx, rows: { ...rowsDone } }); };
  const passEl = h('b', {}, '0');
  let passCount = 0;

  const rows = picks.map((d, i) => {
    const wcnt = String(d.en).trim().split(/\s+/).filter(Boolean).length;
    let fails = 0, done = false;
    const mark = h('span', { class: 'vs-gscore', style: 'display:none;' }, passDot({ size: 26 }));
    // 문장 행 점수 원 (2026-09-03) — 과거 이력(scores[문장]) + 이번 시도 누적, 최근 8개. ✓는 통과 판정으로 별도.
    const hist = normScores(scores?.[d.en]);
    const scoreEl = h('span', { class: 'vs-gdots', style: hist.length ? '' : 'display:none;' },
      hist.slice(-DRILL_DOTS_MAX).map((v) => scoreDot(v, { size: 26, fresh: false })));
    const pushScore = (raw) => {
      hist.push(Math.round(Number(raw) || 0));
      const shown = hist.slice(-DRILL_DOTS_MAX);
      scoreEl.replaceChildren(...shown.map((v, k) => scoreDot(v, { size: 26, fresh: k === shown.length - 1 })));
      scoreEl.style.display = '';
    };
    const playBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    playBtn.disabled = true; // 정답 오디오 잠금 — 공개 전 듣기가 곧 정답 유출
    const recBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const wcEl = h('div', { class: 'sub' }, `${wcnt}단어`); // 공개되면 정답 줄이 이 자리를 대신한다
    const hintEl = h('div', { class: 'sub', style: 'display:none;' }, '');
    const ansEl = h('div', { class: 'sub' }); // 정답 줄 — 공개 시점에만 텍스트 주입
    // 정답 보기 — 녹음 3회를 채우지 않고도 바로 공개 (2026-07-24 사용자 지시,
    // 복습의 "발화는 전진 조건이 아니다" 원칙). 공개는 통과가 아니다(스트릭 0).
    // 데스크톱 VS_CSS 엔 '.vs button' 리셋이 없으므로 크롬 제거는 인라인.
    const giveBtn = h('button', { class: 'vs-prod-give', type: 'button' }, '정답 보기', vIcon(VI.CHEV_DOWN, { size: 10, sw: 2.2 }));
    giveBtn.lastChild.style.transform = 'rotate(-90deg)';
    const row = h('div', { class: 'vs-drow vs-prod' },
      h('span', { class: 'ix' }, String(i + 1)),
      h('div', {}, h('div', { class: 'en' }, String(d.ko)), wcEl, hintEl, ansEl, giveBtn),
      h('span', { class: 'grow' }), scoreEl, mark, playBtn, recBtn);

    const reveal = (pass) => {
      if (done) return;
      done = true;
      ansEl.textContent = [d.en, d.kr].filter(Boolean).join(' · ');
      playBtn.disabled = false;
      recBtn.disabled = true;
      giveBtn.style.display = 'none';
      hintEl.style.display = 'none';
      wcEl.style.display = 'none';
      if (pass) { mark.style.display = ''; popScore(mark); passCount += 1; }
      passEl.textContent = String(passCount);
      rowsDone[i] = pass;
      persist();
    };
    const failOnce = (msg) => {
      fails += 1;
      if (fails >= 3) { reveal(false); showRecordToast('정답을 공개했어요 — 듣고 한 번 더 말해 보세요'); return; }
      if (fails >= 2) { hintEl.textContent = `힌트 · 시작: ${firstWordsHint(d.en)}`; hintEl.style.display = ''; }
      showRecordToast(msg ?? '다시 한 번 — 한글 뜻을 영어로 말해 보세요');
    };

    async function finish() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); recBtn.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, d.en, card, { enableMiscue: true });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      /* 음질 게이트 (2026-08-29) — 여기가 특히 위험하다: 통과 기준이 accuracy>=65 인데 합성 취약
       * 구간의 표시 acc 가 82 라 **무너진 녹음이 통과로 처리된다**. 실패로도 세지 않는다(학습자 잘못이 아님). */
      if (isTooUnclear(result)) { showRecordToast(recordGateMessage('unclear')); return; }
      // 발화 집계 점수도 감점제 통일 (2026-08-31) — 통과 판정(judgeProduction)은 아래에서 원본 사용.
      const scored = scoreForDisplay(result, d.en, lang);
      pushScore(scored.score);
      onScore?.(scored, { kind: 'prod', target: d.en }); // 말했으면 발화 1건 (체이닝과 동일) + 메타로 저장 (2026-09-03)
      // 통과 = 커버리지 + 문장 정확도 하한 + 단어 하한 (judgeProduction, 2026-07-23 사용자 지적
      // "정확하게 발음 못했는데 패스" · "엉뚱한 단어도 통과"). 실패도 1회로 누적 — 3회면 정답 공개.
      const judge = judgeProduction(result, d.en, { minAccuracy: PROD_MIN_ACCURACY });
      if (judge.pass) reveal(true);
      else if (judge.missing.length) failOnce();
      else if (judge.badWords.length) failOnce(`발음이 어긋난 단어가 있어요: ${judge.badWords.slice(0, 2).join(', ')} — 또렷하게 다시`);
      else failOnce(`단어는 다 맞았어요 — 발음을 더 또렷하게 (${judge.accuracy}점)`);
    }

    recBtn.addEventListener('click', async () => {
      if (done) return;
      if (!started) { started = true; onStart?.(); }
      if (demo) {
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); recBtn.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); recBtn.classList.remove('recing');
          pushScore(90);
          onScore?.({ score: 90, weakPhonemes: [] }, { kind: 'prod', target: d.en });
          reveal(true);
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finish(); return; }
      const r = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: d.en, card }, onAutoStop: () => finish() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); recBtn.classList.add('recing');
    });
    playBtn.addEventListener('click', () => {
      if (playBtn.disabled) return;
      plays += 1;
      const v = pickPracticeVoice(plays, wcnt);
      speakWithFeedback(playBtn, d.en, { lang: ttsLang, voice: v.voice, rate: v.rate });
    });
    giveBtn.addEventListener('click', () => { if (!done) reveal(false); });
    return { row, reveal, i };
  });

  // 저장된 진행 복원 — reveal 을 행 순서대로 재생해 스트릭·완주 뱃지까지 같은 상태로 되돌린다.
  restoring = true;
  for (const r of rows) { if (rowsDone[r.i] !== undefined) r.reveal(rowsDone[r.i]); }
  restoring = false;
  if (!savedPicks.length) persist(); // 새로 추첨한 문항을 고정 저장

  return h('div', { class: 'vs-prodblock', style: 'margin-top:26px;' },
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '생산 연습'),
      h('span', { class: 'ct' }, '통과 ', passEl, ' / ' + picks.length)),
    h('div', { style: 'margin-top:4px;' }, rows.map((r) => r.row)));
}

/* 모바일(phone/tablet) — 동일 로직, 단일 칼럼 셸(m-topb/m-steps/m-cta) + 해설 fold (작업지시서 모바일 §3-3) */
export const VSM_CSS = `
.vs{min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;display:flex;flex-direction:column;${V_VARS}}
.vs *{box-sizing:border-box;margin:0}
.vs button{font:inherit;background:none;border:0;cursor:pointer;padding:0;color:inherit}
.m-topb{position:sticky;top:0;z-index:6;background:oklch(97.5% .009 95/.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:calc(9px + env(safe-area-inset-top)) 16px 11px;flex:0 0 auto}
.m-topb-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.m-home{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mut)}
.m-topb-meta{font-family:Outfit,sans-serif;font-size:12px;color:var(--faint);letter-spacing:.04em;white-space:nowrap}
.m-topb-time{font-family:Outfit,sans-serif;font-size:12px;font-weight:600;color:var(--faint)}
.m-pad{padding:0 20px 24px;max-width:560px;margin:0 auto;width:100%}
.m-cta{flex:0 0 auto;background:oklch(97.5% .009 95/.96);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 20px calc(12px + env(safe-area-inset-bottom))}
/* 신규 세션 전용 — 하단 CTA 를 화면에 고정(작업지시서 §2-3). 복습·수학·요약이 쓰는 기본 .m-cta 는 그대로 둔다. */
.m-cta-fixed{position:sticky;bottom:0;z-index:6}
.m-cta .vs-next{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border-radius:14px;font-size:15px;font-weight:700;white-space:nowrap;background:var(--teal);border:1.5px solid var(--teal);color:#fff}
.vs-ctrl{display:flex;align-items:center;gap:10px;margin-top:20px;min-height:54px;flex-wrap:wrap}
/* 셀렉터에 button 을 붙여 명시도(0,0,1,1)를 위 '.vs button' 리셋과 동률로 올린다 — 안 그러면
   '.vs button' 의 padding:0 (0,0,1,1)이 '.vs-pill'(0,0,1,0)을 이겨 패딩이 0 이 되고, 타원 버튼
   경계에 글자가 붙어 삐져나온다(2026-07-18 iPhone 보고). '.vs-pill.pri' 등 파생(0,0,2,0)은
   여전히 background/border override 를 이겨 회귀 없음. 데스크톱 VS_CSS 엔 '.vs button' 리셋이 없어 무관. */
button.vs-pill{position:relative;display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:12px 18px;font-size:13.5px;font-weight:700;border:1.5px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap;min-height:46px}
.vs-pill.playing{border-color:var(--blue-line);color:var(--blue-deep);background:var(--blue-soft)}
/* 녹음 CTA 는 코랄 — 색 규약 '코랄=녹음'(v2/atoms.js 머리주석)과 구 D1(terra) 관례. 2026-07-22 복원. */
.vs-pill.pri{background:var(--coral);border-color:var(--coral);color:#fff;animation:v-breatheC 2.6s ease-in-out infinite}
.vs-pill.recing{background:var(--coral-deep);border-color:var(--coral-deep);color:#fff;animation:none}
.vs-pill.recing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-pill.playing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vs-ringhost{margin-left:auto;display:flex;align-items:center;gap:10px}
.vs-ring{position:relative;width:54px;height:54px;flex:0 0 auto;animation:v-settle .5s both}
.vs-ring svg{transform:rotate(-90deg)}
.vs-ring .cn{position:absolute;inset:0;display:grid;place-items:center;font-family:Outfit;font-size:15.5px;font-weight:700;color:var(--teal-deep)}
.vs-cap{display:none}
.vs-meta{display:flex;align-items:center;gap:10px;margin-top:18px;flex-wrap:wrap;color:var(--faint)}
.vs-meta .tot{font-family:Outfit;font-size:12px;font-weight:700;color:var(--mut);white-space:nowrap;margin-left:auto}
.vs-meta .tot b{color:var(--ink)}
.vs-rec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px 14px;margin-top:12px}
.vs-rec .hd{display:flex;justify-content:space-between;align-items:center;min-height:21px}
.vs-rec .lb{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-newrec{display:inline-flex;align-items:center;gap:4px;font-family:Outfit;font-size:10.5px;font-weight:800;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:4px 10px;white-space:nowrap;animation:v-settle .5s both}
.vs-rec .msg{font-size:11.5px;color:var(--mut);margin-top:8px;line-height:1.5;text-align:center}
.vs-rec .msg b{color:var(--coral-deep)}
.vs-uring{position:relative;margin:12px auto 0}
.vs-uring svg{transform:rotate(-90deg)}
.vs-uring .arc{transition:stroke-dashoffset .6s cubic-bezier(.3,.7,.3,1),stroke .3s}
.vs-uring .pl{position:absolute;inset:8px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-uring .cn{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vs-uring .n{font-family:Outfit;font-size:34px;font-weight:700;line-height:1;color:var(--ink)}
.vs-uring .n em{font-style:normal;font-family:Outfit;font-size:13px;font-weight:700;color:var(--coral-deep);margin-left:5px}
.vs-uring .pv{font-family:Outfit;font-size:11px;font-weight:700;color:var(--teal-deep);margin-top:6px;white-space:nowrap}
.vs-uring .pv.over{color:var(--coral-deep)}
.vs-hist{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px 18px;margin-top:12px}
.vs-hist .lb{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-labrow{display:flex;align-items:baseline;justify-content:space-between;margin-top:18px}
.vs-lab{font-family:Outfit;font-size:10px;letter-spacing:.13em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-labrow .ct{font-family:Outfit;font-size:11px;color:var(--mut);font-weight:600}
.vs-labrow .ct b{color:var(--teal-deep)}
.vs-drow{display:flex;align-items:center;gap:11px;padding:12px 2px;border-bottom:1px solid var(--line)}
.vs-drow:last-of-type{border-bottom:0}
.vs-drow.recing{background:var(--coral-soft);margin:0 -10px;padding:12px 10px;border-radius:12px;border-bottom-color:transparent}
.vs-drow .ix{font-family:Outfit;font-size:11px;color:var(--faint);width:14px;flex:0 0 auto}
.vs-drow > div{min-width:0;flex:1}
.vs-drow .en{font-size:14.5px;font-weight:700;letter-spacing:-.01em}
.vs-drow .en b{font-weight:800;background:linear-gradient(oklch(44% .062 192/.3),oklch(44% .062 192/.3)) 0 100%/100% 2px no-repeat;padding-bottom:2px}
.vs-drow .sub{font-size:11.5px;color:var(--faint);margin-top:2px}
.vs-drow .grow{flex:0 0 auto}
.vs-cir{width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;flex:0 0 auto;position:relative;padding:0}
.vs-cir.eqq{border-color:var(--blue-line);color:var(--blue)}
/* 다음 차례(체이닝 현재 단계) — 어느 원을 눌러야 하는지 색으로 (§6.5). */
.vs-cir.next{border-color:var(--coral);color:var(--coral-deep)}
.vs-cir.recing{background:var(--coral);border-color:var(--coral);color:#fff}
.vs-cir.recing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-cir.playing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--blue);animation:v-pulse 1.5s ease-out infinite}
.vs-prod-give{display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:0 0 1px;font:inherit;font-family:Pretendard,sans-serif;font-size:12px;font-weight:700;color:var(--teal-deep);background:none;border:0;border-bottom:1px solid oklch(44% .062 192/.3);cursor:pointer}
.vs-gscore{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.vs-gdots{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.vs-fold{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-top:12px}
.vs-fold .fhd{display:flex;justify-content:space-between;align-items:center;cursor:pointer}
.vs-fold .ft{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-fold .chev{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;color:var(--mut);transition:transform .2s}
.vs-fold.open .chev{transform:rotate(180deg)}
.vs-fold .fbd{margin-top:13px}
.vs-fold .vs-panel{padding:0;border:0;background:none;margin:0}
.vs-fold .ph2d{display:none}
.vs-kbox{background:var(--teal-soft);border-radius:12px;padding:12px 14px;font-size:12.5px;line-height:1.6}
.vs-sec{margin-top:14px}
.vs-klab{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-sec .b2{font-size:12.5px;line-height:1.65;color:var(--mut);margin-top:5px;text-wrap:pretty}
.vs-sec .b2 b{color:var(--ink)}
.vs-ex{margin-top:8px;font-size:12.5px;line-height:1.6}
.vs-ex .k{color:var(--mut)}
.vs-chips{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;max-width:100%}
.vs-chip{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:12px;padding:4px 10px;background:#fbf9f2;max-width:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere;line-height:1.5}
/* 대화 스테이지 — 폰 (2026-09-14 시안 12a 폰 390) */
.vs-stagewrap{width:100%}
.vs-stage + .vs-stage{margin-top:20px}
.vs-stage.solo + .vs-stage.solo{margin-top:0}
.vs-stage-hd{display:flex;align-items:center;justify-content:space-between;margin-top:18px;gap:10px}
.vs-stage-hdr{display:flex;align-items:center;gap:8px}
.vs-stage-scene{font-size:12.5px;line-height:1.55;color:#4a5450;margin:6px 2px 0;text-wrap:pretty}
.vs-stage-fold{font:inherit;font-size:12px;font-weight:600;color:var(--faint);background:none;border:0;padding:6px 2px;cursor:pointer;white-space:nowrap}
.vs-stage-all{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border:1.5px solid transparent;border-radius:999px;padding:5px 12px;cursor:pointer;white-space:nowrap}
.vs-stage-all.playing{color:var(--blue-deep);background:var(--blue-soft);border-color:var(--blue-line)}
.vs-stage-lines{margin-top:10px;display:flex;flex-direction:column}
.vs-ln-sep{height:1px;background:transparent;margin:0 4px}
.vs-ln-sep.on{background:var(--line)}
.vs-ln{display:flex;flex-direction:column;border-radius:14px;border:1px solid transparent;padding:9px 10px;margin:0 -6px}
.vs-ln.card{cursor:pointer}
.vs-ln.playing{background:var(--blue-soft)}
.vs-ln.recing{background:var(--coral-soft)}
.vs-ln.sel{background:var(--card);border-color:var(--line);box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.18);animation:v-settle .5s both}
.vs-ln-top{display:flex;align-items:center;gap:9px}
.vs-ln-num{width:20px;height:20px;border-radius:50%;border:1.5px solid transparent;font-family:Outfit;font-size:10.5px;font-weight:800;display:grid;place-items:center;flex:0 0 auto;color:transparent}
.vs-ln-num.card{border-color:var(--teal-line);color:var(--teal-deep)}
.vs-ln-num.done{border-color:var(--teal-soft);background:var(--teal-soft);color:var(--teal-deep)}
.vs-ln-num.on{border-color:var(--teal);background:var(--teal);color:#fff;animation:v-haloT 2.4s ease-in-out infinite}
.vs-ln-body{min-width:0;flex:1 1 auto}
.vs-ln-name{font-family:Outfit;font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--mut);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vs-ln-name.me{color:var(--teal-deep)}
.vs-ln-name:empty{display:none}
.vs-ln-en{font-size:15px;font-weight:600;color:#4a5450;letter-spacing:-.005em;line-height:1.35}
.vs-ln-en b{font-weight:800;background:linear-gradient(oklch(44% .062 192/.3),oklch(44% .062 192/.3)) 0 100%/100% 2px no-repeat;padding-bottom:2px}
.vs-ln.card .vs-ln-en,.vs-ln.cue .vs-ln-en{color:var(--ink)}
.vs-ln.card .vs-ln-en{font-weight:700}
.vs-ln.sel .vs-ln-en{font-size:17px;font-weight:800;color:var(--teal-deep)}
.vs-ln-kr{font-size:11px;font-weight:500;line-height:1.45;color:var(--teal-deep);margin-top:3px;letter-spacing:.01em}
.vs-ln-kr i{font-style:normal;color:var(--faint);font-weight:400}
.vs-ln-ko{font-size:12.5px;color:#4a5450;margin-top:4px;line-height:1.45}
.vs-ln-ko em{font-style:normal;color:var(--faint)}
.vs-ln-trace{display:flex;align-items:center;gap:5px;margin-top:7px;flex-wrap:wrap}
.vs-ln-trace .more{font-family:Outfit;font-size:11px;font-weight:600;color:var(--faint)}
.vs-ln-slot{padding-left:0}
.vs-ln-slot .vs-ctrl{margin-top:12px}
.vs-ln-slot .vs-meta{margin-top:10px}
.vs-ln .vs-cir{width:32px;height:32px}
.m-topb .vs-seg{display:flex;gap:4px;margin-top:9px}
.m-topb .vs-seg > span{flex:1;display:flex;align-items:center;padding:6px 0;margin:-6px 0;cursor:pointer}
.m-topb .vs-seg i{width:100%;height:4px;border-radius:2px;background:#e7e3d4}
.m-topb .vs-seg i.f{background:var(--teal)}
.vs-drills{margin-top:18px}
.vs-drow3{padding:10px 2px;gap:11px}
.vs-drow3 .ix{width:12px}
.vs-drow3 > div{min-width:0;flex:1 1 auto}
.vs-drills .vs-labrow{margin-top:0}
.vs-drills-expr{font-size:14.5px;font-weight:700;letter-spacing:-.01em;color:var(--teal-deep);margin-top:8px;line-height:1.35}
.vs-drow3{padding:10px 2px}
.vs-drow3 > div{min-width:0;flex:1 1 auto}
.vs-drow3 .en{font-size:14px}
.vs-drow3 .vs-ln-kr{font-size:11px}
.vs-drow3 .vs-ln-ko{font-size:12.5px}
${V_DOT_CSS}${V_MINICAL_CSS}
`;

export function renderSessionExprV2(host, state, handlers = {}) {
  ensureV2Fonts();
  const lang = state.sentence?.lang || 'en';
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const subjLabel = lang === 'ja' ? '일본어' : '영어';
  const s = state.sentence;
  const ex = s?.explanation || {};
  // 카드별 연습 진행 (응용 행 점수 / 생산 연습 / 체이닝) — 재렌더·재마운트·새로고침 복원 (2026-08-21).
  // 스냅샷(activeSession)에 exLog 로 실려 나간다.
  if (!state.exLog || typeof state.exLog !== 'object') state.exLog = {};
  const cardEx = s?.id ? (state.exLog[s.id] ??= {}) : {};

  const hasScene = Array.isArray(state.cards[0]?.explanation?.dialogue);
  const offset = hasScene ? 1 : 0;
  const exprCards = state.cards.slice(offset);
  const total = exprCards.length;
  const idx = Math.max(1, state.step - offset);
  const expr = exprOf(s || {});
  // 오늘 발화의 분모 = 직전 학습일 발화 수 (§1-1). 0 = 직전 학습일 없음 → 비교 UI 미표시.
  const prevDay = Number(state.prevDayUtter) || 0;
  const todayISO = getTodayISO();

  // ── 카드 컨트롤 (듣기 / 따라 말하기 / 점수 링) ──
  let playing = false, recCtrl = null;
  const listenPill = h('button', { class: 'vs-pill', type: 'button' }, vIcon(VI.PLAY, { size: 12, fill: true }), '듣기');
  const recPill = h('button', { class: 'vs-pill pri', type: 'button' }, vIcon(VI.MIC, { size: 14, sw: 2 }), '따라 말하기');
  const recCount = () => state.recLog?.[s?.id]?.count ?? 0;
  // 재렌더·복원 시에도 3상태가 맞도록 초기 라벨을 이력에서 정한다 (종전엔 '따라 말하기' 로 굳었다).
  if (recCount() > 0) recPill.lastChild.textContent = '다시 말하기';
  /* 링은 '방금 받은 점수' 하나를 담는 슬롯이다 — 보여줄 점수가 없으면 슬롯 자체를 그리지 않는다.
   * 종전엔 링을 '—' 로 띄우고 캡션에 '아직 시도 전' / 'N회 시도' 를 채웠다. 결과가 없는데 결과
   * 자리를 그린 것이 문제였다 (클로드디자인 2026-08-27). 드릴·체이닝 발화는 메인 점수가 아니라
   * state.lastScore 를 건드리지 않으므로 링도 나타나지 않는다. */
  const ringHost = h('div', { class: 'vs-ringhost' });
  const paintRing = () => {
    if (state.lastScore == null) { ringHost.replaceChildren(); return null; }
    const r = ringEl(state.lastScore);
    /* 캡션 정확성 (2026-09-01 검토 지적) — 수화·복원으로 안착한 값은 '방금' 받은 점수가 아니다.
     * lastScoreLive 는 이번 마운트에서 applyScore 가 실제로 채점했을 때만 참 (스냅샷 미저장 —
     * 복원·카드 이동·수화 진입은 전부 '지난 점수'로 시작한다). */
    ringHost.replaceChildren(r, h('span', { class: 'vs-cap' }, state.lastScoreLive ? '방금 점수' : '지난 점수'));
    return r;
  };
  paintRing();
  const ctrl = h('div', { class: 'vs-ctrl' }, listenPill, recPill, ringHost);

  const stopPlaying = () => { playing = false; listenPill.classList.remove('playing'); listenPill.lastChild.textContent = '듣기'; };
  let mainPlays = 0;
  listenPill.addEventListener('click', () => {
    /* 녹음 중에도 재생한다 (2026-08-29 사용자 요구) — 응용 드릴은 원래 안 막았고, 메인만
     * 먼저 '멈추기'를 눌러야 했다. 재생음이 녹음에 섞이는 것은 브라우저 AEC 가 막는다
     * (드릴이 2026-07-22 부터 같은 조건). 오발화 게이트로는 못 막는다 — 같은 문장의 TTS 가
     * 섞이면 점수는 내려가는 게 아니라 올라가기 때문. */
    if (playing) { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } stopPlaying(); return; }
    if (!s?.sentence || !window.studySpeech?.speak) return;
    playing = true; listenPill.classList.add('playing'); listenPill.lastChild.textContent = '재생 중';
    /* 메인 카드도 재생마다 화자 순환 (2026-07-23 사용자 지시 — 응용·체이닝과 동일 원리).
     * 속도는 메인 학습 기본(0.85)을 유지 — 길이별 속도 규칙은 응용·체이닝 전용.
     * ja 도 2026-08-28 부터 순환한다 (JA_PRACTICE_VOICES 신설 전에는 AoiNeural 한 목소리뿐이었다).
     * 시드에 speaker 가 지정된 카드(구 콩트 트랙)는 그 화자를 존중해 순환에서 제외한다. */
    const pool = lang === 'ja' ? JA_PRACTICE_VOICES : PRACTICE_VOICES;
    /* 대화 줄이 된 선택 줄은 대화 규칙으로 읽는다 — 화자 성별 고정 · rate 1.0 (2026-09-14 클로드 디자인 결정 §0-5).
     * 대화가 없는 카드의 단독 줄은 화자가 없으므로 기존 문장 카드 규칙(화자 순환 · 기본 속도)을 유지한다. */
    if (!isSoloCard && selLine) {
      const voice = MINI_VOICES[String(selLine.speaker ?? '').trim().toUpperCase()] || MINI_VOICES.A;
      window.studySpeech.speak(s.sentence, { lang: ttsLang, voice, rate: 1.0, onEnd: stopPlaying });
    } else if (lang === 'ja' && s?.speaker) {
      window.studySpeech.speak(s.sentence, { lang: ttsLang, speaker: s.speaker, onEnd: stopPlaying });
    } else {
      const voice = pool[mainPlays % pool.length];
      mainPlays += 1;
      window.studySpeech.speak(s.sentence, { lang: ttsLang, voice, onEnd: stopPlaying });
    }
    setTimeout(stopPlaying, 30000);
  });

  /* 발화 점수 열 — 이 카드에서 말한 점수를 오래된 것 → 최신 순으로. 6회 이상이면 최근 5개만.
   * 점(dot)·콤보 칩·PASS 칩은 폐기 (§6.1) — 갱신의 근거는 '몇 번 눌렀나'가 아니라 '점수가 오르나'다. */
  /* 문장 카드의 발화 점수 열 — **이 문장을 말한 점수만** 담는다 (단일 출처).
   * 응용·체이닝 점수를 여기 섞으면 각 행이 이미 자기 점수 원을 갖고 있어 이중 표시가 되고,
   * 최근 5개 창이 드릴 점수로 채워져 정작 메인 점수가 밀려난다 (2026-08-28 사용자 보고). */
  const utterScores = () => (Array.isArray(cardEx.utter) ? cardEx.utter : []);
  const pushUtter = (score) => { (cardEx.utter ??= []).push(Math.round(Number(score) || 0)); };
  const dotsEl = h('span', { class: 'v-dots' });
  const totEl = h('span', { class: 'tot' }, '총 ', h('b', {}, '0'), '회');
  const meta = h('div', { class: 'vs-meta', style: 'display:none;' }, vIcon(VI.MIC, { size: 14, sw: 2 }), dotsEl, totEl);

  // 우측 ① 오늘 발화 링 (분모 = 직전 학습일 발화) · ② 공부 이력 4주 캘린더
  // 시안 12a — 좌측 사이드바 · 폰 하단 모두 96px (WORK-ORDER §1)
  const ringCard = utterRingCard({ size: 96, prevTop: true });
  const recWidget = ringCard.el;
  const todayUtter = () => (Number(state.todayUtterBase) || 0) + (Number(state.tried) || 0);
  const histCard = historyCalCard(todayISO, state.dayMap, todayUtter, state.prDays);

  const refreshDots = () => {
    const all = utterScores();
    const shown = all.slice(-MAIN_DOTS_MAX);
    dotsEl.replaceChildren(...shown.map((v, i) => scoreDot(v, { size: 30, fresh: i === shown.length - 1 && all.length > 0 })));
    totEl.querySelector('b').textContent = String(all.length); // 점수 원과 같은 계열 — 버튼 라벨용 recCount 와 별개
    meta.style.display = all.length ? '' : 'none'; // 결과가 없으면 결과 자리도 없다 (시안 12a §2-2)
  };
  const refreshRecWidget = () => {
    ringCard.update(todayUtter(), prevDay);
    histCard.update();
  };

  // 점수 → 리빌 적용 (state·DOM·애니). DB 쓰기는 실경로에서만 별도 호출. 데모 시뮬과 단일 출처 공유.
  function applyScore(score, weakPhonemes) {
    state.lastScore = score; state.lastScoreLive = true; state.tried = (state.tried || 0) + 1;
    const passed = score >= PASS_THRESHOLD;
    if (passed) { state.passed = (state.passed || 0) + 1; state.combo = (state.combo || 0) + 1; } else { state.combo = 0; }
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    bumpRecLog(state, s?.id, score);
    pushUtter(score); // 카드 이동 후 링 복원도 이 배열의 마지막 값을 쓴다 (session-new restoreCardScore)
    popScore(paintRing()); // 첫 점수면 링이 v-settle 로 등장, 이후엔 값만 갱신
    refreshDots(); refreshRecWidget();
  }
  /* 녹음 중 표시는 코랄 채움 + v-pulse 확산 링 + 라벨뿐 — 아이콘은 마이크로 둔다.
   * 이퀄라이저는 '재생 중' 어휘라 녹음에 쓰면 두 상태가 같아 보인다 (작업지시서 §11). */
  const setRecVisual = (on) => {
    recPill.classList.toggle('recing', on); recPill.classList.toggle('pri', !on);
    recPill.lastChild.textContent = on ? '녹음 멈추기' : (recCount() > 0 ? '다시 말하기' : '따라 말하기');
  };

  recPill.addEventListener('click', async () => {
    // 데모(?demo=1&view=session) — 마이크 없이 녹음→리빌 시뮬레이션 (검증용).
    if (state.demo) {
      if (state.recording) return;
      state.recording = true; setRecVisual(true);
      setTimeout(() => {
        state.recording = false;
        applyScore(Math.min(88 + Math.min(recCount(), 2) * 3, 99), ['ð']);
        setRecVisual(false); // applyScore(bumpRecLog) 후 → 라벨 '다시 말하기' 반영
      }, 1000);
      return;
    }
    if (!state.recording) {
      state.recording = true; setRecVisual(true);
      // 말 끝나면 자동 종료(무음 1.4초, 전 단어 확인 시 조기 종결) — 듣기처럼 손 안 대도 마무리. 수동 멈추기도 유지.
      const rec = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: s.sentence, card: s }, onAutoStop: () => { finishRecording(); } });
      if (rec.error) {
        state.recording = false; recCtrl = null; state.micBlocked = true;
        setRecVisual(false);
        showRecordToast(recordErrorMessage(rec.error));
        return;
      }
      recCtrl = rec.controller;
    } else {
      finishRecording();
    }
  });

  // 녹음 종료·채점 — 수동 '멈추기' 클릭과 무음 자동종료가 공유. recCtrl null 가드로 중복 방지.
  async function finishRecording() {
    if (!state.recording || !recCtrl) return;
    const ctrlR = recCtrl; recCtrl = null;
    // 분석 대기(실측 0.9~2.1초) 동안 '녹음 멈추기'로 남으면 아직 녹음 중처럼 보인다 (2026-08-29).
    recPill.lastChild.textContent = '채점 중…';
    /* enableMiscue:true 필수 — false 면 Azure 가 전사에 레퍼런스를 그대로 에코해(라이브 실측
     * 2026-08-29: 다른 문장을 말해도 전사=레퍼런스·49점) 오발화를 가려낼 근거가 사라진다.
     * 같은 오디오가 true 에서는 전사 "What?"·2점으로 정직해진다. 정답 발화 점수는 불변(96↔95). */
    const result = await stopAndAnalyze(ctrlR, s.sentence, s, { enableMiscue: true });
    state.recording = false;
    if (result?.mockFallback) { setRecVisual(false); showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
    const judged = judgeRecording(result, s.sentence);
    if (!judged.record) { setRecVisual(false); showRecordToast(recordGateMessage(judged.reason)); return; }
    /* 화면·기록 점수 = 감점제 (2026-08-31 3단계 전환, 사용자 지시) — 정확도 단독은 유치·단조
     * 발화를 못 깎는다. 원 acc 는 result.accuracyScore 로, 체계 표식은 scoreModel 로 행에 남는다.
     * ja 는 en 코퍼스 보정 전이라 acc 유지 (scoreForDisplay 주석). */
    const scored = scoreForDisplay(result, s.sentence, lang);
    applyScore(scored.score, result?.weakPhonemes);
    setRecVisual(false); // applyScore(bumpRecLog) 후 → 라벨 '다시 말하기' 반영
    try {
      await savePronunciationLog(window.studyDB, { result: scored, sentenceId: s.id, lang, date: getTodayISO() });
      await applyWeakPhonemesUpdate(window.studyDB, lang, result?.weakPhonemes);
    } catch (e) { console.error('[sessionExprV2] pron persist', e); }
    handlers.saveSnapshot?.();
  }

  // 다음 표현 버튼 — 녹음 횟수와 무관하게 처음부터 활성 (3회 게이트 폐지, 2026-09-04 사용자 지시)
  const nextBtn = h('button', { class: 'vs-next', type: 'button', onClick: handlers.onNext }, idx >= total ? '학습 완료 →' : '다음 표현 →');

  // 응용 연습 — 드릴 녹음도 세션 발화 1건으로 집계 ('오늘 발화' + 요약 통과율/평균/약점음소)
  // + 다음-표현 게이트(recLog count)에도 포함 (2026-07-01 사용자 지시 — 응용 발화도 3회 게이트에 셈).
  // 단 콤보·PASS 칩(연속 PASS 게이미피케이션)은 메인 표현 전용 — drill 미반영 유지.
  // 근접중복(호칭·감탄사만 덧붙인 드릴)은 렌더에서 제외 — 원본 데이터는 손대지 않음(사용자 결정 2026-07-09).
  const drills = filterNearDupDrills(s?.sentence, ex.drills, { keepTail: isPersonalCard(s?.id) });
  const savedDrills = cardEx.drills || {};
  const recordedDrills = new Set(Object.keys(savedDrills).map(Number));
  const drillCountEl = h('b', {}, String(Math.min(recordedDrills.size, drills.length)));
  const onDrillScore = (i, result) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    if (!recordedDrills.has(i)) { recordedDrills.add(i); drillCountEl.textContent = String(Math.min(recordedDrills.size, drills.length)); }
    bumpRecLog(state, s?.id, score);  // 응용 발화도 '다음 표현' 3회 게이트에 카운트
    // 행 점수 영속화 (재렌더 복원) — 시도마다 누적해 점수 원이 늘어난다.
    const rows = ((cardEx.drills ??= {}));
    rows[i] = [...normScores(rows[i]), score];
    /* 세션 밖까지 남기기 (2026-08-29) — 스냅샷은 세션이 끝나면 사라진다. 복습에서 이 응용 문장을
     * "몇 번 말했고 보통 몇 점인지" 보여주는 유일한 원천이다 (pronunciationLog.summarizeDrillLog).
     * 데모(?demo=1)는 격리 계약대로 실 DB 에 쓰지 않는다 — 로그인 상태에서 데모에 들어오면
     * window.studyDB 가 실 Dexie 라 가짜 점수가 sync 로 Supabase 까지 올라간다 (2026-08-29 감사). */
    if (!state.demo) {
      const dTarget = drills[i]?.ja || drills[i]?.en || '';
      savePronunciationLog(window.studyDB, { result, sentenceId: drillLogId(s?.id, dTarget), lang, date: getTodayISO() })
        .catch((e) => console.error('[sessionExprV2] drill pron persist', e));
    }
    refreshDots();
    refreshRecWidget();
    handlers.saveSnapshot?.();
  };
  // 생산 연습 시작 시 자동 접힘(답 훔쳐보기 방지) — 펼치기는 자유 (2026-07-22).
  const drillList = h('div', { class: 'vs-drills-list', style: 'margin-top:4px;' }, drillRows(drills, expr, lang, onDrillScore, state.demo, { saved: savedDrills, threeLine: true }));
  // 데스크톱 VS_CSS 엔 '.vs button' 리셋이 없으므로 (L483 주석) 네이티브 버튼 크롬을 인라인으로 제거.
  const unfoldBtn = h('button', { class: 'vs-drills-unfold', type: 'button', style: 'display:none;text-align:left;padding:6px 0;font:inherit;font-size:12.5px;font-weight:600;color:var(--faint);background:none;border:0;cursor:pointer;' }, '응용 목록 펼치기 ▾');
  unfoldBtn.addEventListener('click', () => { drillList.style.display = ''; unfoldBtn.style.display = 'none'; });
  const collapseDrills = () => {
    if (!drills.length || drillList.style.display === 'none') return;
    drillList.style.display = 'none'; unfoldBtn.style.display = '';
  };
  // 응용 패널 제목은 번호가 아니라 표현 자체 (시안 12a — 라벨 줄 아래 제 줄로, 잘림 금지)
  const drillsBlock = drills.length ? h('div', { class: 'vs-drills' },
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '응용 연습'), h('span', { class: 'ct' }, '녹음 ', drillCountEl, ' / ' + drills.length)),
    expr ? h('div', { class: 'vs-drills-expr' }, expr) : null,
    drillList, unfoldBtn,
  ) : null;

  // 체이닝(chain) — 확장 사다리(ladder) 폐기 후속. 자막 없이 듣고 따라 말하기 + 단어 누락 0 통과.
  // 체이닝 발화도 세션 발화 1건 (드릴과 동일하게 '오늘 발화'·3회 게이트에 집계).
  // 단 '통과'(passed) 는 발음 점수 기준을 유지 — 체이닝의 통과/실패는 단계 진행에만 쓰인다.
  const onChainScore = (result, meta) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    /* 점수 기록 (2026-09-03) — 드릴과 같은 계약: 스냅샷(cardEx)에 누적해 재렌더에 남기고, 데모가 아니면
     * pronunciationLog 에 적재해 세션 밖·기기 밖까지 남긴다 (수화 loadScoreHistoryState 가 되돌린다). */
    if (meta?.kind === 'chain') {
      const store = (cardEx.chainScores ??= {});
      store[meta.i] = [...normScores(store[meta.i]), score];
      if (!state.demo) savePronunciationLog(window.studyDB, { result, sentenceId: chainLogId(s?.id, meta.target), lang, date: getTodayISO() })
        .catch((e) => console.error('[sessionExprV2] chain pron persist', e));
    } else if (meta?.kind === 'prod') {
      const store = (cardEx.prodScores ??= {});
      store[meta.target] = [...normScores(store[meta.target]), score];
      if (!state.demo) savePronunciationLog(window.studyDB, { result, sentenceId: prodLogId(s?.id, meta.target), lang, date: getTodayISO() })
        .catch((e) => console.error('[sessionExprV2] prod pron persist', e));
    }
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    bumpRecLog(state, s?.id, score);
    refreshDots();
    refreshRecWidget();
    handlers.saveSnapshot?.();
  };
  const chainBlock = SESSION_BLOCKS.chainProd ? chainBlockEl(ex.chain, lang, s, state.demo, onChainScore, {
    saved: cardEx.chain,
    scores: cardEx.chainScores,
    onSave: (v) => { cardEx.chain = v; handlers.saveSnapshot?.(); },
  }) : null;

  // 생산 연습(한→영) — 응용 아래·체이닝 위. 발화 집계는 체이닝과 동일 경로(onChainScore) 재사용. 2026-09-12 숨김(SESSION_BLOCKS).
  const prodBlock = SESSION_BLOCKS.chainProd ? productionBlockEl(drills, lang, s, state.demo, onChainScore, {
    onStart: collapseDrills,
    saved: cardEx.prod,
    scores: cardEx.prodScores,
    onSave: (v) => { cardEx.prod = v; handlers.saveSnapshot?.(); },
  }) : null;

  /* ── 대화 묶음 (2026-09-14 시안 12a) — 카드 목록을 대화 단위로 접는다. 문장 카드(.vs-card)는 없다.
   * 대화가 없거나 카드 문장이 그 대화에 없으면 카드 문장 한 줄짜리 단독 묶음이 된다(화면 어휘는 하나). */
  const groups = buildDialogueGroups(exprCards);
  const utterOf = (cardId) => normScores(state.exLog?.[cardId]?.utter);
  const drillProgOf = (cardId) => {
    const card = exprCards.find((c) => c.id === cardId);
    const ds = filterNearDupDrills(card?.sentence, card?.explanation?.drills, { keepTail: isPersonalCard(cardId) });
    if (!ds.length) return '';
    const done = Object.keys(state.exLog?.[cardId]?.drills || {}).length;
    return done ? `응용 ${Math.min(done, ds.length)}/${ds.length}` : '';
  };
  const selGroupIdx = groups.findIndex((g) => Object.values(g.cardAt).some((x) => x.card?.id === s?.id));
  const selGroup = groups[selGroupIdx] || null;
  const selLineIdx = selGroup
    ? Number(Object.keys(selGroup.cardAt).find((k) => selGroup.cardAt[k].card?.id === s?.id))
    : -1;
  const isSoloCard = !selGroup?.hasDialogue;
  const selLine = selGroup?.lines?.[selLineIdx] || null;
  const jumpToCard = (cardId) => {
    const i = state.cards.findIndex((c) => c.id === cardId);
    if (i >= 0) handlers.onJump?.(i + 1);
  };
  // 미니대화 줄 녹음 점수 (2026-09-12 복원) — 응용 행(onDrillScore)과 같은 집계·스냅샷·영속. 진행 조건은 아니다.
  const miniLines = selGroup?.hasDialogue ? selGroup.lines : [];
  const onMiniScore = (i, result) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    bumpRecLog(state, s?.id, score);
    const rows = ((cardEx.mini ??= {}));
    rows[i] = [...normScores(rows[i]), score];
    if (!state.demo) {
      savePronunciationLog(window.studyDB, { result, sentenceId: miniLogId(s?.id, miniLines[i]?.en || ''), lang, date: getTodayISO() })
        .catch((e) => console.error('[sessionExprV2] mini pron persist', e));
    }
    refreshDots();
    refreshRecWidget();
    handlers.saveSnapshot?.();
  };
  /* 상대 줄 녹음 — 기존 miniDialogueEl 의 경로(#mini#, cardEx.mini)를 그대로 쓴다. 미니대화 블록 자체는
   * 복습(sessionReviewV2)이 계속 쓰므로 컴포넌트를 남겨 두고, 신규 화면에서는 대화 스테이지가 부른다. */
  let miniCtrl = null, miniRow = null;
  async function finishMini(i, row, btn) {
    if (!(miniCtrl && miniRow === row)) return;
    const ctrlM = miniCtrl; miniCtrl = null; miniRow = null;
    row.classList.remove('recing'); btn.classList.remove('recing');
    const target = miniLines[i]?.en || '';
    const result = await stopAndAnalyze(ctrlM, target, { lang }, { enableMiscue: true });
    if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
    const judged = judgeRecording(result, target);
    if (!judged.record) { showRecordToast(recordGateMessage(judged.reason)); return; }
    onMiniScore(i, scoreForDisplay(result, target, lang));
    handlers.rerender?.();
  }
  async function miniRec(i, row, btn) {
    if (state.demo) {
      if (row.classList.contains('recing')) return;
      row.classList.add('recing'); btn.classList.add('recing');
      setTimeout(() => {
        row.classList.remove('recing'); btn.classList.remove('recing');
        onMiniScore(i, { score: Math.min(84 + i * 4, 99), weakPhonemes: ['ð'] });
        handlers.rerender?.();
      }, 800);
      return;
    }
    if (miniCtrl && miniRow === row) { finishMini(i, row, btn); return; }
    const target = miniLines[i]?.en || '';
    const r = await startMicRecording({ autoStopSilenceMs: 1400, speculate: { expected: target, card: { lang } }, onAutoStop: () => finishMini(i, row, btn) });
    if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
    miniCtrl = r.controller; miniRow = row;
    row.classList.add('recing'); btn.classList.add('recing');
  }

  /* 폰 대화 접기 (시안 12a) — 질문→대답 짝만 남긴다(직전 상대 줄 + 선택 줄). 상태는 세션 state 에
   * 둔다 — 카드 이동은 전체 재렌더라 지역 변수로는 유지되지 않는다. */
  const collapsed = state.size !== 'desktop' && !!state.dlgCollapsed && !!selGroup?.hasDialogue;
  const keepIdx = collapsed ? [selLineIdx - 1, selLineIdx].filter((k) => k >= 0) : null;
  const viewGroups = !collapsed ? groups : groups.map((g, gi) => {
    if (gi !== selGroupIdx) return null;
    const cardAt = {};
    keepIdx.forEach((k, j) => { if (g.cardAt[k]) cardAt[j] = g.cardAt[k]; });
    return { ...g, lines: keepIdx.map((k) => g.lines[k]), cardAt };
  }).filter(Boolean);
  const viewSelIdx = collapsed ? 0 : selGroupIdx;
  // 접힘이면 줄 index 가 재색인된다 — 미니 점수·녹음은 원래 index 로 되돌려 읽고 쓴다.
  const srcIdx = (i) => (collapsed ? keepIdx[i] : i);

  const stages = viewGroups.map((g, gi) => dialogueStageEl(g, {
    lang, selCardId: s?.id, expr, phone: state.size !== 'desktop',
    // 단독 줄이 연달아 오면 한 열로 잇는다 — 대화 묶음 뒤에서는 묶음 경계라 잇지 않는다.
    leadSep: !g.hasDialogue && gi > 0 && !viewGroups[gi - 1].hasDialogue,
    cueIndex: gi === viewSelIdx ? (collapsed ? 0 : selLineIdx - 1) : -1,
    utterOf, drillProgOf,
    miniScoresOf: (i) => (gi === viewSelIdx ? normScores(cardEx.mini?.[srcIdx(i)]) : []),
    onSelect: jumpToCard,
    onCardRec: (cardId) => { state.autoRec = cardId; jumpToCard(cardId); },
    onMiniRec: (i, row, btn) => miniRec(srcIdx(i), row, btn),
    selectedSlot: gi === viewSelIdx ? [ctrl, meta] : null,
    selectedPlayBtn: gi === viewSelIdx ? listenPill : null,
  }));
  const stageWrap = h('div', { class: 'vs-stagewrap' }, stages.map((x) => x.el));
  const selectedRow = stages[viewSelIdx]?.selectedRow || null;

  let root, timeUpdate;
  if (state.size !== 'desktop') {
    // ── 폰 단일 칼럼 (2026-09-14 시안 12a) — 스텝 줄·장면 칩 폐기, 상단 바에 진행 + 클릭 세그먼트 ──
    const mTime = h('span', { class: 'm-topb-time' }, state.time || '00:00');
    const mTopb = h('div', { class: 'm-topb' },
      h('div', { class: 'm-topb-row' },
        h('button', { class: 'm-home', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
        h('span', { class: 'm-topb-meta' }, `신규 학습 · ${subjLabel} · ${idx}/${total}`),
        mTime),
      progressSegEl(total, idx, (n) => handlers.onJump?.(n + offset)));
    const foldBd = h('div', { class: 'fbd', style: 'display:none;' }, explainPanel(ex));
    const fhd = h('div', { class: 'fhd' }, h('span', { class: 'ft' }, '표현 해설'), h('span', { class: 'chev' }, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 })));
    const fold = h('div', { class: 'vs-fold' }, fhd, foldBd);
    fhd.addEventListener('click', () => { const open = fold.classList.toggle('open'); foldBd.style.display = open ? '' : 'none'; });
    // 대화 접기 토글 — 대화가 있는 묶음의 헤더에만 붙는다.
    if (selGroup?.hasDialogue) {
      const foldBtn = h('button', { class: 'vs-stage-fold', type: 'button' }, collapsed ? '대화 펼치기 ▾' : '대화 접기 ▴');
      foldBtn.addEventListener('click', () => { state.dlgCollapsed = !collapsed; handlers.rerender?.(); });
      stageWrap.querySelector('.vs-stage-hdr')?.appendChild(foldBtn);
    }
    root = h('div', { class: 'vs' }, v2Style(VSM_CSS),
      mTopb,
      h('div', { class: 'm-pad' }, stageWrap, drillsBlock, chainBlock, prodBlock, fold, recWidget, histCard.el),
      h('div', { class: 'm-cta m-cta-fixed' }, nextBtn));
    timeUpdate = (t) => { mTime.textContent = t; };
  } else {
    // ── 데스크톱 3칼럼 ──
    // 해설은 기본 접힘 — 접힌 상태엔 정의 박스만 (§6.6 ③). 펼치면 기존 5섹션이 순서 그대로.
    const foldPanel = explainPanel(ex);
    const fhd2 = foldPanel.querySelector('.ph2d');
    fhd2.replaceChild(h('span', { class: 'chev' }, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 })), fhd2.lastChild);
    const inner2 = foldPanel.querySelector('.inner');
    const secs = [...inner2.children].filter((n) => !n.classList.contains('vs-kbox'));
    const secBody = h('div', { class: 'vs-secs', style: 'display:none;' }, secs);
    inner2.appendChild(secBody);
    fhd2.addEventListener('click', () => {
      const open = foldPanel.classList.toggle('open');
      secBody.style.display = open ? '' : 'none';
    });
    // 좌측 사이드바 250 — 홈·타이머 / 진행·세그먼트 / 문장 목록 / 오늘 발화 / 공부 이력 / 세션 종료
    const lside = h('aside', { class: 'vs-lside' },
      h('div', { class: 'hmrow' },
        h('button', { class: 'hm', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
        h('span', { class: 'tm' }, state.time || '00:00')),
      h('div', {},
        h('span', { class: 'vs-lab' }, `신규 학습 · ${subjLabel}`),
        h('div', { class: 'cnt' }, String(idx), h('em', {}, '/' + total)),
        progressSegEl(total, idx, (n) => handlers.onJump?.(n + offset))),
      sentenceNavEl(exprCards, { selCardId: s?.id, utterOf, drillProgOf, onSelect: jumpToCard }),
      h('span', { class: 'sp' }),
      recWidget, histCard.el,
      handlers.onEnd ? h('button', { class: 'endbtn', type: 'button', onClick: handlers.onEnd }, '세션 종료') : null);
    const side = h('aside', { class: 'vs-side' }, drillsBlock, chainBlock, prodBlock, foldPanel, nextBtn);
    root = h('div', { class: 'vs' }, v2Style(VS_CSS),
      h('div', { class: 'vs-frame' }, lside, h('div', { class: 'vs-mainwrap' }, stageWrap, side)));
    timeUpdate = (t) => { const el = lside.querySelector('.tm'); if (el) el.textContent = t; };
  }
  host.appendChild(root);
  refreshDots(); refreshRecWidget();
  /* 선택 줄을 화면 안으로 + 접힌 카드 줄 녹음에서 넘어온 자동 본 녹음 (2026-09-14).
   * onJump 는 전체 재렌더라 녹음 시작은 렌더 직후 이 자리에서 이어 붙인다. */
  if (selectedRow) {
    const stickyTop = state.size !== 'desktop' ? (root.querySelector('.m-topb')?.offsetHeight || 0) : 0;
    scrollSelectedIntoView(selectedRow, window, stickyTop);
  }
  if (state.autoRec && state.autoRec === s?.id) {
    delete state.autoRec;
    recPill.click();
  }

  const layout = { update(st) { if (st && 'time' in st) timeUpdate(st.time); } };
  return { cleanup: () => { try { window.studySpeech?.cancel?.(); if (recCtrl?.stop) recCtrl.stop(); } catch { /* noop */ } host.innerHTML = ''; }, layout };
}


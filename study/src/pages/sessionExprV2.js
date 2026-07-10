/* 표현 학습 세션 — 데스크톱 C 파이널 v2 (작업지시서 §3)
 * 발화 누적 + 직전 기록 비교, 응용 연습 행 리스트, 단일 해설 패널, 발화 3회 게이트·콤보·점수 링.
 * 정본 시안: 작업지시서 v-session.jsx (SessV2)
 *
 * 라이브 녹음/채점은 기존 services 재사용 (startMicRecording·stopAndAnalyze·savePronunciationLog 등).
 * 시각만 v2 로 교체. 데모(?demo=1&view=session)는 마이크 없이 정적 렌더로 검증.
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, vEq, vCheck, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';
import { exprOf, bumpRecLog, canAdvance, REC_TARGET } from '../components/d1/sessionShell.js';
import { startMicRecording, stopAndAnalyze } from '../services/sessionAnalyze.js';
import { savePronunciationLog } from '../services/pronunciationLog.js';
import { applyWeakPhonemesUpdate } from '../services/weakPhonemes.js';
import { recordErrorMessage, showRecordToast } from '../components/session/recordToast.js';
import { buildChainSteps, chainHint, filterNearDupDrills, pickChainVoice } from '../components/session/applied.js';
import { passesCoverage } from '../services/speech.js';
import { localISODate } from '../utils/today.js';

const PASS_THRESHOLD = 80;
const SVG_NS = 'http://www.w3.org/2000/svg';
function getTodayISO() { return window.studyDay?.TODAY_ISO || localISODate(); }

const VS_CSS = `
.vs{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;display:flex;word-break:keep-all;${V_VARS}}
.vs *{box-sizing:border-box;margin:0}
.vs-rail{width:88px;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;padding:24px 0;gap:8px;flex:0 0 auto}
.vs-rail .hm{color:var(--faint);margin-bottom:16px;background:none;border:0;cursor:pointer;display:inline-flex}
.vs-rstep{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;font-family:Outfit;font-size:13.5px;font-weight:700;color:var(--faint);cursor:pointer;background:none;border:0}
.vs-rstep.on{background:var(--teal-soft);color:var(--teal-deep);animation:v-haloT 2.4s ease-in-out infinite}
.vs-rstep.done{color:var(--teal-deep)}
.vs-rail .sp{flex:1}
.vs-rail .tm{font-family:Outfit;font-size:11px;color:var(--faint);letter-spacing:.08em;white-space:nowrap}
.vs-mainwrap{flex:1;display:flex;justify-content:center;gap:26px;padding:38px 46px 40px}
.vs-main{width:760px;max-width:100%}
.vs-crumb{display:flex;align-items:center;gap:14px}
.vs-scene{font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:6px 13px;white-space:nowrap}
.vs-prog{flex:1;display:flex;gap:5px}
.vs-prog i{flex:1;height:4px;border-radius:2px;background:#e7e3d4}
.vs-prog i.f{background:var(--teal)}
.vs-prog-t{font-family:Outfit;font-size:12px;color:var(--faint);font-weight:600;white-space:nowrap}
.vs-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:36px 44px;margin-top:20px;
  box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.14)}
.vs-h1{font-family:Outfit;font-size:48px;font-weight:700;letter-spacing:-0.03em;line-height:1.12}
.vs-h1 b{font-weight:700;text-decoration:underline;text-decoration-color:oklch(44% .062 192/.35);text-decoration-thickness:5px;text-underline-offset:7px}
.vs-ko{font-size:17.5px;color:var(--mut);margin-top:13px}
.vs-pron{font-size:13px;color:var(--faint);margin-top:5px}
.vs-ctrl{display:flex;align-items:center;gap:12px;margin-top:26px;min-height:56px;flex-wrap:wrap}
.vs-pill{position:relative;display:inline-flex;align-items:center;gap:9px;border-radius:999px;padding:13px 23px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;border:1.5px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap}
.vs-pill.playing{border-color:var(--blue-line);color:var(--blue-deep);background:var(--blue-soft)}
.vs-pill.pri{background:var(--teal);border-color:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.vs-pill.recing{background:var(--coral);border-color:var(--coral);color:#fff;animation:none}
.vs-pill.recing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-ring{position:relative;width:52px;height:52px;flex:0 0 auto}
.vs-ring svg{transform:rotate(-90deg)}
.vs-ring .cn{position:absolute;inset:0;display:grid;place-items:center;font-family:Outfit;font-size:15px;font-weight:700;color:var(--teal-deep)}
.vs-cap{font-size:11.5px;color:var(--faint);white-space:nowrap}
.vs-pass{display:inline-flex;align-items:center;gap:6px;background:var(--coral-soft);color:var(--coral-deep);border-radius:999px;padding:6px 14px;font-size:12.5px;font-weight:800;letter-spacing:.04em;white-space:nowrap;animation:v-settle .5s both}
.vs-meta{display:flex;align-items:center;gap:20px;margin-top:16px;min-height:24px;flex-wrap:wrap}
.vs-say{display:inline-flex;align-items:center;gap:9px;font-size:12.5px;color:var(--mut);font-weight:600;white-space:nowrap}
.vs-say .d{display:inline-flex;gap:5px}
.vs-say .d i{width:8px;height:8px;border-radius:50%;background:#ddd9c9}
.vs-say .d i.f{background:var(--teal)}
.vs-combo{display:inline-flex;align-items:center;gap:6px;font-family:Outfit;font-size:12px;font-weight:700;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:5px 12px;white-space:nowrap}
.vs-labrow{display:flex;align-items:baseline;justify-content:space-between;margin-top:26px}
.vs-lab{font-family:Outfit;font-size:10.5px;letter-spacing:.15em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-labrow .ct{font-family:Outfit;font-size:11.5px;color:var(--mut);font-weight:600;white-space:nowrap}
.vs-labrow .ct b{color:var(--teal-deep)}
.vs-drow{display:flex;align-items:center;gap:14px;padding:14px 2px;border-bottom:1px solid var(--line)}
.vs-drow:last-of-type{border-bottom:0}
.vs-drow .ix{font-family:Outfit;font-size:11px;color:var(--faint);width:16px;flex:0 0 auto;text-align:right}
.vs-drow .en{font-size:15.5px;font-weight:700;letter-spacing:-0.01em}
.vs-drow .en b{font-weight:800;text-decoration:underline;text-decoration-color:oklch(44% .062 192/.3);text-decoration-thickness:2.5px;text-underline-offset:3px}
.vs-drow .sub{font-size:12px;color:var(--faint);margin-top:3px}
.vs-drow .grow{flex:1}
.vs-drow.recing{background:var(--coral-soft);margin:0 -14px;padding-left:16px;padding-right:14px;border-radius:12px;border-bottom-color:transparent}
.vs-cir{width:33px;height:33px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;cursor:pointer;flex:0 0 auto;position:relative;padding:0}
.vs-cir.eqq{border-color:var(--blue-line);color:var(--blue)}
.vs-cir.recing{background:var(--coral);border-color:var(--coral);color:#fff}
.vs-cir.recing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-gscore{font-family:Outfit;font-size:13px;font-weight:700;color:var(--teal-deep);white-space:nowrap}
.vs-side{width:324px;flex:0 0 auto}
.vs-rec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px 20px;margin-bottom:13px}
.vs-rec .hd{display:flex;justify-content:space-between;align-items:center;min-height:21px}
.vs-rec .lb{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-rec .nr{display:flex;align-items:baseline;gap:7px;margin-top:7px}
.vs-rec .n{font-family:Outfit;font-size:27px;font-weight:700;line-height:1;color:var(--ink)}
.vs-rec .u{font-size:12px;color:var(--faint);font-weight:600;white-space:nowrap}
.vs-rec .v-bar{height:5px;margin-top:10px}
.vs-rec .v-bar > i{background:var(--teal)}
.vs-rec .msg{font-size:11.5px;color:var(--mut);margin-top:9px;line-height:1.5}
.vs-rec .msg b{color:var(--coral-deep)}
.vs-newrec{display:inline-flex;align-items:center;gap:5px;font-family:Outfit;font-size:11px;font-weight:800;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:4px 11px;white-space:nowrap;animation:v-settle .5s both}
.vs-panel{position:relative;background:var(--card);border:1px solid var(--line);border-radius:16px}
.vs-panel .ph2d{display:flex;justify-content:space-between;align-items:center;padding:18px 24px 0}
.vs-klab{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase;white-space:nowrap}
.vs-panel .inner{padding:14px 24px 30px;max-height:584px;overflow-y:auto}
.vs-kbox{background:var(--teal-soft);border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.65}
.vs-kbox b{font-weight:700}
.vs-sec{margin-top:18px}
.vs-sec .b2{font-size:12.5px;line-height:1.7;color:#4a5450;margin-top:6px;text-wrap:pretty}
.vs-sec .b2 b{color:var(--ink)}
.vs-sec .b2 + .b2{margin-top:8px}
.vs-ex{border-left:2px solid var(--teal-line);padding:2px 0 2px 12px;margin-top:8px;font-size:12.5px;line-height:1.6;color:#4a5450}
.vs-ex b{color:var(--ink)}
.vs-ex .k{color:var(--faint);font-size:11.5px}
.vs-chips{display:flex;gap:7px;margin-top:8px;flex-wrap:wrap}
.vs-chip{font-size:11.5px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:4px 11px;background:#fbf9f2;white-space:nowrap}
.vs-next{width:100%;margin-top:14px;font:inherit;font-size:14.5px;font-weight:700;border-radius:13px;padding:15px 0;cursor:pointer;border:1.5px solid var(--line);background:transparent;color:var(--faint)}
.vs-next.unlock{background:var(--teal);border-color:var(--teal);color:#fff;box-shadow:0 8px 16px -11px oklch(44% .062 192/.7)}
.vs-gate{font-size:11.5px;color:var(--faint);text-align:center;margin-top:9px;white-space:nowrap}
.vs-gate.ok{color:var(--teal-deep);font-weight:600}
@media (max-width:1100px){.vs-mainwrap{flex-direction:column;align-items:center}.vs-side{width:760px;max-width:100%}}
`;

function ringEl(score) {
  const wrap = h('div', { class: 'vs-ring' });
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '52'); svg.setAttribute('height', '52'); svg.setAttribute('viewBox', '0 0 52 52');
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', '26'); track.setAttribute('cy', '26'); track.setAttribute('r', '23');
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', '#eae6d8'); track.setAttribute('stroke-width', '5');
  const arc = document.createElementNS(SVG_NS, 'circle');
  const off = 144 - Math.round((Math.min(Math.max(score, 0), 100) / 100) * 124);
  arc.setAttribute('cx', '26'); arc.setAttribute('cy', '26'); arc.setAttribute('r', '23');
  arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', 'oklch(44% .062 192)'); arc.setAttribute('stroke-width', '5');
  arc.setAttribute('stroke-linecap', 'round'); arc.setAttribute('stroke-dasharray', '144'); arc.setAttribute('stroke-dashoffset', String(off));
  svg.append(track, arc);
  wrap.append(svg, h('span', { class: 'cn' }, score != null ? String(score) : '—'));
  return wrap;
}

function hlNode(text, term) {
  if (!term) return document.createTextNode(text);
  const i = text.toLowerCase().indexOf(String(term).toLowerCase());
  if (i < 0) return document.createTextNode(text);
  const frag = document.createDocumentFragment();
  frag.append(document.createTextNode(text.slice(0, i)));
  const b = document.createElement('b'); b.textContent = text.slice(i, i + term.length); frag.appendChild(b);
  frag.append(document.createTextNode(text.slice(i + term.length)));
  return frag;
}

/* 표현 해설 패널 — 단일 스크롤 (탭 금지). ex 필드 graceful. */
function explainPanel(ex) {
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
    h('div', { class: 'ph2d' }, h('span', { class: 'vs-klab' }, '표현 해설'), h('span', { class: 'vs-klab', style: 'letter-spacing:.08em' }, '스크롤 ↓')),
    inner,
  );
}

/* 응용 연습 행 — 듣기/녹음 (services 재사용). onScore(i, result): 채점 성공 시 세션 집계 위임.
 * demo=true 면 마이크 없이 시뮬 채점 (?demo=1 화면 검증용 — 메인 recPill 데모 분기와 동일). */
function drillRows(drills, hlTerm, lang, speaker, onScore, demo) {
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  let recCtrl = null, recRow = null;
  return (Array.isArray(drills) ? drills : []).map((d, i) => {
    const scoreEl = h('span', { class: 'vs-gscore', style: 'display:none;' }, '');
    const playBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기', onClick: () => { if (d.en && window.studySpeech?.speak) window.studySpeech.speak(d.en, { lang: ttsLang, speaker }); } }, vIcon(VI.PLAY, { size: 11, fill: true }));
    const recBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const row = h('div', { class: 'vs-drow' },
      h('span', { class: 'ix' }, String(i + 1)),
      h('div', {}, h('div', { class: 'en' }, hlNode(d.en || '', hlTerm)), h('div', { class: 'sub' }, [d.kr, d.ko].filter(Boolean).join(' · '))),
      h('span', { class: 'grow' }), scoreEl, playBtn, recBtn,
    );
    recBtn.addEventListener('click', async () => {
      if (demo) {
        // 데모 — 마이크 없이 시뮬 채점 (화면 검증). 행 단위 진행 표시.
        if (row.classList.contains('recing')) return;
        row.classList.add('recing'); recBtn.classList.add('recing');
        setTimeout(() => {
          row.classList.remove('recing'); recBtn.classList.remove('recing');
          const result = { score: Math.min(82 + i * 4, 99), weakPhonemes: ['ð'] };
          scoreEl.textContent = Math.round(result.score) + ' ✓'; scoreEl.style.display = '';
          onScore?.(i, result);
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finishDrill(); return; }
      // 말 끝나면(발화 후 1.2초 무음) 자동 종료 — 메인 카드와 동일. 수동 멈추기도 유지.
      const r = await startMicRecording({ autoStopSilenceMs: 1200, onAutoStop: () => finishDrill() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); recBtn.classList.add('recing');
    });
    // 드릴 녹음 종료·채점 — 수동 멈추기와 무음 자동종료 공유. recRow 가드로 중복/오행 방지.
    async function finishDrill() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); recBtn.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, d.en || '', { lang });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      const score = Math.round(result?.score ?? 0);
      scoreEl.textContent = score + ' ✓'; scoreEl.style.display = '';
      onScore?.(i, result);
    }
    return row;
  });
}

/* 체이닝 — 무자막 청각 확장 (elicited imitation, 2026-07-09 사용자 결정).
 * 단계 = chunks 누적. 화면에 영어를 보여주지 않는다(= 인출 강제, "보고 따라 읽기" 폐기).
 * 재생마다 화자·속도를 바꿔 '리듬 통째 암기'를 막는다. 통과 판정은 발음 점수가 아니라 **단어 누락 0**
 * (Azure EnableMiscue → passesCoverage). 3회 실패부터 힌트(뜻 → 첫 단어 → 전체 공개).
 * 체이닝 발화도 '오늘 발화' 1건 — onUtterance(result) 로 세션 집계·3회 게이트에 반영(응용 드릴과 동일).
 * demo(?demo=1) 는 마이크 없이 통과 시뮬. */
function chainBlockEl(chain, lang, card, demo, onUtterance) {
  const steps = buildChainSteps(chain);
  if (!steps.length) return null;
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  let cur = 0, plays = 0, fails = 0, recCtrl = null, recRow = null;

  const hintEl = h('div', { class: 'vs-gate', style: 'text-align:left;margin-top:10px;min-height:18px;white-space:normal;' }, '');
  const doneEl = h('div', { style: 'display:none;margin-top:10px;' }, h('span', { class: 'vs-pass' }, vIcon(VI.ZAP, { size: 11, fill: true }), '체이닝 완료'));
  const rowEls = [];

  const renderHint = () => {
    const step = steps[cur];
    if (!step) { hintEl.textContent = ''; return; }
    const { kind, text } = chainHint(fails, { stepText: step.text, ko: chain.ko, isLast: cur === steps.length - 1 });
    if (kind === 'none') { hintEl.textContent = fails ? `${fails}회 시도 — 3회부터 힌트가 나와요` : '자막 없이, 들은 그대로 말해 보세요'; return; }
    if (kind === 'ko') hintEl.textContent = `힌트 · 뜻: ${text}`;
    else if (kind === 'first') hintEl.textContent = `힌트 · 시작: ${text}`;
    else hintEl.textContent = `힌트 · 전체: ${text}`;
  };
  const refresh = () => {
    rowEls.forEach((r, i) => {
      const active = i === cur;
      r.row.style.opacity = i < cur ? '0.5' : active ? '1' : '0.3';
      r.playBtn.disabled = !active;
      r.recBtn.disabled = !active;
      r.mark.style.display = i < cur ? '' : 'none';
    });
    if (cur >= steps.length) { doneEl.style.display = ''; hintEl.textContent = ''; }
    else { doneEl.style.display = 'none'; renderHint(); }
  };
  const advance = () => { cur += 1; fails = 0; refresh(); };

  steps.forEach((step, i) => {
    const wc = step.text.trim().split(/\s+/).filter(Boolean).length;
    const mark = h('span', { class: 'vs-gscore', style: 'display:none;' }, '통과 ✓');
    const playBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '듣기' }, vIcon(VI.PLAY, { size: 11, fill: true }));
    const recBtn = h('button', { class: 'vs-cir', type: 'button', 'aria-label': '녹음' }, vIcon(VI.MIC, { size: 13, sw: 2 }));
    const row = h('div', { class: 'vs-drow' },
      h('span', { class: 'ix' }, String(i + 1)),
      h('div', {}, h('div', { class: 'en' }, `${i + 1}단계 · ${wc}단어`),
        h('div', { class: 'sub' }, i === 0 ? '듣고 그대로 따라 말하기' : '앞 단계에 이어 붙습니다')),
      h('span', { class: 'grow' }), mark, playBtn, recBtn);

    playBtn.addEventListener('click', () => {
      if (i !== cur || !window.studySpeech?.speak) return;
      plays += 1;
      const v = pickChainVoice(plays); // 매 재생마다 화자·속도 변주
      window.studySpeech.speak(step.text, { lang: ttsLang, voice: v.voice, rate: v.rate });
    });

    async function finish() {
      if (!(recCtrl && recRow === row)) return;
      const ctrl = recCtrl; recCtrl = null; recRow = null;
      row.classList.remove('recing'); recBtn.classList.remove('recing');
      const result = await stopAndAnalyze(ctrl, step.text, card, { enableMiscue: true });
      if (result?.mockFallback) { showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
      onUtterance?.(result); // 통과 여부와 무관 — 말했으면 발화 1건
      if (passesCoverage(result)) { advance(); return; }
      fails += 1;
      const miss = result?.omissions?.length ?? 0;
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
          onUtterance?.({ score: 90, omissions: [], weakPhonemes: [] });
          advance();
        }, 800);
        return;
      }
      if (recCtrl && recRow === row) { finish(); return; }
      const r = await startMicRecording({ autoStopSilenceMs: 1200, onAutoStop: () => finish() });
      if (r.error) { showRecordToast(recordErrorMessage(r.error)); return; }
      recCtrl = r.controller; recRow = row;
      row.classList.add('recing'); recBtn.classList.add('recing');
    });

    rowEls.push({ row, playBtn, recBtn, mark });
  });

  const block = h('div', { class: 'vs-chain', style: 'margin-top:28px;' },
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '체이닝 — 자막 없이 듣고 따라 말하기'),
      h('span', { class: 'ct' }, '통과 = 단어를 다 말하기')),
    h('div', { style: 'margin-top:4px;' }, rowEls.map((r) => r.row)),
    hintEl, doneEl);
  refresh();
  return block;
}

/* 모바일(phone/tablet) — 동일 로직, 단일 칼럼 셸(m-topb/m-steps/m-cta) + 해설 fold (작업지시서 모바일 §3-3) */
const VSM_CSS = `
.vs{min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;display:flex;flex-direction:column;${V_VARS}}
.vs *{box-sizing:border-box;margin:0}
.vs button{font:inherit;background:none;border:0;cursor:pointer;padding:0;color:inherit}
.m-topb{position:sticky;top:0;z-index:6;background:oklch(97.5% .009 95/.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:calc(9px + env(safe-area-inset-top)) 16px 11px;flex:0 0 auto}
.m-topb-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.m-home{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--mut)}
.m-topb-meta{font-family:Outfit,sans-serif;font-size:12px;color:var(--faint);letter-spacing:.04em;white-space:nowrap}
.m-topb-time{font-family:Outfit,sans-serif;font-size:12px;font-weight:600;color:var(--faint)}
.m-prog{display:flex;gap:4px;margin-top:9px}
.m-prog i{flex:1;height:4px;border-radius:2px;background:#e7e3d4}
.m-prog i.f{background:var(--teal)}
.m-steps{display:flex;align-items:center;gap:7px;padding:11px 20px 3px;flex:0 0 auto;overflow-x:auto}
.m-rstep{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;font-family:Outfit;font-size:12.5px;font-weight:700;color:var(--faint);flex:0 0 auto}
.m-rstep.on{background:var(--teal-soft);color:var(--teal-deep);animation:v-haloT 2.4s ease-in-out infinite}
.m-rstep.done{color:var(--teal-deep)}
.m-steps .sp{flex:1}
.m-steps .pt{font-family:Outfit;font-size:12px;font-weight:600;color:var(--faint);white-space:nowrap}
.m-pad{padding:0 20px 24px;max-width:560px;margin:0 auto;width:100%}
.m-cta{flex:0 0 auto;background:oklch(97.5% .009 95/.96);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 20px calc(12px + env(safe-area-inset-bottom))}
.m-cta .vs-gate{font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:9px;white-space:nowrap}
.m-cta .vs-gate.ok{color:var(--teal-deep);font-weight:600}
.m-cta .vs-next{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border-radius:14px;font-size:15px;font-weight:700;white-space:nowrap;background:transparent;border:1.5px solid var(--line);color:var(--faint)}
.m-cta .vs-next.unlock{background:var(--teal);border-color:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.scene-chip{display:inline-flex;font-family:Outfit;font-size:11px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:5px 11px;letter-spacing:.02em;white-space:nowrap}
.vs-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px 22px;margin-top:14px;box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.14)}
.vs-h1{font-family:Outfit;font-size:30px;font-weight:700;letter-spacing:-.03em;line-height:1.15}
.vs-h1 b{font-weight:700;text-decoration:underline 4px oklch(44% .062 192/.35);text-underline-offset:5px}
.vs-ko{font-size:16px;color:var(--mut);margin-top:10px}
.vs-pron{font-size:12.5px;color:var(--faint);margin-top:4px}
.vs-ctrl{display:flex;align-items:center;gap:10px;margin-top:20px;flex-wrap:wrap}
.vs-pill{position:relative;display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:12px 18px;font-size:13.5px;font-weight:700;border:1.5px solid var(--line);background:#fff;color:var(--ink);white-space:nowrap;min-height:46px}
.vs-pill.playing{border-color:var(--blue-line);color:var(--blue-deep);background:var(--blue-soft)}
.vs-pill.pri{background:var(--teal);border-color:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.vs-pill.recing{background:var(--coral);border-color:var(--coral);color:#fff;animation:none}
.vs-pill.recing::after{content:"";position:absolute;inset:-3px;border-radius:999px;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-ring{position:relative;width:50px;height:50px;flex:0 0 auto;margin-left:auto}
.vs-ring svg{transform:rotate(-90deg)}
.vs-ring .cn{position:absolute;inset:0;display:grid;place-items:center;font-family:Outfit;font-size:15px;font-weight:700;color:var(--teal-deep)}
.vs-cap{display:none}
.vs-meta{display:flex;align-items:center;gap:14px;margin-top:15px;flex-wrap:wrap}
.vs-say{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--mut);font-weight:600;white-space:nowrap}
.vs-say .d{display:inline-flex;gap:5px}
.vs-say .d i{width:8px;height:8px;border-radius:50%;background:#ddd9c9}
.vs-say .d i.f{background:var(--teal)}
.vs-combo{display:inline-flex;align-items:center;gap:5px;font-family:Outfit;font-size:11.5px;font-weight:700;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:5px 11px;white-space:nowrap}
.vs-pass{display:inline-flex;align-items:center;gap:5px;background:var(--coral-soft);color:var(--coral-deep);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:800;letter-spacing:.03em;white-space:nowrap;animation:v-settle .5s both}
.vs-rec{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 18px;margin-top:12px}
.vs-rec .hd{display:flex;justify-content:space-between;align-items:center;min-height:21px}
.vs-rec .lb{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vs-newrec{display:inline-flex;align-items:center;gap:4px;font-family:Outfit;font-size:10.5px;font-weight:800;color:var(--coral-deep);background:var(--coral-soft);border-radius:999px;padding:4px 10px;white-space:nowrap;animation:v-settle .5s both}
.vs-rec .nr{display:flex;align-items:baseline;gap:6px;margin-top:7px}
.vs-rec .n{font-family:Outfit;font-size:26px;font-weight:700;line-height:1}
.vs-rec .u{font-size:11.5px;color:var(--faint);font-weight:600}
.vs-rec .v-bar{height:5px;margin-top:9px}
.vs-rec .v-bar > i{background:var(--teal)}
.vs-rec .msg{font-size:11.5px;color:var(--mut);margin-top:8px;line-height:1.5}
.vs-rec .msg b{color:var(--coral-deep)}
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
.vs-drow .en b{font-weight:800;text-decoration:underline 2px oklch(44% .062 192/.3);text-underline-offset:3px}
.vs-drow .sub{font-size:11.5px;color:var(--faint);margin-top:2px}
.vs-drow .grow{flex:0 0 auto}
.vs-cir{width:32px;height:32px;border-radius:50%;border:1.5px solid var(--line);background:#fff;color:var(--mut);display:grid;place-items:center;flex:0 0 auto;position:relative;padding:0}
.vs-cir.eqq{border-color:var(--blue-line);color:var(--blue)}
.vs-cir.recing{background:var(--coral);border-color:var(--coral);color:#fff}
.vs-cir.recing::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1.5px solid var(--coral);animation:v-pulse 1.5s ease-out infinite}
.vs-gscore{font-family:Outfit;font-size:13px;font-weight:700;color:var(--teal-deep);white-space:nowrap}
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
.vs-chips{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}
.vs-chip{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:3px 10px;background:#fbf9f2;white-space:nowrap}
`;

export function renderSessionExprV2(host, state, handlers = {}) {
  ensureV2Fonts();
  const lang = state.sentence?.lang || 'en';
  const ttsLang = lang === 'ja' ? 'ja-JP' : 'en-US';
  const subjLabel = lang === 'ja' ? '일본어' : '영어';
  const s = state.sentence;
  const ex = s?.explanation || {};

  const hasScene = Array.isArray(state.cards[0]?.explanation?.dialogue);
  const offset = hasScene ? 1 : 0;
  const exprCards = state.cards.slice(offset);
  const total = exprCards.length;
  const idx = Math.max(1, state.step - offset);
  const sceneTitle = hasScene ? (state.cards[0].explanation.sceneTitle || '') : '';
  const expr = exprOf(s || {});
  const prevRecord = state.prevRecord || 27;

  // 좌측 레일 — 표현 스텝
  const rail = h('div', { class: 'vs-rail' },
    h('button', { class: 'hm', type: 'button', 'aria-label': '홈', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 17 })),
    Array.from({ length: total }, (_, i) => h('button', {
      class: 'vs-rstep' + (i + 1 === idx ? ' on' : i + 1 < idx ? ' done' : ''), type: 'button',
      onClick: () => handlers.onJump?.(i + 1 + offset),
    }, String(i + 1))),
    h('span', { class: 'sp' }),
    h('span', { class: 'tm' }, state.time || '00:00'),
  );

  // ── 카드 컨트롤 (듣기 / 따라 말하기 / 점수 링) ──
  let playing = false, recCtrl = null;
  const listenPill = h('button', { class: 'vs-pill', type: 'button' }, vIcon(VI.PLAY, { size: 12, fill: true }), '듣기');
  const recPill = h('button', { class: 'vs-pill pri', type: 'button' }, vIcon(VI.MIC, { size: 14, sw: 2 }), '따라 말하기');
  const recCount = () => state.recLog?.[s?.id]?.count ?? 0;
  // 점수링 캡션 — 메인 점수 있으면 '직전 점수 · N회 시도', 점수 없이 시도만(응용 발화 등) 있으면 'N회 시도', 없으면 '아직 시도 전'.
  const capText = () => (state.lastScore != null ? `직전 점수 · ${recCount()}회 시도` : (recCount() > 0 ? `${recCount()}회 시도` : '아직 시도 전'));
  const ring = ringEl(state.lastScore);
  const ringHost = h('div', { style: 'margin-left:auto;display:flex;align-items:center;gap:10px;' }, ring,
    h('span', { class: 'vs-cap', id: 'vs-cap' }, capText()));
  const ctrl = h('div', { class: 'vs-ctrl' }, listenPill, recPill, ringHost);

  const stopPlaying = () => { playing = false; listenPill.classList.remove('playing'); listenPill.lastChild.textContent = '듣기'; };
  listenPill.addEventListener('click', () => {
    if (state.recording) return;
    if (playing) { try { window.studySpeech?.cancel?.(); } catch { /* noop */ } stopPlaying(); return; }
    if (!s?.sentence || !window.studySpeech?.speak) return;
    playing = true; listenPill.classList.add('playing'); listenPill.lastChild.textContent = '재생 중';
    window.studySpeech.speak(s.sentence, { lang: ttsLang, speaker: s?.speaker, onEnd: stopPlaying });
    setTimeout(stopPlaying, 30000);
  });

  // 발화 dots + 콤보 + 게이트
  const dotsEl = h('span', { class: 'd' });
  const sayLine = h('span', { class: 'vs-say' }, h('span', {}, '발화'), dotsEl, h('span', { class: 'vs-say-n' }, ''));
  const comboEl = h('span', { class: 'vs-combo' }, vIcon(VI.ZAP, { size: 11, fill: true }), `콤보 ×${state.combo || 0}`);
  const passChip = h('span', { class: 'vs-pass', style: 'display:none;' }, vIcon(VI.ZAP, { size: 11, fill: true }), '');
  const meta = h('div', { class: 'vs-meta' }, sayLine, comboEl, passChip);

  // 우측 — 오늘 발화 기록 비교 위젯
  const recN = h('span', { class: 'n' }, String(state.tried || 0));
  const recBar = h('div', { class: 'v-bar' }, h('i', { style: `width:${Math.min(Math.round(((state.tried || 0) / Math.max(prevRecord, 1)) * 100), 100)}%` }));
  const recMsg = h('div', { class: 'msg' }, '');
  const recHd = h('div', { class: 'hd' }, h('span', { class: 'lb' }, '오늘 발화'), h('span', { class: 'vs-newrec', style: 'display:none;' }, vIcon(VI.ZAP, { size: 10, fill: true }), '기록 갱신!'));
  const recWidget = h('div', { class: 'vs-rec' }, recHd,
    h('div', { class: 'nr' }, recN, h('span', { class: 'u' }, `회 / 직전 세션 기록 ${prevRecord}회`)), recBar, recMsg);

  const refreshDots = () => {
    dotsEl.innerHTML = '';
    const c = Math.min(recCount(), REC_TARGET);
    for (let i = 0; i < REC_TARGET; i++) dotsEl.appendChild(h('i', { class: i < c ? 'f' : '' }));
    sayLine.querySelector('.vs-say-n').textContent = recCount() >= REC_TARGET ? `${REC_TARGET} / ${REC_TARGET} 완료` : `${recCount()} / ${REC_TARGET}`;
    comboEl.lastChild.textContent = `콤보 ×${state.combo || 0}`;
    const gateOk = canAdvance(state, s?.id) && recCount() >= REC_TARGET;
    nextBtn.classList.toggle('unlock', gateOk);
    gateEl.className = 'vs-gate' + (gateOk ? ' ok' : '');
    gateEl.textContent = gateOk ? '발화 3회 완료 — 다음 표현이 열렸어요' : `발화 ${REC_TARGET}회를 채우면 열려요 (${recCount()}/${REC_TARGET})`;
  };
  const refreshRecWidget = () => {
    recN.textContent = String(state.tried || 0);
    recBar.firstChild.style.width = Math.min(Math.round(((state.tried || 0) / Math.max(prevRecord, 1)) * 100), 100) + '%';
    if ((state.tried || 0) > prevRecord) {
      recHd.querySelector('.vs-newrec').style.display = '';
      recBar.firstChild.style.background = 'var(--coral)';
      recMsg.innerHTML = '직전 세션 기록을 <b>넘었어요!</b> 어디까지 가나 볼까요?';
    } else {
      recMsg.innerHTML = `<b>${Math.max(prevRecord - (state.tried || 0), 0)}회</b>만 더 말하면 직전 세션 기록을 깨요!`;
    }
  };

  // 점수 → 리빌 적용 (state·DOM·애니). DB 쓰기는 실경로에서만 별도 호출. 데모 시뮬과 단일 출처 공유.
  let curRing = ring;
  function applyScore(score, weakPhonemes) {
    state.lastScore = score; state.tried = (state.tried || 0) + 1;
    const passed = score >= PASS_THRESHOLD;
    if (passed) { state.passed = (state.passed || 0) + 1; state.combo = (state.combo || 0) + 1; } else { state.combo = 0; }
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    bumpRecLog(state, s?.id, score);
    const newRing = ringEl(score); curRing.replaceWith(newRing); curRing = newRing;
    ringHost.lastChild.textContent = capText();
    if (passed) { passChip.style.display = ''; passChip.lastChild.textContent = `PASS · 콤보 ×${state.combo}`; }
    else passChip.style.display = 'none';
    refreshDots(); refreshRecWidget();
  }
  const setRecVisual = (on) => {
    recPill.classList.toggle('recing', on); recPill.classList.toggle('pri', !on);
    recPill.replaceChild(on ? vEq(4) : vIcon(VI.MIC, { size: 14, sw: 2 }), recPill.firstChild);
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
      // 말 끝나면(발화 후 1.2초 무음) 자동 종료 — 듣기처럼 손 안 대도 마무리. 수동 멈추기도 유지.
      const rec = await startMicRecording({ autoStopSilenceMs: 1200, onAutoStop: () => { finishRecording(); } });
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
    const result = await stopAndAnalyze(ctrlR, s.sentence, s);
    state.recording = false;
    if (result?.mockFallback) { setRecVisual(false); showRecordToast(recordErrorMessage(result.fallbackReason)); return; }
    applyScore(Number(result?.score) || 0, result?.weakPhonemes);
    setRecVisual(false); // applyScore(bumpRecLog) 후 → 라벨 '다시 말하기' 반영
    try {
      await savePronunciationLog(window.studyDB, { result, sentenceId: s.id, lang, date: getTodayISO() });
      await applyWeakPhonemesUpdate(window.studyDB, lang, result?.weakPhonemes);
    } catch (e) { console.error('[sessionExprV2] pron persist', e); }
    handlers.saveSnapshot?.();
  }

  // 다음 표현 버튼 + 게이트
  const nextBtn = h('button', { class: 'vs-next', type: 'button', onClick: handlers.onNext }, idx >= total ? '학습 완료 →' : '다음 표현 →');
  const gateEl = h('div', { class: 'vs-gate' }, '');

  // 응용 연습 — 드릴 녹음도 세션 발화 1건으로 집계 ('오늘 발화' + 요약 통과율/평균/약점음소)
  // + 다음-표현 게이트(recLog count)에도 포함 (2026-07-01 사용자 지시 — 응용 발화도 3회 게이트에 셈).
  // 단 콤보·PASS 칩(연속 PASS 게이미피케이션)은 메인 표현 전용 — drill 미반영 유지.
  // 근접중복(호칭·감탄사만 덧붙인 드릴)은 렌더에서 제외 — 원본 데이터는 손대지 않음(사용자 결정 2026-07-09).
  const drills = filterNearDupDrills(s?.sentence, ex.drills);
  const drillCountEl = h('b', {}, '0');
  const recordedDrills = new Set();
  const onDrillScore = (i, result) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    if (!recordedDrills.has(i)) { recordedDrills.add(i); drillCountEl.textContent = String(Math.min(recordedDrills.size, drills.length)); }
    bumpRecLog(state, s?.id, score);  // 응용 발화도 '다음 표현' 3회 게이트에 카운트
    refreshDots();                    // 게이트·발화 dots 갱신 (recCount 반영)
    ringHost.lastChild.textContent = capText();
    refreshRecWidget();
    handlers.saveSnapshot?.();
  };
  const drillsBlock = drills.length ? h('div', {},
    h('div', { class: 'vs-labrow' }, h('span', { class: 'vs-lab' }, '응용 연습 — 듣고, 따라 말하고, 녹음하기'), h('span', { class: 'ct' }, '녹음 ', drillCountEl, ' / ' + drills.length)),
    h('div', { style: 'margin-top:4px;' }, drillRows(drills, expr, lang, s?.speaker, onDrillScore, state.demo)),
  ) : null;

  // 체이닝(chain) — 확장 사다리(ladder) 폐기 후속. 자막 없이 듣고 따라 말하기 + 단어 누락 0 통과.
  // 체이닝 발화도 세션 발화 1건 (드릴과 동일하게 '오늘 발화'·3회 게이트에 집계).
  // 단 '통과'(passed) 는 발음 점수 기준을 유지 — 체이닝의 통과/실패는 단계 진행에만 쓰인다.
  const onChainScore = (result) => {
    const score = Math.round(Number(result?.score) || 0);
    state.tried = (state.tried || 0) + 1;
    if (score >= PASS_THRESHOLD) state.passed = (state.passed || 0) + 1;
    if (!Array.isArray(state.pronScores)) state.pronScores = [];
    state.pronScores.push(score);
    if (Array.isArray(result?.weakPhonemes)) { if (!state.weakInSession) state.weakInSession = {}; for (const ph of result.weakPhonemes) if (ph) state.weakInSession[ph] = (state.weakInSession[ph] || 0) + 1; }
    bumpRecLog(state, s?.id, score);
    refreshDots();
    ringHost.lastChild.textContent = capText();
    refreshRecWidget();
    handlers.saveSnapshot?.();
  };
  const chainBlock = chainBlockEl(ex.chain, lang, s, state.demo, onChainScore);

  const progBars = Array.from({ length: total }, (_, i) => h('i', { class: i < idx ? 'f' : '' }));

  const cardEl = h('div', { class: 'vs-card' },
    h('h1', { class: 'vs-h1' }, hlNode(s?.sentence || '', expr || pickUnderline(s?.sentence))),
    h('div', { class: 'vs-ko' }, s?.ko || ''),
    s?.pron ? h('div', { class: 'vs-pron' }, s.pron) : null,
    ctrl, meta);

  let root, timeUpdate;
  if (state.size !== 'desktop') {
    // ── 모바일 단일 칼럼 ──
    const mTime = h('span', { class: 'm-topb-time' }, state.time || '00:00');
    const mTopb = h('div', { class: 'm-topb' },
      h('div', { class: 'm-topb-row' },
        h('button', { class: 'm-home', type: 'button', onClick: handlers.onHome || (() => { window.location.hash = '#/home'; }) }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
        h('span', { class: 'm-topb-meta' }, '신규 학습 · ' + subjLabel),
        mTime),
      h('div', { class: 'm-prog' }, progBars));
    const mSteps = h('div', { class: 'm-steps' },
      Array.from({ length: total }, (_, i) => h('button', { class: 'm-rstep' + (i + 1 === idx ? ' on' : i + 1 < idx ? ' done' : ''), type: 'button', onClick: () => handlers.onJump?.(i + 1 + offset) }, String(i + 1))),
      h('span', { class: 'sp' }), h('span', { class: 'pt' }, `${idx} / ${total}`));
    const foldBd = h('div', { class: 'fbd', style: 'display:none;' }, explainPanel(ex));
    const fhd = h('div', { class: 'fhd' }, h('span', { class: 'ft' }, '표현 해설'), h('span', { class: 'chev' }, vIcon(VI.CHEV_DOWN, { size: 13, sw: 2 })));
    const fold = h('div', { class: 'vs-fold' }, fhd, foldBd);
    fhd.addEventListener('click', () => { const open = fold.classList.toggle('open'); foldBd.style.display = open ? '' : 'none'; });
    const sceneChip = sceneTitle ? `${sceneTitle} · ${subjLabel}` : `신규 학습 · ${subjLabel}`;
    root = h('div', { class: 'vs' }, v2Style(VSM_CSS),
      mTopb, mSteps,
      h('div', { class: 'm-pad' },
        h('div', { style: 'margin-top:8px;' }, h('span', { class: 'scene-chip' }, sceneChip)),
        cardEl, recWidget, drillsBlock, chainBlock, fold),
      h('div', { class: 'm-cta' }, gateEl, nextBtn));
    timeUpdate = (t) => { mTime.textContent = t; };
  } else {
    // ── 데스크톱 3칼럼 ──
    const main = h('div', { class: 'vs-main' },
      h('div', { class: 'vs-crumb' },
        h('span', { class: 'vs-scene' }, (sceneTitle || '신규 학습') + ' · ' + subjLabel),
        h('div', { class: 'vs-prog' }, progBars),
        h('span', { class: 'vs-prog-t' }, `${idx} / ${total}`)),
      cardEl, drillsBlock, chainBlock);
    const side = h('aside', { class: 'vs-side' }, recWidget, explainPanel(ex), nextBtn, gateEl);
    root = h('div', { class: 'vs' }, v2Style(VS_CSS), rail, h('div', { class: 'vs-mainwrap' }, main, side));
    timeUpdate = (t) => { const el = rail.querySelector('.tm'); if (el) el.textContent = t; };
  }
  host.appendChild(root);
  refreshDots(); refreshRecWidget();

  const layout = { update(st) { if (st && 'time' in st) timeUpdate(st.time); } };
  return { cleanup: () => { try { window.studySpeech?.cancel?.(); if (recCtrl?.stop) recCtrl.stop(); } catch { /* noop */ } host.innerHTML = ''; }, layout };
}

// 표현 키가 없을 때 밑줄 대상 — 마지막 단어(대략) 강조.
function pickUnderline(sentence) {
  if (!sentence) return null;
  const words = String(sentence).replace(/[?.!,]/g, '').split(' ').filter(Boolean);
  return words.length ? words[words.length - 1] : null;
}

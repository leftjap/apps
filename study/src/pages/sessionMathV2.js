/* 수학 세션 — 데스크톱 C 파이널 v2 (작업지시서 §5)
 * 정답 공개 + 자기 채점: 풀이 단계 안착 → 정답 박스 → 자기 채점(맞았어요/틀렸어요-다시 풀기) → SRS.
 * 발화 요소 없음. 우측 개념 카드. 정본 시안: 작업지시서 v-math.jsx (SessMath)
 *
 * ctx: { idx, total, mode, c, figureNode, onGrade(correct), onNext, onPrev, onJump, onHome,
 *        graded(c.id 채점됨 여부), passRate }
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, vCheck, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';

const VM_CSS = `
.vm{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;display:flex;word-break:keep-all;${V_VARS}}
.vm *{box-sizing:border-box;margin:0}
.vm-rail{width:88px;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;padding:24px 0;gap:8px;flex:0 0 auto}
.vm-rail .hm{color:var(--faint);margin-bottom:16px;background:none;border:0;cursor:pointer;display:inline-flex}
.vm-rstep{width:38px;height:38px;border-radius:13px;display:grid;place-items:center;font-family:Outfit;font-size:13.5px;font-weight:700;color:var(--faint);cursor:pointer;background:none;border:0}
.vm-rstep.on{background:var(--teal-soft);color:var(--teal-deep);animation:v-haloT 2.4s ease-in-out infinite}
.vm-rstep.done{color:var(--teal-deep)}
.vm-rail .sp{flex:1}
.vm-rail .tm{font-family:Outfit;font-size:11px;color:var(--faint);letter-spacing:.08em}
.vm-mainwrap{flex:1;display:flex;justify-content:center;gap:26px;padding:38px 46px 40px}
.vm-main{width:760px;max-width:100%}
.vm-crumb{display:flex;align-items:center;gap:14px}
.vm-scene{font-size:12px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:6px 13px;white-space:nowrap}
.vm-prog{flex:1;display:flex;gap:5px}
.vm-prog i{flex:1;height:4px;border-radius:2px;background:#e7e3d4}
.vm-prog i.f{background:var(--teal)}
.vm-prog-t{font-family:Outfit;font-size:12px;color:var(--faint);font-weight:600;white-space:nowrap}
.vm-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:36px 44px;margin-top:20px;
  box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.14)}
.vm-eyebrow{font-family:Outfit;font-size:11.5px;letter-spacing:.15em;color:var(--faint);font-weight:600;text-transform:uppercase}
.vm-q{font-family:Outfit;font-size:33px;font-weight:700;letter-spacing:-0.02em;line-height:1.35;margin-top:14px}
.vm-q sup{font-size:.6em}
.vm-fig{margin-top:18px;display:flex;justify-content:center}
.vm-steps{margin-top:24px;border-top:1px solid var(--line)}
.vm-step{display:flex;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);align-items:baseline;animation:v-settle .5s both}
.vm-step .ix{font-family:Outfit;font-size:11px;color:var(--faint);width:16px;flex:0 0 auto}
.vm-step .tx{font-size:14.5px;line-height:1.6;color:#4a5450}
.vm-step .tx b{color:var(--ink);font-family:Outfit}
.vm-ans{margin-top:18px;background:var(--teal-soft);border-radius:14px;padding:16px 20px;display:flex;align-items:baseline;gap:14px;animation:v-settle .6s .45s both}
.vm-ans .lb{font-family:Outfit;font-size:10.5px;letter-spacing:.15em;font-weight:600;color:var(--teal-deep);text-transform:uppercase;white-space:nowrap}
.vm-ans .v{font-family:Outfit;font-size:21px;font-weight:700;color:var(--teal-deep)}
.vm-grade{display:flex;gap:12px;margin-top:22px;align-items:center;flex-wrap:wrap}
.vm-gbtn{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;border-radius:13px;padding:14px 26px;white-space:nowrap}
.vm-gbtn.ok{background:var(--teal);color:#fff;border:0;animation:v-breathe 2.6s ease-in-out infinite}
.vm-gbtn.no{background:transparent;color:var(--coral-deep);border:1.5px solid oklch(58% .115 32/.45)}
.vm-grade .hh{font-size:12px;color:var(--faint);white-space:nowrap}
.vm-graded{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:700;border-radius:999px;padding:8px 16px}
.vm-graded.ok{background:var(--teal-soft);color:var(--teal-deep)}
.vm-graded.no{background:var(--coral-soft);color:var(--coral-deep)}
.vm-side{width:324px;flex:0 0 auto}
.vm-pane{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 22px;margin-bottom:13px}
.vm-klab{font-family:Outfit;font-size:10px;letter-spacing:.16em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vm-formula{background:var(--teal-soft);border-radius:12px;padding:13px 16px;margin-top:10px;font-family:Outfit;font-size:14.5px;font-weight:600;color:var(--teal-deep);text-align:center}
.vm-b2{font-size:12.5px;line-height:1.7;color:#4a5450;margin-top:10px;text-wrap:pretty}
.vm-b2 b{color:var(--ink)}
.vm-kv{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;color:var(--mut);margin-top:10px}
.vm-kv b{font-family:Outfit;font-size:16px;font-weight:700;color:var(--ink)}
.vm-pane .v-bar{height:5px;margin-top:10px}
.vm-pane .v-bar > i{background:var(--teal)}
.vm-next{width:100%;font:inherit;font-size:14.5px;font-weight:700;border-radius:13px;padding:15px 0;cursor:pointer;border:1.5px solid var(--line);background:transparent;color:var(--faint)}
.vm-next.unlock{background:var(--teal);border-color:var(--teal);color:#fff;box-shadow:0 8px 16px -11px oklch(44% .062 192/.7)}
.vm-gate{font-size:11.5px;color:var(--faint);text-align:center;margin-top:9px}
.vm-gate.ok{color:var(--teal-deep);font-weight:600}
/* 개념 카드 */
.vm-concept{max-width:820px}
.vm-ctitle{font-family:Outfit;font-size:34px;font-weight:700;letter-spacing:-0.025em;margin-top:14px}
.vm-cbody{font-size:15.5px;color:#3f4845;line-height:1.8;margin-top:14px}
.vm-csec{padding-left:14px;border-left:3px solid var(--teal-line);margin-top:16px}
.vm-csec .lb{font-family:Outfit;font-size:10.5px;letter-spacing:.15em;font-weight:600;color:var(--teal-deep);text-transform:uppercase}
.vm-csec p{font-size:14.5px;color:var(--mut);line-height:1.75;margin-top:5px}
.vm-cbtn{margin-top:30px;display:inline-flex;align-items:center;gap:8px;background:var(--teal);color:#fff;border:0;border-radius:13px;padding:15px 28px;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;animation:v-breathe 2.6s ease-in-out infinite}
@media (max-width:1100px){.vm-mainwrap{flex-direction:column;align-items:center}.vm-side{width:760px;max-width:100%}}
`;

function rail(ctx) {
  return h('div', { class: 'vm-rail' },
    h('button', { class: 'hm', type: 'button', 'aria-label': '홈', onClick: ctx.onHome }, vIcon(VI.HOME, { size: 17 })),
    Array.from({ length: ctx.total || 1 }, (_, i) => h('button', {
      class: 'vm-rstep' + (i === ctx.idx ? ' on' : i < ctx.idx ? ' done' : ''), type: 'button',
      onClick: () => ctx.onJump?.(i),
    }, String(i + 1))),
    h('span', { class: 'sp' }),
    h('span', { class: 'tm' }, ''),
  );
}

// 문항 본문에 x^2 등 위첨자 표기 — 시드의 '²','x^2' graceful.
function qNode(text) {
  const span = h('span', {});
  span.innerHTML = String(text || '').replace(/\^2/g, '<sup>2</sup>').replace(/²/g, '<sup>2</sup>');
  return span;
}

/* 모바일(phone/tablet) — 단일 칼럼 셸 + 도형 폭맞춤 (작업지시서 모바일 §3-5) */
const VMM_CSS = `
.vm{min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;display:flex;flex-direction:column;${V_VARS}}
.vm *{box-sizing:border-box;margin:0}
.vm button{font:inherit;background:none;border:0;cursor:pointer;padding:0;color:inherit}
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
.scene-chip{display:inline-flex;font-family:Outfit;font-size:11px;font-weight:700;color:var(--teal-deep);background:var(--teal-soft);border-radius:999px;padding:5px 11px;letter-spacing:.02em;white-space:nowrap;margin-top:8px}
.m-cta{flex:0 0 auto;background:oklch(97.5% .009 95/.96);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 20px calc(12px + env(safe-area-inset-bottom))}
.m-cta .vm-gate{font-size:11.5px;color:var(--faint);text-align:center;margin-bottom:9px;white-space:nowrap}
.m-cta .vm-gate.ok{color:var(--teal-deep);font-weight:600}
.m-cta .vm-cbtn,.m-cta .vm-next{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border-radius:14px;font-size:15px;font-weight:700;white-space:nowrap}
.m-cta .vm-cbtn{background:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.m-cta .vm-next{background:transparent;border:1.5px solid var(--line);color:var(--faint)}
.m-cta .vm-next.unlock{background:var(--teal);border-color:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.vm-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px 22px;margin-top:14px;box-shadow:0 1px 0 rgba(25,35,32,.02),0 12px 26px -20px rgba(25,35,32,.14)}
.vm-eyebrow{font-family:Outfit;font-size:11px;letter-spacing:.14em;color:var(--faint);font-weight:600;text-transform:uppercase}
.vm-ctitle{font-family:Outfit;font-size:27px;font-weight:700;letter-spacing:-.025em;margin-top:10px}
.vm-q{font-family:Outfit;font-size:23px;font-weight:700;letter-spacing:-.02em;line-height:1.35;margin-top:10px}
.vm-q sup{font-size:.6em}
.vm-fig{margin-top:16px;display:flex;justify-content:center}
.vm-fig svg{max-width:100%;height:auto}
.vm-cbody{font-size:14.5px;color:var(--text,#3f4845);line-height:1.75;margin-top:12px}
.vm-cbody b{color:var(--ink)}
.vm-formula{background:var(--teal-soft);border-radius:12px;padding:12px 14px;margin-top:9px;font-family:Outfit;font-size:14px;font-weight:600;color:var(--teal-deep);text-align:center}
.vm-csec{padding-left:13px;border-left:3px solid var(--teal-line);margin-top:14px}
.vm-csec .lb{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--teal-deep);text-transform:uppercase}
.vm-csec p{font-size:13.5px;color:var(--mut);line-height:1.7;margin-top:5px}
.vm-steps{margin-top:18px;border-top:1px solid var(--line)}
.vm-step{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);align-items:baseline}
.vm-step .ix{font-family:Outfit;font-size:11px;color:var(--faint);width:14px;flex:0 0 auto}
.vm-step .tx{font-size:14px;line-height:1.55;color:#4a5450}
.vm-step .tx b{color:var(--ink);font-family:Outfit}
.vm-ans{margin-top:16px;background:var(--teal-soft);border-radius:14px;padding:14px 18px;display:flex;align-items:baseline;gap:12px}
.vm-ans .lb{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--teal-deep);text-transform:uppercase;white-space:nowrap}
.vm-ans .v{font-family:Outfit;font-size:20px;font-weight:700;color:var(--teal-deep)}
.vm-grade{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
.vm-grade .hh{flex-basis:100%;font-size:11.5px;color:var(--faint);text-align:center}
.vm-gbtn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;font-size:14px;font-weight:700;border-radius:13px;padding:14px 0;white-space:nowrap;min-height:50px}
.vm-gbtn.ok{background:var(--teal);color:#fff;animation:v-breathe 2.6s ease-in-out infinite}
.vm-gbtn.no{background:transparent;color:var(--coral-deep);border:1.5px solid oklch(58% .115 32/.45)}
.vm-graded{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:700;border-radius:999px;padding:9px 16px}
.vm-graded.ok{background:var(--teal-soft);color:var(--teal-deep)}
.vm-graded.no{background:var(--coral-soft);color:var(--coral-deep)}
.vm-pane{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-top:12px}
.vm-klab{font-family:Outfit;font-size:10px;letter-spacing:.14em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vm-b2{font-size:12.5px;line-height:1.65;color:#4a5450;margin-top:9px;text-wrap:pretty}
.vm-b2 b{color:var(--ink)}
.vm-kv{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;color:var(--mut);margin-top:9px}
.vm-kv b{font-family:Outfit;font-size:15px;font-weight:700;color:var(--ink)}
.vm-pane .v-bar{height:5px;margin-top:9px}
.vm-pane .v-bar > i{background:var(--teal)}
`;

function mMathTop(ctx, total, idx, meta, ptLabel) {
  const mProg = Array.from({ length: total }, (_, i) => h('i', { class: i <= idx ? 'f' : '' }));
  const mSteps = h('div', { class: 'm-steps' },
    Array.from({ length: total }, (_, i) => h('button', { class: 'm-rstep' + (i === idx ? ' on' : i < idx ? ' done' : ''), type: 'button', onClick: () => ctx.onJump?.(i) }, String(i + 1))),
    h('span', { class: 'sp' }), h('span', { class: 'pt' }, ptLabel));
  const mTopb = h('div', { class: 'm-topb' },
    h('div', { class: 'm-topb-row' },
      h('button', { class: 'm-home', type: 'button', onClick: ctx.onHome }, vIcon(VI.HOME, { size: 14 }), '홈으로'),
      h('span', { class: 'm-topb-meta' }, meta),
      h('span', { class: 'm-topb-time' }, '')),
    h('div', { class: 'm-prog' }, mProg));
  return [mTopb, mSteps];
}

export function renderMathV2(host, c, ctx) {
  ensureV2Fonts();
  const total = ctx.total || 1;
  const idx = ctx.idx || 0;

  // ── 개념 카드 ──
  if (c.kind === 'concept') {
    const sections = [['배경', c.background], ['왜 배울 가치', c.value], ['길러지는 사고', c.thinking], ['실생활', c.realLife]].filter(([, v]) => v);
    const figs = Array.isArray(c.figures) ? c.figures : (c.figure ? [c.figure] : []);
    const cbtn = h('button', { class: 'vm-cbtn', type: 'button', onClick: () => ctx.onConceptDone?.() }, vIcon(VI.CHECK, { size: 14, sw: 2.4 }), '이해했어요 · 응용 풀기');
    const cardInner = [
      h('div', { class: 'vm-eyebrow' }, '개념'),
      h('h1', { class: 'vm-ctitle' }, c.title || ''),
      figs.length ? h('div', { class: 'vm-fig' }, figs.map((f) => ctx.figureNode?.(f)).filter(Boolean)) : null,
      (c.body || []).map((p) => h('div', { class: 'vm-cbody' }, p)),
      c.worked ? h('div', { class: 'vm-formula', style: 'text-align:left;margin-top:18px;' }, (c.worked.steps || []).join('  →  ')) : null,
      sections.length ? h('div', {}, sections.map(([lb, tx]) => h('div', { class: 'vm-csec' }, h('div', { class: 'lb' }, lb), h('p', {}, tx)))) : null,
    ];
    let root;
    if (ctx.size !== 'desktop') {
      const [mTopb, mSteps] = mMathTop(ctx, total, idx, '수학 · 개념', '개념');
      root = h('div', { class: 'vm' }, v2Style(VMM_CSS), mTopb, mSteps,
        h('div', { class: 'm-pad' }, h('span', { class: 'scene-chip' }, (c.module || '개념') + ' · 수학'), h('div', { class: 'vm-card' }, cardInner)),
        h('div', { class: 'm-cta' }, cbtn));
    } else {
      const main = h('div', { class: 'vm-main vm-concept' },
        h('div', { class: 'vm-crumb' }, h('span', { class: 'vm-scene' }, (c.module || '개념') + ' · 수학'),
          h('div', { class: 'vm-prog' }, Array.from({ length: total }, (_, i) => h('i', { class: i <= idx ? 'f' : '' }))),
          h('span', { class: 'vm-prog-t' }, `${idx + 1} / ${total}`)),
        h('div', { class: 'vm-card', style: 'margin-top:20px;' }, cardInner, cbtn));
      root = h('div', { class: 'vm' }, v2Style(VM_CSS), rail(ctx), h('div', { class: 'vm-mainwrap' }, main));
    }
    host.appendChild(root);
    return { cleanup: () => { host.innerHTML = ''; }, layout: { update() {} } };
  }

  // ── 응용 문제 (정답 공개 + 자기 채점) ──
  const sol = c.solution || {};
  const steps = Array.isArray(sol.steps) ? sol.steps : [];
  const figs = Array.isArray(c.figures) ? c.figures : (c.figure ? [c.figure] : []);

  const gradeWrap = h('div', { class: 'vm-grade' });
  const nextBtn = h('button', { class: 'vm-next', type: 'button', onClick: () => ctx.onNext?.() }, idx + 1 >= total ? '마치기 →' : '다음 문제 →');
  const gateEl = h('div', { class: 'vm-gate' }, '자기 채점을 하면 열려요');

  const setGraded = (correct) => {
    gradeWrap.innerHTML = '';
    gradeWrap.appendChild(h('span', { class: 'vm-graded ' + (correct ? 'ok' : 'no') },
      correct ? vCheck({ size: 13, sw: 2.6 }) : null, correct ? '맞았어요로 채점됨' : '다시 풀기로 채점됨'));
    nextBtn.classList.add('unlock');
    gateEl.className = 'vm-gate ok';
    gateEl.textContent = correct ? '자기 채점 완료 — 다음 문제가 열렸어요' : '다시 풀기 반영 — 내일 다시 만나요';
  };

  if (ctx.alreadyGraded) {
    setGraded(ctx.alreadyGradedCorrect !== false);
  } else {
    gradeWrap.append(
      h('button', { class: 'vm-gbtn ok', type: 'button', onClick: () => { ctx.onGrade?.(true); setGraded(true); } }, vIcon(VI.CHECK, { size: 14, sw: 2.4 }), '맞았어요'),
      h('button', { class: 'vm-gbtn no', type: 'button', onClick: () => { ctx.onGrade?.(false); setGraded(false); } }, '틀렸어요 — 다시 풀기'),
      h('span', { class: 'hh' }, '자기 채점이 복습 주기에 반영돼요'),
    );
  }

  const card = h('div', { class: 'vm-card' },
    h('div', { class: 'vm-eyebrow' }, `문제 ${idx + 1} / ${total}${ctx.mode === 'review' ? ' · 복습' : ' · 개념 응용'}`),
    h('div', { class: 'vm-q' }, qNode(c.prompt)),
    figs.length ? h('div', { class: 'vm-fig' }, figs.map((f) => ctx.figureNode?.(f)).filter(Boolean)) : null,
    steps.length ? h('div', { class: 'vm-steps' }, steps.map((s, i) => h('div', { class: 'vm-step', style: `animation-delay:${i * 0.15}s` },
      h('span', { class: 'ix' }, String(i + 1)), h('span', { class: 'tx', html: String(s).replace(/\^2/g, '<sup>2</sup>') })))) : null,
    h('div', { class: 'vm-ans' }, h('span', { class: 'lb' }, '정답'), h('span', { class: 'v' }, String(c.answer ?? ''))),
    gradeWrap);
  const conceptPane = h('div', { class: 'vm-pane' },
    h('span', { class: 'vm-klab' }, '개념 — ' + (sol.title || c.module || '핵심')),
    sol.formula ? h('div', { class: 'vm-formula' }, sol.formula) : (sol.core ? h('div', { class: 'vm-formula', style: 'font-size:13px;' }, sol.core) : null),
    sol.idea ? h('div', { class: 'vm-b2', html: String(sol.idea) }) : (sol.core ? h('div', { class: 'vm-b2' }, sol.core) : null));

  let root;
  if (ctx.size !== 'desktop') {
    const [mTopb, mSteps] = mMathTop(ctx, total, idx, '수학 · 응용', `${idx + 1} / ${total}`);
    root = h('div', { class: 'vm' }, v2Style(VMM_CSS), mTopb, mSteps,
      h('div', { class: 'm-pad' }, h('span', { class: 'scene-chip' }, (c.module || '응용') + ' · 수학'), card, conceptPane),
      h('div', { class: 'm-cta' }, gateEl, nextBtn));
  } else {
    const main = h('div', { class: 'vm-main' },
      h('div', { class: 'vm-crumb' }, h('span', { class: 'vm-scene' }, (c.module || '응용') + ' · 수학'),
        h('div', { class: 'vm-prog' }, Array.from({ length: total }, (_, i) => h('i', { class: i <= idx ? 'f' : '' }))),
        h('span', { class: 'vm-prog-t' }, `${idx + 1} / ${total}`)),
      card);
    const side = h('aside', { class: 'vm-side' }, conceptPane,
      h('div', { class: 'vm-pane' }, h('span', { class: 'vm-klab' }, '오늘 진행'),
        h('div', { class: 'vm-kv' }, h('span', {}, '문제'), h('b', {}, `${idx + 1} / ${total}`)),
        h('div', { class: 'v-bar' }, h('i', { style: `width:${Math.round(((idx + 1) / total) * 100)}%` })),
        ctx.passRate != null ? h('div', { class: 'vm-kv' }, h('span', {}, '이번 주 정답률'), h('b', {}, `${ctx.passRate}%`)) : null),
      nextBtn, gateEl);
    root = h('div', { class: 'vm' }, v2Style(VM_CSS), rail(ctx), h('div', { class: 'vm-mainwrap' }, main, side));
  }
  host.appendChild(root);
  return { cleanup: () => { host.innerHTML = ''; }, layout: { update() {} } };
}

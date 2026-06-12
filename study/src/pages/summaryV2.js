/* 세션 요약 — 데스크톱 C 파이널 v2 (작업지시서 §6)
 * 코랄 링 체크 드로우 + 스탯 스태거 + 기록 갱신 배너 + 다음 발음 힌트 + 다음 행동(복습) 연결.
 * 정본 시안: 작업지시서 v-summary.jsx (SummaryV2)
 *
 * data: { mode, durationSec, newCount, judged:{got,hmm,no}, tryCount, passCount, total,
 *         pronAvg?, weakTop3?, returnTo?, sceneTitle?, prevUtter? }
 */
import { h } from '../components/d1/dom.js';
import { V_VARS, VI, vIcon, vCheck, v2Style, ensureV2Fonts } from '../components/v2/atoms.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VY_CSS = `
.vy{width:100%;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:Pretendard,sans-serif;word-break:keep-all;${V_VARS}}
.vy *{box-sizing:border-box;margin:0}
.vy-wrap{width:100%;max-width:760px;margin:0 auto;padding:64px 24px 56px;display:flex;flex-direction:column;align-items:center;text-align:center}
.vy-ring{position:relative;width:104px;height:104px}
.vy-ring svg{transform:rotate(-90deg)}
.vy-ring .arc{animation:vy-sweep 1s cubic-bezier(.3,.7,.3,1) both}
@keyframes vy-sweep{from{stroke-dashoffset:289}}
.vy-ring .ck{position:absolute;inset:0;display:grid;place-items:center;color:var(--coral-deep)}
.vy-h1{font-family:Outfit;font-size:34px;font-weight:700;letter-spacing:-0.03em;margin-top:24px;animation:v-settle .6s .3s both}
.vy-sub{font-size:14.5px;color:var(--mut);margin-top:10px;animation:v-settle .6s .45s both}
.vy-banner{margin-top:22px;display:inline-flex;align-items:center;gap:9px;background:var(--coral-soft);color:var(--coral-deep);border-radius:999px;padding:10px 22px;font-size:13.5px;font-weight:800;white-space:nowrap;animation:v-settle .7s .6s both}
.vy-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:34px;width:100%}
.vy-st{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px 0;animation:v-settle .6s both}
.vy-st .lb{font-family:Outfit;font-size:10.5px;letter-spacing:.15em;font-weight:600;color:var(--faint);text-transform:uppercase}
.vy-st .n{font-family:Outfit;font-size:32px;font-weight:700;letter-spacing:-0.03em;margin-top:10px;line-height:1}
.vy-st .n em{font-style:normal;font-size:15px;color:var(--faint);font-weight:600}
.vy-st .n.gold{color:var(--coral-deep)}
.vy-st .d{font-size:11.5px;color:var(--mut);margin-top:8px}
.vy-st .d b{color:var(--coral-deep)}
.vy-chips{display:flex;gap:8px;margin-top:26px;align-items:center;flex-wrap:wrap;justify-content:center;animation:v-settle .6s 1.1s both}
.vy-chips .lb{font-size:12.5px;color:var(--faint);white-space:nowrap}
.vy-chip{font-size:12px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:5px 13px;background:#fbf9f2;white-space:nowrap}
.vy-ctas{display:flex;gap:14px;margin-top:34px;align-items:center;flex-wrap:wrap;justify-content:center;animation:v-settle .6s 1.25s both}
.vy-pri{background:var(--teal);color:#fff;border:0;border-radius:13px;padding:15px 30px;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;animation:v-breathe 2.6s ease-in-out infinite;display:inline-flex;align-items:center;gap:9px}
.vy-ghost{background:transparent;border:0;color:var(--mut);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}
@media (max-width:680px){.vy-stats{grid-template-columns:1fr 1fr}}
`;

function ringSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '104'); svg.setAttribute('height', '104'); svg.setAttribute('viewBox', '0 0 104 104');
  const track = document.createElementNS(SVG_NS, 'circle');
  track.setAttribute('cx', '52'); track.setAttribute('cy', '52'); track.setAttribute('r', '46');
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', '#ece9db'); track.setAttribute('stroke-width', '7');
  const arc = document.createElementNS(SVG_NS, 'circle');
  arc.setAttribute('class', 'arc');
  arc.setAttribute('cx', '52'); arc.setAttribute('cy', '52'); arc.setAttribute('r', '46');
  arc.setAttribute('fill', 'none'); arc.setAttribute('stroke', 'oklch(58% .115 32)'); arc.setAttribute('stroke-width', '7');
  arc.setAttribute('stroke-linecap', 'round'); arc.setAttribute('stroke-dasharray', '289'); arc.setAttribute('stroke-dashoffset', '0');
  svg.append(track, arc);
  return svg;
}

function statCard(lb, valueNode, desc, gold, delay) {
  return h('div', { class: 'vy-st', style: `animation-delay:${delay}s` },
    h('div', { class: 'lb' }, lb),
    h('div', { class: 'n' + (gold ? ' gold' : '') }, valueNode),
    desc ? h('div', { class: 'd', html: desc }) : null);
}

export function renderSummaryV2(host, data, handlers = {}) {
  ensureV2Fonts();
  host.innerHTML = '';
  const isReview = data.mode === 'review' || data.mode === 'free';
  const mins = Math.max(1, Math.round((Number(data.durationSec) || 0) / 60));
  const tryN = Number(data.tryCount) || 0;
  const passN = Number(data.passCount) || 0;
  const total = Number(data.total) || 0;
  const avg = tryN > 0 ? (typeof data.pronAvg === 'number' ? data.pronAvg : Math.round((passN / tryN) * 80 + 20)) : null;
  const isRecord = Number.isFinite(data.prevUtter) && tryN > data.prevUtter;

  const title = isReview ? '복습 완료!' : '오늘 신규 학습 완료!';
  const sub = [data.sceneTitle, isReview ? `복습 ${total || passN}문장` : `표현 ${data.newCount}개`, `${mins}분`].filter(Boolean).join(' · ');

  const banner = tryN > 0 ? h('div', { class: 'vy-banner' }, vIcon(VI.ZAP, { size: 13, fill: true }),
    isRecord ? `오늘 발화 ${tryN}회 — 직전 세션 기록(${data.prevUtter}회) 갱신!` : `오늘 발화 ${tryN}회`) : null;

  // 스탯 4종 — 가용 데이터 매핑
  const stats = h('div', { class: 'vy-stats' });
  stats.append(
    statCard('발화', h('span', {}, String(tryN), h('em', {}, '회')), isRecord ? `<b>신기록</b> · 직전 ${data.prevUtter}회` : '', isRecord, 0.7),
    statCard('통과', h('span', {}, String(passN), h('em', {}, '회')),
      tryN > 0 ? `통과율 ${Math.round((passN / tryN) * 100)}%` : '', false, 0.8),
    statCard('발음 평균', avg != null ? h('span', {}, String(avg), h('em', {}, '점')) : h('span', {}, '—'), '', false, 0.9),
    isReview
      ? statCard('기억', h('span', { class: 'gold' }, String(data.judged?.got ?? 0)), '완벽 판정', true, 1)
      : statCard('새 표현', h('span', {}, String(data.newCount), h('em', {}, '개')), '오늘 익힘', false, 1),
  );

  const weak = Array.isArray(data.weakTop3) ? data.weakTop3.slice(0, 3) : [];
  const chips = weak.length ? h('div', { class: 'vy-chips' }, h('span', { class: 'lb' }, '다음에 신경 쓸 발음'),
    weak.map((w) => h('span', { class: 'vy-chip' }, w))) : null;

  const rt = data.returnTo || 'home';
  const goHome = handlers.onDone || (() => {
    try { sessionStorage.removeItem('studySummary'); sessionStorage.removeItem('studyReturnTo'); } catch { /* noop */ }
    if (rt === 'stats') window.location.hash = '#/stats';
    else if (rt === 'sentList') window.location.hash = '#/stats?tab=sent';
    else window.location.hash = '#/home';
  });
  const ctaPrimaryLabel = isReview ? '확인' : '복습으로 이어가기';
  const ctas = h('div', { class: 'vy-ctas' });
  if (isReview) {
    ctas.appendChild(h('button', { class: 'vy-pri', type: 'button', onClick: goHome }, rt === 'stats' ? '확인 · 캘린더로' : rt === 'sentList' ? '확인 · 문장 목록으로' : '확인'));
  } else {
    ctas.append(
      h('button', { class: 'vy-pri', type: 'button', onClick: () => { try { sessionStorage.removeItem('studySummary'); } catch { /* noop */ } window.location.hash = '#/session-review'; } }, vIcon(VI.REPEAT, { size: 14, sw: 2 }), '복습 이어서 하기'),
      h('button', { class: 'vy-ghost', type: 'button', onClick: goHome }, '홈으로'),
    );
  }

  const root = h('div', { class: 'vy' }, v2Style(VY_CSS),
    h('div', { class: 'vy-wrap' },
      h('div', { class: 'vy-ring' }, ringSvg(), h('span', { class: 'ck' }, vCheck({ size: 38, sw: 2.4 }))),
      h('h1', { class: 'vy-h1' }, title),
      h('div', { class: 'vy-sub' }, sub),
      banner,
      stats,
      chips,
      ctas,
    ),
  );
  host.appendChild(root);
  return { cleanup: () => { host.innerHTML = ''; } };
}

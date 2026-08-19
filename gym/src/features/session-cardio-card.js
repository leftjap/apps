/**
 * 유산소 카드 렌더 + 제스처 (확정 시안 7a / specs/2026-08-18-cardio-input-design.md).
 * 순수 로직은 session-cardio.js (네이티브 GymCore/CardioMetricWeek.swift 1:1 포팅).
 * 여기는 DOM 만 만진다. 햅틱 없음 (웹).
 */
import {
  CARDIO_METRICS, metricMeta, metricValue, formatMetric, steppedValue,
  cardioMetricWeek, lastCardioRun, cardioLayout,
  gestureTranslate, gestureCommit, DRAG_SLOP,
} from './session-cardio.js';

const TEAL = '#30807A';        // 기록 — 채움 + 흰 숫자
const TEAL_SOFT = '#9CC0BC';   // 참조 — 2.4px 테두리 + 같은 색 숫자

// 지표 선택은 카드 로컬 상태 — 저장하지 않는다. 진입 시 항상 시간 (§9).
let activeMetric = 'duration';
let dragDX = 0;
// 최신 렌더 인자 — 제스처 클로저가 첫 렌더 상태를 붙들면 증감 기준값이 낡아 두 칸씩 뛴다
// (실측 2026-08-18: +1분 뒤 -1분 이 1980 → 1860). 렌더가 매번 갱신한다.
let latest = null;
let flashMetric = null;
let flashTimer = null;

export function resetCardioMetric() { activeMetric = 'duration'; dragDX = 0; }
export function currentCardioMetric() { return activeMetric; }

const px = (n) => `${n}px`;

function dayCircleHtml(d, dia) {
  const bg = d.style === 'filled' ? TEAL : 'transparent';
  const ring = d.style === 'filled' ? 'none'
    : d.style === 'todayRef' ? `inset 0 0 0 2.4px ${TEAL_SOFT}`
    : d.style === 'ring' ? 'inset 0 0 0 1.5px var(--line)'
    : 'inset 0 0 0 1.5px var(--line-soft)';
  const numColor = d.style === 'filled' ? '#fff'
    : d.style === 'todayRef' ? TEAL_SOFT
    : d.style === 'ring' ? 'var(--ink-4)' : 'transparent';
  const dayColor = d.isToday ? TEAL
    : d.style === 'filled' ? 'var(--ink-3)'
    : d.style === 'ringFaint' ? 'oklch(82% 0.006 60)' : 'oklch(78% 0.006 60)';
  const dayWeight = d.isToday ? 700 : d.style === 'filled' ? 600 : 500;
  return `<div style="display:flex;flex-direction:column;align-items:center;gap:7px;">
    <div style="width:${px(dia)};height:${px(dia)};border-radius:50%;display:flex;align-items:center;justify-content:center;background:${bg};box-shadow:${ring};">
      <span class="mono" style="font-variant-numeric:tabular-nums;font-size:13.5px;font-weight:600;letter-spacing:-0.03em;color:${numColor};">${d.text ?? ''}</span>
    </div>
    <span class="kr" style="font-size:11.5px;font-weight:${dayWeight};color:${dayColor};">${d.label}</span>
  </div>`;
}

/** 입력값(잉크) > 직전 러닝 고스트(ink4) > 0 — 오늘 원의 참조값과 같은 원천 (§8-2). */
function displayValue(m, set, prev) {
  const v = metricValue(m, set);
  if (v != null) return { text: formatMetric(m, v), color: 'var(--ink-1)', ghost: false };
  const r = prev ? metricValue(m, prev) : null;
  if (r != null) return { text: formatMetric(m, r), color: 'var(--ink-4)', ghost: true };
  return { text: formatMetric(m, 0), color: 'var(--ink-4)', ghost: true };
}

/**
 * 카드 전체 렌더. sessions=완료 이력, set=현재 세트, todaySets=진행 중 블록 세트들.
 */
export function renderCardioCard(doc, { sessions, set, todaySets, exerciseId, now = Date.now() }) {
  const card = doc.getElementById('cardioCard');
  if (!card) return null;
  latest = { sessions, set, todaySets, exerciseId, now };
  const L = cardioLayout(card.clientWidth || 375);
  const W = L.contentWidth;
  const prev = lastCardioRun(sessions, exerciseId);
  const wk = cardioMetricWeek({ sessions, todaySets, exerciseId, metric: activeMetric, now });

  const weekEl = doc.getElementById('cardioWeek');
  if (weekEl) weekEl.innerHTML = wk.days.map((d) => dayCircleHtml(d, L.circleDiameter)).join('');
  const sumEl = doc.getElementById('cardioSum');
  if (sumEl) sumEl.textContent = wk.total;
  const sumUnitEl = doc.getElementById('cardioSumUnit');
  if (sumUnitEl) sumUnitEl.textContent = wk.unit;
  const daysEl = doc.getElementById('cardioDays');
  if (daysEl) daysEl.textContent = String(wk.dayCount);

  // 히어로 트랙 — 셀 폭 = W, 오프셋 = −index×W + 드래그 (§6-1)
  const idx = CARDIO_METRICS.indexOf(activeMetric);
  const near = Math.min(1, Math.abs(dragDX) / 160);
  const incoming = dragDX === 0 ? -1 : idx + (dragDX < 0 ? 1 : -1);
  const track = doc.getElementById('cardioTrack');
  if (track) {
    track.style.left = px(L.trackOffset(idx) + dragDX);
    track.innerHTML = CARDIO_METRICS.map((m, i) => {
      const d = displayValue(m, set, prev);
      const op = i === idx ? 1 - 0.45 * near : (i === incoming ? 0.2 + 0.8 * near : 0.2);
      const meta = metricMeta(m);
      return `<div style="width:${px(W)};flex-shrink:0;display:flex;flex-direction:column;align-items:center;opacity:${op};">
        <span class="kr" style="font-size:12px;font-weight:600;letter-spacing:1.2px;color:oklch(70% 0.006 60);">${meta.label}</span>
        <span data-cardio-hero="${m}" style="margin-top:12px;display:flex;align-items:baseline;gap:6px;pointer-events:${i === idx ? 'auto' : 'none'};cursor:pointer;opacity:${flashMetric === m ? 0.45 : 1};">
          <span class="mono" style="font-variant-numeric:tabular-nums;font-size:100px;font-weight:300;letter-spacing:-0.05em;line-height:1;color:${d.color};">${d.text}</span>
          <span class="kr" style="font-size:15px;font-weight:500;color:oklch(74% 0.006 60);">${meta.unit}</span>
        </span>
      </div>`;
    }).join('');
  }

  const dots = doc.getElementById('cardioDots');
  if (dots) {
    dots.innerHTML = CARDIO_METRICS.map((m, i) =>
      `<span style="width:${i === idx ? 18 : 6}px;height:6px;border-radius:3px;background:${i === idx ? 'var(--crail-base)' : 'oklch(90% 0.006 60)'};"></span>`).join('');
  }

  const others = doc.getElementById('cardioOthers');
  if (others) {
    others.innerHTML = CARDIO_METRICS.filter((m) => m !== activeMetric).map((m) => {
      const d = displayValue(m, set, prev);
      const meta = metricMeta(m);
      return `<div data-cardio-pick="${m}" style="display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;">
        <span class="kr" style="font-size:11px;font-weight:600;letter-spacing:1px;color:oklch(74% 0.006 60);">${meta.label}</span>
        <span style="display:flex;align-items:baseline;gap:3px;">
          <span class="mono" style="font-variant-numeric:tabular-nums;font-size:28px;font-weight:300;letter-spacing:-0.04em;line-height:1;color:${d.color};">${d.text}</span>
          <span class="kr" style="font-size:10.5px;font-weight:500;color:oklch(78% 0.006 60);">${meta.unit}</span>
        </span>
      </div>`;
    }).join('');
  }

  const dec = doc.getElementById('cardioDec');
  const inc = doc.getElementById('cardioInc');
  if (dec) dec.style.width = px(L.tapZone);
  if (inc) inc.style.width = px(L.tapZone);
  return { layout: L, week: wk, prev };
}

/**
 * 제스처 배선 (1회). 스와이프=지표 로테이션, 좌/우 빈 공간 탭=증감, 숫자 탭=키패드, 요약 탭=전환.
 * onRerender / onKeypad / onSetValue 는 호출부(session.js)가 준다.
 */
export function wireCardioCard(doc, { onKeypad, onSetValue }) {
  const g = doc.getElementById('cardioGesture');
  if (!g || g.dataset.hooked === '1') return;
  // 제스처는 **항상 최신 인자로** 다시 그린다. 첫 렌더의 인자를 클로저에 붙들면
  // 그 뒤 mountSessionView 가 새로 그려놓은 화면을 낡은 값으로 덮어쓴다
  // (실측 2026-08-18: 증감이 한 스텝씩 밀려 보이고 기준값도 안 따라옴).
  const onRerender = () => { if (latest) renderCardioCard(doc, latest); };

  let x0 = null;
  let moved = false;
  const cardWidth = () => (doc.getElementById('cardioCard')?.clientWidth || 375);

  g.addEventListener('pointerdown', (e) => { x0 = e.clientX; moved = false; dragDX = 0; });
  g.addEventListener('pointermove', (e) => {
    if (x0 == null) return;
    const raw = e.clientX - x0;
    if (Math.abs(raw) > DRAG_SLOP) moved = true;
    dragDX = gestureTranslate(raw, activeMetric);
    onRerender();
  });
  const end = () => {
    if (x0 == null) return;
    const threshold = cardioLayout(cardWidth()).swipeThreshold;
    const before = activeMetric;
    activeMetric = gestureCommit(dragDX, activeMetric, threshold);
    const wasDrag = dragDX !== 0 || moved;
    x0 = null; dragDX = 0;
    // 움직임이 없던 pointerup(=탭)에서는 재렌더하지 않는다.
    // 재렌더가 트랙·요약 노드를 통째로 갈아 끼우면, 뒤따라 오는 click 이 이미 떨어져 나간
    // 노드에서 발생해 위임 핸들러(요약 탭 전환·숫자 탭 키패드)에 영영 도달하지 못한다.
    if (wasDrag || activeMetric !== before) onRerender();
  };
  g.addEventListener('pointerup', end);
  g.addEventListener('pointercancel', () => { x0 = null; dragDX = 0; moved = false; onRerender(); });

  const step = (dir) => {
    if (moved) return;                      // 드래그였으면 증감 안 함 (§4 8px 분기)
    if (!latest) return;
    const prev = lastCardioRun(latest.sessions, latest.exerciseId);
    const base = metricValue(activeMetric, latest.set)
      ?? (prev ? metricValue(activeMetric, prev) : null) ?? 0;
    flashMetric = activeMetric;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashMetric = null; onRerender(); }, 150);
    onSetValue(activeMetric, steppedValue(activeMetric, base, dir));
  };
  doc.getElementById('cardioDec')?.addEventListener('click', () => step(-1));
  doc.getElementById('cardioInc')?.addEventListener('click', () => step(1));

  g.addEventListener('click', (e) => {
    if (moved) return;
    const hero = e.target.closest?.('[data-cardio-hero]');
    if (hero) { onKeypad(hero.getAttribute('data-cardio-hero')); return; }
    const pick = e.target.closest?.('[data-cardio-pick]');
    if (pick) { activeMetric = pick.getAttribute('data-cardio-pick'); onRerender(); }
  });

  g.dataset.hooked = '1';
}

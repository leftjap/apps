/* SessionLayout — phone / tablet / desktop 3 사이즈 분기 골격
 * 정본: ~/Downloads/_ _ _/variants/session-new-v2-tried-passed.jsx + session-review-v2-tried-passed.jsx
 *
 * 사용:
 *   const layout = createSessionLayout({ size, kind, step, total, tried, passed, recording, time, onHome, onEnd });
 *   layout.contentSlot.append(...본문 노드);
 *   layout.update({ tried, passed, recording, step });
 *
 * size = 'phone' | 'tablet' | 'desktop' (호출자 책임 — pickSize() 헬퍼 제공)
 * kind = 'new' | 'review' (라벨/색상 분기)
 */

const KIND = {
  new:    { label: 'NEW',    color: 'var(--accent)' },
  review: { label: 'REVIEW', color: 'var(--sage)' },
};

const SVG = 'http://www.w3.org/2000/svg';
function svgPath(viewBox, d, opts = {}) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('fill', opts.fill || 'none');
  s.setAttribute('stroke', opts.stroke || 'currentColor');
  s.setAttribute('stroke-width', opts.strokeWidth || '2');
  s.setAttribute('aria-hidden', 'true');
  if (opts.width) s.setAttribute('width', opts.width);
  if (opts.height) s.setAttribute('height', opts.height);
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', d);
  s.appendChild(p);
  return s;
}

export function pickSize() {
  if (typeof window === 'undefined') return 'phone';
  const w = window.innerWidth;
  if (w >= 1024) return 'desktop';
  if (w >= 600) return 'tablet';
  return 'phone';
}

/* matchMedia 단일 렌더 + size 변경 시 콜백. 호출자가 re-mount.
 * debounce 150ms (HANDOFF plan 반응형 §) */
export function watchSize(onChange) {
  if (typeof window === 'undefined') return () => {};
  let t;
  const handler = () => {
    clearTimeout(t);
    t = setTimeout(() => onChange(pickSize()), 150);
  };
  window.addEventListener('resize', handler);
  return () => { clearTimeout(t); window.removeEventListener('resize', handler); };
}

export function createSessionLayout(opts = {}) {
  const {
    size = 'phone',
    kind = 'new',
    step = 1,
    total = 3,
    tried = 0,
    passed = 0,
    recording = false,
    time = '00:00',
    onHome,
    onEnd,
  } = opts;

  const root = document.createElement('div');
  root.className = 'phone-shell study-app session-layout';
  root.dataset.size = size;
  root.dataset.kind = kind;

  const contentSlot = document.createElement('div');
  contentSlot.className = 'session-content';

  const refs = {}; // update 가 만지는 노드 참조

  if (size === 'desktop') buildDesktop(root, refs, { kind, step, total, tried, passed, recording, time, onHome, onEnd, contentSlot });
  else if (size === 'tablet') buildTablet(root, refs, { kind, step, total, tried, passed, recording, time, onHome, onEnd, contentSlot });
  else buildPhone(root, refs, { kind, step, total, tried, passed, recording, time, onHome, onEnd, contentSlot });

  return {
    el: root,
    contentSlot,
    update(state = {}) {
      if ('tried' in state && refs.tried) {
        refs.tried.forEach((n) => { n.textContent = String(state.tried); });
      }
      if ('passed' in state && refs.passed) {
        refs.passed.forEach((n) => { n.textContent = String(state.passed); });
      }
      if ('recording' in state && refs.tried) {
        const color = state.recording ? 'var(--accent)' : 'var(--text-strong)';
        refs.tried.forEach((n) => { n.style.color = color; });
      }
      if ('step' in state && refs.progress) {
        refs.progress.forEach((p, i) => {
          p.style.background = i === state.step - 1 ? 'var(--accent)' : 'var(--line)';
        });
      }
      if ('time' in state && refs.time) {
        refs.time.forEach((n) => { n.textContent = state.time; });
      }
    },
  };
}

/* ────────── PHONE ────────── */
function buildPhone(root, refs, { kind, step, total, tried, passed, recording, time, onHome, onEnd, contentSlot }) {
  const k = KIND[kind];

  // status-bar
  const sb = document.createElement('div');
  sb.className = 'status-bar';
  sb.innerHTML = `<span>9:41</span><span class="status-icons">●●●●  ◐  ▮▮</span>`;
  root.appendChild(sb);

  // header
  const header = document.createElement('header');
  header.style.cssText = 'padding:8px 24px 0;';

  const headRow = document.createElement('div');
  headRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const homeBtn = makeIconLabelBtn('홈', 'M15 18l-6-6 6-6', { color: 'var(--text-muted)', fontSize: 13, padding: '8px', marginLeft: '-8px' });
  if (onHome) homeBtn.addEventListener('click', onHome);

  const timerEl = document.createElement('div');
  timerEl.className = 'poppins';
  timerEl.style.cssText = 'font-size:18px;font-weight:500;color:var(--text-muted);font-variant-numeric:tabular-nums;';
  timerEl.textContent = time;

  const endBtn = document.createElement('button');
  endBtn.type = 'button';
  endBtn.style.cssText = 'background:none;border:none;color:var(--text-muted);font-size:12px;padding:8px;margin-right:-8px;cursor:pointer;font-family:var(--font-body);';
  endBtn.textContent = '종료';
  if (onEnd) endBtn.addEventListener('click', onEnd);

  headRow.append(homeBtn, timerEl, endBtn);
  header.appendChild(headRow);

  // progress dots
  const prog = makeProgress(total, step, 2, 4);
  prog.row.style.marginTop = '12px';
  header.appendChild(prog.row);

  // NEW/REVIEW 1/N + Tried/Passed 인라인
  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;font-size:11px;font-family:var(--font-display);text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap;';

  const cat = document.createElement('span');
  cat.style.cssText = `color:${k.color};font-weight:600;`;
  cat.textContent = `${k.label} ${step}/${total}`;

  const stats = document.createElement('span');
  stats.style.cssText = 'display:inline-flex;align-items:baseline;gap:10px;color:var(--text-muted);';
  const triedEl = makeInlineStat('Tried', tried, recording, false);
  const passedEl = makeInlineStat('Passed', passed, false, true);
  stats.append(triedEl.wrap, passedEl.wrap);

  meta.append(cat, stats);
  header.appendChild(meta);

  root.appendChild(header);

  // main content
  const main = document.createElement('main');
  const mainPt = kind === 'new' ? 56 : 44;
  main.style.cssText = `padding:${mainPt}px 24px 0;flex:1;`;
  main.appendChild(contentSlot);
  root.appendChild(main);

  refs.tried = [triedEl.num];
  refs.passed = [passedEl.num];
  refs.progress = prog.dots;
  refs.time = [timerEl];
  refs.cat = [cat];
}

/* ────────── TABLET ────────── */
function buildTablet(root, refs, { kind, step, total, tried, passed, recording, time, onHome, onEnd, contentSlot }) {
  const k = KIND[kind];
  root.style.cssText = 'display:flex;flex-direction:column;padding:0 56px;';

  const header = document.createElement('header');
  header.style.cssText = 'padding-top:36px;padding-bottom:8px;';

  const headRow = document.createElement('div');
  headRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';

  const homeBtn = makeIconLabelBtn('홈', 'M15 18l-6-6 6-6', { color: 'var(--text-muted)', fontSize: 14, iconSize: 16 });
  if (onHome) homeBtn.addEventListener('click', onHome);

  const timerEl = document.createElement('div');
  timerEl.className = 'poppins';
  timerEl.style.cssText = 'font-size:20px;font-weight:500;color:var(--text-muted);font-variant-numeric:tabular-nums;';
  timerEl.textContent = time;

  const endBtn = document.createElement('button');
  endBtn.type = 'button';
  endBtn.style.cssText = 'background:none;border:none;color:var(--text-muted);font-size:13px;padding:0;cursor:pointer;font-family:var(--font-body);';
  endBtn.textContent = '종료';
  if (onEnd) endBtn.addEventListener('click', onEnd);

  headRow.append(homeBtn, timerEl, endBtn);
  header.appendChild(headRow);

  const prog = makeProgress(total, step, 3, 6);
  prog.row.style.marginTop = '24px';
  header.appendChild(prog.row);

  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-top:18px;gap:16px;';

  const cat = document.createElement('span');
  cat.style.cssText = `font-size:12px;color:${k.color};font-family:var(--font-display);text-transform:uppercase;letter-spacing:0.12em;font-weight:600;white-space:nowrap;`;
  cat.textContent = `${k.label} · ${step}/${total}`;

  const stats = document.createElement('span');
  stats.style.cssText = 'display:inline-flex;align-items:baseline;gap:18px;white-space:nowrap;';
  const triedEl = makeTabletStat('Tried', tried, recording, false);
  const passedEl = makeTabletStat('Passed', passed, false, true);
  stats.append(triedEl.wrap, passedEl.wrap);

  meta.append(cat, stats);
  header.appendChild(meta);
  root.appendChild(header);

  const main = document.createElement('main');
  const mainPt = kind === 'new' ? 88 : 64;
  main.style.cssText = `padding-top:${mainPt}px;flex:1;`;
  main.appendChild(contentSlot);
  root.appendChild(main);

  refs.tried = [triedEl.num];
  refs.passed = [passedEl.num];
  refs.progress = prog.dots;
  refs.time = [timerEl];
  refs.cat = [cat];
}

/* ────────── DESKTOP ────────── */
function buildDesktop(root, refs, { kind, step, total, tried, passed, recording, time, onHome, onEnd, contentSlot }) {
  const k = KIND[kind];
  root.style.cssText = 'display:grid;grid-template-columns:320px 1fr;min-height:100vh;min-height:100dvh;';

  const aside = document.createElement('aside');
  aside.style.cssText = 'padding:40px 36px;display:flex;flex-direction:column;gap:36px;background:rgba(0,0,0,0.015);';

  // 홈으로
  const homeBtn = document.createElement('button');
  homeBtn.type = 'button';
  homeBtn.style.cssText = 'background:none;border:none;display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:13px;padding:0;cursor:pointer;font-family:var(--font-body);align-self:flex-start;';
  homeBtn.appendChild(svgPath('0 0 24 24', 'M15 18l-6-6 6-6', { strokeWidth: 2, width: 14, height: 14 }));
  const homeLabel = document.createElement('span');
  homeLabel.textContent = '홈으로';
  homeBtn.appendChild(homeLabel);
  if (onHome) homeBtn.addEventListener('click', onHome);
  aside.appendChild(homeBtn);

  // NEW/REVIEW + 1/N hero
  const heroBlock = document.createElement('div');
  const cat = document.createElement('div');
  cat.style.cssText = `font-size:11px;color:${k.color};text-transform:uppercase;letter-spacing:0.14em;font-family:var(--font-display);font-weight:600;`;
  cat.textContent = k.label;
  const stepHero = document.createElement('div');
  stepHero.className = 'poppins';
  stepHero.style.cssText = 'font-size:56px;font-weight:700;color:var(--text-strong);letter-spacing:-0.04em;margin-top:8px;line-height:1;font-variant-numeric:tabular-nums;';
  stepHero.innerHTML = `${step}<span style="color:var(--text-faint);font-weight:400;">/${total}</span>`;
  const prog = makeProgress(total, step, 3, 6);
  prog.row.style.marginTop = '18px';
  heroBlock.append(cat, stepHero, prog.row);
  aside.appendChild(heroBlock);

  // Stats — Tried / Passed (40px hero)
  const statsBlock = document.createElement('div');
  statsBlock.style.cssText = 'display:flex;flex-direction:column;gap:20px;';
  const triedEl = makeDesktopStat('Tried', tried, recording, false);
  const passedEl = makeDesktopStat('Passed', passed, false, true);
  statsBlock.append(triedEl.wrap, passedEl.wrap);
  aside.appendChild(statsBlock);

  // 하단: 타이머 / 세션 종료
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:auto;display:flex;justify-content:space-between;align-items:center;';
  const timerEl = document.createElement('span');
  timerEl.className = 'poppins';
  timerEl.style.cssText = 'font-size:14px;color:var(--text-muted);font-variant-numeric:tabular-nums;';
  timerEl.textContent = time;
  const endBtn = document.createElement('button');
  endBtn.type = 'button';
  endBtn.style.cssText = 'background:none;border:none;color:var(--text-muted);font-size:12px;padding:0;cursor:pointer;font-family:var(--font-body);';
  endBtn.textContent = '세션 종료';
  if (onEnd) endBtn.addEventListener('click', onEnd);
  footer.append(timerEl, endBtn);
  aside.appendChild(footer);

  root.appendChild(aside);

  const main = document.createElement('main');
  const mainPad = kind === 'new' ? '80px 80px' : '64px 80px 48px';
  const mainMax = kind === 'new' ? 880 : 920;
  main.style.cssText = `padding:${mainPad};display:flex;flex-direction:column;max-width:${mainMax}px;`;
  main.appendChild(contentSlot);
  root.appendChild(main);

  refs.tried = [triedEl.num];
  refs.passed = [passedEl.num];
  refs.progress = prog.dots;
  refs.time = [timerEl];
  refs.cat = [cat];
  refs.stepHero = [stepHero];
}

/* ────────── helpers ────────── */
function makeProgress(total, step, height, gap) {
  const row = document.createElement('div');
  row.style.cssText = `display:flex;gap:${gap}px;`;
  row.setAttribute('role', 'progressbar');
  row.setAttribute('aria-valuenow', String(step));
  row.setAttribute('aria-valuemin', '1');
  row.setAttribute('aria-valuemax', String(total));
  const dots = [];
  for (let i = 1; i <= total; i++) {
    const d = document.createElement('div');
    d.style.cssText = `flex:1;height:${height}px;background:${i === step ? 'var(--accent)' : 'var(--line)'};border-radius:2px;`;
    row.appendChild(d);
    dots.push(d);
  }
  return { row, dots };
}

function makeIconLabelBtn(label, pathD, opts = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  const padding = opts.padding || '0';
  const marginLeft = opts.marginLeft || '0';
  b.style.cssText = `background:none;border:none;display:flex;align-items:center;gap:${opts.gap || 4}px;color:${opts.color || 'var(--text-muted)'};font-size:${opts.fontSize || 13}px;padding:${padding};margin-left:${marginLeft};cursor:pointer;font-family:var(--font-body);`;
  const iconSize = opts.iconSize || 14;
  b.appendChild(svgPath('0 0 24 24', pathD, { strokeWidth: 2, width: iconSize, height: iconSize }));
  const span = document.createElement('span');
  span.textContent = label;
  b.appendChild(span);
  return b;
}

function makeInlineStat(label, value, recording, isPassed) {
  const wrap = document.createElement('span');
  wrap.style.cssText = 'display:inline-flex;align-items:baseline;gap:4px;';
  wrap.setAttribute('aria-label', `${label} ${value}`);
  const lab = document.createElement('span');
  lab.textContent = label;
  const num = document.createElement('span');
  num.className = 'poppins';
  const color = isPassed ? 'var(--sage)' : (recording ? 'var(--accent)' : 'var(--text-strong)');
  num.style.cssText = `font-size:16px;color:${color};font-weight:700;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;`;
  num.textContent = String(value);
  wrap.append(lab, num);
  return { wrap, num };
}

function makeTabletStat(label, value, recording, isPassed) {
  const wrap = document.createElement('span');
  wrap.style.cssText = 'display:inline-flex;align-items:baseline;gap:6px;';
  wrap.setAttribute('aria-label', `${label} ${value}`);
  const lab = document.createElement('span');
  lab.style.cssText = 'font-size:10px;color:var(--text-faint);font-family:var(--font-display);text-transform:uppercase;letter-spacing:0.12em;font-weight:600;';
  lab.textContent = label;
  const num = document.createElement('span');
  num.className = 'poppins';
  const color = isPassed ? 'var(--sage)' : (recording ? 'var(--accent)' : 'var(--text-strong)');
  num.style.cssText = `font-size:18px;font-weight:700;color:${color};letter-spacing:-0.02em;font-variant-numeric:tabular-nums;`;
  num.textContent = String(value);
  wrap.append(lab, num);
  return { wrap, num };
}

function makeDesktopStat(label, value, recording, isPassed) {
  const wrap = document.createElement('div');
  wrap.setAttribute('aria-label', `${label} Today ${value}`);
  const lab = document.createElement('div');
  lab.style.cssText = 'font-size:10px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.14em;font-family:var(--font-display);font-weight:600;';
  lab.textContent = label;
  const num = document.createElement('div');
  num.className = 'poppins';
  const color = isPassed ? 'var(--sage)' : (recording ? 'var(--accent)' : 'var(--text-strong)');
  num.style.cssText = `font-size:40px;font-weight:700;color:${color};letter-spacing:-0.03em;line-height:1;font-variant-numeric:tabular-nums;margin-top:4px;`;
  num.textContent = String(value);
  wrap.append(lab, num);
  return { wrap, num };
}

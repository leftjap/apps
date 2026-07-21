/* Session atoms — RecordButton · ListenButton · Waveform · ScorePill · JudgeRow
 * 정본: ~/Downloads/_ _ _/variants/session-new-v2-tried-passed.jsx (L9-37)
 *      ~/Downloads/_ _ _/variants/session-review-v2-tried-passed.jsx (L36-54)
 *
 * update(state) 규약 (모든 컴포넌트 공통):
 * - el 재생성 금지 (createElement 1회)
 * - setAttribute / classList / textContent / style.setProperty 만 변경
 * - innerHTML 부분 갱신 금지
 * - variant = data-attr → CSS selector 분기
 * - idempotent
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(viewBox, paths, opts = {}) {
  const el = document.createElementNS(SVG_NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  if (opts.fill) el.setAttribute('fill', opts.fill);
  if (opts.stroke) el.setAttribute('stroke', opts.stroke);
  if (opts.strokeWidth) el.setAttribute('stroke-width', opts.strokeWidth);
  if (opts.aria) el.setAttribute('aria-hidden', 'true');
  paths.forEach((d) => {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    el.appendChild(p);
  });
  return el;
}

/* ────── RecordButton ────── */
export function createRecordButton({ recording = false, onToggle, large = false } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'record-btn';
  btn.dataset.recording = String(recording);
  if (large) btn.dataset.large = 'true';
  btn.setAttribute('aria-pressed', String(recording));

  const icon = svg('0 0 24 24', ['M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3zM5 12a7 7 0 0014 0M12 19v3'], {
    fill: 'none', stroke: 'currentColor', strokeWidth: 2, aria: true,
  });
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = recording ? '녹음 중...' : '따라 말하기';
  const ring = document.createElement('span');
  ring.className = 'pulse-ring';

  btn.append(icon, label, ring);
  if (onToggle) btn.addEventListener('click', onToggle);

  return {
    el: btn,
    update({ recording: rec }) {
      const next = String(!!rec);
      if (btn.dataset.recording !== next) {
        btn.dataset.recording = next;
        btn.setAttribute('aria-pressed', next);
        label.textContent = rec ? '녹음 중...' : '따라 말하기';
      }
    },
  };
}

/* ────── ListenButton ────── */
export function createListenButton({ onPlay, large = false, playing = false } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'listen-btn';
  if (large) btn.dataset.large = 'true';
  btn.dataset.playing = String(playing);
  btn.setAttribute('aria-label', '듣기');
  btn.setAttribute('aria-pressed', String(playing));

  const icon = svg('0 0 24 24', ['M8 5v14l11-7z'], { fill: 'currentColor', aria: true });
  const label = document.createElement('span');
  label.textContent = playing ? '재생 중' : '듣기';

  btn.append(icon, label);
  if (onPlay) btn.addEventListener('click', onPlay);

  return {
    el: btn,
    update({ playing: p }) {
      const next = String(!!p);
      if (btn.dataset.playing !== next) {
        btn.dataset.playing = next;
        btn.setAttribute('aria-pressed', next);
        label.textContent = p ? '재생 중' : '듣기';
      }
    },
  };
}

/* ────── Waveform ────── */
export function createWaveform({ large = false, mode = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'waveform';
  if (large) wrap.dataset.large = 'true';
  // mode: null (숨김) | 'record' (녹음 — danger 색) | 'listen' (재생 — accent 색)
  if (mode) wrap.dataset.mode = mode;
  wrap.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i++) {
    const bar = document.createElement('span');
    bar.className = 'bar';
    wrap.appendChild(bar);
  }
  return {
    el: wrap,
    update({ mode: m }) {
      if (m == null) {
        wrap.removeAttribute('data-mode');
      } else if (wrap.dataset.mode !== m) {
        wrap.dataset.mode = m;
      }
    },
  };
}

/* ────── ScorePill ────── */
export function createScorePill({ score = 0, passed = false, large = false } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'score-pill';
  wrap.dataset.passed = String(passed);
  if (large) wrap.dataset.large = 'true';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');

  const scoreEl = document.createElement('span');
  scoreEl.className = 'score';
  scoreEl.textContent = String(score);
  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = passed ? 'Pass' : 'Try again';

  wrap.append(scoreEl, labelEl);

  return {
    el: wrap,
    update({ score: s, passed: p }) {
      const np = String(!!p);
      if (wrap.dataset.passed !== np) {
        wrap.dataset.passed = np;
        labelEl.textContent = p ? 'Pass' : 'Try again';
      }
      const ns = String(s);
      if (scoreEl.textContent !== ns) scoreEl.textContent = ns;
    },
  };
}

/* ────── JudgeRow (복습 전용) ────── */
export function createJudgeRow({ size = 'phone', onJudge } = {}) {
  const row = document.createElement('div');
  row.className = 'judge-row';
  row.dataset.size = size;
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', '판정');

  /* 2026-07-22 사용자 지시 — 라벨을 쉬움/보통/어려움으로 통일하고 그 순서로 배치
   * (문장 모아보기의 난이도 칩과 같은 표기·순서). 옛 'No/Hmm/Got it + 다시/애매/완료' 폐기.
   * kind 값(got/hmm/no)은 SRS 계약(nextSrsState·applySrsUpdate)이라 그대로 둔다. */
  const buttons = [
    { kind: 'got', label: '쉬움' },
    { kind: 'hmm', label: '보통' },
    { kind: 'no',  label: '어려움' },
  ];

  buttons.forEach(({ kind, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'judge-btn';
    b.dataset.kind = kind;
    b.setAttribute('aria-label', label);
    const enEl = document.createElement('span');
    enEl.className = 'en';
    enEl.textContent = label;
    b.append(enEl); // 부제(.ko)는 영문 표기 전용이었으므로 제거
    if (onJudge) b.addEventListener('click', () => onJudge(kind));
    row.appendChild(b);
  });

  return { el: row };
}

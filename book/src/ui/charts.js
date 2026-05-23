/**
 * 차트 — v14 design-ref 이식 (바닐라).
 *  - wordCloud({ words, W, H, scale, onWord }): 아르키메데스 나선 패킹
 *      (design-ref/wordcloud.jsx packCloud :26-70, 사이징 :73-87 그대로).
 *  - barChart({ data, labels, height, highlightIndex }): 월별/주간 세로 막대
 *      (design-ref/details-v14.jsx 등장추이 :223-241 · 이 주 :415-431 · 옮긴흐름 :523-540).
 *      막대 높이는 % 대신 px 로 계산 (flex 컬럼 % 높이 불안정 회피).
 */
import { el } from './dom.js';

// 한글 글리프 advance 근사 (Pretendard) — wordcloud.jsx:19-24
function bboxOf(text, fontSize) {
  const charW = fontSize * 0.95;
  return [text.length * charW + 4, fontSize * 1.02 + 2];
}

// 아르키메데스 나선 패킹 — wordcloud.jsx:26-70 (글자 charCode 시드로 안정적 레이아웃)
function packCloud(W, H, items) {
  const placed = [];
  const cx = W / 2;
  const cy = H / 2;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const [bw, bh] = bboxOf(it.text, it.fontSize);
    if (i === 0) {
      placed.push({ ...it, x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh });
      continue;
    }
    let r = 0;
    let theta = (((it.text.charCodeAt(0) * 37) % 360) * Math.PI) / 180;
    const dr = 0.35;
    const dtheta = 0.13;
    for (let k = 0; k < 8000; k++) {
      const x = cx + Math.cos(theta) * r - bw / 2;
      const y = cy + Math.sin(theta) * r - bh / 2;
      if (x >= 2 && y >= 2 && x + bw <= W - 2 && y + bh <= H - 2) {
        let collides = false;
        for (let j = 0; j < placed.length; j++) {
          const p = placed[j];
          if (x < p.x + p.w && x + bw > p.x && y < p.y + p.h && y + bh > p.y) { collides = true; break; }
        }
        if (!collides) { placed.push({ ...it, x, y, w: bw, h: bh }); break; }
      }
      theta += dtheta;
      r += dr;
    }
  }
  return placed;
}

/**
 * 워드클라우드. words: [[text, count], ...] (count 내림차순 가정).
 * 빈 배열이면 빈 wrap 반환. onWord(text) 클릭 핸들러(옵션).
 */
export function wordCloud({ words = [], W = 600, H = 260, scale = 1, onWord } = {}) {
  const wrap = el('div', { style: { position: 'relative', width: W, height: H, margin: '0 auto', fontFamily: 'var(--sans)' } });
  if (!words.length) return wrap;
  const max = words[0][1];
  const min = words[words.length - 1][1];
  const items = words.map(([text, n]) => {
    const t = (n - min) / Math.max(1, max - min);
    const fontSize = Math.round((12 + Math.pow(t, 0.55) * 64) * scale);
    const weight = t > 0.85 ? 800 : t > 0.55 ? 700 : t > 0.25 ? 600 : 500;
    const opacity = 0.45 + t * 0.55;
    const color = t > 0.55 ? 'var(--ink-1)' : t > 0.25 ? 'var(--ink-2)' : t > 0.08 ? 'var(--ink-3)' : 'var(--ink-4)';
    const ls = t > 0.7 ? '-.035em' : t > 0.4 ? '-.028em' : '-.018em';
    return { text, count: n, fontSize, weight, opacity, color, ls };
  });
  for (const p of packCloud(W, H, items)) {
    wrap.appendChild(el('span', {
      onClick: onWord ? () => onWord(p.text) : undefined,
      style: { position: 'absolute', left: p.x, top: p.y, fontSize: p.fontSize, fontWeight: p.weight, color: p.color, opacity: p.opacity, letterSpacing: p.ls, lineHeight: 1, whiteSpace: 'nowrap', cursor: onWord ? 'pointer' : 'default' },
    }, p.text));
  }
  return wrap;
}

/**
 * 세로 막대그래프. data:[number], labels:[string](옵션, data 와 동일 길이).
 *  - height: 막대 최대 픽셀 높이. highlightIndex: 강조(warm) 인덱스.
 *  - 값 0 은 라벨 숨김 + 막대 흐리게.
 */
export function barChart({ data = [], labels = [], height = 120, highlightIndex = -1, gap = 8 } = {}) {
  const max = Math.max(1, ...data);
  const cols = data.map((v, i) => {
    const cur = i === highlightIndex;
    return el('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 5 } },
      el('span', { class: 'mono', style: { fontSize: 11, color: cur ? 'var(--ink-1)' : 'var(--ink-4)', fontWeight: cur ? 700 : 500, opacity: v === 0 ? 0.4 : 1 } }, v === 0 ? ' ' : String(v)),
      el('div', { style: { width: '100%', height: Math.round((v / max) * height), minHeight: 2, background: cur ? '#c2553a' : 'var(--ink-3)', opacity: v === 0 ? 0.18 : cur ? 1 : 0.55, borderRadius: '3px 3px 0 0' } }),
    );
  });
  const barsRow = el('div', { style: { display: 'flex', alignItems: 'flex-end', gap, padding: '4px 0' } }, ...cols);
  const labelRow = labels.length
    ? el('div', { style: { display: 'flex', gap, marginTop: 8 } }, ...labels.map((m) => el('span', { class: 'mono', style: { flex: 1, textAlign: 'center', fontSize: 10.5, color: 'var(--ink-4)' } }, m)))
    : null;
  return el('div', {}, barsRow, labelRow);
}

export default { wordCloud, barChart };

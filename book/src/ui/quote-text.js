/**
 * 어구 텍스트 — v14 design-ref/core.jsx 의 QuoteText 이식.
 * 곡선 따옴표(“ ”, Noto Serif). variant: inline(앞뒤 작은 따옴표) / flank(큰 따옴표 모서리) / plain.
 * text 는 textNode 로 자동 이스케이프.
 */
import { el } from './dom.js';

const SERIF = '"Noto Serif KR","Pretendard",serif';

export function quoteText({
  text, fontSize = 18, lineHeight = 1.7, weight = 500,
  variant = 'inline', serif = false, align = 'left', maxW, style,
} = {}) {
  const ff = serif ? SERIF : 'var(--sans)';
  const base = {
    fontSize, lineHeight, fontWeight: weight, letterSpacing: '-.012em',
    fontFamily: ff, color: 'var(--ink-1)', textAlign: align,
    ...(maxW ? { maxWidth: maxW } : {}),
    ...(style || {}),
  };

  if (variant === 'plain') return el('div', { style: base }, text);

  if (variant === 'flank') {
    const ms = Math.round(fontSize * 1.9);
    return el('div', { style: { ...base, position: 'relative', paddingTop: Math.round(ms * 0.25), paddingBottom: Math.round(ms * 0.4) } },
      el('span', { style: { position: 'absolute', left: -Math.round(ms * 0.05), top: -Math.round(ms * 0.2), fontSize: ms, fontFamily: SERIF, color: 'var(--ink-4)', lineHeight: 1, opacity: 0.5, fontWeight: 400 } }, '“'),
      el('span', { style: { position: 'relative', zIndex: 1 } }, text),
      el('span', { style: { position: 'absolute', right: -Math.round(ms * 0.05), bottom: -Math.round(ms * 0.55), fontSize: ms, fontFamily: SERIF, color: 'var(--ink-4)', lineHeight: 1, opacity: 0.5, fontWeight: 400 } }, '”'),
    );
  }

  // inline
  return el('div', { style: base },
    el('span', { style: { fontFamily: SERIF, color: 'var(--ink-4)', marginRight: '.1em' } }, '“'),
    text,
    el('span', { style: { fontFamily: SERIF, color: 'var(--ink-4)', marginLeft: '.04em' } }, '”'),
  );
}

export default { quoteText };

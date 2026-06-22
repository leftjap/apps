/**
 * 어구 마크다운 렌더 — 저장 텍스트의 원본 구조(문단·**볼드**·> 블록인용)를 표시.
 * 지원 부분집합: 빈 줄 = 문단 경계, 줄머리 `> ` = 블록인용, `**…**` = 볼드(인라인).
 *  - parseInline/parseQuoteBlocks/quotePreview/quoteSegments 는 순수 함수(테스트 대상).
 *  - 마크(형광펜) 오프셋은 "보이는 평문"(마커 제외, 블록 사이 구분자 없음) 기준 —
 *    library.js 의 TreeWalker 텍스트 오프셋과 동일 공간이라 0 마이그레이션으로 호환.
 */
import { el } from './dom.js';

/** `**볼드**` 만 인식 → [{text, bold}]. 미매칭 `**` 는 데이터 정리 단계에서 제거됨(여기선 리터럴). */
export function parseInline(s) {
  const runs = [];
  const re = /\*\*(.+?)\*\*/gs;
  let last = 0; let m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index), bold: false });
    if (m[1]) runs.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last), bold: false });
  return runs.length ? runs : [{ text: '', bold: false }];
}

/** 텍스트 → 블록 배열 [{type:'p'|'blockquote', runs:[{text,bold}]}]. */
export function parseQuoteBlocks(text) {
  const lines = String(text == null ? '' : text).split('\n');
  const blocks = [];
  let i = 0;
  const isBq = (l) => /^>\s?/.test(l.trim());
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === '') { i++; continue; }
    if (isBq(lines[i])) {
      const buf = [];
      while (i < lines.length && isBq(lines[i])) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      blocks.push({ type: 'blockquote', runs: parseInline(buf.join(' ')) });
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== '' && !isBq(lines[i])) { buf.push(lines[i].trim()); i++; }
      blocks.push({ type: 'p', runs: parseInline(buf.join(' ')) });
    }
  }
  return blocks.length ? blocks : [{ type: 'p', runs: [{ text: '', bold: false }] }];
}

/** 미리보기용 평문 — 마커 제거, 블록은 공백으로 연결. */
export function quotePreview(text) {
  return parseQuoteBlocks(text)
    .map((b) => b.runs.map((r) => r.text).join(''))
    .join(' ')
    .trim();
}

/** 마크 오프셋 공간과 동일한 평문(블록 구분자 없이 이음) — 선택 복사용. */
export function quotePlainText(text) {
  return parseQuoteBlocks(text).map((b) => b.runs.map((r) => r.text).join('')).join('');
}

/** 검색어/단어를 보이는 평문 오프셋의 마크([{s,e,c}])로 — 전체 매치(비겹침). */
export function keywordMarks(text, needle, color = 'y') {
  const n = (needle || '').trim();
  if (!n) return [];
  const plain = quotePlainText(text);
  const lc = plain.toLowerCase();
  const ln = n.toLowerCase();
  const marks = [];
  let i = 0;
  while ((i = lc.indexOf(ln, i)) >= 0) { marks.push({ s: i, e: i + n.length, c: color }); i += n.length; }
  return marks;
}

/**
 * 블록 + 전역 평문 오프셋 + 마크 색상 세그먼트.
 * marks: [{s,e,c}] — 보이는 평문(블록 텍스트를 구분자 없이 이은 것) 오프셋.
 * 반환 블록.runs: [{text, bold, color|null, s}] (s = 세그먼트 전역 시작 오프셋).
 */
export function quoteSegments(text, marks = []) {
  const blocks = parseQuoteBlocks(text);
  const sorted = [...marks].filter((m) => m && m.e > m.s).sort((a, b) => a.s - b.s);
  let off = 0;
  for (const b of blocks) {
    const out = [];
    for (const run of b.runs) {
      const start = off; const end = off + run.text.length;
      let cur = start;
      for (const m of sorted) {
        if (m.e <= cur || m.s >= end) continue;
        const ms = Math.max(cur, m.s); const me = Math.min(end, m.e);
        if (ms > cur) out.push({ text: run.text.slice(cur - start, ms - start), bold: run.bold, color: null, s: cur });
        out.push({ text: run.text.slice(ms - start, me - start), bold: run.bold, color: m.c, s: ms });
        cur = me;
      }
      if (cur < end) out.push({ text: run.text.slice(cur - start), bold: run.bold, color: null, s: cur });
      off = end;
    }
    b.runs = out.length ? out : [{ text: '', bold: false, color: null, s: off }];
  }
  return blocks;
}

const MARK_CLASS = { p: 'pink', g: 'green', b: 'blue' };

/**
 * 어구 본문 DOM(블록 배열) 생성. marks 없으면 순수 표시(thread 등).
 * opts.makeMark(seg) → 색칠 세그먼트를 <mark> 등으로 (library 가 클릭 핸들러 주입).
 */
export function renderQuoteBody(text, marks = [], opts = {}) {
  const { makeMark } = opts;
  return quoteSegments(text, marks).map((b) => {
    const tag = b.type === 'blockquote' ? 'blockquote' : 'p';
    const children = b.runs.map((seg) => {
      let node;
      if (seg.color) node = makeMark ? makeMark(seg) : el('mark', seg.color === 'y' ? {} : { class: MARK_CLASS[seg.color] }, seg.text);
      else node = seg.text;
      if (seg.bold) node = el('strong', {}, node);
      return node;
    });
    return el(tag, { class: b.type === 'blockquote' ? 'q-bq' : 'q-p' }, ...children);
  });
}

export default { parseInline, parseQuoteBlocks, quotePreview, quoteSegments, renderQuoteBody };

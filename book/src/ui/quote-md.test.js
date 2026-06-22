import { describe, it, expect } from 'vitest';
import { parseInline, parseQuoteBlocks, quotePreview, quoteSegments } from './quote-md.js';

describe('parseInline', () => {
  it('볼드 없으면 단일 plain run', () => {
    expect(parseInline('안녕 세상')).toEqual([{ text: '안녕 세상', bold: false }]);
  });
  it('**볼드** 를 분리', () => {
    expect(parseInline('앞 **강조** 뒤')).toEqual([
      { text: '앞 ', bold: false }, { text: '강조', bold: true }, { text: ' 뒤', bold: false },
    ]);
  });
  it('따옴표 포함 볼드', () => {
    expect(parseInline("**'원칙 없는 정치'**이 그것")).toEqual([
      { text: "'원칙 없는 정치'", bold: true }, { text: '이 그것', bold: false },
    ]);
  });
});

describe('parseQuoteBlocks', () => {
  it('빈 줄로 문단 분리', () => {
    const b = parseQuoteBlocks('첫 문단.\n\n둘째 문단.');
    expect(b.map((x) => x.type)).toEqual(['p', 'p']);
    expect(b[0].runs[0].text).toBe('첫 문단.');
    expect(b[1].runs[0].text).toBe('둘째 문단.');
  });
  it('> 블록인용 인식', () => {
    const b = parseQuoteBlocks('본문.\n\n> 인용한 말.\n\n다음.');
    expect(b.map((x) => x.type)).toEqual(['p', 'blockquote', 'p']);
    expect(b[1].runs[0].text).toBe('인용한 말.');
  });
  it('문단 내 볼드 보존', () => {
    const b = parseQuoteBlocks('이것은 **중요**하다.');
    expect(b[0].runs).toEqual([
      { text: '이것은 ', bold: false }, { text: '중요', bold: true }, { text: '하다.', bold: false },
    ]);
  });
});

describe('quotePreview', () => {
  it('마커 제거하고 블록을 공백으로 연결', () => {
    expect(quotePreview('첫 **볼드** 문단.\n\n> 인용.\n\n끝.')).toBe('첫 볼드 문단. 인용. 끝.');
  });
});

describe('quoteSegments — 마크 오프셋(보이는 평문 기준)', () => {
  it('마크 없으면 색상 null', () => {
    const blocks = quoteSegments('가나다\n\n라마바');
    const colors = blocks.flatMap((b) => b.runs.map((r) => r.color));
    expect(colors.every((c) => c === null)).toBe(true);
  });
  it('평문 오프셋은 블록을 구분자 없이 이은 공간 — 두 문단 가로지르는 마크', () => {
    // plain = "가나다라마바" (블록 사이 구분자 없음). 마크 [2,4) = "다라"
    const blocks = quoteSegments('가나다\n\n라마바', [{ s: 2, e: 4, c: 'y' }]);
    const colored = blocks.flatMap((b) => b.runs).filter((r) => r.color === 'y').map((r) => r.text).join('');
    expect(colored).toBe('다라');
  });
  it('볼드 run 위에 마크 — 분할되며 bold 유지', () => {
    // "AB**CD**EF" → plain "ABCDEF", 마크 [1,4)= "BCD"
    const blocks = quoteSegments('AB**CD**EF', [{ s: 1, e: 4, c: 'p' }]);
    const segs = blocks[0].runs;
    const colored = segs.filter((r) => r.color === 'p');
    expect(colored.map((r) => r.text).join('')).toBe('BCD');
    // 'CD' 세그먼트는 bold + color
    expect(segs.some((r) => r.text === 'CD' && r.bold && r.color === 'p')).toBe(true);
  });
});

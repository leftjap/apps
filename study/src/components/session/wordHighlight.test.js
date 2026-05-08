// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wrapWords, applyWordHighlight, classifyScore } from './wordHighlight.js';

describe('classifyScore', () => {
  it('score >= 70 → good (sage)', () => {
    expect(classifyScore(70).cls).toBe('good');
    expect(classifyScore(100).cls).toBe('good');
  });
  it('50 <= score < 70 → ok (amber)', () => {
    expect(classifyScore(50).cls).toBe('ok');
    expect(classifyScore(69).cls).toBe('ok');
  });
  it('score < 50 → bad (danger + wavy)', () => {
    expect(classifyScore(0).cls).toBe('bad');
    expect(classifyScore(49).cls).toBe('bad');
    expect(classifyScore(49).deco).toBe('underline wavy');
  });
  it('비정상 입력 → 빈 cls', () => {
    expect(classifyScore(NaN).cls).toBe('');
    expect(classifyScore(undefined).cls).toBe('');
  });
});

describe('wrapWords', () => {
  it('영문 문장 — 단어만 span 으로 감쌈', () => {
    const out = wrapWords('You got it.');
    expect(out).toContain('<span class="word"');
    // 단어 수 = 3 (You, got, it)
    expect(out.match(/<span class="word"/g).length).toBe(3);
    // 마침표는 span 밖
    expect(out).toMatch(/it<\/span>\./);
  });
  it('공백 보존', () => {
    const out = wrapWords('a b');
    expect(out).toMatch(/<span[^>]*>a<\/span> <span[^>]*>b<\/span>/);
  });
  it('빈 입력 → 빈 문자열', () => {
    expect(wrapWords('')).toBe('');
    expect(wrapWords(null)).toBe('');
  });
  it('일본어 구두점 분리', () => {
    const out = wrapWords('行く。');
    expect(out.match(/<span class="word"/g).length).toBe(1);
    expect(out).toMatch(/行く<\/span>。/);
  });
  it('HTML escape', () => {
    const out = wrapWords('a<b');
    expect(out).toContain('&lt;b');
    expect(out).not.toContain('<b');
  });
});

describe('applyWordHighlight', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = wrapWords('You got it');
  });

  it('wordScores 매칭 — 점수별 색 적용', () => {
    applyWordHighlight(container, [
      { word: 'You', score: 100 },
      { word: 'got', score: 60 },
      { word: 'it', score: 40 },
    ]);
    const spans = container.querySelectorAll('.word');
    expect(spans[0].style.color).toContain('sage');
    expect(spans[1].style.color).toContain('amber');
    expect(spans[2].style.color).toContain('danger');
    expect(spans[2].style.textDecoration).toContain('wavy');
  });

  it('wordScores 부재 → 색상 reset', () => {
    const spans = container.querySelectorAll('.word');
    spans[0].style.color = 'red';
    applyWordHighlight(container, []);
    expect(spans[0].style.color).toBe('');
  });

  it('일부 인덱스 누락 → 해당 span 만 reset', () => {
    applyWordHighlight(container, [{ word: 'You', score: 100 }]);
    const spans = container.querySelectorAll('.word');
    expect(spans[0].style.color).toContain('sage');
    expect(spans[1].style.color).toBe('');
    expect(spans[2].style.color).toBe('');
  });

  it('container null/잘못된 입력 → no throw', () => {
    expect(() => applyWordHighlight(null, [])).not.toThrow();
    expect(() => applyWordHighlight({}, [])).not.toThrow();
  });

  it('onBadClick: bad 단어 클릭 시 호출, good/ok 는 무시', () => {
    const onBadClick = vi.fn();
    applyWordHighlight(
      container,
      [
        { word: 'You', score: 100 }, // good
        { word: 'got', score: 60 },  // ok
        { word: 'it', score: 40 },   // bad
      ],
      { onBadClick },
    );
    const spans = container.querySelectorAll('.word');
    spans[0].click();
    spans[1].click();
    expect(onBadClick).not.toHaveBeenCalled();
    spans[2].click();
    expect(onBadClick).toHaveBeenCalledOnce();
    expect(onBadClick).toHaveBeenCalledWith('it');
    expect(spans[2].style.cursor).toBe('pointer');
  });

  it('두 번째 호출 시 이전 click handler 제거 (멱등)', () => {
    const first = vi.fn();
    const second = vi.fn();
    applyWordHighlight(container, [{ word: 'You', score: 40 }], { onBadClick: first });
    applyWordHighlight(container, [{ word: 'You', score: 40 }], { onBadClick: second });
    container.querySelectorAll('.word')[0].click();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});

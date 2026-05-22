import { describe, it, expect } from 'vitest';
import { checkAnswer, toNumber, normalize } from './mathAnswer.js';

describe('mathAnswer.checkAnswer', () => {
  it('정수 정답', () => {
    expect(checkAnswer('25', { answer: '25' }).correct).toBe(true);
  });
  it('accept 대체답 (5x5)', () => {
    expect(checkAnswer('5x5', { answer: '25', accept: ['5x5'] }).correct).toBe(true);
  });
  it('공백·곱셈기호 정규화 (5 × 5 → 5x5)', () => {
    expect(checkAnswer('5 × 5', { answer: '25', accept: ['5x5'] }).correct).toBe(true);
  });
  it('분수=소수 동치 (0.5 vs 1/2)', () => {
    expect(checkAnswer('0.5', { answer: '1/2' }).correct).toBe(true);
  });
  it('분수 입력 (3/4 vs 0.75)', () => {
    expect(checkAnswer('3/4', { answer: '0.75' }).correct).toBe(true);
  });
  it('천단위 콤마 무시 (1,000)', () => {
    expect(checkAnswer('1,000', { answer: '1000' }).correct).toBe(true);
  });
  it('오답', () => {
    expect(checkAnswer('13', { answer: '12' }).correct).toBe(false);
  });
  it('빈 입력은 empty', () => {
    expect(checkAnswer('', { answer: '12' }).empty).toBe(true);
  });
  it('추정형 range 허용', () => {
    expect(checkAnswer('5000000', { answer: '', range: [1e6, 1e7] }).correct).toBe(true);
  });
  it('range 밖은 오답', () => {
    expect(checkAnswer('500', { answer: '', range: [1e6, 1e7] }).correct).toBe(false);
  });
});

describe('mathAnswer helpers', () => {
  it('toNumber 분수', () => { expect(toNumber('3/4')).toBe(0.75); });
  it('toNumber 0 분모 → NaN', () => { expect(Number.isNaN(toNumber('1/0'))).toBe(true); });
  it('normalize 통일', () => { expect(normalize(' 5 × 5 ')).toBe('5x5'); });
});

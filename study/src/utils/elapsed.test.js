import { describe, it, expect } from 'vitest';
import { formatElapsed } from './elapsed.js';

describe('formatElapsed', () => {
  it('0 → 00:00', () => expect(formatElapsed(0)).toBe('00:00'));
  it('1500ms → 00:01', () => expect(formatElapsed(1500)).toBe('00:01'));
  it('65000ms → 01:05', () => expect(formatElapsed(65000)).toBe('01:05'));
  it('600000ms → 10:00', () => expect(formatElapsed(600000)).toBe('10:00'));
  it('3600000ms (60분) → 60:00', () => expect(formatElapsed(3600000)).toBe('60:00'));
  it('4500000ms (75분) → 75:00', () => expect(formatElapsed(4500000)).toBe('75:00'));
  it('negative → 00:00', () => expect(formatElapsed(-1)).toBe('00:00'));
  it('NaN → 00:00', () => expect(formatElapsed(NaN)).toBe('00:00'));
  it('Infinity → 00:00', () => expect(formatElapsed(Infinity)).toBe('00:00'));
});

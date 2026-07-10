import { describe, it, expect } from 'vitest'
import { formatCount, formatRelTime } from './format.js'

describe('formatCount — 지시서 §6: 10,000↑ 만 축약, 미만 콤마', () => {
  it('만 단위 축약 (소수 1자리, .0 제거)', () => {
    expect(formatCount(168000)).toBe('16.8만')
    expect(formatCount(90000)).toBe('9만')
    expect(formatCount(1240000)).toBe('124만')
    expect(formatCount(10000)).toBe('1만')
  })
  it('만 미만은 콤마', () => {
    expect(formatCount(9860)).toBe('9,860')
    expect(formatCount(720)).toBe('720')
    expect(formatCount(0)).toBe('0')
  })
  it('null/undefined 는 빈 문자열', () => {
    expect(formatCount(null)).toBe('')
    expect(formatCount(undefined)).toBe('')
  })
})

describe('formatRelTime — n분/시간/일/개월 전', () => {
  const now = new Date('2026-07-11T12:00:00+09:00')
  it('시간 단위', () => {
    expect(formatRelTime('2026-07-11T06:00:00+09:00', now)).toBe('6시간 전')
    expect(formatRelTime('2026-07-11T11:20:00+09:00', now)).toBe('40분 전')
  })
  it('일·개월 단위', () => {
    expect(formatRelTime('2026-07-08T12:00:00+09:00', now)).toBe('3일 전')
    expect(formatRelTime('2026-05-01T12:00:00+09:00', now)).toBe('2개월 전')
  })
  it('없으면 빈 문자열', () => {
    expect(formatRelTime(null, now)).toBe('')
  })
})

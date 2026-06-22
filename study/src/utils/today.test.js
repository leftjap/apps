// 활동을 KST(로컬) 날짜로 귀속 — UTC 드리프트(새벽 학습이 전날로 기록) 방지.
// 날짜 계산은 로컬 시간대 전제(gym·today 와 동일). UTC 러너에서도 결정적이도록 TZ 고정.
process.env.TZ = 'Asia/Seoul';
import { describe, it, expect } from 'vitest';
import { localISODate } from './today.js';

describe('localISODate — KST(로컬) 날짜 귀속 (UTC 드리프트 방지)', () => {
  it('KST 새벽(전날 UTC)인 순간을 KST 날짜로 귀속한다', () => {
    // 2026-06-21T19:30:00Z = KST 2026-06-22 04:30 → 6/22 (UTC 계산이면 6/21 오답)
    expect(localISODate(new Date('2026-06-21T19:30:00Z'))).toBe('2026-06-22');
  });

  it('낮 시간은 UTC·KST 동일 날짜', () => {
    // 2026-06-22T03:00:00Z = KST 2026-06-22 12:00 → 6/22
    expect(localISODate(new Date('2026-06-22T03:00:00Z'))).toBe('2026-06-22');
  });

  it('월말 경계 — KST 자정 직후(전날 UTC 23:xx)도 다음 달 1일로 귀속', () => {
    // 2026-06-30T15:30:00Z = KST 2026-07-01 00:30 → 7/01
    expect(localISODate(new Date('2026-06-30T15:30:00Z'))).toBe('2026-07-01');
  });
});

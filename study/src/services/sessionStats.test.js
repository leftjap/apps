/**
 * sessionStats.test.js — Wave 11.68-d 단위 테스트.
 *
 * 검증 범위:
 *  - computeDeltaVsPrevSession: 분당 평균 × 경과 분 baseline + delta
 *    - 직전 세션 없음 → null / utteranceCount=0 → null / durationSec=0 → null
 *    - 정확 같음 → delta=0 / 더 빠름 → delta>0 / 느림 → delta<0
 *  - computePRRemaining: PR - (today + session)
 *    - PR=0 → null / remaining ≤ 0 → 0 (달성) / 정상 잔여
 *  - formatSign: '+N' / '-N' / '='
 *  - fetchPrevSession: lang + sessionType 필터 + createdAt 최신순 1건
 *  - fetchDailyPR / fetchTodayCount: meta / sessionLogs 합산
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeDeltaVsPrevSession,
  computePRRemaining,
  formatSign,
  fetchPrevSession,
  fetchDailyPR,
  fetchTodayCount,
} from './sessionStats.js';

describe('computeDeltaVsPrevSession', () => {
  it('직전 세션 분당 평균 정확 (utterance 30 / 600초 = 분당 3) × 현재 60초 = 3', () => {
    const out = computeDeltaVsPrevSession(
      { utteranceCount: 30, durationSec: 600 },
      60, // 1분
      3,
    );
    expect(out.baseline).toBe(3);
    expect(out.delta).toBe(0);
    expect(out.prevAvgPerMin).toBe(3);
  });

  it('현재 더 빠름 → delta > 0', () => {
    const out = computeDeltaVsPrevSession(
      { utteranceCount: 30, durationSec: 600 },
      60,
      5, // 기준 3 보다 2 더 많음
    );
    expect(out.delta).toBe(2);
  });

  it('현재 느림 → delta < 0', () => {
    const out = computeDeltaVsPrevSession(
      { utteranceCount: 30, durationSec: 600 },
      60,
      1, // 기준 3 보다 2 적음
    );
    expect(out.delta).toBe(-2);
  });

  it('직전 세션 없음 → delta=null', () => {
    expect(computeDeltaVsPrevSession(null, 60, 5).delta).toBeNull();
    expect(computeDeltaVsPrevSession(undefined, 60, 5).delta).toBeNull();
  });

  it('utteranceCount=0 → delta=null', () => {
    const out = computeDeltaVsPrevSession({ utteranceCount: 0, durationSec: 600 }, 60, 5);
    expect(out.delta).toBeNull();
    expect(out.prevAvgPerMin).toBeNull();
  });

  it('durationSec=0 → delta=null (0 분 division 회피)', () => {
    const out = computeDeltaVsPrevSession({ utteranceCount: 30, durationSec: 0 }, 60, 5);
    expect(out.delta).toBeNull();
  });

  it('currentSec=0 (세션 시작 직후) → baseline=0, delta=current count', () => {
    const out = computeDeltaVsPrevSession({ utteranceCount: 30, durationSec: 600 }, 0, 0);
    expect(out.baseline).toBe(0);
    expect(out.delta).toBe(0);
  });
});

describe('computePRRemaining', () => {
  it('정상 — PR 50, today 30, session 5 → 잔여 15', () => {
    expect(computePRRemaining(50, 30, 5)).toBe(15);
  });
  it('PR 달성 — today + session ≥ PR → 0', () => {
    expect(computePRRemaining(50, 50, 0)).toBe(0);
    expect(computePRRemaining(50, 30, 30)).toBe(0); // 60 > 50 → 0
  });
  it('PR=0 (미존재) → null', () => {
    expect(computePRRemaining(0, 30, 5)).toBeNull();
    expect(computePRRemaining(null, 30, 5)).toBeNull();
  });
  it('today / session 없음 → 그대로 PR', () => {
    expect(computePRRemaining(50, 0, 0)).toBe(50);
  });
});

describe('formatSign', () => {
  it('양수 → +N', () => {
    expect(formatSign(3)).toBe('+3');
    expect(formatSign(100)).toBe('+100');
  });
  it('음수 → -N', () => {
    expect(formatSign(-2)).toBe('-2');
  });
  it('0 → =', () => {
    expect(formatSign(0)).toBe('=');
    expect(formatSign(null)).toBe('=');
    expect(formatSign(undefined)).toBe('=');
  });
});

function createMockDB() {
  const meta = new Map();
  const sessionLogs = new Map();
  return {
    _meta: meta,
    _sessionLogs: sessionLogs,
    meta: { async get(k) { return meta.get(k); }, async put(rec) { meta.set(rec.key, rec); } },
    sessionLogs: {
      where(field) {
        return {
          equals(value) {
            return {
              async toArray() {
                return Array.from(sessionLogs.values()).filter((l) => l[field] === value);
              },
            };
          },
        };
      },
    },
  };
}

describe('fetchPrevSession', () => {
  let db;
  beforeEach(() => { db = createMockDB(); });

  it('lang + sessionType="normal" 필터 + createdAt 최신순 1건', async () => {
    db._sessionLogs.set('s1', { id: 's1', lang: 'en', sessionType: 'normal', utteranceCount: 10, createdAt: '2026-04-30T10:00:00Z' });
    db._sessionLogs.set('s2', { id: 's2', lang: 'en', sessionType: 'normal', utteranceCount: 15, createdAt: '2026-05-01T10:00:00Z' });
    db._sessionLogs.set('s3', { id: 's3', lang: 'ja', sessionType: 'normal', utteranceCount: 99, createdAt: '2026-05-02T10:00:00Z' });
    const prev = await fetchPrevSession(db, 'en', 'review');
    expect(prev.id).toBe('s2'); // ja 제외, en 중 최신
    expect(prev.utteranceCount).toBe(15);
  });

  it('mode="free" → sessionType="free_review" 만 매칭', async () => {
    db._sessionLogs.set('s1', { id: 's1', lang: 'en', sessionType: 'normal', utteranceCount: 10, createdAt: '2026-05-01T10:00:00Z' });
    db._sessionLogs.set('s2', { id: 's2', lang: 'en', sessionType: 'free_review', utteranceCount: 5, createdAt: '2026-04-30T10:00:00Z' });
    const prev = await fetchPrevSession(db, 'en', 'free');
    expect(prev.id).toBe('s2');
  });

  it('매칭 없음 → null', async () => {
    db._sessionLogs.set('s1', { id: 's1', lang: 'en', sessionType: 'normal', createdAt: '2026-05-01T10:00:00Z' });
    expect(await fetchPrevSession(db, 'ja', 'review')).toBeNull();
  });

  it('가드 — db / lang 누락 시 null', async () => {
    expect(await fetchPrevSession(null, 'en', 'review')).toBeNull();
    expect(await fetchPrevSession(db, '', 'review')).toBeNull();
  });
});

describe('fetchDailyPR', () => {
  it('meta prDailyUtterance.value.value 반환', async () => {
    const db = createMockDB();
    db._meta.set('prDailyUtterance', { key: 'prDailyUtterance', value: { value: 47, achieved_at: '2026-05-01', lang: 'en' } });
    expect(await fetchDailyPR(db)).toBe(47);
  });
  it('meta 미존재 → 0', async () => {
    expect(await fetchDailyPR(createMockDB())).toBe(0);
  });
});

describe('fetchTodayCount', () => {
  it('today + lang 필터 합산', async () => {
    const db = createMockDB();
    db._sessionLogs.set('s1', { id: 's1', lang: 'en', date: '2026-05-04', utteranceCount: 10 });
    db._sessionLogs.set('s2', { id: 's2', lang: 'en', date: '2026-05-04', utteranceCount: 15 });
    db._sessionLogs.set('s3', { id: 's3', lang: 'en', date: '2026-05-03', utteranceCount: 99 }); // 어제
    db._sessionLogs.set('s4', { id: 's4', lang: 'ja', date: '2026-05-04', utteranceCount: 99 }); // 다른 lang
    expect(await fetchTodayCount(db, 'en', '2026-05-04')).toBe(25);
  });
  it('매칭 없음 → 0', async () => {
    expect(await fetchTodayCount(createMockDB(), 'en', '2026-05-04')).toBe(0);
  });
});

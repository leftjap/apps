/**
 * dayLessons.test.js — 캘린더 바텀시트 헬퍼 단위 테스트.
 * Mock 전략: db 인자 직접 mock (userMeta.test.js 패턴).
 */
import { describe, it, expect } from 'vitest';
import { fetchDayLessonsForDay } from './dayLessons.js';

function createMockDB({ sessionLogs = [], todayLessons = [], reviewQueue = [] } = {}) {
  const todayMap = new Map(todayLessons.map((c) => [c.id, c]));
  const reviewMap = new Map(reviewQueue.map((c) => [c.id, c]));
  return {
    sessionLogs: {
      where(criteria) {
        return {
          async toArray() {
            return sessionLogs.filter((l) =>
              Object.entries(criteria).every(([k, v]) => l[k] === v),
            );
          },
        };
      },
    },
    todayLessons: { async bulkGet(ids) { return ids.map((id) => todayMap.get(id)); } },
    reviewQueue:  { async bulkGet(ids) { return ids.map((id) => reviewMap.get(id)); } },
  };
}

describe('fetchDayLessonsForDay', () => {
  it('db/lang/dateISO 누락 시 빈 배열', async () => {
    expect(await fetchDayLessonsForDay(null, 'en', '2026-05-04')).toEqual([]);
    const db = createMockDB();
    expect(await fetchDayLessonsForDay(db, '', '2026-05-04')).toEqual([]);
    expect(await fetchDayLessonsForDay(db, 'en', '')).toEqual([]);
  });

  it('해당 일자 sessionLogs 없으면 빈 배열', async () => {
    const db = createMockDB({ sessionLogs: [] });
    expect(await fetchDayLessonsForDay(db, 'en', '2026-05-04')).toEqual([]);
  });

  it('newSentenceIds 합집합 → todayLessons + reviewQueue 조회 (신규만 정책)', async () => {
    const db = createMockDB({
      sessionLogs: [
        { id: 'sl1', lang: 'en', date: '2026-05-04', newSentenceIds: ['te1', 'te2'] },
        { id: 'sl2', lang: 'en', date: '2026-05-04', newSentenceIds: ['te2', 're1'] },
      ],
      todayLessons: [{ id: 'te1', sentence: 'A' }, { id: 'te2', sentence: 'B' }],
      reviewQueue: [{ id: 're1', sentence: 'C' }],
    });
    const out = await fetchDayLessonsForDay(db, 'en', '2026-05-04');
    expect(out.map((c) => c.id)).toEqual(['te1', 'te2', 're1']);
  });

  it('newSentenceIds 우선 사용 (sentenceIds 무시)', async () => {
    const db = createMockDB({
      sessionLogs: [
        { id: 'sl1', lang: 'en', date: '2026-05-04',
          newSentenceIds: ['te1'], sentenceIds: ['te1', 're1', 're2'] },
      ],
      todayLessons: [{ id: 'te1', sentence: 'New' }],
      reviewQueue: [{ id: 're1', sentence: 'Old' }, { id: 're2', sentence: 'Old2' }],
    });
    const out = await fetchDayLessonsForDay(db, 'en', '2026-05-04');
    expect(out.map((c) => c.id)).toEqual(['te1']);
  });

  it('newSentenceIds 부재 (구 row) → 빈 목록 (sentenceIds 폴백 폐기)', async () => {
    const db = createMockDB({
      sessionLogs: [
        { id: 'sl1', lang: 'en', date: '2026-05-04', sentenceIds: ['re1'] },
      ],
      reviewQueue: [{ id: 're1', sentence: 'Legacy' }],
    });
    const out = await fetchDayLessonsForDay(db, 'en', '2026-05-04');
    expect(out).toEqual([]);
  });

  it('newSentenceIds 빈 배열은 폴백 안 함 (그날 신규 없음)', async () => {
    const db = createMockDB({
      sessionLogs: [
        { id: 'sl1', lang: 'en', date: '2026-05-04',
          newSentenceIds: [], sentenceIds: ['re1'] },
      ],
      reviewQueue: [{ id: 're1', sentence: 'Old' }],
    });
    const out = await fetchDayLessonsForDay(db, 'en', '2026-05-04');
    expect(out).toEqual([]);
  });

  it('lang 다른 sessionLog 제외 + 매칭 실패 카드 제외', async () => {
    const db = createMockDB({
      sessionLogs: [
        { id: 'sl1', lang: 'en', date: '2026-05-04', newSentenceIds: ['te1', 'ghost'] },
        { id: 'sl2', lang: 'ja', date: '2026-05-04', newSentenceIds: ['tj1'] },
      ],
      todayLessons: [{ id: 'te1', sentence: 'A' }, { id: 'tj1', sentence: 'B' }],
    });
    const out = await fetchDayLessonsForDay(db, 'en', '2026-05-04');
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('te1');
  });

  it('null/undefined newSentenceIds → 빈 목록 (?? fallthrough 검증)', async () => {
    const db = createMockDB({
      sessionLogs: [
        { id: 'sl1', lang: 'en', date: '2026-05-04', newSentenceIds: null },
        { id: 'sl2', lang: 'en', date: '2026-05-04' },
      ],
    });
    const out = await fetchDayLessonsForDay(db, 'en', '2026-05-04');
    expect(out).toEqual([]);
  });
});

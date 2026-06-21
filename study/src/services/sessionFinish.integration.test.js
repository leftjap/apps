/**
 * sessionFinish.integration.test.js — 실 Dexie + fake-indexeddb 로
 * sessionLogs/dailyStats/todayLessons/reviewQueue 모두 반영 검증.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { finishSession, flushLiveStats } from './sessionFinish.js';

describe('finishSession (real Dexie)', () => {
  let db;
  beforeEach(async () => {
    db = createStudyDB(`finish_test_${Date.now()}_${Math.random()}`);
    await db.todayLessons.bulkPut([
      { id: 'n1', lang: 'en', date: '2026-05-08', completed: false, order_index: 1, sentence: 'A', meaning: 'a', phonetic_kr: 'p1' },
      { id: 'n2', lang: 'en', date: '2026-05-08', completed: false, order_index: 2, sentence: 'B', meaning: 'b', phonetic_kr: 'p2' },
    ]);
  });
  afterEach(async () => { await db.delete(); });

  it('mode=new — sessionLogs put + dailyStats 신규 + 카드 이관 (completed=true + reviewQueue interval=1)', async () => {
    const completedNew = await db.todayLessons.where('lang').equals('en').toArray();
    const log = await finishSession(db, {
      mode: 'new', lang: 'en', date: '2026-05-08',
      durationSec: 180, tried: 8, passed: 6, completedNewCards: completedNew,
    });
    expect(log.newSentenceIds.sort()).toEqual(['n1', 'n2']);

    const allLogs = await db.sessionLogs.toArray();
    expect(allLogs).toHaveLength(1);
    expect(allLogs[0]).toMatchObject({
      lang: 'en', date: '2026-05-08', mode: 'new', sessionType: 'normal',
      utteranceCount: 8, passCount: 6, durationSec: 180,
    });

    const stats = await db.dailyStats.get('2026-05-08');
    expect(stats).toMatchObject({
      date: '2026-05-08', lang: 'en',
      utteranceCount: 8, studyTimeSec: 180, newSentences: 2, reviewCount: 0,
    });

    expect((await db.todayLessons.get('n1')).completed).toBe(true);
    expect((await db.todayLessons.get('n2')).completed).toBe(true);

    const promoted1 = await db.reviewQueue.get('n1');
    expect(promoted1).toMatchObject({ id: 'n1', lang: 'en', interval: 1, nextReview: '2026-05-09', promotedFrom: 'new' });
    const promoted2 = await db.reviewQueue.get('n2');
    expect(promoted2.interval).toBe(1);
  });

  it('mode=new — scene 카드(explanation.dialogue)는 복습 이관·newSentenceIds 제외', async () => {
    await db.todayLessons.put({
      id: 'scene1', lang: 'en', date: '2026-05-08', completed: false, order_index: 0,
      sentence: '토론회', meaning: '', explanation: { dialogue: [{ speaker: 'A', en: 'Hi', ko: '안녕' }] },
    });
    const completedNew = await db.todayLessons.where('lang').equals('en').toArray(); // scene1 + n1 + n2
    const log = await finishSession(db, {
      mode: 'new', lang: 'en', date: '2026-05-08',
      durationSec: 60, tried: 2, passed: 1, completedNewCards: completedNew,
    });
    expect(log.newSentenceIds.sort()).toEqual(['n1', 'n2']); // scene1 제외
    expect(await db.reviewQueue.get('scene1')).toBeUndefined(); // 이관 안 됨
    expect(await db.reviewQueue.get('n1')).toBeTruthy();
    expect((await db.todayLessons.get('scene1')).completed).toBe(true); // 완료 표시(remaining 안 남게)
  });

  it('mode=review — sessionLogs put + dailyStats reviewCount 증가, 카드 이관 없음', async () => {
    await finishSession(db, {
      mode: 'review', lang: 'en', date: '2026-05-08',
      durationSec: 90, tried: 5, passed: 4, completedReviewCount: 3,
    });
    const stats = await db.dailyStats.get('2026-05-08');
    expect(stats).toMatchObject({ utteranceCount: 5, studyTimeSec: 90, newSentences: 0, reviewCount: 3 });

    // todayLessons.completed 변경 없음 (review 는 이관 안 함)
    expect((await db.todayLessons.get('n1')).completed).toBe(false);
    expect(await db.reviewQueue.get('n1')).toBeUndefined();
  });

  it('동일 날짜 두 번째 호출 — dailyStats 누적', async () => {
    await finishSession(db, { mode: 'review', lang: 'en', date: '2026-05-08', durationSec: 60, tried: 3, passed: 2, completedReviewCount: 2 });
    await finishSession(db, { mode: 'review', lang: 'en', date: '2026-05-08', durationSec: 90, tried: 4, passed: 3, completedReviewCount: 1 });
    const stats = await db.dailyStats.get('2026-05-08');
    expect(stats).toMatchObject({ utteranceCount: 7, studyTimeSec: 150, newSentences: 0, reviewCount: 3 });
  });

  it('db null → null 반환, 에러 안 남', async () => {
    expect(await finishSession(null, { mode: 'new', lang: 'en', date: '2026-05-08' })).toBeNull();
  });
});

describe('flushLiveStats + finishSession(baseToday) — 진행 중 라이브 반영, 이중집계 0', () => {
  let db;
  beforeEach(async () => {
    db = createStudyDB(`live_test_${Date.now()}_${Math.random()}`);
    await db.todayLessons.bulkPut([
      { id: 'n1', lang: 'en', date: '2026-06-21', completed: false, order_index: 1, sentence: 'A', meaning: 'a', phonetic_kr: 'p1' },
      { id: 'n2', lang: 'en', date: '2026-06-21', completed: false, order_index: 2, sentence: 'B', meaning: 'b', phonetic_kr: 'p2' },
      { id: 'n3', lang: 'en', date: '2026-06-21', completed: false, order_index: 3, sentence: 'C', meaning: 'c', phonetic_kr: 'p3' },
    ]);
  });
  afterEach(async () => { await db.delete(); });

  it('flushLiveStats — 진행 중 세션을 오늘 dailyStats 에 멱등 기록(base+현재, 누적 X)', async () => {
    const snap = { mode: 'new', lang: 'en', todayISO: '2026-06-21', startTime: Date.now() - 120000, step: 3, tried: 5, passed: 4, cardIds: ['n1', 'n2', 'n3'], base: null };
    await flushLiveStats(db, snap); // step3 → 2카드 완료(n1,n2)
    let s = await db.dailyStats.get('2026-06-21');
    expect(s.newSentences).toBe(2);
    expect(s.utteranceCount).toBe(5);
    expect(s.studyTimeSec).toBeGreaterThan(0);
    await flushLiveStats(db, snap); // 재호출 — 멱등 (누적 안 됨)
    s = await db.dailyStats.get('2026-06-21');
    expect(s.newSentences).toBe(2);
    expect(s.utteranceCount).toBe(5);
  });

  it('flush(진행) → finish(baseToday) — 이중집계 없이 최종값만', async () => {
    const snapMid = { mode: 'new', lang: 'en', todayISO: '2026-06-21', startTime: Date.now() - 300000, step: 2, tried: 3, passed: 2, cardIds: ['n1', 'n2', 'n3'], base: null };
    await flushLiveStats(db, snapMid); // 진행 중 1카드(n1)
    expect((await db.dailyStats.get('2026-06-21')).newSentences).toBe(1);
    const completed = (await db.todayLessons.bulkGet(['n1', 'n2', 'n3'])).filter(Boolean);
    await finishSession(db, { mode: 'new', lang: 'en', date: '2026-06-21', durationSec: 300, tried: 9, passed: 7, completedNewCards: completed, baseToday: null });
    const s = await db.dailyStats.get('2026-06-21');
    expect(s.newSentences).toBe(3); // 이중집계면 4 — 3이어야 정상
    expect(s.utteranceCount).toBe(9); // 이중집계면 12 — 9
    expect(s.studyTimeSec).toBe(300);
  });

  it('base 있는 날(이전 완료분 위) — flush/finish 가 base 위에 더함', async () => {
    await finishSession(db, { mode: 'review', lang: 'en', date: '2026-06-21', durationSec: 60, tried: 4, passed: 3, completedReviewCount: 2 });
    const base = await db.dailyStats.get('2026-06-21'); // utter4, review2, time60
    const snap = { mode: 'new', lang: 'en', todayISO: '2026-06-21', startTime: Date.now() - 60000, step: 2, tried: 2, passed: 2, cardIds: ['n1', 'n2', 'n3'], base };
    await flushLiveStats(db, snap);
    let s = await db.dailyStats.get('2026-06-21');
    expect(s.utteranceCount).toBe(6); // base4 + live2
    expect(s.newSentences).toBe(1); // n1
    expect(s.reviewCount).toBe(2); // base 유지
    const completed = (await db.todayLessons.bulkGet(['n1', 'n2'])).filter(Boolean);
    await finishSession(db, { mode: 'new', lang: 'en', date: '2026-06-21', durationSec: 120, tried: 5, passed: 4, completedNewCards: completed, baseToday: base });
    s = await db.dailyStats.get('2026-06-21');
    expect(s.utteranceCount).toBe(9); // base4 + final5 (live 덮어씀)
    expect(s.newSentences).toBe(2); // n1,n2
    expect(s.reviewCount).toBe(2);
    expect(s.studyTimeSec).toBe(180); // base60 + final120
  });

  it('finishSession baseToday 미전달 → 기존 누적 동작 보존(하위호환)', async () => {
    await finishSession(db, { mode: 'review', lang: 'en', date: '2026-06-21', durationSec: 60, tried: 3, passed: 2, completedReviewCount: 1 });
    await finishSession(db, { mode: 'review', lang: 'en', date: '2026-06-21', durationSec: 90, tried: 4, passed: 3, completedReviewCount: 2 });
    const s = await db.dailyStats.get('2026-06-21');
    expect(s.utteranceCount).toBe(7);
    expect(s.reviewCount).toBe(3);
  });
});

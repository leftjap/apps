/**
 * mathQueue.test.js — 수학 SRS 영속 계층 (2026-08-23 감사 후속).
 *
 * 배경: 수학 진도가 localStorage('mathProgress') 전용이라 기기 밖으로 안 나갔다.
 * mathQueue Dexie 스토어 · study_math_queue 테이블 · sync TABLE_MAP 은 이미 있었는데
 * 쓰는 코드가 없어 실 DB study_math_queue 0행.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createStudyDB } from '../db/schema.js';
import { toQueueRow, loadMathSrs, saveMathSrs, removeMathSrs, migrateLegacySrs } from './mathQueue.js';

const CARD = {
  id: 'm1-a1', module: 'm1', kind: 'apply', tag: '덧셈',
  prompt: '3 + 4 = ?', answer: '7', accept: ['7'], solution: { steps: ['3+4=7'] }, figure: null,
};
const CONCEPT = { id: 'm1-c1', module: 'm1', kind: 'concept', tag: '수 세기' }; // prompt/answer 없음

describe('toQueueRow — study_math_queue NOT NULL(prompt/answer) 정합', () => {
  it('응용 카드 → sync 매핑이 기대하는 전 필드', () => {
    const row = toQueueRow(CARD, { interval: 3, nextReview: '2026-08-26' }, 'got');
    expect(row).toMatchObject({
      id: 'm1-a1', module: 'm1', tag: '덧셈', prompt: '3 + 4 = ?', answer: '7',
      interval: 3, nextReview: '2026-08-26', lastResult: 'got',
    });
  });

  it('prompt/answer 없는 개념 카드 → null (NOT NULL 위반 행을 만들지 않는다)', () => {
    expect(toQueueRow(CONCEPT, { interval: 1, nextReview: '2026-08-24' }, 'got')).toBeNull();
  });
});

describe('mathQueue — Dexie 영속', () => {
  let db;
  beforeEach(() => { db = createStudyDB(`mathq_${Date.now()}_${Math.random()}`); });
  afterEach(async () => { await db.delete(); });

  it('saveMathSrs → loadMathSrs 로 progress.srs 형상 복원', async () => {
    await saveMathSrs(db, CARD, { interval: 3, nextReview: '2026-08-26' }, 'got');
    expect(await loadMathSrs(db)).toEqual({
      'm1-a1': { interval: 3, nextReview: '2026-08-26', lastResult: 'got' },
    });
  });

  it('졸업 → removeMathSrs 로 큐에서 사라진다', async () => {
    await saveMathSrs(db, CARD, { interval: 21, nextReview: '2026-09-13' }, 'got');
    await removeMathSrs(db, CARD.id);
    expect(await loadMathSrs(db)).toEqual({});
  });

  it('db 없으면 조용히 noop (미로그인 방어)', async () => {
    await expect(saveMathSrs(null, CARD, { interval: 1, nextReview: 'x' }, 'got')).resolves.toBeNull();
    expect(await loadMathSrs(null)).toEqual({});
  });
});

describe('migrateLegacySrs — localStorage 1회 이관 (멱등)', () => {
  let db;
  beforeEach(() => { db = createStudyDB(`mathmig_${Date.now()}_${Math.random()}`); });
  afterEach(async () => { await db.delete(); });

  const LEGACY = { 'm1-a1': { interval: 7, nextReview: '2026-08-30', lastResult: 'hmm' } };

  it('레거시 진도를 mathQueue 로 옮긴다', async () => {
    expect(await migrateLegacySrs(db, LEGACY, [CARD])).toMatchObject({ migrated: 1 });
    expect((await loadMathSrs(db))['m1-a1']).toEqual({ interval: 7, nextReview: '2026-08-30', lastResult: 'hmm' });
  });

  it('두 번 돌려도 기존 행을 덮지 않는다 (멱등)', async () => {
    await migrateLegacySrs(db, LEGACY, [CARD]);
    await saveMathSrs(db, CARD, { interval: 21, nextReview: '2026-09-20' }, 'got'); // 이후 실제 학습
    expect(await migrateLegacySrs(db, LEGACY, [CARD])).toMatchObject({ migrated: 0 });
    expect((await loadMathSrs(db))['m1-a1'].interval).toBe(21); // 최신 진도 보존
  });

  it('카드 목록에 없는 id (콘텐츠 삭제됨) 는 건너뛴다', async () => {
    const r = await migrateLegacySrs(db, { 'gone-1': { interval: 3, nextReview: '2026-08-26' } }, [CARD]);
    expect(r).toMatchObject({ migrated: 0, skipped: 1 });
  });

  it('레거시 비어 있으면 noop', async () => {
    expect(await migrateLegacySrs(db, {}, [CARD])).toMatchObject({ migrated: 0 });
  });
});

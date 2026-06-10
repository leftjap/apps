/**
 * schema.test.js — Dexie 버전 upgrade 검증 (실 Dexie + fake-indexeddb).
 *
 * v5: en 세션 콘텐츠 전면 삭제 (2026-06-10 적층·커서 stuck 상태 리셋).
 *  - todayLessons: lang='en' 전체 삭제 (ja·math 무영향)
 *  - reviewQueue: id 'en-park*' (오늘 이관분) 만 삭제 — 5월 복습 자산 (en-2026-05-*) 보존
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import { createStudyDB } from './schema.js';

// 기존 기기 상태 재현: v4 스키마(누적 8스토어)로 생성 — createStudyDB(v5) 재오픈 시 upgrade 발동
function createV4DB(name) {
  const db = new Dexie(name);
  db.version(4).stores({
    reviewQueue: 'id, lang, nextReview, interval',
    todayLessons: 'id, lang, date',
    sessionLogs: 'id, lang, date',
    dailyStats: 'date, lang',
    pronunciationLog: 'id, date, lang',
    meta: 'key',
    mathProblems: 'id, date, module',
    mathQueue: 'id, nextReview, module',
  });
  return db;
}

describe('schema v5 upgrade (v4 → v5)', () => {
  it('todayLessons en 전체 + reviewQueue en-park* 삭제, ja·math·en-2026-05 보존', async () => {
    const name = `test_v5_${Date.now()}_${Math.random()}`;
    const v4 = createV4DB(name);
    await v4.todayLessons.bulkPut([
      { id: 'en-park-s1e1-scene', lang: 'en', date: '2026-06-04', completed: false },
      { id: 'en-park-s1e1-fire-away', lang: 'en', date: '2026-06-04', completed: true },
      { id: 'en-parks-s1e1-brainstorm-scene', lang: 'en', date: '2026-06-10', completed: false },
      { id: 'ja-konte-1', lang: 'ja', date: '2026-06-09', completed: false },
    ]);
    await v4.reviewQueue.bulkPut([
      { id: 'en-park-s1e1-fire-away', lang: 'en', nextReview: '2026-06-11' }, // 오늘 이관 → 삭제
      { id: 'en-parks-s1e1-make-it-happen', lang: 'en', nextReview: '2026-06-11' }, // 오늘 이관 → 삭제
      { id: 'en-2026-05-20-coffee', lang: 'en', nextReview: '2026-06-12' }, // 5월 자산 → 보존
      { id: 'ja-2026-06-01-x', lang: 'ja', nextReview: '2026-06-11' }, // ja → 보존
    ]);
    await v4.mathProblems.put({ id: 'math-1', date: '2026-06-08', module: 'geometry' });
    v4.close();

    const db = createStudyDB(name);
    expect(await db.todayLessons.where('lang').equals('en').count()).toBe(0);
    expect((await db.todayLessons.toArray()).map((r) => r.id)).toEqual(['ja-konte-1']);
    expect((await db.reviewQueue.toArray()).map((r) => r.id).sort()).toEqual(['en-2026-05-20-coffee', 'ja-2026-06-01-x']);
    expect(await db.mathProblems.count()).toBe(1);
    await db.delete();
  });

  it('신규 생성(v5 직행)에선 upgrade 미실행 — en 삽입 정상 (preview 주입 전제)', async () => {
    const db = createStudyDB(`test_v5_fresh_${Date.now()}_${Math.random()}`);
    await db.todayLessons.put({ id: 'en-park-s1e1-scene', lang: 'en', date: '2026-06-04', completed: false });
    expect(await db.todayLessons.where('lang').equals('en').count()).toBe(1);
    await db.delete();
  });
});

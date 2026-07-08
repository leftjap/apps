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

describe('schema v4 → v5 → v6 누적 upgrade', () => {
  it('todayLessons en 전체 + reviewQueue en 전체 삭제(v6 가 5월 자산 포함 전량), ja·math 보존', async () => {
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
      { id: 'en-2026-05-20-coffee', lang: 'en', nextReview: '2026-06-12' }, // v5 는 보존했으나 v6 가 삭제(en 전량)
      { id: 'ja-2026-06-01-x', lang: 'ja', nextReview: '2026-06-11' }, // ja → 보존
    ]);
    await v4.mathProblems.put({ id: 'math-1', date: '2026-06-08', module: 'geometry' });
    v4.close();

    const db = createStudyDB(name);
    expect(await db.todayLessons.where('lang').equals('en').count()).toBe(0);
    expect((await db.todayLessons.toArray()).map((r) => r.id)).toEqual(['ja-konte-1']);
    expect((await db.reviewQueue.toArray()).map((r) => r.id).sort()).toEqual(['ja-2026-06-01-x']); // v6: en 전량 삭제(5월 자산 포함)
    expect(await db.mathProblems.count()).toBe(1);
    await db.delete();
  });

  it('v6: en 복습 전량 삭제(모두영어 트랙 전환) — 여러 날짜 en 전부 제거, ja 보존', async () => {
    const name = `test_v6_${Date.now()}_${Math.random()}`;
    const v4 = createV4DB(name);
    await v4.reviewQueue.bulkPut([
      { id: 'en-parks-s1e2-care-about', lang: 'en', nextReview: '2026-07-07' },
      { id: 'en-2026-05-20-coffee', lang: 'en', nextReview: '2026-06-12' },
      { id: 'en-office-s1e1-how-are-things', lang: 'en', nextReview: '2026-07-01' },
      { id: 'ja-konte-x', lang: 'ja', nextReview: '2026-07-05' },
    ]);
    v4.close();
    const db = createStudyDB(name);
    expect(await db.reviewQueue.where('lang').equals('en').count()).toBe(0);
    expect((await db.reviewQueue.toArray()).map((r) => r.id)).toEqual(['ja-konte-x']);
    await db.delete();
  });

  it('신규 생성(v5 직행)에선 upgrade 미실행 — en 삽입 정상 (preview 주입 전제)', async () => {
    const db = createStudyDB(`test_v5_fresh_${Date.now()}_${Math.random()}`);
    await db.todayLessons.put({ id: 'en-park-s1e1-scene', lang: 'en', date: '2026-06-04', completed: false });
    expect(await db.todayLessons.where('lang').equals('en').count()).toBe(1);
    await db.delete();
  });
});

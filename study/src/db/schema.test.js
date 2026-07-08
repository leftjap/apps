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

  it('v7: 이미 v6 인 기기 → 옛 en 복습만 삭제, 모두영어(en-moduyeongeo)·ja 복습 보존', async () => {
    // 기기가 이미 v6(모두영어 전환) 인 상태 재현 — createStudyDB(v7) 재오픈 시 v7 upgrade 만 발동.
    // 배경: v6 이 en review 를 지웠으나 당시 서버에 옛 en 이 남아 pull(bulkPut) 이 재유입 → v6 무효화.
    // 서버 정리 후 v7 이 한 번 더 정리하되, 이후 완료로 쌓일 모두영어 복습은 보존해야 하므로 non-moduyeongeo en 만.
    const name = `test_v7_${Date.now()}_${Math.random()}`;
    const v6 = new Dexie(name);
    v6.version(6).stores({
      reviewQueue: 'id, lang, nextReview, interval',
      todayLessons: 'id, lang, date',
      sessionLogs: 'id, lang, date',
      dailyStats: 'date, lang',
      pronunciationLog: 'id, date, lang',
      meta: 'key',
      mathProblems: 'id, date, module',
      mathQueue: 'id, nextReview, module',
    });
    await v6.reviewQueue.bulkPut([
      { id: 'en-parks-s1e1-fill-in', lang: 'en', nextReview: '2026-07-07' },              // 옛 en(parks) → 삭제
      { id: 'en-2026-05-26-skit1-1', lang: 'en', nextReview: '2026-06-12' },               // 옛 en(콩트) → 삭제
      { id: 'en-office-s1e2-call-you-back', lang: 'en', nextReview: '2026-07-01' },         // 옛 en(office) → 삭제
      { id: 'en-moduyeongeo-ep1-01-no-appetite', lang: 'en', nextReview: '2026-07-09' },    // 모두영어 → 보존
      { id: 'ja-konte-x', lang: 'ja', nextReview: '2026-07-05' },                           // ja → 보존
    ]);
    v6.close();

    const db = createStudyDB(name);
    const ids = (await db.reviewQueue.toArray()).map((r) => r.id).sort();
    expect(ids).toEqual(['en-moduyeongeo-ep1-01-no-appetite', 'ja-konte-x']);
    expect(await db.reviewQueue.where('lang').equals('en').count()).toBe(1); // 모두영어 1개만 en 잔존
    await db.delete();
  });

  it('신규 생성(v5 직행)에선 upgrade 미실행 — en 삽입 정상 (preview 주입 전제)', async () => {
    const db = createStudyDB(`test_v5_fresh_${Date.now()}_${Math.random()}`);
    await db.todayLessons.put({ id: 'en-park-s1e1-scene', lang: 'en', date: '2026-06-04', completed: false });
    expect(await db.todayLessons.where('lang').equals('en').count()).toBe(1);
    await db.delete();
  });
});

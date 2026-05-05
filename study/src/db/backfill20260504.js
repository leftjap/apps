/**
 * backfill20260504.js — 5/4 sessionLog.newSentenceIds 누락 1회 백필.
 *
 * 배경: 5/4 학습은 setupByMode review=0+new>0 stuck fix(commit 4c2c61a, 5/5) 이전 시점.
 * review-only 진행으로 finish() 가 newSentenceIds=[] 저장 → 캘린더 바텀시트 "신규 학습 없음".
 *
 * 전략: 5/4 todayLessons (Supabase 시드 → 사용자 Dexie 동기) 의 카드 ID 를 lang 별로 그룹,
 * 5/4 sessionLog (newSentenceIds 비어있음) 에 patch.
 *
 * 멱등: meta.backfill_2026_05_04 = 'done' 마커. 두 번째 호출 skip.
 * 안전망: log.newSentenceIds.length > 0 이면 patch 안 함 (이미 정상 데이터 보호).
 */

export const BACKFILL_KEY = 'backfill_2026_05_04';
export const BACKFILL_DATE = '2026-05-04';

export async function backfill20260504(db) {
  if (!db) return { skipped: true, reason: 'no-db' };

  const marker = await db.meta.get(BACKFILL_KEY);
  if (marker?.value === 'done') return { skipped: true, reason: 'done' };

  const logs = await db.sessionLogs.where({ date: BACKFILL_DATE }).toArray();
  if (logs.length === 0) {
    await db.meta.put({ key: BACKFILL_KEY, value: 'done', at: Date.now() });
    return { skipped: true, reason: 'no-log', patched: 0 };
  }

  const lessons = await db.todayLessons.where('date').equals(BACKFILL_DATE).toArray();
  const idsByLang = lessons.reduce((m, l) => {
    if (!l.lang || !l.id) return m;
    (m[l.lang] = m[l.lang] || []).push(l.id);
    return m;
  }, {});

  let patched = 0;
  for (const log of logs) {
    if (Array.isArray(log.newSentenceIds) && log.newSentenceIds.length > 0) continue;
    const newIds = idsByLang[log.lang] || [];
    if (newIds.length === 0) continue;
    await db.sessionLogs.update(log.id, { newSentenceIds: newIds });
    patched++;
  }

  await db.meta.put({ key: BACKFILL_KEY, value: 'done', at: Date.now() });
  console.log(`[backfill 2026-05-04] patched=${patched}/${logs.length}`);
  return { skipped: false, ok: true, patched, totalLogs: logs.length };
}

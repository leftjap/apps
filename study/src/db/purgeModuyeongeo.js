/* 일회성 정리 (2026-08-31, 사용자 지시 "모두영어 세션 생성 폐기 · 오늘 데몬 데이터 제거") —
 * 2026-08-26 중지했던 advance-check 데몬이 재부팅으로 부활해(plist 잔존) 모두영어 ep14(오늘)·
 * ep15(내일)를 적재했고, 사용자가 ep14 를 모르고 학습했다. 서버는 수동 정리했지만(백업:
 * ~/apps/tmp/purge-backup-moduyeongeo-ep14-15-20260831.json), reconcile(sync.js)이 로컬 사본을
 * 서버에 되살리는 구조라 **각 기기 로컬도 지워야** 부활 경로가 사라진다. sync 시작 전에 1회 실행.
 * ⚠ ep13 이하(정상 학습 이력)와 core100 은 건드리지 않는다. 전 기기 적용 확인 후 제거 예정. */

const FLAG = 'purgeModuyeongeoEp1415-20260831';
const isEp = (sid) => typeof sid === 'string' && /^en-moduyeongeo-ep1[45]-/.test(String(sid).split('#drill#')[0]);

export async function purgeModuyeongeoEp1415(db, supabase) {
  if (!db?.meta) return false;
  try {
    if (await db.meta.get(FLAG)) return false;
    // 로컬 4개 스토어 — ep14·ep15 관련 행만
    const pron = await db.pronunciationLog.toArray();
    await db.pronunciationLog.bulkDelete(pron.filter((r) => isEp(r?.sentenceId)).map((r) => r.id));
    const slogs = await db.sessionLogs.toArray();
    await db.sessionLogs.bulkDelete(slogs.filter((r) => (r?.newSentenceIds ?? []).some(isEp)).map((r) => r.id));
    const lessons = await db.todayLessons.toArray();
    await db.todayLessons.bulkDelete(lessons.filter((r) => isEp(r?.id)).map((r) => r.id));
    const rq = await db.reviewQueue.toArray();
    await db.reviewQueue.bulkDelete(rq.filter((r) => isEp(r?.id)).map((r) => r.id));
    // 서버 잔재 재소거 — 옛 번들 기기가 reconcile 로 되살렸을 경우 대비 (RLS 로 자기 행 한정).
    // review_queue 는 서버 tombstone(explanation._deleted)이 정본이라 지우지 않는다.
    if (supabase) {
      for (const pat of ['en-moduyeongeo-ep14-%', 'en-moduyeongeo-ep15-%']) {
        await supabase.from('study_pronunciation_log').delete().like('sentence_id', pat);
        await supabase.from('study_today_lessons').delete().like('id', pat);
      }
      await supabase.from('study_session_logs').delete().contains('new_sentence_ids', ['en-moduyeongeo-ep14-01-how-long-will-it-take']);
    }
    await db.meta.put({ key: FLAG, value: true, at: Date.now() });
    return true;
  } catch (e) {
    console.warn('[purgeModuyeongeoEp1415]', e);
    return false;
  }
}

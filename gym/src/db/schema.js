import Dexie from 'dexie';

/**
 * Gym 앱 IndexedDB 스키마 (spec §4 + §12 · Wave 11.7.x).
 *
 * 스토어:
 *  - sessions         : 운동 세션 (single + circuit 블록 구조). tags 는 multiEntry → 부위 필터링.
 *  - prs              : 개인 기록 (운동·타입별 1건 — [exerciseId+type] 복합 PK).
 *  - weights          : 체중 로그 (date PK, 하루 1건).
 *  - settings         : 사용자 설정 (단일 row · key='userSettings').
 *  - customExercises  : 사용자 커스텀 운동 (spec §10-1, Wave 11.7.1 신규).
 *
 * 버전 이력:
 *  - v1 (Wave 11.7): sessions·prs·weights·settings 4 스토어, prs PK=++id.
 *  - v2 (Wave 11.7.1): sessions tags multiEntry 추가, prs PK=[exerciseId+type] 변경,
 *                      customExercises 신규.
 *
 * v1 → v2 마이그레이션:
 *  - prs PK 변경은 `++id` 자동증가 → 복합 키 전환. 기존 row 가 있다면 (exerciseId, type) 추출 후 재기록.
 *  - 현실적으로 v1 환경에서 prs 에 데이터가 쌓인 적 없음 (write 함수 없었음) → no-op 케이스 다수.
 *  - 안전장치로 upgrade 콜백에서 누락 키 row 는 skip (exerciseId/type 모두 있어야 마이그레이션).
 */
export function createGymDB(name = 'gym') {
  const db = new Dexie(name);

  // v1 — Wave 11.7 (기존 사용자 호환).
  db.version(1).stores({
    sessions: '&id, date, status, startTime, [date+status]',
    prs: '++id, exerciseId, type, date, [exerciseId+type]',
    weights: '&date',
    settings: '&key',
  });

  // v2 — Wave 11.7.1.
  db.version(2).stores({
    sessions: '&id, date, status, startTime, *tags, [date+status]',
    prs: '[exerciseId+type], exerciseId, type, date',
    weights: '&date',
    settings: '&key',
    customExercises: '&id, part',
  }).upgrade(async (tx) => {
    const oldPrs = await tx.table('prs').toArray();
    await tx.table('prs').clear();
    for (const row of oldPrs) {
      if (!row.exerciseId || !row.type) continue;
      const { id: _drop, ...rest } = row;
      await tx.table('prs').put(rest);
    }
  });

  return db;
}

export default createGymDB;

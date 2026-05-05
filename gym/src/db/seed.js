/**
 * Dev 환경 seed — today 기준 -33~-13일 샘플 완료 세션.
 *
 * stats.html `MONTH.workouts` 14일 기준으로 재구성 (spec §4, §12).
 * 절대 날짜 박힘 제거 (Wave A 2026-05-05) — `seedDevSessions(db, now)` 시점 ISO 변환.
 * 프로덕션/사용자 DB 에는 영향 없음 — `sessions.count() === 0` 일 때만 실행.
 *
 * Wave 11.7: 팩토리 전환에 따라 `db` 인스턴스를 인자로 받는다 (auth.ensureUserDB 가 전달).
 *
 * 세션 스키마 (spec §4 + schema.js):
 *   { id, date, startTime, endTime, blocks, tags,
 *     totalVolume, totalCalories, durationMin, status }
 *
 * blocks = [{ type: 'single' | 'circuit', exercises: [{ exerciseId, exerciseName, equipment, sets: [{weight,reps,done} | {duration,distance,done}] }] }]
 */

/* [dayOffset, tag, durationMin, exercises] — exercises: [name, setCount, equipment, weight, reps]
   dayOffset: today 기준 일수 (음수 = 과거). seedDevSessions(now) 시점에 ISO 변환.
   유산소(weight === null)는 단일 "duration 기반" set 로 변환 */
const DEV_SESSIONS_OFFSETS = [
  [-33, '등',    52, [['바벨 로우', 5, 'barbell', 60, 10], ['랫 풀다운', 4, 'cable', 50, 10], ['덤벨 로우', 3, 'dumbbell', 22, 10]]],
  [-32, '팔',    28, [['바이셉 컬', 4, 'dumbbell', 16, 10], ['해머 컬', 3, 'dumbbell', 14, 10]]],
  [-30, '가',    55, [['벤치프레스', 5, 'barbell', 60, 10], ['인클라인', 4, 'barbell', 45, 10]]],
  [-28, '하',    64, [['스쿼트', 5, 'barbell', 70, 10], ['데드리프트', 4, 'barbell', 90, 10]]],
  [-27, '어',    38, [['숄더 프레스', 4, 'barbell', 30, 10]]],
  [-25, '등',    48, [['바벨 로우', 5, 'barbell', 55, 10]]],
  [-24, '가',    54, [['벤치프레스', 5, 'barbell', 60, 10]]],
  [-22, '유',    30, [['트레드밀', 1, 'cardio', null, null]]],
  [-21, '팔',    32, [['바이셉 컬', 4, 'dumbbell', 18, 10]]],
  [-19, '하',    58, [['스쿼트', 5, 'barbell', 70, 10]]],
  [-17, '가',    60, [['벤치프레스', 5, 'barbell', 60, 10], ['인클라인', 4, 'barbell', 45, 10], ['덤벨 플라이', 3, 'dumbbell', 18, 10]]],
  [-16, '등',    46, [['바벨 로우', 5, 'barbell', 55, 10]]],
  [-14, '하',    58, [['스쿼트', 5, 'barbell', 72, 10], ['데드리프트', 4, 'barbell', 90, 10]]],
  [-13, '가·어', 52, [['벤치프레스', 5, 'barbell', 60, 10], ['숄더 프레스', 4, 'barbell', 30, 10]]],
];

/** today(now) 기준 dayOffset → 'YYYY-MM-DD' (로컬 자정). */
export function offsetToISO(offset, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mkSession([dayOffset, tag, durationMin, exList], idx, now) {
  const date = offsetToISO(dayOffset, now);
  const id = `sess-${date.replaceAll('-', '')}-${String(idx).padStart(2, '0')}`;
  const startTime = new Date(`${date}T18:00:00`).getTime();
  const endTime = startTime + durationMin * 60_000;
  const exercises = exList.map(([name, setCount, equipment, weight, reps]) => ({
    exerciseId: name, // mocks 단계: 이름을 id 로 겸용. Wave 11.7 에서 실 id 매핑
    exerciseName: name,
    equipment,
    sets: weight == null
      ? [{ duration: durationMin * 60, distance: null, done: true }] // 유산소
      : Array.from({ length: setCount }, () => ({ weight, reps, done: true })),
  }));
  const totalVolume = exercises
    .flatMap(e => e.sets)
    .reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
  const totalCalories = Math.round(durationMin * 5.5); // 평균 MET 5.5

  return {
    id,
    date,
    startTime,
    endTime,
    blocks: [{ type: 'single', exercises }],
    tags: [tag],
    totalVolume,
    totalCalories,
    durationMin,
    status: 'completed',
  };
}

/**
 * Dev seed 실행. 기존 세션 존재 시 skip.
 * Wave 11.7: db 인자 필수 (auth.ensureUserDB 가 사용자별 인스턴스 전달).
 * 반환: { seeded, inserted } 또는 { seeded: false, existing }
 */
export async function seedDevSessions(db, now = Date.now()) {
  if (!db) throw new Error('seedDevSessions: db 인자 누락 — auth.ensureUserDB 후 호출');
  const count = await db.sessions.count();
  if (count > 0) return { seeded: false, existing: count };
  const sessions = DEV_SESSIONS_OFFSETS.map((raw, i) => mkSession(raw, i + 1, now));
  await db.sessions.bulkAdd(sessions);
  return { seeded: true, inserted: sessions.length };
}

export default seedDevSessions;

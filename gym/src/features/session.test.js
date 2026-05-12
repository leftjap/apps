import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createGymDB } from '../db/schema.js';
import {
  createEmptySession,
  getOrCreateActiveSession,
  addExerciseToActiveSession,
  removeExerciseFromActiveSession,
  syncIsAddedState,
  getExerciseDefaults,
  buildPresetSets,
  getPrevSessionLastSets,
  persistSetCommit,
  persistKeypadEdit,
  dumpActiveSessionFromState,
  finalizeActiveSession,
  getActivePart,
  setActivePart,
  mountSessionView,
  handleLeftSwipe,
  handleRightSwipe,
  applyTapDelta,
  updateKeypadBuf,
  applyKeypadValue,
  wireLongPress,
  wireSessionShortcuts,
  openActionSheet,
  closeActionSheet,
  persistRemoveSet,
  discardActiveSession,
  computeDropIdx,
  performBlockReorder,
  resolveDotDisplay,
} from './session.js';

async function seedCompletedSession({ id, date, exerciseId, sets, endTime = 0 }) {
  await db.sessions.put({
    id,
    date,
    startTime: endTime - 60_000,
    endTime,
    blocks: [{ type: 'single', exerciseId, sets }],
    tags: [],
    totalVolume: 0,
    totalCalories: 0,
    durationMin: 1,
    status: 'completed',
  });
}

let db;

beforeEach(async () => {
  db = createGymDB(`test-session-${Math.random().toString(36).slice(2, 10)}`);
  await db.open();
  globalThis.window = globalThis.window || {};
  globalThis.window.gymDB = db;
});

afterEach(async () => {
  await db.delete();
  delete globalThis.window.gymDB;
});

describe('createEmptySession', () => {
  it('빈 active 세션 row 생성 — startTime/endTime null', async () => {
    const s = await createEmptySession();
    expect(s.status).toBe('active');
    expect(s.startTime).toBeNull();
    expect(s.endTime).toBeNull();
    expect(s.blocks).toEqual([]);
    expect(s.tags).toEqual([]);
    expect(s.id).toMatch(/^session_\d+$/);
    expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const stored = await db.sessions.get(s.id);
    expect(stored).toEqual(s);
  });

  it('각 호출마다 다른 id (시간 차이)', async () => {
    const a = await createEmptySession();
    await new Promise((r) => setTimeout(r, 5));
    const b = await createEmptySession();
    expect(a.id).not.toBe(b.id);
  });
});

describe('getOrCreateActiveSession', () => {
  it('이미 active 세션 있으면 그것 반환 (중복 생성 안 함)', async () => {
    const a = await createEmptySession();
    const b = await getOrCreateActiveSession();
    expect(b.id).toBe(a.id);
    const all = await db.sessions.toArray();
    expect(all.length).toBe(1);
  });

  it('active 없으면 새로 생성', async () => {
    const a = await getOrCreateActiveSession();
    expect(a.status).toBe('active');
    const all = await db.sessions.toArray();
    expect(all.length).toBe(1);
  });

  it('completed 세션은 재사용 안 함 — 새 active 생성', async () => {
    await db.sessions.put({
      id: 'session_old',
      date: '2026-04-29',
      startTime: 1000,
      endTime: 2000,
      blocks: [],
      tags: [],
      totalVolume: 0,
      totalCalories: 0,
      durationMin: 0,
      status: 'completed',
    });
    const a = await getOrCreateActiveSession();
    expect(a.status).toBe('active');
    expect(a.id).not.toBe('session_old');
    const all = await db.sessions.toArray();
    expect(all.length).toBe(2);
  });
});

describe('addExerciseToActiveSession', () => {
  it('첫 운동 추가 — startTime 갱신, bench_press default 5세트 prefill', async () => {
    const before = Date.now();
    const r = await addExerciseToActiveSession('bench_press', 'chest');
    const after = Date.now();
    expect(r.added).toBe(true);
    expect(r.session.startTime).toBeGreaterThanOrEqual(before);
    expect(r.session.startTime).toBeLessThanOrEqual(after);
    expect(r.session.blocks.length).toBe(1);
    expect(r.session.blocks[0].type).toBe('single');
    expect(r.session.blocks[0].exerciseId).toBe('bench_press');
    // bench_press: defaultSets 5, defaultWeight 60, defaultReps 10 (barbell)
    expect(r.session.blocks[0].sets.length).toBe(5);
    expect(r.session.blocks[0].sets[0]).toEqual({
      weight: 60, reps: 10, done: false, preset: true, pr: false,
    });
    expect(r.session.tags).toEqual(['chest']);
    const stored = await db.sessions.get(r.session.id);
    expect(stored.startTime).toBe(r.session.startTime);
  });

  it('두번째 운동 추가 — startTime 보존, blocks 누적', async () => {
    const r1 = await addExerciseToActiveSession('bench_press', 'chest');
    const startTime1 = r1.session.startTime;
    await new Promise((rv) => setTimeout(rv, 10));
    const r2 = await addExerciseToActiveSession('lat_pulldown', 'back');
    expect(r2.session.startTime).toBe(startTime1);
    expect(r2.session.blocks.length).toBe(2);
    expect(r2.session.blocks[1].exerciseId).toBe('lat_pulldown');
    expect(r2.session.tags).toEqual(['chest', 'back']);
  });

  it('중복 운동 추가 — added=false, blocks 길이 보존', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await addExerciseToActiveSession('bench_press', 'chest');
    expect(r.added).toBe(false);
    expect(r.reason).toBe('duplicate');
    expect(r.session.blocks.length).toBe(1);
  });

  it('같은 부위 운동 추가 — tags 중복 방지', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await addExerciseToActiveSession('incline_bench', 'chest');
    expect(r.added).toBe(true);
    expect(r.session.tags).toEqual(['chest']);
  });

  it('exerciseId 누락 시 throw — DB 변경 0', async () => {
    await expect(addExerciseToActiveSession(null, 'chest')).rejects.toThrow(/exerciseId/);
    await expect(addExerciseToActiveSession('', 'chest')).rejects.toThrow(/exerciseId/);
    const all = await db.sessions.toArray();
    expect(all.length).toBe(0);
  });

  it('part 누락 시도 정상 동작 — tags 추가 없음', async () => {
    const r = await addExerciseToActiveSession('bench_press');
    expect(r.added).toBe(true);
    expect(r.session.tags).toEqual([]);
  });

  it('맨몸 운동 (push_up) — weight=null prefill', async () => {
    const r = await addExerciseToActiveSession('push_up', 'chest');
    expect(r.added).toBe(true);
    // push_up: bodyweight, defaultSets 3, defaultReps 15
    expect(r.session.blocks[0].sets.length).toBe(3);
    expect(r.session.blocks[0].sets[0]).toEqual({
      weight: null, reps: 15, done: false, preset: true, pr: false,
    });
  });

  it('유산소 (treadmill) — sets 1, weight/reps null prefill', async () => {
    const r = await addExerciseToActiveSession('treadmill', 'cardio');
    expect(r.added).toBe(true);
    // treadmill: cardio, defaultSets 1
    expect(r.session.blocks[0].sets.length).toBe(1);
    expect(r.session.blocks[0].sets[0]).toEqual({
      weight: null, reps: null, done: false, preset: true, pr: false,
    });
  });

  it('미지의 exerciseId — fallback 5세트 weight=0/reps=10', async () => {
    const r = await addExerciseToActiveSession('unknown_exercise', 'chest');
    expect(r.added).toBe(true);
    // fallback default — equipment=null 이라 일반 경로
    expect(r.session.blocks[0].sets.length).toBe(5);
    expect(r.session.blocks[0].sets[0]).toEqual({
      weight: 0, reps: 10, done: false, preset: true, pr: false,
    });
  });
});

describe('getExerciseDefaults', () => {
  it('BUILTIN 운동 — 정상 조회', async () => {
    const d = await getExerciseDefaults('bench_press');
    expect(d.id).toBe('bench_press');
    expect(d.defaultSets).toBe(5);
    expect(d.defaultWeight).toBe(60);
    expect(d.equipment).toBe('barbell');
  });

  it('미지의 id — fallback 객체', async () => {
    const d = await getExerciseDefaults('does_not_exist');
    expect(d.id).toBe('does_not_exist');
    expect(d.equipment).toBeNull();
    expect(d.defaultSets).toBe(5);
  });

  it('exerciseId 누락 시 throw', async () => {
    await expect(getExerciseDefaults(null)).rejects.toThrow(/exerciseId/);
    await expect(getExerciseDefaults('')).rejects.toThrow(/exerciseId/);
  });

  it('customExercises 조회 — 사용자 정의 운동', async () => {
    await db.customExercises.add({
      id: 'cust_x', name: '커스텀운동', part: 'chest', equipment: 'machine',
      defaultSets: 4, defaultReps: 12, defaultWeight: 40, met: 4.5, createdAt: Date.now(),
    });
    const d = await getExerciseDefaults('cust_x');
    expect(d.id).toBe('cust_x');
    expect(d.defaultSets).toBe(4);
    expect(d.defaultWeight).toBe(40);
  });
});

describe('buildPresetSets', () => {
  it('null/undefined → 빈 배열', () => {
    expect(buildPresetSets(null)).toEqual([]);
    expect(buildPresetSets(undefined)).toEqual([]);
  });

  it('일반 (barbell) — defaultSets·Weight·Reps prefill', () => {
    const sets = buildPresetSets({
      equipment: 'barbell', defaultSets: 4, defaultReps: 8, defaultWeight: 80,
    });
    expect(sets.length).toBe(4);
    expect(sets[0]).toEqual({
      weight: 80, reps: 8, done: false, preset: true, pr: false,
    });
    expect(sets.every((s) => s.preset === true)).toBe(true);
    expect(sets.every((s) => s.done === false)).toBe(true);
  });

  it('bodyweight — weight=null', () => {
    const sets = buildPresetSets({
      equipment: 'bodyweight', defaultSets: 3, defaultReps: 15, defaultWeight: 0,
    });
    expect(sets.length).toBe(3);
    expect(sets[0].weight).toBeNull();
    expect(sets[0].reps).toBe(15);
  });

  it('cardio — weight·reps null', () => {
    const sets = buildPresetSets({
      equipment: 'cardio', defaultSets: 1, defaultReps: 0, defaultWeight: 0,
    });
    expect(sets.length).toBe(1);
    expect(sets[0].weight).toBeNull();
    expect(sets[0].reps).toBeNull();
  });

  it('defaultSets 누락 시 5 fallback', () => {
    const sets = buildPresetSets({ equipment: 'barbell' });
    expect(sets.length).toBe(5);
  });

  it('defaultSets=0 도 최소 1 보장', () => {
    const sets = buildPresetSets({ equipment: 'barbell', defaultSets: 0 });
    expect(sets.length).toBe(1);
  });
});

describe('getActivePart / setActivePart', () => {
  it('기본 chest', () => {
    expect(getActivePart()).toBe('chest');
  });

  it('PART_IDS 매치 시만 set', () => {
    setActivePart('back');
    expect(getActivePart()).toBe('back');
    setActivePart('invalid_part');
    expect(getActivePart()).toBe('back');
    setActivePart('chest');
  });
});

describe('getPrevSessionLastSets', () => {
  it('completed 세션 없음 → null', async () => {
    const r = await getPrevSessionLastSets('bench_press');
    expect(r).toBeNull();
  });

  it('매칭 운동 있음 → sets 반환 (가장 최근 date)', async () => {
    await seedCompletedSession({
      id: 's_old', date: '2026-04-25',
      exerciseId: 'bench_press',
      sets: [
        { weight: 60, reps: 10, done: true, preset: false, pr: false },
        { weight: 65, reps: 8, done: true, preset: false, pr: false },
      ],
      endTime: 1000,
    });
    await seedCompletedSession({
      id: 's_new', date: '2026-04-29',
      exerciseId: 'bench_press',
      sets: [
        { weight: 70, reps: 8, done: true, preset: false, pr: true },
        { weight: 70, reps: 8, done: true, preset: false, pr: false },
        { weight: 65, reps: 10, done: true, preset: false, pr: false },
      ],
      endTime: 2000,
    });
    const r = await getPrevSessionLastSets('bench_press');
    expect(r).not.toBeNull();
    expect(r.length).toBe(3);
    expect(r[0].weight).toBe(70);
    expect(r[2].weight).toBe(65);
  });

  it('같은 date — endTime desc 우선', async () => {
    await seedCompletedSession({
      id: 's_a', date: '2026-04-29',
      exerciseId: 'bench_press',
      sets: [{ weight: 60, reps: 10, done: true, preset: false, pr: false }],
      endTime: 1000,
    });
    await seedCompletedSession({
      id: 's_b', date: '2026-04-29',
      exerciseId: 'bench_press',
      sets: [{ weight: 80, reps: 5, done: true, preset: false, pr: false }],
      endTime: 5000,
    });
    const r = await getPrevSessionLastSets('bench_press');
    expect(r[0].weight).toBe(80);
  });

  it('다른 운동만 있음 → null', async () => {
    await seedCompletedSession({
      id: 's', date: '2026-04-29',
      exerciseId: 'squat',
      sets: [{ weight: 100, reps: 8, done: true, preset: false, pr: false }],
      endTime: 1000,
    });
    const r = await getPrevSessionLastSets('bench_press');
    expect(r).toBeNull();
  });

  it('active 세션은 무시 (status=completed 만)', async () => {
    await db.sessions.put({
      id: 's_active', date: '2026-04-30',
      startTime: 1000, endTime: null,
      blocks: [{ type: 'single', exerciseId: 'bench_press', sets: [
        { weight: 90, reps: 5, done: true, preset: false, pr: false },
      ]}],
      tags: [], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'active',
    });
    const r = await getPrevSessionLastSets('bench_press');
    expect(r).toBeNull();
  });

  it('exerciseId 누락 시 throw', async () => {
    await expect(getPrevSessionLastSets(null)).rejects.toThrow(/exerciseId/);
  });
});

describe('addExerciseToActiveSession — prefill 우선순위', () => {
  it('이전 completed 세션 있음 → ② 우선 (default 무시)', async () => {
    await seedCompletedSession({
      id: 's_prev', date: '2026-04-29',
      exerciseId: 'bench_press',
      sets: [
        { weight: 70, reps: 8, done: true, preset: false, pr: false },
        { weight: 75, reps: 6, done: true, preset: false, pr: true },
      ],
      endTime: 1000,
    });
    const r = await addExerciseToActiveSession('bench_press', 'chest');
    expect(r.added).toBe(true);
    // BUILTIN bench_press default = 5세트/60kg/10회. 이전 세션 = 2세트/70/8 + 75/6.
    // ② 우선 → 2세트, weight/reps 이전 값, done/pr 초기화, preset:true.
    expect(r.session.blocks[0].sets.length).toBe(2);
    expect(r.session.blocks[0].sets[0]).toEqual({
      weight: 70, reps: 8, done: false, preset: true, pr: false,
    });
    expect(r.session.blocks[0].sets[1]).toEqual({
      weight: 75, reps: 6, done: false, preset: true, pr: false,
    });
  });

  it('이전 completed 세션 없음 → ③ default fallback', async () => {
    const r = await addExerciseToActiveSession('bench_press', 'chest');
    expect(r.added).toBe(true);
    // BUILTIN default 5세트
    expect(r.session.blocks[0].sets.length).toBe(5);
    expect(r.session.blocks[0].sets[0].weight).toBe(60);
  });

  it('이전 active 세션 있음 → ③ default (active 무시)', async () => {
    await db.sessions.put({
      id: 's_active', date: '2026-04-30',
      startTime: 1000, endTime: null,
      blocks: [{ type: 'single', exerciseId: 'bench_press', sets: [
        { weight: 90, reps: 5, done: true, preset: false, pr: false },
      ]}],
      tags: [], totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'active',
    });
    // active 세션이 있으니 그것을 reuse — 'bench_press' 이미 있어 duplicate
    const r = await addExerciseToActiveSession('bench_press', 'chest');
    expect(r.added).toBe(false);
    expect(r.reason).toBe('duplicate');
  });

  it('다른 운동의 이전 세션은 영향 0 → ③ default', async () => {
    await seedCompletedSession({
      id: 's_squat', date: '2026-04-29',
      exerciseId: 'squat',
      sets: [{ weight: 100, reps: 8, done: true, preset: false, pr: false }],
      endTime: 1000,
    });
    const r = await addExerciseToActiveSession('bench_press', 'chest');
    expect(r.added).toBe(true);
    expect(r.session.blocks[0].sets.length).toBe(5); // BUILTIN default
    expect(r.session.blocks[0].sets[0].weight).toBe(60);
  });
});

describe('persistSetCommit', () => {
  it('정상 — 매칭 single 블록의 sets[0] 갱신 (preset:false 강제)', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await persistSetCommit({
      exerciseName: '벤치프레스', // mapNameToExerciseId → 'bench_press'
      setIdx: 0,
      set: { weight: 65, reps: 12, done: true, pr: false },
    });
    expect(r.ok).toBe(true);
    expect(r.exerciseId).toBe('bench_press');
    const sess = (await db.sessions.toArray())[0];
    expect(sess.blocks[0].sets[0]).toEqual({
      weight: 65, reps: 12, done: true, preset: false, pr: false,
    });
    // 다른 세트는 preset:true 보존
    expect(sess.blocks[0].sets[1].preset).toBe(true);
  });

  it('PR 마킹 — pr:true 보존', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await persistSetCommit({
      exerciseName: '벤치프레스',
      setIdx: 1,
      set: { weight: 80, reps: 5, done: true, pr: true },
    });
    expect(r.ok).toBe(true);
    const sess = (await db.sessions.toArray())[0];
    expect(sess.blocks[0].sets[1].pr).toBe(true);
  });

  it('active 세션 없음 → no_active_session', async () => {
    const r = await persistSetCommit({
      exerciseName: '벤치프레스',
      setIdx: 0,
      set: { weight: 60, reps: 10, done: true, pr: false },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session');
  });

  it('매칭 운동 없음 → no_match (Dexie 변경 0)', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const before = (await db.sessions.toArray())[0];
    const r = await persistSetCommit({
      exerciseName: '데드리프트', // 활성 세션엔 bench_press 만
      setIdx: 0,
      set: { weight: 100, reps: 5, done: true, pr: false },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_match');
    expect(r.exerciseId).toBe('deadlift');
    const after = (await db.sessions.toArray())[0];
    expect(after.blocks).toEqual(before.blocks);
  });

  it('setIdx 범위 초과 → index_out_of_range', async () => {
    await addExerciseToActiveSession('bench_press', 'chest'); // sets length 5
    const r = await persistSetCommit({
      exerciseName: '벤치프레스',
      setIdx: 99,
      set: { weight: 60, reps: 10, done: true, pr: false },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('index_out_of_range');
  });

  it('invalid_input — 누락 시 ok:false', async () => {
    expect((await persistSetCommit({})).reason).toBe('invalid_input');
    expect((await persistSetCommit({ exerciseName: '벤치프레스', setIdx: -1, set: {} })).reason).toBe('invalid_input');
    expect((await persistSetCommit({ exerciseName: '벤치프레스', setIdx: 0, set: null })).reason).toBe('invalid_input');
    expect((await persistSetCommit({ exerciseName: null, setIdx: 0, set: {} })).reason).toBe('invalid_input');
  });

  it('set.done 누락 시 done:true default', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await persistSetCommit({
      exerciseName: '벤치프레스',
      setIdx: 0,
      set: { weight: 60, reps: 10 },
    });
    expect(r.ok).toBe(true);
    const sess = (await db.sessions.toArray())[0];
    expect(sess.blocks[0].sets[0].done).toBe(true);
  });

  it('weight/reps undefined 시 prev 보존', async () => {
    await addExerciseToActiveSession('bench_press', 'chest'); // prefill weight=60, reps=10
    const r = await persistSetCommit({
      exerciseName: '벤치프레스',
      setIdx: 0,
      set: { done: true }, // weight·reps 누락
    });
    expect(r.ok).toBe(true);
    const sess = (await db.sessions.toArray())[0];
    expect(sess.blocks[0].sets[0].weight).toBe(60);
    expect(sess.blocks[0].sets[0].reps).toBe(10);
    expect(sess.blocks[0].sets[0].preset).toBe(false);
  });
});

describe('persistKeypadEdit', () => {
  it('정상 weight 갱신 — preset:false, done/pr/reps 보존', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    // prefill: weight=60, reps=10, preset:true, done:false, pr:false
    const r = await persistKeypadEdit({
      exerciseName: '벤치프레스',
      setIdx: 0,
      field: 'weight',
      value: 65,
    });
    expect(r.ok).toBe(true);
    expect(r.exerciseId).toBe('bench_press');
    const sess = (await db.sessions.toArray())[0];
    expect(sess.blocks[0].sets[0]).toEqual({
      weight: 65, reps: 10, done: false, preset: false, pr: false,
    });
  });

  it('정상 reps 갱신 — weight 보존', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await persistKeypadEdit({
      exerciseName: '벤치프레스',
      setIdx: 1,
      field: 'reps',
      value: 8,
    });
    expect(r.ok).toBe(true);
    const sess = (await db.sessions.toArray())[0];
    expect(sess.blocks[0].sets[1]).toEqual({
      weight: 60, reps: 8, done: false, preset: false, pr: false,
    });
  });

  it('done:true commit 후 키패드 수정 — done:true 보존', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    await persistSetCommit({
      exerciseName: '벤치프레스', setIdx: 0,
      set: { weight: 60, reps: 10, done: true, pr: true },
    });
    // 사용자가 done 후 키패드로 weight 재수정
    const r = await persistKeypadEdit({
      exerciseName: '벤치프레스',
      setIdx: 0,
      field: 'weight',
      value: 70,
    });
    expect(r.ok).toBe(true);
    const sess = (await db.sessions.toArray())[0];
    // weight 갱신, done:true / pr:true 보존
    expect(sess.blocks[0].sets[0]).toEqual({
      weight: 70, reps: 10, done: true, preset: false, pr: true,
    });
  });

  it('active 세션 없음 → no_active_session', async () => {
    const r = await persistKeypadEdit({
      exerciseName: '벤치프레스', setIdx: 0, field: 'weight', value: 60,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session');
  });

  it('매칭 운동 없음 → no_match', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await persistKeypadEdit({
      exerciseName: '데드리프트', setIdx: 0, field: 'weight', value: 100,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_match');
    expect(r.exerciseId).toBe('deadlift');
  });

  it('setIdx 범위 초과 → index_out_of_range', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await persistKeypadEdit({
      exerciseName: '벤치프레스', setIdx: 99, field: 'weight', value: 60,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('index_out_of_range');
  });

  it('invalid_input — 누락/타입 오류', async () => {
    expect((await persistKeypadEdit({})).reason).toBe('invalid_input');
    expect((await persistKeypadEdit({
      exerciseName: '벤치프레스', setIdx: 0, field: 'weight', value: 'foo',
    })).reason).toBe('invalid_input');
    expect((await persistKeypadEdit({
      exerciseName: null, setIdx: 0, field: 'weight', value: 60,
    })).reason).toBe('invalid_input');
  });

  it('invalid_field — weight/reps 외', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await persistKeypadEdit({
      exerciseName: '벤치프레스', setIdx: 0, field: 'duration', value: 60,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_field');
  });
});

describe('dumpActiveSessionFromState', () => {
  it('정상 — 현재 운동 sets dump (preset 보존)', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    // mocks state 시뮬: 사용자가 sets[0].weight 65 로 변경 (좌 스와이프 X, 키패드 X — 빈 영역 탭 증감 가정)
    const r = await dumpActiveSessionFromState({
      exerciseName: '벤치프레스',
      sets: [
        { weight: 65, reps: 10, done: false, preset: false, pr: false }, // 사용자 입력
        { weight: 60, reps: 10, done: false, preset: true, pr: false },
        { weight: 60, reps: 10, done: false, preset: true, pr: false },
        { weight: 60, reps: 10, done: false, preset: true, pr: false },
        { weight: 60, reps: 10, done: false, preset: true, pr: false },
      ],
      exerciseStates: {},
    });
    expect(r.ok).toBe(true);
    expect(r.dumped).toBe(1);
    const sess = (await db.sessions.toArray())[0];
    expect(sess.blocks[0].sets[0]).toEqual({
      weight: 65, reps: 10, done: false, preset: false, pr: false,
    });
    expect(sess.blocks[0].sets[1]).toEqual({
      weight: 60, reps: 10, done: false, preset: true, pr: false,
    });
  });

  it('multi-운동 — 현재 + exerciseStates 모두 dump', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    await addExerciseToActiveSession('squat', 'legs');
    const r = await dumpActiveSessionFromState({
      exerciseName: '스쿼트',
      sets: [
        { weight: 100, reps: 5, done: true, preset: false, pr: true },
        { weight: 100, reps: 5, done: false, preset: true, pr: false },
      ],
      exerciseStates: {
        '벤치프레스': {
          sets: [
            { weight: 60, reps: 10, done: true, preset: false, pr: false },
            { weight: 65, reps: 8, done: true, preset: false, pr: false },
          ],
        },
      },
    });
    expect(r.ok).toBe(true);
    expect(r.dumped).toBe(2);
    const sess = (await db.sessions.toArray())[0];
    const benchBlock = sess.blocks.find((b) => b.exerciseId === 'bench_press');
    const squatBlock = sess.blocks.find((b) => b.exerciseId === 'squat');
    expect(benchBlock.sets.length).toBe(2);
    expect(benchBlock.sets[0].weight).toBe(60);
    expect(squatBlock.sets[0].pr).toBe(true);
  });

  it('매칭 없는 mocks 운동 — 무시 (dumped 카운트 안 됨)', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const before = (await db.sessions.toArray())[0].blocks[0].sets;
    const r = await dumpActiveSessionFromState({
      exerciseName: '데드리프트', // active session 에 없는 운동
      sets: [{ weight: 100, reps: 5, done: true, preset: false, pr: false }],
      exerciseStates: {},
    });
    expect(r.ok).toBe(true);
    expect(r.dumped).toBe(0);
    // bench_press blocks 보존
    const after = (await db.sessions.toArray())[0].blocks[0].sets;
    expect(after).toEqual(before);
  });

  it('active 세션 없음 → no_active_session', async () => {
    const r = await dumpActiveSessionFromState({
      exerciseName: '벤치프레스',
      sets: [{ weight: 60, reps: 10, done: false, preset: true, pr: false }],
      exerciseStates: {},
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session');
  });

  it('invalid_input — null/누락', async () => {
    expect((await dumpActiveSessionFromState(null)).reason).toBe('invalid_input');
    expect((await dumpActiveSessionFromState(undefined)).reason).toBe('invalid_input');
  });

  it('빈 stateData (모든 필드 없음) → no_active_session 또는 dumped:0', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await dumpActiveSessionFromState({});
    expect(r.ok).toBe(true);
    expect(r.dumped).toBe(0);
  });

  it('exerciseStates 만 (현재 운동 미지정)', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await dumpActiveSessionFromState({
      exerciseStates: {
        '벤치프레스': {
          sets: [
            { weight: 80, reps: 6, done: true, preset: false, pr: false },
            { weight: 60, reps: 10, done: false, preset: true, pr: false },
            { weight: 60, reps: 10, done: false, preset: true, pr: false },
            { weight: 60, reps: 10, done: false, preset: true, pr: false },
            { weight: 60, reps: 10, done: false, preset: true, pr: false },
          ],
        },
      },
    });
    expect(r.ok).toBe(true);
    expect(r.dumped).toBe(1);
    const sess = (await db.sessions.toArray())[0];
    expect(sess.blocks[0].sets[0].weight).toBe(80);
  });

  it('null 필드 처리 — weight=null, reps=null 보존 (cardio 호환)', async () => {
    await addExerciseToActiveSession('treadmill', 'cardio');
    const r = await dumpActiveSessionFromState({
      exerciseName: '트레드밀',
      sets: [{ weight: null, reps: null, done: false, preset: true, pr: false }],
      exerciseStates: {},
    });
    expect(r.ok).toBe(true);
    const sess = (await db.sessions.toArray())[0];
    const block = sess.blocks.find((b) => b.exerciseId === 'treadmill');
    expect(block.sets[0]).toEqual({
      weight: null, reps: null, done: false, preset: true, pr: false,
    });
  });
});

describe('finalizeActiveSession', () => {
  it('active 없음 → no_active_session', async () => {
    const r = await finalizeActiveSession();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session');
  });

  it('정상 finalize — status=completed + endTime + 합계', async () => {
    // active 세션 + 1 운동 + 2 done 세트 (60×10 + 65×8) commit
    await addExerciseToActiveSession('bench_press', 'chest');
    await persistSetCommit({
      exerciseName: '벤치프레스', setIdx: 0,
      set: { weight: 60, reps: 10, done: true, pr: false },
    });
    await persistSetCommit({
      exerciseName: '벤치프레스', setIdx: 1,
      set: { weight: 65, reps: 8, done: true, pr: true },
    });
    const beforeStartTime = (await db.sessions.toArray())[0].startTime;
    const fixedEnd = beforeStartTime + 30 * 60_000; // 30분 후

    const r = await finalizeActiveSession({ endTime: fixedEnd });
    expect(r.ok).toBe(true);
    expect(r.session.status).toBe('completed');
    expect(r.session.endTime).toBe(fixedEnd);
    expect(r.session.durationMin).toBe(30);
    expect(r.session.totalVolume).toBe(60 * 10 + 65 * 8); // 1120
    expect(r.session.totalCalories).toBe(Math.round(30 * 5.5)); // 165

    // Dexie 에도 status='completed' 저장
    const stored = await db.sessions.get(r.session.id);
    expect(stored.status).toBe('completed');
    expect(stored.totalVolume).toBe(1120);
  });

  it('미완료 세트 (done:false) 는 totalVolume 합산 제외', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    // sets[0] preset:true (done:false) — 합산 제외
    await persistSetCommit({
      exerciseName: '벤치프레스', setIdx: 1,
      set: { weight: 50, reps: 12, done: true, pr: false },
    });
    const r = await finalizeActiveSession();
    expect(r.ok).toBe(true);
    expect(r.session.totalVolume).toBe(50 * 12); // sets[0] 제외, sets[1] 만
  });

  it('blocks 비어있음 → totalVolume=0', async () => {
    await getOrCreateActiveSession();
    const r = await finalizeActiveSession();
    expect(r.ok).toBe(true);
    expect(r.session.totalVolume).toBe(0);
    expect(r.session.status).toBe('completed');
  });

  it('startTime null → durationMin=1 보장', async () => {
    await getOrCreateActiveSession(); // startTime=null
    const r = await finalizeActiveSession({ endTime: Date.now() });
    expect(r.ok).toBe(true);
    expect(r.session.durationMin).toBe(1); // (now - null=now) → 0분 → max(1)
  });

  it('두 번째 finalize 시도 → no_active_session (이미 completed)', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r1 = await finalizeActiveSession();
    expect(r1.ok).toBe(true);
    const r2 = await finalizeActiveSession();
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('no_active_session');
  });

  it('multi-운동 세션 — 모든 single 블록 합산', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    await addExerciseToActiveSession('squat', 'legs');
    await persistSetCommit({
      exerciseName: '벤치프레스', setIdx: 0,
      set: { weight: 60, reps: 10, done: true, pr: false },
    });
    await persistSetCommit({
      exerciseName: '스쿼트', setIdx: 0,
      set: { weight: 100, reps: 5, done: true, pr: false },
    });
    const r = await finalizeActiveSession();
    expect(r.ok).toBe(true);
    expect(r.session.totalVolume).toBe(60 * 10 + 100 * 5); // 1100
  });
});

describe('removeExerciseFromActiveSession', () => {
  it('matched single 제거 — blocks -1, removed=true', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    await addExerciseToActiveSession('lat_pulldown', 'back');
    const r = await removeExerciseFromActiveSession('bench_press');
    expect(r.removed).toBe(true);
    expect(r.session.blocks.length).toBe(1);
    expect(r.session.blocks[0].exerciseId).toBe('lat_pulldown');
    const stored = await db.sessions.get(r.session.id);
    expect(stored.blocks.length).toBe(1);
  });

  it('not_found', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    const r = await removeExerciseFromActiveSession('squat');
    expect(r.removed).toBe(false);
    expect(r.reason).toBe('not_found');
  });

  it('마지막 part 의 single 제거 시 tags 에서 part 제거', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    await addExerciseToActiveSession('lat_pulldown', 'back');
    const r = await removeExerciseFromActiveSession('bench_press');
    expect(r.session.tags).toEqual(['back']);
  });

  it('같은 part 다른 single 남으면 tags 유지', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    await addExerciseToActiveSession('incline_bench', 'chest');
    const r = await removeExerciseFromActiveSession('bench_press');
    expect(r.session.tags).toEqual(['chest']);
  });

  it('exerciseId 누락 시 throw', async () => {
    await expect(removeExerciseFromActiveSession()).rejects.toThrow(/exerciseId/);
  });
});

describe('syncIsAddedState', () => {
  function fakeListEl(ids) {
    const items = ids.map((id) => {
      const set = new Set();
      return {
        dataset: { ex: id },
        classList: {
          add: (c) => set.add(c),
          remove: (c) => set.delete(c),
          contains: (c) => set.has(c),
          _set: set,
        },
      };
    });
    return { querySelectorAll: () => items, _items: items };
  }

  it('active blocks 매칭 버튼만 is-added', async () => {
    await addExerciseToActiveSession('bench_press', 'chest');
    await addExerciseToActiveSession('lat_pulldown', 'back');
    const list = fakeListEl(['bench_press', 'incline_bench', 'lat_pulldown']);
    await syncIsAddedState(list);
    expect(list._items[0].classList._set.has('is-added')).toBe(true);
    expect(list._items[1].classList._set.has('is-added')).toBe(false);
    expect(list._items[2].classList._set.has('is-added')).toBe(true);
  });
});

describe('mountSessionView graceful', () => {
  it('document 없으면 skipped no-document', async () => {
    const origDoc = globalThis.document;
    delete globalThis.document;
    try {
      const r = await mountSessionView();
      expect(r.skipped).toBe('no-document');
    } finally {
      if (origDoc) globalThis.document = origDoc;
    }
  });
});

/* ───────────────── wireSessionShortcuts (SessionHeader §6-6 + Footer + §6-2) ───────────────── */

function makeShortcutBtn() {
  const listeners = {};
  return {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {} },
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    _fire(name) { (listeners[name] || []).forEach((fn) => fn({})); },
    _listeners: listeners,
  };
}

function makeShortcutDoc({ home = 2, end = true, addex = true, addexSheet = true } = {}) {
  const homeBtns = Array.from({ length: home }, () => makeShortcutBtn());
  const endBtn = end ? makeShortcutBtn() : null;
  const addexBtn = addex ? makeShortcutBtn() : null;
  // openActionSheet 가 의존하는 actionSheet/actionBackdrop/actionTitle/actionItems mock
  const sheet = { dataset: { open: 'false', kind: '', step: '1' }, style: {} };
  const backdrop = { dataset: { open: 'false' }, style: { opacity: '0', pointerEvents: 'none' } };
  const titleEl = { textContent: '' };
  const itemsEl = { innerHTML: '', _onSelect: null };
  // §6-2 — addex 시트 + 백드롭 (transform 토글 패턴)
  const addexSheetEl = addexSheet
    ? { dataset: { open: 'false' }, style: { transform: 'translateY(100%)' } }
    : null;
  const addexBackdropEl = addexSheet
    ? {
        dataset: { open: 'false' },
        style: { opacity: '0', pointerEvents: 'none' },
        addEventListener(name, fn) { (this._listeners = this._listeners || {})[name] = (this._listeners[name] || []).concat([fn]); },
        _fire(name) { (this._listeners?.[name] || []).forEach((fn) => fn({})); },
      }
    : null;
  return {
    body: { dataset: {} },
    querySelectorAll(sel) {
      if (sel === '.js-session-home') return homeBtns;
      return [];
    },
    getElementById(id) {
      if (id === 'sessionEndBtn') return endBtn;
      if (id === 'sessionAddexBtn') return addexBtn;
      if (id === 'sessionAddexSheet') return addexSheetEl;
      if (id === 'sessionAddexBackdrop') return addexBackdropEl;
      if (id === 'actionSheet') return sheet;
      if (id === 'actionBackdrop') return backdrop;
      if (id === 'actionTitle') return titleEl;
      if (id === 'actionItems') return itemsEl;
      return null;
    },
    _homeBtns: homeBtns,
    _endBtn: endBtn,
    _addexBtn: addexBtn,
    _addexSheet: addexSheetEl,
    _addexBackdrop: addexBackdropEl,
    _sheet: sheet,
    _itemsEl: itemsEl,
  };
}

describe('wireSessionShortcuts (§6-6 + §6-2)', () => {
  it('doc 부재 → wired 0 (graceful)', () => {
    const r = wireSessionShortcuts(null);
    expect(r.wired).toBe(0);
  });

  it('home/end/addex/backdrop 모두 존재 → wired = 2(home) + 1(end) + 1(addex) + 1(addexBackdrop)', () => {
    const doc = makeShortcutDoc({ home: 2, end: true, addex: true, addexSheet: true });
    const r = wireSessionShortcuts(doc);
    expect(r.wired).toBe(5);
    expect(doc.body.dataset.spaShortcuts).toBe('1');
  });

  it('idempotent — 두 번째 호출 wired 0 (spaShortcuts guard)', () => {
    const doc = makeShortcutDoc();
    expect(wireSessionShortcuts(doc).wired).toBe(5);
    expect(wireSessionShortcuts(doc).wired).toBe(0);
  });

  it('home click → window.location.hash = "#/home"', () => {
    const doc = makeShortcutDoc({ home: 1, end: false, addex: false });
    const origLocation = globalThis.window.location;
    globalThis.window.location = { hash: '' };
    try {
      wireSessionShortcuts(doc);
      doc._homeBtns[0]._fire('click');
      expect(globalThis.window.location.hash).toBe('#/home');
    } finally {
      if (origLocation) globalThis.window.location = origLocation;
      else delete globalThis.window.location;
    }
  });

  it('end click → openActionSheet (kind=session-end, items: finish/discard danger)', () => {
    const doc = makeShortcutDoc({ home: 0, end: true, addex: false });
    wireSessionShortcuts(doc);
    doc._endBtn._fire('click');
    expect(doc._sheet.dataset.open).toBe('true');
    expect(doc._sheet.dataset.kind).toBe('session-end');
    // items 두 개 (finish, discard) — innerHTML 에 data-action-id="finish" / "discard" 포함
    expect(doc._itemsEl.innerHTML).toContain('data-action-id="finish"');
    expect(doc._itemsEl.innerHTML).toContain('data-action-id="discard"');
  });

  it('addex click → sessionAddexSheet 슬라이드업 (transform translateY(0), spec §6-2)', () => {
    const doc = makeShortcutDoc({ home: 0, end: false, addex: true, addexSheet: true });
    wireSessionShortcuts(doc);
    doc._addexBtn._fire('click');
    expect(doc._addexSheet.dataset.open).toBe('true');
    expect(doc._addexSheet.style.transform).toBe('translateY(0)');
    expect(doc._addexBackdrop.dataset.open).toBe('true');
    expect(doc._addexBackdrop.style.opacity).toBe('1');
    expect(doc._addexBackdrop.style.pointerEvents).toBe('auto');
  });

  it('addex 백드롭 click → 시트 슬라이드다운 (외부 click 닫힘)', () => {
    const doc = makeShortcutDoc({ home: 0, end: false, addex: true, addexSheet: true });
    wireSessionShortcuts(doc);
    // 열린 상태 가정
    doc._addexSheet.dataset.open = 'true';
    doc._addexSheet.style.transform = 'translateY(0)';
    doc._addexBackdrop.dataset.open = 'true';
    doc._addexBackdrop.style.opacity = '1';
    doc._addexBackdrop.style.pointerEvents = 'auto';
    // 백드롭 click → 닫힘
    doc._addexBackdrop._fire('click');
    expect(doc._addexSheet.dataset.open).toBe('false');
    expect(doc._addexSheet.style.transform).toBe('translateY(100%)');
    expect(doc._addexBackdrop.dataset.open).toBe('false');
    expect(doc._addexBackdrop.style.opacity).toBe('0');
    expect(doc._addexBackdrop.style.pointerEvents).toBe('none');
  });
});

/* ───────────────── handleLeftSwipe / handleRightSwipe (spec §6-3-1) ───────────────── */

async function seedActiveWithBenchSets(sets) {
  await db.sessions.put({
    id: 'active-swipe-test',
    date: '2026-05-10',
    startTime: Date.now() - 10 * 60_000,
    endTime: null,
    blocks: [{ type: 'single', exerciseId: 'bench_press', sets }],
    tags: ['chest'],
    totalVolume: 0,
    totalCalories: 0,
    durationMin: 0,
    status: 'active',
  });
}

async function getActiveBenchSets() {
  const rows = await db.sessions.where('status').equals('active').toArray();
  expect(rows).toHaveLength(1);
  return rows[0].blocks[0].sets;
}

describe('handleLeftSwipe (spec §6-3-1)', () => {
  it('cur 유효 → sets[cur].done=true, preset:false', async () => {
    await seedActiveWithBenchSets([
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
    ]);
    await handleLeftSwipe();
    const sets = await getActiveBenchSets();
    expect(sets[1].done).toBe(true);
    expect(sets[1].preset).toBe(false);
    expect(sets[2].done).toBe(false);
    expect(sets).toHaveLength(3); // 마지막 set 아니므로 push 없음
  });

  it('cur === sets.length - 1 (마지막 set) → 새 set 추가 (preset:true 이전 값 카피)', async () => {
    await seedActiveWithBenchSets([
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
    ]);
    await handleLeftSwipe();
    const sets = await getActiveBenchSets();
    expect(sets).toHaveLength(3); // push 발생
    expect(sets[1].done).toBe(true);
    expect(sets[2]).toMatchObject({ weight: 60, reps: 10, done: false, preset: true });
  });

  it('cur === -1 (모두 done) → 새 set 1개 push 만', async () => {
    await seedActiveWithBenchSets([
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
    ]);
    await handleLeftSwipe();
    const sets = await getActiveBenchSets();
    expect(sets).toHaveLength(3);
    expect(sets[2]).toMatchObject({ weight: 60, reps: 10, done: false, preset: true });
  });

  it('active session 부재 → no-op (예외 없음)', async () => {
    // active 없음 — 그냥 통과
    await expect(handleLeftSwipe()).resolves.toBeUndefined();
  });

  /* (3) PR 통합 — spec §6-11 */
  it('첫 set commit (이전 PR 부재) → set.pr=true 마크 (PR 자동)', async () => {
    await seedActiveWithBenchSets([
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
    ]);
    await handleLeftSwipe();
    const sets = await getActiveBenchSets();
    expect(sets[0].done).toBe(true);
    expect(sets[0].pr).toBe(true);
  });

  it('새 e1RM 이 이전 PR 보다 낮음 → set.pr=false 유지', async () => {
    // 이전 PR 시드 (e1rm = 80 × (1 + 5/30) = 93.3)
    await db.prs.put({
      exerciseId: 'bench_press',
      weight: 80,
      reps: 5,
      e1rm: 93.3,
      date: '2026-04-01',
      sessionId: 'old',
      type: 'e1rm',
    });
    await seedActiveWithBenchSets([
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
    ]);
    await handleLeftSwipe();
    const sets = await getActiveBenchSets();
    expect(sets[0].done).toBe(true);
    expect(sets[0].pr).toBe(false); // 60 × (1+10/30) = 80 < 93.3 → not PR
  });

  it('새 e1RM 이 이전 PR 초과 → set.pr=true', async () => {
    await db.prs.put({
      exerciseId: 'bench_press',
      weight: 50,
      reps: 5,
      e1rm: 58.3,
      date: '2026-04-01',
      sessionId: 'old',
      type: 'e1rm',
    });
    await seedActiveWithBenchSets([
      { weight: 70, reps: 8, done: false, preset: true, pr: false },
    ]);
    await handleLeftSwipe();
    const sets = await getActiveBenchSets();
    // 70 × (1 + 8/30) = 88.7 > 58.3 → PR
    expect(sets[0].pr).toBe(true);
  });
});

describe('handleRightSwipe (spec §6-3-1)', () => {
  it('effectiveCur === 0 (첫 set) → 무시 (sets 변화 없음)', async () => {
    await seedActiveWithBenchSets([
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
    ]);
    await handleRightSwipe();
    const sets = await getActiveBenchSets();
    expect(sets[0].done).toBe(false);
    expect(sets[1].done).toBe(false);
  });

  it('cur === 2 → 직전 set (idx 1) done:false revert', async () => {
    await seedActiveWithBenchSets([
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
    ]);
    await handleRightSwipe();
    const sets = await getActiveBenchSets();
    expect(sets[0].done).toBe(true);
    expect(sets[1].done).toBe(false); // revert
    expect(sets[2].done).toBe(false);
  });

  it('모든 set done → effectiveCur = sets.length - 1 → 마지막 직전 set revert', async () => {
    await seedActiveWithBenchSets([
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
    ]);
    await handleRightSwipe();
    const sets = await getActiveBenchSets();
    expect(sets[1].done).toBe(false); // effectiveCur=2 → revert idx=1
    expect(sets[2].done).toBe(true); // 마지막 set 자체는 그대로
  });

  it('active session 부재 → no-op (예외 없음)', async () => {
    await expect(handleRightSwipe()).resolves.toBeUndefined();
  });
});

/* ───────────────── applyTapDelta (spec §6-3) ───────────────── */

async function seedActiveBench(weight, reps) {
  await db.sessions.put({
    id: 'active-tap-test',
    date: '2026-05-10',
    startTime: Date.now() - 10 * 60_000,
    endTime: null,
    blocks: [{
      type: 'single',
      exerciseId: 'bench_press', // barbell
      sets: [{ weight, reps, done: false, preset: true, pr: false }],
    }],
    tags: ['chest'],
    totalVolume: 0,
    totalCalories: 0,
    durationMin: 0,
    status: 'active',
  });
}

async function seedActiveDumbbell(weight, reps) {
  await db.sessions.put({
    id: 'active-tap-test',
    date: '2026-05-10',
    startTime: Date.now() - 10 * 60_000,
    endTime: null,
    blocks: [{
      type: 'single',
      exerciseId: 'dumbbell_curl', // dumbbell
      sets: [{ weight, reps, done: false, preset: true, pr: false }],
    }],
    tags: ['arms'],
    totalVolume: 0,
    totalCalories: 0,
    durationMin: 0,
    status: 'active',
  });
}

async function seedActiveBodyweight(reps) {
  await db.sessions.put({
    id: 'active-tap-test',
    date: '2026-05-10',
    startTime: Date.now() - 10 * 60_000,
    endTime: null,
    blocks: [{
      type: 'single',
      exerciseId: 'pull_up', // bodyweight
      sets: [{ weight: null, reps, done: false, preset: true, pr: false }],
    }],
    tags: ['back'],
    totalVolume: 0,
    totalCalories: 0,
    durationMin: 0,
    status: 'active',
  });
}

async function getActiveSet0() {
  const rows = await db.sessions.where('status').equals('active').toArray();
  return rows[0]?.blocks?.[0]?.sets?.[0];
}

describe('applyTapDelta (spec §6-3)', () => {
  it('barbell weight +1 → +5kg, preset:false', async () => {
    await seedActiveBench(60, 10);
    await applyTapDelta('weight', +1);
    const s = await getActiveSet0();
    expect(s.weight).toBe(65);
    expect(s.preset).toBe(false);
  });

  it('barbell weight -1 → -5kg', async () => {
    await seedActiveBench(60, 10);
    await applyTapDelta('weight', -1);
    const s = await getActiveSet0();
    expect(s.weight).toBe(55);
  });

  it('dumbbell weight +1 → +2kg', async () => {
    await seedActiveDumbbell(16, 10);
    await applyTapDelta('weight', +1);
    const s = await getActiveSet0();
    expect(s.weight).toBe(18);
  });

  it('dumbbell weight -1 → -2kg', async () => {
    await seedActiveDumbbell(16, 10);
    await applyTapDelta('weight', -1);
    const s = await getActiveSet0();
    expect(s.weight).toBe(14);
  });

  it('bodyweight weight 증감 불가 (no-op)', async () => {
    await seedActiveBodyweight(10);
    await applyTapDelta('weight', +1);
    const s = await getActiveSet0();
    expect(s.weight).toBeNull();
    expect(s.preset).toBe(true); // preset 그대로
  });

  it('reps +1', async () => {
    await seedActiveBench(60, 10);
    await applyTapDelta('reps', +1);
    const s = await getActiveSet0();
    expect(s.reps).toBe(11);
  });

  it('reps -1', async () => {
    await seedActiveBench(60, 10);
    await applyTapDelta('reps', -1);
    const s = await getActiveSet0();
    expect(s.reps).toBe(9);
  });

  it('weight 0 - 5 → 0 clamp (no-op, 변화 없음)', async () => {
    await seedActiveBench(0, 10);
    await applyTapDelta('weight', -1);
    const s = await getActiveSet0();
    expect(s.weight).toBe(0);
    expect(s.preset).toBe(true); // 변화 없으므로 preset 도 그대로
  });

  it('잘못된 field/sign → no-op', async () => {
    await seedActiveBench(60, 10);
    await applyTapDelta('garbage', +1);
    await applyTapDelta('weight', 0);
    await applyTapDelta('weight', 99);
    const s = await getActiveSet0();
    expect(s.weight).toBe(60);
    expect(s.reps).toBe(10);
  });

  it('active session 부재 → no-op (예외 없음)', async () => {
    await expect(applyTapDelta('weight', +1)).resolves.toBeUndefined();
  });
});

/* ───────────────── updateKeypadBuf (spec §6-3-2 순수함수) ───────────────── */

describe('updateKeypadBuf (spec §6-3-2)', () => {
  it("'' + '1' → '1'", () => {
    expect(updateKeypadBuf('', '1')).toBe('1');
  });
  it("'12' + '5' → '125'", () => {
    expect(updateKeypadBuf('12', '5')).toBe('125');
  });
  it("'12' + '.' → '12.'", () => {
    expect(updateKeypadBuf('12', '.')).toBe('12.');
  });
  it("'12.' + '.' → '12.' (한 번만)", () => {
    expect(updateKeypadBuf('12.', '.')).toBe('12.');
  });
  it("'' + '.' → '0.' (prefix)", () => {
    expect(updateKeypadBuf('', '.')).toBe('0.');
  });
  it("'12' + 'del' → '1'", () => {
    expect(updateKeypadBuf('12', 'del')).toBe('1');
  });
  it("'' + 'del' → '' (no-op)", () => {
    expect(updateKeypadBuf('', 'del')).toBe('');
  });
  it("'60' + '.' + '5' → '60.5' (소수점)", () => {
    expect(updateKeypadBuf(updateKeypadBuf('60', '.'), '5')).toBe('60.5');
  });
  it("invalid key → cur 그대로", () => {
    expect(updateKeypadBuf('12', 'x')).toBe('12');
    expect(updateKeypadBuf('12', '+')).toBe('12');
  });
});

/* ───────────────── applyKeypadValue (spec §6-3-2 통합) ───────────────── */

function makeFakeKeypadDoc({ mode, buf }) {
  const sheet = {
    dataset: { mode, buf, open: 'true' },
    style: { transform: 'translateY(0)' },
  };
  const backdrop = {
    dataset: { open: 'true' },
    style: { opacity: '1', pointerEvents: 'auto' },
  };
  return {
    getElementById(id) {
      if (id === 'keypadSheet') return sheet;
      if (id === 'keypadBackdrop') return backdrop;
      return null;
    },
    _sheet: sheet,
    _backdrop: backdrop,
  };
}

describe('applyKeypadValue (spec §6-3-2)', () => {
  it("weight '62.5' → set.weight 62.5 (소수 보존), 시트 close", async () => {
    await db.sessions.put({
      id: 'kp-test',
      date: '2026-05-10',
      startTime: Date.now() - 10 * 60_000,
      endTime: null,
      blocks: [{
        type: 'single',
        exerciseId: 'dumbbell_curl',
        sets: [{ weight: 16, reps: 10, done: false, preset: true, pr: false }],
      }],
      tags: ['arms'],
      totalVolume: 0,
      totalCalories: 0,
      durationMin: 0,
      status: 'active',
    });
    const doc = makeFakeKeypadDoc({ mode: 'weight', buf: '62.5' });
    await applyKeypadValue(doc);
    const rows = await db.sessions.where('status').equals('active').toArray();
    expect(rows[0].blocks[0].sets[0].weight).toBe(62.5);
    expect(rows[0].blocks[0].sets[0].preset).toBe(false);
    // 시트 close 확인
    expect(doc._sheet.dataset.open).toBe('false');
    expect(doc._sheet.style.transform).toBe('translateY(100%)');
    expect(doc._backdrop.dataset.open).toBe('false');
  });

  it("reps '12.7' → set.reps 13 (Math.round)", async () => {
    await db.sessions.put({
      id: 'kp-test',
      date: '2026-05-10',
      startTime: Date.now() - 10 * 60_000,
      endTime: null,
      blocks: [{
        type: 'single',
        exerciseId: 'bench_press',
        sets: [{ weight: 60, reps: 10, done: false, preset: true, pr: false }],
      }],
      tags: ['chest'],
      totalVolume: 0,
      totalCalories: 0,
      durationMin: 0,
      status: 'active',
    });
    const doc = makeFakeKeypadDoc({ mode: 'reps', buf: '12.7' });
    await applyKeypadValue(doc);
    const rows = await db.sessions.where('status').equals('active').toArray();
    expect(rows[0].blocks[0].sets[0].reps).toBe(13);
  });

  it("빈 buf → DB 변화 없음, 시트 close (취소와 동등)", async () => {
    await db.sessions.put({
      id: 'kp-test',
      date: '2026-05-10',
      startTime: Date.now() - 10 * 60_000,
      endTime: null,
      blocks: [{
        type: 'single',
        exerciseId: 'bench_press',
        sets: [{ weight: 60, reps: 10, done: false, preset: true, pr: false }],
      }],
      tags: ['chest'],
      totalVolume: 0,
      totalCalories: 0,
      durationMin: 0,
      status: 'active',
    });
    const doc = makeFakeKeypadDoc({ mode: 'weight', buf: '' });
    await applyKeypadValue(doc);
    const rows = await db.sessions.where('status').equals('active').toArray();
    expect(rows[0].blocks[0].sets[0].weight).toBe(60); // 그대로
    expect(doc._sheet.dataset.open).toBe('false');
  });

  it("active session 부재 → 시트 close 만 (예외 없음)", async () => {
    const doc = makeFakeKeypadDoc({ mode: 'weight', buf: '70' });
    await applyKeypadValue(doc);
    expect(doc._sheet.dataset.open).toBe('false');
  });
});

/* ───────────────── wireLongPress (spec §6-9 인프라 — f-1) ───────────────── */

function makeLpEl(kind) {
  const listeners = {};
  return {
    dataset: { longpress: kind },
    style: {},
    addEventListener(name, fn) { (listeners[name] = listeners[name] || []).push(fn); },
    _fire(name, evt) {
      const event = { ...evt, stopPropagation: evt?.stopPropagation || (() => {}) };
      (listeners[name] || []).forEach((fn) => fn(event));
    },
    _lpCancel: undefined,
    _listeners: listeners,
  };
}

function makeLpDoc(kinds) {
  const elements = kinds.map(makeLpEl);
  return {
    body: { dataset: {} },
    querySelectorAll(_sel) { return elements; },
    _elements: elements,
  };
}

describe('wireLongPress (spec §6-9)', () => {
  it("doc 부재 → wired 0 (graceful)", () => {
    const r = wireLongPress(null);
    expect(r.wired).toBe(0);
  });

  it("wired 수 = [data-longpress] 수", () => {
    const doc = makeLpDoc(['session-end', 'footer-exercise', 'footer-exercise']);
    const r = wireLongPress(doc);
    expect(r.wired).toBe(3);
  });

  it("idempotent — 두 번째 호출 wired 0 (spaLpHooked guard)", () => {
    const doc = makeLpDoc(['session-end']);
    expect(wireLongPress(doc).wired).toBe(1);
    expect(wireLongPress(doc).wired).toBe(0);
  });

  it("500ms hold → onTrigger { kind, target } 호출", () => {
    vi.useFakeTimers();
    try {
      const triggers = [];
      const doc = makeLpDoc(['session-end']);
      wireLongPress(doc, { onTrigger: (info) => triggers.push(info) });
      const el = doc._elements[0];
      el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
      vi.advanceTimersByTime(500);
      expect(triggers).toHaveLength(1);
      expect(triggers[0].kind).toBe('session-end');
      expect(triggers[0].target).toBe(el);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pointerup before 500ms → onTrigger 미호출 (취소)", () => {
    vi.useFakeTimers();
    try {
      const triggers = [];
      const doc = makeLpDoc(['session-end']);
      wireLongPress(doc, { onTrigger: (info) => triggers.push(info) });
      const el = doc._elements[0];
      el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
      vi.advanceTimersByTime(300);
      el._fire('pointerup', { clientX: 0, clientY: 0, pointerId: 1 });
      vi.advanceTimersByTime(500);
      expect(triggers).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pointermove > moveTolerance(8) → 취소", () => {
    vi.useFakeTimers();
    try {
      const triggers = [];
      const doc = makeLpDoc(['session-end']);
      wireLongPress(doc, { onTrigger: (info) => triggers.push(info) });
      const el = doc._elements[0];
      el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
      vi.advanceTimersByTime(100);
      el._fire('pointermove', { clientX: 10, clientY: 0, pointerId: 1 }); // 10 > 8
      vi.advanceTimersByTime(500);
      expect(triggers).toHaveLength(0);
      // scale 복원
      expect(el.style.transform).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it("pointermove ≤ moveTolerance(8) → 발화 유지", () => {
    vi.useFakeTimers();
    try {
      const triggers = [];
      const doc = makeLpDoc(['footer-exercise']);
      wireLongPress(doc, { onTrigger: (info) => triggers.push(info) });
      const el = doc._elements[0];
      el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
      vi.advanceTimersByTime(100);
      el._fire('pointermove', { clientX: 5, clientY: 5, pointerId: 1 }); // hypot(5,5) ≈ 7.07 < 8
      vi.advanceTimersByTime(500);
      expect(triggers).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pointercancel → 취소", () => {
    vi.useFakeTimers();
    try {
      const triggers = [];
      const doc = makeLpDoc(['session-end']);
      wireLongPress(doc, { onTrigger: (info) => triggers.push(info) });
      const el = doc._elements[0];
      el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
      vi.advanceTimersByTime(100);
      el._fire('pointercancel', {});
      vi.advanceTimersByTime(500);
      expect(triggers).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("custom holdMs 동작", () => {
    vi.useFakeTimers();
    try {
      const triggers = [];
      const doc = makeLpDoc(['session-end']);
      wireLongPress(doc, { onTrigger: (info) => triggers.push(info), holdMs: 300 });
      const el = doc._elements[0];
      el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
      vi.advanceTimersByTime(299);
      expect(triggers).toHaveLength(0);
      vi.advanceTimersByTime(2);
      expect(triggers).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pointerdown scale 0.98 + transition 적용", () => {
    const doc = makeLpDoc(['session-end']);
    wireLongPress(doc);
    const el = doc._elements[0];
    el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
    expect(el.style.transform).toBe('scale(0.98)');
    expect(el.style.transition).toBe('transform 120ms ease');
  });

  it("body.dataset.spaLpScroll 한 번만 등록", () => {
    const doc = makeLpDoc(['session-end']);
    expect(doc.body.dataset.spaLpScroll).toBeUndefined();
    wireLongPress(doc);
    expect(doc.body.dataset.spaLpScroll).toBe('1');
    // 두 번째 호출 — 그대로
    wireLongPress(doc);
    expect(doc.body.dataset.spaLpScroll).toBe('1');
  });
});

/* ───────────────── openActionSheet / closeActionSheet (spec §6-9 / §6-10 — f-2) ───────────────── */

function makeActionDoc() {
  const sheet = { dataset: { open: 'false', kind: '', spaHooked: '0' }, style: {} };
  const backdrop = { dataset: { open: 'false' }, style: { opacity: '0', pointerEvents: 'none' } };
  const titleEl = { textContent: '' };
  const itemsEl = { innerHTML: '', _onSelect: null };
  return {
    getElementById(id) {
      if (id === 'actionSheet') return sheet;
      if (id === 'actionBackdrop') return backdrop;
      if (id === 'actionTitle') return titleEl;
      if (id === 'actionItems') return itemsEl;
      return null;
    },
    _sheet: sheet,
    _backdrop: backdrop,
    _titleEl: titleEl,
    _itemsEl: itemsEl,
  };
}

describe('openActionSheet / closeActionSheet (spec §6-9 / §6-10)', () => {
  it("open : kind/title/items 갱신 + sheet/backdrop 보임", () => {
    const doc = makeActionDoc();
    openActionSheet(doc, {
      kind: 'session-end',
      title: '세션 옵션',
      items: [
        { id: 'finish', label: '종료' },
        { id: 'discard', label: '세션 삭제', danger: true },
      ],
    });
    expect(doc._sheet.dataset.open).toBe('true');
    expect(doc._sheet.dataset.kind).toBe('session-end');
    expect(doc._sheet.style.transform).toBe('translateY(0)');
    expect(doc._backdrop.dataset.open).toBe('true');
    expect(doc._backdrop.style.opacity).toBe('1');
    expect(doc._backdrop.style.pointerEvents).toBe('auto');
    expect(doc._titleEl.textContent).toBe('세션 옵션');
    expect(doc._itemsEl.innerHTML).toContain('data-action-id="finish"');
    expect(doc._itemsEl.innerHTML).toContain('data-action-id="discard"');
    expect(doc._itemsEl.innerHTML).toContain('var(--accent)'); // danger 항목 색
  });

  it("close : sheet 내려감 + backdrop opacity 0 + pointer-events none", () => {
    const doc = makeActionDoc();
    openActionSheet(doc, { kind: 'k', items: [{ id: 'x', label: 'X' }] });
    closeActionSheet(doc);
    expect(doc._sheet.dataset.open).toBe('false');
    expect(doc._sheet.style.transform).toBe('translateY(100%)');
    expect(doc._backdrop.dataset.open).toBe('false');
    expect(doc._backdrop.style.opacity).toBe('0');
    expect(doc._backdrop.style.pointerEvents).toBe('none');
  });

  it("open 두 번 — 두 번째 items 로 교체 (DOM 한 번 §6-10)", () => {
    const doc = makeActionDoc();
    openActionSheet(doc, { kind: 'a', items: [{ id: '1', label: 'first' }] });
    expect(doc._itemsEl.innerHTML).toContain('first');
    openActionSheet(doc, { kind: 'b', items: [{ id: '2', label: 'second' }] });
    expect(doc._itemsEl.innerHTML).not.toContain('first');
    expect(doc._itemsEl.innerHTML).toContain('second');
    expect(doc._sheet.dataset.kind).toBe('b');
  });

  it("onSelect 콜백 보관 (itemsEl._onSelect)", () => {
    const doc = makeActionDoc();
    const fn = () => {};
    openActionSheet(doc, { kind: 'a', items: [], onSelect: fn });
    expect(doc._itemsEl._onSelect).toBe(fn);
    // onSelect 미지정 → null
    openActionSheet(doc, { kind: 'a', items: [] });
    expect(doc._itemsEl._onSelect).toBeNull();
  });

  it("doc 부재 / element 부재 → no-op", () => {
    expect(() => openActionSheet(null, { kind: 'a', items: [] })).not.toThrow();
    expect(() => closeActionSheet(null)).not.toThrow();
    const partial = { getElementById: () => null };
    expect(() => openActionSheet(partial, { kind: 'a', items: [] })).not.toThrow();
    expect(() => closeActionSheet(partial)).not.toThrow();
  });

  it("danger 아닌 항목 — color #fff, weight 400", () => {
    const doc = makeActionDoc();
    openActionSheet(doc, {
      kind: 'a',
      items: [{ id: 'edit', label: '수정' }],
    });
    expect(doc._itemsEl.innerHTML).toContain('color:#fff');
    expect(doc._itemsEl.innerHTML).toContain('font-weight:400');
  });

  /* (f-4) step 보관 + items 보관 */
  it("open 시 dataset.step='1' 초기화 + items 보관 (f-4)", () => {
    const doc = makeActionDoc();
    const items = [{ id: 'edit', label: '수정' }, { id: 'delete', label: '삭제', danger: true }];
    openActionSheet(doc, { kind: 'a', items });
    expect(doc._sheet.dataset.step).toBe('1');
    expect(doc._itemsEl._items).toEqual(items);
  });

  it("이전 confirmId 있으면 open 시 클리어", () => {
    const doc = makeActionDoc();
    doc._sheet.dataset.confirmId = 'old-id';
    openActionSheet(doc, { kind: 'a', items: [] });
    expect(doc._sheet.dataset.confirmId).toBeUndefined();
  });

  it("두 번째 open — step 다시 '1' 로 (이전 step 2 잔존 회피)", () => {
    const doc = makeActionDoc();
    openActionSheet(doc, { kind: 'a', items: [{ id: 'x', label: 'X', danger: true }] });
    // 가상으로 step 2 로 전환되었다고 가정
    doc._sheet.dataset.step = '2';
    doc._sheet.dataset.confirmId = 'x';
    // 다시 open
    openActionSheet(doc, { kind: 'b', items: [{ id: 'y', label: 'Y' }] });
    expect(doc._sheet.dataset.step).toBe('1');
    expect(doc._sheet.dataset.confirmId).toBeUndefined();
  });
});

/* ───────────────── persistRemoveSet (spec §6-9 set-row delete) ───────────────── */

describe('persistRemoveSet (spec §6-9)', () => {
  async function seedActive(sets) {
    await db.sessions.put({
      id: 'rm-test',
      date: '2026-05-11',
      startTime: Date.now() - 10 * 60_000,
      endTime: null,
      blocks: [{ type: 'single', exerciseId: 'bench_press', sets }],
      tags: ['chest'],
      totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'active',
    });
  }

  it("setIdx 유효 → sets[idx] 제거 + 길이 -1", async () => {
    await seedActive([
      { weight: 60, reps: 10, done: true, preset: false, pr: false },
      { weight: 65, reps: 9, done: true, preset: false, pr: false },
      { weight: 70, reps: 8, done: false, preset: true, pr: false },
    ]);
    const r = await persistRemoveSet(1);
    expect(r.ok).toBe(true);
    const rows = await db.sessions.where('status').equals('active').toArray();
    const sets = rows[0].blocks[0].sets;
    expect(sets).toHaveLength(2);
    expect(sets[0].weight).toBe(60);
    expect(sets[1].weight).toBe(70); // idx 1 (65) 제거
  });

  it("마지막 set 제거 시 sets.length === 0 → block 자체 제거", async () => {
    await seedActive([
      { weight: 60, reps: 10, done: false, preset: true, pr: false },
    ]);
    const r = await persistRemoveSet(0);
    expect(r.ok).toBe(true);
    const rows = await db.sessions.where('status').equals('active').toArray();
    expect(rows[0].blocks).toHaveLength(0);
  });

  it("setIdx 범위 초과 → index_out_of_range", async () => {
    await seedActive([{ weight: 60, reps: 10, done: false, preset: true, pr: false }]);
    const r = await persistRemoveSet(5);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('index_out_of_range');
  });

  it("setIdx 음수/NaN → invalid_input", async () => {
    expect((await persistRemoveSet(-1)).reason).toBe('invalid_input');
    expect((await persistRemoveSet(NaN)).reason).toBe('invalid_input');
  });

  it("active session 부재 → no_active_session", async () => {
    const r = await persistRemoveSet(0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session');
  });
});

/* ───────────────── discardActiveSession (spec §6-9 session-end discard) ───────────────── */

describe('discardActiveSession (spec §6-9)', () => {
  it("active session 1건 → DB 에서 row 제거", async () => {
    await db.sessions.put({
      id: 'discard-test',
      date: '2026-05-11',
      startTime: Date.now() - 5 * 60_000,
      endTime: null,
      blocks: [],
      tags: [],
      totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'active',
    });
    const r = await discardActiveSession();
    expect(r.ok).toBe(true);
    expect(r.sessionId).toBe('discard-test');
    const rows = await db.sessions.where('status').equals('active').toArray();
    expect(rows).toHaveLength(0);
  });

  it("active session 부재 → no_active_session", async () => {
    const r = await discardActiveSession();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session');
  });
});

/* ───────────────── computeDropIdx (spec §6-9 / f-5-3b) ───────────────── */

function makePillsEl(rects) {
  const pills = rects.map((r) => ({
    dataset: { blockIdx: String(r.idx) },
    getBoundingClientRect: () => ({ left: r.left, width: r.width, right: r.left + r.width, top: 0, bottom: 40 }),
  }));
  return {
    querySelectorAll() { return pills; },
  };
}

describe('computeDropIdx (spec §6-9 / f-5-3b)', () => {
  // 3 pill : idx=0 [100,180], idx=1 [200,280], idx=2 [300,380]. width=80 → center 140/240/340
  const baseRects = [
    { idx: 0, left: 100, width: 80 },
    { idx: 1, left: 200, width: 80 },
    { idx: 2, left: 300, width: 80 },
  ];

  it("src=2 (가장 오른쪽) drag → clientX 230 (idx 1 center 좌측) → dst=1 (idx 1 자리)", () => {
    const pillsEl = makePillsEl(baseRects);
    expect(computeDropIdx(pillsEl, 230, 2)).toBe(1);
  });

  it("src=2 drag → clientX 250 (idx 1 center 우측) → dst=2 (idx 1 뒤 자리, splice 후 다시 같은 idx)", () => {
    const pillsEl = makePillsEl(baseRects);
    expect(computeDropIdx(pillsEl, 250, 2)).toBe(2);
  });

  it("src=0 (가장 왼쪽) drag → clientX 320 (idx 2 center 340 좌측) → dst=2", () => {
    const pillsEl = makePillsEl(baseRects);
    expect(computeDropIdx(pillsEl, 320, 0)).toBe(2);
  });

  it("src=0 drag → clientX 400 (idx 2 center 우측) → dst=3 (마지막 자리 뒤)", () => {
    const pillsEl = makePillsEl(baseRects);
    expect(computeDropIdx(pillsEl, 400, 0)).toBe(3);
  });

  it("pillsEl null → srcIdx 그대로", () => {
    expect(computeDropIdx(null, 100, 5)).toBe(5);
  });

  it("src 만 있으면 (다른 pill 없음) srcIdx 그대로", () => {
    const pillsEl = makePillsEl([{ idx: 0, left: 100, width: 80 }]);
    expect(computeDropIdx(pillsEl, 200, 0)).toBe(0);
  });
});

/* ───────────────── performBlockReorder (spec §6-9 / f-5-3c) ───────────────── */

describe('performBlockReorder (spec §6-9 / f-5-3c)', () => {
  async function seedActiveBlocks(exerciseIds) {
    const blocks = exerciseIds.map((id) => ({
      type: 'single',
      exerciseId: id,
      sets: [{ weight: 60, reps: 10, done: false, preset: true, pr: false }],
    }));
    await db.sessions.put({
      id: 'reorder-test',
      date: '2026-05-11',
      startTime: Date.now() - 10 * 60_000,
      endTime: null,
      blocks,
      tags: ['chest'],
      totalVolume: 0, totalCalories: 0, durationMin: 0,
      status: 'active',
    });
  }

  async function getActiveBlockOrder() {
    const rows = await db.sessions.where('status').equals('active').toArray();
    return rows[0].blocks.map((b) => b.exerciseId);
  }

  it("src=0 → dst=3 (마지막 자리 뒤) : 첫 번째를 마지막으로 이동", async () => {
    await seedActiveBlocks(['bench_press', 'incline_bench', 'decline_bench']);
    const r = await performBlockReorder(0, 3);
    expect(r.ok).toBe(true);
    expect(r.insertIdx).toBe(2); // splice 후 dst-1
    expect(await getActiveBlockOrder()).toEqual(['incline_bench', 'decline_bench', 'bench_press']);
  });

  it("src=2 → dst=0 (첫 자리 앞) : 마지막을 첫으로", async () => {
    await seedActiveBlocks(['bench_press', 'incline_bench', 'decline_bench']);
    const r = await performBlockReorder(2, 0);
    expect(r.ok).toBe(true);
    expect(r.insertIdx).toBe(0);
    expect(await getActiveBlockOrder()).toEqual(['decline_bench', 'bench_press', 'incline_bench']);
  });

  it("src=0 → dst=2 (가운데 자리) : 첫을 두 번째로", async () => {
    await seedActiveBlocks(['bench_press', 'incline_bench', 'decline_bench']);
    const r = await performBlockReorder(0, 2);
    expect(r.ok).toBe(true);
    expect(r.insertIdx).toBe(1);
    expect(await getActiveBlockOrder()).toEqual(['incline_bench', 'bench_press', 'decline_bench']);
  });

  it("src === dst → unchanged, DB 변경 없음", async () => {
    await seedActiveBlocks(['bench_press', 'incline_bench']);
    const r = await performBlockReorder(1, 1);
    expect(r.ok).toBe(true);
    expect(r.unchanged).toBe(true);
    expect(await getActiveBlockOrder()).toEqual(['bench_press', 'incline_bench']);
  });

  it("srcIdx 범위 초과 → src_out_of_range", async () => {
    await seedActiveBlocks(['bench_press']);
    const r = await performBlockReorder(5, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('src_out_of_range');
  });

  it("active session 부재 → no_active_session", async () => {
    const r = await performBlockReorder(0, 1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session');
  });

  it("잘못된 인자 → invalid_input", async () => {
    expect((await performBlockReorder(NaN, 0)).reason).toBe('invalid_input');
    expect((await performBlockReorder(0, NaN)).reason).toBe('invalid_input');
  });
});

/* ───────────────── wireLongPress cross-cancel (spec §6-9 — f-3a) ───────────────── */

describe('wireLongPress cross-cancel (f-3a)', () => {
  it("hold 발화 시 onTrigger 가 target._swipeReset 호출 가능 (외부 hook)", () => {
    vi.useFakeTimers();
    try {
      let resetCalled = 0;
      const triggers = [];
      const doc = makeLpDoc(['active-card']);
      // hold target 에 _swipeReset 미리 attach (wireSwipeHandlers 가 attach 한 것과 동일 인터페이스)
      const el = doc._elements[0];
      el._swipeReset = () => { resetCalled += 1; };
      wireLongPress(doc, {
        onTrigger: ({ kind, target }) => {
          // 사용자 코드 패턴 : 같은 element 의 _swipeReset 호출
          if (typeof target._swipeReset === 'function') target._swipeReset();
          triggers.push({ kind });
        },
      });
      el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
      vi.advanceTimersByTime(500);
      expect(triggers).toHaveLength(1);
      expect(resetCalled).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("move 8px+ 시 hold cancel — onTrigger 미호출, _swipeReset 미호출", () => {
    vi.useFakeTimers();
    try {
      let resetCalled = 0;
      const triggers = [];
      const doc = makeLpDoc(['active-card']);
      const el = doc._elements[0];
      el._swipeReset = () => { resetCalled += 1; };
      wireLongPress(doc, {
        onTrigger: ({ target }) => {
          if (typeof target._swipeReset === 'function') target._swipeReset();
          triggers.push(1);
        },
      });
      el._fire('pointerdown', { clientX: 0, clientY: 0, pointerId: 1, pointerType: 'touch', button: 0 });
      vi.advanceTimersByTime(100);
      el._fire('pointermove', { clientX: 70, clientY: 0, pointerId: 1 }); // 70px (60px swipe 시뮬)
      vi.advanceTimersByTime(500);
      expect(triggers).toHaveLength(0); // hold 미발화
      expect(resetCalled).toBe(0); // _swipeReset 미호출 (hold 발화 안 함)
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('resolveDotDisplay (D — dot preview 우선순위)', () => {
  it('done 세트 → 실제 값', () => {
    const sets = [{ weight: 90, reps: 8, done: true }];
    expect(resolveDotDisplay(sets, 0, 1, null)).toEqual({ text: '90·8', isPreview: false });
  });

  it('current 세트 → 실제 값', () => {
    const sets = [{ weight: 90, reps: 8, done: false, preset: true }];
    expect(resolveDotDisplay(sets, 0, 0, null)).toEqual({ text: '90·8', isPreview: false });
  });

  it('미입력 + 직전 세션 동일 세트번호 있음 → 직전 세션 값 preview', () => {
    const sets = [{ weight: 0, reps: 0, done: false, preset: true }, { weight: 0, reps: 0, done: false, preset: true }];
    const prev = [{ weight: 90, reps: 8 }, { weight: 95, reps: 6 }];
    expect(resolveDotDisplay(sets, 1, 0, prev)).toEqual({ text: '95·6', isPreview: true });
  });

  it('미입력 + 직전 세션 없음 + 직전 입력 세트 있음 → 직전 세트 값 preview', () => {
    const sets = [{ weight: 100, reps: 5, done: true }, { weight: 0, reps: 0, done: false, preset: true }];
    expect(resolveDotDisplay(sets, 1, 0, null)).toEqual({ text: '100·5', isPreview: true });
  });

  it('미입력 + 직전 세션·직전 세트 없음 + 자체 preset 값 → 그 값 preview', () => {
    const sets = [{ weight: 60, reps: 10, done: false, preset: true }, { weight: 60, reps: 10, done: false, preset: true }];
    expect(resolveDotDisplay(sets, 0, 1, null)).toEqual({ text: '60·10', isPreview: true });
  });

  it('값 전부 부재 → 대시', () => {
    const sets = [{ weight: null, reps: null, done: false }];
    expect(resolveDotDisplay(sets, 0, 1, null)).toEqual({ text: '—', isPreview: true });
  });

  it('직전 세션 우선순위가 직전 세트보다 높음', () => {
    const sets = [{ weight: 100, reps: 5, done: true }, { weight: 0, reps: 0, done: false, preset: true }];
    const prev = [{ weight: 90, reps: 8 }, { weight: 95, reps: 6 }];
    expect(resolveDotDisplay(sets, 1, 0, prev)).toEqual({ text: '95·6', isPreview: true });
  });
});

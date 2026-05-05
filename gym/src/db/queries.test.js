/**
 * queries.js 단위 테스트 (Wave 11.7.1).
 * 환경: vitest + fake-indexeddb (Node 환경에서 IndexedDB 시뮬).
 *
 * 범위:
 *   - settings: getUserSettings (없을 때 default), upsertUserSettings (merge·재호출 누적)
 *   - customExercises: create / update / delete / list 전체 CRUD
 *
 * 비대상 (별 wave):
 *   - sessions / weights / prs : 각각 11.6 / 11.7.2 / 11.7.3 에서 별 테스트
 *   - 날짜 유틸 : 호출 의존성 없는 순수 함수, exercises.test.js 패턴 따라 별 wave 도입 가능
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGymDB } from './schema.js';
import {
  DEFAULT_SETTINGS,
  getUserSettings,
  upsertUserSettings,
  createCustomExercise,
  updateCustomExercise,
  deleteCustomExercise,
  listCustomExercises,
  upsertWeight,
  getWeightByDate,
  getLatestWeight,
  listWeightsByRange,
  listAllWeights,
  deleteWeight,
  upsertPR,
  getBestE1RM,
  listPRsByExercise,
  listAllPRs,
  deletePR,
  deletePRsBySession,
  listExercisesForUser,
  toggleExerciseHidden,
  setExerciseOrderForPart,
  setExercisePartOverride,
} from './queries.js';

let testDB;

beforeEach(() => {
  // 테스트 격리 — 매 케이스 새 DB 인스턴스 + 사용자 해시 가짜.
  const dbName = `gym_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  testDB = createGymDB(dbName);
  globalThis.window = globalThis.window || {};
  globalThis.window.gymDB = testDB;
});

afterEach(async () => {
  await testDB.delete();
  globalThis.window.gymDB = null;
});

describe('settings', () => {
  it('row 가 없으면 DEFAULT_SETTINGS clone 반환 (DB write 없음)', async () => {
    const s = await getUserSettings();
    expect(s.key).toBe('userSettings');
    expect(s.weeklyGoal).toBe(DEFAULT_SETTINGS.weeklyGoal);
    expect(s.goalWeight).toBe(DEFAULT_SETTINGS.goalWeight);
    expect(s.hiddenExercises).toEqual([]);
    // DB 에는 실제로 row 가 없어야 함
    const row = await testDB.settings.get('userSettings');
    expect(row).toBeUndefined();
  });

  it('default 반환은 매 호출마다 새 객체 (배열·객체 동일 참조 금지)', async () => {
    const a = await getUserSettings();
    const b = await getUserSettings();
    expect(a).not.toBe(b);
    expect(a.hiddenExercises).not.toBe(b.hiddenExercises);
    expect(a.exerciseOrder).not.toBe(b.exerciseOrder);
  });

  it('upsertUserSettings patch 머지 — 첫 호출은 default + patch put', async () => {
    const merged = await upsertUserSettings({ goalWeight: 65, weeklyGoal: 5 });
    expect(merged.goalWeight).toBe(65);
    expect(merged.weeklyGoal).toBe(5);
    expect(merged.height).toBe(DEFAULT_SETTINGS.height);
    const row = await testDB.settings.get('userSettings');
    expect(row.goalWeight).toBe(65);
  });

  it('두 번째 upsert 는 누적 머지 (이전 patch 보존)', async () => {
    await upsertUserSettings({ goalWeight: 65 });
    const second = await upsertUserSettings({ weeklyGoal: 5 });
    expect(second.goalWeight).toBe(65);
    expect(second.weeklyGoal).toBe(5);
  });

  it('hiddenExercises 배열 patch — 새 배열로 완전 교체', async () => {
    await upsertUserSettings({ hiddenExercises: ['cable_curl'] });
    const second = await upsertUserSettings({ hiddenExercises: ['cable_curl', 'lunge'] });
    expect(second.hiddenExercises).toEqual(['cable_curl', 'lunge']);
  });

  it('upsertUserSettings 가 비객체 인자 → throw', async () => {
    await expect(upsertUserSettings(null)).rejects.toThrow('patch');
    await expect(upsertUserSettings('x')).rejects.toThrow('patch');
  });

  it('key 필드 변조 무시 — 항상 userSettings 로 강제', async () => {
    const merged = await upsertUserSettings({ key: 'malicious', goalWeight: 70 });
    expect(merged.key).toBe('userSettings');
  });
});

describe('customExercises', () => {
  it('createCustomExercise — id 자동 부여 + cust_ prefix', async () => {
    const row = await createCustomExercise({
      name: '내 푸시업',
      part: 'chest',
      equipment: 'bodyweight',
    });
    expect(row.id).toMatch(/^cust_/);
    expect(row.defaultSets).toBe(3);
    expect(row.defaultReps).toBe(10);
    expect(row.met).toBe(4.0);
    expect(typeof row.createdAt).toBe('number');
  });

  it('createCustomExercise — 명시 id 사용', async () => {
    const row = await createCustomExercise({
      id: 'my_squat',
      name: '내 스쿼트',
      part: 'legs',
      equipment: 'barbell',
      defaultSets: 5,
      defaultReps: 8,
      defaultWeight: 80,
      met: 5.5,
    });
    expect(row.id).toBe('my_squat');
    expect(row.defaultWeight).toBe(80);
  });

  it('createCustomExercise — 필수 필드 누락 throw', async () => {
    await expect(createCustomExercise({ name: 'a' })).rejects.toThrow('name·part·equipment');
    await expect(createCustomExercise({ name: 'a', part: 'chest' })).rejects.toThrow();
  });

  it('createCustomExercise — 잘못된 part throw', async () => {
    await expect(createCustomExercise({
      name: 'a', part: 'invalid', equipment: 'barbell',
    })).rejects.toThrow('PART_IDS');
  });

  it('createCustomExercise — 동일 id 두 번 add throw (Dexie unique key)', async () => {
    await createCustomExercise({ id: 'dup', name: 'a', part: 'chest', equipment: 'barbell' });
    await expect(createCustomExercise({
      id: 'dup', name: 'b', part: 'chest', equipment: 'barbell',
    })).rejects.toThrow();
  });

  it('updateCustomExercise — 부분 머지 + updatedAt 갱신', async () => {
    const created = await createCustomExercise({
      id: 'u1', name: '원본', part: 'chest', equipment: 'barbell',
    });
    const updated = await updateCustomExercise('u1', { name: '수정', defaultWeight: 50 });
    expect(updated.id).toBe('u1');
    expect(updated.name).toBe('수정');
    expect(updated.defaultWeight).toBe(50);
    expect(updated.part).toBe('chest'); // 미변경 필드 보존
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.createdAt);
  });

  it('updateCustomExercise — id 비매칭 throw', async () => {
    await expect(updateCustomExercise('no_such', { name: 'x' })).rejects.toThrow('없음');
  });

  it('updateCustomExercise — 잘못된 part throw', async () => {
    await createCustomExercise({ id: 'u2', name: 'a', part: 'chest', equipment: 'barbell' });
    await expect(updateCustomExercise('u2', { part: 'invalid' })).rejects.toThrow('PART_IDS');
  });

  it('deleteCustomExercise — 삭제 후 listCustomExercises 에서 사라짐', async () => {
    await createCustomExercise({ id: 'd1', name: 'a', part: 'chest', equipment: 'barbell' });
    await createCustomExercise({ id: 'd2', name: 'b', part: 'legs', equipment: 'barbell' });
    await deleteCustomExercise('d1');
    const list = await listCustomExercises();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('d2');
  });

  it('listCustomExercises — 부위 정의 순서 + 부위 내 한국어 사전순', async () => {
    await createCustomExercise({ id: 'a', name: '나무', part: 'legs', equipment: 'barbell' });
    await createCustomExercise({ id: 'b', name: '가지', part: 'legs', equipment: 'barbell' });
    await createCustomExercise({ id: 'c', name: '바람', part: 'chest', equipment: 'barbell' });
    const list = await listCustomExercises();
    // chest 가 legs 보다 앞 (PART_IDS 순서: chest, back, shoulder, legs, ...)
    expect(list.map(e => e.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('weights', () => {
  it('upsertWeight — 신규 row + height settings fallback (settings.height=173)', async () => {
    const row = await upsertWeight('2026-04-01', 73.2);
    expect(row).toEqual({ date: '2026-04-01', weight: 73.2, height: 173 });
    const stored = await testDB.weights.get('2026-04-01');
    expect(stored.weight).toBe(73.2);
  });

  it('upsertWeight — settings.height 변경 후 신규 row 는 새 height 반영', async () => {
    await upsertUserSettings({ height: 180 });
    const row = await upsertWeight('2026-04-02', 70);
    expect(row.height).toBe(180);
  });

  it('upsertWeight — 같은 날 재입력은 덮어쓰기', async () => {
    await upsertWeight('2026-04-03', 73, 173);
    await upsertWeight('2026-04-03', 72.5, 173);
    const row = await testDB.weights.get('2026-04-03');
    expect(row.weight).toBe(72.5);
    const all = await listAllWeights();
    expect(all).toHaveLength(1);
  });

  it('upsertWeight — height 명시 안 하면 기존 row height 보존', async () => {
    await upsertWeight('2026-04-04', 73, 175);
    const row2 = await upsertWeight('2026-04-04', 72);
    expect(row2.height).toBe(175);
  });

  it('upsertWeight — 양수 weight 강제 (0·음수·NaN throw)', async () => {
    await expect(upsertWeight('2026-04-05', 0)).rejects.toThrow('양수');
    await expect(upsertWeight('2026-04-05', -1)).rejects.toThrow('양수');
    await expect(upsertWeight('2026-04-05', NaN)).rejects.toThrow('양수');
  });

  it('upsertWeight — date 누락 throw', async () => {
    await expect(upsertWeight(null, 70)).rejects.toThrow('date');
    await expect(upsertWeight('', 70)).rejects.toThrow('date');
  });

  it('getWeightByDate — 없으면 null', async () => {
    expect(await getWeightByDate('2099-01-01')).toBeNull();
  });

  it('getLatestWeight — 빈 DB → null', async () => {
    expect(await getLatestWeight()).toBeNull();
  });

  it('getLatestWeight — date 내림차순 1건', async () => {
    await upsertWeight('2026-04-01', 73, 173);
    await upsertWeight('2026-04-15', 72, 173);
    await upsertWeight('2026-04-08', 72.5, 173);
    const latest = await getLatestWeight();
    expect(latest.date).toBe('2026-04-15');
    expect(latest.weight).toBe(72);
  });

  it('listWeightsByRange — 경계 포함, date 오름차순', async () => {
    await upsertWeight('2026-03-31', 74, 173);
    await upsertWeight('2026-04-01', 73, 173);
    await upsertWeight('2026-04-10', 72.5, 173);
    await upsertWeight('2026-04-30', 72, 173);
    await upsertWeight('2026-05-01', 71.5, 173);
    const rows = await listWeightsByRange('2026-04-01', '2026-04-30');
    expect(rows.map(r => r.date)).toEqual(['2026-04-01', '2026-04-10', '2026-04-30']);
  });

  it('listAllWeights — date 오름차순', async () => {
    await upsertWeight('2026-04-15', 72, 173);
    await upsertWeight('2026-04-01', 73, 173);
    await upsertWeight('2026-04-08', 72.5, 173);
    const all = await listAllWeights();
    expect(all.map(r => r.date)).toEqual(['2026-04-01', '2026-04-08', '2026-04-15']);
  });

  it('deleteWeight — 삭제 후 listAllWeights 에서 사라짐', async () => {
    await upsertWeight('2026-04-01', 73, 173);
    await upsertWeight('2026-04-02', 72, 173);
    await deleteWeight('2026-04-01');
    const all = await listAllWeights();
    expect(all).toHaveLength(1);
    expect(all[0].date).toBe('2026-04-02');
  });

  it('deleteWeight — date 누락 throw', async () => {
    await expect(deleteWeight()).rejects.toThrow('date');
    await expect(deleteWeight('')).rejects.toThrow('date');
  });
});

describe('prs', () => {
  const samplePR = (over = {}) => ({
    exerciseId: 'bench_press',
    type: 'e1rm',
    weight: 60,
    reps: 10,
    e1rm: 80,
    date: '2026-04-01',
    sessionId: 'sess-1',
    ...over,
  });

  it('upsertPR — 새 row 추가', async () => {
    const row = await upsertPR(samplePR());
    expect(row.exerciseId).toBe('bench_press');
    expect(row.type).toBe('e1rm');
    const all = await listAllPRs();
    expect(all).toHaveLength(1);
  });

  it('upsertPR — 같은 [exerciseId+type] 두 번째 호출은 덮어쓰기', async () => {
    await upsertPR(samplePR({ e1rm: 80 }));
    await upsertPR(samplePR({ e1rm: 90, weight: 65, reps: 9 }));
    const all = await listAllPRs();
    expect(all).toHaveLength(1);
    expect(all[0].e1rm).toBe(90);
  });

  it('upsertPR — exerciseId 누락 throw', async () => {
    await expect(upsertPR({ type: 'e1rm', weight: 60, reps: 10, e1rm: 80 })).rejects.toThrow('exerciseId');
  });

  it('upsertPR — e1rm·weight·reps 비숫자 throw', async () => {
    await expect(upsertPR(samplePR({ e1rm: 'x' }))).rejects.toThrow();
    await expect(upsertPR(samplePR({ weight: NaN }))).rejects.toThrow();
  });

  it('upsertPR — type 누락 시 e1rm default', async () => {
    const { type: _drop, ...rest } = samplePR();
    const row = await upsertPR(rest);
    expect(row.type).toBe('e1rm');
  });

  it('getBestE1RM — 없으면 null', async () => {
    expect(await getBestE1RM('squat')).toBeNull();
  });

  it('getBestE1RM — 있는 운동 row 반환', async () => {
    await upsertPR(samplePR());
    const row = await getBestE1RM('bench_press');
    expect(row.e1rm).toBe(80);
  });

  it('listPRsByExercise — 같은 운동 모든 type', async () => {
    await upsertPR(samplePR()); // e1rm
    await upsertPR(samplePR({ type: 'weight', e1rm: 0, weight: 100, reps: 1 }));
    const list = await listPRsByExercise('bench_press');
    expect(list).toHaveLength(2);
  });

  it('listPRsByExercise — 다른 운동 미포함', async () => {
    await upsertPR(samplePR());
    await upsertPR(samplePR({ exerciseId: 'squat' }));
    const list = await listPRsByExercise('bench_press');
    expect(list).toHaveLength(1);
  });

  it('deletePR — type default e1rm 으로 삭제', async () => {
    await upsertPR(samplePR());
    await deletePR('bench_press');
    expect(await getBestE1RM('bench_press')).toBeNull();
  });

  it('deletePR — exerciseId 누락 throw', async () => {
    await expect(deletePR()).rejects.toThrow('exerciseId');
  });

  it('deletePRsBySession — 같은 sessionId 의 모든 row 제거', async () => {
    await upsertPR(samplePR({ sessionId: 'sess-1' }));
    await upsertPR(samplePR({ exerciseId: 'squat', sessionId: 'sess-1' }));
    await upsertPR(samplePR({ exerciseId: 'deadlift', sessionId: 'sess-2' }));
    const removed = await deletePRsBySession('sess-1');
    expect(removed).toBe(2);
    const all = await listAllPRs();
    expect(all).toHaveLength(1);
    expect(all[0].sessionId).toBe('sess-2');
  });

  it('deletePRsBySession — sessionId 누락 throw', async () => {
    await expect(deletePRsBySession()).rejects.toThrow('sessionId');
  });
});

describe('listExercisesForUser', () => {
  it('part 미지정 → 모든 BUILTIN + custom 머지', async () => {
    await createCustomExercise({ id: 'cust_1', name: '내 운동', part: 'chest', equipment: 'barbell' });
    const list = await listExercisesForUser();
    // BUILTIN_EXERCISES 41 + custom 1
    expect(list.length).toBeGreaterThan(40);
    const cust = list.find(e => e.id === 'cust_1');
    expect(cust).toBeTruthy();
    expect(cust.custom).toBe(true);
    const builtin = list.find(e => e.id === 'bench_press');
    expect(builtin.custom).toBe(false);
  });

  it('part 지정 → 그 부위만 (custom + builtin)', async () => {
    await createCustomExercise({ id: 'cust_chest', name: '내 가슴', part: 'chest', equipment: 'barbell' });
    await createCustomExercise({ id: 'cust_back', name: '내 등', part: 'back', equipment: 'barbell' });
    const chest = await listExercisesForUser({ part: 'chest' });
    chest.forEach(e => expect(e.part).toBe('chest'));
    expect(chest.find(e => e.id === 'cust_chest')).toBeTruthy();
    expect(chest.find(e => e.id === 'cust_back')).toBeFalsy();
  });

  it('hidden 적용 — includeHidden=false 면 제외', async () => {
    await upsertUserSettings({ hiddenExercises: ['bench_press'] });
    const visible = await listExercisesForUser({ part: 'chest', includeHidden: false });
    expect(visible.find(e => e.id === 'bench_press')).toBeFalsy();
    const all = await listExercisesForUser({ part: 'chest', includeHidden: true });
    const benchInAll = all.find(e => e.id === 'bench_press');
    expect(benchInAll).toBeTruthy();
    expect(benchInAll.hidden).toBe(true);
  });

  it('exercisePartOverride — bench_press 가 chest → back 으로', async () => {
    await upsertUserSettings({ exercisePartOverride: { bench_press: 'back' } });
    const back = await listExercisesForUser({ part: 'back' });
    expect(back.find(e => e.id === 'bench_press')).toBeTruthy();
    const chest = await listExercisesForUser({ part: 'chest' });
    expect(chest.find(e => e.id === 'bench_press')).toBeFalsy();
  });

  it('exerciseOrder — order 명시된 운동은 그 순서로', async () => {
    await upsertUserSettings({
      exerciseOrder: { chest: ['dumbbell_fly', 'bench_press'] },
    });
    const chest = await listExercisesForUser({ part: 'chest' });
    const ids = chest.map(e => e.id);
    expect(ids.indexOf('dumbbell_fly')).toBeLessThan(ids.indexOf('bench_press'));
  });

  it('weightIncrement 합성', async () => {
    const list = await listExercisesForUser({ part: 'chest' });
    const bench = list.find(e => e.id === 'bench_press');
    expect(bench.weightIncrement).toBe(5);
    const fly = list.find(e => e.id === 'dumbbell_fly');
    expect(fly.weightIncrement).toBe(2);
  });
});

describe('toggleExerciseHidden', () => {
  it('첫 토글 → hiddenExercises 에 추가', async () => {
    const next = await toggleExerciseHidden('bench_press');
    expect(next).toContain('bench_press');
  });

  it('두 번째 토글 → 제거', async () => {
    await toggleExerciseHidden('bench_press');
    const next = await toggleExerciseHidden('bench_press');
    expect(next).not.toContain('bench_press');
  });

  it('exerciseId 누락 throw', async () => {
    await expect(toggleExerciseHidden()).rejects.toThrow('exerciseId');
  });
});

describe('setExerciseOrderForPart', () => {
  it('정상 — settings.exerciseOrder[part] 갱신', async () => {
    const next = await setExerciseOrderForPart('chest', ['bench_press', 'incline_bench']);
    expect(next).toEqual(['bench_press', 'incline_bench']);
    const s = await getUserSettings();
    expect(s.exerciseOrder.chest).toEqual(['bench_press', 'incline_bench']);
  });

  it('part 누락 throw', async () => {
    await expect(setExerciseOrderForPart(null, [])).rejects.toThrow('part');
  });

  it('orderedIds 가 배열이 아니면 throw', async () => {
    await expect(setExerciseOrderForPart('chest', 'x')).rejects.toThrow('배열');
  });
});

describe('setExercisePartOverride', () => {
  it('정상 — settings.exercisePartOverride[id] 갱신', async () => {
    const next = await setExercisePartOverride('bench_press', 'back');
    expect(next.bench_press).toBe('back');
  });

  it('잘못된 part throw', async () => {
    await expect(setExercisePartOverride('bench_press', 'invalid')).rejects.toThrow('PART_IDS');
  });

  it('exerciseId 누락 throw', async () => {
    await expect(setExercisePartOverride(null, 'back')).rejects.toThrow('exerciseId');
  });
});

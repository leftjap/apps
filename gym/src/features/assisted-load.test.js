import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createGymDB } from '../db/schema.js';
import { primeCustomExerciseCache } from '../db/exercises.js';
import { summarizeSession } from './session-summary.js';
import { sessionToWorkoutEntry } from './stats.js';
import { computeVolSegments, persistSetCommit, dumpActiveSessionFromState, finalizeActiveSession, applyTapDelta, handleRightSwipe, handleLeftSwipe, persistKeypadEdit, externalVolumeDuringExerciseCountUp } from './session.js';
import { persistSetPR } from './session-pr.js';
import { currentBodyWeight, snapshotAssistance, estimatedSetVolume, assistanceReduction } from '../services/assisted-load.js';

const exerciseId = 'cust-assisted-chin';
function session(set) {
  return { id: 'old', date: '2026-10-24', status: 'completed', totalVolume: 400,
    tags: ['back'], blocks: [{ type: 'single', exerciseId, sets: [set] }] };
}
beforeEach(() => primeCustomExerciseCache([{ id: exerciseId, name: '어시스티드 친', equipment: 'barbell', part: 'back' }]));

describe('assisted load display and persistence semantics', () => {
  it('calculates 73 minus 40 times 10 and labels it as an estimate', () => {
    const set = { weight: 40, reps: 10, done: true, weightMode: 'assistance', bodyWeightKg: 73 };
    const result = summarizeSession(session(set));
    expect(result.exercises[0].volume).toBe('추정 330kg');
    expect(result.volume).toBe('0');
    expect(set.weight).toBe(40);
    expect(computeVolSegments([set], 0).planned).toBe(330);
  });

  it('keeps legacy assistance records without inventing a historical bodyweight or PR', () => {
    const original = session({ weight: 40, reps: 10, done: true, pr: true });
    const copy = structuredClone(original);
    const entry = sessionToWorkoutEntry(original);
    expect(entry.vol).toBe(0);
    expect(entry.pr).toBe(0);
    expect(entry.ex[0].kind).toBe('assisted-unknown');
    expect(entry.ex[0].s).toContain('당시 체중 없음');
    expect(original).toEqual(copy);
  });
});

describe('assisted record lifecycle in an isolated IndexedDB', () => {
  let db;
  beforeEach(async () => {
    db = createGymDB(`test-assisted-${Math.random().toString(36).slice(2)}`);
    await db.open();
    globalThis.window = globalThis.window || {};
    window.gymDB = db;
    await db.customExercises.put({ id: exerciseId, name: '어시스티드 친', part: 'back', equipment: 'barbell' });
    await db.sessions.put({ ...session({ weight: 40, reps: 10, done: false }), status: 'active' });
  });
  afterEach(async () => { await db.delete(); delete window.gymDB; });

  it('keeps its bodyweight snapshot through the legacy periodic dump and finalization', async () => {
    expect((await persistSetCommit({ exerciseName: '어시스티드 친', setIdx: 0, set: { weight: 40, reps: 10 } })).ok).toBe(true);
    let row = await db.sessions.get('old');
    expect(row.blocks[0].sets[0].bodyWeightKg).toBe(73);
    await dumpActiveSessionFromState({ exerciseName: '어시스티드 친', sets: [{ weight: 40, reps: 10, done: true }] });
    row = await db.sessions.get('old');
    expect(row.blocks[0].sets[0].bodyWeightKg).toBe(73);
    expect(row.blocks[0].sets[0].weightMode).toBe('assistance');
    await finalizeActiveSession();
    row = await db.sessions.get('old');
    expect(row.totalVolume).toBe(0);
    expect(summarizeSession(row).exercises[0].volume).toBe('추정 330kg');
  });

  it('captures bodyweight on tap edits before the set is committed', async () => {
    await applyTapDelta('weight', 1);
    const set = (await db.sessions.get('old')).blocks[0].sets[0];
    expect(set.weight).toBe(45);
    expect(set.bodyWeightKg).toBe(73);
    expect(estimatedSetVolume(set)).toBe(280);
  });

  it('keeps unknown historical bodyweight when undoing, editing, and recommitting a legacy set', async () => {
    const row = await db.sessions.get('old');
    row.blocks[0].sets = [{ weight: 40, reps: 10, done: true }, { weight: 40, reps: 10, done: false, preset: true }];
    await db.sessions.put(row);
    await handleRightSwipe();
    await persistKeypadEdit({ exerciseName: '어시스티드 친', setIdx: 0, field: 'weight', value: 35 });
    await handleLeftSwipe();
    const saved = (await db.sessions.get('old')).blocks[0].sets[0];
    expect(saved.weight).toBe(35);
    expect(saved.bodyWeightKg).toBeUndefined();
    expect(estimatedSetVolume(saved)).toBe(null);
  });

  it('keeps the ordinary volume header unchanged throughout an assisted count-up', () => {
    for (const remaining of [330, 200, 0]) {
      expect(externalVolumeDuringExerciseCountUp(0, remaining, true)).toBe(0);
      expect(externalVolumeDuringExerciseCountUp(500, remaining, true)).toBe(500);
    }
    expect(externalVolumeDuringExerciseCountUp(900, 400, false)).toBe(500);
    expect(externalVolumeDuringExerciseCountUp(900, 0, false)).toBe(900);
  });

  it('does not store an ordinary max-weight PR for assistance', async () => {
    const result = await persistSetPR({ exerciseName: '어시스티드 친', weight: 40, reps: 10 });
    expect(result.isPR).toBe(false);
    expect(await db.prs.count()).toBe(0);
  });

  it('freezes old snapshots while a new set can use a later actual weigh-in', () => {
    const old = snapshotAssistance({ weight: 40, reps: 10 }, exerciseId, 73);
    const same = snapshotAssistance(old, exerciseId, 80);
    expect(estimatedSetVolume(same)).toBe(330);
    expect(estimatedSetVolume(snapshotAssistance({ weight: 40, reps: 10 }, exerciseId, 80))).toBe(400);
    const weights = [{ date: '2026-10-23', weight: 72 }, { date: '2026-10-25', weight: 80 }];
    expect(currentBodyWeight(weights, '2026-10-24')).toBe(73);
    expect(currentBodyWeight(weights, '2026-10-25')).toBe(80);
    expect(weights).toHaveLength(2);
    expect(assistanceReduction({ weight: 45, reps: 10 }, [{ weight: 40, reps: 10 }])).toBe(null);
    expect(assistanceReduction({ weight: 35, reps: 10 }, [{ weight: 40, reps: 10 }])).toBe(5);
  });
});

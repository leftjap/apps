/**
 * profile.js 단위 테스트 (Wave 11.7.6).
 * fake-indexeddb + jsdom 미사용 (DOM 함수는 mock root 주입).
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGymDB } from '../db/schema.js';
import {
  PROFILE_FIELD_KEYS,
  FIELD_DEFS,
  editProfileField,
  renderProfileTab,
} from './profile.js';
import { upsertUserSettings, getUserSettings } from '../db/queries.js';

let testDB;

beforeEach(() => {
  const dbName = `gym_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  testDB = createGymDB(dbName);
  globalThis.window = globalThis.window || {};
  globalThis.window.gymDB = testDB;
});

afterEach(async () => {
  await testDB.delete();
  globalThis.window.gymDB = null;
});

/** 가짜 DOM root — querySelector 만 mock (간단 케이스). 실 DOM 검증은 e2e. */
function makeFakeRoot(fields) {
  const map = new Map();
  for (const key of Object.keys(fields)) {
    const valEl = { textContent: fields[key], appendChild: vi.fn(), querySelector: () => null };
    const btn = { querySelector: (sel) => sel === '.f-val' ? valEl : null };
    map.set(`[data-field="${key}"]`, btn);
  }
  return {
    querySelector(sel) { return map.get(sel) || null; },
  };
}

describe('PROFILE_FIELD_KEYS / FIELD_DEFS', () => {
  it('4 필드 정의', () => {
    expect(PROFILE_FIELD_KEYS).toEqual(['height', 'birthyear', 'goal-weight', 'weekly-goal']);
  });
  it('각 필드 setting / parse / format 보유', () => {
    for (const key of PROFILE_FIELD_KEYS) {
      const def = FIELD_DEFS[key];
      expect(typeof def.setting).toBe('string');
      expect(typeof def.parse).toBe('function');
      expect(typeof def.format).toBe('function');
    }
  });
  it('frozen', () => {
    expect(Object.isFrozen(FIELD_DEFS)).toBe(true);
    expect(Object.isFrozen(PROFILE_FIELD_KEYS)).toBe(true);
  });
});

describe('FIELD_DEFS.height parse / format', () => {
  const def = FIELD_DEFS.height;
  it('정상 입력 → 정수 반올림', () => {
    expect(def.parse('173')).toBe(173);
    expect(def.parse('173.7')).toBe(174); // round
  });
  it('범위 밖 → null', () => {
    expect(def.parse('50')).toBeNull();
    expect(def.parse('300')).toBeNull();
    expect(def.parse('abc')).toBeNull();
  });
  it('format → "173 cm"', () => {
    expect(def.format(173)).toBe('173 cm');
    expect(def.format(null)).toBe('—');
  });
});

describe('FIELD_DEFS.birthyear parse / format', () => {
  const def = FIELD_DEFS.birthyear;
  it('정상 1900~2100', () => {
    expect(def.parse('1976')).toBe(1976);
    expect(def.parse('2026')).toBe(2026);
  });
  it('범위 밖 → null', () => {
    expect(def.parse('1899')).toBeNull();
    expect(def.parse('2101')).toBeNull();
  });
});

describe('FIELD_DEFS.goal-weight parse / format', () => {
  const def = FIELD_DEFS['goal-weight'];
  it('정상 → 소수점 1자리', () => {
    expect(def.parse('69')).toBe(69);
    expect(def.parse('69.45')).toBeCloseTo(69.5, 5);
    expect(def.parse('69,4')).toBe(69.4); // comma 정규화
  });
  it('format → "69 kg"', () => {
    expect(def.format(69)).toBe('69 kg');
  });
});

describe('FIELD_DEFS.weekly-goal parse / format', () => {
  const def = FIELD_DEFS['weekly-goal'];
  it('1~7 정상', () => {
    expect(def.parse('4')).toBe(4);
    expect(def.parse('1')).toBe(1);
    expect(def.parse('7')).toBe(7);
  });
  it('범위 밖 → null', () => {
    expect(def.parse('0')).toBeNull();
    expect(def.parse('8')).toBeNull();
  });
});

describe('renderProfileTab', () => {
  it('settings 없으면 default 적용', async () => {
    const fakeRoot = makeFakeRoot({
      height: '', birthyear: '', 'goal-weight': '', 'weekly-goal': '',
    });
    const r = await renderProfileTab(fakeRoot);
    expect(r.rendered).toBe(true);
    expect(r.settingsSnapshot.weeklyGoal).toBe(4);
    expect(r.settingsSnapshot.goalWeight).toBe(69);
    expect(r.settingsSnapshot.height).toBe(173);
  });

  it('settings 갱신 후 적용', async () => {
    await upsertUserSettings({ height: 180, weeklyGoal: 5, goalWeight: 65, birthYear: 1990 });
    const fakeRoot = makeFakeRoot({
      height: '', birthyear: '', 'goal-weight': '', 'weekly-goal': '',
    });
    const r = await renderProfileTab(fakeRoot);
    expect(r.settingsSnapshot.height).toBe(180);
    expect(r.settingsSnapshot.weeklyGoal).toBe(5);
    expect(r.settingsSnapshot.goalWeight).toBe(65);
    expect(r.settingsSnapshot.birthYear).toBe(1990);
  });
});

describe('editProfileField', () => {
  it('정상 입력 → upsertUserSettings + 재렌더', async () => {
    const fakeRoot = makeFakeRoot({
      height: '', birthyear: '', 'goal-weight': '', 'weekly-goal': '',
    });
    const r = await editProfileField('height', fakeRoot, () => '180');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(180);
    const s = await getUserSettings();
    expect(s.height).toBe(180);
  });

  it('cancel (null 반환) → no-op', async () => {
    const fakeRoot = makeFakeRoot({
      height: '', birthyear: '', 'goal-weight': '', 'weekly-goal': '',
    });
    const r = await editProfileField('height', fakeRoot, () => null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('cancelled');
  });

  it('잘못된 입력 → invalid_input', async () => {
    const fakeRoot = makeFakeRoot({
      height: '', birthyear: '', 'goal-weight': '', 'weekly-goal': '',
    });
    const r = await editProfileField('weekly-goal', fakeRoot, () => '99');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_input');
    const s = await getUserSettings();
    expect(s.weeklyGoal).toBe(4); // default 보존
  });

  it('알 수 없는 fieldKey → unknown_field', async () => {
    const r = await editProfileField('unknown', null, () => '1');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unknown_field');
  });

  it('goal-weight 갱신 → settings.goalWeight 변경', async () => {
    const fakeRoot = makeFakeRoot({
      height: '', birthyear: '', 'goal-weight': '', 'weekly-goal': '',
    });
    const r = await editProfileField('goal-weight', fakeRoot, () => '67.5');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(67.5);
    const s = await getUserSettings();
    expect(s.goalWeight).toBe(67.5);
  });
});

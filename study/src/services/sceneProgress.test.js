import { describe, it, expect } from 'vitest';
import { getSceneShadow, setSceneShadow, clearSceneShadow } from './sceneProgress.js';

// Dexie meta 모킹 — { key, value, at } row, key 기반 get/put.
function makeDb() {
  const store = new Map();
  return {
    _store: store,
    meta: {
      async get(k) { return store.get(k) ?? undefined; },
      async put(row) { store.set(row.key, row); },
    },
  };
}

describe('sceneProgress — 씬별 쉐도잉 진행 durable 저장 (1시간 TTL 과 분리)', () => {
  it('미저장 씬 → 0', async () => {
    const db = makeDb();
    expect(await getSceneShadow(db, 'scene-1')).toBe(0);
  });

  it('set 후 get → 카운트 복원 (다음 세션 재진입 시 유지)', async () => {
    const db = makeDb();
    await setSceneShadow(db, 'scene-1', 4);
    expect(await getSceneShadow(db, 'scene-1')).toBe(4);
  });

  it('씬별 독립 — 한 씬 저장이 다른 씬에 영향 없음', async () => {
    const db = makeDb();
    await setSceneShadow(db, 'scene-1', 3);
    await setSceneShadow(db, 'scene-2', 5);
    expect(await getSceneShadow(db, 'scene-1')).toBe(3);
    expect(await getSceneShadow(db, 'scene-2')).toBe(5);
  });

  it('clear → 해당 씬만 제거, 나머지 유지', async () => {
    const db = makeDb();
    await setSceneShadow(db, 'scene-1', 3);
    await setSceneShadow(db, 'scene-2', 5);
    await clearSceneShadow(db, 'scene-1');
    expect(await getSceneShadow(db, 'scene-1')).toBe(0);
    expect(await getSceneShadow(db, 'scene-2')).toBe(5);
  });

  it('db/sceneId 부재 시 안전 (throw 없음, 0)', async () => {
    expect(await getSceneShadow(null, 'x')).toBe(0);
    expect(await getSceneShadow(makeDb(), '')).toBe(0);
    await expect(setSceneShadow(null, 'x', 1)).resolves.toBeUndefined();
    await expect(clearSceneShadow(null, 'x')).resolves.toBeUndefined();
  });
});

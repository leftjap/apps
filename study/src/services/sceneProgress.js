/**
 * sceneProgress.js — 씬(다이얼로그) 쉐도잉 진행 durable 저장.
 *
 * 배경: 신규 학습 카드는 carry-forward(미완료분 며칠이고 노출)인데, 세션 스냅샷(activeSession)은
 * 1시간 TTL — 다음 날 재진입 시 만료돼 쉐도잉 진행이 0 으로 리셋되던 버그. 쉐도잉은 씬별 학습
 * 산출물이므로 TTL 과 분리해 씬 id 기준으로 별도 저장(carry-forward 수명 동안 유지).
 *
 * Dexie meta key: 'sceneShadow' → { [sceneId]: shadowedCount }. 로컬 UX(동기화 불필요).
 */

const KEY = 'sceneShadow';

export async function getSceneShadow(db, sceneId) {
  if (!db?.meta || !sceneId) return 0;
  try {
    const row = await db.meta.get(KEY);
    return Number(row?.value?.[sceneId]) || 0;
  } catch (e) {
    console.error('[sceneProgress] get', e);
    return 0;
  }
}

export async function setSceneShadow(db, sceneId, count) {
  if (!db?.meta || !sceneId) return;
  try {
    const row = await db.meta.get(KEY);
    const map = (row?.value && typeof row.value === 'object') ? { ...row.value } : {};
    map[sceneId] = Number(count) || 0;
    await db.meta.put({ key: KEY, value: map, at: Date.now() });
  } catch (e) {
    console.error('[sceneProgress] set', e);
  }
}

export async function clearSceneShadow(db, sceneId) {
  if (!db?.meta || !sceneId) return;
  try {
    const row = await db.meta.get(KEY);
    if (!row?.value || typeof row.value !== 'object') return;
    const map = { ...row.value };
    if (!(sceneId in map)) return;
    delete map[sceneId];
    await db.meta.put({ key: KEY, value: map, at: Date.now() });
  } catch (e) {
    console.error('[sceneProgress] clear', e);
  }
}

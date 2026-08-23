/**
 * mathQueue.js — 수학 SRS 진도의 영속 계층 (Dexie mathQueue ↔ study_math_queue).
 *
 * 배경 (2026-08-23 감사): 수학 진도가 localStorage('mathProgress') 에만 있어 기기 밖으로
 * 나가지 않았다. mathQueue Dexie 스토어 · study_math_queue 테이블 · sync TABLE_MAP 은 이미
 * 다 있었는데 쓰는 코드가 없어 실 DB study_math_queue 0행이었다.
 *
 * 범위: srs(복습 일정)만 Dexie 정본으로 옮긴다. done(개념 완료) · logs(일별 통계) 는
 * 아직 localStorage — 별건(session_logs 의 lang check 제약 때문에 마이그레이션이 필요).
 *
 * progress.srs 의 인메모리 형상 `{ [id]: { interval, nextReview, lastResult } }` 은 그대로
 * 유지한다 — 읽는 쪽(home.js 카운트 · buildQueue · nextNewGroup)을 건드리지 않기 위해서다.
 */

/**
 * 카드 + SRS 상태 → Dexie mathQueue 행.
 * study_math_queue 는 prompt/answer 가 NOT NULL — 둘 중 하나라도 없으면 null 을 반환해
 * 애초에 행을 만들지 않는다 (개념 카드는 채점 대상이 아니라 srs 에 들어오지 않는다).
 */
export function toQueueRow(card, state, kind) {
  if (!card?.id || !card.prompt || !card.answer) return null;
  return {
    id: card.id,
    module: card.module ?? null,
    tag: card.tag ?? null,
    prompt: card.prompt,
    figure: card.figure ?? null,
    answer: card.answer,
    accept: card.accept ?? null,
    solution: card.solution ?? null,
    interval: Number(state?.interval) || 1,
    nextReview: state?.nextReview,
    lastResult: kind ?? null,
  };
}

/** Dexie mathQueue → progress.srs 인메모리 형상. db 없으면 빈 객체. */
export async function loadMathSrs(db) {
  if (!db?.mathQueue) return {};
  try {
    const rows = await db.mathQueue.toArray();
    const out = {};
    for (const r of rows) {
      if (!r?.id) continue;
      out[r.id] = { interval: r.interval, nextReview: r.nextReview, lastResult: r.lastResult ?? null };
    }
    return out;
  } catch (e) {
    console.error('[mathQueue.loadMathSrs]', e);
    return {};
  }
}

/** 채점 결과 영속. 행 생성 불가(prompt/answer 없음) 또는 db 없으면 null. */
export async function saveMathSrs(db, card, state, kind) {
  if (!db?.mathQueue) return null;
  const row = toQueueRow(card, state, kind);
  if (!row) return null;
  try {
    await db.mathQueue.put(row);
    return row;
  } catch (e) {
    console.error('[mathQueue.saveMathSrs]', e);
    return null;
  }
}

/** 졸업 — 큐에서 제거. */
export async function removeMathSrs(db, id) {
  if (!db?.mathQueue || !id) return null;
  try {
    await db.mathQueue.delete(id);
    return id;
  } catch (e) {
    console.error('[mathQueue.removeMathSrs]', e);
    return null;
  }
}

/**
 * localStorage 레거시 srs → mathQueue 1회 이관. 멱등:
 *  - 이미 mathQueue 에 있는 id 는 건드리지 않는다 (이관 후 학습한 최신 진도 보존)
 *  - 카드 목록에 없는 id(콘텐츠 삭제) · prompt/answer 없는 카드는 건너뛴다
 */
export async function migrateLegacySrs(db, legacySrs, cards) {
  const result = { migrated: 0, skipped: 0 };
  if (!db?.mathQueue || !legacySrs || typeof legacySrs !== 'object') return result;
  const ids = Object.keys(legacySrs);
  if (ids.length === 0) return result;
  try {
    const byId = new Map((Array.isArray(cards) ? cards : []).map((c) => [c?.id, c]));
    const existing = new Set(await db.mathQueue.toCollection().primaryKeys());
    const rows = [];
    for (const id of ids) {
      if (existing.has(id)) continue; // 멱등 — 최신 진도 보존
      const row = toQueueRow(byId.get(id), legacySrs[id], legacySrs[id]?.lastResult ?? null);
      if (!row) { result.skipped += 1; continue; }
      rows.push(row);
    }
    if (rows.length > 0) await db.mathQueue.bulkPut(rows);
    result.migrated = rows.length;
    return result;
  } catch (e) {
    console.error('[mathQueue.migrateLegacySrs]', e);
    return result;
  }
}

export default { toQueueRow, loadMathSrs, saveMathSrs, removeMathSrs, migrateLegacySrs };

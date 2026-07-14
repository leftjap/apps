/**
 * syncHealth — 동기화 상태 영속 + 사용자 표시 문구 (2026-07-15).
 *
 * 배경: sync 실패는 console.error 로만 끝나고 UI 에 전혀 안 떴다. settings 의 '마지막 동기화 —'
 * (#syncTime) 는 채우는 코드가 없는 자리표시자였다. gym 은 같은 결함으로 4일간 조용히 sync 가
 * 멈춘 채 "정상" 을 표시하다 데이터를 잃을 뻔했다 (2026-07-14).
 *
 * 판정 원칙: **미푸시 대기분이 있는데 오래 성공하지 못한 상태만 경고**한다.
 * 단순히 오래 안 썼을 뿐인 경우(대기 0)는 경고하지 않는다 — 거짓 경보는 진짜 경보를 죽인다.
 */

const PREFIX = 'study.syncHealth.';

/** 마지막 성공이 이보다 오래됐고 미푸시 대기분이 있으면 위험. */
export const STALE_MS = 24 * 60 * 60 * 1000;

function store() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** `{ lastOkAt, lastErrorAt, lastError, pending }` 또는 null. */
export function readSyncHealth(userId) {
  const ls = store();
  if (!ls || !userId) return null;
  try {
    const raw = ls.getItem(PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * flush 결과 기록. sync.js 가 매 flush 끝에 호출.
 *  - ok: 실패 0 → lastOkAt 갱신
 *  - pending: 아웃박스에 남은 미푸시 id 수 (0 이면 전부 올라감)
 */
export function recordSyncResult(userId, { ok, pending = 0, error = null, at = Date.now() } = {}) {
  const ls = store();
  if (!ls || !userId) return;
  const prev = readSyncHealth(userId) || {};
  const next = {
    lastOkAt: ok ? at : (prev.lastOkAt ?? null),
    lastErrorAt: ok ? (prev.lastErrorAt ?? null) : at,
    lastError: ok ? null : String(error ?? 'unknown'),
    pending,
  };
  try {
    ls.setItem(PREFIX + userId, JSON.stringify(next));
  } catch {
    /* quota/private mode — 표시용이라 무시 */
  }
}

function relTime(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

/**
 * 표시 상태 판정.
 *  - unknown : 기록 없음
 *  - ok      : 미푸시 대기 없음
 *  - pending : 대기분 있으나 최근(24h 내) 성공함 — 곧 올라감
 *  - risk    : 대기분이 있는데 24h 넘게 성공 못 함 (또는 성공 이력 자체가 없음) → 이 기기에만 존재
 */
export function syncStatus(health, now = Date.now()) {
  if (!health) return { level: 'unknown', text: '마지막 동기화 —' };
  const { lastOkAt, pending = 0 } = health;
  if (!pending) {
    if (!lastOkAt) return { level: 'unknown', text: '마지막 동기화 —' };
    return { level: 'ok', text: `마지막 동기화 ${relTime(now - lastOkAt)}` };
  }
  const staleFor = lastOkAt ? now - lastOkAt : Infinity;
  if (staleFor > STALE_MS) {
    const since = lastOkAt ? relTime(staleFor) : '한 번도 성공 못 함';
    return {
      level: 'risk',
      text: `동기화 실패 (${since}) — ${pending}건이 이 기기에만 있어요`,
    };
  }
  return { level: 'pending', text: `동기화 대기 ${pending}건 · 마지막 ${relTime(staleFor)}` };
}

/**
 * activeSession.js — 진행 중 세션 스냅샷 영속화 (spec §8-6).
 *
 * Dexie meta key: 'activeSession'
 * value 구조: { mode, lang, todayISO, startTime, step, tried, passed, lastScore,
 *              pronScores, weakInSession, recLog, exLog, judged, cardIds, savedAt }
 *
 * 만료 1시간 초과 시 자동 finalize (= finishSession 호출) 후 clear.
 * 종료 버튼 미누름 + 1시간 이탈 시에도 학습 기록 (sessionLog + reviewQueue) 보존.
 */

import { finishSession, clampSessionDuration } from './sessionFinish.js';

const KEY = 'activeSession';
const TTL_MS = 60 * 60 * 1000; // 1시간

export async function saveActiveSession(db, snapshot) {
  if (!db?.meta || !snapshot || typeof snapshot !== 'object') return null;
  const value = { ...snapshot, savedAt: Date.now() };
  await db.meta.put({ key: KEY, value, at: Date.now() });
  return value;
}

/**
 * 만료 시계만 되짚는다 (상태는 그대로) — 사용자가 실제로 조작 중이면 이탈이 아니다.
 *
 * 2026-08-28 사용자 보고: 한 카드를 오래 공부하면 진행이 통째로 사라졌다. TTL 판정이
 * `savedAt`(= 마지막 saveSnapshot = 마지막 녹음/다음카드) 기준이라, 듣고·생각하고·해설 읽는
 * 시간은 활동으로 안 쳐져 1시간이 지나면 이탈로 오판했다. 게다가 만료 정리(finalizeStaleSnapshot)는
 * 첫 카드 진행 중(step=1)이면 아무것도 남기지 않아 기록조차 없이 사라졌다.
 * 포인터·키 입력에서 throttled 로 호출한다 — meta 1행 put 이라 가볍다.
 */
export async function touchActiveSession(db) {
  if (!db?.meta?.get || !db?.meta?.put) return false;
  try {
    const now = Date.now();
    /* 원자적 갱신 (2026-09-03 실측 수정): get→put 두 단계는 그 사이에 저장된 새 스냅샷을 옛 값으로
     * 덮어썼다 — 첫 조작의 pointerdown touch 가 click 의 saveSnapshot 을 되감아 정답 공개·진행이
     * 유실됐다(브라우저 로그: put(새) → get(옛, 지연) → put(옛)). Dexie update 는 한 트랜잭션 안의
     * 읽기·수정·쓰기라 겹치지 않는다. update 가 없는 저장소(테스트 가짜·구형)만 종전 경로. */
    if (typeof db.meta.update === 'function') {
      const n = await db.meta.update(KEY, { 'value.savedAt': now, at: now });
      return n > 0;
    }
    const row = await db.meta.get(KEY);
    if (!row?.value || typeof row.value !== 'object') return false;
    await db.meta.put({ ...row, value: { ...row.value, savedAt: now }, at: now });
    return true;
  } catch { return false; }
}

export async function loadActiveSession(db) {
  if (!db?.meta) return null;
  const row = await db.meta.get(KEY);
  if (!row?.value || typeof row.value !== 'object') return null;
  const savedAt = Number(row.value.savedAt) || 0;
  if (Date.now() - savedAt > TTL_MS) {
    // expire — 부분 학습 finalize 후 clear (학습 기록 보존)
    try { await finalizeStaleSnapshot(db, row.value); }
    catch (e) { console.error('[activeSession] finalize 실패', e); }
    await clearActiveSession(db);
    return null;
  }
  return row.value;
}

/**
 * 만료된 스냅샷을 finishSession 으로 정식 영속화.
 *  - new 모드: cardIds[0..step-2] 의 todayLessons 카드를 completedNewCards 로 finalize
 *    → sessionLog 생성 + dailyStats merge + 완료 카드 reviewQueue promote
 *  - review 모드: completedReviewCount = step-1 로 finalize
 *    → sessionLog 생성 + dailyStats merge (SRS 판정은 미적용 — snapshot 에 카드별 매핑 없음)
 *
 * step=1 (첫 카드 진행 중, 완료 0) 시 영속화 의미 없음 → skip.
 */
export async function finalizeStaleSnapshot(db, snapshot) {
  if (!db || !snapshot || typeof snapshot !== 'object') return null;
  const step = Number(snapshot.step) || 0;
  const completed = Math.max(0, step - 1);
  const tried = Number(snapshot.tried) || 0;
  // 카드를 한 장도 못 넘겼어도 발화가 있었으면 기록한다 — 종전엔 '학습한 카드 없음'으로 버려
  // 첫 카드에서 오래 연습한 세션이 발화·학습시간까지 통째로 사라졌다 (2026-08-28).
  if (completed === 0 && tried === 0) return null;

  const lang = snapshot.lang;
  const date = snapshot.todayISO;
  if (!lang || !date) return null;

  const startTime = Number(snapshot.startTime) || 0;
  const savedAt = Number(snapshot.savedAt) || 0;
  // activeSec(활성 시간) 우선 — 벽시계(savedAt-startTime)는 방치 시 폭주. legacy 만 벽시계+clamp.
  const activeSec = Math.floor(Number(snapshot.activeSec));
  const durationSec = clampSessionDuration(
    Number.isFinite(activeSec) && activeSec >= 0
      ? activeSec
      : (startTime > 0 && savedAt > startTime ? Math.floor((savedAt - startTime) / 1000) : 0),
    completed,
  );

  if (snapshot.mode === 'new') {
    const cardIds = Array.isArray(snapshot.cardIds) ? snapshot.cardIds.slice(0, completed) : [];
    // 완료 카드가 0장이어도 발화가 있으면 로그를 남긴다 (finishSession 은 빈 배열을 허용).
    const cards = cardIds.length ? await db.todayLessons.bulkGet(cardIds) : [];
    const completedNewCards = cards.filter(Boolean);
    return finishSession(db, {
      mode: 'new', lang, date, durationSec,
      tried: Number(snapshot.tried) || 0,
      passed: Number(snapshot.passed) || 0,
      completedNewCards,
      baseToday: snapshot.base, // 진행 중 flushLiveStats 가 쓴 라이브 값 reconcile (이중집계 방지)
    });
  }
  if (snapshot.mode === 'review' || snapshot.mode === 'free') {
    return finishSession(db, {
      mode: snapshot.mode === 'free' ? 'free' : 'review',
      lang, date, durationSec,
      tried: Number(snapshot.tried) || 0,
      passed: Number(snapshot.passed) || 0,
      completedReviewCount: completed,
      baseToday: snapshot.base,
    });
  }
  return null;
}

export async function clearActiveSession(db) {
  if (!db?.meta?.delete) return;
  try { await db.meta.delete(KEY); } catch { /* noop */ }
}

export function isExpired(savedAt, now = Date.now()) {
  return (Number(now) - (Number(savedAt) || 0)) > TTL_MS;
}

/**
 * snapshot + 현재 cards + mode 검증 → 복원 patch (또는 null).
 * 복원 patch: step / tried / passed / lastScore / pronScores / weakInSession / judged / startTime
 *            (+ 스냅샷에 cards 실물이 있으면 cards / total 도 — 아래 참조).
 *
 * 스냅샷 cards 가 정본 (2026-08-29 오후 — 실사용 보고 "새로고침하면 점수가 전부 날아간다"):
 * 복습은 카드 판정이 즉시 reviewQueue 에 반영되므로, 새로고침 후 로더가 due 필터로 '방금 판정한
 * 카드'를 뺀 목록을 준다. 종전 게이트(현재 목록과 완전 일치)는 그 순간 항상 실패해 호출부가
 * 스냅샷을 파기했다 — 복습 중 새로고침 = 진행 전량 소실이 결정론적이었다 (free 는 정렬 변동으로
 * 동일). 카드 실물을 스냅샷에 담아 두고, 있으면 그것으로 세션을 되살린다 — 현재 목록과의
 * 불일치는 폐기 사유가 아니다. mode·TTL(loadActiveSession)·내부 정합(cards↔cardIds) 검증은 유지.
 * cards 없는 구형 스냅샷은 종전 규칙(현재 목록 완전 일치)으로 폴백한다.
 */
export function restoreFromSnapshot(snapshot, cards, mode, lang) {
  if (!snapshot || snapshot.mode !== mode) return null;
  /* 언어 가드 (2026-08-29 오후 2차 감사) — 종전 '현재 목록 완전 일치' 게이트는 로더의 lang 필터
   * 덕에 언어 가드를 겸했다(en 스냅샷 × ja 목록 = 항상 불일치 → 폐기). cards 정본화로 그 암묵
   * 보호가 사라지므로 명시 비교한다. 양쪽이 있을 때만 — 구형 스냅샷·미전달 호출 하위호환. */
  if (lang && snapshot.lang && snapshot.lang !== lang) return null;
  if (!Array.isArray(snapshot.cardIds)) return null;
  // 빈 세션은 복원할 진행이 없다 — 빈 스냅샷을 '복원 가능'으로 판정하면 replay 폴백이 봉쇄되고
  // 빈 화면에 고착된다 (2026-08-29 오후 2차 감사 — 종전엔 replay 분기의 정리가 자가 치유였다).
  if (!snapshot.cardIds.length) return null;
  const snapCards = (Array.isArray(snapshot.cards) && snapshot.cards.length) ? snapshot.cards : null;
  if (snapCards) {
    if (snapCards.length !== snapshot.cardIds.length) return null;
    for (let i = 0; i < snapCards.length; i += 1) {
      if (snapCards[i]?.id !== snapshot.cardIds[i]) return null;
    }
  } else {
    if (!Array.isArray(cards)) return null;
    if (snapshot.cardIds.length !== cards.length) return null;
    for (let i = 0; i < cards.length; i += 1) {
      if (cards[i]?.id !== snapshot.cardIds[i]) return null;
    }
  }
  return {
    ...(snapCards ? { cards: snapCards, total: snapCards.length } : {}),
    step: Number(snapshot.step) || 1,
    tried: Number(snapshot.tried) || 0,
    passed: Number(snapshot.passed) || 0,
    lastScore: snapshot.lastScore ?? null,
    pronScores: Array.isArray(snapshot.pronScores) ? [...snapshot.pronScores] : [],
    weakInSession: (snapshot.weakInSession && typeof snapshot.weakInSession === 'object') ? { ...snapshot.weakInSession } : {},
    // 카드별 녹음 진행 (count/best) — 버튼 상태·점수 안착 복원 (2026-06-10)
    recLog: (snapshot.recLog && typeof snapshot.recLog === 'object') ? { ...snapshot.recLog } : {},
    // 카드별 연습 진행 (응용 행 점수 / 생산 연습 출제·통과 / 체이닝 단계) — 종전엔 DOM 로컬이라
    // 재마운트·새로고침이면 통째로 소실됐다 (2026-08-21)
    exLog: (snapshot.exLog && typeof snapshot.exLog === 'object') ? { ...snapshot.exLog } : {},
    judged: (snapshot.judged && typeof snapshot.judged === 'object')
      ? { got: Number(snapshot.judged.got) || 0, hmm: Number(snapshot.judged.hmm) || 0, no: Number(snapshot.judged.no) || 0 }
      : { got: 0, hmm: 0, no: 0 },
    startTime: Number(snapshot.startTime) || Date.now(),
    // 활성 시간 누적 시드 — 복원 세션이 옛 startTime 벽시계를 승계하지 않도록 (없으면 0)
    activeSec: (() => { const v = Math.floor(Number(snapshot.activeSec)); return Number.isFinite(v) && v > 0 ? v : 0; })(),
    base: snapshot.base ?? null, // 세션 시작 시 캡처한 그날 dailyStats (라이브 반영 base)
  };
}

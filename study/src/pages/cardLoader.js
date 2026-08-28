/**
 * cardLoader.js — 세션 페이지 (session-new / session-review) 의 카드 로드 헬퍼.
 *
 * pickCardFields(card)  — Dexie row → UI 가 필요한 필드만 추출 (순수 함수, 테스트 가능)
 * loadNewCards(db, lang, todayISO) — todayLessons 에서 미완료 신규 카드 (FIFO·order_index ASC, 첫 장면 그룹만)
 * loadReviewCards(db, lang, todayISO) — reviewQueue 의 due 카드 (nextReview <= today, 미정 nextReview 도 due)
 */

// explanation.chunks 의 kr 이어붙임 = 발음. review_queue 는 phonetic_kr 컬럼이 없어 서버 동기화 시
// pron 이 유실되므로(2026-06-30), phonetic_kr 부재 시 chunks 에서 파생(게이트가 둘을 일치 강제).
function chunksKr(card) {
  const ch = card?.explanation?.chunks;
  if (!Array.isArray(ch) || !ch.length) return '';
  return ch.map((x) => (Array.isArray(x) ? x[1] : '') ?? '').join(' ').trim();
}

export function pickCardFields(card) {
  if (!card) return null;
  return {
    id: card.id,
    sentence: card.sentence ?? '',
    pron: card.phonetic_kr || chunksKr(card),
    ko: card.meaning ?? '',
    reading: card.reading ?? null,
    lang: card.lang ?? null,
    explanation: card.explanation ?? null,
    // speaker: root 컬럼 우선, fallback explanation.speaker (sync.js 와 동일 — 화자가 explanation jsonb 안에
    // 박혀 오는 카드[en 가이드 §6.2]에서 TTS 화자별 voice 가 누락돼 기본 Aria 로 떨어지던 버그 픽스).
    speaker: card.speaker ?? card.explanation?.speaker ?? null,
  };
}

export async function loadNewCards(db, lang, todayISO) {
  /* 날짜 게이트 (2026-08-28): **오늘까지** 예정된 카드만 연다.
   * carry-forward 는 유지 — 지난 날짜의 미완료는 계속 나온다(그래서 date < today 도 통과).
   * 막는 건 '아직 오지 않은 날'뿐이다. 배경: ja 코어100 17세션(100장)을 미래 날짜로 미리
   * 시딩했더니 필터가 없어 신규 세션 하나에 100장이 통째로 들어갔다("1/100"). 장면 그룹 컷은
   * scene 카드가 있어야 동작하는데 코어100 은 scene 이 없어 무력했다.
   * date 없는 구 행과 todayISO 미지정 호출은 막지 않는다(회귀 방지). */
  if (!db || !lang) return [];
  const isScene = (r) => Array.isArray(r?.explanation?.dialogue);
  const byDateOrder = (a, b) => {
    const da = a.date || '';
    const db_ = b.date || '';
    if (da !== db_) return da < db_ ? -1 : 1; // 오래된 date 먼저 (FIFO)
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  };
  const rows = await db.todayLessons.where('lang').equals(lang).toArray();
  const filtered = rows.filter((r) => r.completed !== true
    && !(todayISO && r.date && r.date > todayISO));
  filtered.sort(byDateOrder);
  // 장면 그룹 스코프 (1세션 = 1장면): scene 카드(explanation.dialogue 배열)가 그룹 시작.
  // 선두 이후 첫 scene 직전에서 컷 — 이전 그룹 부분완료 꼬리(scene 완료 후 잔여 표현 포함)가
  // 다음 장면과 한 세션에 섞이지 않는다. scene 없는 리스트(ja 콩트·구 en)는 전체 반환 (기존 동작).
  // → deriveDialogue (session-new.js) 의 타 장면 표현 혼입·순차 커서 stuck 자동 해소.
  const sceneCut = filtered.findIndex((r, i) => i > 0 && isScene(r));
  /* 날짜 묶음 컷 (2026-08-28): 시드 한 파일 = 하루치다. 밀린 날이 쌓여도 한 세션에는
   * **가장 오래된 미완료 날짜** 하나만 연다 — 없으면 밀릴수록 세션이 무한정 커진다
   * (코어100 17세션 방치 시 100장). scene 컷과 함께 더 이른 쪽을 택한다. */
  const firstDate = filtered[0]?.date || '';
  const dateCut = firstDate ? filtered.findIndex((r) => (r.date || '') !== firstDate) : -1;
  const cuts = [sceneCut, dateCut].filter((n) => n > 0);
  const cut = cuts.length ? Math.min(...cuts) : -1;
  const group = cut === -1 ? filtered : filtered.slice(0, cut);
  // scene 완료 + 표현 잔존 꼬리: 중도 종료 시 finishSession 이 prefix(scene 포함)만 완료 마킹하므로
  // 꼬리만 남으면 다이얼로그 없는 세션이 됨 → 그룹의 scene 카드를 완료 여부 무관 선두에 복원.
  // (scene 재완료 마킹은 no-op, 복습 이관도 scene 제외 — sessionFinish.js)
  if (group.length > 0 && !isScene(group[0])) {
    const all = rows.slice().sort(byDateOrder);
    const pos = all.findIndex((r) => r.id === group[0].id);
    for (let i = pos - 1; i >= 0; i--) {
      if (isScene(all[i])) { group.unshift(all[i]); break; }
    }
  }
  return group;
}

/**
 * advanceCard — 현재 step (1-based) 에서 다음 카드로 전환.
 * 반환: { done: true } 마지막이면 / 아니면 { done: false, step, sentence }
 * cards 빈 배열 또는 step 이 이미 끝/넘침이면 done.
 */
export function advanceCard(cards, currentStep) {
  if (!Array.isArray(cards) || cards.length === 0) return { done: true };
  const nextIdx = currentStep; // step 은 1-based, 다음 카드 0-based 인덱스 = step
  if (nextIdx >= cards.length) return { done: true };
  return {
    done: false,
    step: currentStep + 1,
    sentence: pickCardFields(cards[nextIdx]),
  };
}

export async function loadReviewCards(db, lang, todayISO) {
  if (!db || !lang || !todayISO) return [];
  const rows = await db.reviewQueue.where('lang').equals(lang).toArray();
  const due = rows.filter((r) => !r.nextReview || r.nextReview <= todayISO);
  // 기한 초과 우선 (nextReview ASC, 미정은 가장 오래된 것으로 취급)
  due.sort((a, b) => {
    const av = a.nextReview ?? '';
    const bv = b.nextReview ?? '';
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  return due;
}

/**
 * loadFreeReviewCards — 자유 복습 (spec §8-4).
 * reviewQueue 전체 (due 무관) → 기한 초과 우선 → 상위 limit (default 20).
 */
export async function loadFreeReviewCards(db, lang, limit = 20) {
  if (!db || !lang) return [];
  const rows = await db.reviewQueue.where('lang').equals(lang).toArray();
  rows.sort((a, b) => {
    const av = a.nextReview ?? '';
    const bv = b.nextReview ?? '';
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  return rows.slice(0, Math.max(0, Number(limit) || 0));
}

/**
 * loadReplayCards — 완료한 신규 세션 '다시 듣기' (home done 상태 버튼).
 * 가장 최근 완료 date 의 그룹(scene + 표현, 1일 1장면)을 order_index 순으로 반환. 읽기 전용 replay —
 * loadNewCards 가 빈 배열(전부 완료)일 때 session-new 가 폴백 로드. 호출부는 replay 모드에서
 * finishSession(복습 이관·통계)을 건너뛴다(완료 카드 재이관 시 SRS interval 리셋 방지).
 */
export async function loadReplayCards(db, lang) {
  if (!db || !lang) return [];
  const rows = await db.todayLessons.where('lang').equals(lang).toArray();
  const done = rows.filter((r) => r.completed === true);
  if (!done.length) return [];
  const latestDate = done.reduce((m, r) => ((r.date || '') > m ? r.date : m), done[0].date || '');
  return done.filter((r) => r.date === latestDate)
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
}

/**
 * loadQueueFromSession — stats 의 클릭 진입 큐 복원 (mocks/stats.html goReview / openBS 가 저장한 ID).
 *
 * 동작: sessionStorage.studyReviewQueue (JSON [{id, ...}, ...]) → ID 만 추출 →
 *       reviewQueue + todayLessons 양쪽 bulkGet (이관된 신규는 reviewQueue, 미이관은 todayLessons).
 *
 * 반환: 카드 배열 (입력 ID 순서 유지) — 큐 없거나 빈 ID 면 null.
 *       null 반환 시 호출자는 기존 loadReviewCards / loadFreeReviewCards 폴백.
 *
 * 클린업 책임: 세션 종료 핸들러에서 sessionStorage 삭제 (clearSessionQueue).
 */
export async function loadQueueFromSession(db, _lang) {
  if (!db) return null;
  let raw = null;
  try { raw = sessionStorage.getItem('studyReviewQueue'); }
  catch { return null; }
  if (!raw) return null;
  let queue;
  try { queue = JSON.parse(raw); }
  catch { return null; }
  const ids = (Array.isArray(queue) ? queue : []).map((q) => q?.id).filter(Boolean);
  if (!ids.length) return null;
  const [tCards, rCards] = await Promise.all([
    db.todayLessons.bulkGet(ids),
    db.reviewQueue.bulkGet(ids),
  ]);
  return ids.map((id, i) => tCards[i] || rCards[i]).filter(Boolean);
}

/**
 * clearSessionQueue — 세션 종료 후 sessionStorage 정리.
 * studyReviewQueue + studyReturnTo 양쪽 (returnTo 도 1회성).
 */
export function clearSessionQueue() {
  try {
    sessionStorage.removeItem('studyReviewQueue');
    sessionStorage.removeItem('studyReturnTo');
  } catch { /* noop */ }
}

/**
 * getSessionReturnTo — sessionStorage.studyReturnTo 읽어 'sentList' / 'stats' / 'home' 중 하나 반환.
 * 미설정 시 'home'.
 */
export function getSessionReturnTo() {
  let v = null;
  try { v = sessionStorage.getItem('studyReturnTo'); }
  catch { return 'home'; }
  if (v === 'sentList' || v === 'stats') return v;
  return 'home';
}

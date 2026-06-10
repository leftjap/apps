import Dexie from 'dexie';

/**
 * Study 앱 IndexedDB 스키마 (spec §4 · Wave 11.12 팩토리 전환).
 *
 * 스토어:
 *  - reviewQueue     : SRS 복습 큐 (id PK · lang/nextReview/interval 인덱스)
 *  - todayLessons    : 오늘의 레슨 (id PK · lang/date 인덱스)
 *  - sessionLogs     : 세션 기록 (id PK · lang/date 인덱스)
 *  - dailyStats      : 일별 통계 (date PK · lang 인덱스 — spec 원문 그대로, 단일 언어 1row/day 전제)
 *  - pronunciationLog: 음소별 발음 로그 (id PK · date/lang 인덱스)
 *  - meta            : 사용자 설정·상태 (key PK)
 *
 * Wave 11.12 변경:
 *  - `studyDB` 고정 인스턴스 export 폐기. `createStudyDB(name)` 팩토리만 export.
 *  - main.js 가 인증 후 `createStudyDB('study_' + userHash)` 호출 → `window.studyDB` 동적 할당.
 *  - 미인증 / mocks 허브(iframe) 환경에선 `window.studyDB` undefined → mocks fallback 유지.
 */
export function createStudyDB(name = 'study') {
  const db = new Dexie(name);
  db.version(1).stores({
    reviewQueue: 'id, lang, nextReview, interval',
    todayLessons: 'id, lang, date',
    sessionLogs: 'id, lang, date',
    dailyStats: 'date, lang',
    pronunciationLog: 'id, date, lang',
    meta: 'key',
  });
  // 수학 사고력 세션 (additive — 기존 스토어는 자동 승계).
  db.version(2).stores({
    mathProblems: 'id, date, module',
    mathQueue: 'id, nextReview, module',
  });
  // v3: 복리(구 콘텐츠) 잔존 정리. sync 는 pull(bulkPut)만 하고 서버 삭제를 Dexie 에 반영하지
  // 않으므로(deleting hook 부재), 한 번 clear 후 다음 pull 로 서버 정본(기하)만 재구축.
  db.version(3).stores({
    mathProblems: 'id, date, module',
    mathQueue: 'id, nextReview, module',
  }).upgrade(async (tx) => {
    await tx.table('mathProblems').clear();
    await tx.table('mathQueue').clear();
  });
  // v4: 하이브리드 전환 — 옛 단답(스테일) 잔존 정리. session-math 가 번들(개념 정본) + Dexie
  // (루틴 생성 일일 응용 연습)를 병합하므로, Dexie 가 Supabase(정리됨)를 미러하도록 한 번 clear.
  // 이후 sync 가 루틴 응용만 재구축. (sync 는 pull-only — 서버 삭제 미반영이라 수동 clear 필요.)
  db.version(4).stores({
    mathProblems: 'id, date, module',
    mathQueue: 'id, nextReview, module',
  }).upgrade(async (tx) => {
    await tx.table('mathProblems').clear();
    await tx.table('mathQueue').clear();
  });
  // v5: en 세션 콘텐츠 전면 삭제 (2026-06-10 사용자 지시 — 2세션 적층·deriveDialogue stuck 상태 리셋).
  // 서버 행도 삭제되지만 sync 는 pull-only 라 기기 Dexie 미반영 → 버전 bump 가 유일한 클라 삭제 경로 (v3/v4 전례).
  // reviewQueue 는 오늘 이관분 (en-park*) 만 — 5월 콩트 복습 자산 (en-2026-05-*) 은 보존. ja·math 무영향.
  db.version(5).upgrade(async (tx) => {
    await tx.table('todayLessons').where('lang').equals('en').delete();
    await tx.table('reviewQueue').where('id').startsWith('en-park').delete();
  });
  return db;
}

export default createStudyDB;

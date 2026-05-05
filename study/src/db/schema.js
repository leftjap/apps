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
  return db;
}

export default createStudyDB;

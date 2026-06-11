/* mock.js — 데모 모드(Tweaks) 목업 습관 데이터. design-ref/flow/src/flow/data.js 의 HABITS verbatim.
   실데이터(adapter.js)는 동일 shape 를 생성하되 단일 상태(cycle:["cur"])로 만든다.
   demo: 카드·캡션 탭 시 cycle 을 따라 상태 순환 미리보기.
   기본 장면: 글쓰기 완료(06:40) · 운동 미실행(밀림) · 어학·독서 미실행
   → 오늘 기록 / 밀린 미실행 / 다가올 미실행이 모두 보이는 검증용 구성. */

/* 표시 순서 — 하루 흐름(아침→밤). 문·흐름·기록 모두 이 순서로 일관 */
export const ORDER = ["today", "gym", "study", "book"];

export const MOCK_HABITS = [
  {
    id: "today", ko: "글쓰기", en: "Today", url: "https://leftjap.github.io/apps/today/",
    metric: { unit: "매", max: 3.4 }, usualMin: 6 * 60 + 40, last: "어제 07:10",
    cycle: ["none", "done"], start: "done",
    states: {
      none: { kind: "none", big: 3, unit: "일 연속", today: 0, line: "오늘 아직", enter: "쓰기" },
      done: { kind: "done", big: 4, unit: "일 연속", today: 2.1, line: "오늘 2.1매", enter: "다시 열기", atMin: 6 * 60 + 40, amount: "2.1매" },
    },
    hist: [2.1, 1.8, 0, 2.4, 1.5, 3.0, 2.2, 0, 1.9, 2.6, 1.4, 2.0, 0, 2.8, 1.7, 2.2, 3.4, 1.9, 2.5, 2.1, 2.3, 1.7, 2.4, 0, 2.6, 1.9, 2.1],
  },
  {
    id: "gym", ko: "운동", en: "Gym", url: null, device: "iPhone",
    metric: { unit: "분", max: 60 }, usualMin: 13 * 60 + 50, last: "그제 13:20",
    cycle: ["none", "progress", "done"], start: "none",
    states: {
      none: { kind: "none", big: 2, unit: "이번주 회", today: 0, line: "마지막 운동 그제", enter: null },
      progress: { kind: "progress", big: 2, unit: "이번주 회", today: 0, line: "운동 중", timer: 735, enter: null },
      done: { kind: "done", big: 3, unit: "이번주 회", today: 48, line: "오늘 48분", enter: null, atMin: 14 * 60 + 5, amount: "48분" },
    },
    hist: [45, 0, 0, 52, 38, 0, 41, 0, 48, 0, 0, 44, 50, 0, 46, 0, 55, 42, 0, 0, 47, 40, 0, 49, 0, 43, 0],
  },
  {
    id: "study", ko: "어학", en: "Study", url: "https://leftjap.github.io/apps/study/",
    metric: { unit: "문장", max: 46 }, usualMin: 20 * 60, last: "어제 20:14",
    cycle: ["none", "done"], start: "none",
    states: {
      none: { kind: "none", big: 7, unit: "일 연속", today: 0, line: "복습 8개 대기", enter: "열기" },
      done: { kind: "done", big: 8, unit: "일 연속", today: 32, line: "오늘 32문장", enter: "다시 열기", atMin: 20 * 60 + 25, amount: "32문장" },
    },
    hist: [32, 28, 0, 40, 35, 44, 30, 0, 38, 42, 26, 33, 0, 45, 29, 36, 48, 31, 39, 0, 41, 39, 37, 43, 28, 35, 32],
  },
  {
    id: "book", ko: "독서", en: "Book", url: "https://leftjap.github.io/apps/book/",
    metric: { unit: "분", max: 50 }, usualMin: 22 * 60 + 30, last: "어제 22:30",
    cycle: ["none", "done"], start: "none",
    states: {
      none: { kind: "none", big: 5, unit: "일 연속", today: 0, line: "어제 28분 읽음", enter: "읽기" },
      done: { kind: "done", big: 6, unit: "일 연속", today: 28, line: "오늘 28분", enter: "다시 열기", atMin: 22 * 60 + 40, amount: "28분" },
    },
    hist: [28, 0, 35, 30, 42, 25, 0, 33, 38, 0, 45, 29, 31, 0, 40, 36, 27, 44, 30, 32, 48, 0, 33, 38, 35, 41, 28],
  },
];

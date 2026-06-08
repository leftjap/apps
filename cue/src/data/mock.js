/* mock.js — 데모 모드(Tweaks) 목업 습관 데이터. data-l.jsx 의 HABITS verbatim.
   실데이터(adapter.js)는 동일 shape 를 생성하되 단일 상태(cycle:["cur"])로 만든다.
   demo: 카드 탭 시 cycle 을 따라 상태 순환(none→progress→done) 미리보기. */

/* 표시 순서 — 하루 흐름(아침→밤). 문·동선·기록 모두 이 순서로 일관 */
export const ORDER = ["today", "gym", "study", "book"];

export const MOCK_HABITS = [
  {
    id: "today", ko: "글쓰기", en: "Today", url: "https://leftjap.github.io/apps/today/",
    metric: { unit: "매", max: 3.4 }, slot: { time: "06:40", pos: 11 }, last: "어제 07:10",
    hist: [2.1, 1.8, 0, 2.4, 1.5, 3.0, 2.2, 0, 1.9, 2.6, 1.4, 2.0, 0, 2.8, 1.7, 2.2, 3.4, 1.9, 2.5, 2.1, 2.3, 1.7, 2.4, 0, 2.6, 1.9, 2.1],
    cycle: ["none", "progress", "done"], start: "done",
    states: {
      none: { kind: "none", big: 3, unit: "일 연속", today: 0, line: "오늘 아직", enter: "쓰기" },
      progress: { kind: "progress", big: 3, unit: "일 연속", today: 1.6, line: "오늘까지 1.6매", enter: "이어서" },
      done: { kind: "done", big: 4, unit: "일 연속", today: 2.1, line: "오늘 2.1매", enter: "다시 열기" },
    },
  },
  {
    id: "gym", ko: "운동", en: "Gym", url: null, device: "iPhone",
    metric: { unit: "분", max: 60 }, slot: { time: "13:50", pos: 48 }, last: "그제 13:20",
    hist: [45, 0, 0, 52, 38, 0, 41, 0, 48, 0, 0, 44, 50, 0, 46, 0, 55, 42, 0, 0, 47, 40, 0, 49, 0, 43, 0],
    cycle: ["none", "progress", "done"], start: "progress",
    states: {
      none: { kind: "none", big: 2, unit: "이번주 회", today: 0, line: "마지막 운동 2일 전", enter: null },
      progress: { kind: "progress", big: 2, unit: "이번주 회", today: 0, line: "운동 중", timer: 735, enter: null },
      done: { kind: "done", big: 3, unit: "이번주 회", today: 48, line: "오늘 48분", enter: null },
    },
  },
  {
    id: "study", ko: "어학", en: "Study", url: "https://leftjap.github.io/apps/study/",
    metric: { unit: "문장", max: 46 }, slot: { time: "20:00", pos: 70 }, last: "어제 20:14",
    hist: [32, 28, 0, 40, 35, 44, 30, 0, 38, 42, 26, 33, 0, 45, 29, 36, 48, 31, 39, 0, 41, 39, 37, 43, 28, 35, 32],
    cycle: ["none", "progress", "done"], start: "none",
    states: {
      none: { kind: "none", big: 7, unit: "일 연속", today: 0, line: "복습 8개 대기", enter: "열기" },
      progress: { kind: "progress", big: 7, unit: "일 연속", today: 18, line: "복습 5 / 8 · 18문장", enter: "이어서" },
      done: { kind: "done", big: 8, unit: "일 연속", today: 32, line: "오늘 32문장", enter: "다시 열기" },
    },
  },
  {
    id: "book", ko: "독서", en: "Book", url: "https://leftjap.github.io/apps/book/",
    metric: { unit: "분", max: 50 }, slot: { time: "22:30", pos: 90 }, last: "어제 22:30",
    hist: [28, 0, 35, 30, 42, 25, 0, 33, 38, 0, 45, 29, 31, 0, 40, 36, 27, 44, 30, 32, 48, 0, 33, 38, 35, 41, 28],
    cycle: ["none", "done"], start: "none",
    states: {
      none: { kind: "none", big: 5, unit: "일 연속", today: 0, line: "어제 28분 읽음", enter: "읽기" },
      done: { kind: "done", big: 6, unit: "일 연속", today: 28, line: "오늘 28분", enter: "다시 열기" },
    },
  },
];

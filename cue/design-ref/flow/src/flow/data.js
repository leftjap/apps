/* data.js — 새 안 프로토타입용 목업 데이터 + 시간 헬퍼 (window.CUE) */
window.CUE = (() => {
  const p2 = (n) => String(n).padStart(2, "0");
  const fmt = (min) => `${p2(Math.floor(min / 60) % 24)}:${p2(Math.round(min) % 60)}`;
  const WD = ["일", "월", "화", "수", "목", "금", "토"];

  /* 기존 codex 문장 (sentences.js) */
  const SENTENCES = [
    { text: "오늘 하지 않았다면 내일도 하지 않는다. 그냥 한다.", hi: "그냥 한다" },
    { text: "내가 매일 하는 일이 가끔 하는 일보다 더 중요하다.", hi: "매일 하는 일" },
    { text: "걱정이 시작되면 뭐라도 한다.", hi: "뭐라도 한다" },
    { text: "행동이 생각의 주인이다. 지금 뭘 하고 있는지를 먼저 본다.", hi: "행동이 생각의 주인" },
    { text: "달리는 중에 무기력한 사람은 없다.", hi: "달리는 중" },
    { text: "어려운 일을 해냄으로써 더 강해지는 것은 자연의 기본 법칙이다.", hi: "더 강해지는 것" },
    { text: "쓰는 순간, 주의가 그곳으로 향한다.", hi: "쓰는 순간" },
    { text: "개구리를 먼저 먹어라.", hi: "먼저" },
  ];

  /* 습관 목업 — 평소 시각(usualMin) + 직전 기록(last) + 장면(states).
     기본 장면: 글쓰기 완료(06:40) · 운동 미실행(밀림) · 어학 미실행 · 독서 미실행
     → 오늘 기록 / 밀린 미실행 / 다가올 미실행이 모두 보이는 검증용 구성. */
  const HABITS = [
    {
      id: "today", ko: "글쓰기", en: "TODAY", url: "https://leftjap.github.io/apps/today/",
      metric: { unit: "매", max: 3.4 }, usualMin: 6 * 60 + 40, last: "어제 07:10",
      cycle: ["none", "done"], start: "done",
      states: {
        none: { kind: "none", big: 3, unit: "일 연속", today: 0, line: "오늘 아직", enter: "쓰기" },
        done: { kind: "done", big: 4, unit: "일 연속", today: 2.1, line: "오늘 2.1매", enter: "다시 열기", atMin: 6 * 60 + 40, amount: "2.1매" },
      },
      hist: [2.1, 1.8, 0, 2.4, 1.5, 3.0, 2.2, 0, 1.9, 2.6, 1.4, 2.0, 0, 2.8, 1.7, 2.2, 3.4, 1.9, 2.5, 2.1, 2.3, 1.7, 2.4, 0, 2.6, 1.9, 2.1],
    },
    {
      id: "gym", ko: "운동", en: "GYM", url: null, device: "iPhone",
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
      id: "study", ko: "어학", en: "STUDY", url: "https://leftjap.github.io/apps/study/",
      metric: { unit: "문장", max: 46 }, usualMin: 20 * 60, last: "어제 20:14",
      cycle: ["none", "done"], start: "none",
      states: {
        none: { kind: "none", big: 7, unit: "일 연속", today: 0, line: "복습 8개 대기", enter: "열기" },
        done: { kind: "done", big: 8, unit: "일 연속", today: 32, line: "오늘 32문장", enter: "다시 열기", atMin: 20 * 60 + 25, amount: "32문장" },
      },
      hist: [32, 28, 0, 40, 35, 44, 30, 0, 38, 42, 26, 33, 0, 45, 29, 36, 48, 31, 39, 0, 41, 39, 37, 43, 28, 35, 32],
    },
    {
      id: "book", ko: "독서", en: "BOOK", url: "https://leftjap.github.io/apps/book/",
      metric: { unit: "분", max: 50 }, usualMin: 22 * 60 + 30, last: "어제 22:30",
      cycle: ["none", "done"], start: "none",
      states: {
        none: { kind: "none", big: 5, unit: "일 연속", today: 0, line: "어제 28분 읽음", enter: "읽기" },
        done: { kind: "done", big: 6, unit: "일 연속", today: 28, line: "오늘 28분", enter: "다시 열기", atMin: 22 * 60 + 40, amount: "28분" },
      },
      hist: [28, 0, 35, 30, 42, 25, 0, 33, 38, 0, 45, 29, 31, 0, 40, 36, 27, 44, 30, 32, 48, 0, 33, 38, 35, 41, 28],
    },
  ];

  /* 양 → 농담 단계 */
  const level = (v, max) => (v <= 0 ? "" : v / max < 0.34 ? "g1" : v / max < 0.7 ? "g2" : "g3");

  const longestRun = (seq) => {
    let best = 0, cur = 0;
    for (const v of seq) { if (v > 0) { cur++; best = Math.max(best, cur); } else cur = 0; }
    return best;
  };

  const dayMeta = (daysAgo, base) => {
    const d = new Date(base);
    d.setDate(d.getDate() - daysAgo);
    return { m: d.getMonth() + 1, d: d.getDate(), wd: WD[d.getDay()] };
  };

  const sentenceOfDay = (count) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / 86400000) % count;
  };

  /* 남은 시간 문구 — "7시간 32분" */
  const remainLabel = (nowMin) => {
    const r = Math.max(0, 1440 - nowMin);
    const h = Math.floor(r / 60), m = Math.round(r % 60);
    return h > 0 ? `${h}시간 ${p2(m)}분` : `${m}분`;
  };

  return { HABITS, SENTENCES, p2, fmt, WD, level, longestRun, dayMeta, sentenceOfDay, remainLabel };
})();

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSentenceRows, mountSentences, sentenceHint, pickTodayRound } from './sentences.js';

/* 문장 모아보기 — 좌 한글 / 우 영문(가림). '정답 보기'로 영문만 토글 공개, 옆 버튼으로 복습 세션 이동.
 * 데이터 소스는 reviewQueue(현재 과목) — 실측(2026-07-18): 현 트랙 en 54장으로 todayLessons 와 완전 일치.
 * (구 트랙 80장은 schema v6 트랙 전환에서 사용자 지시로 삭제돼 텍스트가 없다 → 복원 불가·불필요) */
describe('buildSentenceRows — 목록 구성', () => {
  const cards = [
    { id: 'a', sentence: 'I called you.', meaning: '너한테 전화했었어.' },
    { id: 'b', sentence: 'Are you hungry?', meaning: '배고파?' },
    { id: 'c', sentence: 'No meaning field.', ko: '뜻 필드가 ko 인 경우' },
  ];
  const logs = [
    { date: '2026-07-10', newSentenceIds: ['a'] },
    { date: '2026-07-19', newSentenceIds: ['b'] },
  ];

  it('난이도 평가가 없으면 학습일 최신순', () => {
    const rows = buildSentenceRows(cards, logs);
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']); // c 는 학습일 없음 → 뒤로
  });

  /* 사용자 지시(2026-07-18): "어렵다고 한 게 맨 위, 쉽다고 한 건 맨 밑으로".
   * 난이도(lastResult) 우선 — 어려움(X) > 보통(△) > 미평가 > 쉬움(O), 동급은 학습일 최신순. */
  it('난이도 평가 순으로 정렬한다 — 어려움이 맨 위, 쉬움이 맨 아래', () => {
    const rated = [
      { id: 'easy', sentence: 'e', meaning: '쉬움', lastResult: 'O' },
      { id: 'hard', sentence: 'h', meaning: '어려움', lastResult: 'X' },
      { id: 'none', sentence: 'n', meaning: '미평가' },
      { id: 'mid', sentence: 'm', meaning: '보통', lastResult: '△' },
    ];
    expect(buildSentenceRows(rated, []).map((r) => r.id)).toEqual(['hard', 'mid', 'none', 'easy']);
  });

  it('같은 난이도 안에서는 학습일 최신순을 유지한다', () => {
    const rated = [
      { id: 'h-old', sentence: 'a', meaning: 'x', lastResult: 'X' },
      { id: 'h-new', sentence: 'b', meaning: 'y', lastResult: 'X' },
    ];
    const ls = [{ date: '2026-07-01', newSentenceIds: ['h-old'] }, { date: '2026-07-19', newSentenceIds: ['h-new'] }];
    expect(buildSentenceRows(rated, ls).map((r) => r.id)).toEqual(['h-new', 'h-old']);
  });

  /* 2026-07-28 — 오늘 평가한 문장(lastResultAt=오늘)은 재방문에도 하단 유지.
   * 어제 이전 평가는 기존 규칙(어려움 맨 위) 그대로 — 날이 바뀌면 어려움 우선이 복원된다. */
  it('오늘 평가한 문장은 난이도 불문 하단으로, 어제 평가한 어려움은 맨 위 유지', () => {
    const TODAY = '2026-07-28';
    const rows = buildSentenceRows([
      { id: 'hy', sentence: 'a', meaning: '어제어려움', lastResult: 'X', lastResultAt: '2026-07-27T20:00:00Z' },
      { id: 'ht', sentence: 'b', meaning: '오늘어려움', lastResult: 'X', lastResultAt: '2026-07-28T09:00:00Z' },
      { id: 'et', sentence: 'c', meaning: '오늘쉬움', lastResult: 'O', lastResultAt: '2026-07-28T09:05:00Z' },
      { id: 'un', sentence: 'd', meaning: '미평가' },
    ], [], [], TODAY);
    expect(rows.map((r) => r.ko)).toEqual(['어제어려움', '미평가', '오늘어려움', '오늘쉬움']);
  });

  it('평가 결과(level)를 행에 실어 준다 — 버튼 선택 표시용', () => {
    const rows = buildSentenceRows([{ id: 'x', sentence: 's', meaning: 'k', lastResult: '△' }], []);
    expect(rows[0].level).toBe('△');
  });

  it('en/ko 를 채운다 (meaning 우선, 없으면 ko)', () => {
    const rows = buildSentenceRows(cards, logs);
    const b = rows.find((r) => r.id === 'b');
    expect(b).toMatchObject({ en: 'Are you hungry?', ko: '배고파?' });
    expect(rows.find((r) => r.id === 'c').ko).toBe('뜻 필드가 ko 인 경우');
  });

  it('빈 입력 안전', () => {
    expect(buildSentenceRows([], [])).toEqual([]);
    expect(buildSentenceRows(null, null)).toEqual([]);
  });
});

describe('mountSentences — 렌더·상호작용', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.location.hash = '';
    window.studyDB = {
      reviewQueue: { where: () => ({ equals: () => ({ toArray: async () => [
        { id: 'a', lang: 'en', sentence: 'I called you.', meaning: '너한테 전화했었어.' },
        { id: 'b', lang: 'en', sentence: 'Are you hungry?', meaning: '배고파?' },
      ] }) }) },
      sessionLogs: { where: () => ({ equals: () => ({ toArray: async () => [
        { date: '2026-07-19', lang: 'en', newSentenceIds: ['b'] },
      ] }) }) },
    };
  });

  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('행마다 한글은 그대로, 영문은 가림 상태로 렌더한다', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const rows = host.querySelectorAll('.vl-row');
    expect(rows.length).toBe(2);
    const en = rows[0].querySelector('.en');
    expect(en.classList.contains('masked')).toBe(true); // 기본 가림
    expect(rows[0].querySelector('.ko').textContent).toBeTruthy();
  });

  it("'정답 보기'를 누르면 그 문장만 공개되고, 다시 누르면 다시 가려진다 (토글)", async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const rows = host.querySelectorAll('.vl-row');
    const reveal = rows[0].querySelector('.vl-reveal');
    const en0 = rows[0].querySelector('.en');
    const en1 = rows[1].querySelector('.en');

    reveal.click();
    expect(en0.classList.contains('masked')).toBe(false); // 공개
    expect(en1.classList.contains('masked')).toBe(true);  // 다른 행은 그대로 가림

    reveal.click();
    expect(en0.classList.contains('masked')).toBe(true);  // 다시 가림 (토글)
  });

  /* 복습 진입은 기존 stats.goReview 와 같은 규약을 따른다 — sessionStorage.studyReviewQueue 에
   * 큐를 넣고 '#/session-review?lang=..' 로 이동 (session-review.js:219 이 이 큐를 우선 사용).
   * app.js 주석의 '?sentenceId=' 는 실제 경로가 아니다. */
  it('복습 버튼은 그 문장을 큐에 넣고 복습 세션으로 진입한다 (행 클릭만으로는 이동하지 않음)', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const row = host.querySelector('.vl-row');

    row.click();
    expect(window.location.hash).toBe(''); // 행 클릭은 이동 없음 — 영문 확인이 기본

    row.querySelector('.vl-go').click();
    expect(window.location.hash).toContain('#/session-review');
    const queue = JSON.parse(sessionStorage.getItem('studyReviewQueue'));
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('b'); // 최신순 첫 행
    expect(sessionStorage.getItem('studyReturnTo')).toBe('sentences');
  });

  /* 난이도 평가 — 복습 세션과 같은 판정(어려움=X/보통=△/쉬움=O)을 목록에서 바로.
   * 단 SRS 간격(interval/nextReview)은 건드리지 않는다: 이 페이지는 발화·녹음 없이 눈으로만
   * 훑는 곳이라, 복습을 수행하지 않았는데 다음 복습일이 밀리면 학습이 손상된다. */
  it('난이도 버튼을 누르면 lastResult 만 저장한다 (SRS 간격은 미변경)', async () => {
    const updates = [];
    window.studyDB.reviewQueue.update = async (id, patch) => { updates.push({ id, patch }); };
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const row = host.querySelector('.vl-row');
    row.querySelector('.vl-lv[data-level="X"]').click();
    await tick();
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ id: 'b', patch: { lastResult: 'X' } });
    expect(updates[0].patch.interval).toBeUndefined();   // SRS 간격 손대지 않음
    expect(updates[0].patch.nextReview).toBeUndefined();
  });

  /* 2026-07-22 사용자 지시: "평가하는 순간 즉시 해당 위치로 보내 — 쉬움 클릭하면 맨 밑으로.
   * 기존 평가 점수 고려해서 알아서 위치 조절." → 클릭 즉시 정렬 규칙대로 그 행만 이동한다. */
  it('쉬움을 누르면 그 즉시 맨 아래로 이동한다', async () => {
    window.studyDB.reviewQueue.update = async () => {};
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const first = host.querySelector('.vl-row');
    const ko = first.querySelector('.ko').textContent;
    first.querySelector('.vl-lv[data-level="O"]').click();
    await tick();
    const order = [...host.querySelectorAll('.vl-row .ko')].map((e) => e.textContent);
    expect(order[order.length - 1]).toBe(ko);          // 맨 아래로
    expect(first.querySelector('.vl-lv[data-level="O"]').classList.contains('on')).toBe(true);
  });

  /* 2026-07-28 사용자 보고: "맨 위 문장을 어려움으로 체크하면 그게 계속 뜸 — 보통 이하로
   * 체크해야 다음 문장이 최상단에 뜨네." 구 스펙(어려움 → 즉시 맨 위 재고정)이 라운드 흐름과
   * 충돌 → 교체: **오늘 평가한 문장은 평가와 무관하게 미평가 문장들 아래로 가라앉고**, 다음
   * 문장이 최상단에 온다. 어려움 우선 정렬은 날이 바뀌면(내일) 복원된다. */
  it('맨 위 문장을 어려움으로 체크하면 가라앉고 다음 문장이 최상단에 온다', async () => {
    window.studyDB.reviewQueue.update = async () => {};
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const rows = [...host.querySelectorAll('.vl-row')];
    const firstKo = rows[0].querySelector('.ko').childNodes[0].textContent;
    const secondKo = rows[1].querySelector('.ko').childNodes[0].textContent;
    rows[0].querySelector('.vl-lv[data-level="X"]').click();
    await tick();
    const order = [...host.querySelectorAll('.vl-row .ko')].map((e) => e.childNodes[0].textContent);
    expect(order[0]).toBe(secondKo);              // 다음 문장이 최상단으로
    expect(order[order.length - 1]).toBe(firstKo); // 방금 평가한 문장은 아래로
  });

  it('평가 직후엔 난이도와 무관하게 미평가 문장들 아래로 (오늘-완료 그룹)', async () => {
    window.studyDB.reviewQueue.update = async () => {};
    window.studyDB.reviewQueue.where = () => ({ equals: () => ({ toArray: async () => [
      { id: 'h', lang: 'en', sentence: 'h', meaning: '어려운문장', lastResult: 'X' },
      { id: 'e', lang: 'en', sentence: 'e', meaning: '쉬운문장', lastResult: 'O' },
      { id: 't', lang: 'en', sentence: 't', meaning: '평가할문장' },
    ] }) });
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const target = [...host.querySelectorAll('.vl-row')].find((r) => r.querySelector('.ko').childNodes[0].textContent === '평가할문장');
    target.querySelector('.vl-lv[data-level="△"]').click();
    await tick();
    // 보통으로 평가해도 '오늘 완료'라 미평가(어제 평가 포함) 문장들 아래로 — .ko 원문 노드만 비교
    expect([...host.querySelectorAll('.vl-row .ko')].map((e) => e.childNodes[0].textContent))
      .toEqual(['어려운문장', '쉬운문장', '평가할문장']);
  });

  /* lastResultAt 은 **KST(localISODate) 기준**으로 저장한다 — toISOString(UTC)이면 KST 새벽
   * (0~9시) 평가가 전날로 귀속돼 재방문 가라앉힘이 풀린다 (2026-06-22 today.js 사고와 동일 유형). */
  it('평가 저장에 lastResultAt 이 KST 오늘 날짜로 포함된다', async () => {
    const updates = [];
    window.studyDB.reviewQueue.update = async (id, patch) => { updates.push({ id, patch }); };
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    host.querySelector('.vl-row .vl-lv[data-level="O"]').click();
    await tick();
    const { localISODate } = await import('../utils/today.js');
    expect(updates[0].patch.lastResultAt.slice(0, 10)).toBe(localISODate()); // 기기 로컬(KST) 오늘
  });

  /* 2026-07-24 위계 재설계 — 배치가 실제 흐름(떠올리기→힌트/정답/듣기→평가→복습)을 따른다.
   * 복습은 이동 액션이라 마이크 아이콘 금지(코랄=녹음 규약은 실제 녹음 CTA 전용). */
  it('행 순서는 한글 → 액션(힌트·정답·듣기) → 평가 → 복습 → 가려진 영문', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const kids = [...host.querySelector('.vl-row').children];
    const cls = kids.map((k) => k.className.split(' ')[0]);
    expect(cls).toEqual(['ko', 'vl-acts', 'vl-levels', 'vl-go', 'en']);
  });

  it('복습 버튼에는 마이크 아이콘이 없다 (녹음 아님 — 화면 이동)', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    expect(host.querySelector('.vl-go svg')).toBeNull();
    expect(host.querySelector('.vl-go').textContent).toContain('복습');
  });

  it('문장이 없으면 빈 상태를 안내한다', async () => {
    window.studyDB.reviewQueue = { where: () => ({ equals: () => ({ toArray: async () => [] }) }) };
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    expect(host.textContent).toContain('아직 공부한 문장이 없어요');
  });
});

/* 2026-07-24 사용자 지시 — ① 정렬에 학습 세션 점수(발음 로그) 반영 ② 평가+정답보기 후
 * 그 문장은 라운드 완료로 리셋(다시 가림·칩 해제)되고 새 위치로 이동. 칩은 '이번 라운드 입력'이며
 * 저장된 평가는 위치로만 반영한다(켜둔 채 남기지 않는다). */
describe('buildSentenceRows — 세션 점수 반영 정렬', () => {
  it('같은 난이도 안에서 최근 발음 점수가 낮은 문장이 위로 온다', () => {
    const cards = [
      { id: 'hi', sentence: 'a', meaning: '고득점', lastResult: 'X' },
      { id: 'lo', sentence: 'b', meaning: '저득점', lastResult: 'X' },
    ];
    const pron = [
      { sentenceId: 'hi', date: '2026-07-20', overallScore: 95 },
      { sentenceId: 'lo', date: '2026-07-20', overallScore: 55 },
    ];
    expect(buildSentenceRows(cards, [], pron).map((r) => r.id)).toEqual(['lo', 'hi']);
  });

  it('점수 기록이 없는 문장은 같은 난이도의 점수 있는 문장 뒤로 (정보 없음 → 뒤)', () => {
    const cards = [
      { id: 'none', sentence: 'a', meaning: '무점수' },
      { id: 'lo', sentence: 'b', meaning: '저득점' },
    ];
    const pron = [{ sentenceId: 'lo', date: '2026-07-20', overallScore: 55 }];
    expect(buildSentenceRows(cards, [], pron).map((r) => r.id)).toEqual(['lo', 'none']);
  });

  it('점수는 최근 날짜 기록을 쓴다', () => {
    const cards = [
      { id: 'a', sentence: 'a', meaning: 'ㄱ' },
      { id: 'b', sentence: 'b', meaning: 'ㄴ' },
    ];
    const pron = [
      { sentenceId: 'a', date: '2026-07-01', overallScore: 40 },
      { sentenceId: 'a', date: '2026-07-20', overallScore: 90 }, // 최근이 정본
      { sentenceId: 'b', date: '2026-07-20', overallScore: 80 },
    ];
    expect(buildSentenceRows(cards, [], pron).map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('mountSentences — 평가 라운드 완료 리셋', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.location.hash = '';
    window.studyDB = {
      reviewQueue: {
        where: () => ({ equals: () => ({ toArray: async () => [
          { id: 'a', lang: 'en', sentence: 'I called you.', meaning: '너한테 전화했었어.', lastResult: 'O' },
          { id: 'b', lang: 'en', sentence: 'Are you hungry?', meaning: '배고파?' },
        ] }) }),
        update: async () => {},
      },
      sessionLogs: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    };
  });

  it('저장된 기존 평가는 칩을 켜두지 않는다 — 위치로만 반영', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await new Promise((r) => setTimeout(r, 0));
    expect(host.querySelectorAll('.vl-lv.on').length).toBe(0); // a 의 lastResult=O 여도 칩은 꺼짐
    // 위치 반영: 쉬움(O) 평가된 a 가 미평가 b 아래
    expect([...host.querySelectorAll('.vl-row .ko')].map((e) => e.childNodes[0].textContent))
      .toEqual(['배고파?', '너한테 전화했었어.']);
  });

  it('정답 공개 + 평가 → 잠시 뒤 다시 가려지고 칩이 꺼진다 (라운드 완료)', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await new Promise((r) => setTimeout(r, 0));
    const row = [...host.querySelectorAll('.vl-row')][0]; // b
    const en = row.querySelector('.en');
    const reveal = row.querySelector('.vl-reveal');
    reveal.click();
    expect(en.classList.contains('masked')).toBe(false);
    const chip = row.querySelector('.vl-lv[data-level="X"]');
    vi.useFakeTimers(); // 리셋 타이머를 제어하려면 클릭 전에 설치
    try {
      chip.click();
      expect(chip.classList.contains('on')).toBe(true); // 직후엔 피드백으로 켜짐
      vi.advanceTimersByTime(700);
      expect(en.classList.contains('masked')).toBe(true);   // 다시 가림
      expect(chip.classList.contains('on')).toBe(false);    // 칩 해제
      expect(reveal.textContent).toBe('정답');
    } finally { vi.useRealTimers(); }
  });
});

/* 힌트 사다리 (2026-07-24 사용자 승인) — 정답 전 단계: 핵심 표현만 먼저 공개.
 * 실측(실계정 en 80장): key 존재 100%, 단 31%는 key 표현부 == 문장 전체 → 첫 단어 폴백.
 * ja 는 key 자체가 없어(0/26) 힌트 미표시. */
describe('sentenceHint — 힌트 소스 도출', () => {
  it('key 표현부가 문장과 다르면 그 표현이 힌트', () => {
    expect(sentenceHint({ lang: 'en', sentence: 'Are you on your way?', explanation: { key: 'on your way = 오는/가는 중.' } }))
      .toBe('on your way');
  });

  it('key 표현부 == 문장 전체(31% 실측)면 첫 단어 폴백 — 힌트가 정답 공개가 되면 안 된다', () => {
    expect(sentenceHint({ lang: 'en', sentence: 'Is there a problem?', explanation: { key: 'Is there a problem? = 뭐 문제 있어?' } }))
      .toBe('Is there …');
  });

  it('en 인데 key 가 없으면 첫 단어 폴백, ja 는 null(버튼 미표시)', () => {
    expect(sentenceHint({ lang: 'en', sentence: 'Count on it.', explanation: {} })).toBe('Count on …');
    expect(sentenceHint({ lang: 'ja', sentence: 'ありがとう', explanation: {} })).toBeNull();
  });
});

describe('mountSentences — 힌트 버튼', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.location.hash = '';
    window.studyDB = {
      reviewQueue: {
        where: () => ({ equals: () => ({ toArray: async () => [
          { id: 'a', lang: 'en', sentence: 'Are you on your way?', meaning: '너 오는 중이야?', explanation: { key: 'on your way = 오는/가는 중.' } },
        ] }) }),
        update: async () => {},
      },
      sessionLogs: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    };
  });

  it('힌트 클릭 → 핵심 표현만 노출, 영문은 여전히 가림. 평가 후 라운드 리셋에 힌트도 사라진다', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await new Promise((r) => setTimeout(r, 0));
    const row = host.querySelector('.vl-row');
    const hintBtn = row.querySelector('.vl-hintb');
    expect(hintBtn).toBeTruthy();
    hintBtn.click();
    const line = row.querySelector('.vl-hintline');
    expect(line.style.display).not.toBe('none');
    expect(line.textContent).toContain('on your way');
    expect(row.querySelector('.en').classList.contains('masked')).toBe(true); // 정답은 그대로 가림
    // 평가 → 600ms 리셋에 힌트도 접힘
    vi.useFakeTimers();
    try {
      row.querySelector('.vl-lv[data-level="△"]').click();
      vi.advanceTimersByTime(700);
      expect(line.style.display).toBe('none');
    } finally { vi.useRealTimers(); }
  });
});

/* 오늘 10문장 미니 라운드 (2026-07-24 사용자 승인) — 정렬 상위 10개(어려움·저득점 우선)가
 * 오늘의 목표. 평가(라운드 완료)가 곧 진행이며, 같은 날 재방문 시 목표·진행이 유지된다. */
describe('pickTodayRound — 오늘의 목표 선정·복원', () => {
  const rows10 = Array.from({ length: 12 }, (_, i) => ({ id: 'r' + i }));

  it('저장 없음 → 정렬 상위 10개가 목표, 진행 0', () => {
    const r = pickTodayRound(rows10, null, '2026-07-24');
    expect(r.ids).toEqual(rows10.slice(0, 10).map((x) => x.id));
    expect(r.done).toEqual([]);
  });

  it('같은 날 저장 → 목표·진행 유지 (재정렬로 순위가 바뀌어도 목표 고정)', () => {
    const saved = { date: '2026-07-24', ids: ['r5', 'r0'], done: ['r5'] };
    const r = pickTodayRound(rows10, saved, '2026-07-24');
    expect(r.ids).toEqual(['r5', 'r0']);
    expect(r.done).toEqual(['r5']);
  });

  it('날짜가 바뀌면 새 상위 10개로 초기화', () => {
    const saved = { date: '2026-07-23', ids: ['r5'], done: ['r5'] };
    const r = pickTodayRound(rows10, saved, '2026-07-24');
    expect(r.ids).toHaveLength(10);
    expect(r.done).toEqual([]);
  });

  it('문장이 10개 미만이면 전부가 목표', () => {
    const r = pickTodayRound(rows10.slice(0, 3), null, '2026-07-24');
    expect(r.ids).toHaveLength(3);
  });
});

describe('mountSentences — 오늘 10문장 라운드', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    window.location.hash = '';
    localStorage.clear();
    window.studyDB = {
      reviewQueue: {
        where: () => ({ equals: () => ({ toArray: async () => [
          { id: 'a', lang: 'en', sentence: 'I called you.', meaning: '너한테 전화했었어.' },
          { id: 'b', lang: 'en', sentence: 'Are you hungry?', meaning: '배고파?' },
        ] }) }),
        update: async () => {},
      },
      sessionLogs: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    };
  });

  it('헤더에 목표·진행 표시, 평가하면 진행이 오르고 같은 문장 재평가는 안 오른다', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await new Promise((r) => setTimeout(r, 0));
    const round = host.querySelector('.vl-round');
    expect(round).toBeTruthy();
    expect(round.textContent).toContain('오늘 2문장');
    expect(round.textContent).toContain('0');
    const row = host.querySelector('.vl-row');
    row.querySelector('.vl-lv[data-level="X"]').click();
    expect(round.textContent).toContain('1');
    row.querySelector('.vl-lv[data-level="O"]').click(); // 같은 문장 재평가
    expect(round.querySelector('b').textContent).toBe('1');
    // 진행이 localStorage 에 남는다 (같은 날 재방문 복원용)
    const saved = JSON.parse(localStorage.getItem('studySentRound:en'));
    expect(saved.done).toHaveLength(1);
  });

  it('전부 평가하면 완료 표시가 드러난다 (그 전엔 숨김 — textContent 는 숨김 노드도 포함하므로 display 로 검증)', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await new Promise((r) => setTimeout(r, 0));
    const fin = host.querySelector('.vl-round .fin');
    expect(fin.style.display).toBe('none'); // 시작 시 숨김
    for (const row of [...host.querySelectorAll('.vl-row')]) {
      row.querySelector('.vl-lv[data-level="O"]').click();
    }
    expect(fin.style.display).not.toBe('none'); // 전부 평가 → 표시
  });
});


/* 일본어 표시 (2026-08-28) — 학습자는 히라가나만 읽고 한자·가타카나를 거의 못 읽는다.
 * 일본어 원문만 띄우면 읽을 수가 없으므로 가나 읽기와 한글 음차를 함께 싣는다. */
describe('buildSentenceRows — 일본어 읽기·음차', () => {
  it('reading·phonetic_kr 을 행에 싣는다', () => {
    const rows = buildSentenceRows([
      { id: 'j1', sentence: '確かに。', meaning: '그러네', reading: 'たしかに', phonetic_kr: '타시카니' },
    ], [], [], '2026-08-28');
    expect(rows[0].reading).toBe('たしかに');
    expect(rows[0].pron).toBe('타시카니');
  });

  it('한자가 없어 reading 이 원문과 같으면 reading 을 비운다 (중복 표시 방지)', () => {
    const rows = buildSentenceRows([
      { id: 'j2', sentence: 'そっか。', meaning: '그렇구나', reading: 'そっか。', phonetic_kr: '솟카' },
    ], [], [], '2026-08-28');
    expect(rows[0].reading).toBe('');
    expect(rows[0].pron).toBe('솟카');
  });

  it('영어 카드는 reading 이 비어 있다 (영향 없음)', () => {
    const rows = buildSentenceRows([
      { id: 'e1', sentence: 'Take it easy.', meaning: '무리하지 마' },
    ], [], [], '2026-08-28');
    expect(rows[0].reading).toBe('');
  });
});

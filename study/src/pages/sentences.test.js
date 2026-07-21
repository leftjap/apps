// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSentenceRows, mountSentences } from './sentences.js';

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

  it('평가한 버튼은 선택 표시되고, 목록 순서는 그 자리에서 바뀌지 않는다', async () => {
    window.studyDB.reviewQueue.update = async () => {};
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const before = [...host.querySelectorAll('.vl-row .ko')].map((e) => e.textContent);
    const row = host.querySelector('.vl-row');
    const hard = row.querySelector('.vl-lv[data-level="X"]');
    hard.click();
    await tick();
    expect(hard.classList.contains('on')).toBe(true);
    // 평가 도중 행이 튀지 않게 — 재정렬은 다음 진입 때 (사용자 지시)
    expect([...host.querySelectorAll('.vl-row .ko')].map((e) => e.textContent)).toEqual(before);
  });

  it('행 순서는 한글 → 난이도 → 액션 → 가려진 영문', async () => {
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    const kids = [...host.querySelector('.vl-row').children];
    const cls = kids.map((k) => k.className.split(' ')[0]);
    expect(cls).toEqual(['ko', 'vl-levels', 'vl-acts', 'en']);
  });

  it('문장이 없으면 빈 상태를 안내한다', async () => {
    window.studyDB.reviewQueue = { where: () => ({ equals: () => ({ toArray: async () => [] }) }) };
    const host = document.getElementById('root');
    mountSentences(host);
    await tick();
    expect(host.textContent).toContain('아직 공부한 문장이 없어요');
  });
});

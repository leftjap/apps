// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHomeDesktopV2, renderHomeMobileV2 } from './homeDesktopV2.js';

function baseState(over = {}) {
  return {
    size: 'desktop', lang: 'en', resume: null,
    newCount: 5, reviewCount: 2, totalReview: 10,
    todayNewDone: 0, todayReviewDone: 0, tried: 0, passed: 0,
    weekUtter: 0, weekPass: 0, streak: 1, bestStreak: 1, speechTarget: 30,
    sessionTitle: '', pronBars: [], grass: null, cumExpr: 0, cumUtter: 0,
    cumMaster: 0, weekDoneText: '', pronAvg: 0, pronDelta: 0,
    ...over,
  };
}

describe('홈 진행중 세션 표시 — activeSession resume 반영 (stale state.phase 캐시 버그)', () => {
  it('데스크톱: 직전 fresh 렌더 후 resume="new" 설정 시 "이어서 하기" 로 갱신된다', () => {
    const state = baseState();
    renderHomeDesktopV2(state);            // 1차 렌더 (resume=null → fresh)
    state.resume = 'new';                  // loadActiveSession 스냅샷 반영 시뮬
    const el = renderHomeDesktopV2(state); // 2차 렌더 — 진행중 세션
    expect(el.textContent).toContain('이어서 하기');
  });

  it('모바일: 직전 fresh 렌더 후 resume="new" 설정 시 "이어서 하기" 로 갱신된다', () => {
    const state = baseState({ size: 'phone' });
    renderHomeMobileV2(state);
    state.resume = 'new';
    const el = renderHomeMobileV2(state);
    expect(el.textContent).toContain('이어서 하기');
  });

  it('데스크톱: resume=null + 신규 0 + 진행기록 있음 → "done" 전환 (fresh 캐시에 막히지 않음)', () => {
    const state = baseState();
    renderHomeDesktopV2(state);            // fresh 캐시
    Object.assign(state, { newCount: 0, todayNewDone: 5 }); // 오늘 신규 완료
    const el = renderHomeDesktopV2(state);
    expect(el.textContent).not.toContain('학습 시작'); // fresh CTA 아니어야
  });
});

/* 2026-08-23 에 세운 원칙 — "비교하지 않은 기록을 주장하지 않는다" — 은 4카드 개편 뒤에도 살아 있다.
 * 종전엔 히어로 문구(.vh-msg)와 연속 칩(.vh-streak)이 그 주장을 했고, 지금은 링의 '직전 N회'가 한다.
 * 문구가 아니라 '없는 숫자를 만들지 않는다'는 계약을 검증한다. */
describe('홈 — 가짜 기록 주장 금지 (데스크톱·모바일 공통)', () => {
  const doneState = (over = {}) => baseState({
    todayISO: '2026-08-25',
    newCount: 0, reviewCount: 0, totalReview: 89, todayNewDone: 4, todayReviewDone: 6,
    weekUtter: 214, tried: 214, streak: 12, bestStreak: 18, ...over,
  });

  for (const [name, render] of [['데스크톱', renderHomeDesktopV2], ['모바일', renderHomeMobileV2]]) {
    it(`${name}: 히어로 문구·연속 칩이 없다 (§5.2 4카드 구성 · §11 불꽃 아이콘 금지)`, () => {
      const el = render(doneState({ size: name === '모바일' ? 'phone' : 'desktop' }));
      expect(el.querySelector('.vh-msg')).toBeNull();
      expect(el.querySelector('.vh-streak')).toBeNull();
      expect(el.textContent).not.toMatch(/최고 기록/);
      expect(el.textContent).not.toMatch(/연속/);
    });

    it(`${name}: 직전 학습일이 없으면 어떤 비교 숫자도 만들지 않는다`, () => {
      const el = render(doneState({ size: name === '모바일' ? 'phone' : 'desktop', dayMap: {} }));
      expect(el.querySelector('.vh-ring2 .pv')).toBeNull();
      expect(el.querySelector('.vh-ring2 .n').textContent).toBe('214');
    });

    it(`${name}: 고정 목표 분모(speechTarget)를 쓰지 않는다`, () => {
      const el = render(doneState({ size: name === '모바일' ? 'phone' : 'desktop', speechTarget: 30, dayMap: { '2026-08-24': 40 } }));
      expect(el.textContent).not.toMatch(/\/ ?30회/);
      expect(el.querySelector('.vh-ring2 .pv').textContent).toBe('직전 40회');
    });

    it(`${name}: 날짜는 한국어 표기 (§11 영문 날짜 금지)`, () => {
      const el = render(doneState({ size: name === '모바일' ? 'phone' : 'desktop' }));
      expect(el.querySelector('.vh-todayhd .d').textContent).toBe('8월 25일 화요일');
      expect(el.textContent).not.toMatch(/AUGUST|August|Tuesday|WEDNESDAY/);
    });
  }
});

/* 모바일 홈도 데스크톱과 같은 4카드 구성 (2026-08-26 사용자 결정).
 * 종전엔 데스크톱 렌더러만 고쳐서 폰에서는 잔디 7칸·3분할 스트립이 그대로 남아 있었다. */
describe('모바일 홈 — 데스크톱과 같은 구성', () => {
  const mob = (over = {}) => baseState({
    size: 'phone', todayISO: '2026-08-25',
    dayMap: { '2026-08-20': 31, '2026-08-22': 34, '2026-08-24': 12 },
    cumStudySec: 151800, cumUtter: 1120, cumExpr: 201, cumMaster: 98, prDays: ['2026-08-22'],
    tried: 30, ...over,
  });

  it('링 → CTA → 캘린더 → 누적 순의 단일 칼럼', () => {
    const el = renderHomeMobileV2(mob());
    expect([...el.querySelector('.m-pad').children].map((n) => n.className.split(' ')[1]))
      .toEqual(['vh-todaycard', 'vh-ctacard', 'vh-calcard', 'vh-cum']);
  });

  it('옛 구성(잔디 7칸 · 3분할 스트립)이 남아 있지 않다', () => {
    const el = renderHomeMobileV2(mob());
    expect(el.querySelectorAll('.vh-grass i')).toHaveLength(0);
    expect(el.querySelectorAll('.vh-pane')).toHaveLength(0);
    expect(el.querySelectorAll('.vh-task')).toHaveLength(0);
  });

  it('데스크톱과 같은 캘린더·링·누적 값을 낸다', () => {
    const el = renderHomeMobileV2(mob());
    expect(el.querySelectorAll('.vh-cell')).toHaveLength(28);
    expect(el.querySelectorAll('.vh-cell.pr')).toHaveLength(1);
    expect(el.querySelector('.vh-cell.today .vv').textContent).toBe('오늘');
    expect(el.querySelector('.vh-ring2 .pv').textContent).toBe('직전 12회');
    expect(el.querySelector('.vh-cum').children).toHaveLength(4);
  });

  it('주 발화 4바가 캘린더 아래로 접히고 라벨이 붙는다 (375px 에 150px 컬럼이 못 들어간다)', () => {
    const el = renderHomeMobileV2(mob());
    expect(el.querySelector('.vh-wklab').textContent).toBe('주 발화');
    expect(el.querySelectorAll('.vh-wk')).toHaveLength(4);
  });

  it('CTA 3개 — 학습 시작은 하나뿐', () => {
    const el = renderHomeMobileV2(mob());
    const ctas = [...el.querySelectorAll('.vh-cta .t1')].map((n) => n.textContent);
    expect(ctas).toEqual(['학습 시작', '복습 시작', '문장 모아보기']);
  });
});

/* 홈 v3 — 기록/갱신 (작업지시서 §5 · QA §13 '홈'). 기록이 보여야 갱신 욕구가 생긴다는 게 설계 의도라
 * 화면이 무엇을 주장하는지(분모·기록일·오늘)를 테스트로 못박는다. */
describe('홈 v3 — 최근 4주 캘린더 · 오늘 발화 링 · CTA', () => {
  const v3 = (over = {}) => baseState({
    todayISO: '2026-08-25', // 화요일
    dayMap: { '2026-08-20': 31, '2026-08-22': 34, '2026-08-24': 12 },
    cumStudySec: 151800, // 42시간 10분
    cumUtter: 1120, cumExpr: 201, cumMaster: 98, prDays: [],
    tried: 30, ...over,
  });

  it('캘린더가 4주(28칸)이고 미학습 날은 채색이 없다', () => {
    const el = renderHomeDesktopV2(v3());
    expect(el.querySelectorAll('.vh-cell')).toHaveLength(28);
    // 8/21(금)은 학습 기록 없음 → t0 (흰 배경 + 테두리)
    expect(el.querySelectorAll('.vh-cell.t0').length).toBeGreaterThan(0);
  });

  it('오늘 칸에 today 클래스(vh-today 펄스) + 텍스트 "오늘", 미래 칸은 fut 이다', () => {
    const el = renderHomeDesktopV2(v3());
    const t = el.querySelectorAll('.vh-cell.today');
    expect(t).toHaveLength(1);
    expect(t[0].querySelector('.vv').textContent).toBe('오늘'); // 오늘 숫자는 링이 말한다 (§5.3)
    expect(el.querySelectorAll('.vh-cell.fut')).toHaveLength(5); // 8/26~8/30
  });

  it('개인기록 달성일은 코랄 칸(pr)이다', () => {
    const el = renderHomeDesktopV2(v3({ prDays: ['2026-08-22'] }));
    const pr = el.querySelectorAll('.vh-cell.pr');
    expect(pr).toHaveLength(1);
    expect(pr[0].textContent).toContain('34');
  });

  it('링 분모는 직전 학습일 발화 수 — 고정 목표가 아니다', () => {
    const el = renderHomeDesktopV2(v3({ tried: 8 }));
    expect(el.querySelector('.vh-ring2 .pv').textContent).toBe('직전 12회'); // 8/24
    expect(el.querySelector('.vh-ring2 .n').textContent).toBe('8');
    expect(el.textContent).not.toMatch(/30회/);   // 옛 고정 목표(speechTarget) 분모 금지
    expect(el.textContent).not.toMatch(/일 최고/); // 링은 갱신 축만 (§5.4)
  });

  it('직전 학습일이 없으면 분모를 지어내지 않는다', () => {
    const el = renderHomeDesktopV2(v3({ dayMap: {} }));
    expect(el.querySelector('.vh-ring2 .pv')).toBeNull();
  });

  it('직전 학습일을 넘기면 코랄 링 + 직전 N회 취소선 + 확산 펄스', () => {
    const el = renderHomeDesktopV2(v3({ tried: 41 }));
    expect(el.querySelector('.vh-ring2 .pv').classList.contains('over')).toBe(true);
    expect(el.querySelector('.vh-ring2 .pl')).not.toBeNull();
    expect(el.querySelector('.vh-ring2 .arc').getAttribute('stroke')).toContain('58%'); // coral
    expect(el.querySelector('.vh-ring2 .arc').getAttribute('stroke-dashoffset')).toBe('0');
  });

  it('날짜는 한국어 표기 (영문 날짜 금지)', () => {
    const el = renderHomeDesktopV2(v3());
    expect(el.querySelector('.vh-todayhd .d').textContent).toBe('8월 25일 화요일');
    expect(el.textContent).not.toMatch(/August|Tuesday/);
  });

  it('"학습 시작" 버튼은 화면에 하나뿐이고, 문장 모아보기 진입이 있다', () => {
    const el = renderHomeDesktopV2(v3());
    const starts = [...el.querySelectorAll('.vh-cta')].filter((b) => b.textContent.includes('학습 시작'));
    expect(starts).toHaveLength(1);
    expect(el.textContent).toContain('문장 모아보기');
  });

  it('누적 4열 — 공부 시간은 시/분으로 쪼개 표기', () => {
    const el = renderHomeDesktopV2(v3());
    const cum = el.querySelector('.vh-cum');
    expect(cum.children).toHaveLength(4);
    expect(cum.children[0].textContent).toBe('누적 공부 시간42시간 10분');
    expect(cum.children[1].textContent).toContain('1,120');
  });

  it('주 발화 4블록 — 최고 주는 코랄, 진행 중인 주는 직전 주 위치에 고스트 점', () => {
    const el = renderHomeDesktopV2(v3());
    const wks = el.querySelectorAll('.vh-wk');
    expect(wks).toHaveLength(4);
    expect(wks[3].classList.contains('now')).toBe(true);
    expect(wks[3].querySelector('.tr > b')).not.toBeNull(); // 직전 주 고스트 점
    expect(el.querySelector('.vh-wk.best .v').textContent).toContain('최고');
  });
});

/* 2026-08-26 — 모바일에서 주 발화 줄이 날짜 칸 '위'에 얹혔다. .vh-wkcol 은 DOM 상 첫 자식이라
 * grid-row 를 명시하지 않으면 1행에 자동 배치된다. 데스크톱은 grid-row:1/5 로 이미 고정돼 있었다. */
describe('홈 캘린더 — 주 발화 줄 배치', () => {
  it('주 발화 블록은 DOM 상 첫 자식이지만 그리드에서 날짜 칸 다음 줄에 놓인다', () => {
    const el = renderHomeMobileV2(baseState({ size: 'phone', todayISO: '2026-08-25', dayMap: { '2026-08-20': 31 } }));
    const grid = el.querySelector('.vh-calcells');
    expect(grid.firstElementChild.className).toBe('vh-wkcol');
    const css = el.querySelector('style').textContent;
    expect(css).toMatch(/\.vh-wkcol\{grid-column:1\/-1;grid-row:5;/);
  });
});

/* 시안 §5.5 CTA 보조줄 문구 — 2026-08-27 시안 줄 대조. 구분자 '—' 가 끼어 있었고,
 * 복습 보조의 앞 숫자가 '오늘 due' 였다(시안은 복습 큐 전체 + '오늘 N문장 ≈ M분'). */
describe('홈 CTA 보조줄 — 시안 문구', () => {
  const st = () => baseState({
    todayISO: '2026-08-25', sessionTitle: 'At the Park',
    newCount: 9, newMin: 27, reviewCount: 10, totalReview: 98, reviewMin: 20,
    dayMap: { '2026-08-24': 34 }, cumStudySec: 0,
  });

  it('학습 시작 보조는 "오늘의 장면 At the Park · 표현 9개 · 약 27분"', () => {
    const el = renderHomeDesktopV2(st());
    expect(el.querySelector('.vh-cta.pri .t2').textContent).toBe('오늘의 장면 At the Park · 표현 9개 · 약 27분');
  });

  it('복습 시작 보조는 "복습 문장 98 · 오늘이 적기 · 10문장 ≈ 20분"', () => {
    const el = renderHomeDesktopV2(st());
    expect(el.querySelector('.vh-cta.rev .t2').textContent).toBe('복습 문장 98 · 오늘이 적기 · 10문장 ≈ 20분');
  });

  it('주 발화 라벨은 데스크톱에서 숨는다 (요일 헤더가 이미 갖고 있다)', () => {
    const el = renderHomeDesktopV2(st());
    expect(el.querySelector('style').textContent).toContain('.vh-wklab{display:none}');
  });
});

/* 2026-08-27 실배포 스샷 — 복습 큐가 비면 '복습 시작' 버튼이 통째로 사라졌다.
 * 옛 tasksColumn 의 조건부 렌더를 그대로 들고 온 탓. §5.5 는 "3버튼 모두" 로 조건이 없다. */
describe('홈 CTA — 항상 3버튼 (§5.5)', () => {
  const st = (over) => baseState({
    todayISO: '2026-08-27', newCount: 6, newMin: 18,
    dayMap: { '2026-08-21': 60 }, cumStudySec: 109560, cumUtter: 1120, cumExpr: 201,
    reviewCount: 0, totalReview: 0, cumMaster: 0, ...over,
  });
  const ctas = (el) => [...el.querySelectorAll('.vh-cta .t1')].map((n) => n.textContent);

  for (const [name, render] of [['데스크톱', renderHomeDesktopV2], ['모바일', renderHomeMobileV2]]) {
    it(`${name}: 복습 큐가 0 이어도 복습 버튼이 남는다`, () => {
      const el = render(st({ size: name === '모바일' ? 'phone' : 'desktop' }));
      expect(ctas(el)).toEqual(['학습 시작', '복습 시작', '문장 모아보기']);
      // 없는 사실을 주장하지 않는다 — 큐가 비었으면 '오늘이 적기' 를 쓰지 않는다
      const sub = el.querySelector('.vh-cta.rev .t2').textContent;
      expect(sub).toBe('복습할 문장이 없어요');
      expect(sub).not.toMatch(/오늘이 적기/);
    });
  }

  it('오늘 복습할 게 있으면 시안 문구를 쓴다', () => {
    const el = renderHomeDesktopV2(st({ reviewCount: 10, totalReview: 98, reviewMin: 20 }));
    expect(el.querySelector('.vh-cta.rev .t2').textContent).toBe('복습 문장 98 · 오늘이 적기 · 10문장 ≈ 20분');
  });

  it('큐는 있는데 오늘 due 가 없으면 자유 복습', () => {
    const el = renderHomeDesktopV2(st({ reviewCount: 0, totalReview: 98 }));
    expect(ctas(el)[1]).toBe('자유 복습');
    expect(el.querySelector('.vh-cta.rev .t2').textContent).toBe('복습 큐 98문장 · 원하는 만큼');
  });
});

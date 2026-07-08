// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderSessionReviewV2, pickReviewRung, clozeBlank } from './sessionReviewV2.js';

function renderEmpty(size) {
  document.body.innerHTML = '<div id="root"></div>';
  const host = document.getElementById('root');
  renderSessionReviewV2(host, { cards: [], total: 0, step: 1, size }, {});
  return host;
}

describe('renderSessionReviewV2 — 빈 상태(total=0) 반응형', () => {
  it('모바일(phone) 빈 상태는 데스크톱 레일(.vr-rail) 대신 모바일 셸(.m-topb)을 렌더한다', () => {
    const host = renderEmpty('phone');
    expect(host.querySelector('.vr-rail')).toBeNull();        // 데스크톱 88px 레일 없어야
    expect(host.querySelector('.vr-main')).toBeNull();        // width:760px 본문 없어야 (375 팽창 원인)
    expect(host.querySelector('.m-topb')).not.toBeNull();     // 모바일 상단바 있어야
    expect(host.textContent).toContain('복습할 문장이 없어요'); // 메시지 유지
  });

  it('데스크톱(desktop) 빈 상태는 기존 레일(.vr-rail)을 그대로 유지한다', () => {
    const host = renderEmpty('desktop');
    expect(host.querySelector('.vr-rail')).not.toBeNull();
    expect(host.textContent).toContain('복습할 문장이 없어요');
  });
});

const EN = 'Thank you so much for coming.';
const KO = '와 주셔서 정말 감사합니다.';
const CHUNKS = [['Thank you', '땡큐'], ['so much', '쏘 머치'], ['for coming', '포 커밍']];

function mountCard({ interval, lang = 'en', sentence = EN, ko = KO, chunks = CHUNKS, size = 'desktop', demo = false, handlers = {} }) {
  document.body.innerHTML = '<div id="root"></div>';
  const host = document.getElementById('root');
  const explanation = { key: `${sentence} = ${ko}`, chunks };
  const s = { id: 'c1', lang, sentence, ko, explanation };
  const card = { id: 'c1', lang, sentence, meaning: ko, interval, explanation };
  const state = { cards: [card], total: 1, step: 1, size, sentence: s, time: '00:00', recLog: {}, tried: 0, demo, micBlocked: false };
  renderSessionReviewV2(host, state, handlers);
  return host;
}

describe('pickReviewRung — interval(성숙도) 기반 복습 단계 (en 한정)', () => {
  it('신규/저성숙(interval<3)은 Rung 1 (수용+발음)', () => {
    expect(pickReviewRung(1, 'en')).toBe(1);
    expect(pickReviewRung(2, 'en')).toBe(1);
  });
  it('중간 성숙(3≤interval<21)은 Rung 2 (클로즈)', () => {
    expect(pickReviewRung(3, 'en')).toBe(2);
    expect(pickReviewRung(7, 'en')).toBe(2);
    expect(pickReviewRung(14, 'en')).toBe(2);
  });
  it('고성숙(interval≥21)은 Rung 3 (한글→영어 생산회상)', () => {
    expect(pickReviewRung(21, 'en')).toBe(3);
    expect(pickReviewRung(60, 'en')).toBe(3);
  });
  it('일본어는 단계화하지 않고 항상 Rung 1 (현행 유지)', () => {
    expect(pickReviewRung(60, 'ja')).toBe(1);
    expect(pickReviewRung(21, 'ja')).toBe(1);
  });
  it('interval 미정/비정상은 안전하게 Rung 1', () => {
    expect(pickReviewRung(undefined, 'en')).toBe(1);
    expect(pickReviewRung(null, 'en')).toBe(1);
    expect(pickReviewRung(NaN, 'en')).toBe(1);
  });
});

describe('clozeBlank — 마지막 청크 빈칸 처리', () => {
  it('마지막 청크를 빈칸으로 가린다 (앞 청크는 유지)', () => {
    const out = clozeBlank(EN, CHUNKS);
    expect(out).toContain('_____');
    expect(out).not.toContain('for coming');
    expect(out).toContain('Thank you so much');
  });
  it('청크 없으면 null (호출자 폴백)', () => {
    expect(clozeBlank(EN, [])).toBeNull();
    expect(clozeBlank(EN, null)).toBeNull();
  });
  it('마지막 청크가 문장에 없으면 null', () => {
    expect(clozeBlank(EN, [['nope', '노프']])).toBeNull();
  });
});

describe('renderSessionReviewV2 — Rung별 카드 프롬프트', () => {
  it('Rung 1: 영어 문장을 그대로 표시', () => {
    const host = mountCard({ interval: 1 });
    expect(host.querySelector('.vr-h1').textContent).toBe(EN);
  });
  it('Rung 2: 마지막 청크를 빈칸으로 가린 영어 표시', () => {
    const host = mountCard({ interval: 7 });
    const h1 = host.querySelector('.vr-h1').textContent;
    expect(h1).toContain('_____');
    expect(h1).not.toContain('for coming');
    expect(h1).toContain('Thank you');
  });
  it('Rung 3: 영어를 숨기고 한글 뜻을 프롬프트로 표시', () => {
    const host = mountCard({ interval: 21 });
    const h1 = host.querySelector('.vr-h1').textContent;
    expect(h1).toBe(KO);
    expect(h1).not.toContain('Thank you');
  });
  it('일본어는 interval 높아도 문장을 그대로 표시 (Rung 1)', () => {
    const host = mountCard({ interval: 60, lang: 'ja', sentence: 'ありがとうございます。', ko: '감사합니다.', chunks: [['ありがとう', '아리가또'], ['ございます', '고자이마스']] });
    expect(host.querySelector('.vr-h1').textContent).toBe('ありがとうございます。');
  });
});

describe('renderSessionReviewV2 — 확장 사다리(체이닝) 렌더', () => {
  const LADDER = [
    { en: 'Move on.', ko: '넘어가.', kr: '무v 온', adds: 'base' },
    { en: "Let's move on.", ko: '넘어가자.', kr: '레츠 무v 온', adds: 'object' },
    { en: "Let's just move on to the next thing.", ko: '그냥 다음 걸로 넘어가자.', kr: '레츠 저스트 무v 온 투 더 넥스트 띵', adds: 'adverbial',
      back: [['to the next thing', '투 더 넥스트 띵'], ['move on to the next thing', '무v 온 투 더 넥스트 띵'], ["Let's just move on to the next thing", '레츠 저스트 무v 온 투 더 넥스트 띵']] },
  ];
  function mountWithLadder(size, ladder = LADDER) {
    document.body.innerHTML = '<div id="root"></div>';
    const host = document.getElementById('root');
    const explanation = { key: 'k', chunks: CHUNKS, ladder };
    const s = { id: 'c1', lang: 'en', sentence: EN, ko: KO, explanation };
    const card = { id: 'c1', lang: 'en', sentence: EN, meaning: KO, interval: 1, explanation };
    const state = { cards: [card], total: 1, step: 1, size, sentence: s, time: '00:00', recLog: {}, tried: 0 };
    renderSessionReviewV2(host, state, {});
    return host;
  }
  it('데스크톱: ladder가 있으면 확장 사다리 섹션과 이어 말하기(back)를 렌더한다', () => {
    const host = mountWithLadder('desktop');
    const ladder = host.querySelector('.vr-ladder');
    expect(ladder).not.toBeNull();
    expect(ladder.textContent).toContain("Let's just move on to the next thing");
    expect(ladder.textContent).toContain('이어 말하기');
  });
  it('모바일: ladder 섹션이 모바일 셸에도 렌더된다', () => {
    const host = mountWithLadder('phone');
    expect(host.querySelector('.vr-ladder')).not.toBeNull();
  });
  it('ladder 없으면(또는 1단) 확장 사다리 섹션은 렌더되지 않는다', () => {
    expect(mountCard({ interval: 1 }).querySelector('.vr-ladder')).toBeNull();
    expect(mountWithLadder('desktop', [LADDER[0]]).querySelector('.vr-ladder')).toBeNull();
  });
});

describe('renderSessionReviewV2 — Rung 3 시도 후 정답 공개(피드백) + 회상 채점', () => {
  it('녹음(데모) 후 숨겼던 영어 정답이 공개된다', () => {
    vi.useFakeTimers();
    try {
      const host = mountCard({ interval: 21, demo: true });
      expect(host.querySelector('.vr-h1').textContent).toBe(KO); // 시도 전: 한글 프롬프트
      host.querySelector('.vr-pill.pri').click();                // 떠올려 말하기(녹음)
      vi.advanceTimersByTime(1100);
      expect(host.querySelector('.vr-h1').textContent).toBe(EN); // 시도 후: 영어 정답 공개
    } finally { vi.useRealTimers(); }
  });
  it('첫(숨김) 시도 점수로 SRS 채점한다', () => {
    vi.useFakeTimers();
    let judged = null;
    try {
      const host = mountCard({ interval: 21, demo: true, handlers: { onJudge: (k) => { judged = k; } } });
      host.querySelector('.vr-pill.pri').click();
      vi.advanceTimersByTime(1100);
      const next = host.querySelector('.vr-next');
      expect(next.classList.contains('unlock')).toBe(true);
      next.click();
      expect(judged).toBe('got'); // 데모 첫 점수 84 ≥ PASS_THRESHOLD(80)
    } finally { vi.useRealTimers(); }
  });
});

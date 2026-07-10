import { describe, it, expect } from 'vitest';
import { buildChainSteps, hintLevelFor, firstWordsHint, filterNearDupDrills, nearDupDrills, chainHint, pickChainVoice, CHAIN_VOICES } from './applied.js';

const CHAIN = {
  target: "It's been a while since we caught up. We should grab dinner sometime.",
  chunks: ["It's been a while", 'since we caught up', 'We should grab dinner', 'sometime'],
  ko: '오랜만이야. 언제 저녁이나 먹자.',
};

describe('buildChainSteps — 청크 누적으로 단계 생성 (단계 수 고정 X)', () => {
  it('청크 수만큼 단계, 앞에서부터 누적, 마지막 단계는 target 원문', () => {
    const steps = buildChainSteps(CHAIN);
    expect(steps).toHaveLength(4);
    expect(steps[0].text).toBe("It's been a while");
    expect(steps[3].text).toBe(CHAIN.target);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  /* 중간 단계도 target 의 원문 접두부여야 한다. 청크를 이어붙이면 구두점이 사라져
   * "…caught up We should grab dinner"(런온) · "…with that"(물음표 소실) 같은 오디오가 나온다.
   * 무자막 체이닝은 억양 자체가 훈련 대상이므로 구두점 소실은 곧 훈련 내용 손상. (2026-07-10) */
  it('중간 단계가 문장 경계를 넘으면 원문 구두점을 보존한다 (런온 금지)', () => {
    const steps = buildChainSteps(CHAIN);
    expect(steps[1].text).toBe("It's been a while since we caught up.");
    expect(steps[2].text).toBe("It's been a while since we caught up. We should grab dinner");
  });

  it('의문문 접두부는 물음표를 유지한다 (평서문 억양으로 읽히면 안 됨)', () => {
    const steps = buildChainSteps({
      target: 'Is there a problem with that? Just tell me straight.',
      chunks: ['Is there a problem', 'with that', 'Just tell me straight'],
      ko: '그게 뭐 문제 있어? 그냥 솔직하게 말해.',
    });
    expect(steps[0].text).toBe('Is there a problem');
    expect(steps[1].text).toBe('Is there a problem with that?');
  });

  it('청크 단어수 합이 target 과 어긋나면 청크 이어붙이기로 폴백 (토큰화 불일치 안전망)', () => {
    const steps = buildChainSteps({ target: "I'm fine", chunks: ['I am', 'fine'] });
    expect(steps[0].text).toBe('I am');
    expect(steps[1].text).toBe("I'm fine");
  });

  it('chain 부재·청크 2개 미만이면 빈 배열 (렌더 안 함)', () => {
    expect(buildChainSteps(null)).toEqual([]);
    expect(buildChainSteps({ target: 'x', chunks: ['x'] })).toEqual([]);
    expect(buildChainSteps({ target: 'x' })).toEqual([]);
  });
});

describe('hintLevelFor — 3회 실패부터 단계적 힌트 (사용자 결정 2026-07-09)', () => {
  it('2회까지는 힌트 없음, 3회=뜻, 4회=첫 단어, 5회 이상=전체 공개', () => {
    expect(hintLevelFor(0)).toBe(0);
    expect(hintLevelFor(2)).toBe(0);
    expect(hintLevelFor(3)).toBe(1);
    expect(hintLevelFor(4)).toBe(2);
    expect(hintLevelFor(5)).toBe(3);
    expect(hintLevelFor(9)).toBe(3);
  });
});

describe('firstWordsHint — 앞 단어만 노출', () => {
  it('기본 2단어 + 말줄임', () => {
    expect(firstWordsHint("It's been a while")).toBe("It's been …");
    expect(firstWordsHint('sometime')).toBe('sometime …');
    expect(firstWordsHint('')).toBe('');
  });
});

describe('filterNearDupDrills — 호칭·감탄사만 붙인 근접중복은 1개만 남긴다', () => {
  it('근접중복은 첫 1개(영상 원문)만 유지, 진짜 변주는 전부 유지, 순서 보존', () => {
    const base = 'Are you in line?';
    const drills = [
      { en: 'Are you in line?' },                  // 동일 → 유지(1개째)
      { en: 'Sorry, are you in line?' },           // 근접중복 → 제거
      { en: 'Honey, are you in line?' },           // 근접중복 → 제거
      { en: 'Are you in line for the bathroom?' }, // +3단어 → 유지
      { en: 'Is this the line?' },                 // base 미포함 → 유지
    ];
    expect(filterNearDupDrills(base, drills).map((d) => d.en)).toEqual([
      'Are you in line?',
      'Are you in line for the bathroom?',
      'Is this the line?',
    ]);
  });

  it('빈 입력·base 없음은 원본 그대로', () => {
    expect(filterNearDupDrills('', [{ en: 'x' }])).toEqual([{ en: 'x' }]);
    expect(filterNearDupDrills('a', [])).toEqual([]);
  });
});

/* 힌트 lv1(뜻)은 target 전체의 뜻이라, 1단계에서 띄우면 아직 듣지도 않은 뒷 문장을 미리 알려준다.
 * → 중간 단계에서는 뜻을 건너뛰고 첫 단어부터. 마지막 단계에서만 전체 뜻. (2026-07-10) */
describe('chainHint — 중간 단계에서 전체 뜻을 노출하지 않는다', () => {
  const opts = (isLast) => ({ stepText: "It's been a while", ko: '오랜만이야. 언제 저녁이나 먹자.', isLast });

  it('2회까지는 힌트 없음 (단계 무관)', () => {
    expect(chainHint(0, opts(false)).kind).toBe('none');
    expect(chainHint(2, opts(true)).kind).toBe('none');
  });

  it('마지막 단계: 3회=뜻 → 4회=첫 단어 → 5회=전체', () => {
    expect(chainHint(3, opts(true))).toEqual({ kind: 'ko', text: '오랜만이야. 언제 저녁이나 먹자.' });
    expect(chainHint(4, opts(true))).toEqual({ kind: 'first', text: "It's been …" });
    expect(chainHint(5, opts(true))).toEqual({ kind: 'full', text: "It's been a while" });
  });

  it('중간 단계: 뜻을 건너뛰고 3회=첫 단어 → 4회 이상=전체', () => {
    expect(chainHint(3, opts(false))).toEqual({ kind: 'first', text: "It's been …" });
    expect(chainHint(4, opts(false))).toEqual({ kind: 'full', text: "It's been a while" });
    expect(chainHint(9, opts(false)).kind).toBe('full');
  });

  it('중간 단계에서는 어떤 실패 횟수에도 ko 를 반환하지 않는다', () => {
    for (let f = 0; f <= 9; f += 1) expect(chainHint(f, opts(false)).kind).not.toBe('ko');
  });
});

/* 게이트가 '영상 원문 반복(exact)'과 '호칭·감탄사만 덧붙인 것(added)'을 구분해야
 * 전자는 1개 허용, 후자는 0개로 차단할 수 있다. (2026-07-10) */
describe('nearDupDrills — base 완전동일(exact)과 덧붙인 근접중복(added)을 분리', () => {
  it('exact 1 · added 2 · 진짜 변주는 세지 않음', () => {
    expect(nearDupDrills('Are you in line?', [
      { en: 'Are you in line?' },                  // exact
      { en: 'Sorry, are you in line?' },           // added
      { en: 'Honey, are you in line?' },           // added
      { en: 'Are you in line for the bathroom?' }, // +3단어 → 변주
      { en: 'Is this the line?' },                 // base 미포함
    ])).toEqual({ exact: 1, added: 2 });
  });

  /* added 는 정의상 **호칭·감탄사·담화표지·문미태그**만이다(설계 정본).
   * 이들은 쉼표로 분리된 앞/뒤 조각으로 붙는다 — 쉼표 없이 붙는 주어·부사는 진짜 문법 변주다.
   * 대리규칙을 'base 포함 + 2단어 이하'로만 두면 주어 추가를 오탐한다. (2026-07-10 루틴 실행 중 발견) */
  it('쉼표로 붙은 호칭·감탄사·문미태그만 added', () => {
    const base = "It's been a while.";
    expect(nearDupDrills(base, [
      { en: "It's been a while, honey." },   // 뒤 호칭
      { en: "It's been a while, Mikey." },   // 뒤 호칭(이름)
      { en: "Honey, it's been a while." },   // 앞 호칭
      { en: "It's been a while, right?" },   // 문미태그
    ])).toEqual({ exact: 0, added: 4 });
  });

  it('쉼표 없이 주어·부사를 붙인 것은 변주 — 막지 않는다', () => {
    expect(nearDupDrills('Seems like yesterday.', [
      { en: 'Our wedding seems like yesterday.' }, // 주어 추가 → 변주
      { en: 'The trip seems like yesterday.' },    // 주어 추가 → 변주
    ])).toEqual({ exact: 0, added: 0 });

    expect(nearDupDrills('How have you been?', [
      { en: 'How have you been lately?' },         // 부사 추가 → 변주
      { en: 'How have you been, honey?' },         // 호칭 → added
    ])).toEqual({ exact: 0, added: 1 });
  });

  it('빈 입력은 0/0', () => {
    expect(nearDupDrills('', [{ en: 'x' }])).toEqual({ exact: 0, added: 0 });
    expect(nearDupDrills('a', [])).toEqual({ exact: 0, added: 0 });
  });
});

describe('filterNearDupDrills — 호칭류만 걷어내고 진짜 변주는 남긴다', () => {
  it('주어를 붙인 변주는 화면에서 지우지 않는다 (구 규칙은 지웠음)', () => {
    const kept = filterNearDupDrills('Seems like yesterday.', [
      { en: 'Seems like yesterday.' },             // exact → 1개 유지
      { en: 'Seems like yesterday, doesn\'t it?' }, // 문미태그 → 제거
      { en: 'Our wedding seems like yesterday.' }, // 변주 → 유지
    ]).map((d) => d.en);
    expect(kept).toEqual(['Seems like yesterday.', 'Our wedding seems like yesterday.']);
  });
});

describe('pickChainVoice — 재생마다 화자·속도를 바꿔 리듬 암기를 막는다', () => {
  it('호출 인덱스로 순환하고, 연속 재생은 서로 다른 화자', () => {
    const a = pickChainVoice(0);
    const b = pickChainVoice(1);
    expect(a.voice).not.toBe(b.voice);
    expect(pickChainVoice(CHAIN_VOICES.length)).toEqual(a); // 순환
    expect(typeof a.rate).toBe('number');
  });
});

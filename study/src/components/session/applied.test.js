import { describe, it, expect } from 'vitest';
import { buildChainSteps, hintLevelFor, firstWordsHint, filterNearDupDrills, pickChainVoice, CHAIN_VOICES } from './applied.js';

const CHAIN = {
  target: "It's been a while since we caught up. We should grab dinner sometime.",
  chunks: ["It's been a while", 'since we caught up', 'We should grab dinner', 'sometime'],
  ko: '오랜만이야. 언제 저녁이나 먹자.',
};

describe('buildChainSteps — 청크 누적으로 단계 생성 (단계 수 고정 X)', () => {
  it('청크 수만큼 단계, 앞에서부터 누적, 마지막 단계는 target 원문(구두점 보존)', () => {
    const steps = buildChainSteps(CHAIN);
    expect(steps).toHaveLength(4);
    expect(steps[0].text).toBe("It's been a while");
    expect(steps[1].text).toBe("It's been a while since we caught up");
    expect(steps[2].text).toBe("It's been a while since we caught up We should grab dinner");
    expect(steps[3].text).toBe(CHAIN.target); // 마지막은 자연스러운 원문
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3]);
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

describe('pickChainVoice — 재생마다 화자·속도를 바꿔 리듬 암기를 막는다', () => {
  it('호출 인덱스로 순환하고, 연속 재생은 서로 다른 화자', () => {
    const a = pickChainVoice(0);
    const b = pickChainVoice(1);
    expect(a.voice).not.toBe(b.voice);
    expect(pickChainVoice(CHAIN_VOICES.length)).toEqual(a); // 순환
    expect(typeof a.rate).toBe('number');
  });
});

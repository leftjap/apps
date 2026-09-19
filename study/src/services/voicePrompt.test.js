import { describe, it, expect } from 'vitest';
import { buildVoicePrompt, normalizeVoiceItems } from './voicePrompt.js';

/* 2026-09-19 재설계 2판 — 정본은 specs/study-app-spec.md §9-9 "프롬프트".
 * 음성 대화는 학습 세션에서 배운 것을 숙달하는 자리다. 문항 유형이 하나뿐이면 단조로워 숙달이 안 된다.
 * 패턴마다 여섯 단계(따라 말하기 → 뜻 → 한국어에서 영어 → 슬롯 바꾸기 → 응용 질문에 답 → 질문 만들기)를
 * 올라가고, 횟수가 아니라 통과 기준(힌트 없이 연속 두 번)으로 끝낸다. */

const dialogue = [
  { speaker: 'A', en: 'We landed early.', ko: '일찍 내렸어.' },
  { speaker: 'B', en: "I'm on my way.", ko: '가는 중이야.' },
];

const card1 = {
  expr: 'on my way',
  sentence: "I'm on my way.",
  ko: '가는 중이야.',
  situation: '공항에 마중 나가는 길',
  miniDialogue: dialogue,
  drills: [
    { en: "I'm on my way to the airport.", ko: '공항 가는 중이야.' },
    { en: 'Are you on your way?', ko: '오는 중이야?' },
    { en: 'My wife is on her way.', ko: '아내가 오는 중이야.' },
  ],
};

const card2 = {
  expr: 'almost there',
  sentence: "I'm almost there.",
  ko: '거의 다 왔어.',
  situation: '공항에 마중 나가는 길',
  miniDialogue: dialogue,
  drills: [{ en: "We're almost there.", ko: '거의 다 왔어.' }],
};

describe('buildVoicePrompt — 패턴 숙달 단계 (2026-09-19 2판)', () => {
  it('패턴마다 짧은 형태와 목표 문장을 함께 준다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toContain('P1 (on my way)');
    expect(p).toContain('short "I\'m on my way to the airport." = 공항 가는 중이야.');
    expect(p).toContain('goal "I\'m on my way." = 가는 중이야.');
    expect(p).toContain('P2 (almost there)');
  });

  it('슬롯 바꾸기 재료로 이미 연습한 드릴을 붙인다 (짧은 형태는 빼고)', () => {
    const p = buildVoicePrompt([card1]);
    const line = p.split('\n').find((l) => l.trim().startsWith('practiced:'));
    expect(line).toContain('"Are you on your way?"');
    expect(line).toContain('"My wife is on her way."');
    expect(line).not.toContain('"I\'m on my way to the airport."'); // short 로 이미 나왔다
  });

  it('드릴이 없으면 practiced 줄을 만들지 않고 짧은 형태가 곧 목표 문장이다', () => {
    const p = buildVoicePrompt([{ expr: 'on my way', sentence: "I'm on my way.", ko: '가는 중이야.' }]);
    expect(p).toContain('short "I\'m on my way." = 가는 중이야.');
    expect(p).not.toContain('goal "I\'m on my way."'); // 같은 문장을 두 번 적지 않는다
    expect(p).not.toContain('practiced:');
  });

  it('구문이 목표 문장과 같으면 괄호로 또 적지 않는다 (시드 88%가 문장형 키)', () => {
    const p = buildVoicePrompt([
      { expr: "I didn't sleep at all", sentence: "I didn't sleep at all.", ko: '하나도 안 잤어.', drills: [{ en: "I didn't eat at all.", ko: '아무것도 안 먹었어.' }] },
    ]);
    expect(p).toContain('P1 ');
    expect(p).not.toContain("(I didn't sleep at all)");
  });

  it('교사가 학습자의 영어 문장을 먼저 말하지 못하게 못박는다 (앵무새 방지)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/never say an English sentence that I am supposed to say/i);
    expect(p).toMatch(/your English is only for asking me questions/i);
    expect(p).toMatch(/everything else you say is in Korean/i);
  });

  it('따라 말하기가 쓸모없다고 학습자 상태에 적는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/repeating after you teaches me nothing/i);
    expect(p).toMatch(/what I cannot do is build a sentence myself/i);
  });

  it('네 단계 모두 학습자가 문장을 만드는 쪽이다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/A\. Say a Korean meaning\. I say the English/i);
    expect(p).toMatch(/B\. Say in Korean only what to change, three words or fewer/i);
    expect(p).toMatch(/I say the whole new sentence\. A different change every turn/i);
    expect(p).toMatch(/C\. Ask me a question in English in this pattern\. I answer in English with a change of my own/i);
    expect(p).toMatch(/D\. Say an answer in Korean\. I build the English question that gets that answer/i);
    expect(p).not.toMatch(/I repeat it once/i);
    expect(p).not.toMatch(/I tell you the Korean meaning/i);
  });

  it('통과는 같은 문장 두 번이 아니라 서로 다른 항목 두 개 연속이다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/a step passes when I get two different items right in a row with no hint and no correction/i);
    expect(p).toMatch(/never ask me the same item twice in a row/i);
  });

  it('패턴을 넘어가기 전에 이미 통과한 패턴을 하나 섞어 묻는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toMatch(/when steps B, C and D have passed, this pattern is done/i);
    expect(p).toMatch(/before you start the next pattern, ask me one item from a pattern that already passed/i);
  });

  it('모델 문장은 힌트가 두 번 실패한 뒤에만 나온다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/only if the hint fails twice, say the whole sentence once/i);
    expect(p).toContain('say "따라 하세요."');
    expect(p).toMatch(/that is the only time you say my sentence/i);
  });

  it('같은 단계에서 세 번 막히면 접고 다음 패턴으로 간다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/if I miss the same step three times, leave this pattern for today and start the next one/i);
  });

  it('마지막은 통과한 패턴을 섞은 대본 없는 대화다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/mix all the passed patterns in a short real conversation/i);
    expect(p).toMatch(/no script/i);
  });

  it('질문 소재가 되도록 상황을 배경 줄로 넣고 같은 상황은 한 번만 적는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    const bg = p.split('\n').filter((l) => l.includes('공항에 마중 나가는 길'));
    expect(bg).toHaveLength(1);
    expect(bg[0]).toMatch(/so your questions make sense/i);
  });

  it('짧은 형태는 구문을 포함하는 드릴 중 최단이고 단어 경계까지 본다', () => {
    const p = buildVoicePrompt([
      { expr: 'I keep ~', sentence: 'I keep waking up before you do.', ko: '자꾸 깨.', drills: [
        { en: 'Nani keeps waking me up.', ko: '나니가 깨워.' },
        { en: 'I keep waking up at four.', ko: '자꾸 4시에 깨.' },
      ] },
    ]);
    expect(p).toContain('short "I keep waking up at four." = 자꾸 4시에 깨.');
  });

  it('~ 가 중간에 있는 구문은 앞부분으로 맞춘다', () => {
    const p = buildVoicePrompt([
      { expr: 'How about ~?', sentence: 'How about Friday?', ko: '금요일 어때?', drills: [
        { en: 'How about next Friday afternoon?', ko: '다음 주 금요일 오후 어때?' },
        { en: 'How about tomorrow?', ko: '내일 어때?' },
      ] },
    ]);
    expect(p).toContain('short "How about tomorrow?" = 내일 어때?');
  });

  it('첫 줄이 ChatGPT 안내이고 텍스트 답장 뒤 음성이라고 말한다', () => {
    const p = buildVoicePrompt([card1]);
    const first = p.split('\n')[0];
    expect(first).toContain('ChatGPT');
    expect(first).toContain('텍스트 답장');
    expect(p).not.toMatch(/클로드|Claude|Haiku/i);
  });

  it('마지막 줄은 한국어 한 줄 뒤 첫 패턴의 A 단계로 시작하라는 지시다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p.trim()).toMatch(/then step A of the first pattern\.$/);
  });

  it('문자열만 준 옛 호출도 안전', () => {
    const p = buildVoicePrompt(['close by', 'take a break']);
    expect(p).toContain('short "close by"');
    expect(p).toContain('short "take a break"');
  });

  it('표현 비어도, 비배열이어도 안전한 문자열 반환', () => {
    expect(buildVoicePrompt([]).length).toBeGreaterThan(200);
    expect(typeof buildVoicePrompt(null)).toBe('string');
    expect(typeof buildVoicePrompt(undefined)).toBe('string');
  });

  it('normalizeVoiceItems — 문자열·객체 혼합, 빈 값 제거, 미니대화·드릴은 배열만 살린다', () => {
    expect(normalizeVoiceItems(['a', { expr: ' b ', situation: 's', ko: '뜻', miniDialogue: 'x', drills: null }, { expr: '' }, null])).toEqual([
      { expr: 'a', situation: '', sentence: '', ko: '', miniDialogue: [], drills: [] },
      { expr: 'b', situation: 's', sentence: '', ko: '뜻', miniDialogue: [], drills: [] },
    ]);
    const [n] = normalizeVoiceItems([card1]);
    expect(n.miniDialogue).toHaveLength(2);
    expect(n.drills).toHaveLength(3);
  });
});

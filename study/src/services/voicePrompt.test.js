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

  it('여섯 단계를 이름과 할 일로 준다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/A\. Say the short form\. I repeat it once/i);
    expect(p).toMatch(/B\. Say it in English\. I tell you the Korean meaning\. Only the first time a sentence is new to me/i);
    expect(p).toMatch(/C\. Say a Korean meaning\. I say the English/i);
    expect(p).toMatch(/D\. You change one word and say it; I repeat it once/i);
    expect(p).toMatch(/first the word that says what it is about, then the subject, then the time/i);
    expect(p).toMatch(/E\. Ask me a question in this pattern that needs a changed answer/i);
    expect(p).toMatch(/F\. Give me an answer\. I build the question in this pattern/i);
  });

  it('슬롯은 한 번에 하나만 바꾼다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/one change per turn, never two/i);
  });

  it('통과는 횟수가 아니라 힌트 없이 연속 두 번이다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/a step passes when I get it right twice in a row with no hint and no correction/i);
    expect(p).toMatch(/when D, E and F have passed, this pattern is done for today/i);
  });

  it('같은 단계에서 세 번 막히면 오늘은 접고 다음 패턴으로 간다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/if I miss the same step three times, leave this pattern for today and start the next one/i);
  });

  it('마지막은 통과한 패턴으로 대본 없는 짧은 대화다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/after the last pattern, use the ones that passed in a short real conversation/i);
    expect(p).toMatch(/no script/i);
  });

  it('단계 문자와 패턴 번호는 소리 내지 않는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/never say the step letters, the pattern numbers, or the text in \( \)/i);
    expect(p).toMatch(/never tell me which pattern to use/i);
  });

  it('힌트·모델·역할 이탈·교정 범위·칭찬 금지 규칙은 그대로 둔다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/never say my line for me/i);
    expect(p).toMatch(/the first two words, or in Korean what to fix in three words or fewer/i);
    expect(p).toContain('say "따라 하세요."');
    expect(p).toContain('그건 제 대사예요');
    expect(p).toMatch(/always fix a missing be-verb, a missing subject, or a wrong tense/i);
    expect(p).toMatch(/ignore article and preposition slips/i);
    expect(p).toMatch(/no praise/i);
  });

  it('한 턴 하나·5초 대기·열두 단어 제한은 그대로 둔다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/one thing per turn/i);
    expect(p).toMatch(/wait at least five seconds/i);
    expect(p).toMatch(/under twelve words/i);
    expect(p).toMatch(/I must talk more than you/i);
  });

  it('리포트는 패턴별 통과·힌트·못함과 내일 할 것이다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toMatch(/say its short form and one word: 통과 \/ 힌트 \/ 못함/i);
    expect(p).toMatch(/one sentence on what to drill tomorrow/i);
  });

  it('대본 대화를 넣지 않는다 (2026-09-14 실기에서 구간 전체가 따라 말하기로 무너졌다)', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).not.toContain('We landed early.');
    expect(p).not.toContain('(I answer:');
    expect(p.split('\n').filter((l) => /^\d+\. /.test(l))).toHaveLength(0);
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

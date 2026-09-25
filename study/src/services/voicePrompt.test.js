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
  it('짧은 형태는 앱에서 배운 목표 문장이다 (2026-09-25 실사용: 드릴 중 최단을 고르자 네 패턴이 모두 응용 문장으로 연습됐다)', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toContain('P1 (on my way)');
    expect(p).toContain('short "I\'m on my way." = 가는 중이야.');
    expect(p).not.toContain('short "I\'m on my way to the airport."');
    expect(p).not.toContain('goal "'); // 짧은 형태가 곧 목표 문장이라 따로 적지 않는다
    expect(p).toContain('P2 (almost there)');
  });

  it('드릴이 목표 문장보다 짧아도 목표 문장으로 연습한다 (2026-09-25: "It looks like rain." 이 배운 문장을 밀어냈다)', () => {
    const p = buildVoicePrompt([{ expr: 'It looks like ~', sentence: "It looks like there's one table left.", ko: '자리 하나 남은 것 같아.', drills: [
      { en: 'It looks like rain.', ko: '비 올 것 같아.' },
      { en: "It looks like they're full.", ko: '만석인 것 같아.' },
    ] }]);
    expect(p).toContain(`short "It looks like there's one table left." = 자리 하나 남은 것 같아.`);
    const line = p.split('\n').find((l) => l.trim().startsWith('practiced:'));
    expect(line).toContain('"It looks like rain."');
  });

  it('치환 재료로 연습한 드릴을 전부 붙인다', () => {
    const p = buildVoicePrompt([card1]);
    const line = p.split('\n').find((l) => l.trim().startsWith('practiced:'));
    expect(line).toContain('"I\'m on my way to the airport."');
    expect(line).toContain('"Are you on your way?"');
    expect(line).toContain('"My wife is on her way."');
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
    expect(p).toMatch(/while we drill, never say an English sentence that I am supposed to say/i);
    expect(p).toMatch(/there your English is only for asking me questions/i); // 12회전: 대화 구간까지 걸려 교사가 한국어로 답했다
  });

  it('세션 분량을 발화 횟수로 준다 (7회전: 너무 짧았다)', () => {
    const p = buildVoicePrompt([card1]);
  });

  it('따라 말하기가 쓸모없다고 학습자 상태에 적는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/repeating after you teaches me nothing/i);
    expect(p).toMatch(/what I cannot do is build a sentence myself/i);
  });

  it('복습 → 바꿔 말하기 → 질문과 답 세 단계를 섞지 않고 순서대로 간다 (20회전: 한 바퀴 안에 다 섞여 있었다)', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toMatch(/work in three stages, in this order, and never mix them/i);
    expect(p).toContain('A. 복습 — say "복습부터 합니다"');
    expect(p).toContain('B. 바꿔 말하기 — say "이제 바꿔 말하기입니다"');
    expect(p).toContain('C. 질문과 답 — say "이제 질문과 답입니다"');
  });

  it('복습은 네 문장을 한 번 훑고 아무것도 바꾸지 않는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toMatch(/say the short form once in English, I repeat it once, then say its Korean meaning and I say the English from meaning/i);
    expect(p).toMatch(/nothing changed yet\. One pass over every sentence/i);
  });

  it('바꿔 말하기는 슬롯별 패스로 돌아 같은 문장이 연속으로 오지 않는다 (21회전: 문장별로 두 바퀴를 붙여 돌았다)', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toMatch(/work in passes, one slot per pass, and in each pass go through every sentence in order before you change slot/i);
    expect(p).toMatch(/pass one the subject, pass two the thing or activity, pass three the time/i);
    expect(p).toMatch(/never take the same sentence twice in a row/i);
    // 2026-09-25 실사용: "It looks like rain" 에 "주어를 지금 날씨로" 를 주고, 맞게 바꾼 답은 틀이 깨진다며 되돌렸다
    expect(p).toMatch(/if changing a sentence's subject would break the pattern — "It looks like ~", or a command like "Don't forget to ~" — change its thing or activity in the subject pass instead/i);
    expect(p).toMatch(/three passes in all, so 6 answers from me/i);
    expect(p).not.toMatch(/the same three passes again/i);
    expect(p).toContain('"주어를 소연으로", "동작을 운동으로", "시간을 이번 주로"');
    // 24회전: 단서 낱말 출처가 없어 교사가 하품·독서·낮잠을 지어냈다
    expect(p).toMatch(/take the new word from my day or from the practiced lines, never from outside my life/i);
    expect(p).toMatch(/every change starts from that sentence's short form, never from my last answer/i);
  });

  it('단계마다 분량을 따로 주되 인출 단계에 무게를 싣는다 (24회전: 기계적인 치환이 24, 의미가 붙는 인출이 16이었다)', () => {
    const p = buildVoicePrompt([card1, card2, card1, card2]);
    expect(p).toMatch(/I speak about 44 times in the drill — 8 in review, 12 in the substitutions, 24 in the questions/);
  });

  it('대화 되묻기 시점을 내 턴으로 센다 (23회전: 교사 질문으로 세니 8턴 안에 질문이 7개뿐이라 3회였다)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/after my first, third, fifth and seventh turn, answer in one English line with no question and add "이번엔 저한테 물어보세요"/i);
    expect(p).not.toMatch(/after your second question/i);
  });

  it('질문과 답 단계에서 문장을 섞고 분량으로 끝낸다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toMatch(/now mix the sentences/i);
    expect(p).toContain('이번엔 질문을 만드세요');
    expect(p).toMatch(/keep alternating those two for 12 answers from me/i);
    expect(p).toMatch(/in this stage a slot cue is wrong/i);   // 21회전: C 에서 B 단서로 교정했다
    expect(p).toMatch(/never "주어를 …으로"/);
  });

  it('문장이 바뀔 때마다 어느 문장인지 한국어로 알려 준다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/before each new sentence in A and B, say in Korean which sentence it is, using the Korean of its short form/i);
  });

  it('패턴 시작에 한 번만 들려주고 따라 하게 한다 (7회전: 첫 턴부터 작문을 요구했다)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/when a pattern starts, say its short form once in English and I repeat it once/i);
    expect(p).toMatch(/that is not scored\. Never say that sentence again/i);
  });

  it('세션 분량을 발화 횟수로 준다 (7회전: 너무 짧았다)', () => {
    const p = buildVoicePrompt([card1]);
  });

  it('따라 말하기가 쓸모없다고 학습자 상태에 적는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/repeating after you teaches me nothing/i);
    expect(p).toMatch(/what I cannot do is build a sentence myself/i);
  });

  it('패턴 시작에 한 번만 들려주고 따라 하게 한다 (7회전: 첫 턴부터 작문을 요구했다)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/when a pattern starts, say its short form once in English and I repeat it once/i);
    expect(p).toMatch(/that is not scored\. Never say that sentence again/i);
  });

  it('리포트는 짧은 형태 + 한 단어 + 내일 한 줄로만', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toMatch(/at the end say only this and nothing else/i);
    expect(p).toMatch(/one word, and only one of these three with nothing added in brackets or parentheses/i); // 19회전: '혼자 (미진행)' 이 나왔다
    // 12회전: 모델 2회가 있었는데도 전부 힌트로 뭉갰다 — 판단이 아니라 셈으로
    expect(p).toMatch(/count per pattern how many times you hinted and how many times you said my sentence for me/i);
    expect(p).toMatch(/못함 if you said my sentence one or more times/i)
    expect(p).toMatch(/give the report once; if I ask again, say only "끝났습니다"/i);
    expect(p).toMatch(/then one line starting 내일은/i);
  });

  it('마지막은 대화로 넘어가고 리포트 통제어가 있다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toContain('say in Korean "이제 대화합니다"');
    // 12회전: 대화 구간에서 오답 처리·힌트가 나왔다
    expect(p).toMatch(/the drill rules stop there/i);
    expect(p).toMatch(/never correct me and never hint\. There is no right answer to reach/i);
    expect(p).toMatch(/answer it in English in one short line/i);
    // 14회전: 자기가 AI라고 답해 대화가 겉돌았다
    expect(p).toMatch(/you are a person in my day, not an assistant/i);
    expect(p).toMatch(/never say you are an AI or that you do not sleep, eat or have a pet/i);
    // 14회전: 답과 리포트를 한 턴에 냈다
    // 18회전: 말만 하고 기다리는 턴은 모델이 건너뛴다 — 마커를 리포트 턴 머리에 붙인다
    expect(p).toMatch(/in a turn that holds nothing but the report, open with "리포트 하겠습니다" in Korean/i);
    expect(p).toMatch(/never finish on a turn where I asked you something/i);
    // 13회전: 내 질문을 씹고 6턴에서 끊었다
    expect(p).toMatch(/answer every question I ask before you move on/i);
    expect(p).toMatch(/do not stop before my eighth turn; never stop on a turn where I asked you something/i);
    expect(p).toMatch(/if I say 리포트, stop everything and give the report now/i);
  });

  it('낱말이 달라도 자리와 패턴이 맞으면 받아들인다 (15회전: 맞는 답을 되돌려 교정이 31%였다)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/accept my sentence whenever it keeps the pattern and changes the slot you asked for/i);
    expect(p).toMatch(/do not send me back for a word choice/i);
    expect(p).toMatch(/always fix a missing be-verb, a missing subject, or a wrong tense/i);
  });

  it('질문 소재가 되도록 상황을 배경 줄로 넣고 같은 상황은 한 번만 적는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    const bg = p.split('\n').filter((l) => l.includes('공항에 마중 나가는 길'));
    expect(bg).toHaveLength(1);
    expect(bg[0]).toMatch(/so your cues and questions come from my life/i);
  });

  it('첫 줄이 ChatGPT 안내이고 텍스트 답장 뒤 음성이라고 말한다', () => {
    const p = buildVoicePrompt([card1]);
    const first = p.split('\n')[0];
    expect(first).toContain('ChatGPT');
    expect(first).toContain('텍스트 답장');
    expect(p).not.toMatch(/클로드|Claude|Haiku/i);
  });

  it('마지막 줄은 한국어 한 줄 뒤 첫 패턴으로 시작하라는 지시다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p.trim()).toMatch(/then the first pattern\.$/);
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

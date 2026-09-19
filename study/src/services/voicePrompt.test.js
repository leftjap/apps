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
    expect(p).toMatch(/while we drill, never say an English sentence that I am supposed to say/i);
    expect(p).toMatch(/there your English is only for asking me questions/i); // 12회전: 대화 구간까지 걸려 교사가 한국어로 답했다
  });

  it('패턴 시작에 한 번만 들려주고 따라 하게 한다 (7회전: 첫 턴부터 작문을 요구했다)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/when a pattern starts, say its short form once in English and I repeat it once/i);
    expect(p).toMatch(/that is not scored\. Never say that sentence again/i);
  });

  it('세션 분량을 발화 횟수로 준다 (7회전: 너무 짧았다)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/about fifteen minutes, so make me speak at least sixty times/i);
  });

  it('따라 말하기가 쓸모없다고 학습자 상태에 적는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/repeating after you teaches me nothing/i);
    expect(p).toMatch(/what I cannot do is build a sentence myself/i);
  });

  it('여섯 가지 단서를 순서대로 돌리는 회전 구조다 (8회전: 단계·통과 판정을 동시에 세다 위치를 잃었다)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/rotate through these six cue types in order, again and again with new content/i);
    // 13회전: 기준 문장을 놓쳐 교정이 잦았다
    expect(p).toMatch(/before each lap of the six, say in Korean which sentence the lap works from/i);
    expect(p).toMatch(/every change starts from the short form, never from my last sentence/i); // 9회전: 치환이 누적돼 기억 부담이 커졌다
    expect(p).toMatch(/1\. the whole meaning in Korean — I say the English/);
    expect(p).toMatch(/2\. the subject to change — I say the whole new sentence/);
    expect(p).toMatch(/3\. the thing or activity to change/);
    expect(p).toMatch(/4\. the time or place to change/);
    // 11회전: "4시로요" 처럼 자리를 빼면 어느 자리를 바꾸는지 몰라 계속 틀렸다
    expect(p).toMatch(/a change cue is two Korean words: the slot, then the new word/i);
    expect(p).toContain('"주어를 소연으로", "동작을 운동으로", "시간을 이번 주로"');
    expect(p).toMatch(/never describe it and never leave the slot out/i);
    expect(p).toMatch(/5\. a question from you in English — I answer in English, changing something myself/);
    expect(p).toContain('이번엔 질문을 만드세요');
  });

  it('세어야 할 것이 패턴당 문장 수 하나다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/keep rotating until I have said about twenty sentences for this pattern/i);
    expect(p).toContain('say in Korean "다음으로 갑니다"');
    expect(p).toMatch(/if my last six in a row were right with no help, you may move on early/i);
    // 8회전에서 지워진 것들 — 동시에 세게 만들면 안 된다
    expect(p).not.toMatch(/a step passes only after/i);
    expect(p).not.toMatch(/at four wrong in one step/i);
    expect(p).not.toMatch(/at least eight changes/i);
  });

  it('패턴 시작에 한 번만 들려주고 따라 하게 한다 (7회전: 첫 턴부터 작문을 요구했다)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/when a pattern starts, say its short form once in English and I repeat it once/i);
    expect(p).toMatch(/that is not scored\. Never say that sentence again/i);
  });

  it('세션 분량을 발화 횟수로 준다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/about fifteen minutes, so make me speak at least sixty times/i);
  });

  it('리포트는 짧은 형태 + 한 단어 + 내일 한 줄로만', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toMatch(/at the end say only this and nothing else/i);
    expect(p).toMatch(/one word, and only one of these three/i);
    // 12회전: 모델 2회가 있었는데도 전부 힌트로 뭉갰다 — 판단이 아니라 셈으로
    expect(p).toMatch(/count per pattern how many times you hinted and how many times you said my sentence for me/i);
    expect(p).toMatch(/못함 if you said my sentence one or more times/i)
    expect(p).toMatch(/give the report once; if I ask again, say only "끝났습니다"/i);
    expect(p).toMatch(/then one line starting 내일은/i);
  });

  it('마지막은 대화로 넘어가고 리포트 통제어가 있다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toContain('say in Korean "이제 대화합니다"');
    expect(p).toMatch(/every second question of yours is followed by "이번엔 저한테 물어보세요"/i);
    expect(p).toMatch(/so I ask you as often as you ask me/i); // 16회전: 여덟 턴에 2회뿐이었다
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
    expect(p).toMatch(/do not stop before eight; never stop on a turn where I asked you something/i);
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

import { describe, it, expect } from 'vitest';
import { buildVoicePrompt, normalizeVoiceItems } from './voicePrompt.js';

/* 2026-09-15 재설계 — 2026-09-14 실기 세션이 대화 구간에서 통째로 무너졌다(따라 말하기만 남고 드릴·질문·마무리 미도달).
 * 산문 규칙 대신 교사 대사를 단계로 적고, 같은 미니대화를 카드마다 반복하지 않는다. */

const dialogue = [
  { speaker: 'A', en: 'We landed early. It’s 4:20.', ko: '일찍 내렸어. 4시 20분이야.' },
  { speaker: 'B', en: "I'm on my way.", ko: '가는 중이야.' },
  { speaker: 'A', en: 'Take your time.', ko: '천천히 와.' },
  { speaker: 'B', en: "I'm almost there.", ko: '거의 다 왔어.' },
];

const card1 = {
  expr: 'on my way',
  sentence: "I'm on my way.",
  ko: '가는 중이야.',
  miniDialogue: dialogue,
  drills: [
    { en: "I'm on my way to the airport.", ko: '공항 가는 중이야.' },
    { en: 'Are you on your way?', ko: '오는 중이야?' },
    { en: 'She is on her way home.', ko: '그 사람은 집에 오는 중이야.' },
    { en: 'My wife is on her way.', ko: '아내가 오는 중이야.' },
  ],
};

const card2 = {
  expr: 'almost there',
  sentence: "I'm almost there.",
  ko: '거의 다 왔어.',
  miniDialogue: dialogue, // 같은 대화 세션의 카드는 미니대화가 동일하다 (seeds/en-personal-2026-09-13.json)
  drills: [{ en: "We're almost there.", ko: '거의 다 왔어.' }],
};

const stepsOf = (p) => p.split('\n').filter((l) => /^\d+\. /.test(l));

describe('buildVoicePrompt — 단계 대본 (2026-09-15 재설계)', () => {
  it('오늘 문장을 S번호·뜻·핵심 표현으로 먼저 적는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toContain('S1 "I\'m on my way." = 가는 중이야.  (key: on my way)');
    expect(p).toContain('S2 "I\'m almost there." = 거의 다 왔어.  (key: almost there)');
  });

  it('단계 번호가 1부터 빠짐없이 이어진다', () => {
    const nums = stepsOf(buildVoicePrompt([card1, card2])).map((l) => Number(l.split('.')[0]));
    expect(nums.length).toBeGreaterThan(10);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it('문장마다 들려주고 강세 짚고 한국어 뜻으로 따라 하게 하는 단계가 앞에 온다', () => {
    const s = stepsOf(buildVoicePrompt([card1, card2]));
    expect(s[0]).toBe('1. Say "I\'m on my way." In Korean, point out one stress or linked sound, then the meaning: 가는 중이야. Then say "I\'m on my way." again and in Korean: 따라 해 보세요.');
    expect(s[1]).toContain('Say "I\'m almost there."');
    expect(s[1]).toContain('the meaning: 거의 다 왔어.');
    expect(s[1]).toContain('again and in Korean: 따라 해 보세요.');
  });

  it('대화 시작 안내는 첫 A 대사와 한 단계로 붙인다 (안내만 하고 기다리는 빈 턴 금지)', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toContain('In Korean: 이제 대화 연습입니다. 따라 말하지 말고 제 말에 영어로 답하세요. 첫 대사는 "I\'m on my way." 입니다. Then say "We landed early. It’s 4:20."  (I answer: I\'m on my way.)');
  });

  it('안내를 담은 단계에도 내가 말할 차례가 붙어 있다', () => {
    const p = buildVoicePrompt([card1, card2]);
    const guides = p.split('\n').filter((l) => /이제 대화 연습입니다|한 번 더 합니다|이제 한국어를 듣고/.test(l));
    expect(guides).toHaveLength(3);
    guides.forEach((l) => expect(l).toContain('(I answer:'));
  });

  it('A 대사마다 내가 답할 B 대사를 괄호로 달아 둔다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/say "We landed early\. It’s 4:20\."  \(I answer: I'm on my way\.\)/i); // 첫 단계는 안내가 붙어 소문자 then say
    expect(p).toContain('Say "Take your time."  (I answer: I\'m almost there.)');
  });

  it('같은 미니대화는 카드 수와 무관하게 한 번만, 두 번 반복으로 넣는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    const runs = (p.match(/say "We landed early\. It’s 4:20\."/gi) || []).length;
    expect(runs).toBe(2); // 카드 2장이어도 4번이 아니라 2회전
    expect(p).toContain('In Korean: 같은 대화를 한 번 더 합니다. 이번에도 제 말에 답하세요. Then say "We landed early. It’s 4:20."');
  });

  it('B 가 먼저 말하는 대화면 나에게 먼저 말하라고 한다', () => {
    const p = buildVoicePrompt([{ ...card1, miniDialogue: [{ speaker: 'B', en: 'Hi.' }, { speaker: 'A', en: 'Hello.' }] }]);
    expect(p).toContain('첫 대사는 "Hi." 입니다. 먼저 말하세요.  (I answer: Hi.)');
  });

  it('드릴은 앞 세 개만, 한국어를 말하고 내가 영어로 답하는 단계로 넣는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toContain('In Korean: 이제 한국어를 듣고 영어로 말하세요. Then say in Korean: 공항 가는 중이야.  (I answer: I\'m on my way to the airport.)');
    expect(p).toContain('Say in Korean: 오는 중이야?  (I answer: Are you on your way?)');
    expect(p).not.toContain('My wife is on her way.');
  });

  it('문장마다 내가 그 문장으로 답할 질문을 하나 묻는 단계가 드릴 뒤에 온다', () => {
    const p = buildVoicePrompt([card1]);
    const i3 = p.indexOf('Say in Korean: 공항 가는 중이야.');
    const iq = p.indexOf('Ask me in English one simple question that I would answer with "I\'m on my way."');
    expect(iq).toBeGreaterThan(i3);
  });

  it('마지막 단계는 한국어로 혼자 말한 문장과 도움받은 문장을 알려주는 것이다', () => {
    const s = stepsOf(buildVoicePrompt([card1, card2]));
    const last = s[s.length - 1];
    expect(last).toContain('In Korean, go through S1 to S2 one by one and say for each: 혼자 말함, 도움 받음, or 안 나옴.');
    expect(last).toMatch(/in full at least once with no hint and no correction from you/i);
    expect(last).toMatch(/a Korean 안내 that names my first line is not a hint/i);
  });

  it('한 턴에 한 단계, 합치지 말고, 기다리라는 규칙을 맨 앞에 둔다', () => {
    const p = buildVoicePrompt([card1]);
    const iRule = p.search(/Do ONE numbered step per turn/);
    const iStep1 = p.indexOf('1. Say');
    expect(iRule).toBeGreaterThan(-1);
    expect(iRule).toBeLessThan(iStep1);
    expect(p).toMatch(/never merge two steps/i);
    expect(p).toMatch(/then stop and wait for me/i);
  });

  it('내가 상대 대사를 따라 말하면 역할을 한국어로 교정하고 첫 두 단어만 준다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toContain('그건 제 대사예요');
    expect(p).toMatch(/first two words of my line/i);
    expect(p).toMatch(/never say my whole line for me/i);
  });

  it('계속하라고 하면 빈 대답 말고 다음 단계로 간다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/move to the next step/i);
    expect(p).toMatch(/never reply with only/i);
  });

  it('힌트·교정 턴은 단계로 세지 않는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/a hint or a correction is not a step/i);
    expect(p).toMatch(/stay on the same step/i);
  });

  it('따라 하기 단계에서 내 영어를 그대로 반복하는 것은 정답이라고 못박는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/따라 해 보세요.*repeating your English line is exactly what I should do/i);
  });

  it('부분 답에는 멈춘 자리부터 이어지는 다음 단어를 준다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/if I stop partway/i);
    expect(p).toMatch(/next one or two words from where I stopped/i);
    expect(p).toMatch(/if that would finish my line, say the Korean meaning instead/i);
  });

  it('한국어로 답하거나 다른 문장을 말해도 같은 줄에서 처리한다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/if I answer in Korean, or with a different sentence from today/i);
    expect(p).toMatch(/say in Korean which sentence I need now/i);
  });

  it('두 번 도와도 못 끝내면 한 번 들려주고 따라 하게 한 뒤 넘어간다 (막힘 탈출)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/if I still can't finish after two tries/i);
    expect(p).toMatch(/say the line once, have me repeat it, and go on/i);
  });

  it('시작조차 못 한 경우도 같은 힌트 규칙으로 받는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/or can't start at all/i);
  });

  it('다시·천천히·뜻 뒤에는 내가 답할 영어로 턴을 끝낸다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/after 다시, 천천히 or 뜻, end your turn with the English I need to answer/i);
  });

  it('맞게 말하면 아무 말 없이 다음 단계로 간다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/when I get it right, say nothing about it and do the next step/i);
  });

  it('단계는 여러 부분으로 되어 있을 수 있고 한 턴에 전부 한다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/a step can have several parts: do all of its parts in that one turn/i);
  });

  it('질문 단계는 새 영어를 만들어도 되는 예외로 적는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/the questions in the last steps are yours to write/i);
  });

  it('괄호와 단계 번호는 소리 내지 않고, 칭찬·확인 질문은 하지 않는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/never say it out loud/i);
    expect(p).toMatch(/never say the step numbers/i);
    expect(p).toMatch(/no praise/i);
    expect(p).toMatch(/do not ask me whether I am ready/i);
  });

  it('통제어는 무엇을 대상으로 하는지까지 적는다 (다시·천천히·뜻·다음·그만)', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toContain('다시 = say this whole step again');
    expect(p).toContain('천천히 = say the English of this step again, slowly');
    expect(p).toContain('뜻 = give the Korean meaning of the English you just said');
    expect(p).toContain('다음 = leave this step and do the next one');
    expect(p).toContain('그만 = skip to the last step');
  });

  it('학습자를 초급으로 두고 새 문장·새 문법을 막는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/beginner/i);
    expect(p).toMatch(/only one word comes out/i);
    expect(p).toMatch(/no new practice sentences, no new grammar/i);
    expect(p).not.toMatch(/A2|B1|low-intermediate/);
  });

  it('옛 산문 절차를 남기지 않는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).not.toMatch(/Do the dialogue with me|You say A's lines|Do it twice|For each sentence, in this order/i);
  });

  it('미니대화가 없는 카드는 상황을 S줄에 적고 대화 단계를 만들지 않는다', () => {
    const p = buildVoicePrompt([{ expr: 'x', sentence: 'X.', ko: '엑스.', situation: '이럴 때' }]);
    expect(p).toContain('S1 "X." = 엑스.');
    expect(p).toContain('  (이럴 때)');
    expect(p).not.toMatch(/이제 대화 연습입니다/);
    expect(stepsOf(p).length).toBeGreaterThan(1);
  });

  it('첫 줄이 ChatGPT 안내이고 텍스트 답장 뒤 음성이라고 말한다', () => {
    const p = buildVoicePrompt([card1]);
    const first = p.split('\n')[0];
    expect(first).toContain('ChatGPT');
    expect(first).toContain('텍스트 답장');
    expect(p).not.toMatch(/클로드|Claude|Haiku/i);
  });

  it('마지막 줄은 1단계만 말하고 시작하라는 지시다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p.trim()).toMatch(/Start now\. Say only step 1, then wait\.$/);
  });

  it('문자열만 준 옛 호출도 안전 (문장 자리에 표현)', () => {
    const p = buildVoicePrompt(['close by', 'take a break']);
    expect(p).toContain('S1 "close by"');
    expect(p).toContain('S2 "take a break"');
    expect(p).not.toContain('(key:'); // 문장이 없으면 표현이 곧 문장이라 key 를 안 붙인다
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
    expect(n.miniDialogue).toHaveLength(4);
    expect(n.drills).toHaveLength(4);
  });
});

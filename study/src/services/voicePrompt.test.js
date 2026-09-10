import { describe, it, expect } from 'vitest';
import { buildVoicePrompt, normalizeVoiceItems } from './voicePrompt.js';

const card = {
  expr: 'trying to reach',
  sentence: "I've been trying to reach you all morning.",
  ko: '아침 내내 너한테 연락하려고 했어.',
  situation: '급한 일로 계속 전화했는데 안 받았을 때',
  miniDialogue: [
    { speaker: 'A', en: 'Oh, hi! Did you need something?', ko: '어, 안녕! 무슨 일 있었어?' },
    { speaker: 'B', en: "I've been trying to reach you all morning.", ko: '아침 내내 너한테 연락하려고 했어.' },
    { speaker: 'A', en: "Sorry, my phone was on silent. What's up?", ko: '미안, 폰이 무음이었어.' },
  ],
  drills: [
    { en: "I couldn't reach you.", ko: '너한테 연락이 안 됐어.' },
    { en: 'Who are you trying to reach?', ko: '누구한테 연락하려는 거야?' },
    { en: 'Did you get my message this morning?', ko: '오늘 아침에 내 메시지 받았어?' },
    { en: 'My wife has been trying to reach you.', ko: '아내가 너한테 계속 연락하려고 했어.' },
  ],
};

describe('buildVoicePrompt — 세션에서 배운 내용을 ChatGPT 음성으로 연습 (2026-09-11 실기 근거로 재설계)', () => {
  it('오늘 배운 문장과 뜻을 번호 붙여 넣는다', () => {
    const p = buildVoicePrompt([card]);
    expect(p).toContain('1. "I\'ve been trying to reach you all morning."');
    expect(p).toContain('아침 내내 너한테 연락하려고 했어.');
    expect(p).toContain('[key: trying to reach]'); // 앱이 강조하는 핵심 표현
  });

  it('미니대화를 A/B 줄로 넣고 역할을 정한다 (ChatGPT=A, 나=B)', () => {
    const p = buildVoicePrompt([card]);
    expect(p).toContain('A: Oh, hi! Did you need something?');
    expect(p).toContain("B: I've been trying to reach you all morning.");
    expect(p).toMatch(/you are A, I am B/i);
  });

  it('드릴은 앞 세 개만 한국어 → 영어 형식으로 넣는다', () => {
    const p = buildVoicePrompt([card]);
    expect(p).toContain("너한테 연락이 안 됐어.  → I couldn't reach you.");
    expect(p).toContain('오늘 아침에 내 메시지 받았어?  → Did you get my message this morning?');
    expect(p).not.toContain('My wife has been trying to reach you.');
  });

  it('미니대화가 없는 카드는 상황 설명으로 대신한다', () => {
    const p = buildVoicePrompt([{ expr: 'x', sentence: 'X.', ko: '엑스.', situation: '이럴 때' }]);
    expect(p).toContain('1. "X."');
    expect(p).toContain('이럴 때');
    expect(p).not.toMatch(/Dialogue \(you are A/);
  });

  it('학습자를 초급으로 두고 새 문장·새 문법을 막는다', () => {
    const p = buildVoicePrompt([card]);
    expect(p).toMatch(/beginner/i);
    expect(p).toMatch(/only one word comes out/i);
    expect(p).toMatch(/no new sentences, no new grammar/i);
    expect(p).not.toMatch(/A2|B1|low-intermediate/);
  });

  it('먼저 들려주고 강세·연음 하나 짚고 따라 하게 한 뒤 → 역할극 → 드릴 → 질문 순서', () => {
    const p = buildVoicePrompt([card]);
    const i1 = p.search(/say the sentence once/i);
    const i2 = p.search(/do the dialogue with me/i);
    const i3 = p.search(/practice lines: say the korean/i);
    const i4 = p.search(/ask me one simple question/i);
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
    expect(i3).toBeLessThan(i4);
    expect(p).toMatch(/stress or linked sound/i);
    expect(p).toMatch(/repeat/i);
  });

  it('막히면 정답 대신 첫 두 단어, 한 턴 두 문장, 기다리기, 교정은 하나씩 다시 말하게', () => {
    const p = buildVoicePrompt([card]);
    expect(p).toMatch(/don't say the whole sentence/i);
    expect(p).toMatch(/first two words/i);
    expect(p).toMatch(/two short sentences at most/i);
    expect(p).toMatch(/then wait for me/i);
    expect(p).toMatch(/one mistake at a time/i);
    expect(p).toMatch(/have me say it again/i);
  });

  it('한국어 뜻과 힌트를 허용하고, 칭찬은 생략, 번호는 소리 내지 않는다', () => {
    const p = buildVoicePrompt([card]);
    expect(p).toMatch(/Korean meaning/i);
    expect(p).toMatch(/short Korean hint/i);
    expect(p).toMatch(/skip the praise/i);
    expect(p).toMatch(/don't read the numbers/i);
    expect(p).not.toMatch(/ENGLISH ONLY|emergency only/i);
  });

  it('옛 설계(타깃 숨기기·유도·퀴즈 금지·장면 지정)를 남기지 않는다', () => {
    const p = buildVoicePrompt([card]);
    expect(p).not.toMatch(/before I do|not a quiz|do NOT read this list|hotel check-in/i);
  });

  it('마무리는 한국어로 혼자 말한 것과 도움 받은 것', () => {
    const p = buildVoicePrompt([card]);
    expect(p).toMatch(/tell me in Korean which sentences I said on my own/i);
    expect(p.trim()).toMatch(/Start with sentence 1\.$/);
  });

  it('첫 줄이 ChatGPT 안내이고 텍스트 답장 뒤 음성이라고 말한다', () => {
    const p = buildVoicePrompt([card]);
    const first = p.split('\n')[0];
    expect(first).toContain('ChatGPT');
    expect(first).toContain('텍스트 답장');
    expect(p).not.toMatch(/클로드|Claude|Haiku/i);
  });

  it('문자열만 준 옛 호출도 안전 (문장 자리에 표현)', () => {
    const p = buildVoicePrompt(['close by', 'take a break']);
    expect(p).toContain('1. "close by"');
    expect(p).toContain('2. "take a break"');
    expect(p).not.toContain('[key:'); // 문장이 없으면 표현이 곧 문장이라 key 줄을 안 붙인다
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
    const [n] = normalizeVoiceItems([card]);
    expect(n.miniDialogue).toHaveLength(3);
    expect(n.drills).toHaveLength(4);
  });
});

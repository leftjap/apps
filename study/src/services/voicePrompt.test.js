import { describe, it, expect } from 'vitest';
import { buildVoicePrompt, normalizeVoiceItems } from './voicePrompt.js';

/* 2026-09-19 재설계 — 정본은 specs/study-app-spec.md §9-9 "프롬프트".
 * 단계 대본과 대사 목록을 주면 교사가 목록 밖 표현을 지어내고 학습자는 빈칸만 채운다(v4 실측).
 * 재료는 목표 문장이 아니라 기본 문장(구문마다 가장 짧은 문장)이고, 규칙 여덟 줄만 준다. */

const dialogue = [
  { speaker: 'A', en: 'We landed early. It’s 4:20.', ko: '일찍 내렸어. 4시 20분이야.' },
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
    { en: 'Are you on your way?', ko: '오는 중이야?' }, // on your way — 구문 불일치
    { en: 'My wife is on her way.', ko: '아내가 오는 중이야.' },
  ],
};

const card2 = {
  expr: 'almost there',
  sentence: "I'm almost there.",
  ko: '거의 다 왔어.',
  situation: '공항에 마중 나가는 길', // card1 과 같은 상황 — 배경은 한 번만
  miniDialogue: dialogue,
  drills: [{ en: "We're almost there.", ko: '거의 다 왔어.' }],
};

describe('buildVoicePrompt — 기본 문장 + 규칙 여덟 줄 (2026-09-19 재설계)', () => {
  it('목표 문장이 아니라 기본 문장을 B번호·뜻·구문으로 적는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toContain('B1 "I\'m on my way to the airport." = 공항 가는 중이야.  (on my way)');
    expect(p).toContain('B2 "We\'re almost there." = 거의 다 왔어.  (almost there)');
  });

  it('기본 문장은 구문을 포함하는 드릴 중 가장 짧은 것이다', () => {
    const p = buildVoicePrompt([
      { expr: "Don't forget to ~", sentence: "Don't forget to text me when you land.", ko: '문자해.', drills: [
        { en: "Don't forget to text me when you land tonight.", ko: '오늘 밤 문자해.' },
        { en: "Don't forget to feed the dog.", ko: '밥 주는 거 잊지 마.' },
        { en: 'I forgot to text you yesterday.', ko: '어제 깜빡했어.' }, // 구문 불일치 — 더 짧아도 안 고른다
      ] },
    ]);
    expect(p).toContain('B1 "Don\'t forget to feed the dog." = 밥 주는 거 잊지 마.');
  });

  it('~ 가 중간에 있는 구문은 앞부분으로 맞춘다 (실제 시드에 8건)', () => {
    const p = buildVoicePrompt([
      { expr: 'How about ~?', sentence: 'How about Friday?', ko: '금요일 어때?', drills: [
        { en: 'How about next Friday afternoon?', ko: '다음 주 금요일 오후 어때?' },
        { en: 'How about tomorrow?', ko: '내일 어때?' },
        { en: 'Where about did you go?', ko: '어디쯤 갔어?' },
      ] },
    ]);
    expect(p).toContain('B1 "How about tomorrow?" = 내일 어때?  (How about ~?)');
  });

  it('구문을 포함하는 드릴이 없으면 가장 짧은 드릴을 쓴다', () => {
    const p = buildVoicePrompt([
      { expr: 'zzz', sentence: 'Target.', ko: '뜻.', drills: [{ en: 'A b c d.', ko: '가' }, { en: 'A b.', ko: '나' }] },
    ]);
    expect(p).toContain('B1 "A b." = 나');
  });

  it('드릴이 없으면 목표 문장을 그대로 쓴다', () => {
    const p = buildVoicePrompt([{ expr: 'on my way', sentence: "I'm on my way.", ko: '가는 중이야.' }]);
    expect(p).toContain('B1 "I\'m on my way." = 가는 중이야.  (on my way)');
  });

  it('질문 소재가 되도록 상황을 배경 줄로 넣고 같은 상황은 한 번만 적는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    const bg = p.split('\n').filter((l) => l.includes('공항에 마중 나가는 길'));
    expect(bg).toHaveLength(1);
    expect(bg[0]).toMatch(/so your questions make sense/i);
  });

  it('상황이 없으면 배경 줄을 만들지 않는다', () => {
    const p = buildVoicePrompt([{ expr: 'x', sentence: 'X.', ko: '엑스.' }]);
    expect(p).not.toMatch(/so your questions make sense/i);
  });

  it('문장마다 3회, 그중 한 번은 교사가 변형을 강제한다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toContain('Make me say each of B1 to B2 three times');
    expect(p).toMatch(/forces me to change a person, a time, or a thing/i);
    expect(p).toMatch(/do not wait for me to change it on my own/i);
  });

  it('문장·패턴 이름을 말하지 않고 질문으로 유도하며 같은 질문을 다시 쓰지 않는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/never tell me which sentence or which pattern to use/i);
    expect(p).toMatch(/never reuse a question you have already asked/i);
  });

  it('되묻기를 세 번 이상 시킨다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toContain('Three or more times in this session, say "이번엔 저한테 물어보세요"');
  });

  it('한 턴 한 질문·5초 대기·열두 단어 제한', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/one question per turn/i);
    expect(p).toMatch(/wait at least five seconds/i);
    expect(p).toMatch(/under twelve words/i);
    expect(p).toMatch(/I must talk more than you/i);
  });

  it('학습자 문장을 대신 말하지 않고 첫 두 단어나 한국어 세 단어로 힌트를 준다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/never say my sentence for me/i);
    expect(p).toMatch(/the first two words, or in Korean what to fix in three words or fewer/i);
  });

  it('힌트로 안 되면 한 번 들려주고 두세 턴 뒤 다시 묻는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toContain('say "따라 하세요."');
    expect(p).toMatch(/ask for that sentence again two or three turns later/i);
  });

  it('상대 대사를 따라 하면 한국어로 교정하고 첫 두 단어만 준다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toContain('그건 제 대사예요');
    expect(p).toMatch(/give me the first two words/i);
  });

  it('be 동사·주어·시제만 고치고 관사·전치사는 넘기며 칭찬하지 않는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/always fix a missing be-verb, a missing subject, or a wrong tense/i);
    expect(p).toMatch(/ignore article and preposition slips/i);
    expect(p).toMatch(/no praise/i);
  });

  it('3회씩 끝나면 문장별 혼자·힌트·모델과 내일 할 것으로 마친다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p).toContain('When each of B1 to B2 has come out three times, stop.');
    expect(p).toContain('혼자 / 힌트 / 모델');
    expect(p).toMatch(/one sentence on what to practice tomorrow/i);
  });

  it('단계 대본·대사 목록·통제어를 남기지 않는다', () => {
    const p = buildVoicePrompt([card1, card2]);
    expect(p.split('\n').filter((l) => /^\d+\. /.test(l))).toHaveLength(0);
    expect(p).not.toContain('(I answer:');
    expect(p).not.toContain('따라 해 보세요');
    expect(p).not.toMatch(/다시 = |천천히 = |그만 = /);
    expect(p).not.toMatch(/Do the dialogue with me|You say A's lines|never merge two steps/i);
  });

  it('첫 줄이 ChatGPT 안내이고 텍스트 답장 뒤 음성이라고 말한다', () => {
    const p = buildVoicePrompt([card1]);
    const first = p.split('\n')[0];
    expect(first).toContain('ChatGPT');
    expect(first).toContain('텍스트 답장');
    expect(p).not.toMatch(/클로드|Claude|Haiku/i);
  });

  it('마지막 줄은 한국어 한 줄 뒤 첫 질문으로 시작하라는 지시다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p.trim()).toMatch(/Start now: one line in Korean to tell me we are starting, then your first question\.$/);
  });

  it('가르치지 말고 꺼내게만 하라고 못박는다', () => {
    const p = buildVoicePrompt([card1]);
    expect(p).toMatch(/do not teach or explain them/i);
    expect(p).toMatch(/without looking at them/i);
  });

  it('문자열만 준 옛 호출도 안전 (표현이 곧 문장)', () => {
    const p = buildVoicePrompt(['close by', 'take a break']);
    expect(p).toContain('B1 "close by"');
    expect(p).toContain('B2 "take a break"');
    expect(p).not.toMatch(/\(close by\)/); // 표현과 문장이 같으면 구문을 따로 붙이지 않는다
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

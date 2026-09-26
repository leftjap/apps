import { describe, it, expect } from 'vitest';
import { checkDraft, hasRelClause, isReactive } from './verify-draft.mjs';

const line = (sp, en, extra = {}) => ({ sp, name: sp === 'B' ? '지오' : '상대', en, ko: '뜻', kr: '음차', src: '(일반 대사)', ...extra });
const card = (idx, key) => ({ idx, slug: `c${idx}`, key, gloss: '뜻', anchor: '뜻', mistake: '-', similar: '-', category: '일상', frequency: 5,
  chunks: [['x', '음차', '뜻']], phonemes: [['/x/', '설명']],
  drills: [{ en: 'A one.', ko: '1', kr: '1' }, { en: 'B two.', ko: '2', kr: '2' }, { en: 'C three.', ko: '3', kr: '3' }, { en: 'D four.', ko: '4', kr: '4' }] });
const scene = (over = {}) => ({ slug: 's', title: 't', situation: '장면',
  lines: [line('A', 'Is this the bus that goes to Siam?'), line('B', "I'm here to check in."), line('A', 'Q2'), line('B', 'Do you know where I can buy a card?'),
    line('A', 'Q3'), line('B', 'That sounds great.'), line('A', 'Q4'), line('B', "I'm supposed to meet her at four.")],
  cards: [card(1, "I'm here to ~"), card(3, 'Do you know where ~'), card(5, 'That sounds ~'), card(7, "I'm supposed to ~")], ...over });

describe('출처 게이트 — date 는 선택', () => {
  it('date 없는 창작 장면은 src 만 있으면 통과한다', () => {
    const r = checkDraft([scene()]);
    expect(r.srcErrors).toEqual([]);
  });
  it('date 없는 장면에서 src 가 비면 에러다', () => {
    const s = scene(); s.lines[2].src = '';
    expect(checkDraft([s]).srcErrors.some((e) => /src 없음/.test(e))).toBe(true);
  });
  it('date 있는 장면은 옛 규칙대로 날짜 접두를 검사한다', () => {
    const s = scene({ date: '01-17' }); s.lines.forEach((l) => (l.src = '01-17 x')); s.lines[0].src = '02-01 y';
    expect(checkDraft([s]).srcErrors.some((e) => /≠ 장면 날짜/.test(e))).toBe(true);
  });
});

describe('관계사·삽입절 어림 판정', () => {
  it.each([
    ['Is this the bus that goes to Siam?', true],
    ['Do you know where I can buy a card?', true],
    ["That's what I mean.", true],
    ["I'm not sure if I heard that right.", true],
    ["The seat I picked online isn't showing.", true],   // 접촉절 (2026-09-26 보강)
    ["That's the hotel I'm staying at.", true],          // 접촉절 + 전치사 잔류
    ['This is fine.', false],
    ["I'm here with my wife, who's working this flight.", true],   // 쉼표 뒤 관계사
    ['Do you have a return ticket I can see?', true],              // 두 단어 명사구 접촉절
    ['I want something spicy tonight.', false],
    ['Where is the counter?', false],
  ])('%s → %s', (en, want) => expect(hasRelClause(en)).toBe(want));
  it('편에 관계사 줄이 2줄 미만이면 경고, 지오 줄에 하나도 없으면 따로 경고', () => {
    const s = scene(); s.lines[0].en = 'Which bus?'; s.lines[3].en = 'I need a card.';
    const w = checkDraft([s]).extraWarnings;
    expect(w.some((x) => /관계사.*2줄/.test(x))).toBe(true);
    expect(w.some((x) => /지오 줄에 관계사/.test(x))).toBe(true);
  });
  it('rel:true 로 표시한 접촉절은 센다', () => {
    const s = scene(); s.lines[3] = line('B', "The seat I picked online isn't showing.", { rel: true }); // 0줄(that goes) + 3줄(rel:true) = 2
    const w = checkDraft([s]).extraWarnings;
    expect(w.some((x) => /관계사/.test(x))).toBe(false);
  });
});

describe('지오 반응형 줄', () => {
  it.each([["That sounds great.", true], ["You might be right.", true], ["I'm here to check in.", false], ["No harm done.", true], ['Exactly.', true], ['Same here.', true], ['Yes, two nights.', true]])('%s → %s', (en, want) => expect(isReactive(en)).toBe(want));
  it('반응형이 편당 2줄을 넘으면 경고한다', () => {
    const s = scene(); s.lines[1].en = 'I feel the same way.'; s.lines[3].en = "You might be right."; // + That sounds great. = 3
    expect(checkDraft([s]).extraWarnings.some((x) => /반응형.*3/.test(x))).toBe(true);
  });
  it('react:false 로 표시하면 어림 판정을 덮는다', () => {
    const s = scene(); s.lines[1].en = 'I feel the same way.'; s.lines[3].en = "You might be right."; s.lines[5].react = false;
    expect(checkDraft([s]).extraWarnings.some((x) => /반응형/.test(x))).toBe(false);
  });
});

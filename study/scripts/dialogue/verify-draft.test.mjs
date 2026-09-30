import { describe, it, expect } from 'vitest';
import { checkDraft, hasRelClause, isReactive } from './verify-draft.mjs';

const line = (sp, en, extra = {}) => ({ sp, name: sp === 'B' ? '지오' : '상대', en, ko: '뜻', kr: '음차', src: '(일반 대사)', ...extra });
const card = (idx, key) => ({ idx, slug: `c${idx}`, key, gloss: '뜻', anchor: '뜻', mistake: '-', similar: '-', category: '일상', frequency: 5,
  chunks: [['x', '음차', '뜻']], phonemes: [['/x/', '설명']],
  drills: [{ en: 'A one.', ko: '1', kr: '1' }, { en: 'B two.', ko: '2', kr: '2' }, { en: 'C three.', ko: '3', kr: '3' }, { en: 'D four.', ko: '4', kr: '4' }] });
const REVIEW_OK = { spoken: '지오는 좌석을 복도로 바꾸자고만 한다. 아내 얘기는 안 꺼낸다.', facts: '시트 밖 사실 없음 — 좌석 선호는 말하지 않고 복도만 요청', english: '방콕 현지 카운터라 직원과 영어로 말한다' };
const scene = (over = {}) => ({ slug: 's', title: 't', situation: '장면', review: REVIEW_OK,
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

describe('셀프 검증 review 필수 (2026-09-27 — 지오가 안 할 말·시트 밖 사실·한국어 상황을 쓴 3묶음 뒤)', () => {
  const REVIEW = { spoken: '지오는 좌석을 복도로 바꾸자고만 한다. 아내 얘기는 안 꺼낸다.', facts: '시트 밖 사실 없음 — 좌석 선호는 말하지 않고 복도만 요청', english: '인천 카운터 직원과의 대화는 한국어지만 방콕 현지 카운터로 설정했다' };
  it('review 세 항목이 다 있으면 에러 없음', () => {
    const s = scene({ review: REVIEW });
    expect(checkDraft([s]).srcErrors.some((e) => /review/.test(e))).toBe(false);
  });
  it('review 가 없으면 에러', () => {
    expect(checkDraft([scene({ review: undefined })]).srcErrors.some((e) => /review/.test(e))).toBe(true);
  });
  it('항목이 비거나 짧으면 에러 (형식적으로 채우기 금지)', () => {
    const s = scene({ review: { ...REVIEW, facts: '없음' } });
    expect(checkDraft([s]).srcErrors.some((e) => /review\.facts/.test(e))).toBe(true);
  });
  it('지오 줄에 아내 직업 언급이 있으면 경고', () => {
    const s = scene({ review: REVIEW }); s.lines[1].en = "I'm here to join my wife, who's crew on this flight.";
    expect(checkDraft([s]).extraWarnings.some((w) => /아내|wife/.test(w))).toBe(true);
  });
});

/* 남성 상대(Liam·Tom) 편 (2026-09-30) — sp 는 성별이라 상대도 B 다. 지오 줄은 이름으로 가른다.
 * 종전엔 상대의 반응형·wife 줄이 지오 줄로 세어지고, 상대 줄의 관계사가 지오 몫으로 잡혔다. */
describe('남성 상대 편 — 상대도 sp B', () => {
  const liam = (en, extra = {}) => line('B', en, { name: 'Liam', ...extra });
  const maleScene = () => scene({ lines: [
    liam('Is this the app that you made?'), line('B', "I'm here to check in."),
    liam('That sounds great.'), line('B', 'Do you know where I can buy a card?'),
    liam('Exactly.'), line('B', "I'm supposed to meet her at four."),
    liam('You might be right.'), line('B', 'I made it myself.')] });
  it('상대의 반응형 줄(3개)은 지오 반응형으로 세지 않는다', () => {
    expect(checkDraft([maleScene()]).extraWarnings.some((x) => /반응형/.test(x))).toBe(false);
  });
  it('상대 줄의 wife 언급은 경고하지 않는다', () => {
    const s = maleScene(); s.lines[0] = liam('Is your wife a flight attendant?');
    expect(checkDraft([s]).extraWarnings.some((x) => /아내|wife/.test(x))).toBe(false);
  });
  it('관계사가 상대 줄에만 있으면 지오 줄 경고가 뜬다', () => {
    const s = maleScene(); s.lines[3] = line('B', 'I need a card.'); s.lines[5] = line('B', 'I will meet her at four.');
    expect(checkDraft([s]).extraWarnings.some((x) => /지오 줄에 관계사/.test(x))).toBe(true);
  });
});

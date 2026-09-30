import { describe, it, expect } from 'vitest';
import { gradeCards, P30, parseBank } from './check-sources.mjs';

const modu = [{ ref: '2편 #74', n: 'can i get a coffee' }, { ref: '1편 #41', n: 'that sounds great' }];
const scn = (en, key) => ({ slug: 's', lines: [{ sp: 'A', en: 'Q' }, { sp: 'B', en }], cards: [{ idx: 1, key }] });

describe('공급원 등급 (2026-09-26 순위: ①30패턴 ②모두영어 ③233)', () => {
  it('30패턴이 든 모두영어 그대로 → a', () => expect(gradeCards([scn('Can I get a coffee?', 'Can I get ~')], modu).rows[0].tier).toBe('a'));
  it('30패턴 자작 → b', () => expect(gradeCards([scn("I'm here to check in.", "I'm here to ~")], modu).rows[0].tier).toBe('b'));
  it('모두영어 그대로, 30패턴 아님 → c', () => expect(gradeCards([scn('That sounds great.', 'That sounds ~')], modu).rows[0].tier).toBe('c'));
  it('둘 다 아님 → d', () => expect(gradeCards([scn("Let's make some good memories.", "Let's ~")], modu).rows[0].tier).toBe('d'));
  it('P30 은 30개', () => expect(P30).toHaveLength(30));
});

// 2026-09-29 — d 를 '30패턴·모두영어가 아님' 으로만 매겨 뱅크에 없는 자작 문장이 233 으로 읽혔다(4묶음 14장).
// d 카드는 bank 필드로 233 뱅크 항목(§1 번호 · §2 "추가 N")을 밝히고, 없거나 제외 판정이면 e(셋 밖).
const BANK_MD = [
  '## 1. 항목별 판정', '', '| 번호 | 패턴 | 판정 | 비고 |', '|---|---|---|---|',
  '| 007 | I\'m good at ~ | 유지 | |', '| 082 | Don\'t tell me ~ | 제외 | |', '| 112 | It tastes ~ | 유지 | 외식 |',
  '', '## 2. 추가해야 할 기초 패턴', '', '### 원함·필요·의무', '14. I have to ~ — I have to pick up Soyeon at the airport.',
  '21. Can/Could you ~? — Could you speak slowly?', '34. I\'ll ~ — I\'ll pick you up at the airport.',
].join('\n');
const bank = parseBank(BANK_MD);
const card = (en, key, extra = {}) => ({ slug: 's', lines: [{ sp: 'A', en: 'Q' }, { sp: 'B', en }], cards: [{ idx: 1, key, ...extra }] });
const row = (en, key, extra) => gradeCards([card(en, key, extra)], modu, bank).rows[0];

describe('233 뱅크 대조 (2026-09-29)', () => {
  it('§1 표와 §2 목록을 읽는다', () => {
    expect(bank.get('112')).toEqual({ pattern: 'It tastes ~', verdict: '유지' });
    expect(bank.get('82').verdict).toBe('제외');
    expect(bank.get('추가 14').pattern).toBe('I have to ~');
  });
  it('bank 를 밝히지 않은 d 카드 → e(셋 밖)', () => expect(row('It even had wireless charging.', 'even had ~').tier).toBe('e'));
  it('제외 판정 항목을 댄 카드 → e', () => expect(row("Don't tell her I said this.", "Don't tell her ~", { bank: '082' }).tier).toBe('e'));
  it('없는 항목을 댄 카드 → e', () => expect(row('It tastes great.', 'It tastes ~', { bank: '999' }).tier).toBe('e'));
  it('유지 항목을 대고 문장에 패턴이 있으면 d, 경고 없음', () => {
    const r = row('Suddenly it tastes great.', 'It tastes ~', { bank: '112' });
    expect(r.tier).toBe('d'); expect(r.bank).toBe('112 It tastes ~'); expect(r.warn).toEqual([]);
  });
  it('§2 항목도 댈 수 있다 (1묶음 I\'ll ~ 선례)', () => expect(row("I'll go get some lettuce, then.", "I'll ~", { bank: '추가 34' }).tier).toBe('d'));
  it('Can/Could 처럼 빗금 대안이 있는 패턴도 맞춘다', () => expect(row('Could you say that again?', 'Could you ~', { bank: '추가 21' }).warn).toEqual([]));
  it('문장에 패턴 글자가 없으면(시제 변형 등) d 로 두되 변형 확인 경고', () => {
    const r = row('My wife had to leave early.', 'had to ~', { bank: '추가 14' });
    expect(r.tier).toBe('d'); expect(r.warn.join()).toMatch(/변형/);
  });
  it('뱅크 없이 부르면 옛 등급(d) 그대로', () => expect(gradeCards([card('It even had wireless charging.', 'even had ~')], modu).rows[0].tier).toBe('d'));
});

describe('key 가 공급원 패턴인지 (2026-09-29)', () => {
  it('30패턴 문장인데 key 가 30패턴이 아니면 경고 (Let me … the one I ~)', () =>
    expect(row('Let me show you the one I saved.', 'the one I ~').warn.join()).toMatch(/key/));
  it('key 가 30패턴이면 경고 없음', () => expect(row("I'm here to check in.", "I'm here to ~").warn).toEqual([]));
});

// 모두영어 문장의 시제·인칭만 바꾼 카드(I'm not in the mood → I wasn't in the mood)는 일치 검사에 안 걸린다.
// bank 처럼 modu 필드로 원문 번호를 밝히면 c 로 세고 변형 확인 경고를 낸다. 없는 번호면 e.
describe('모두영어 변형 (2026-09-30)', () => {
  const modu2 = [...modu, { ref: '1편 #187', n: "i'm not in the mood" }];
  const rowM = (en, key, extra) => gradeCards([card(en, key, extra)], modu2, bank).rows[0];
  it('modu 로 원문을 밝힌 변형 → c, 변형 확인 경고', () => {
    const r = rowM("I wasn't in the mood.", 'in the mood', { modu: '1편 #187' });
    expect(r.tier).toBe('c'); expect(r.modu).toBe('≈ 1편 #187 (변형)'); expect(r.warn.join()).toMatch(/변형/);
  });
  it('없는 원문 번호를 대면 e', () => expect(rowM("I wasn't in the mood.", 'in the mood', { modu: '1편 #999' }).tier).toBe('e'));
});

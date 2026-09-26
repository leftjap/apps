import { describe, it, expect } from 'vitest';
import { gradeCards, P30 } from './check-sources.mjs';

const modu = [{ ref: '2편 #74', n: 'can i get a coffee' }, { ref: '1편 #41', n: 'that sounds great' }];
const scn = (en, key) => ({ slug: 's', lines: [{ sp: 'A', en: 'Q' }, { sp: 'B', en }], cards: [{ idx: 1, key }] });

describe('공급원 등급 (2026-09-26 순위: ①30패턴 ②모두영어 ③233)', () => {
  it('30패턴이 든 모두영어 그대로 → a', () => expect(gradeCards([scn('Can I get a coffee?', 'Can I get ~')], modu).rows[0].tier).toBe('a'));
  it('30패턴 자작 → b', () => expect(gradeCards([scn("I'm here to check in.", "I'm here to ~")], modu).rows[0].tier).toBe('b'));
  it('모두영어 그대로, 30패턴 아님 → c', () => expect(gradeCards([scn('That sounds great.', 'That sounds ~')], modu).rows[0].tier).toBe('c'));
  it('둘 다 아님 → d', () => expect(gradeCards([scn("Let's make some good memories.", "Let's ~")], modu).rows[0].tier).toBe('d'));
  it('P30 은 30개', () => expect(P30).toHaveLength(30));
});

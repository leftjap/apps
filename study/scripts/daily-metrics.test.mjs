/**
 * daily-metrics.test.mjs — daily 트랙 설계 규칙 검증기 단위 테스트.
 * 대상: scripts/daily-metrics.mjs (measure / wordCount)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { measure, wordCount, BAND, REUSE_FLOOR } from './daily-metrics.mjs';

const seedsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'seeds');

const card = (id, sentence, skeleton, over = {}) => ({
  id,
  sentence,
  explanation: {
    _skeleton: skeleton,
    _fact: 'F1',
    drills: [{ en: 'I went to work.' }, { en: 'She had lunch.' }, { en: 'We had a beer.' }, { en: 'Did you go?' }],
    miniDialogue: [{ speaker: 'A', en: 'Q' }, { speaker: 'B', en: sentence }],
    ...over,
  },
});

const session = (cards, file = 'seeds/en-daily-test.json') => ({ file, payload: { title: 't', cards } });

const okSession = () => session([
  card('c1', 'I went to the gym.', 'OWNED:I went to +장소'),
  card('c2', 'It was good.', 'NEW:It was ~'),
  card('c3', 'I had lunch.', 'OWNED:I had +명사'),
  card('c4', 'I had a beer.', 'OWNED:I had +명사'),
]);

describe('wordCount', () => {
  it('축약형은 1단어, 문장부호는 무시한다', () => {
    expect(wordCount("I'm a little tired.")).toBe(4);
    expect(wordCount('How was your day?')).toBe(4);
    expect(wordCount("I didn't go to the gym.")).toBe(6);
  });
  it('빈 값은 0', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount(null)).toBe(0);
  });
});

describe('measure — 설계 규칙', () => {
  it('규칙을 지킨 세션은 통과한다', () => {
    const r = measure([okSession()]);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.stats.cards).toBe(4);
  });

  it('D-1 산출 밴드를 벗어난 sentence 를 잡는다', () => {
    const s = okSession();
    s.payload.cards[0].sentence = 'Sorry, could you say that again more slowly?';
    const r = measure([s]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('D-1');
  });

  it('D-2 신규 골격이 세션당 1개가 아니면 잡는다', () => {
    const two = okSession();
    two.payload.cards[2].explanation._skeleton = 'NEW:How was ~';
    expect(measure([two]).errors.join(' ')).toContain('D-2');
    const zero = okSession();
    zero.payload.cards[1].explanation._skeleton = 'OWNED:It was ~';
    expect(measure([zero]).errors.join(' ')).toContain('D-2');
  });

  it('D-2 _skeleton 표기가 없으면 잡는다', () => {
    const s = okSession();
    s.payload.cards[0].explanation._skeleton = '그냥 설명';
    expect(measure([s]).errors.join(' ')).toContain('D-2');
  });

  it('D-3 재사용 비율 하한을 잡는다', () => {
    const s = session([
      card('c1', 'It was good.', 'NEW:It was ~'),
      card('c2', 'I had lunch.', 'OWNED:I had +명사'),
    ]);
    const r = measure([s]);
    expect(r.stats.reuseRate).toBeLessThan(REUSE_FLOOR);
    expect(r.errors.join(' ')).toContain('D-3');
  });

  it('D-4 드릴 밴드 이탈을 잡는다', () => {
    const s = okSession();
    s.payload.cards[0].explanation.drills[0] = { en: 'Sorry, could you say that again more slowly?' };
    expect(measure([s]).errors.join(' ')).toContain('D-4');
  });

  it('D-5 miniDialogue 턴 수를 잡는다', () => {
    const s = okSession();
    s.payload.cards[0].explanation.miniDialogue = [{ speaker: 'A', en: 'Q' }];
    expect(measure([s]).errors.join(' ')).toContain('D-5');
  });

  it('D-7 _fact 출처 누락을 잡는다', () => {
    const s = okSession();
    delete s.payload.cards[0].explanation._fact;
    expect(measure([s]).errors.join(' ')).toContain('D-7');
  });
});

describe('실제 파일럿 시드', () => {
  const files = readdirSync(seedsDir).filter((f) => /^en-daily-.*\.json$/.test(f)).sort();

  it('seeds/en-daily-*.json 이 존재한다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('파일럿 시드 전량이 설계 규칙을 통과한다', () => {
    const payloads = files.map((f) => ({ file: f, payload: JSON.parse(readFileSync(join(seedsDir, f), 'utf8')) }));
    const r = measure(payloads);
    expect(r.errors).toEqual([]);
    expect(r.stats.sentence.min).toBeGreaterThanOrEqual(BAND.sentenceMin);
    expect(r.stats.sentence.max).toBeLessThanOrEqual(BAND.sentenceMax);
    expect(r.stats.reuseRate).toBeGreaterThanOrEqual(REUSE_FLOOR);
  });
});

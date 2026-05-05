/**
 * userMeta.test.js — Wave 11.67-impl 단위 테스트.
 *
 * 검증 범위:
 *  - pushUserKnown: dedupe / 빈 배열 / 잘못된 entry 가드 / learnedAt 보존
 *  - extractKnownFromCard: sentence + newElements + knownElements (string + object)
 *  - checkStageProgression: 4종 진급 조건 (1→2 / 2→3 / 3→4) + 미충족 시 유지 + 일방향 (강등 X)
 *  - applySessionResults: consecutivePass ≥ 2 시 push, 미달 시 skip, Stage 자동 검사, meta UPSERT
 *
 * Mock 전략: db 인자 직접 mock — fake-indexeddb 의존 없이 행동 검증 (seed.test.js 패턴 답습).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushUserKnown,
  extractKnownFromCard,
  checkStageProgression,
  applySessionResults,
  __test__,
} from './userMeta.js';

function createMockDB() {
  const meta = new Map();
  return {
    _meta: meta,
    meta: {
      async get(key) { return meta.get(key); },
      async put(rec) { meta.set(rec.key, { ...rec }); return rec.key; },
    },
  };
}

describe('pushUserKnown', () => {
  it('빈 배열에 entry push', () => {
    const out = pushUserKnown([], { type: 'sentence', value: 'Hi' });
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('sentence');
    expect(out[0].value).toBe('Hi');
    expect(out[0].learnedAt).toBeTruthy();
  });

  it('동일 type+value dedupe (no-op)', () => {
    const initial = [{ type: 'sentence', value: 'Hi', learnedAt: '2026-04-01T00:00:00Z' }];
    const out = pushUserKnown(initial, { type: 'sentence', value: 'Hi' });
    expect(out).toBe(initial);
    expect(out.length).toBe(1);
  });

  it('다른 type 같은 value 는 별 entry', () => {
    const out = pushUserKnown(
      [{ type: 'sentence', value: 'Hi', learnedAt: '2026-04-01T00:00:00Z' }],
      { type: 'word', value: 'Hi' },
    );
    expect(out.length).toBe(2);
  });

  it('잘못된 entry (type/value 누락) 가드', () => {
    const initial = [{ type: 'sentence', value: 'Hi' }];
    expect(pushUserKnown(initial, { type: 'word' })).toBe(initial);
    expect(pushUserKnown(initial, { value: 'Hi' })).toBe(initial);
    expect(pushUserKnown(initial, null)).toBe(initial);
  });

  it('userKnown 인자가 배열 아니면 빈 배열 반환', () => {
    expect(pushUserKnown(null, { type: 'word', value: 'Hi' }).length).toBe(1);
    expect(pushUserKnown(undefined, { type: 'word', value: 'Hi' }).length).toBe(1);
  });

  it('learnedAt 외부 지정 보존', () => {
    const at = '2026-04-01T00:00:00Z';
    const out = pushUserKnown([], { type: 'sentence', value: 'Hi', learnedAt: at });
    expect(out[0].learnedAt).toBe(at);
  });
});

describe('extractKnownFromCard', () => {
  it('sentence 1건 + explanation 무시 (배열 아님)', () => {
    const out = extractKnownFromCard({ sentence: 'Hello', explanation: { newElements: 'invalid' } });
    expect(out.length).toBe(1);
    expect(out[0].type).toBe('sentence');
  });

  it('newElements + knownElements (string + object 혼합)', () => {
    const card = {
      sentence: 'No worries',
      explanation: {
        newElements: ['no_worries', { type: 'phrase', value: 'take_your_time' }],
        knownElements: [{ type: 'grammar', value: 'imperative' }],
      },
    };
    const out = extractKnownFromCard(card);
    expect(out.length).toBe(4); // sentence + 2 newElements + 1 knownElements
    expect(out.find((e) => e.value === 'no_worries')?.type).toBe('word'); // string → word
    expect(out.find((e) => e.value === 'take_your_time')?.type).toBe('phrase');
    expect(out.find((e) => e.value === 'imperative')?.type).toBe('grammar');
  });

  it('sentence 누락 → 빈 배열', () => {
    expect(extractKnownFromCard({ explanation: {} })).toEqual([]);
    expect(extractKnownFromCard(null)).toEqual([]);
  });

  it('알 수 없는 type 은 word 로 fallback', () => {
    const card = {
      sentence: 'Hi',
      explanation: { newElements: [{ type: 'unknown_type', value: 'foo' }] },
    };
    const out = extractKnownFromCard(card);
    expect(out.find((e) => e.value === 'foo')?.type).toBe('word');
  });
});

describe('checkStageProgression', () => {
  it('Stage 1→2: 모든 조건 충족 시 진급', () => {
    const next = checkStageProgression(1, [], {
      sentenceCount: 50,
      accuracy: 0.80,
      weakPhonemeAccuracy: 0.70,
    });
    expect(next).toBe(2);
  });

  it('Stage 1→2: sentenceCount 1건 부족 → 유지', () => {
    const next = checkStageProgression(1, [], {
      sentenceCount: 49,
      accuracy: 0.95,
      weakPhonemeAccuracy: 0.95,
    });
    expect(next).toBe(1);
  });

  it('Stage 1→2: accuracy 부족 → 유지', () => {
    const next = checkStageProgression(1, [], {
      sentenceCount: 50,
      accuracy: 0.79,
      weakPhonemeAccuracy: 0.70,
    });
    expect(next).toBe(1);
  });

  it('Stage 1→2: 약점 음소 정답률 부족 → 유지', () => {
    const next = checkStageProgression(1, [], {
      sentenceCount: 50,
      accuracy: 0.80,
      weakPhonemeAccuracy: 0.69,
    });
    expect(next).toBe(1);
  });

  it('Stage 2→3: sentence ≥150 + accuracy ≥80% + category ≥10', () => {
    expect(checkStageProgression(2, [], { sentenceCount: 150, accuracy: 0.80, categoryCount: 10 })).toBe(3);
    expect(checkStageProgression(2, [], { sentenceCount: 149, accuracy: 0.80, categoryCount: 10 })).toBe(2);
    expect(checkStageProgression(2, [], { sentenceCount: 150, accuracy: 0.79, categoryCount: 10 })).toBe(2);
    expect(checkStageProgression(2, [], { sentenceCount: 150, accuracy: 0.80, categoryCount: 9 })).toBe(2);
  });

  it('Stage 3→4: sentence ≥300 + accuracy ≥85% + variations ≥75%', () => {
    expect(checkStageProgression(3, [], { sentenceCount: 300, accuracy: 0.85, variationsAccuracy: 0.75 })).toBe(4);
    expect(checkStageProgression(3, [], { sentenceCount: 299, accuracy: 0.85, variationsAccuracy: 0.75 })).toBe(3);
    expect(checkStageProgression(3, [], { sentenceCount: 300, accuracy: 0.84, variationsAccuracy: 0.75 })).toBe(3);
    expect(checkStageProgression(3, [], { sentenceCount: 300, accuracy: 0.85, variationsAccuracy: 0.74 })).toBe(3);
  });

  it('Stage 4 는 최대치 — 그대로 4', () => {
    expect(checkStageProgression(4, [], {})).toBe(4);
  });

  it('userKnown 으로 sentenceCount 자동 산출 (외부 stats 미제공 시)', () => {
    const userKnown = Array.from({ length: 50 }, (_, i) => ({ type: 'sentence', value: `s${i}` }));
    const next = checkStageProgression(1, userKnown, {
      accuracy: 0.80,
      weakPhonemeAccuracy: 0.70,
    });
    expect(next).toBe(2);
  });

  it('일방향 — 강등 X (Stage 2 에서 조건 미달이어도 1 로 강등 안 함)', () => {
    expect(checkStageProgression(2, [], { sentenceCount: 0, accuracy: 0 })).toBe(2);
    expect(checkStageProgression(3, [], { sentenceCount: 0, accuracy: 0 })).toBe(3);
  });

  it('PASS_THRESHOLD 상수 = 2 (spec §4 정합)', () => {
    expect(__test__.PASS_THRESHOLD).toBe(2);
  });
});

describe('applySessionResults', () => {
  let db;
  beforeEach(() => { db = createMockDB(); });

  it('첫 세션 — meta 미존재, consecutivePass=2 도달 카드 1건 push', async () => {
    const cards = new Map([
      ['c1', { sentence: 'Hi', consecutivePass: 2, explanation: { newElements: ['hi_word'] } }],
    ]);
    const result = await applySessionResults(db, 'en', { c1: 'got' }, cards, {
      sentenceCount: 1, accuracy: 1.0,
    });
    expect(result.updated).toBe(true);
    expect(result.addedCount).toBe(2); // sentence + 1 newElement
    expect(result.prevStage).toBe(1);
    expect(result.nextStage).toBe(1); // 50 미만이라 유지

    const meta = await db.meta.get('lang_en');
    expect(meta.value.userKnown.length).toBe(2);
    expect(meta.value.currentStage).toBe(1);
  });

  it('consecutivePass < 2 카드 → skip (push 안 함)', async () => {
    const cards = new Map([
      ['c1', { sentence: 'Hi', consecutivePass: 1, explanation: {} }],
    ]);
    const result = await applySessionResults(db, 'en', { c1: 'got' }, cards, {});
    expect(result.updated).toBe(false);
    expect(result.addedCount).toBe(0);
    expect(await db.meta.get('lang_en')).toBeUndefined();
  });

  it('judgment !== "got" 카드 → skip', async () => {
    const cards = new Map([
      ['c1', { sentence: 'Hi', consecutivePass: 5, explanation: {} }],
    ]);
    const result = await applySessionResults(db, 'en', { c1: 'hmm' }, cards, {});
    expect(result.updated).toBe(false);
  });

  it('기존 meta 보존 + 신규 push 누적', async () => {
    await db.meta.put({
      key: 'lang_en',
      value: {
        currentStage: 1,
        userKnown: [{ type: 'sentence', value: 'Existing', learnedAt: '2026-04-01T00:00:00Z' }],
        goal: 'test goal',
        totalDays: 10,
      },
    });
    const cards = new Map([
      ['c1', { sentence: 'New', consecutivePass: 2, explanation: {} }],
    ]);
    await applySessionResults(db, 'en', { c1: 'got' }, cards, { accuracy: 0.5 });
    const meta = await db.meta.get('lang_en');
    expect(meta.value.userKnown.length).toBe(2);
    expect(meta.value.userKnown[0].value).toBe('Existing');
    expect(meta.value.userKnown[1].value).toBe('New');
    expect(meta.value.goal).toBe('test goal');
    expect(meta.value.totalDays).toBe(10);
  });

  it('Stage 진급 동시 발생 — currentStage 갱신', async () => {
    const userKnown = Array.from({ length: 49 }, (_, i) => ({ type: 'sentence', value: `s${i}` }));
    await db.meta.put({
      key: 'lang_en',
      value: { currentStage: 1, userKnown },
    });
    const cards = new Map([
      ['c1', { sentence: 'last_one', consecutivePass: 2, explanation: {} }],
    ]);
    const result = await applySessionResults(db, 'en', { c1: 'got' }, cards, {
      accuracy: 0.85,
      weakPhonemeAccuracy: 0.85,
    });
    expect(result.prevStage).toBe(1);
    expect(result.nextStage).toBe(2);
    const meta = await db.meta.get('lang_en');
    expect(meta.value.currentStage).toBe(2);
    expect(meta.value.userKnown.length).toBe(50);
  });

  it('dedupe — 이미 push 된 sentence 중복 skip', async () => {
    await db.meta.put({
      key: 'lang_en',
      value: {
        currentStage: 1,
        userKnown: [{ type: 'sentence', value: 'Hi', learnedAt: '2026-04-01T00:00:00Z' }],
      },
    });
    const cards = new Map([
      ['c1', { sentence: 'Hi', consecutivePass: 3, explanation: {} }],
    ]);
    const result = await applySessionResults(db, 'en', { c1: 'got' }, cards, {});
    expect(result.updated).toBe(false);
    expect(result.addedCount).toBe(0);
  });

  it('cardsLookup 가 plain object 도 허용', async () => {
    const result = await applySessionResults(
      db, 'en',
      { c1: 'got' },
      { c1: { sentence: 'Hi', consecutivePass: 2, explanation: {} } },
      {},
    );
    expect(result.addedCount).toBe(1);
  });

  it('가드 — db / lang 누락 시 noop', async () => {
    expect((await applySessionResults(null, 'en', {}, new Map(), {})).updated).toBe(false);
    expect((await applySessionResults(db, '', {}, new Map(), {})).updated).toBe(false);
  });

  it('lang 별 분리 — en 푸시 후 ja meta 영향 없음', async () => {
    const cards = new Map([
      ['c1', { sentence: 'Hi', consecutivePass: 2, explanation: {} }],
    ]);
    await applySessionResults(db, 'en', { c1: 'got' }, cards, {});
    expect(await db.meta.get('lang_en')).toBeDefined();
    expect(await db.meta.get('lang_ja')).toBeUndefined();
  });
});

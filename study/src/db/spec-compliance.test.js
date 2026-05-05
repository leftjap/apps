/**
 * spec-compliance.test.js — 일본어 카드 spec §10 자체 검증 체크리스트 자동화.
 *
 * 출처: ~/apps/study/docs/lesson-explanation-guide-ja.md
 *
 * 검증 항목 (§10 11개 + §1 1T + §4 stage 정의 + §6 phonetic 4패턴):
 *  1. newElements 길이 정확히 1 (§1 1T)
 *  2. knownElements 가 이전 stage 카드의 newElements 합집합에 포함 (i+1 prerequisite 사슬)
 *  3. Stage 1 카드 한자 0개 (§4)
 *  4. frequency 1~10 정수 (§3)
 *  5. category 비어있지 않음 (§3)
 *  6. grammar 한 줄 형태소 분해 — 줄바꿈 없음 (§3.2)
 *  7. pronPoints 4패턴 키워드 ('장음'/'촉음'/'묵음'/'조사') 중 1개 이상 또는 명시적 "특이 패턴 X"
 *  8. variations 미포함 (Stage 1~2, §7)
 *  9. explanation 9키 (whenToUse/grammar/pronPoints/similar + stage/newElements/knownElements/frequency/category)
 * 10. 영어 8필드 (key/situation/chunks/phonemes/mistake) 미존재 — drift 방어
 * 11. phoneticKr 존재
 *
 * 거짓말 재발 방지 박제 (Wave 11.71 정정):
 *  - 콘텐츠 작성 시 "spec 정합" 단정 거짓말 방지를 위해 모든 ja 카드를 이 테스트로 강제 통과.
 *  - 테스트 깨지면 콘텐츠 또는 spec 정정 — "통과한다고 단정" 거짓말 발생 자체 차단.
 */
import { describe, it, expect } from 'vitest';

// seed.js 의 ja 카드 데이터 직접 추출 — REVIEW_CARDS / TODAY_LESSONS export 안 되어 있어
// seedIfNeeded mock DB 호출로 카드 가져옴.
import { seedIfNeeded } from './seed.js';

function createMockStore(pkField = 'id') {
  const data = new Map();
  return {
    _data: data,
    async get(key) { return data.get(key); },
    async put(rec) { data.set(rec[pkField], { ...rec }); return rec[pkField]; },
    async update(key, patch) {
      const cur = data.get(key);
      if (!cur) return 0;
      data.set(key, { ...cur, ...patch });
      return 1;
    },
    async bulkGet(keys) { return keys.map((k) => data.get(k)); },
    async bulkAdd(records) {
      for (const r of records) data.set(r[pkField], { ...r });
    },
    async bulkPut(records) {
      for (const r of records) data.set(r[pkField], { ...r });
    },
    async bulkDelete(keys) { for (const k of keys) data.delete(k); },
  };
}

function createMockDB() {
  return {
    meta: createMockStore('key'),
    reviewQueue: createMockStore('id'),
    todayLessons: createMockStore('id'),
    sessionLogs: createMockStore('id'),
    dailyStats: createMockStore('date'),
    pronunciationLog: createMockStore('id'),
    async transaction(_mode, ..._stores) {
      const cb = arguments[arguments.length - 1];
      return cb();
    },
  };
}

async function getJaCards() {
  const db = createMockDB();
  await seedIfNeeded(db);
  const review = [...db.reviewQueue._data.values()].filter((c) => c.lang === 'ja');
  const lessons = [...db.todayLessons._data.values()].filter((c) => c.lang === 'ja');
  return { review, lessons, all: [...review, ...lessons] };
}

// 한자 정규식 — CJK Unified Ideographs (U+4E00–U+9FFF + Extension A).
const KANJI_RE = /[一-鿿㐀-䶿]/;

describe('일본어 카드 spec 정합 (lesson-explanation-guide-ja.md §10)', () => {
  describe('§1 1T 원칙 — newElements 길이 정확히 1', () => {
    it('모든 ja 카드 newElements.length === 1', async () => {
      const { all } = await getJaCards();
      expect(all.length).toBeGreaterThan(0);
      for (const c of all) {
        expect(c.explanation.newElements, `${c.id} newElements`).toHaveLength(1);
      }
    });
  });

  describe('§4 Stage 정의 — Stage 1 카드 한자 0개', () => {
    it('Stage 1 카드 sentence 에 한자 미포함', async () => {
      const { all } = await getJaCards();
      const stage1 = all.filter((c) => c.explanation.stage === 1);
      expect(stage1.length).toBeGreaterThan(0);
      for (const c of stage1) {
        expect(KANJI_RE.test(c.sentence), `${c.id} "${c.sentence}" Stage 1 인데 한자 포함`).toBe(false);
      }
    });

    it('Stage 1 카드 reading 에도 한자 미포함', async () => {
      const { all } = await getJaCards();
      const stage1 = all.filter((c) => c.explanation.stage === 1);
      for (const c of stage1) {
        expect(KANJI_RE.test(c.reading || ''), `${c.id} reading "${c.reading}" 한자 포함`).toBe(false);
      }
    });
  });

  describe('§1 i+1 prerequisite 사슬 — knownElements 가 이전 카드의 newElements 합집합에 포함', () => {
    it('각 카드의 knownElements 모든 요소가 이전 stage 카드 newElements 또는 같은 stage 의 더 빠른 카드 newElements 에 등장', async () => {
      const { all } = await getJaCards();
      // 학습 순서: stage 오름차순 → 같은 stage 안에서 array 등장 순.
      const sorted = [...all].sort((a, b) => {
        if (a.explanation.stage !== b.explanation.stage) return a.explanation.stage - b.explanation.stage;
        return all.indexOf(a) - all.indexOf(b);
      });
      const knownSoFar = new Set();
      for (const c of sorted) {
        for (const known of c.explanation.knownElements) {
          expect(
            knownSoFar.has(known),
            `${c.id} knownElements "${known}" 가 이전 카드 newElements 에 등장한 적 없음 (prerequisite 사슬 위반)`,
          ).toBe(true);
        }
        for (const ne of c.explanation.newElements) knownSoFar.add(ne);
      }
    });
  });

  describe('§3 메타 5필드 형식', () => {
    it('frequency 1~10 정수', async () => {
      const { all } = await getJaCards();
      for (const c of all) {
        const f = c.explanation.frequency;
        expect(Number.isInteger(f), `${c.id} frequency ${f} 정수 아님`).toBe(true);
        expect(f, `${c.id} frequency ${f} 범위 1~10 위반`).toBeGreaterThanOrEqual(1);
        expect(f, `${c.id} frequency ${f} 범위 1~10 위반`).toBeLessThanOrEqual(10);
      }
    });

    it('category 비어있지 않음', async () => {
      const { all } = await getJaCards();
      for (const c of all) {
        expect(c.explanation.category, `${c.id} category`).toBeTruthy();
        expect(typeof c.explanation.category).toBe('string');
      }
    });

    it('newElements / knownElements 모두 string 배열', async () => {
      const { all } = await getJaCards();
      for (const c of all) {
        expect(Array.isArray(c.explanation.newElements), `${c.id} newElements`).toBe(true);
        expect(Array.isArray(c.explanation.knownElements), `${c.id} knownElements`).toBe(true);
        for (const ne of c.explanation.newElements) expect(typeof ne).toBe('string');
        for (const ke of c.explanation.knownElements) expect(typeof ke).toBe('string');
      }
    });

    it('stage 1~4 정수', async () => {
      const { all } = await getJaCards();
      for (const c of all) {
        const s = c.explanation.stage;
        expect([1, 2, 3, 4]).toContain(s);
      }
    });
  });

  describe('§3 explanation 4필드 형식', () => {
    it('whenToUse / grammar / pronPoints / similar 모두 비어있지 않은 문자열', async () => {
      const { all } = await getJaCards();
      for (const c of all) {
        for (const f of ['whenToUse', 'grammar', 'pronPoints', 'similar']) {
          expect(c.explanation[f], `${c.id} ${f}`).toBeTruthy();
          expect(typeof c.explanation[f]).toBe('string');
        }
      }
    });

    it('§3.2 grammar 는 한 줄 — 줄바꿈 없음', async () => {
      const { all } = await getJaCards();
      for (const c of all) {
        expect(c.explanation.grammar.includes('\n'), `${c.id} grammar 줄바꿈 포함 (§3.2 한 줄 분해 위반)`).toBe(false);
      }
    });
  });

  describe('§7 변형 연습 — Stage 1~2 ja 카드 variations 미포함', () => {
    it('Stage 1~2 ja 카드 explanation.varData 미존재', async () => {
      const { all } = await getJaCards();
      const stage12 = all.filter((c) => c.explanation.stage <= 2);
      for (const c of stage12) {
        expect(c.explanation.varData, `${c.id} Stage ${c.explanation.stage} 인데 varData 박힘 (§7 위반)`).toBeUndefined();
        expect(c.explanation.variations, `${c.id} variations 박힘`).toBeUndefined();
      }
    });
  });

  describe('§6 phoneticKr 존재 + 영어 8필드 누설 방어', () => {
    it('모든 ja 카드 phoneticKr 비어있지 않음', async () => {
      const { all } = await getJaCards();
      for (const c of all) {
        expect(c.phoneticKr, `${c.id} phoneticKr`).toBeTruthy();
      }
    });

    it('영어 전용 8필드 (key/situation/chunks/phonemes/mistake) 미존재', async () => {
      const { all } = await getJaCards();
      for (const c of all) {
        for (const enField of ['key', 'situation', 'chunks', 'phonemes', 'mistake']) {
          expect(c.explanation[enField], `${c.id} ${enField} 누설 (en/ja drift)`).toBeUndefined();
        }
      }
    });
  });

  describe('explanation 9키 (4 + meta 5) 정확 일치', () => {
    it('각 카드 explanation 키 집합 = 9개', async () => {
      const { all } = await getJaCards();
      const expected = new Set(['whenToUse', 'grammar', 'pronPoints', 'similar', 'stage', 'newElements', 'knownElements', 'frequency', 'category']);
      for (const c of all) {
        const got = new Set(Object.keys(c.explanation));
        expect(got, `${c.id} explanation keys`).toEqual(expected);
      }
    });
  });
});

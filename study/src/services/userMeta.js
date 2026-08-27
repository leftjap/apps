/**
 * userMeta.js — Wave 11.67-impl.
 *
 * spec §4 LANG_META JSONB 스키마 (currentStage / userKnown / goal) 의
 * 클라이언트 갱신 로직. 학습 진도 보존 + Stage 진급 검사 + Sync 자동 통합.
 *
 * 순수 함수 (단위 테스트 가능):
 *  - pushUserKnown(userKnown, entry) — 중복 dedupe push, 새 배열 반환
 *  - extractKnownFromCard(card) — explanation 의 newElements / knownElements / sentence 에서 entry 추출
 *  - checkStageProgression(currentStage, userKnown, recentStats) — Stage 진급 조건 검사
 *
 * DB 통합 (db 인자):
 *  - applySessionResults(db, lang, judgments, cards) — finish() 호출, lang_<lang> meta 갱신
 *
 * 정합:
 *  - Dexie meta key = 'lang_en' / 'lang_ja' (sync.js USER_META_KEY_MAP 정합)
 *  - currentStage / userKnown / goal 은 lang_<lang>.value JSONB 안 nested → Sync 자동 통합
 */

const STAGE_THRESHOLDS = Object.freeze({
  // 1→2 진급 조건
  STAGE_2_SENTENCE_MIN: 50,
  STAGE_2_ACCURACY_MIN: 0.80,
  STAGE_2_WEAK_PHONEME_ACCURACY_MIN: 0.70,
  // 2→3
  STAGE_3_SENTENCE_MIN: 150,
  STAGE_3_ACCURACY_MIN: 0.80,
  STAGE_3_CATEGORY_MIN: 10,
  // 3→4
  STAGE_4_SENTENCE_MIN: 300,
  STAGE_4_ACCURACY_MIN: 0.85,
  STAGE_4_VARIATIONS_ACCURACY_MIN: 0.75,
});

export const PASS_THRESHOLD = 2; // consecutivePass ≥ 2 → 익힘 처리 (spec §4 userKnown 갱신 정책)

/**
 * userKnown 배열에 entry push (dedupe).
 * entry: { type: 'sentence'|'word'|'phrase'|'grammar', value: string, learnedAt: ISO }
 * 동일 type+value 가 이미 있으면 no-op (learnedAt 갱신도 안 함 — 첫 학습 시점 보존).
 */
export function pushUserKnown(userKnown, entry) {
  if (!entry?.type || !entry?.value) return Array.isArray(userKnown) ? userKnown : [];
  const arr = Array.isArray(userKnown) ? userKnown : [];
  const exists = arr.some((e) => e?.type === entry.type && e?.value === entry.value);
  if (exists) return arr;
  return [...arr, { ...entry, learnedAt: entry.learnedAt || new Date().toISOString() }];
}

/**
 * 카드에서 userKnown entry 후보 추출.
 *  - sentence 자체 1건 (type='sentence')
 *  - explanation.newElements: 각 원소를 { type: 신규 메타 type, value } — Wave 11.66 spec §5 가이드 정합
 *  - explanation.knownElements: 동일 패턴 (이미 알려진 것이지만 학습 누적 신호)
 *
 * Wave 11.67-impl: explanation 스키마는 docs/explanation-schema.md 참조.
 *  newElements / knownElements 는 array of { type: 'word'|'phrase'|'grammar', value: string } 또는 단순 string.
 *  string 인 경우 type='word' 로 간주.
 */
export function extractKnownFromCard(card) {
  const out = [];
  if (!card?.sentence) return out;
  const now = new Date().toISOString();
  out.push({ type: 'sentence', value: card.sentence, learnedAt: now });
  const exp = card.explanation || {};
  for (const key of ['newElements', 'knownElements']) {
    const elems = exp[key];
    if (!Array.isArray(elems)) continue;
    for (const el of elems) {
      if (typeof el === 'string') {
        out.push({ type: 'word', value: el, learnedAt: now });
      } else if (el && typeof el === 'object' && el.value) {
        const type = el.type === 'phrase' || el.type === 'grammar' ? el.type : 'word';
        out.push({ type, value: el.value, learnedAt: now });
      }
    }
  }
  return out;
}

/**
 * Stage 진급 조건 검사 (spec §4 표 정본).
 *  recentStats: { sentenceCount, accuracy, weakPhonemeAccuracy, categoryCount, variationsAccuracy }
 *    sentenceCount = userKnown.filter(e=>e.type==='sentence').length 와 동일하나 외부 산출 허용 (sync 후 supabase count 도 OK)
 *
 * 진급은 일방향 (강등 X). 연속 점프 X — 한 번에 1단계만.
 *
 * @returns {1|2|3|4} 다음 stage (변경 없으면 currentStage)
 */
export function checkStageProgression(currentStage, userKnown, recentStats) {
  const stage = Number(currentStage) || 1;
  const stats = recentStats || {};
  const sentenceCount = stats.sentenceCount ?? (Array.isArray(userKnown) ? userKnown.filter((e) => e?.type === 'sentence').length : 0);
  const accuracy = Number(stats.accuracy) || 0;
  const weakAcc = Number(stats.weakPhonemeAccuracy) || 0;
  const categoryCount = Number(stats.categoryCount) || 0;
  const variationsAcc = Number(stats.variationsAccuracy) || 0;

  if (stage === 1) {
    if (
      sentenceCount >= STAGE_THRESHOLDS.STAGE_2_SENTENCE_MIN &&
      accuracy >= STAGE_THRESHOLDS.STAGE_2_ACCURACY_MIN &&
      weakAcc >= STAGE_THRESHOLDS.STAGE_2_WEAK_PHONEME_ACCURACY_MIN
    ) {
      return 2;
    }
    return 1;
  }
  if (stage === 2) {
    if (
      sentenceCount >= STAGE_THRESHOLDS.STAGE_3_SENTENCE_MIN &&
      accuracy >= STAGE_THRESHOLDS.STAGE_3_ACCURACY_MIN &&
      categoryCount >= STAGE_THRESHOLDS.STAGE_3_CATEGORY_MIN
    ) {
      return 3;
    }
    return 2;
  }
  if (stage === 3) {
    if (
      sentenceCount >= STAGE_THRESHOLDS.STAGE_4_SENTENCE_MIN &&
      accuracy >= STAGE_THRESHOLDS.STAGE_4_ACCURACY_MIN &&
      variationsAcc >= STAGE_THRESHOLDS.STAGE_4_VARIATIONS_ACCURACY_MIN
    ) {
      return 4;
    }
    return 3;
  }
  return 4; // 최대치
}

/**
 * 세션 종료 시 호출 — judgments 처리 후 lang_<lang> meta 갱신.
 *
 * @param {object} db Dexie 인스턴스 (window.studyDB)
 * @param {'en'|'ja'} lang
 * @param {object} judgments { cardId: 'got'|'hmm'|'no' }
 * @param {Map|object} cardsLookup cardId → reviewQueue card (post-update). consecutivePass 가 새 값이어야 함
 * @param {object} recentStats checkStageProgression 인자 (외부 산출)
 *
 * @returns {Promise<{updated: boolean, prevStage: number, nextStage: number, addedCount: number}>}
 */
export async function applySessionResults(db, lang, judgments, cardsLookup, recentStats) {
  if (!db || !lang) return { updated: false, prevStage: 1, nextStage: 1, addedCount: 0 };
  const metaKey = `lang_${lang}`;
  const existing = await db.meta.get(metaKey);
  const cur = (existing?.value && typeof existing.value === 'object') ? { ...existing.value } : {};
  cur.currentStage = Number(cur.currentStage) || 1;
  cur.userKnown = Array.isArray(cur.userKnown) ? cur.userKnown : [];

  let userKnown = cur.userKnown;
  let addedCount = 0;
  const lookup = cardsLookup instanceof Map ? cardsLookup : new Map(Object.entries(cardsLookup || {}));

  for (const [id, kind] of Object.entries(judgments || {})) {
    if (kind !== 'got') continue;
    const card = lookup.get(id);
    if (!card) continue;
    const newConsecutive = Number(card.consecutivePass) || 0;
    if (newConsecutive < PASS_THRESHOLD) continue;
    const entries = extractKnownFromCard(card);
    for (const entry of entries) {
      const before = userKnown.length;
      userKnown = pushUserKnown(userKnown, entry);
      if (userKnown.length > before) addedCount += 1;
    }
  }

  const prevStage = cur.currentStage;
  const nextStage = checkStageProgression(prevStage, userKnown, recentStats);
  const updated = addedCount > 0 || nextStage !== prevStage;
  if (!updated) return { updated: false, prevStage, nextStage: prevStage, addedCount: 0 };

  cur.userKnown = userKnown;
  cur.currentStage = nextStage;
  await db.meta.put({ key: metaKey, value: cur, at: Date.now() });
  return { updated: true, prevStage, nextStage, addedCount };
}

export const __test__ = Object.freeze({ STAGE_THRESHOLDS, PASS_THRESHOLD });

export const UserMeta = Object.freeze({
  pushUserKnown,
  extractKnownFromCard,
  checkStageProgression,
  applySessionResults,
});

if (typeof window !== 'undefined') {
  window.studyUserMeta = UserMeta;
}

export default UserMeta;

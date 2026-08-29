/**
 * deductionScore.js — 감점제 점수 엔진 (2026-08-29 사용자 설계 확정, 순수 함수).
 *
 * 100 에서 항목별로 차감한다. 인위적 문턱(89 캡) 없이, 축별 상한의 합이 정확히 50 이라
 * "단어를 다 말했으면 50점 바닥"이 산수로 보장되고, 90점대는 전 축이 거의 결손 없어야만
 * 자연 도달한다 (원어민 TTS 앵커 ≈98 · 끊어읽기 앵커 ≈76 — 테스트에 박제).
 *
 * ⚠ 아직 화면 점수가 아니다 — 3단계 계획의 2단계다 (1단계: 프로소디 측정·기록,
 * 2단계: 이 엔진 + 테스트, 3단계: 1~2주 실측 분포로 DEDUCTION_RATES 보정 후 화면 전환).
 *
 * 축과 소스 (2026-08-29 라이브 실측으로 확정):
 *   words      단어별 정확도 결손 비례 (Azure wordScores). 취약 음소 포함 단어는 ×1.5.
 *   fluency    FluencyScore 연속값. ※ UnexpectedBreak 태그는 700ms 끊김에도 0건일 만큼
 *              보수적이라(실측) 끊김·연음 평가의 주 소스로 못 쓴다 — 연속 점수가 주다.
 *   intonation Monotone 단어 태그(민감, 실측 확인) + ProsodyScore 연속값 결손.
 *   missing    말하지 않은 단어의 지분만큼 직접 감점 + 바닥(floor)도 비례 하강.
 * '근거 없으면 감점 없음' — 측정값이 없는 축(예: 프로소디 미측정 응답)은 깎지 않는다.
 */
import { judgeCoverage } from './coverageJudge.js';

/* 감점 단가 — 전부 초안. 3단계에서 지오 실측 분포로 보정한다 (이 표만 고치면 됨). */
export const DEDUCTION_RATES = {
  words: { max: 30, weakMultiplier: 1.5 },
  fluency: { max: 10, perPoint: 0.25 },                       // (100−flu) × 0.25
  intonation: { max: 10, perMonotoneWord: 1, perProsodyPoint: 0.15 },
  missing: { share: 100 },                                    // 문장 지분 100 × (누락/전체)
};

/* 한국인 공통 취약 음소 (Azure 심볼 기준) — 개인 실측 약점(personalWeak)과 합집합으로 쓴다. */
export const KO_WEAK_PHONEMES = ['f', 'v', 'r', 'l', 'th', 'dh', 'z', 'w'];

// 유니코드 유지 — ASCII 만 남기면 ja 단어가 전부 '' 로 접혀 취약 판정이 문장 전체로 오염된다(검증 발견).
const norm = (w) => String(w ?? '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

/**
 * @param {object} result   analyzeWavRest 결과 (관문 통과 후를 가정 — mockFallback 은 호출부가 거름)
 * @param {string} expected 목표 문장
 * @param {object} [opts]   { personalWeak?: string[], rates?: DEDUCTION_RATES 형 }
 * @returns {{ score:number, floor:number, deductions:Array<{axis,label,points,detail?}> }}
 */
export function computeDeductionScore(result, expected, { personalWeak = [], rates = DEDUCTION_RATES } = {}) {
  const cov = judgeCoverage(result?.recognizedText, expected);
  const nExp = Math.max(cov.expTokens || 0, 1);
  /* 바닥은 축 상한 합에서 유도한다 (100 − Σmax) — rates 를 바꿔도 '전 축 바닥 = 바닥점' 항등이 유지.
   * ja 퇴화 가드: 기대문이 1토큰(공백 무분절)이면 토큰 커버리지가 무의미 — missing 축을 끄고
   * 바닥을 만점 커버리지로 둔다 (judgeMisread 의 expTokens>=2 가드와 같은 근거, 검증 발견). */
  const floorMax = 100 - (rates.words.max + rates.fluency.max + rates.intonation.max);
  const tokensComparable = (cov.expTokens || 0) >= 2;
  const floor = Math.round(floorMax * (tokensComparable ? cov.coverage : 1));
  const weakSet = new Set([...KO_WEAK_PHONEMES, ...personalWeak]);
  // 누락 단어(Omission)는 wordScores 에 0점으로도 실려 온다(실경로 enableMiscue:true 실측) —
  // words 축에서 빼서 missing 축과의 이중 감점을 막는다 (검증 발견).
  const omitted = new Set((result?.omissions ?? []).map(norm));
  const saidWords = (result?.wordScores ?? []).filter((w) => !omitted.has(norm(w?.word)));

  // 단어 → 취약 음소 포함 여부 (phonemeScores 의 word 연결 사용. 없으면 가중 없음)
  const weakWords = new Set();
  for (const p of result?.phonemeScores ?? []) {
    if (weakSet.has(p?.symbol)) weakWords.add(norm(p.word));
  }

  const deductions = [];

  // ── words: 단어별 결손 비례. 예산 분모 = 실제로 말한 단어 수 — 전 단어 0점이면 정확히 max 에
  // 닿아 '축 상한 합 = 바닥 보장' 산수가 성립한다 (기대 단어 수 분모는 상한 미달로 계약을 깼다 — 검증 발견).
  const budget = rates.words.max / Math.max(saidWords.length, 1);
  let wordsDed = 0;
  const worst = [];
  for (const w of saidWords) {
    const shortfall = Math.max(0, 100 - (Number(w?.score) || 0)) / 100;
    if (shortfall <= 0) continue;
    const mult = weakWords.has(norm(w.word)) ? rates.words.weakMultiplier : 1;
    wordsDed += budget * shortfall * mult;
    worst.push({ word: w.word, score: w.score, weak: mult > 1 });
  }
  wordsDed = Math.min(rates.words.max, wordsDed);
  if (wordsDed > 0) {
    worst.sort((a, b) => a.score - b.score);
    const top = worst[0];
    deductions.push({
      axis: 'words',
      label: top.weak ? `취약 발음이 약해요 (${top.word} ${top.score}점)` : `소리가 어긋난 단어가 있어요 (${top.word} ${top.score}점)`,
      points: round1(wordsDed),
      detail: worst.slice(0, 3),
    });
  }

  // ── fluency: 연속 점수 결손 (측정 없으면 감점 없음)
  const flu = Number(result?.fluencyScore);
  if (Number.isFinite(flu)) {
    const d = Math.min(rates.fluency.max, Math.max(0, 100 - flu) * rates.fluency.perPoint);
    if (d > 0) deductions.push({ axis: 'fluency', label: '끊기지 않고 이어 말하기', points: round1(d) });
  }

  // ── intonation: 단조 태그 + 프로소디 결손 (둘 다 없으면 감점 없음)
  const mono = result?.prosodyIssues?.monotoneWords ?? [];
  const pros = Number(result?.prosodyScore);
  let intonDed = mono.length * rates.intonation.perMonotoneWord;
  if (Number.isFinite(pros)) intonDed += Math.max(0, 100 - pros) * rates.intonation.perProsodyPoint;
  intonDed = Math.min(rates.intonation.max, intonDed);
  if (intonDed > 0) {
    deductions.push({
      axis: 'intonation',
      label: mono.length ? `억양이 단조로워요 (${mono.length}단어)` : '억양·리듬 결손',
      points: round1(intonDed),
    });
  }

  // ── missing: 말하지 않은 지분 직접 감점 (토큰 비교가 유의미할 때만 — ja 1토큰은 제외)
  const missingCount = tokensComparable ? cov.missing.length : 0;
  if (missingCount > 0) {
    deductions.push({
      axis: 'missing',
      label: `빠뜨린 단어 ${missingCount}개 (${cov.missing.slice(0, 3).join(', ')})`,
      points: round1(rates.missing.share * (missingCount / nExp)),
    });
  }

  deductions.sort((a, b) => b.points - a.points);
  const total = deductions.reduce((a, d) => a + d.points, 0);
  const score = Math.max(floor, Math.round(100 - total));
  return { score, floor, deductions };
}

function round1(n) { return Math.round(n * 10) / 10; }

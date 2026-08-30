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
 *   fluency    FluencyScore 연속값 + Insertion(반복·덧붙임) 건수. ※ UnexpectedBreak 태그는 700ms
 *              끊김에도 0건일 만큼 보수적이라(실측) 끊김·연음 평가의 주 소스로 못 쓴다 — 연속 점수가
 *              주고, 연속값이 못 잡는 반복(버벅임)은 Insertion 이 보완한다.
 *   intonation Monotone 단어 태그(민감, 실측 확인) + ProsodyScore 연속값 결손.
 *   missing    말하지 않은 단어의 지분만큼 직접 감점 + 바닥(floor)도 비례 하강.
 * '근거 없으면 감점 없음' — 측정값이 없는 축(예: 프로소디 미측정 응답)은 깎지 않는다.
 */
import { judgeCoverage } from './coverageJudge.js';

/* 감점 단가 — 1차 실측 보정 (2026-08-31, 사용자 지시 "합성으로 지금 보정").
 * 실측 코퍼스 22종(원어민 TTS 2보이스×2문장 · 한국액센트 · 끊어읽기 · 지오 정상 7회 · 지오 유치
 * 4회 실기록)으로 격자 탐색(216 구성 중 제약 통과 32, gap 최대 채택). 제약: 원어민 ≥90 ·
 * 지오 유치 실기록 ≤87 · 끊어읽기 ≤82 · 지오 최고 시도 ≥85. 결과: 원어민 90 · 지오 최고 89 ·
 * 유치 75~83 · 한국액센트 76~78 · 끊어읽기 76~79.
 * 핵심 실측: 유창성은 전 계층 91~100이라 분리력이 없고, 유치·미숙 vs 원어민을 가르는 유일한
 * 연속 신호는 ProsodyScore(원어민 90.3~91.1 / 지오 최고 88.8 / 유치 69.8~82.4) → 억양 축을
 * 10→20, 결손 단가 0.15→0.9 로. 단어 축은 계층 분리력이 없어(전 계층 acc 86~98) 30→20. */
export const DEDUCTION_RATES = {
  words: { max: 20, weakMultiplier: 1.5 },
  // perInsertion: 반복·덧붙임 단어당 감점. 버벅임의 직접 증거 — 라이브 실측(2026-08-29):
  // 버벅임이 acc 는 98·99 로 안 깎이고 flu 만 62·61. 단 지오 실발화 꼬리 반복("again. Again.")엔
  // Azure 가 flu 92 를 줄 만큼 관대한 경우가 있어 연속값만으론 못 잡는다. 정상 발화 실측 ins 0.
  fluency: { max: 10, perPoint: 0.25, perInsertion: 2 },      // (100−flu) × 0.25 + ins × 2
  // perMonotoneWord 0 확정 (2026-08-31) — Monotone 태그는 원어민 정상 발화에도 전단어(9/9)로
  // 붙는 출렁임이 실측돼(2026-08-29 Aria), 단가를 주면 '원어민 ≥90' 보장이 깨진다. 단조로움은
  // ProsodyScore 연속값이 이미 흡수한다(지오 유치·단조 시도 전부 pros 82 이하 실측).
  intonation: { max: 20, perMonotoneWord: 0, perProsodyPoint: 0.9 },
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
/* 알려진 보류 (2026-08-29 검증 발견 중 미수정 1건): judgeCoverage 는 축약형을 펼쳐 비교하므로
 * (it's→it is) 기대 토큰 수가 원문보다 1 커질 수 있다. 누락 개수와 분모가 **같은 펼친 단위**라
 * 비율(floor·missing 지분)은 일관되지만, 누락 라벨에 'cannot' 같은 펼친 형태가 보일 수 있고
 * 왜곡 폭은 문장당 최대 축약형 개수만큼이다. 3단계 단가 보정 때 실데이터로 재평가한다. */
export function computeDeductionScore(result, expected, { personalWeak = [], rates = DEDUCTION_RATES } = {}) {
  const cov = judgeCoverage(result?.recognizedText, expected);
  const nExp = Math.max(cov.expTokens || 0, 1);
  /* 바닥은 축 상한 합에서 유도한다 (100 − Σmax) — rates 를 바꿔도 '전 축 바닥 = 바닥점' 항등이 유지.
   * ja 퇴화 가드: 공백 무분절 문장(원문에 공백 없음)은 토큰 커버리지가 무의미 — missing 축을 끄고
   * 바닥을 만점 커버리지로 둔다 (judgeMisread 의 comparable 가드와 같은 근거). 판별자는 토큰 수가
   * 아니라 원문 공백(spaceSeparated) — 전각 구두점 치환이 ja 문장을 절 2토큰으로 쪼개 missing 축이
   * 절 단위 50~100점을 깎던 결함의 정정 (2026-08-29 오후 적대 감사 확증). */
  const floorMax = 100 - (rates.words.max + rates.fluency.max + rates.intonation.max);
  const tokensComparable = (cov.expTokens || 0) >= 2 && cov.spaceSeparated === true;
  const floor = Math.round(floorMax * (tokensComparable ? cov.coverage : 1));
  const weakSet = new Set([...KO_WEAK_PHONEMES, ...personalWeak]);
  /* 누락(Omission)·삽입(Insertion)은 words 축에서 **개수 단위**로 뺀다 (2026-08-29 오후 감사).
   * - 누락은 wordScores 에 0점으로도 실려 와(실측) missing 축과 이중 감점되고, 삽입은 예산 분모를
   *   희석해 깨끗한 반복이 점수를 올리는 역전을 만든다(실측 재현 — 85→86).
   * - 이름 전체 제외는 같은 철자의 실발화 항목까지 지운다(라이브 G1: that 21점 증발) — 개수만큼만.
   * - 같은 이름이 여럿이면: 누락은 점수 낮은 항목부터(누락 항목은 0점 — 실측), 삽입은 점수 높은
   *   항목부터(반복을 깨끗하게 말해도 점수가 오르지 않는 보수 방향). 삽입 제외는 insCount 와 같이
   *   내용 비교 가능 언어에서만. */
  const ws = result?.wordScores ?? [];
  const excludedIdx = new Set();
  const excludeByCount = (names, ascending) => {
    const budget = {};
    for (const w of names) { const k = norm(w); budget[k] = (budget[k] || 0) + 1; }
    for (const [k, cnt] of Object.entries(budget)) {
      ws.map((w, i) => ({ i, s: Number(w?.score) || 0, k: norm(w?.word) }))
        .filter((e) => e.k === k && !excludedIdx.has(e.i))
        .sort((a, b) => (ascending ? a.s - b.s : b.s - a.s))
        .slice(0, cnt)
        .forEach((e) => excludedIdx.add(e.i));
    }
  };
  excludeByCount(result?.omissions ?? [], true);
  if (tokensComparable) excludeByCount(result?.insertions ?? [], false);
  const saidWords = ws.filter((_, i) => !excludedIdx.has(i));

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

  // ── fluency: 연속 점수 결손 + 반복·덧붙임(Insertion — miscue 응답의 실측값이라 flu 미측정이어도
  // 근거가 된다). ja(1토큰 기대문)는 삽입 판정 미실측이라 적용하지 않는다 — tokensComparable 가드 재사용.
  // null 은 미측정의 저장 형태(pronunciationLog 가 ?? null 로 영속화) — Number(null)===0 이라
  // 수치 강제 변환을 거치면 '미측정'이 '0점'이 되어 축 상한 만점 감점이 난다. 타입까지 좁힌다.
  const flu = result?.fluencyScore;
  const fluMeasured = typeof flu === 'number' && Number.isFinite(flu);
  const insCount = tokensComparable ? (result?.insertions ?? []).length : 0;
  let fluDed = fluMeasured ? Math.max(0, 100 - flu) * rates.fluency.perPoint : 0;
  // perInsertion 결측 rates(구형 커스텀 표)는 0 — NaN 이 축 전체를 지우는 것을 막는다.
  fluDed = Math.min(rates.fluency.max, fluDed + insCount * (rates.fluency.perInsertion || 0));
  if (fluDed > 0) {
    deductions.push({
      axis: 'fluency',
      label: insCount ? `한 번에 이어 말하기 (반복·덧붙임 ${insCount}단어)` : '끊기지 않고 이어 말하기',
      points: round1(fluDed),
    });
  }

  // ── intonation: 단조 태그 + 프로소디 결손 (둘 다 없으면 감점 없음)
  const mono = result?.prosodyIssues?.monotoneWords ?? [];
  const pros = result?.prosodyScore;   // null = 미측정 (fluency 와 같은 근거로 타입까지 좁힌다)
  let intonDed = mono.length * rates.intonation.perMonotoneWord;
  if (typeof pros === 'number' && Number.isFinite(pros)) intonDed += Math.max(0, 100 - pros) * rates.intonation.perProsodyPoint;
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

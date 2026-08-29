/**
 * coverageJudge.js — 전사(recognizedText) vs 기대문 커버리지 판정 (순수, 엔진 무관).
 *
 * 체이닝 통과 기준(사용자 결정 2026-07-09) 계승: "단어를 다 말했으면 통과, 덧붙임 허용".
 * 단 소스가 Azure 의 EnableMiscue omission 판정이 아니라 **전사 텍스트 자체와의 비교** →
 * Azure·Groq·Web Speech 어느 엔진의 전사에도 동일 적용. 무비용·즉시·결정적.
 *
 * 실측 근거(2026-07-11 head-to-head): Azure 가 L2 긴 문장 끝을 잘라 false omission 을 내던
 * 케이스에서, 전사 텍스트만 비교하면 "잘린 만큼만 누락"으로 정확히 잡힌다(테스트에 박제).
 */

// 흔한 축약형 → 펼침. 전사/기대문 어느 쪽이 축약형이어도 동치 처리.
// 키는 무아포스트로피형 — Azure Display 가 아포스트로피를 생략하므로("Lets keep in touch." 실DB 실측
// 2026-07-12) 토큰화가 아포스트로피를 먼저 제거한 뒤 매칭한다. 양측에 대칭 적용이라 동치 판정 안전
// (예: 'ill'(아픈)·'were'(과거형) 같은 중의어도 양쪽이 같이 펼쳐져 판정이 갈리지 않는다).
const CONTRACTIONS = {
  its: 'it is', im: 'i am', dont: 'do not', cant: 'cannot',
  wont: 'will not', ill: 'i will', youre: 'you are', thats: 'that is',
  theres: 'there is', lets: 'let us', were: 'we are', theyre: 'they are',
  ive: 'i have', hes: 'he is', shes: 'she is', whats: 'what is',
  isnt: 'is not', arent: 'are not', didnt: 'did not', doesnt: 'does not',
  gonna: 'going to', wanna: 'want to', gotta: 'got to',
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** lowercase → 아포스트로피 제거 → 축약형 펼침 → 구두점 제거 → 토큰 배열. */
function toTokens(s) {
  let t = String(s || '').toLowerCase().replace(/['’‘]/g, '');
  for (const [k, v] of Object.entries(CONTRACTIONS)) {
    t = t.replace(new RegExp(`\\b${escapeRe(k)}\\b`, 'g'), v);
  }
  t = t.replace(/[.,!?;:"`“”]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.split(' ') : [];
}

/**
 * @returns {{ pass:boolean, missing:string[], extra:string[], coverage:number }}
 *   pass     : 기대 단어를 전부 말함(missing 0) — 덧붙임(extra)은 허용
 *   missing  : 기대문엔 있으나 전사에 없는 단어(멀티셋)
 *   extra    : 전사엔 있으나 기대문에 없는 단어(덧붙임)
 *   coverage : (기대 단어 - 누락)/기대 단어  (0~1)
 */
export function judgeCoverage(recognized, expected) {
  const exp = toTokens(expected);
  const rec = toTokens(recognized);

  const recCount = {};
  for (const w of rec) recCount[w] = (recCount[w] || 0) + 1;

  const missing = [];
  const matched = {};
  for (const w of exp) {
    if ((recCount[w] || 0) - (matched[w] || 0) > 0) matched[w] = (matched[w] || 0) + 1;
    else missing.push(w);
  }

  const extra = [];
  const used = {};
  for (const w of rec) {
    if ((matched[w] || 0) - (used[w] || 0) > 0) used[w] = (used[w] || 0) + 1;
    else extra.push(w);
  }

  const coverage = exp.length ? (exp.length - missing.length) / exp.length : 0;
  return { pass: exp.length > 0 && missing.length === 0, missing, extra, coverage };
}

/* 생산 연습 통과 판정 (2026-07-23) — 3중 기준: 커버리지 + 문장 정확도 + 단어 하한.
 * 배경: Azure PA 는 인식을 참조로 끌어당겨 커버리지가 후하고, 문장 평균은 일부 단어만
 * 엉뚱해도 하한을 넘을 수 있다. 실측(합성음성, 2026-07-23): 정확 발화 단어 최저 91 vs
 * 엉뚱 단어 0~21 → 단어 하한 40 이 그 취약 창을 봉쇄한다 (L2 정상 발화에 여유 충분). */
export function judgeProduction(result, expected, { minAccuracy = 65, wordMin = 40 } = {}) {
  const coverage = judgeCoverage(result?.recognizedText, expected);
  const accuracy = Math.round(Number(result?.score) || 0);
  const badWords = (result?.wordScores || [])
    .filter((w) => (Number(w?.score) || 0) < wordMin)
    .map((w) => w.word);
  const pass = coverage.pass && accuracy >= minAccuracy && badWords.length === 0;
  return { pass, missing: coverage.missing, badWords, accuracy };
}

/* 오발화 판정 (2026-08-29) — "이 문장을 말한 게 아니다" 가 명백할 때만 참.
 * 사용자 보고: 다른 문장을 말하거나 아무 발음이나 해도 50점대가 기록된다.
 * 뿌리는 Azure 가 enableMiscue:false 에서 전사를 레퍼런스로 에코하는 것(호출부에서 true 로 교정)이고,
 * 이 함수는 그 위에 얹는 마지막 안전망이다.
 *
 * 왜 두 신호를 AND 로 묶나 — 라이브 Azure 실측(2026-08-29, enableMiscue:true) + 지오 실기록 391건:
 *   · 커버리지 단독 불가 — 정상 발화 0.800(Azure 가 Im→In 오인) vs 다른 문장 0.625 로 겹친다.
 *     일본어는 공백 분절이 없어 정답 발화도 0 이다.
 *   · 정확도 단독 불가 — 실기록 391건 중 44건(11%)이 50점 미만인데 전사는 멀쩡했다. 버리면 안 된다.
 *   · 두 신호 동시 바닥은 실측에서 '다른 문장·아무 발음'에만 나타났다
 *     (정상·부분 발화 정확도 최저 65 / 다른 문장 최고 27).
 * 임계값은 그 간극의 가운데다 — 커버리지가 살아 있으면 발음이 아무리 나빠도 점수는 기록된다. */
export function judgeMisread(result, expected, { minAccuracy = 40, minCoverage = 0.7 } = {}) {
  const accuracy = Math.round(Number(result?.score) || 0);
  const { coverage } = judgeCoverage(result?.recognizedText, expected);
  return { misread: accuracy < minAccuracy && coverage < minCoverage, coverage, accuracy };
}

/* 음소 점수 평균 — Azure 가 준 원시 음향 일치도. 표시 점수(AccuracyScore)와 달리 보정이 없다. */
function phonemeMean(result) {
  const ps = result?.phonemeScores;
  if (!Array.isArray(ps) || !ps.length) return null;   // 근거 없음 — 판정하지 않는다
  let sum = 0;
  for (const p of ps) sum += Number(p?.score) || 0;
  return sum / ps.length;
}

/* 채점 가능 여부 (2026-08-29) — "엉뚱한 문장인데 50점이 말이 되냐"(사용자)에 대한 답.
 *
 * 관찰: 표시 점수(AccuracyScore)가 저점 구간에서 음소 원시 점수와 크게 어긋난다.
 * 실기록 중 capture_rms 가 남은 26건이 음소 원시 평균으로 완전히 갈린다 —
 *   정상 19건 — 음소 0점 0개 · 음소평균 65.2~97.7 · 표시 acc 75~98   (둘이 일치)
 *   문제  7건 — 음소 0점 15~100% · 음소평균 0~28.8 · 표시 acc 23~63  (둘이 괴리)
 * 52점짜리 발화의 음소 평균이 17.4, 58점짜리가 10.4 다. 사용자가 본 "50점 안팎"이 이 구간이다.
 *
 * ⚠ 그 괴리의 **원인은 확정하지 못했다**. 공식 문서가 "aggregated from the phoneme-level accuracy
 * score, and refined with assessment objectives" 라 적은 그 refine 이 후보이지만 문서는 방향을
 * 말하지 않는다. 그 7건이 약한 신호였는지·문장을 끊었는지·발음이 어긋났는지도 오디오가 없어 모른다
 * (단어별 점수는 0 과 40~53 이 섞여 어느 쪽으로도 단정할 수 없다). 합성으로 잡음에 묻어 만든 재현은
 * rms 는 겹쳤지만 음소평균이 42.7 vs 20.8 로 달라 같은 현상이라는 증거가 못 된다.
 * 확실한 것 하나: **그런 녹음에 화면이 52~63점을 붙였고 그건 실체와 어긋난다.** 원인과 무관하게 막는다.
 *
 * 임계 50 은 **완전 분리가 아니라 근거 있는 절단이다.** 위쪽 근거(전부 실측): 원어민 3화자 90~96 ·
 * 강한 한국어 액센트 67~85 · 극단 끊어읽기(1.5초 휴지) 82 · 정상 발화 최저 65.2. 아래쪽 근거:
 * 합성으로 만든 취약 구간이 40.8(표시 acc 82) · 실기록 차단 대상 최고 28.8.
 * ⚠ 다만 발음로그 411건 이력의 음소평균 분포에는 50 근처에 간극이 없다(40~44:8 · 45~49:8 ·
 * 50~54:8 · 55~59:11 건으로 연속). rms 가 기록된 26건에서만 65.2↔28.8 로 갈릴 뿐이다.
 * 즉 40~65 구간이 정상인지 무너진 녹음인지는 판별할 자료가 없다 — 실사용에서 오차단이 보이면 조정한다.
 *
 * 대안으로 '음소 0점 비율'을 검토했다가 **반증했다**: 411건에서 0점이 정확히 0% 인 행이 290건으로
 * 자연스러운 절단점처럼 보였지만, 합성 취약 구간(음소평균 40.8·표시 acc 82)이 **0점 0/26** 이라
 * 0점 조건을 붙이면 그 구간을 통째로 놓친다. 음소평균 단독이 맞다.
 *
 * 판정 순서가 중요하다 — 소리가 무너지면 전사도 같이 무너져 오발화로 오인된다.
 * 그래서 소리를 먼저 묻고(unclear) 그다음 내용을 묻는다(misread). */
export function judgeRecording(result, expected, { minPhonemeMean = 50, ...misreadOpts } = {}) {
  const pm = phonemeMean(result);
  const misread = judgeMisread(result, expected, misreadOpts);
  if (pm != null && pm < minPhonemeMean) {
    return { record: false, reason: 'unclear', phonemeMean: pm, ...misread };
  }
  if (misread.misread) return { record: false, reason: 'misread', phonemeMean: pm, ...misread };
  return { record: true, reason: null, phonemeMean: pm, ...misread };
}

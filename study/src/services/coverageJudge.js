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

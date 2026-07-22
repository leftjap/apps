/* 응용 연습(2축) 순수 헬퍼 — 신규 세션·복습 세션이 공유.
 *
 * 축1 변주(drills): 같은 표현을 다른 문법 맥락으로 이식. 호칭('honey')·감탄사('okay')만 덧붙인
 *   근접중복은 변주가 아니므로 렌더에서 걸러낸다 (2026-07-09 전수감사: 3610 드릴 중 34.2%).
 *   기존 105편 데이터는 손대지 않고(사용자 결정) 표시 단계에서만 필터.
 *
 * 축2 체이닝(chain): 스크립트 없이 '듣고 따라 말하기'로 base 를 2문장 수준까지 확장 (elicited imitation).
 *   - 단계 = chunks 누적 (단계 수 고정 X — 청크 수가 곧 단계 수)
 *   - 매 재생마다 화자·속도를 바꿔 '리듬 통째 암기'를 막는다 (사용자 관찰)
 *   - 통과 판정은 발음 점수가 아니라 '단어를 다 말했는가' (전사 비교 — services/coverageJudge.judgeCoverage)
 *   - 3회 실패부터 단계적 힌트 (뜻 → 첫 단어 → 전체)
 */

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = (s) => norm(s).split(' ').filter(Boolean).length;

/** chain{target,chunks} → 앞에서부터 누적한 단계 배열. 각 단계는 target 의 **원문 접두부**(구두점 보존).
 * chunks 는 끊는 위치(단어 수)만 정한다 — 이어붙이면 구두점이 사라져 런온·물음표 소실이 생긴다.
 * chunks 단어수 합이 target 과 어긋나면(토큰화 불일치) 청크 이어붙이기로 폴백.
 * 슬림화(2026-07-22 사용자 결정): 청크가 3개를 넘으면 전체 단어수의 ~40%·70%·100% 에
 * 가장 가까운 청크 경계 3곳만 단계로 쓴다 — 단계가 많아 늘어지는 문제 해소. */
export function buildChainSteps(chain) {
  const chunks = Array.isArray(chain?.chunks) ? chain.chunks : [];
  if (chunks.length < 2) return [];
  const words = (s) => String(s ?? '').split(/\s+/).filter(Boolean);
  const target = String(chain?.target ?? '');
  const tWords = words(target);
  const counts = chunks.map((c) => words(c).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const aligned = tWords.length > 0 && total === tWords.length;
  const cums = []; let acc = 0;
  for (const c of counts) { acc += c; cums.push(acc); }
  const last = chunks.length - 1;
  let bounds = chunks.map((_, i) => i);
  if (chunks.length > 3) {
    bounds = [0.4, 0.7].map((t) => {
      let best = 0, bd = Infinity;
      cums.forEach((c, i) => { if (i === last) return; const d = Math.abs(c / total - t); if (d < bd) { bd = d; best = i; } });
      return best;
    });
    bounds.push(last);
    bounds = [...new Set(bounds)].sort((a, b) => a - b);
  }
  return bounds.map((ci, si) => {
    if (ci === last) return { index: si, text: target || chunks.join(' ') };
    return { index: si, text: aligned ? tWords.slice(0, cums[ci]).join(' ') : chunks.slice(0, ci + 1).join(' ') };
  });
}

/** 실패 횟수 → 힌트 단계. 0=없음 · 1=한국어 뜻 · 2=첫 단어 · 3=전체 텍스트 공개. */
export function hintLevelFor(fails) {
  const n = Number(fails) || 0;
  if (n < 3) return 0;
  if (n === 3) return 1;
  if (n === 4) return 2;
  return 3;
}

/** 앞 n단어만 노출한 힌트 문자열. */
export function firstWordsHint(text, n = 2) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words.slice(0, n).join(' ') + ' …';
}

/** 체이닝 힌트 → { kind: 'none'|'ko'|'first'|'full', text }.
 * `ko` 는 target 전체의 뜻이라 중간 단계에서 띄우면 아직 듣지 않은 뒷 문장을 미리 알려준다.
 * → 마지막 단계에서만 뜻을 쓰고, 중간 단계는 첫 단어 → 전체 로 건너뛴다. */
export function chainHint(fails, { stepText, ko, isLast } = {}) {
  const lv = hintLevelFor(fails);
  if (lv === 0) return { kind: 'none', text: '' };
  if (isLast && lv === 1) return { kind: 'ko', text: String(ko ?? '') };
  if (lv === 1 || (isLast && lv === 2)) return { kind: 'first', text: firstWordsHint(stepText) };
  return { kind: 'full', text: String(stepText ?? '') };
}

/* 덧붙은 말이 **호칭·감탄사·담화표지·문미태그**인지 판정 (설계 정본의 '변주 아님' 4범주).
 * 이들은 쉼표로 분리된 앞/뒤 조각으로 붙는다 — `Honey, …` / `…, honey.` / `…, right?`
 * 쉼표 없이 붙는 주어(`Our wedding seems like…`)·부사(`How have you been lately?`)는 진짜 변주이므로 제외.
 * (쉼표 조건 없이 '2단어 이하 추가'만 보면 주어 추가를 오탐한다 — 2026-07-10) */
function addedIsOnlyVocative(base, en) {
  const segs = String(en ?? '').split(',');
  if (segs.length < 2) return false;
  const candidates = [segs.slice(1).join(','), segs.slice(0, -1).join(','), segs.slice(1, -1).join(',')];
  return candidates.some((c) => norm(c) === base);
}

/* 꼬리확장 — base 를 통째로 앞에 두고 뒤에 말만 덧붙인 것.
 *   "Is there a problem?" → "Is there a problem here?" / "…with that?"
 * 주어·시제·극성·문형·목적어가 하나도 안 바뀌므로 변주가 아니다 (2026-07-10 사용자 지적).
 * 단 종결부호가 바뀌면(평서→의문) 문형 변경이므로 변주로 본다. */
const terminalMark = (s) => (String(s ?? '').trim().match(/[.!?]$/) || [''])[0];

/** 드릴 분류 — 'exact'(영상 원문) · 'vocative'(호칭류) · 'tail'(꼬리확장) · 'variation'(진짜 변주) */
function classifyDrill(sentence, base, bw, en) {
  const dn = norm(en);
  if (!dn) return 'variation';
  if (dn === base) return 'exact';
  if (!dn.includes(base)) return 'variation';
  if (wordCount(en) - bw <= 2 && addedIsOnlyVocative(base, en)) return 'vocative';
  if (dn.startsWith(base + ' ')) {
    return terminalMark(en) === terminalMark(sentence) ? 'tail' : 'variation';
  }
  return 'variation';
}

/** 근접중복을 둘로 나눠 센다 — exact(1개 허용) · added(호칭류 + 꼬리확장, 0개).
 * 게이트(scripts/validate-seed.mjs)와 렌더가 이 함수를 공유해야 판정이 갈리지 않는다. */
export function nearDupDrills(sentence, drills) {
  const base = norm(sentence);
  if (!base) return { exact: 0, added: 0 };
  const bw = wordCount(sentence);
  let exact = 0;
  let added = 0;
  for (const d of drills ?? []) {
    const kind = classifyDrill(sentence, base, bw, d?.en);
    if (kind === 'exact') exact += 1;
    else if (kind === 'vocative' || kind === 'tail') added += 1;
  }
  return { exact, added };
}

/** 호칭류·꼬리확장을 제거하고 영상 원문(exact)은 첫 1개만 남긴다 (구 데이터 안전망 — 생성 차단은 게이트가 한다).
 * ※ 2026-07-11 divergence: 게이트(validate-seed)는 신규 payload 에서 exact 를 **0개**로 차단한다.
 *   여기 렌더는 exact 1개를 남겨 **이미 시드된 기존 데이터(ep1-3 등)는 base 가 그대로 보인다** — 사용자 결정
 *   ("기존은 두고 새 세션만 적용"). 새 세션은 payload 에 base 가 없어 이 안전망이 걸릴 일이 없다. */
export function filterNearDupDrills(sentence, drills) {
  const base = norm(sentence);
  const list = Array.isArray(drills) ? drills : [];
  if (!base) return list;
  const bw = wordCount(sentence);
  let keptExact = 0;
  return list.filter((d) => {
    const kind = classifyDrill(sentence, base, bw, d?.en);
    if (kind === 'vocative' || kind === 'tail') return false;
    if (kind !== 'exact') return true;
    keptExact += 1;
    return keptExact === 1;
  });
}

/* 재생 변주 풀 — 또렷한 en-US 뉴럴 보이스(style 무). Azure 폴백(web speechSynthesis) 시엔
 * voice 이름을 seed 로 로컬 quality 후보를 돌려 변주를 유지한다 (speech.js pickVoiceVaried, 2026-07-22).
 * 드릴·체이닝 공용. 속도는 문장 길이가 정한다 — 쉽고 짧으면 빠르게, 어렵고 길면 보통 (사용자 결정 2026-07-22).
 * 다화자 순환은 HVPT 메타분석(다화자>단일화자)의 유비 적용 — 지각훈련 패러다임과 동일하진 않음. */
export const PRACTICE_VOICES = ['en-US-AvaMultilingualNeural', 'en-US-AndrewMultilingualNeural', 'en-US-EmmaMultilingualNeural', 'en-US-GuyNeural', 'en-US-EricNeural'];
const PRACTICE_JITTER = [0, -0.05, 0.03, -0.02, 0.05];

/** 재생 횟수 i + 문장 단어 수 → 화자(순환)·속도(≤6단어 1.15 / 7~9 1.05 / 10+ 1.0, 화자별 ±0.05 지터). */
export function pickPracticeVoice(i, wordCount) {
  const n = PRACTICE_VOICES.length;
  const k = ((Number(i) || 0) % n + n) % n;
  const wc = Number(wordCount) || 0;
  const base = wc <= 6 ? 1.15 : wc <= 9 ? 1.05 : 1.0;
  return { voice: PRACTICE_VOICES[k], rate: Math.round((base + PRACTICE_JITTER[k]) * 100) / 100 };
}

/* 응용 연습(2축) 순수 헬퍼 — 신규 세션·복습 세션이 공유.
 *
 * 축1 변주(drills): 같은 표현을 다른 문법 맥락으로 이식. 호칭('honey')·감탄사('okay')만 덧붙인
 *   근접중복은 변주가 아니므로 렌더에서 걸러낸다 (2026-07-09 전수감사: 3610 드릴 중 34.2%).
 *   기존 105편 데이터는 손대지 않고(사용자 결정) 표시 단계에서만 필터.
 *
 * 축2 체이닝(chain): 스크립트 없이 '듣고 따라 말하기'로 base 를 2문장 수준까지 확장 (elicited imitation).
 *   - 단계 = chunks 누적 (단계 수 고정 X — 청크 수가 곧 단계 수)
 *   - 매 재생마다 화자·속도를 바꿔 '리듬 통째 암기'를 막는다 (사용자 관찰)
 *   - 통과 판정은 발음 점수가 아니라 '단어를 다 말했는가' (speech.passesCoverage)
 *   - 3회 실패부터 단계적 힌트 (뜻 → 첫 단어 → 전체)
 */

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
const wordCount = (s) => norm(s).split(' ').filter(Boolean).length;

/** chain{target,chunks} → 앞에서부터 누적한 단계 배열. 각 단계는 target 의 **원문 접두부**(구두점 보존).
 * chunks 는 끊는 위치(단어 수)만 정한다 — 이어붙이면 구두점이 사라져 런온·물음표 소실이 생긴다.
 * chunks 단어수 합이 target 과 어긋나면(토큰화 불일치) 청크 이어붙이기로 폴백. */
export function buildChainSteps(chain) {
  const chunks = Array.isArray(chain?.chunks) ? chain.chunks : [];
  if (chunks.length < 2) return [];
  const words = (s) => String(s ?? '').split(/\s+/).filter(Boolean);
  const target = String(chain?.target ?? '');
  const tWords = words(target);
  const counts = chunks.map((c) => words(c).length);
  const aligned = tWords.length > 0 && counts.reduce((a, b) => a + b, 0) === tWords.length;
  const last = chunks.length - 1;
  let acc = 0;
  return chunks.map((_, i) => {
    acc += counts[i];
    if (i === last) return { index: i, text: target || chunks.join(' ') };
    return { index: i, text: aligned ? tWords.slice(0, acc).join(' ') : chunks.slice(0, i + 1).join(' ') };
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

/** 근접중복 = base 를 통째로 품고 2단어 이하만 덧붙인 드릴. */
const isNearDup = (base, bw, en) => {
  const dn = norm(en);
  return !!dn && dn.includes(base) && wordCount(en) - bw <= 2;
};

/** 근접중복을 둘로 나눠 센다 — exact(영상 원문 반복, 1개 허용) · added(호칭·감탄사만 덧붙임, 0개).
 * 게이트(scripts/validate-seed.mjs)와 렌더가 이 함수를 공유해야 판정이 갈리지 않는다. */
export function nearDupDrills(sentence, drills) {
  const base = norm(sentence);
  if (!base) return { exact: 0, added: 0 };
  const bw = wordCount(sentence);
  let exact = 0;
  let added = 0;
  for (const d of drills ?? []) {
    if (!isNearDup(base, bw, d?.en)) continue;
    if (norm(d?.en) === base) exact += 1;
    else added += 1;
  }
  return { exact, added };
}

/** 근접중복 드릴을 첫 1개만 남기고 제거 (구 데이터 안전망 — 생성 차단은 게이트가 한다). */
export function filterNearDupDrills(sentence, drills) {
  const base = norm(sentence);
  const list = Array.isArray(drills) ? drills : [];
  if (!base) return list;
  const bw = wordCount(sentence);
  let kept = 0;
  return list.filter((d) => {
    if (!isNearDup(base, bw, d?.en)) return true;
    kept += 1;
    return kept === 1; // 영상 원문 1개만 남김
  });
}

/* 재생 변주 풀 — 또렷한 en-US 뉴럴 보이스(style 무). Azure 폴백(web speechSynthesis) 시엔 rate 만 적용된다. */
export const CHAIN_VOICES = [
  { voice: 'en-US-AvaMultilingualNeural', rate: 1.0 },
  { voice: 'en-US-AndrewMultilingualNeural', rate: 0.92 },
  { voice: 'en-US-EmmaMultilingualNeural', rate: 1.08 },
  { voice: 'en-US-GuyNeural', rate: 0.98 },
  { voice: 'en-US-EricNeural', rate: 1.05 },
];

/** 재생 횟수 i → 화자·속도 (순환). */
export function pickChainVoice(i) {
  const n = CHAIN_VOICES.length;
  return CHAIN_VOICES[((Number(i) || 0) % n + n) % n];
}

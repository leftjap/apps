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

/** chain{target,chunks} → 앞에서부터 누적한 단계 배열. 마지막 단계만 target 원문(구두점 보존). */
export function buildChainSteps(chain) {
  const chunks = Array.isArray(chain?.chunks) ? chain.chunks : [];
  if (chunks.length < 2) return [];
  const last = chunks.length - 1;
  return chunks.map((_, i) => ({
    index: i,
    text: i === last ? String(chain.target ?? chunks.join(' ')) : chunks.slice(0, i + 1).join(' '),
  }));
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

/** 근접중복 드릴(= base 를 통째로 품고 2단어 이하만 덧붙임)을 첫 1개만 남기고 제거. */
export function filterNearDupDrills(sentence, drills) {
  const base = norm(sentence);
  const list = Array.isArray(drills) ? drills : [];
  if (!base) return list;
  const bw = wordCount(sentence);
  let kept = 0;
  return list.filter((d) => {
    const dn = norm(d?.en);
    const near = !!dn && dn.includes(base) && wordCount(d?.en) - bw <= 2;
    if (!near) return true;
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

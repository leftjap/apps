/* 영문 문장 속 한국어 고유명사 — **TTS 로 보낼 SSML 에만** 한글 구간으로 끊어 준다 (2026-09-15 사용자 보고).
 *
 * personal 트랙 문장은 가게·사람·동네 이름을 로마자로 적는다 (현대음률 → "Hyundae-eumryul").
 * 영어 음성은 그걸 영어 철자로 읽어 전혀 다른 소리가 난다. Azure 실측(2026-09-15):
 *   - "Okay. And then Hyundae-eumryul?" → en-US 전사 "OK. And then Hyundai Umbrell?"
 *
 * 그렇다고 문장 안에 한글을 그냥 섞으면 **문장 전체가 한국어 음운으로 넘어간다** (사용자 청취 보고,
 * 실측으로도 확인: "How about 청기와? The 갈비 is amazing." → en-US 전사가 "How about Tanguya
 * talkib? It's amazing." 로 무너지고 ko-KR 전사는 문장 전체를 한글로 받아 적는다). <lang xml:lang="ko-KR">
 * 를 둘러도 같은 문장 안에서는 마찬가지였다.
 *
 * 그래서 speech.js 는 여기서 받은 구간을 **각각 제 <voice> 블록**으로 합성한다. 블록이 나뉘면 언어가
 * 서로 번지지 않아 영어는 영어대로, 한국어는 한국어대로 들린다 (실측: "Let's get meat first at 고릴라,
 * then walk to City Hall and grab a drink in 서촌." → en-US 가 영어 문장을 그대로 받아 적고 ko-KR 이
 * "고릴라. 서촌." 을 받아 적는다). 화자는 같은 Multilingual 음성을 쓰므로 음색은 바뀌지 않는다.
 *
 * 화면 글자와 발음 채점 레퍼런스는 그대로 로마자다. 바뀌는 것은 SSML 본문뿐이다.
 *
 * 새 고유명사를 쓴 시드를 만들면 여기 한 줄 추가한다. 왼쪽은 시드 en 의 철자 그대로,
 * 오른쪽은 그 줄 kr(음차)에 적힌 한글 그대로.
 */

export const KOREAN_TERMS = {
  // 사람
  Soyeon: '소연',
  Bongsu: '봉수',
  Yonggu: '용구',
  Sanggu: '상구',
  Nani: '나니',
  // 가게·동네
  Cheonggiwa: '청기와',
  'Hyundae-eumryul': '현대음률',
  Gorilla: '고릴라',
  Seochon: '서촌',
  // 음식
  galbi: '갈비',
  gopchang: '곱창',
};

const HANGUL = /[가-힣]/;
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* 표기 변형은 '사전 철자' 와 '첫 글자만 대문자' 두 가지만 본다 (galbi → Galbi 는 문장 첫머리).
 * 전부 대소문자 무시로 열면 Gorilla(가게) 가 gorilla(동물) 까지 한국어로 읽게 만든다. */
const VARIANTS = Object.keys(KOREAN_TERMS)
  .flatMap((k) => (capFirst(k) === k ? [k] : [k, capFirst(k)]))
  .sort((a, b) => b.length - a.length);
const TERM_RE = new RegExp(`\\b(?:${VARIANTS.map(escapeRe).join('|')})\\b`, 'g');

const hangulOf = (m) => KOREAN_TERMS[m] ?? KOREAN_TERMS[m.charAt(0).toLowerCase() + m.slice(1)];
const NO_WORD = /^[^\p{L}\p{N}]+$/u; // 글자·숫자가 하나도 없는 조각 = 문장부호·공백뿐

/** 한글 음절이 하나라도 섞였는지. */
export function hasHangul(text) {
  return HANGUL.test(String(text ?? ''));
}

/**
 * 문장을 영어 구간과 한국어 고유명사 구간으로 가른다.
 * @returns {{ko: boolean, text: string}[]} 고유명사가 없으면 길이 1 (원문 한 덩이).
 */
export function splitKoreanTerms(text, lang = 'en-US') {
  const s = String(text ?? '');
  if (!s || !String(lang ?? 'en-US').startsWith('en')) return [{ ko: false, text: s }];

  const segs = [];
  let last = 0;
  TERM_RE.lastIndex = 0;
  for (let m = TERM_RE.exec(s); m; m = TERM_RE.exec(s)) {
    const hangul = hangulOf(m[0]);
    if (!hangul) continue;
    if (m.index > last) segs.push({ ko: false, text: s.slice(last, m.index) });
    segs.push({ ko: true, text: hangul });
    last = m.index + m[0].length;
  }
  if (!segs.length) return [{ ko: false, text: s }];
  if (last < s.length) segs.push({ ko: false, text: s.slice(last) });

  /* 한국어 바로 뒤의 문장부호는 한국어 구간에 붙인다 — 부호만 든 블록은 빈 발화가 되고,
   * 물음표·마침표는 그 이름에 걸려야 억양이 맞다 ("현대음률?"). 아포스트로피는 옮기지 않는다
   * (Nani's → 나니 + 's — 소유격은 영어 쪽 소리다). */
  const out = [];
  for (const seg of segs) {
    const prev = out[out.length - 1];
    if (!prev?.ko || seg.ko) { out.push({ ...seg }); continue; }
    if (NO_WORD.test(seg.text)) { prev.text += seg.text; continue; }
    const lead = seg.text.match(/^[.,!?;:…]+/);
    if (lead) { prev.text += lead[0]; out.push({ ko: false, text: seg.text.slice(lead[0].length) }); }
    else out.push({ ...seg });
  }
  return out;
}

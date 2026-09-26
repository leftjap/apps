/* 영문 문장 속 한국어 고유명사 — **TTS 로 보낼 SSML 에만** IPA 발음을 붙여 준다 (2026-09-15 사용자 보고,
 * 2026-09-26 재설계).
 *
 * personal 트랙 문장은 가게·사람·동네 이름을 로마자로 적는다 (현대음률 → "Hyundae-eumryul").
 * 영어 음성은 그걸 영어 철자로 읽어 전혀 다른 소리가 난다. Azure 실측(2026-09-26, en-US 자유 전사):
 *   - Nani → "Nanny", Gwanghwamun → "Guangwamen", Andong → "Anong", Seochon → "Siakan",
 *     makgeolli → "makjiali", Silbi → "Silbai"
 *
 * 9/15 엔 한글 구간을 제 <voice> 블록으로 떼어 내 한국어로 읽혔다. 그런데 블록마다 억양이 새로 시작해
 * "Did / 나니 / throw up again?" 이 세 사람이 나눠 읽는 기계음처럼 들렸다 (2026-09-26 사용자 보고).
 * 한 블록 안에서 한국어로 읽히는 길은 찾지 못했다 (실측 2026-09-26, Ava·Andrew·Guy·ko-KR Hyunsu,
 * 이름 구간만 잘라 ko/en STT):
 *   - <lang xml:lang="ko-KR">나니</lang> 을 문장 중간에 두면 대부분 무시된다 (prosody 안팎·공백 포함 전부
 *     ko-KR 전사 실패, "Beneath"·"On the moon" 같은 뭉개진 소리). speak 를 ko-KR 로 두고 영어를
 *     <lang en-US> 로 감싼 배치는 Ava·Nani 한 조합에서만 한국어로 들렸고 Andrew·광화문에서는 재현되지
 *     않아 쓸 수 없다. 문장을 <s> 로 끊으면 한국어로 읽지만 쉼이 0.8~1.3초 붙는다.
 *   - HD 음성(DragonHD)은 지역 표에서 koreacentral 미지원이고 실측도 400 이다.
 *   - <phoneme alphabet="ipa"> 는 자리에서 그대로 듣는다 — Ava·Emma·Andrew(Multilingual)·Guy·Eric·
 *     Jane+cheerful 전부 400 없이 합성되고, 길이는 로마자 대비 −0.5~+0.2초(대부분 ±0.2초 안).
 *     자유 전사가 "Did Nani throw up again?" / "Let's meet at Kwanghwamun at six." 로 바뀐다
 *     (Andrew 의 Nani "Did not he", Ava 의 광화문 "Guanghua Moon" 처럼 목소리별 예외는 있다).
 * 그래서 문장은 한 voice 블록 그대로 두고 고유명사에만 IPA 를 붙인다. 영어 화자가 한국 이름을 또박또박
 * 말하는 소리다 (한국어 원어민 음운은 아니다 — 그건 블록을 나눠야만 나온다).
 *
 * 화면 글자와 발음 채점 레퍼런스는 그대로 로마자다. 바뀌는 것은 SSML 본문뿐이다.
 *
 * 새 고유명사를 쓴 시드를 만들면 여기 한 줄 추가한다. 키는 시드 en 의 철자 그대로(대소문자 포함),
 * ko 는 그 줄 kr(음차)의 한글, ipa 는 **en-US 음소표 기호**만으로 (koreanTerms.test.js 가 검사한다 —
 * 문서는 표 밖 기호에 400 을 낸다고 하지만 실측(2026-09-26)에서는 a·o·ɯ·ɡ·tɕʰ 도 400 없이 합성됐다.
 * 대신 어떤 소리로 읽힐지 예측이 안 되므로 표 안 기호만 쓴다). 영어 철자 읽기가 이미 맞는 낱말은 넣지 않는다 — 2026-09-26
 * 서버 세션 전수 실측에서 galbi·gopchang·gondre·Honshitsu·Suki·Minsu 가 그랬고, galbi·Gorilla 는
 * IPA 가 오히려 나빴다 ("Golby", "Goreal Law").
 *
 * 판정 기준 (2026-09-26 확정): 앱과 같은 SDK(웹소켓) 경로로 합성한 소리에서 이름 구간만 잘라 **ko-KR 발음 평가**
 * (참조 = 한글 이름) 정확도를 잰다 — 한국어 발음 평가 모델이 "참조 발음에 얼마나 가까운가" 를 매기는 값이며
 * 사람 귀의 대용이지 같은 것은 아니다. 로마자 그대로 읽은 소리(하한)와 같은 목소리가 한글만 한국어로 읽은 소리
 * (상한, 9/15 블록 방식의 소리) 사이에서 IPA 후보를 고른다. 합성은 같은 SSML 이어도 매번 조금 다르므로
 * 3회×2목소리(Ava·Andrew) 평균(n=6)으로 본다. 실측(ko-KR 정확도 평균, 로마자 → IPA, 상한):
 *   Nani 62→78 (92) · makgeolli 68→88 (96) · Seochon 52→75 (92) · Andong 53→71 (96) · Silbi 57→71 (88, 상한 n=5) ·
 *   Gwanghwamun 66→77 (94) · Hyundae-eumryul 61→72 (88) · Cheonggiwa 80→84 (90) · Bongsu 62→68 (95) ·
 *   cheonggukjang 73→75 (93) · bossam 59→66 (80) · Sanggu 63→66 (87).
 *   Soyeon 은 로마자 83 > IPA 80, Yonggu 70 = 70, Mangwon 82 = 81 이라 사전에서 뺐다.
 * 여섯 낱말(Nani·makgeolli·Seochon·Andong·Silbi·Gwanghwamun·현대음률)은 로마자보다 11~22점 오르고, 나머지
 * (청기와·봉수·청국장·보쌈·상구)는 2~7점이라 측정 편차(sd 3~8) 안에 있다. 상한(80~96)에는 모두 못 미친다 —
 * 한 목소리·한 호흡을 지키는 대가다.
 */

export const KOREAN_TERMS = {
  // 사람 — Soyeon·Yonggu 는 로마자 읽기가 이미 같거나 나아 넣지 않는다(아래 실측)
  Nani: { ko: '나니', ipa: 'nɑ.ni' },
  Bongsu: { ko: '봉수', ipa: 'bɔŋ.su' },
  Sanggu: { ko: '상구', ipa: 'sɑŋ.gu' },
  // 가게·동네 — Mangwon 은 로마자 읽기가 이미 맞아 넣지 않는다
  Cheonggiwa: { ko: '청기와', ipa: 'tʃʌŋ.gi.wɑ' },
  'Hyundae-eumryul': { ko: '현대음률', ipa: 'hjʌn.dɛ.um.njul' },
  Seochon: { ko: '서촌', ipa: 'sʌ.tʃɔn' },
  Andong: { ko: '안동', ipa: 'ɑn.doʊŋ' },
  Gwanghwamun: { ko: '광화문', ipa: 'kwɑŋ.hwɑ.mun' },
  Silbi: { ko: '실비', ipa: 'sil.bi' },
  // 음식 — 영어 철자 읽기가 틀리는 것만 (makgeolli → "makjiali", bossam → "Boss Sam")
  cheonggukjang: { ko: '청국장', ipa: 'tʃʌŋ.gʊk.dʒɑŋ' },
  makgeolli: { ko: '막걸리', ipa: 'mɑk.gʌl.li' },
  bossam: { ko: '보쌈', ipa: 'boʊ.sɑm' },
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* 철자는 사전 그대로만 본다 (대소문자 구분) — 전부 대소문자 무시로 열면 영어 보통명사와 겹치는 이름이
 * 잘못 걸린다. 긴 것부터 맞춰 'Hyundae-eumryul' 이 'Hyundae' 로 잘리지 않게 한다. */
const TERM_RE = new RegExp(`\\b(?:${Object.keys(KOREAN_TERMS).sort((a, b) => b.length - a.length).map(escapeRe).join('|')})\\b`, 'g');

/**
 * 문장을 영어 구간과 고유명사 구간으로 가른다. 글자는 모두 원문 그대로이고, 고유명사 구간에만 ipa 가 있다.
 * @returns {{ipa: string|null, text: string}[]} 고유명사가 없으면 길이 1 (원문 한 덩이).
 */
export function splitKoreanTerms(text, lang = 'en-US') {
  const s = String(text ?? '');
  if (!s || !String(lang ?? 'en-US').startsWith('en')) return [{ ipa: null, text: s }];

  const segs = [];
  let last = 0;
  TERM_RE.lastIndex = 0;
  for (let m = TERM_RE.exec(s); m; m = TERM_RE.exec(s)) {
    if (m.index > last) segs.push({ ipa: null, text: s.slice(last, m.index) });
    segs.push({ ipa: KOREAN_TERMS[m[0]].ipa, text: m[0] });
    last = m.index + m[0].length;
  }
  if (!segs.length) return [{ ipa: null, text: s }];
  if (last < s.length) segs.push({ ipa: null, text: s.slice(last) });
  return segs;
}

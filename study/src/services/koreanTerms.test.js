import { describe, it, expect } from 'vitest';
import { splitKoreanTerms, KOREAN_TERMS } from './koreanTerms.js';

const plain = (segs) => segs.map((s) => (s.ipa ? `[${s.text}=${s.ipa}]` : s.text)).join('');

/* 한국어 고유명사는 **같은 문장·같은 음성 안에서** IPA 로만 발음을 바꾼다 (2026-09-26 사용자 보고).
 * 종전(2026-09-15)엔 한글 구간을 제 <voice> 블록으로 떼어 냈는데, 블록마다 억양이 새로 시작해
 * "Did / 나니 / throw up again?" 이 세 사람이 나눠 읽는 것처럼 들렸다. 그래서 구간은 로마자 그대로 두고
 * 발음 기호만 붙인다 — 화면 글자·채점 레퍼런스와 같은 철자다. */
describe('splitKoreanTerms — 영문 문장에서 한국어 고유명사 자리에 IPA 를 붙인다', () => {
  it('고유명사 자리를 IPA 구간으로 끊어 낸다 — 글자는 로마자 그대로', () => {
    expect(splitKoreanTerms('Did Nani throw up again?', 'en-US')).toEqual([
      { ipa: null, text: 'Did ' },
      { ipa: 'nɑ.ni', text: 'Nani' },
      { ipa: null, text: ' throw up again?' },
    ]);
  });

  it('문장 맨 앞·맨 뒤 고유명사도 구간이 된다 — 문장부호는 영어 구간에 남는다', () => {
    expect(plain(splitKoreanTerms('Soyeon wants to go to Hyundae-eumryul.', 'en-US')))
      .toBe('[Soyeon=soʊ.jʌn] wants to go to [Hyundae-eumryul=hjʌn.dɛ.ʌm.njul].');
    expect(plain(splitKoreanTerms('How about Cheonggiwa? The galbi is amazing.', 'en-US')))
      .toBe('How about [Cheonggiwa=tʃʌŋ.gi.wɑ]? The galbi is amazing.');
  });

  it('소유격 \'s 는 영어 구간으로 남는다', () => {
    expect(plain(splitKoreanTerms("I put in Nani's eye drops at noon.", 'en-US')))
      .toBe("I put in [Nani=nɑ.ni]'s eye drops at noon.");
  });

  it('부분 일치는 가르지 않는다 (단어 경계)', () => {
    const s = 'Nanisaurus and Soyeonium';
    expect(splitKoreanTerms(s, 'en-US')).toEqual([{ ipa: null, text: s }]);
  });

  it('철자는 사전 그대로만 본다 — 소문자 nani 는 이름이 아니다', () => {
    const s = 'the nani of it';
    expect(splitKoreanTerms(s, 'en-US')).toEqual([{ ipa: null, text: s }]);
  });

  it('고유명사가 없으면 구간 하나 — 원문 그대로', () => {
    const s = 'I have to go with you next time.';
    expect(splitKoreanTerms(s, 'en-US')).toEqual([{ ipa: null, text: s }]);
  });

  it('en 이 아닌 언어·빈 입력은 가르지 않는다', () => {
    expect(splitKoreanTerms('Soyeon', 'ja-JP')).toEqual([{ ipa: null, text: 'Soyeon' }]);
    expect(splitKoreanTerms('', 'en-US')).toEqual([{ ipa: null, text: '' }]);
    expect(splitKoreanTerms(null, 'en-US')).toEqual([{ ipa: null, text: '' }]);
  });

  it('두 번 불러도 같은 결과 (정규식 lastIndex 초기화)', () => {
    const s = 'Soyeon and Bongsu.';
    expect(splitKoreanTerms(s, 'en-US')).toEqual(splitKoreanTerms(s, 'en-US'));
  });

  /* Azure 는 en-US 음소표에 없는 기호가 들어가면 400 을 낸다 (SSML 문서). 사전의 IPA 는 en-US 표의
   * 기호(모음 i ɪ eɪ ɛ æ ɑ ɔ ʊ oʊ u ʌ ə ɝ ɚ aɪ aʊ ɔɪ ju · 자음 p b t d k g m n ŋ f v θ ð s z ʃ ʒ tʃ dʒ l ɹ j w h)
   * 와 음절 경계 '.' 만 쓴다. 따옴표(')·쉼표(,)·콜론(:) 을 강세·장음 기호로 잘못 넣는 실수도 여기서 걸린다. */
  it('사전 값은 en-US IPA 기호와 음절 경계로만 이루어진다', () => {
    const EN_US_IPA = /^(?:[pbtdkgmnŋfvθðszʃʒljwh]|tʃ|dʒ|ɹ|eɪ|oʊ|aɪ|aʊ|ɔɪ|ju|[iɪɛæɑɔʊuʌəɝɚ]|\.)+$/u;
    for (const [roman, entry] of Object.entries(KOREAN_TERMS)) {
      expect(entry.ipa, roman).toMatch(EN_US_IPA);
      expect(entry.ipa, roman).not.toMatch(/^\.|\.$|\.\./);
      expect(entry.ko, roman).toMatch(/^[가-힣]+$/);
    }
  });
});

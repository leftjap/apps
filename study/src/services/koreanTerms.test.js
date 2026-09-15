import { describe, it, expect } from 'vitest';
import { splitKoreanTerms, hasHangul, KOREAN_TERMS } from './koreanTerms.js';

const plain = (segs) => segs.map((s) => (s.ko ? `[${s.text}]` : s.text)).join('');

describe('splitKoreanTerms — 영문 문장을 영어 구간과 한국어 고유명사 구간으로 가른다', () => {
  it('로마자 고유명사 자리를 한글 구간으로 끊어 낸다', () => {
    expect(splitKoreanTerms('Okay. And then Hyundae-eumryul?', 'en-US')).toEqual([
      { ko: false, text: 'Okay. And then ' },
      { ko: true, text: '현대음률?' },
    ]);
    expect(plain(splitKoreanTerms('How about Cheonggiwa? The galbi is amazing.', 'en-US')))
      .toBe('How about [청기와?] The [갈비] is amazing.');
  });

  it('문장 맨 앞·맨 뒤 고유명사도 구간이 된다', () => {
    expect(splitKoreanTerms('Soyeon wants to go to Hyundae-eumryul.', 'en-US')).toEqual([
      { ko: true, text: '소연' },
      { ko: false, text: ' wants to go to ' },
      { ko: true, text: '현대음률.' },
    ]);
  });

  /* 한국어 뒤에 붙은 문장부호는 한국어 구간에 붙인다 — 부호만 든 구간은 빈 발화가 되고,
   * 물음표는 그 이름에 걸려야 맞다. */
  it('한국어 바로 뒤의 문장부호는 한국어 구간에 붙는다', () => {
    const segs = splitKoreanTerms('How about Gorilla?', 'en-US');
    expect(segs).toEqual([{ ko: false, text: 'How about ' }, { ko: true, text: '고릴라?' }]);
  });

  it('소유격 \'s 는 영어 구간으로 남는다', () => {
    expect(splitKoreanTerms("I put in Nani's eye drops at noon.", 'en-US')).toEqual([
      { ko: false, text: 'I put in ' },
      { ko: true, text: '나니' },
      { ko: false, text: "'s eye drops at noon." },
    ]);
  });

  it('문장 첫머리 대문자 변형도 같은 항목으로 본다', () => {
    expect(plain(splitKoreanTerms('Galbi is amazing.', 'en-US'))).toBe('[갈비] is amazing.');
  });

  /* 영어 보통명사와 철자가 겹치는 항목(Gorilla=가게 이름)은 대문자일 때만 바꾼다 —
   * 소문자 gorilla 는 동물이라 한국어로 읽으면 오히려 틀린다. */
  it('영어 보통명사와 겹치는 항목은 대문자일 때만 바꾼다', () => {
    expect(splitKoreanTerms('I saw a gorilla at the zoo.', 'en-US'))
      .toEqual([{ ko: false, text: 'I saw a gorilla at the zoo.' }]);
  });

  it('부분 일치는 가르지 않는다 (단어 경계)', () => {
    expect(splitKoreanTerms('Nanisaurus and Soyeonium', 'en-US'))
      .toEqual([{ ko: false, text: 'Nanisaurus and Soyeonium' }]);
  });

  it('고유명사가 없으면 구간 하나 — 원문 그대로', () => {
    const s = 'I have to go with you next time.';
    expect(splitKoreanTerms(s, 'en-US')).toEqual([{ ko: false, text: s }]);
  });

  it('en 이 아닌 언어·빈 입력은 가르지 않는다', () => {
    expect(splitKoreanTerms('Soyeon', 'ja-JP')).toEqual([{ ko: false, text: 'Soyeon' }]);
    expect(splitKoreanTerms('', 'en-US')).toEqual([{ ko: false, text: '' }]);
    expect(splitKoreanTerms(null, 'en-US')).toEqual([{ ko: false, text: '' }]);
  });

  it('두 번 불러도 같은 결과 (정규식 lastIndex 초기화)', () => {
    const s = 'Soyeon and Bongsu.';
    expect(splitKoreanTerms(s, 'en-US')).toEqual(splitKoreanTerms(s, 'en-US'));
  });

  it('사전 값은 모두 한글이다', () => {
    for (const [roman, hangul] of Object.entries(KOREAN_TERMS)) {
      expect(hasHangul(hangul), roman).toBe(true);
      expect(hasHangul(roman), roman).toBe(false);
    }
  });
});

describe('hasHangul', () => {
  it('한글 음절이 하나라도 있으면 참', () => {
    expect(hasHangul('And then 현대음률?')).toBe(true);
    expect(hasHangul('And then Hyundae-eumryul?')).toBe(false);
    expect(hasHangul(null)).toBe(false);
  });
});

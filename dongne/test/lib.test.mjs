import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  colloquialName,
  buildGazetteer,
  cleanText,
  isAd,
  tokenize,
  stripJosa,
  kstHour,
  summarizeDated,
  countNaverBlogDay,
  localKeywords,
} from '../probe/lib.mjs';

test('colloquialName drops the numbers people do not write', () => {
  assert.equal(colloquialName('상계3·4동'), '상계동');
  assert.equal(colloquialName('성수1가1동'), '성수동');
  assert.equal(colloquialName('금호2·3가동'), '금호동');
  assert.equal(colloquialName('홍제1동'), '홍제동');
  assert.equal(colloquialName('연남동'), '연남동');
  assert.equal(colloquialName('원효로2동'), '원효로');
  assert.equal(colloquialName('을지로동'), '을지로');
  assert.equal(colloquialName('구로3동'), '구로동');
  assert.equal(colloquialName('종로1·2·3·4가동'), '종로');
  assert.equal(colloquialName('여의동'), '여의도');
});

const feature = (adm_nm, sido = '11') => ({ properties: { adm_nm, sido, adm_cd2: adm_nm } });

test('buildGazetteer merges numbered dongs and flags duplicate names', () => {
  const g = buildGazetteer([
    feature('서울특별시 노원구 상계1동'),
    feature('서울특별시 노원구 상계3·4동'),
    feature('서울특별시 강남구 신사동'),
    feature('서울특별시 관악구 신사동'),
    feature('서울특별시 마포구 연남동'),
    feature('부산광역시 중구 중앙동', '26'),
    feature('서울특별시 중구 중앙동'),
  ], { areas: [{ query: '홍대', gu: '마포구' }] });

  const sanggye = g.find((e) => e.query === '상계동');
  assert.deepEqual(sanggye.hjd, ['상계1동', '상계3·4동']);
  assert.equal(sanggye.gu, '노원구');

  const sinsa = g.filter((e) => e.query === '신사동');
  assert.equal(sinsa.length, 2);
  assert.ok(sinsa.every((e) => e.sharedInSeoul));

  assert.equal(g.find((e) => e.query === '중앙동').sharedOutsideSeoul, true);
  assert.equal(g.find((e) => e.query === '연남동').sharedOutsideSeoul, false);
  assert.equal(g.find((e) => e.query === '홍대').kind, 'area');
  assert.equal(g.filter((e) => e.kind === 'dong').length, 5);
});

test('cleanText removes tags and entities', () => {
  assert.equal(cleanText('<b>연남동</b> 팝업 &quot;오픈&quot; &amp; 웨이팅&#39;s'), '연남동 팝업 "오픈" & 웨이팅\'s');
});

test('isAd catches sponsored and real-estate posts', () => {
  assert.equal(isAd('업체로부터 소정의 원고료를 받아 작성'), true);
  assert.equal(isAd('연남동 원룸 월세 급매 문의 010-1234-5678'), true);
  assert.equal(isAd('연남동 경의선숲길 산책하다 첫눈'), false);
});

test('tokenize keeps content words and drops places, stopwords and predicates', () => {
  const words = tokenize('연남동에서 #연남동맛집 팝업 오픈했다! 경의선숲길 산책 너무 좋았어요 2026', ['연남동', '마포구']);
  assert.deepEqual(words, ['팝업', '경의선숲길', '산책']);
});

test('stripJosa strips a particle only when the bare word also appears', () => {
  const docs = stripJosa([['팝업이', '고양이'], ['팝업', '첫눈은'], ['첫눈', '고양이를']]);
  assert.deepEqual(docs, [['팝업', '고양이'], ['팝업', '첫눈'], ['첫눈', '고양이']]);
});

test('kstHour reads the hour in Seoul time', () => {
  assert.equal(kstHour(new Date('2026-11-14T15:30:00Z')), 0);
  assert.equal(kstHour(new Date('2026-11-14T02:10:00+09:00')), 2);
});

test('summarizeDated counts the last 24 hours and the hourly spread', () => {
  const now = new Date('2026-11-14T12:00:00+09:00');
  const docs = [
    { datetime: '2026-11-14T11:30:00.000+09:00' },
    { datetime: '2026-11-14T02:05:00.000+09:00' },
    { datetime: '2026-11-13T12:30:00.000+09:00' },
    { datetime: '2026-11-13T11:59:00.000+09:00' },
  ];
  const s = summarizeDated(docs, now);
  assert.equal(s.last24h, 3);
  assert.equal(s.reachedOlder, true);
  assert.equal(s.hourly[11], 1);
  assert.equal(s.hourly[2], 1);
  assert.equal(s.hourly[12], 1);
});

test('countNaverBlogDay counts one full day only when the list reaches past it', () => {
  const items = [{ postdate: '20261114' }, { postdate: '20261113' }, { postdate: '20261113' }, { postdate: '20261112' }];
  assert.deepEqual(countNaverBlogDay(items, '20261113'), { count: 2, complete: true });
  assert.deepEqual(countNaverBlogDay(items.slice(0, 3), '20261113'), { count: 2, complete: false });
});

test('localKeywords keeps words repeated in one dong but rare across dongs', () => {
  const perDong = new Map([
    ['연남동', [['팝업', '카페'], ['팝업', '산책'], ['카페']]],
    ['성수동', [['카페', '전시'], ['카페', '전시']]],
    ['상계동', [['카페'], ['카페', '산책']]],
  ]);
  const out = localKeywords(perDong, { minDf: 2, maxSpread: 1 });
  assert.deepEqual(out.get('연남동'), [{ word: '팝업', df: 2 }]);
  assert.deepEqual(out.get('성수동'), [{ word: '전시', df: 2 }]);
  assert.deepEqual(out.get('상계동'), []);
});

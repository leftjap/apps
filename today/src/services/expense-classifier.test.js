// expense-classifier.test.js — 가계부 분류 자산 검증
import { describe, it, expect, beforeEach } from 'vitest';
import {
  LEFTJAP_CATEGORIES,
  SOYOUN_CATEGORIES,
  BRAND_CATEGORY_MAP,
  MERCHANT_TO_BRAND,
  setCurrentEmail,
  getCategoriesForEmail,
  getCurrentCategories,
  getCategoryById,
  getCategoryIdByName,
  cleanMerchantName,
  getBrandByMerchant,
  getCategoryByBrand,
  autoMatchCategoryByKeyword,
  classifyMerchant,
} from './expense-classifier.js';

beforeEach(() => {
  setCurrentEmail(null);
});

describe('LEFTJAP_CATEGORIES (Keep gas/Code.gs USER_CONFIG[leftjap] 그대로)', () => {
  it('11개, 순서·id·name 정확', () => {
    expect(LEFTJAP_CATEGORIES.length).toBe(11);
    const expected = [
      ['dining', '외식'], ['delivery', '배달'], ['online', '온라인쇼핑'],
      ['conv', '편의점'], ['cat', '고양이'], ['health', '건강'],
      ['culture', '문화'], ['fashion', '패션'], ['subscribe', '구독'],
      ['transport', '교통'], ['etc', '기타'],
    ];
    expected.forEach(([id, name], i) => {
      expect(LEFTJAP_CATEGORIES[i].id).toBe(id);
      expect(LEFTJAP_CATEGORIES[i].name).toBe(name);
    });
  });
});

describe('SOYOUN_CATEGORIES (Keep gas/Code.gs USER_CONFIG[soyoun312] 그대로)', () => {
  it('12개, 순서·id·name 정확 (convenience 별 id)', () => {
    expect(SOYOUN_CATEGORIES.length).toBe(12);
    const expected = [
      ['dining', '외식'], ['food', '마트'], ['convenience', '편의점'],
      ['cafe', '카페'], ['gift', '선물'], ['cat', '고양이'],
      ['health', '건강'], ['culture', '문화'], ['fashion', '패션'],
      ['overseas', '해외체류'], ['invest', '투자'], ['etc', '기타'],
    ];
    expected.forEach(([id, name], i) => {
      expect(SOYOUN_CATEGORIES[i].id).toBe(id);
      expect(SOYOUN_CATEGORIES[i].name).toBe(name);
    });
  });

  it('soyoun 의 convenience id 는 leftjap 의 conv 와 다름 (Keep 원본 보존)', () => {
    expect(SOYOUN_CATEGORIES.find((c) => c.name === '편의점').id).toBe('convenience');
    expect(LEFTJAP_CATEGORIES.find((c) => c.name === '편의점').id).toBe('conv');
  });
});

describe('getCategoriesForEmail / setCurrentEmail / getCurrentCategories', () => {
  it('leftjap 이메일 → LEFTJAP_CATEGORIES', () => {
    expect(getCategoriesForEmail('leftjap@gmail.com')).toBe(LEFTJAP_CATEGORIES);
  });
  it('soyoun 이메일 → SOYOUN_CATEGORIES', () => {
    expect(getCategoriesForEmail('soyoun312@gmail.com')).toBe(SOYOUN_CATEGORIES);
  });
  it('causencompany (디버깅) → LEFTJAP_CATEGORIES', () => {
    expect(getCategoriesForEmail('causencompany@gmail.com')).toBe(LEFTJAP_CATEGORIES);
  });
  it('미등록 이메일 → leftjap default', () => {
    expect(getCategoriesForEmail('unknown@example.com')).toBe(LEFTJAP_CATEGORIES);
    expect(getCategoriesForEmail(null)).toBe(LEFTJAP_CATEGORIES);
    expect(getCategoriesForEmail('')).toBe(LEFTJAP_CATEGORIES);
  });

  it('setCurrentEmail → getCurrentCategories 반영', () => {
    setCurrentEmail('soyoun312@gmail.com');
    expect(getCurrentCategories()).toBe(SOYOUN_CATEGORIES);
    setCurrentEmail('leftjap@gmail.com');
    expect(getCurrentCategories()).toBe(LEFTJAP_CATEGORIES);
    setCurrentEmail(null);
    expect(getCurrentCategories()).toBe(LEFTJAP_CATEGORIES); // null → default
  });
});

describe('getCategoryById — 현재 사용자 우선 + 전체 fallback', () => {
  it('현재 leftjap, conv 검색 → leftjap conv', () => {
    setCurrentEmail('leftjap@gmail.com');
    expect(getCategoryById('conv').name).toBe('편의점');
  });
  it('현재 soyoun, convenience 검색 → soyoun convenience', () => {
    setCurrentEmail('soyoun312@gmail.com');
    expect(getCategoryById('convenience').name).toBe('편의점');
  });
  it('현재 leftjap 인데 soyoun 전용 id (food) 검색 → fallback hit', () => {
    setCurrentEmail('leftjap@gmail.com');
    // brand 매핑 결과로 들어온 외부 id 도 lookup 되어야 (UI 표시는 별도 결정)
    expect(getCategoryById('food').name).toBe('마트');
  });
  it('아예 없는 id → null', () => {
    expect(getCategoryById('nonexistent')).toBeNull();
  });
});

describe('getCategoryIdByName', () => {
  it('현재 leftjap, "편의점" → conv', () => {
    setCurrentEmail('leftjap@gmail.com');
    expect(getCategoryIdByName('편의점')).toBe('conv');
  });
  it('현재 soyoun, "편의점" → convenience', () => {
    setCurrentEmail('soyoun312@gmail.com');
    expect(getCategoryIdByName('편의점')).toBe('convenience');
  });
  it('soyoun 사용자가 leftjap 의 "온라인쇼핑" → online (fallback)', () => {
    setCurrentEmail('soyoun312@gmail.com');
    expect(getCategoryIdByName('온라인쇼핑')).toBe('online');
  });
  it('없는 이름 → null', () => {
    expect(getCategoryIdByName('없는카테고리')).toBeNull();
  });
});

describe('cleanMerchantName', () => {
  it('빈 값/null 안전', () => {
    expect(cleanMerchantName('')).toBe('');
    expect(cleanMerchantName(null)).toBe(null);
    expect(cleanMerchantName(undefined)).toBe(undefined);
  });
  it('신한온누리 접두어 제거', () => {
    expect(cleanMerchantName('신한온누리 사러가수퍼마켓')).toBe('사러가');
  });
  it('민생회복 접두어 제거', () => {
    expect(cleanMerchantName('1차 민생회복 씨유홍대3호')).toBe('씨유홍대3호');
  });
  it('통화코드+금액 접두어 제거', () => {
    expect(cleanMerchantName('USD 22.00 CLAUDE')).toBe('CLAUDE');
    expect(cleanMerchantName('HUF 124,000.00 COS')).toBe('COS');
    expect(cleanMerchantName('달러 SUPREME')).toBe('SUPREME');
  });
  it('변형 통합 — 사러가/또보겠지/COS/STUSSY/KITH/CUREFIP/KIX', () => {
    expect(cleanMerchantName('사러가연희수퍼')).toBe('사러가');
    expect(cleanMerchantName('또부겠지스마일')).toBe('또보겠지');
    expect(cleanMerchantName('COS HU')).toBe('COS');
    expect(cleanMerchantName('SP STUSSY HAWAI')).toBe('STUSSY');
    expect(cleanMerchantName('KITH HAWAII')).toBe('KITH');
    expect(cleanMerchantName('LARINASCEN')).toBe('LA RINASCENTE');
    expect(cleanMerchantName('www.curefi.com')).toBe('CUREFIP');
    expect(cleanMerchantName('KIX DFS Terminal')).toBe('KIX DUTY FREE');
  });
});

describe('getBrandByMerchant / getCategoryByBrand', () => {
  it('직접 매핑된 매출처 → 브랜드 → 카테고리 (canonical id)', () => {
    expect(getBrandByMerchant('지에스25')).toBe('GS25');
    expect(getCategoryByBrand('GS25')).toBe('conv');
    expect(getCategoryByBrand('블루보틀')).toBe('cafe');
    expect(getCategoryByBrand('이마트')).toBe('food');
    expect(getCategoryByBrand('Anthropic')).toBe('subscribe');
    expect(getCategoryByBrand('CUREFIP')).toBe('cat');
  });
  it('정제 후 매칭 (사러가 변형)', () => {
    expect(getBrandByMerchant('사러가연희수퍼마켓')).toBe('사러가수퍼마켓');
  });
  it('없는 매출처/브랜드 → null', () => {
    expect(getBrandByMerchant('없는브랜드')).toBeNull();
    expect(getCategoryByBrand('없는브랜드')).toBeNull();
  });
});

describe('autoMatchCategoryByKeyword', () => {
  it('대표 키워드 매칭', () => {
    expect(autoMatchCategoryByKeyword('스타벅스 홍대점')).toBe('cafe');
    expect(autoMatchCategoryByKeyword('맥도날드 양화점')).toBe('dining');
    expect(autoMatchCategoryByKeyword('우리당구장')).toBe('culture');
    expect(autoMatchCategoryByKeyword('카카오t')).toBe('transport');
    expect(autoMatchCategoryByKeyword('넷플릭스')).toBe('subscribe');
    expect(autoMatchCategoryByKeyword('우아한형제들')).toBe('delivery');
  });
  it('매칭 없으면 etc', () => {
    expect(autoMatchCategoryByKeyword('완전알수없는상호')).toBe('etc');
  });
  it('2026-05-12 보강 — 미분류로 빠지던 chat.db 매출처들', () => {
    // 식당 5개
    expect(autoMatchCategoryByKeyword('(주)파인만컴')).toBe('dining');
    expect(autoMatchCategoryByKeyword('비틀비틀')).toBe('dining');
    expect(autoMatchCategoryByKeyword('홍대원조통골')).toBe('dining');
    expect(autoMatchCategoryByKeyword('치악(춘천방')).toBe('dining');
    expect(autoMatchCategoryByKeyword('철길부산집홍')).toBe('dining');
    // 문화 — 음반
    expect(autoMatchCategoryByKeyword('마음레코드')).toBe('culture');
    // 교통 — 하이패스 (일반 결제 SMS)
    expect(autoMatchCategoryByKeyword('하이패스')).toBe('transport');
    // 구독 — SaaS / 소프트웨어
    expect(autoMatchCategoryByKeyword('GENSPARK.AI')).toBe('subscribe');
    expect(autoMatchCategoryByKeyword('MICROSOFT*BILL')).toBe('subscribe');
    expect(autoMatchCategoryByKeyword('XCORP')).toBe('subscribe');
  });
  it('validIds 제한 — soyoun 활성 카테고리만 매칭', () => {
    const soyounIds = SOYOUN_CATEGORIES.map((c) => c.id);
    // soyoun 에 'online' 없음 → '쿠팡' (online 키워드) → etc fallback
    expect(autoMatchCategoryByKeyword('쿠팡', soyounIds)).toBe('etc');
    // soyoun 에 'cafe' 있음 → 스타벅스 → cafe
    expect(autoMatchCategoryByKeyword('스타벅스', soyounIds)).toBe('cafe');
  });
});

describe('classifyMerchant — 통합 (브랜드 → 키워드 → etc)', () => {
  it('브랜드 매핑 우선', () => {
    const r = classifyMerchant('지에스25 홍대공원점');
    expect(r.brand).toBe('GS25');
    expect(r.category).toBe('conv');
  });
  it('정제 후 브랜드 매핑', () => {
    const r = classifyMerchant('1차 민생회복 씨유홍대3호');
    expect(r.merchant).toBe('씨유홍대3호');
    expect(r.brand).toBe('CU');
    expect(r.category).toBe('conv');
  });
  it('브랜드 없으면 키워드 매칭', () => {
    expect(classifyMerchant('맛있는삼겹살집').category).toBe('dining');
  });
  it('아무것도 매칭 안 되면 etc', () => {
    expect(classifyMerchant('완전알수없는상호').category).toBe('etc');
  });
  it('통화코드 정제 후 매칭', () => {
    const r = classifyMerchant('USD 22.00 CLAUDE.AISUBSCRIPTION');
    expect(r.brand).toBe('Anthropic');
    expect(r.category).toBe('subscribe');
  });
});

describe('자산 무결성', () => {
  it('BRAND_CATEGORY_MAP 의 모든 카테고리 id 는 leftjap+soyoun 합집합에 존재', () => {
    const validIds = new Set([
      ...LEFTJAP_CATEGORIES.map((c) => c.id),
      ...SOYOUN_CATEGORIES.map((c) => c.id),
    ]);
    for (const [brand, cat] of Object.entries(BRAND_CATEGORY_MAP)) {
      expect(validIds.has(cat), `${brand} → ${cat} 미정의 카테고리`).toBe(true);
    }
  });
  it('MERCHANT_TO_BRAND 의 브랜드 다수가 BRAND_CATEGORY_MAP 에 매핑됨', () => {
    const brands = new Set(Object.values(MERCHANT_TO_BRAND));
    let hit = 0;
    for (const b of brands) if (BRAND_CATEGORY_MAP[b]) hit++;
    expect(hit).toBeGreaterThan(brands.size / 2);
  });
});

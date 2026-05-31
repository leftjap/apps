// expense-classifier.js — 가계부 분류 자산 (Keep GAS 포팅)
// 출처: github.com/leftjap/keep gas/Code.gs (사용자 본인 운영 자산)
// 카테고리는 사용자별 분리 — Keep 의 USER_CONFIG.expenseCategories 그대로.
//
// 외부 의존성 0 — 순수 함수 + 정적 매핑만.
// 사용처: 향후 expenses.js / SMS import / Keep 데이터 import 단계에서 import.

// ─── leftjap 카테고리 (Keep gas/Code.gs USER_CONFIG['leftjap@gmail.com'] 그대로, 11개) ──
export const LEFTJAP_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'dining', name: '외식' }),
  Object.freeze({ id: 'delivery', name: '배달' }),
  Object.freeze({ id: 'online', name: '온라인쇼핑' }),
  Object.freeze({ id: 'conv', name: '편의점' }),
  Object.freeze({ id: 'cat', name: '고양이' }),
  Object.freeze({ id: 'health', name: '건강' }),
  Object.freeze({ id: 'culture', name: '문화' }),
  Object.freeze({ id: 'fashion', name: '패션' }),
  Object.freeze({ id: 'subscribe', name: '구독' }),
  Object.freeze({ id: 'transport', name: '교통' }),
  Object.freeze({ id: 'etc', name: '기타' }),
]);

// ─── soyoun 카테고리 (Keep USER_CONFIG['soyoun312@gmail.com'] 그대로, 12개) ─────────
// id 'convenience' 는 leftjap 의 'conv' 와 의도적으로 다름 — Keep 원본 보존.
export const SOYOUN_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'dining', name: '외식' }),
  Object.freeze({ id: 'food', name: '마트' }),
  Object.freeze({ id: 'convenience', name: '편의점' }),
  Object.freeze({ id: 'cafe', name: '카페' }),
  Object.freeze({ id: 'gift', name: '선물' }),
  Object.freeze({ id: 'cat', name: '고양이' }),
  Object.freeze({ id: 'health', name: '건강' }),
  Object.freeze({ id: 'culture', name: '문화' }),
  Object.freeze({ id: 'fashion', name: '패션' }),
  Object.freeze({ id: 'overseas', name: '해외체류' }),
  Object.freeze({ id: 'invest', name: '투자' }),
  Object.freeze({ id: 'etc', name: '기타' }),
]);

// 사용자별 카테고리 매핑.
const EMAIL_TO_CATEGORIES = Object.freeze({
  'leftjap@gmail.com': LEFTJAP_CATEGORIES,
  'soyoun312@gmail.com': SOYOUN_CATEGORIES,
});

let _currentEmail = null;

// ─── Wave 11.8 — DB 캐시 (admin UI 편집한 사용자별 매핑) ─────────────────
// loadUserMappings 가 Dexie 에서 읽어 메모리에 채움. freeze fallback 보장.
let _currentUserId = null;
let _userCategoriesList = null;              // [{ id, name }, ...] or null (미로드)
const _userBrandMap = new Map();             // brand -> category_id
const _userMerchantAliases = new Map();      // merchant_pattern -> brand

/** 현재 로그인 사용자 email 등록 — main.js auth bootstrap 후 호출. */
export function setCurrentEmail(email) {
  _currentEmail = email || null;
}

/** email → 사용자별 카테고리 배열. 매칭 없으면 leftjap default. */
export function getCategoriesForEmail(email) {
  if (!email) return LEFTJAP_CATEGORIES;
  return EMAIL_TO_CATEGORIES[email] || LEFTJAP_CATEGORIES;
}

/**
 * Wave 11.8 — 사용자별 DB 매핑을 Dexie 에서 메모리로 적재.
 * main.js bootstrap 후 1회 호출. realtime change 시 invalidateUserCache 가 재호출.
 *
 * Dexie 가 없거나 매핑이 비면 silent — 호출처 (getCurrentCategories 등) 가
 * freeze fallback (LEFTJAP/SOYOUN_CATEGORIES, BRAND_CATEGORY_MAP, MERCHANT_TO_BRAND) 사용.
 */
export async function loadUserMappings(userId) {
  if (!userId) return { ok: false, reason: 'no_user' };
  const db = (typeof globalThis !== 'undefined') ? globalThis.todayDB : null;
  if (!db) return { ok: false, reason: 'no_db' };
  _currentUserId = userId;
  try {
    const cats = await db.user_categories
      .where('user_id').equals(userId)
      .sortBy('display_order');
    _userCategoriesList = cats.map((c) => ({ id: c.id, name: c.name }));

    const brandRows = await db.user_brand_categories
      .where('user_id').equals(userId)
      .toArray();
    _userBrandMap.clear();
    for (const r of brandRows) _userBrandMap.set(r.brand, r.category_id);

    const aliasRows = await db.user_merchant_aliases
      .where('user_id').equals(userId)
      .toArray();
    _userMerchantAliases.clear();
    for (const r of aliasRows) _userMerchantAliases.set(r.merchant_pattern, r.brand);

    return {
      ok: true,
      categories: _userCategoriesList.length,
      brands: _userBrandMap.size,
      aliases: _userMerchantAliases.size,
    };
  } catch (e) {
    return { ok: false, reason: 'dexie_error', error: e };
  }
}

let _invalidateInFlight = false;
/** 캐시 무효화 → 즉시 reload. realtime change listener (main.js 등록) 가 호출. */
export function invalidateUserCache() {
  if (_invalidateInFlight) return;
  if (!_currentUserId) return;
  _invalidateInFlight = true;
  loadUserMappings(_currentUserId)
    .catch((e) => console.warn('[classifier] invalidateUserCache reload 실패:', e?.message || e))
    .finally(() => { _invalidateInFlight = false; });
}

/** 테스트 / admin.js 캐시 직접 주입 hook. */
export function _setUserCacheForTest({ categories, brandMap, merchantAliases, userId } = {}) {
  if (Array.isArray(categories)) _userCategoriesList = categories.slice();
  if (brandMap && typeof brandMap === 'object') {
    _userBrandMap.clear();
    for (const [k, v] of Object.entries(brandMap)) _userBrandMap.set(k, v);
  }
  if (merchantAliases && typeof merchantAliases === 'object') {
    _userMerchantAliases.clear();
    for (const [k, v] of Object.entries(merchantAliases)) _userMerchantAliases.set(k, v);
  }
  if (userId !== undefined) _currentUserId = userId;
}

/** 테스트 reset — beforeEach 에서 사용. */
export function _clearUserCache() {
  _userCategoriesList = null;
  _userBrandMap.clear();
  _userMerchantAliases.clear();
  _currentUserId = null;
}

/** 현재 사용자의 카테고리 배열 (mocks dynamic master 용).
 * Wave 11.8 — DB 캐시 우선, 없으면 email 기반 freeze fallback.
 */
export function getCurrentCategories() {
  if (_userCategoriesList && _userCategoriesList.length > 0) {
    return _userCategoriesList;
  }
  return getCategoriesForEmail(_currentEmail);
}

/** id 로 카테고리 lookup — 현재 사용자 카테고리 한정.
 * 2026-05-12: 이전엔 SOYOUN_CATEGORIES 전체 fallback 으로 '마트/카페' 등 사용자가
 * 만들지 않은 라벨이 통계 화면에 노출되던 버그. fallback 제거 — 사용자 picker 외
 * id 는 null 반환해서 호출자가 '미분류' 처리하도록.
 */
export function getCategoryById(id) {
  const list = getCurrentCategories();
  return list.find((c) => c.id === id) || null;
}

/** 한글 name → id (현재 사용자 우선, 없으면 전체에서).
 * Wave 11.8 — getCurrentCategories 가 이미 DB 캐시 우선 처리.
 */
export function getCategoryIdByName(name) {
  if (!name) return null;
  const cur = getCurrentCategories().find((c) => c.name === name);
  if (cur) return cur.id;
  const all = [...LEFTJAP_CATEGORIES, ...SOYOUN_CATEGORIES];
  const fallback = all.find((c) => c.name === name);
  return fallback ? fallback.id : null;
}

// ─── 브랜드 → 카테고리 매핑 (BRAND-MAPPING.md 기준) ─────────────────────
export const BRAND_CATEGORY_MAP = Object.freeze({
  // overseas (해외)
  AIRALO: 'overseas', BART: 'overseas', DOUBLETREE: 'overseas',
  'Dusit Thani': 'overseas', 'KIX DUTY FREE': 'overseas', KKday: 'overseas',
  'LA RINASCENTE': 'overseas', Pullman: 'overseas', 'Sokha Hotels': 'overseas',
  'THE WESTIN': 'overseas', 대한항공: 'overseas', 롯데면세점: 'overseas',
  마이리얼트립: 'overseas', 신세계면세점: 'overseas',
  인터컨티넨탈호텔: 'overseas', 인터파크: 'overseas',

  // subscribe (통신/구독)
  Anthropic: 'subscribe',

  // fashion (패션/뷰티)
  COS: 'fashion', 'H&M': 'fashion', HDC아이파크몰: 'fashion',
  KITH: 'fashion', LF: 'fashion', STUSSY: 'fashion',
  SUPREME: 'fashion', 나이키: 'fashion', 네이버페이: 'fashion',
  더현대닷컴: 'fashion', 롯데백화점: 'fashion', 무신사: 'fashion',
  비너스: 'fashion', 삼성물산: 'fashion', 신세계인터내셔날: 'fashion',
  아모레퍼시픽: 'fashion', 올리브영: 'fashion', 유니클로: 'fashion',
  이니스프리: 'fashion', 이솝: 'fashion', 이케아: 'fashion',
  인스턴트펑크: 'fashion', 커스텀멜로우: 'fashion', 코오롱: 'fashion',
  크린토피아: 'fashion', 트라이본즈: 'fashion', 현대홈쇼핑: 'fashion',
  베네피트: 'fashion', 무인양품: 'fashion',

  // food (식품/마트) — 쿠팡은 online 으로 분리 (2026-05-12, 사용자 의도 정렬)
  CJ: 'food', 'SSG.COM': 'food', 금옥당: 'food', 뚜레쥬르: 'food',
  띵굴: 'food', 롯데온: 'food', 베즐리: 'food', 사러가: 'food',
  신세계: 'food', 오아시스: 'food', 온브릭스: 'food', 이마트: 'food',
  쿠팡: 'online', 컬리: 'food', 태극당: 'food', 파리바게뜨: 'food',
  파리크라상: 'food', 풀무원: 'food', 하나로마트: 'food',
  한화커넥트: 'food', 현대그린푸드: 'food', '현대백화점 식품관': 'food',
  고디바: 'food',

  // dining (외식)
  KFC: 'dining', 계륵장군: 'dining', 구스토타코: 'dining',
  도미노피자: 'dining', 등촌동샤브샤브: 'dining', 또보겠지: 'dining',
  롯데리아: 'dining', 만석닭강정: 'dining', 명동교자: 'dining',
  미분당: 'dining', 배달의민족: 'dining', 뱃고동: 'dining',
  버거리: 'dining', 버거킹: 'dining', 봉피양: 'dining',
  새마을식당: 'dining', 송계옥: 'dining', 신차이: 'dining',
  아오이토리: 'dining', 'aвор당N인더박스': 'dining', 아워홈: 'dining',
  연타발: 'dining', 육전국밥: 'dining', 인앤아웃: 'dining',
  진진: 'dining', '천하의 문타로': 'dining', 탐탐오향족발: 'dining',
  한솥도시락: 'dining', 황생가: 'dining', 피크니크: 'dining',

  // cafe (카페)
  T카페나폴레옹: 'cafe', 공차: 'cafe', 논탄토: 'cafe',
  매머드커피: 'cafe', 'MGC커피': 'cafe', 모모스: 'cafe',
  블루보틀: 'cafe', 앤트러사이트: 'cafe', 엔제리너스: 'cafe',
  이디야커피: 'cafe', 잠바주스: 'cafe', 카멜커피: 'cafe',
  크렘드마롱: 'cafe', 투썸플레이스: 'cafe', 팀홀튼: 'cafe',
  폴바셋: 'cafe', 할리스: 'cafe', 아우어베이커리: 'cafe',
  던킨도너츠: 'cafe',

  // convenience → conv (Today 통합 id)
  CU: 'conv', GS25: 'conv', 미니스톱: 'conv',
  세븐일레븐: 'conv', '이마트24': 'conv',

  // culture (문화)
  CGV: 'culture', YBM: 'culture', Apple: 'culture',
  교보문고: 'culture', 디즈니플러스: 'culture', 땡스북스: 'culture',
  메가박스: 'culture', 모닝글로리: 'culture', 밀리의서재: 'culture',
  예스24: 'culture', 롯데시네마: 'culture', 화담숲: 'culture',

  // health (건강)
  가톨릭대학교서울성모병원: 'health', 신촌세브란스병원: 'health',
  연세의료원: 'health', 헬스보이짐: 'health',

  // gift (선물)
  미니골드: 'gift', 호텔신라: 'gift', 롯데: 'gift',

  // cat (고양이)
  CUREFIP: 'cat',

  // etc (특정 불가)
  SK네트웍스: 'etc', SK텔레콤: 'etc', 삼성화재: 'etc', 티머니: 'etc',
});

// ─── 매출처명 → 브랜드 매핑 (BRAND-MAPPING.md §1, 227 매출처) ──────────
export const MERCHANT_TO_BRAND = Object.freeze({
  AIRALO: 'AIRALO',
  AK: 'AK플라자',
  Apple: 'Apple',
  'BART CLIPP': 'BART',
  'CGV 연남': 'CGV', CJCGV: 'CGV',
  씨제이: 'CJ', 씨제이햇김치: 'CJ',
  COS: 'COS',
  '1차 민생회복 씨유홍대3호': 'CU', 'CU 에이케이': 'CU', CU참전숲길점: 'CU',
  '씨유 인천공항T2교통센터': 'CU', '씨유 홍대서교점': 'CU',
  씨유과천르센토데시앙점: 'CU', 씨유홍대3호: 'CU', 씨유홍대3호점: 'CU',
  'CLAUDE.AISUBSCRIPTIO': 'Anthropic',
  'CLAUDE.AISUBSCRIPTION': 'Anthropic',
  CUREFIP: 'CUREFIP',
  'DOUBLE TRE': 'DOUBLETREE',
  'PHP DUSIT THAN': 'Dusit Thani',
  지에스25: 'GS25', '지에스25 S김포공항역': 'GS25', '지에스25 신촌세브란스점': 'GS25',
  '지에스25 인천공항 교통': 'GS25', '지에스25 창전태영': 'GS25', '지에스25 홍대공원점': 'GS25',
  에이치엔엠헤: 'H&M',
  에이치디씨아: 'HDC아이파크몰', 에이치디씨아이파크몰주식회: 'HDC아이파크몰',
  KFC홍익대점: 'KFC',
  KITH: 'KITH',
  'KIX DUTY FREE': 'KIX DUTY FREE',
  케이케이데이: 'KKday',
  'LA RINASCENTE': 'LA RINASCENTE',
  엘에프: 'LF',
  'PULLMAN BA': 'Pullman',
  SK네트웍스: 'SK네트웍스', 'SK네트웍스(': 'SK네트웍스',
  에스케이플래: 'SK텔레콤', 에스케이플래닛: 'SK텔레콤', 에스케이플레닛: 'SK텔레콤',
  'SSG.COM': 'SSG.COM',
  STUSSY: 'STUSSY',
  SUPREME: 'SUPREME',
  'SOKHA PP': 'Sokha Hotels',
  'THE WESTIN': 'THE WESTIN',
  T카페나폴레옹: 'T카페나폴레옹',
  와이비엠: 'YBM', 와이비엠넷: 'YBM',
  가톨릭대학교서울성모: '가톨릭대학교서울성모병원',
  계륵장군: '계륵장군',
  고디바베이커리: '고디바',
  '공차 홍대창전점': '공차',
  'Point사용요청건 교보문고': '교보문고', 교보문고: '교보문고',
  구스토타코: '구스토타코',
  '양갱상점 금옥당': '금옥당',
  나이키의류: '나이키', '디큐브시티 나이키': '나이키',
  네이버파이낸: '네이버페이', 네이버파이낸셜: '네이버페이', 네이버페이: '네이버페이',
  '커피논탄토 주식회사 샌드커': '논탄토',
  대한항공OC빌딩점: '대한항공', '주)대한항공': '대한항공',
  '본사 더현대닷컴': '더현대닷컴',
  던킨도너츠: '던킨도너츠', 비알코리아던킨도너츠: '던킨도너츠',
  도미노피자: '도미노피자',
  등촌동샤브샤: '등촌동샤브샤브',
  디즈니플러스: '디즈니플러스',
  땡스북스: '땡스북스',
  또부겠지스마: '또보겠지', 또부겠지스마일: '또보겠지',
  또보겠지: '또보겠지', 또보겠지떡볶이: '또보겠지',
  뚜레쥬르: '뚜레쥬르', '뚜레쥬르 신촌로터리점': '뚜레쥬르',
  띵굴: '띵굴',
  호텔롯데: '롯데',
  '롯데리아 김포국제공항 국내': '롯데리아', '롯데리아 신김포공항': '롯데리아',
  '롯데리아 인천공항 T2 1층점': '롯데리아', '롯데리아 홍대점': '롯데리아',
  롯데인천공항: '롯데면세점',
  롯데쇼핑영프라자: '롯데백화점',
  '롯데시네마 홍대입구 (티켓': '롯데시네마',
  롯데쇼핑: '롯데온',
  마이리얼: '마이리얼트립',
  만석닭강정: '만석닭강정',
  매머드커피: '매머드커피',
  '메가엠지씨커피 홍대입구역점': 'MGC커피',
  '메가박스중앙㈜홍대지점': '메가박스',
  명동교자명동1호점: '명동교자',
  모닝글: '모닝글로리', '모닝글로리 홍대점': '모닝글로리',
  모모스: '모모스',
  '㈜무신사': '무신사',
  무인양품: '무인양품', '무인양품 AK': '무인양품',
  미니골드CA: '미니골드',
  '미니스톱 서교2점': '미니스톱',
  미분당: '미분당',
  kt밀리의서재: '밀리의서재',
  우아한형제들: '배달의민족',
  뱃고동: '뱃고동',
  버거리: '버거리',
  '버거킹 인천공항T2교통센터점': '버거킹',
  '베네피트기타(메': '베네피트',
  베즐리: '베즐리', 베즐리베이커리: '베즐리',
  봉피양마포: '봉피양',
  블루보틀커피: '블루보틀',
  비너스여성의류: '비너스',
  사러가연: '사러가수퍼마켓', 사러가연희수퍼마켓: '사러가수퍼마켓',
  '신한온누리 사러가': '사러가수퍼마켓', 사러가: '사러가수퍼마켓',
  삼성물산: '삼성물산',
  삼성화재해상: '삼성화재',
  새마을식당: '새마을식당', '새마을식당 홍대서교점': '새마을식당',
  '주식회사 코리아세븐 홍대7번': '세븐일레븐', 코리아세: '세븐일레븐',
  '코리아세븐 김포공항국내': '세븐일레븐', '코리아세븐 동교다온점': '세븐일레븐',
  '코리아세븐 홍대 6번출': '세븐일레븐', '코리아세븐 홍대 6번출구': '세븐일레븐',
  코리아세븐용강점: '세븐일레븐',
  '송계옥 홍대점': '송계옥',
  신세계: '신세계',
  신세계면: '신세계면세점',
  신세계인터내셔날: '신세계인터내셔날',
  신차이타임스퀘어점: '신차이',
  연세대학교: '신촌세브란스병원',
  아모레퍼: '아모레퍼시픽', 아모레퍼시픽: '아모레퍼시픽',
  '주식회사 라트라팡테': '아오이토리',
  '아우어베이커리 신촌숲길점': '아우어베이커리',
  '아워당N인더박스 인천공항T2점': '아워당N인더박스', '아워당N인더박스 인천공항T2': '아워당N인더박스',
  아워홈푸디움인천공항제2: '아워홈',
  앤트러사: '앤트러사이트', 앤트러사이트커피: '앤트러사이트',
  '엔제리너스 김포공항1층': '엔제리너스', '엔제리너스 인천공항 T2 B1': '엔제리너스',
  연세의료원: '연세의료원',
  '연타발 여의': '연타발',
  예스이십사: '예스24',
  오아시스: '오아시스',
  온브릭스: '온브릭스', '온브릭스 주식회사 농업회사': '온브릭스',
  CJ올리브영: '올리브영', 씨제이올리브영김포공항: '올리브영',
  씨제이올리브영동교동점: '올리브영', 씨제이올리브영신촌로터: '올리브영',
  씨제이올리브영인천공항: '올리브영',
  유니클로: '유니클로',
  '주식회사 육전국밥 홍대점': '육전국밥',
  이니스프리: '이니스프리', '이니스프리 홍대3호점': '이니스프리',
  이디야커피천호초교사거리점: '이디야커피',
  이마트: '이마트', '이마트 신촌': '이마트',
  '이마트24': '이마트24', '이마트24 홍대서교점': '이마트24',
  이솝화장품: '이솝',
  이케아코리아: '이케아',
  인스턴트펑크: '인스턴트펑크',
  '주식회사 인앤아웃': '인앤아웃',
  INTERCONTI: '인터컨티넨탈호텔',
  '주식회사 인터파크트리플': '인터파크',
  '파리크라상 잠바주스 김포': '잠바주스',
  여의도진진: '진진',
  '천하의 문타로': '천하의 문타로',
  '카멜커피 9호점': '카멜커피',
  커스텀: '커스텀멜로우', 커스텀멜로우: '커스텀멜로우',
  컬리: '컬리', 컬리_컬리페: '컬리', 컬리_컬리페이: '컬리',
  컬리페이: '컬리', 컬리페이_컬: '컬리', 컬리페이_컬리: '컬리',
  코오롱인더스: '코오롱',
  쿠팡: '쿠팡',
  '퀴즈노스 김포공항점': '퀴즈노스',
  '크렘드마롱 인천공항T2점': '크렘드마롱',
  크린토피아창: '크린토피아', 크린토피아창전태영점: '크린토피아',
  탐탐오향족발: '탐탐오향족발',
  태극당: '태극당',
  '투썸플레이스 세브란스병원점': '투썸플레이스',
  트라이본즈: '트라이본즈',
  '티머니 개인택시': '티머니',
  '비케이알 팀홀튼 서여의': '팀홀튼',
  '파리바게뜨 서소문중앙점': '파리바게뜨', '파리바게뜨 인천공항플라워점': '파리바게뜨',
  '파리크라상 인천공항': '파리바게뜨',
  파리크라: '파리크라상', '파리크라상 인천공항 교통센터': '파리크라상',
  '디큐브시티 폴바셋': '폴바셋',
  '풀무원 기타냉장': '풀무원',
  '농협하나로유통 하나로마트': '하나로마트',
  '한솥도시락 홍대서교점': '한솥도시락',
  '한화커넥트(': '한화커넥트',
  '할리스 미사효성해링턴점': '할리스',
  헬스보이짐: '헬스보이짐',
  '현대그린푸드(공': '현대그린푸드',
  현대홈쇼: '현대홈쇼핑',
  호텔신라: '호텔신라',
  화담숲: '화담숲',
  '황생가에프앤비 인천공항': '황생가', '황생가에프앤비 인천공': '황생가',
  // 현대백화점 식품관 매출처 (43개)
  가메골손만두: '현대백화점 식품관', 갑각류: '현대백화점 식품관',
  계란류: '현대백화점 식품관', 고향전주비빔밥: '현대백화점 식품관',
  과채류: '현대백화점 식품관', 귤: '현대백화점 식품관',
  '금덕푸드 두레': '현대백화점 식품관', '금덕푸드 성진유': '현대백화점 식품관',
  기타소: '현대백화점 식품관', 기타수입음료: '현대백화점 식품관',
  남도분식: '현대백화점 식품관', 담초: '현대백화점 식품관',
  돈육: '현대백화점 식품관', 두씨밀레: '현대백화점 식품관',
  비누: '현대백화점 식품관', 서영이: '현대백화점 식품관',
  서영이앤티: '현대백화점 식품관', 송: '현대백화점 식품관',
  수박: '현대백화점 식품관', 수산물통병선물세: '현대백화점 식품관',
  '수입쥬스 넥타': '현대백화점 식품관', 연체류: '현대백화점 식품관',
  에낭: '현대백화점 식품관', 오베베베이커리: '현대백화점 식품관',
  유일닭강정: '현대백화점 식품관', 이온음료: '현대백화점 식품관',
  일용잡화: '현대백화점 식품관', 정온루: '현대백화점 식품관',
  조선미가: '현대백화점 식품관', '주식회사 가나유': '현대백화점 식품관',
  '주식회사 엔티': '현대백화점 식품관', 참외: '현대백화점 식품관',
  청과: '현대백화점 식품관', '청과(?': '현대백화점 식품관',
  청과SET: '현대백화점 식품관', 청우수산: '현대백화점 식품관',
  포도: '현대백화점 식품관', '편장군 족발': '현대백화점 식품관',
  햄: '현대백화점 식품관', '햇살드림 민푸드': '현대백화점 식품관',
  화장지: '현대백화점 식품관',
});

// ─── 매출처명 정제 ─────────────────────────────────────────────────
// Keep data.js cleanMerchantName 와 동일 로직 (신한온누리/통화코드/변형 통합).
export function cleanMerchantName(merchant) {
  if (!merchant) return merchant;
  let m = String(merchant).trim();

  // 1. 신한온누리 접두어 제거
  m = m.replace(/^신한온누리\s*/, '');

  // 2. 민생회복/1차 민생 접두어 제거
  m = m.replace(/^(1차\s*)?민생(회복)?\s*/, '');

  // 3. 통화코드 접두어 제거
  m = m.replace(/^(달러|엔화|유로|위안|바트|페소)\s+/, '');
  m = m.replace(/^[A-Z]{3}\s+[\d,.]+\s+/, '');
  m = m.replace(/^[A-Z]{3}(\s+[\d\s]+\s+)/, '');
  m = m.replace(/^(USD|EUR|JPY|GBP|CNY|THB|VND|PHP|HUF|KHR|SGD|KRW|MYR|INR)\s+/i, '');
  m = m.replace(/^[\d,.]+\s+/, '');

  // 4. 매출처명 변형 통합
  if (m.match(/^사러가/)) m = '사러가';
  if (m.match(/^또[보부]겠지/)) m = '또보겠지';
  if (m.match(/^COS\s*HU/i)) m = 'COS';
  if (m.match(/온브릭스/)) m = '온브릭스';
  if (m.match(/^SP\s+STUSSY/i)) m = 'STUSSY';
  if (m.match(/^KITH\s+HAWAI/i)) m = 'KITH';
  if (m.match(/^LARINASCEN/i)) m = 'LA RINASCENTE';
  if (m.match(/^www\.curefi|^CUREFIP\.CO/i)) m = 'CUREFIP';
  if (m.match(/^KIX\s*(DFS|DUTY)/i)) m = 'KIX DUTY FREE';

  return m;
}

// 매출처명 → 브랜드 (정제 후 lookup)
// Wave 11.8 — 사용자 alias (today_user_merchant_aliases) 우선, 없으면 freeze MERCHANT_TO_BRAND.
export function getBrandByMerchant(merchant) {
  if (!merchant) return null;
  const cleaned = cleanMerchantName(merchant);
  if (_userMerchantAliases.size > 0) {
    if (_userMerchantAliases.has(cleaned)) return _userMerchantAliases.get(cleaned);
    if (_userMerchantAliases.has(merchant)) return _userMerchantAliases.get(merchant);
  }
  return MERCHANT_TO_BRAND[cleaned] || null;
}

// 브랜드 → 카테고리
// Wave 11.8 — 사용자 brand 매핑 (today_user_brand_categories) 우선, 없으면 freeze BRAND_CATEGORY_MAP.
export function getCategoryByBrand(brand) {
  if (!brand) return null;
  if (_userBrandMap.size > 0 && _userBrandMap.has(brand)) {
    return _userBrandMap.get(brand);
  }
  return BRAND_CATEGORY_MAP[brand] || null;
}

// ─── 키워드 기반 카테고리 폴백 분류 ──────────────────────────────────
// Keep autoMatchCategoryServer 의 rules + checkOrder 포팅.
// 매출처에서 브랜드 lookup 실패 시 호출.
const KEYWORD_RULES = Object.freeze({
  delivery: ['쿠팡이츠','주식회사우아','우아한형제들','우아한형','배달의민족','요기요','데일리샷','(주)데일리샷'],
  subscribe: ['lg전자구독료','disneyplus','디즈니플러스','구글페이먼트','쿠팡(와우멤','네이버플러스','주식회사티빙','에스케이텔레','sk텔레콤','sk통신료','kt통신료','kt 유선상품','후불교통','배민클럽','에스케이플래','넷플릭스','멜론','스포티파이','애플뮤직','유튜브','구글플레이','google d','google dig','google play','google*g','openai','openaiopco','anthropic','notion','notionlabs','클로드','claude','통신','genspark','microsoft','xcorp'],
  online: ['쿠팡','네이버페이','네이버파이낸','롯데쇼핑','동원에프','옥션','주식회사지마','주식회사무신','서울시네이버','주식회사로우','11번가','위메프','이마트','amazon','amazonmarke','amazonmarkeplace'],
  conv: ['코리아세븐','코리아세','cu','씨유','지에스25','지에스(gs)','gs25','세븐일레븐','미니스톱','이마트24','타임스토어','블루샥서','대현유통'],
  cat: ['포포즈반려동','동물병원','펫','사료','반려','애묘','고양이','헬씨','curefi','curefip','키다리동물','슈르르'],
  health: ['세브란스','가톨릭대학교','연세봄이비인','프렌닥터','코코이비인후','세란병원','신촌연세이비','이지약국','광명약국','올리브약국','대학약국','명문약국','위드팜','헬스보이짐','약국','병원','의원','치과','안과','피부과','한의원','클리닉','정형외과','내과','이비인후과','건강검진','세솟는','아현종로약국','독일하트','박신혜유외과','엘리트약국','홍익약국','새현대약국','비타민약국','밸런스약국','태평양약국','신촌연세병원','서울안과','삼성밝은안과','김안과','엘리트안과','유앤유외과','마인드피부과','애플산부인과','연세의료원','파마트엘지약','신촌온누리약','연세한우리약','참약국','차&박피부과','새종로약국','왕솔약국','신보건약국'],
  culture: ['caromclub','옵티머스캐롬','우리당구장','뉴코인싱어노','코인홀릭','코인홀','교보문고','당구','노래방','코인싱어','영풍','알라딘','예스24','영화','cgv','메가박스','롯데시네마','공연','전시','뮤지컬','현대음률','땡스북스','밀리의서재','인터파크트리플','화담숲','스토리엠','뮤비존','디즈니플러스','놀유니버스','수상한사진관','배재학당','국가유산청','와이비엠','마음레코드'],
  fashion: ['젠트서울','gents','아디다스','코오롱인더스','크린토피아','무인양품','현대백화','바버','헤어','미용실','네일','올리브영','자라','유니클로','h&m','나이키','무신사','커스텀멜로우','삼성물산','트라이본즈','인스턴트펑크','코랄리헤어','코랄리','더현대닷컴','베네피트','이솝','이니스프리','에이치엔엠','신세계인터내셔날','비너스','이케아코리아','에이치디씨아','아이파크몰','라임타임','에스씨케이','더하우스','디에스글로벌','엘에프','미니골드','모닝글로리','다른코스메틱스','아모레퍼시픽','참좋은박스'],
  transport: ['카카오t','티머니택시','티머니개인택','마포시엠주유','sk네트웍스','발트페이','주식회사발트','발트페이먼츠','㈜발트페이','주식회사카카','택시','주유','gs칼텍스','sk에너지','s-oil','주차','고속도로','톨게이트','코레일','ktx','srt','동막역','교통안전공단','하이패스'],
  dining: ['철길왕갈비','화규','미로식당','양화정','월순철판동태','을밀대','풍천장어','계고기집','마포집','팔계집','치맛살집','치쿠린','깃뜰','덕수정','맛이차이나','만나식당','신화장','미분당','부농도축장','하진정육','리틀방콕','어랑손만두국','홍대조폭떡볶','제주정원','일심장어','푸줏간','스미비클럽','하스','주식회사부자','주식회사육전','탐탐오향족발','연피랑','호식이두마리','파파존스','와우끝집','커피랩','블루보틀','투썸플레이스','파스쿠찌','커피상인','김진환베이커','사러가연','호랑이','카로우셀','현대음률','천하의문타로','스타벅스','할머니보쌈','부자되세','진미서산','식당','고기','삼겹살','갈비','초밥','돈까스','냉면','국수','치킨','피자','버거','맥도날드','버거킹','롯데리아','이디야','커피','카페','빽다방','메가커피','컴포즈','할리스','폴바셋','바나프레소','파리바게뜨','뚜레쥬르','베이커리','도미노','진진','여의도진진','마이도미','마이도미넌트','고릴라','해별관','라로제','다북어국','청기와식당','영동감자탕','마포소금구이','주식회사경복','또부겠지','히노키공방','춘천집닭갈비','명동왕돈까스','명동교자','등촌동샤브샤','봉피양','연희녹두삼계탕','한강껍데기','한솥도시락','온천충무김밥','황생가에프앤비','황생가','구스토타코','계륵장군','야끼니꾸소량','천하의 문타로','더파이브올스','주식회사 김다희','주식회사 마마','연타발','정각','미자카야','월화식당','송계옥','산울림','주식회사 아소정','고향전주비빔밥','간바레미나상','꼬꼬순이','풍년식당','호반식당','장독대','동보성','옹시미','가비애','남도분식','라면땡기는날','에덴그리고','고구려','성산왕갈비','만석닭강정','가메골손만두','주식회사 인앤아웃','피크니크','오근내','아워홈','아워당','퀴즈노스','스시상','또순이집','대청마루','이천휴게소','주식회사 빅바이트','센트플로우','에낭','야끼토리하루','하꼬','소굴','옹달샘','주막','인앤아웃','대현유통치악','고향집식당','리정원','오베베베이커리','파인만컴','비틀비틀','홍대원조','치악','철길부산'],
  food: ['마트','이마트','홈플러스','롯데마트','식료품','농협하나로','동원','cj','오뚜기','풀무원','컬리','컬리페이','띵굴','오아시스','온브릭스','사러가','죽해수산','ssg.com','태극당','금옥당','김진환베이커','자연도소금빵','도원떡방','금옥호두','양갱상점','예당병과','두씨밀레','현대그린푸드','피터팬식품','참살이유통','서청대호농','무과수마트','한화커넥트','마플코퍼레이션'],
  cafe: ['스타벅스','투썸','이디야','커피','카페','빽다방','메가커피','컴포즈','할리스','폴바셋','블루보틀','바나프레소','커피랩','앤트러사이트','크렘드마롱','코테츠','논탄토','카페나폴레옹','팀홀튼','매머드커피','카멜커피','모모스','무슈부부','아우어베이커리','고디바','공차','엔제리너스','잠바주스','파리크라상','테일러커피','라트라팡테','메가엠지씨','던킨도너츠','비알코리아','뚜레쥬르'],
  gift: ['선물','꽃','플라워','축하','기프트','호텔신라','퐁포네뜨','이제이글로벌'],
  overseas: ['해외','usd','eur','jpy','gbp','foreign','마이리얼','케이케이데이','kkday','airalo'],
  invest: ['키움','미래에셋','삼성증권','nh투자','한국투자','한국금융투자','토스증권','카카오페이증권','업비트','빗썸','코인원','증권','주식','투자','펀드'],
});

// 카테고리 검사 순서 — 좁은 범위 → 넓은 범위.
// Keep 의 dining 룰에 cafe 키워드 (스타벅스/이디야/커피 등) 가 섞여있어
// Today 는 cafe 활성이므로 cafe 를 dining 앞으로 (cafe 우선 매칭).
const CHECK_ORDER = Object.freeze([
  'delivery', 'subscribe', 'cat', 'conv', 'health',
  'culture', 'fashion', 'transport', 'online',
  'cafe', 'dining',
  'gift', 'overseas', 'invest',
  'food',
  'etc',
]);

/**
 * 매출처 텍스트로 카테고리 추정 (브랜드 lookup 실패 시 폴백).
 * @param {string} merchant - 매출처명 (정제 전/후 모두 허용)
 * @param {string[]} [validIds] - 사용자가 활성화한 카테고리 id 목록. 미지정 시 전체.
 * @returns {string} 매칭된 카테고리 id, 매칭 없으면 'etc'.
 */
export function autoMatchCategoryByKeyword(merchant, validIds) {
  if (!merchant) return 'etc';
  const m = String(merchant).toLowerCase();
  const allowed = validIds && validIds.length > 0 ? new Set(validIds) : null;

  for (const cat of CHECK_ORDER) {
    if (allowed && !allowed.has(cat)) continue;
    const keywords = KEYWORD_RULES[cat];
    if (!keywords) continue;
    for (const kw of keywords) {
      if (m.indexOf(kw) !== -1) return cat;
    }
  }
  return 'etc';
}

/**
 * 매출처명 → 카테고리 통합 분류 (3단계 폴백).
 * 1) 매출처 → 브랜드 → 카테고리 (BRAND_CATEGORY_MAP 우선)
 * 2) 키워드 매칭 (KEYWORD_RULES)
 * 3) 'etc'
 * @param {string} rawMerchant - 정제 전 매출처명
 * @returns {{ category: string, brand: string|null, merchant: string }}
 */
export function classifyMerchant(rawMerchant) {
  const merchant = cleanMerchantName(rawMerchant);
  const brand = getBrandByMerchant(merchant);
  if (brand) {
    const cat = getCategoryByBrand(brand);
    if (cat) return { category: cat, brand, merchant };
  }
  return {
    category: autoMatchCategoryByKeyword(merchant),
    brand,
    merchant,
  };
}

const Classifier = {
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
  // Wave 11.8 — DB 캐시
  loadUserMappings,
  invalidateUserCache,
};

// EXPENSE_CATEGORIES — 현재 사용자 기준 동적 getter (mocks `_getExpenseCategoryMaster` 호환).
// const named export 가 아니라 default 객체에 getter 부착.
Object.defineProperty(Classifier, 'EXPENSE_CATEGORIES', {
  get() { return getCurrentCategories(); },
  enumerable: true,
});

// mocks IIFE 가 SPA 모듈 import 없이 접근할 수 있도록 window 노출.
if (typeof window !== 'undefined') {
  window.todayClassifier = Classifier;
}

export default Classifier;

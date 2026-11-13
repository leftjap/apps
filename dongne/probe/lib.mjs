// 측정용 순수 함수. 네트워크·파일 접근은 measure.mjs / gazetteer.mjs 에만 둔다.

// 1차 불용어. 측정 결과를 보고 고친다.
export const STOPWORDS = new Set([
  // 상투어·광고성 (지오 1차 목록)
  '맛집', '카페', '추천', '후기', '일상', '임대', '매매', '분양', '원룸', '오피스텔', '블로그', '오늘', '진짜',
  // 블로그 상투어
  '방문', '리뷰', '포스팅', '네이버', '이웃', '위치', '주소', '영업시간', '주차', '메뉴', '가격', '근처', '이곳', '여기',
  '내돈내산', '데이트', '분위기', '사진', '시간', '정도', '생각', '가능', '이용', '예약', '오픈',
  // 뉴스 상투어
  '기자', '뉴스', '제공', '무단', '전재', '재배포', '금지', '관계자', '이날', '오전', '오후', '올해', '지난', '최근', '이번',
  // 기능어
  '너무', '정말', '그리고', '하지만', '그래서', '그냥', '많이', '조금', '아주', '이제', '다시', '바로', '모두', '함께', '가장',
  '있는', '하는', '되는', '같은', '많은', '다양한', '관련', '대한', '위해', '통해', '저는', '제가', '우리', '에서',
  '서울', '서울시', 'the', 'and', 'com', 'www', 'http', 'https',
]);

// 광고·부동산·스팸으로 보는 표현
const AD_PATTERN = /협찬|체험단|원고료|소정의|제공받|업체로부터|광고|분양|모델하우스|급매|매물|공인중개|중개사|월세|전세|보증금|대출|카톡|오픈채팅|리딩방|부업|010[-. ]?\d{3,4}[-. ]?\d{4}/;

// 서술어로 끝나는 낱말 (형태소 분석 없이 거르는 근사치)
const PREDICATE_END = /(니다|[었았였했겠있없된한인]다|[어아해네세지]요|[었했]어)$/;

const JOSA = ['에서는', '에서도', '으로는', '에게서', '이라는', '에서', '으로', '에게', '한테', '까지', '부터', '처럼', '보다',
  '이랑', '라는', '에는', '에도', '와의', '과의', '은', '는', '이', '가', '을', '를', '에', '의', '로', '와', '과', '도', '만', '랑'];

const NAME_OVERRIDES = { '종로1·2·3·4가동': '종로', '종로5·6가동': '종로', '여의동': '여의도', '원효로동': '원효로', '을지로동': '을지로' };

// 행정동 이름에서 사람들이 글에 쓰지 않는 숫자를 뺀다: 상계3·4동 → 상계동, 성수1가1동 → 성수동
export function colloquialName(hjd) {
  if (NAME_OVERRIDES[hjd]) return NAME_OVERRIDES[hjd];
  const name = hjd.replace(/\d+(?:[·.]\d+)*가/g, '').replace(/\d+(?:[·.]\d+)*/g, '');
  return NAME_OVERRIDES[name] ?? name;
}

// 행정동 경계(GeoJSON features)에서 서울 동네 검색어 목록을 만든다.
export function buildGazetteer(features, { areas = [] } = {}) {
  const outside = new Set();
  const groups = new Map();
  for (const f of features) {
    const parts = f.properties.adm_nm.split(' ');
    const name = colloquialName(parts.at(-1));
    if (f.properties.sido !== '11') { outside.add(name); continue; }
    const gu = parts[1];
    const key = `${gu}|${name}`;
    if (!groups.has(key)) groups.set(key, { query: name, gu, hjd: [], codes: [], kind: 'dong' });
    groups.get(key).hjd.push(parts.at(-1));
    groups.get(key).codes.push(f.properties.adm_cd2);
  }
  const dongs = [...groups.values()];
  const count = new Map();
  for (const d of dongs) count.set(d.query, (count.get(d.query) ?? 0) + 1);
  for (const d of dongs) {
    d.sharedInSeoul = count.get(d.query) > 1;
    d.sharedOutsideSeoul = outside.has(d.query);
  }
  const extra = areas.map((a) => ({ ...a, hjd: [], codes: [], kind: 'area', sharedInSeoul: false, sharedOutsideSeoul: false }));
  return [...dongs, ...extra];
}

export function cleanText(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isAd(text) {
  return AD_PATTERN.test(text);
}

// places: 이 동네를 가리키는 이름들 (연남동, 마포구 …). 이름 자체와 이름으로 시작하는 낱말의 앞부분을 지운다.
export function tokenize(text, places) {
  const stems = places.map((p) => p.replace(/(동|구|시)$/, '')).filter((s) => s.length >= 2);
  const out = [];
  for (let t of cleanText(text).split(/[^0-9A-Za-z가-힣]+/)) {
    t = t.toLowerCase();
    if (places.includes(t) || stems.includes(t)) continue;
    for (const p of places) if (t.startsWith(p)) { t = t.slice(p.length); break; }
    if (t.length < 2 || /^\d+$/.test(t) || STOPWORDS.has(t) || JOSA.includes(t) || PREDICATE_END.test(t)) continue;
    out.push(t);
  }
  return out;
}

// 조사를 뗀 형태가 같은 글 묶음 안에 따로 나올 때만 뗀다 (고양이 → 고양 같은 오류를 막기 위해).
export function stripJosa(docs) {
  const vocab = new Set(docs.flat());
  const strip = (t) => {
    for (const j of JOSA) {
      if (t.endsWith(j) && t.length - j.length >= 2) {
        const stem = t.slice(0, -j.length);
        if (vocab.has(stem)) return stem;
      }
    }
    return t;
  };
  return docs.map((d) => d.map(strip));
}

const HOUR = 3_600_000;

// 한국은 서머타임이 없으므로 UTC+9 로 계산한다.
export function kstHour(date) {
  return (date.getUTCHours() + 9) % 24;
}

export function kstYmd(date) {
  return new Date(date.getTime() + 9 * HOUR).toISOString().slice(0, 10).replaceAll('-', '');
}

// 작성 시각(datetime)이 있는 글(카카오 블로그·카페)의 최근 24시간 집계
export function summarizeDated(docs, now) {
  const from = now.getTime() - 24 * HOUR;
  const hourly = Array(24).fill(0);
  let last24h = 0;
  let reachedOlder = false;
  for (const d of docs) {
    const t = new Date(d.datetime);
    if (t.getTime() <= from) { reachedOlder = true; continue; }
    if (t.getTime() > now.getTime()) continue;
    last24h++;
    hourly[kstHour(t)]++;
  }
  return { last24h, hourly, reachedOlder };
}

// 네이버 블로그는 날짜만 준다. 목록이 그날보다 앞선 날짜까지 내려가야 하루치가 다 센 것이다.
export function countNaverBlogDay(items, ymd) {
  return {
    count: items.filter((i) => i.postdate === ymd).length,
    complete: items.some((i) => i.postdate < ymd),
  };
}

// 동네 안에서 여러 글에 나오고(minDf), 서울 전체에서는 몇 동네에만 나오는(maxSpread) 단어
export function localKeywords(perDong, { minDf = 2, maxSpread }) {
  const dfByDong = new Map();
  const spread = new Map();
  for (const [dong, docs] of perDong) {
    const df = new Map();
    for (const doc of docs) for (const w of new Set(doc)) df.set(w, (df.get(w) ?? 0) + 1);
    dfByDong.set(dong, df);
    for (const w of df.keys()) spread.set(w, (spread.get(w) ?? 0) + 1);
  }
  const out = new Map();
  for (const [dong, df] of dfByDong) {
    out.set(dong, [...df]
      .filter(([w, n]) => n >= minDf && spread.get(w) <= maxSpread)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([word, n]) => ({ word, df: n })));
  }
  return out;
}

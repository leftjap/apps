// 도메인 로직 (작업지시서 §2·§5.3·§6·§8)

// 시안 9곳 — 색은 지시서 §4, 순서는 시안 사이드바
export const COMMUNITIES = [
  { site: 'dcinside', name: '디시인사이드', short: '디시', color: '#2F62D6', aliases: ['디시', 'dc', '디시인사이드'] },
  { site: 'clien', name: '클리앙', short: '클리앙', color: '#0E8F82', aliases: ['클리앙', 'clien'] },
  { site: 'todayhumor', name: '오늘의유머', short: '오유', color: '#2F7A33', aliases: ['오유', '오늘의유머'] },
  { site: 'bobae', name: '보배드림', short: '보배', color: '#96650F', aliases: ['보배', '보배드림'] },
  { site: 'ruliweb', name: '루리웹', short: '루리', color: '#CB4141', aliases: ['루리', '루리웹'] },
  { site: 'humoruniv', name: '웃긴대학', short: '웃대', color: '#7A46BE', aliases: ['웃대', '웃긴대학'] },
  { site: 'theqoo', name: '더쿠', short: '더쿠', color: '#BE3A78', aliases: ['더쿠', 'theqoo'] },
  { site: 'ppomppu', name: '뽐뿌', short: '뽐뿌', color: '#1C74AC', aliases: ['뽐뿌'] },
  { site: 'slr', name: 'SLR클럽', short: 'SLR', color: '#586170', aliases: ['slr', 'slr클럽', '슬알', 'slrclub'] },
]

export const bySite = Object.fromEntries(COMMUNITIES.map((c) => [c.site, c]))

// 보배 판 코드 → 한글 (수집기 goIdToBobaeBoard·직접 크롤 카테고리와 대응)
const BOBAE_BOARDS = { humor: '신유머', strange: '유머게시판', freeb: '자유게시판', politic: '정치게시판', accident: '블랙박스' }

// 뽐뿌 판 코드 → 한글 (수집기 ppomppuBoard 가 go ID 접두사에서 판별)
const PPOMPPU_BOARDS = {
  freeboard: '자유게시판', humor: '유머', car: '자동차', problem: '고민', house: '부동산',
  money: '금융', tour: '여행', daily_life: '일상', baseball: '야구', soccer: '축구',
  gameforum: '게임', drama: '드라마', phone: '휴대폰', baby: '육아', cat: '고양이',
  rescene: '연예', nasol: '나솔', youtube_info: '유튜브',
}

// 판 이름은 실제 수집된 board 가 있을 때만 보여준다.
// 사이트만 보고 추측하면 거짓이 된다 — 이슈링크는 clien 의 news 판, todayhumor 의 lovestory 판도 미러한다 (2026-07-11 실측).
export function boardLabel(post) {
  if (!post.board) return ''
  if (post.site === 'bobae') return BOBAE_BOARDS[post.board] ?? post.board
  if (post.site === 'ppomppu') return PPOMPPU_BOARDS[post.board] ?? ''
  return post.board
}

// 정규화 인기 점수 = 사이트 내 조회수 백분위 (지시서 §8 — 원지표 그대로 정렬 금지)
export function rankSort(rows) {
  return [...rows].sort(
    (a, b) => (b.percentile ?? -1) - (a.percentile ?? -1) || (b.views ?? 0) - (a.views ?? 0),
  )
}

// 게시판명 검색: 보배·뽐뿌는 board 를 코드로 저장하므로 한글 판명 → 코드로 변환해 매칭한다.
// 그 외 사이트는 board 원문(디시 갤명)이 그대로 저장돼 title/board ilike 로 걸린다.
export function searchPlan(query) {
  const text = query.trim()
  if (!text) return null
  const q = text.toLowerCase()
  const sites = COMMUNITIES.filter((c) => c.aliases.some((a) => a.includes(q) || q.includes(a))).map((c) => c.site)
  const boards = [...Object.entries(BOBAE_BOARDS), ...Object.entries(PPOMPPU_BOARDS)]
    .filter(([, name]) => name === text)
    .map(([code]) => code)
  return { text, sites, boards }
}

// 추천 검색어 — 제목 빈도 상위 한글 토큰 (2자 이상, 검색 화면 칩)
export function suggestKeywords(titles, n = 8) {
  const freq = new Map()
  for (const t of titles) {
    for (const tok of new Set(t.match(/[가-힣]{2,}/g) ?? [])) {
      freq.set(tok, (freq.get(tok) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([tok]) => tok)
}

// posted_at 창 시작 시각 — 최신 수집일(latest, 'YYYY-MM-DD') 기준, KST 자정.
const PERIOD_DAYS = { week: 6, month: 29, year: 364 }
export function periodStart(period, latest) {
  const d = new Date(`${latest}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - PERIOD_DAYS[period])
  return `${d.toISOString().slice(0, 10)}T00:00:00+09:00`
}

// 기간별 DB 필터. 축이 기간마다 다르다:
//   일간 = collected_on = 최신 수집일 (최신 스냅샷 전체).
//     이유: 수집은 하루 1회(08:00)인데 커뮤 인기글은 대부분 "전날" 게시된다.
//     posted_at >= 오늘0시 로 자르면 새벽엔 0건이 된다 (2026-07-11 실측 버그).
//   주/월/연 = posted_at >= (최신일 - N일).
//     이유: 소급 복구분도 실제 게시일로 배치되고, 7일 이상 창이라 새벽에도 안 빈다.
export function periodFilter(period, latest) {
  if (period === 'day') return { column: 'collected_on', op: 'eq', value: latest }
  return { column: 'posted_at', op: 'gte', value: periodStart(period, latest) }
}

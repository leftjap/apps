import { describe, it, expect } from 'vitest'
import { COMMUNITIES, boardLabel, rankSort, searchPlan, periodStart, periodFilter, suggestKeywords } from './logic.js'

describe('COMMUNITIES — 시안 9곳, 색·짧은이름·검색 별칭', () => {
  it('9곳이고 사이트 슬러그가 수집기와 일치한다', () => {
    expect(COMMUNITIES.map((c) => c.site)).toEqual([
      'dcinside', 'clien', 'todayhumor', 'bobae', 'ruliweb', 'humoruniv', 'theqoo', 'ppomppu', 'slr',
    ])
  })
})

describe('boardLabel — 판 이름 (있는 행만, 지시서 §6)', () => {
  it('디시는 갤러리 태그 그대로', () => {
    expect(boardLabel({ site: 'dcinside', board: '싱갤' })).toBe('싱갤')
  })
  it('보배 코드는 한글 판명으로', () => {
    expect(boardLabel({ site: 'bobae', board: 'strange' })).toBe('유머게시판')
    expect(boardLabel({ site: 'bobae', board: 'humor' })).toBe('신유머')
    expect(boardLabel({ site: 'bobae', board: 'freeb' })).toBe('자유게시판')
  })
  // 2026-07-11 실측: 이슈링크는 clien 을 park 외에 news 판도, todayhumor 를 sisa 외에 lovestory 판도 미러한다.
  // 사이트별 "단일판" 가정으로 라벨을 지어내면 거짓 정보가 된다 → board 가 없으면 그 자리를 비운다 (지시서 §6).
  it('board 가 없으면 빈 문자열 — 사이트만 보고 판 이름을 추측하지 않는다', () => {
    for (const site of ['clien', 'slr', 'humoruniv', 'theqoo', 'ppomppu', 'ruliweb', 'todayhumor']) {
      expect(boardLabel({ site, board: null })).toBe('')
    }
  })

  it('뽐뿌 판 코드는 한글 판명으로 (go ID 접두사에서 판별)', () => {
    expect(boardLabel({ site: 'ppomppu', board: 'freeboard' })).toBe('자유게시판')
    expect(boardLabel({ site: 'ppomppu', board: 'humor' })).toBe('유머')
    expect(boardLabel({ site: 'ppomppu', board: 'car' })).toBe('자동차')
    expect(boardLabel({ site: 'ppomppu', board: 'gameforum' })).toBe('게임')
  })
})

describe('rankSort — 정규화 점수(백분위) 우선, 동률은 조회수 (지시서 §8: 원지표 그대로 정렬 금지)', () => {
  it('백분위 내림차순, 백분위 동률이면 조회수 내림차순, null 백분위는 뒤로', () => {
    const rows = [
      { id: 1, percentile: 90, views: 100 },
      { id: 2, percentile: 100, views: 5 },
      { id: 3, percentile: 90, views: 999 },
      { id: 4, percentile: null, views: 99999 },
    ]
    expect(rankSort(rows).map((r) => r.id)).toEqual([2, 3, 1, 4])
  })
})

describe('searchPlan — 제목·게시판 텍스트 + 커뮤니티명 매칭 (지시서 §5.3)', () => {
  it('일반 검색어는 텍스트 질의만', () => {
    expect(searchPlan('전기요금')).toEqual({ text: '전기요금', sites: [], boards: [] })
  })
  it('커뮤니티 이름·별칭이면 해당 사이트도 매칭', () => {
    expect(searchPlan('디시').sites).toEqual(['dcinside'])
    expect(searchPlan('SLR클럽').sites).toEqual(['slr'])
    expect(searchPlan('웃대').sites).toEqual(['humoruniv'])
  })
  it('보배·뽐뿌 판 한글명은 board 코드로 매칭 (DB 는 코드 저장)', () => {
    expect(searchPlan('신유머').boards).toEqual(['humor'])
    expect(searchPlan('정치게시판').boards).toEqual(['politic'])
    expect(searchPlan('자동차').boards).toEqual(['car'])
  })
  it('자유게시판은 보배 freeb 와 뽐뿌 freeboard 를 모두 매칭', () => {
    expect(searchPlan('자유게시판').boards.sort()).toEqual(['freeb', 'freeboard'])
  })
  it('공백 트림, 빈 검색어는 null', () => {
    expect(searchPlan('  ')).toBeNull()
  })
})

describe('suggestKeywords — 추천 검색어 (제목 빈도 상위, 2자 이상)', () => {
  it('빈도 상위 토큰을 반환하고 1자·숫자·기호는 제외한다', () => {
    const titles = [
      '전기요금 인상 발표',
      '전기요금 계산해봤다',
      '전기요금 폭탄',
      '국대 명단 공개',
      '국대 경기 후기',
      'jpg 1 ㅋㅋ',
    ]
    const kw = suggestKeywords(titles, 3)
    expect(kw[0]).toBe('전기요금')
    expect(kw[1]).toBe('국대')
    expect(kw).not.toContain('jpg')
    expect(kw).not.toContain('1')
  })
  it('빈 입력은 빈 배열', () => {
    expect(suggestKeywords([], 5)).toEqual([])
  })
})

describe('periodFilter — 기간별 DB 필터 (일간=스냅샷, 그 외=게시 시각 창)', () => {
  // 일간: 수집은 하루 1회(08:00)인데 인기글은 대부분 "전날" 게시된다.
  // posted_at >= 오늘0시 로 자르면 새벽엔 0건이 된다(실측 버그) → 일간은 최신 수집 스냅샷 자체다.
  it('일간은 collected_on = 최신 수집일 (스냅샷 전체)', () => {
    expect(periodFilter('day', '2026-07-11')).toEqual({
      column: 'collected_on', op: 'eq', value: '2026-07-11',
    })
  })
  // 주/월/연: posted_at 창. 소급 복구분도 실제 게시일로 올바르게 배치되고, 7일 이상이라 새벽에도 안 빈다.
  it('주/월/연은 posted_at >= (최신 수집일 - N일) KST', () => {
    expect(periodFilter('week', '2026-07-11')).toEqual({
      column: 'posted_at', op: 'gte', value: '2026-07-05T00:00:00+09:00',
    })
    expect(periodFilter('month', '2026-07-11')).toEqual({
      column: 'posted_at', op: 'gte', value: '2026-06-12T00:00:00+09:00',
    })
    expect(periodFilter('year', '2026-07-11')).toEqual({
      column: 'posted_at', op: 'gte', value: '2025-07-12T00:00:00+09:00',
    })
  })
})

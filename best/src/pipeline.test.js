import { describe, it, expect } from 'vitest'
import { isAd } from './adfilter.js'
import { withPercentile } from './percentile.js'

describe('isAd — 2026-07-10 실측 표본 기준', () => {
  it('광고·핫딜·포인트글 접두사를 잡는다 (여는 대괄호 유무 모두)', () => {
    expect(isAd('[쿠팡] 왕뚜껑 국물라볶이 4개 (5,760원/와우회원무배)')).toBe(true)
    expect(isAd('[네이버페이] 신일전자 브랜드위크 20원 받으세요')).toBe(true)
    expect(isAd('AD 부가가입 유의사항')).toBe(true)
    expect(isAd('핫딜) 갤럭시 버즈')).toBe(true)
  })

  it('본문 중간 키워드·일반글은 광고가 아니다', () => {
    expect(isAd('쿠팡에서 산 물건 후기')).toBe(false)
    expect(isAd('동대표가 허락한 ㅈ같은 주차.jpg')).toBe(false)
    expect(isAd('80대 노부부에게 손가락질하며 반말하는 경찰')).toBe(false)
  })
})

describe('withPercentile — 사이트 풀 내 조회수 백분위 (산수)', () => {
  it('최저 0, 최고 100, 중간은 아래에 있는 행 비율', () => {
    const rows = withPercentile([{ views: 10 }, { views: 30 }, { views: 20 }])
    expect(rows.map((r) => r.percentile)).toEqual([0, 100, 50])
  })

  it('동률은 같은 백분위, views 없으면 null', () => {
    const rows = withPercentile([{ views: 5 }, { views: 5 }, { views: null }])
    expect(rows[0].percentile).toBe(rows[1].percentile)
    expect(rows[2].percentile).toBeNull()
  })

  it('단일 행은 100', () => {
    expect(withPercentile([{ views: 7 }])[0].percentile).toBe(100)
  })
})

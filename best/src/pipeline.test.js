import { describe, it, expect } from 'vitest'
import { withPercentile } from './percentile.js'

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

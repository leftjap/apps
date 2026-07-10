// 사이트 수집 풀 내 조회수 백분위 (산수). views null 이면 percentile null.
export function withPercentile(rows) {
  const views = rows.map((r) => r.views).filter((v) => v != null)
  const n = views.length
  return rows.map((r) => {
    if (r.views == null) return { ...r, percentile: null }
    if (n === 1) return { ...r, percentile: 100 }
    const below = views.filter((v) => v < r.views).length
    return { ...r, percentile: Math.round((below / (n - 1)) * 100) }
  })
}

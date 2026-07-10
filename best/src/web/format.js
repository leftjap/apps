// 숫자·시각 표기 (작업지시서 §6)

export function formatCount(n) {
  if (n == null) return ''
  if (n < 10000) return n.toLocaleString('ko-KR')
  const man = n / 10000
  const s = man >= 100 ? String(Math.round(man)) : (Math.round(man * 10) / 10).toFixed(1).replace(/\.0$/, '')
  return `${s}만`
}

export function formatRelTime(iso, now = new Date()) {
  if (!iso) return ''
  const diffMin = Math.floor((now - new Date(iso)) / 60000)
  if (diffMin < 60) return `${Math.max(diffMin, 0)}분 전`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}일 전`
  return `${Math.floor(d / 30)}개월 전`
}

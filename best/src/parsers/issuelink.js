const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

// 이슈링크 listview HTML → 행 배열. 행 구분자 = 제목 앵커의 go 링크 href.
export function parseIssuelink(html, site) {
  const parts = html.split(
    new RegExp(`href='https://www\\.issuelink\\.co\\.kr/community/go/${site}/`),
  )
  const rows = []
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i]
    const head = chunk.match(/^(\d+)'[^>]*>([\s\S]*?)<\/a>/)
    if (!head) continue
    const [, goId, inner] = head
    const comments = inner.match(/<small>\[(\d+)\]<\/small>/)
    const title = stripTags(inner.replace(/<small>\[\d+\]<\/small>/, ''))
    const postedAt = chunk.match(/class="second_date">\s*<span>([^<]+)<\/span>/)
    const views = chunk.match(/class="hit">([\d,]+)/)
    rows.push({
      goId,
      title,
      comments: comments ? Number(comments[1]) : 0,
      views: views ? Number(views[1].replace(/,/g, '')) : null,
      postedAt: postedAt ? postedAt[1].trim() : null,
      url: `https://www.issuelink.co.kr/community/go/${site}/${goId}`,
    })
  }
  return rows
}

// 보배 go ID 접두사 → 원본 게시판 (2026-07-10 리다이렉트 25건 + p1 100건 접두사 전수 실측)
export function goIdToBobaeBoard(goId) {
  if (goId.startsWith('10000')) return 'accident'
  if (goId.startsWith('30000')) return 'freeb'
  if (goId.startsWith('40000')) return 'politic'
  if (goId.startsWith('695')) return 'strange'
  return null
}

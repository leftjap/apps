const stripTags = (s) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

// 보배 베스트 목록 HTML → 행 배열. 행 = schema.org/Article tr.
// 제목은 앵커 내부 텍스트를 쓴다 — title 속성은 따옴표가 이스케이프되지 않아 파싱 불가 (실측).
export function parseBobae(html) {
  const rows = []
  for (const chunk of html.split(/<tr itemscope itemtype="http:\/\/schema\.org\/Article">/).slice(1)) {
    const category = chunk.match(
      /<td class="category" title="([^"]*)"><a href="\/list\.php\?code=([a-z_0-9]+)"/,
    )
    const anchor = chunk.match(/class="bsubject"[^>]*href="\/view\?code=best&No=(\d+)[^"]*"[\s\S]*?>([\s\S]*?)<\/a>/)
    if (!anchor) continue
    const comments = chunk.match(/totreply">(\d+)/)
    const views = chunk.match(/<td class="count"[^>]*>(\d+)/)
    rows.push({
      no: anchor[1],
      title: stripTags(anchor[2]),
      boardName: category ? category[1] : null,
      boardCode: category ? category[2] : null,
      comments: comments ? Number(comments[1]) : 0,
      views: views ? Number(views[1]) : null,
      url: `https://www.bobaedream.co.kr/view?code=best&No=${anchor[1]}`,
    })
  }
  return rows
}

import { stripTags } from './text.js'

// 보배 목록 날짜 셀: 당일 'HH:MM', 이전일 'MM/DD' (2026-07-10 p1·p15 실측). 연도는 수집일 기준.
export function parseBobaeDate(cell, collectedOn) {
  const hm = cell.match(/^(\d{2}):(\d{2})$/)
  if (hm) return `${collectedOn} ${hm[1]}:${hm[2]}:00`
  const md = cell.match(/^(\d{2})\/(\d{2})$/)
  if (md) {
    const [y, m] = [Number(collectedOn.slice(0, 4)), Number(collectedOn.slice(5, 7))]
    const year = Number(md[1]) > m ? y - 1 : y // 12/31 을 7월에 보면 작년 글
    return `${year}-${md[1]}-${md[2]} 00:00:00`
  }
  return null
}

// 보배 베스트 목록 HTML → 행 배열. 행 = schema.org/Article tr.
// 제목은 앵커 내부 텍스트를 쓴다 — title 속성은 따옴표가 이스케이프되지 않아 파싱 불가 (실측).
export function parseBobae(html, collectedOn) {
  const rows = []
  for (const chunk of html.split(/<tr itemscope itemtype="http:\/\/schema\.org\/Article">/).slice(1)) {
    const category = chunk.match(
      /<td class="category" title="([^"]*)"><a href="\/list\.php\?code=([a-z_0-9]+)"/,
    )
    const anchor = chunk.match(/class="bsubject"[^>]*href="\/view\?code=best&No=(\d+)[^"]*"[\s\S]*?>([\s\S]*?)<\/a>/)
    if (!anchor) continue
    const comments = chunk.match(/totreply">(\d+)/)
    const views = chunk.match(/<td class="count"[^>]*>(\d+)/)
    const date = chunk.match(/<td class="date"[^>]*>([^<]*)</)
    rows.push({
      no: anchor[1],
      title: stripTags(anchor[2]),
      boardName: category ? category[1] : null,
      boardCode: category ? category[2] : null,
      comments: comments ? Number(comments[1]) : 0,
      views: views ? Number(views[1]) : null,
      postedAt: date ? parseBobaeDate(date[1].trim(), collectedOn) : null,
      url: `https://www.bobaedream.co.kr/view?code=best&No=${anchor[1]}`,
    })
  }
  return rows
}

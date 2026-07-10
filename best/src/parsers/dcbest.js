import { stripTags } from './text.js'

// 디시 dcbest 목록 HTML → 행 배열. 일반글 = class 에 us-post 가 있는 tr 만 (공지·설문 제외).
export function parseDcbest(html) {
  const rows = []
  for (const chunk of html.split(/<tr class="ub-content/).slice(1)) {
    if (!/^[^>]*us-post/.test(chunk)) continue
    const no = chunk.match(/data-no="(\d+)"/)
    const anchor = chunk.match(/<a\s+href="\/board\/view\/\?id=dcbest&no=\d+[^"]*"[^>]*>([\s\S]*?)<\/a>/)
    if (!no || !anchor) continue
    const gallery = anchor[1].match(/<strong>\[([^\]]+)\]<\/strong>/)
    const title = stripTags(anchor[1].replace(/<strong>\[[^\]]+\]<\/strong>/, ''))
    const comments = chunk.match(/reply_num">\[(\d+)\]/)
    const postedAt = chunk.match(/gall_date" title="([^"]+)"/)
    const views = chunk.match(/gall_count">(\d+)/)
    const upvotes = chunk.match(/gall_recommend">(\d+)/)
    rows.push({
      no: no[1],
      title,
      gallery: gallery ? gallery[1] : null,
      comments: comments ? Number(comments[1]) : 0,
      views: views ? Number(views[1]) : null,
      upvotes: upvotes ? Number(upvotes[1]) : null,
      postedAt: postedAt ? postedAt[1] : null,
      url: `https://gall.dcinside.com/board/view/?id=dcbest&no=${no[1]}`,
    })
  }
  return rows
}

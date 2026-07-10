import { goIdToBobaeBoard } from './parsers/issuelink.js'
import { isAd, ppomppuBoard } from './adfilter.js'

// 'YYYY-MM-DD HH:mm:ss' (원 사이트 KST 표기) → ISO +09:00. 불완전/없음 → null.
const kstIso = (s) => (s && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + '+09:00' : null)

const base = (r, { collectedOn, source, site, board, postKey }) => ({
  collected_on: collectedOn,
  source,
  site,
  board,
  post_key: postKey,
  title: r.title,
  url: r.url,
  views: r.views ?? null,
  comments: r.comments ?? null,
  posted_at: kstIso(r.postedAt),
  is_ad: isAd(r.title, { site, goId: r.goId }),
})

export function fromIssuelink(r, { site, collectedOn }) {
  if (site === 'bobae') {
    const board = goIdToBobaeBoard(r.goId)
    // 보배 go ID = 5자리 판 접두사 + 7자리 원본 No (실측) → 판코드:No 로 네임스페이스
    const postKey = board ? `${board}:${Number(r.goId.slice(5))}` : r.goId
    return base(r, { collectedOn, source: 'issuelink', site, board, postKey })
  }
  const board = site === 'ppomppu' ? ppomppuBoard(r.goId) : null
  return base(r, { collectedOn, source: 'issuelink', site, board, postKey: r.goId })
}

export function fromDcbest(r, { collectedOn }) {
  return base(r, { collectedOn, source: 'dcbest', site: 'dcinside', board: r.gallery ?? 'dcbest', postKey: r.no })
}

// 보배 best 목록의 No 는 원본판 No 와 다른 자체 채번 (픽스처 실측: ~100만대 vs ~340만대)
// → 숫자 대응 불가, best: 네임스페이스로 충돌만 방지. 콘텐츠 중복은 정제 단계에서.
export function fromBobae(r, { collectedOn }) {
  return base(r, { collectedOn, source: 'bobae', site: 'bobae', board: r.boardCode, postKey: `best:${r.no}` })
}

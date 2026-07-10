import { describe, it, expect } from 'vitest'
import { fromIssuelink, fromDcbest, fromBobae } from './normalize.js'

describe('normalize — best_posts 행 변환', () => {
  it('이슈링크 보배: 접두사로 판 판별, post_key 는 판코드:원본No, KST ISO 시각', () => {
    const post = fromIssuelink(
      {
        goId: '300003418774',
        title: '80대 노부부에게 손가락질하며 반말하는 경찰',
        comments: 59,
        views: 28799,
        postedAt: '2026-07-10 03:08:00',
        url: 'https://www.issuelink.co.kr/community/go/bobae/300003418774',
      },
      { site: 'bobae', collectedOn: '2026-07-10' },
    )
    expect(post).toMatchObject({
      collected_on: '2026-07-10',
      source: 'issuelink',
      site: 'bobae',
      board: 'freeb',
      post_key: 'freeb:3418774',
      views: 28799,
      posted_at: '2026-07-10T03:08:00+09:00',
      is_ad: false,
    })
  })

  it('이슈링크 뽐뿌: go ID 접두사로 board 를 채우고, 광고 판정도 그 판으로 한다', () => {
    const hotdeal = fromIssuelink(
      { goId: '315600000719013', title: '[G마켓] 스낵면 40입', comments: 0, views: 10, postedAt: null, url: 'u' },
      { site: 'ppomppu', collectedOn: '2026-07-10' },
    )
    expect(hotdeal).toMatchObject({ site: 'ppomppu', board: 'ppomppu', post_key: '315600000719013', posted_at: null, is_ad: true })

    const normal = fromIssuelink(
      { goId: '468400010030932', title: '[속보] 지지율 떨어지니 움직이네요ㄷㄷ', comments: 5, views: 10, postedAt: null, url: 'u' },
      { site: 'ppomppu', collectedOn: '2026-07-10' },
    )
    expect(normal).toMatchObject({ board: 'freeboard', is_ad: false })
  })

  it('이슈링크 그 외 사이트: board null, post_key 는 goId', () => {
    const post = fromIssuelink(
      { goId: '38670986', title: '일반글', comments: 0, views: 10, postedAt: null, url: 'u' },
      { site: 'ruliweb', collectedOn: '2026-07-10' },
    )
    expect(post).toMatchObject({ site: 'ruliweb', board: null, post_key: '38670986', is_ad: false })
  })

  it('dcbest: 갤러리 태그가 board, 보배 직접: best 판 자체 채번이므로 post_key 는 best:No', () => {
    const dc = fromDcbest(
      { no: '444493', title: 't', gallery: '주갤', comments: 41, views: 2758, upvotes: 7, postedAt: '2026-07-10 19:05:02', url: 'u' },
      { collectedOn: '2026-07-10' },
    )
    expect(dc).toMatchObject({ source: 'dcbest', site: 'dcinside', board: '주갤', post_key: '444493', posted_at: '2026-07-10T19:05:02+09:00' })

    const bb = fromBobae(
      { no: '1008318', title: 't', boardName: '유머게시판', boardCode: 'strange', comments: 34, views: 3170, postedAt: '2026-07-10 17:03:00', url: 'u' },
      { collectedOn: '2026-07-10' },
    )
    expect(bb).toMatchObject({ source: 'bobae', site: 'bobae', board: 'strange', post_key: 'best:1008318', posted_at: '2026-07-10T17:03:00+09:00' })
  })
})

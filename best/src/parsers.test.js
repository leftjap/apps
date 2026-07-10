import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseIssuelink, goIdToBobaeBoard } from './parsers/issuelink.js'
import { parseDcbest } from './parsers/dcbest.js'
import { parseBobae } from './parsers/bobae.js'

const fx = (name) =>
  readFileSync(fileURLToPath(new URL(`../fixtures/2026-07-10/${name}`, import.meta.url)), 'utf8')

describe('parseIssuelink', () => {
  const rows = parseIssuelink(fx('il_bobae_p1.html'), 'bobae')

  it('보배 p1 에서 100행을 추출한다', () => {
    expect(rows).toHaveLength(100)
  })

  it('첫 행의 필드를 정확히 추출한다', () => {
    expect(rows[0]).toEqual({
      goId: '300003418774',
      title: '80대 노부부에게 손가락질하며 반말하는 경찰',
      comments: 59,
      views: 28799,
      postedAt: '2026-07-10 03:08:00',
      url: 'https://www.issuelink.co.kr/community/go/bobae/300003418774',
    })
  })

  it('subject_preface(em)를 제목 앞에 붙인다', () => {
    const pp = parseIssuelink(fx('il_ppomppu_p1.html'), 'ppomppu')
    const row = pp.find((r) => r.goId === '468400010030932')
    expect(row.title).toBe('[속보] 지지율 떨어지니 움직이네요ㄷㄷ')
  })
})

describe('goIdToBobaeBoard', () => {
  it('실측 접두사 매핑을 따른다 (미지 접두사는 null)', () => {
    expect(goIdToBobaeBoard('100000857348')).toBe('accident')
    expect(goIdToBobaeBoard('300003418774')).toBe('freeb')
    expect(goIdToBobaeBoard('400001234567')).toBe('politic')
    expect(goIdToBobaeBoard('695013418670')).toBe('strange')
    expect(goIdToBobaeBoard('999999999999')).toBeNull()
  })
})

describe('parseDcbest', () => {
  const rows = parseDcbest(fx('dc_p1.html'))

  it('공지·설문을 제외한 49행(us-post)만 추출한다', () => {
    expect(rows).toHaveLength(49)
    expect(rows.find((r) => r.no === '30638')).toBeUndefined() // 공지 행
  })

  it('행 필드를 정확히 추출한다', () => {
    expect(rows.find((r) => r.no === '444493')).toEqual({
      no: '444493',
      title: '모솔연애2 소개팅남한테 걸레같다고 해버렸다는 출연자',
      gallery: '주갤',
      comments: 41,
      views: 2758,
      upvotes: 7,
      postedAt: '2026-07-10 19:05:02',
      url: 'https://gall.dcinside.com/board/view/?id=dcbest&no=444493',
    })
  })
})

describe('parseBobae', () => {
  const rows = parseBobae(fx('bb_best_p1.html'))

  it('베스트 p1 에서 30행을 추출한다', () => {
    expect(rows).toHaveLength(30)
  })

  it('행 필드를 정확히 추출한다 (제목 내 따옴표 보존)', () => {
    expect(rows.find((r) => r.no === '1008318')).toEqual({
      no: '1008318',
      title: '부산출신 과학1타 강사가 보는 리센느의 "무섭노"',
      boardName: '유머게시판',
      boardCode: 'strange',
      comments: 34,
      views: 3170,
      url: 'https://www.bobaedream.co.kr/view?code=best&No=1008318',
    })
  })

  it('모든 행에 원본 게시판 코드가 있다', () => {
    expect(rows.every((r) => r.boardCode)).toBe(true)
  })
})

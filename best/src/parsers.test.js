import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseIssuelink, goIdToBobaeBoard } from './parsers/issuelink.js'
import { parseDcbest } from './parsers/dcbest.js'
import { parseBobae, parseBobaeDate } from './parsers/bobae.js'

// 픽스처는 실크롤 HTML — 공개 repo 커밋 금지(gitignore)라 CI 에는 없다. 로컬에서만 스냅샷 검증.
const FIXTURES = fileURLToPath(new URL('../fixtures/2026-07-10/', import.meta.url))
const hasFixtures = existsSync(FIXTURES)
// describe.skipIf 는 콜백을 실행하므로(테스트만 스킵) 파일 읽기는 지연/무해화한다
const fx = (name) => (hasFixtures ? readFileSync(`${FIXTURES}${name}`, 'utf8') : '')
const describeFx = describe.skipIf(!hasFixtures)

describeFx('parseIssuelink', () => {
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

  it('HTML 엔티티를 디코드한다 (&apos; 가 화면에 그대로 노출되던 버그)', () => {
    const rw = parseIssuelink(fx('il_ruliweb_p1.html'), 'ruliweb')
    const row = rw.find((r) => r.goId === '38670986')
    expect(row.title).toBe("한국인들 줄 서서 '중국산' 사갔다…'오픈런' 난리 난 브랜드")
    expect(rw.some((r) => /&(apos|quot|amp|lt|gt|#\d+);/.test(r.title))).toBe(false)
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

describeFx('parseDcbest', () => {
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

describeFx('parseBobae', () => {
  const rows = parseBobae(fx('bb_best_p1.html'), '2026-07-10')

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
      postedAt: '2026-07-10 17:03:00',
      url: 'https://www.bobaedream.co.kr/view?code=best&No=1008318',
    })
  })

  it('모든 행에 원본 게시판 코드가 있다', () => {
    expect(rows.every((r) => r.boardCode)).toBe(true)
  })

  it('모든 행에 게시 시각이 있다 (기간 집계 축)', () => {
    expect(rows.every((r) => r.postedAt)).toBe(true)
  })
})

describe('parseBobaeDate — 당일은 HH:MM, 이전일은 MM/DD (2026-07-10 실측)', () => {
  const today = '2026-07-10'
  it('HH:MM 은 수집일 당일 시각', () => {
    expect(parseBobaeDate('17:03', today)).toBe('2026-07-10 17:03:00')
  })
  it('MM/DD 는 그 날짜 00:00 (연도는 수집일 기준, 미래면 전년)', () => {
    expect(parseBobaeDate('07/09', today)).toBe('2026-07-09 00:00:00')
    expect(parseBobaeDate('12/31', today)).toBe('2025-12-31 00:00:00')
  })
  it('알 수 없는 형식은 null', () => {
    expect(parseBobaeDate('', today)).toBeNull()
  })
})

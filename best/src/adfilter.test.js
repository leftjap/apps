import { describe, it, expect } from 'vitest'
import { isAd, ppomppuBoard, PPOMPPU_AD_BOARDS } from './adfilter.js'

// 2026-07-11 실측: 이슈링크 뽐뿌 go ID 앞 4자리가 원문 게시판을 인코딩한다 (리다이렉트 22종 전수 확인)
describe('ppomppuBoard — go ID 접두사 → 원문 게시판', () => {
  it('광고성 판을 식별한다', () => {
    expect(ppomppuBoard('315600000719013')).toBe('ppomppu')   // 핫딜
    expect(ppomppuBoard('360400000092794')).toBe('ppomppu8')  // 핫딜(해외)
    expect(ppomppuBoard('233500000116078')).toBe('coupon')    // 포인트
    expect(ppomppuBoard('347800000043230')).toBe('pmarket8')  // 장터
  })
  it('일반 판을 식별한다', () => {
    expect(ppomppuBoard('468400010030932')).toBe('freeboard')
    expect(ppomppuBoard('167900000766378')).toBe('humor')
    expect(ppomppuBoard('63500000972497')).toBe('car')
  })
  it('미지 접두사는 null', () => {
    expect(ppomppuBoard('999900000000001')).toBeNull()
  })
  it('광고 판 목록에 장터가 포함된다 (robots Disallow: /zboard/view.php?id=market*)', () => {
    expect(PPOMPPU_AD_BOARDS).toContain('pmarket8')
  })
})

describe('isAd — 게시판(1차) + 제목 패턴(2차)', () => {
  it('뽐뿌 광고 판이면 제목과 무관하게 광고', () => {
    expect(isAd('스낵면 40입 (18,790/무배)', { site: 'ppomppu', goId: '315600000719053' })).toBe(true)
    expect(isAd('아무 제목', { site: 'ppomppu', goId: '233500000116060' })).toBe(true)
  })

  it('뽐뿌 일반 판이면 제목이 대괄호로 시작해도 글이다', () => {
    expect(isAd('[속보] 지지율 떨어지니 움직이네요ㄷㄷ', { site: 'ppomppu', goId: '468400010030932' })).toBe(false)
    expect(isAd('[지구마불 세계여행4] 빠니보틀 근황.JPG', { site: 'ppomppu', goId: '114500000115460' })).toBe(false)
  })

  it('일반 판이라도 포인트글이면 광고다 (게시판 판정이 제목 판정을 무력화하면 안 됨)', () => {
    // 자유게시판(4684)에 올라온 실제 포인트글 — 2026-07-11 실측
    expect(isAd('[란123] 네이버페이 59원 + 랜덤 포인트 받으세요 (+기타 316원)', { site: 'ppomppu', goId: '468400010031200' })).toBe(true)
  })

  it('게시판을 모를 때는 제목 패턴으로 판정한다', () => {
    expect(isAd('[쿠팡] 왕뚜껑 국물라볶이 4개 (5,760원/와우회원무배)')).toBe(true)
    expect(isAd('[네이버페이] 신일전자 브랜드위크 20원 받으세요')).toBe(true)
    expect(isAd('[란123] 네이버페이 59원 + 랜덤 포인트 받으세요 (+기타 316원)')).toBe(true) // 포인트글
    expect(isAd('AD 부가가입 유의사항')).toBe(true)
  })

  it('본문 중간 키워드·일반글은 광고가 아니다', () => {
    expect(isAd('쿠팡에서 산 물건 후기')).toBe(false)
    expect(isAd('지방세를 네이버페이포인트로 납부했네요')).toBe(false)
    expect(isAd('(단독) 국세청, 쿠팡에 3000억 과세')).toBe(false)
    expect(isAd('80대 노부부에게 손가락질하며 반말하는 경찰')).toBe(false)
  })
})

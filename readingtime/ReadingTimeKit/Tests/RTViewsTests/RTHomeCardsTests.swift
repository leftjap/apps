import Testing
import Foundation
@testable import RTViews

// 홈 표지 캐러셀 (사용자 결정 2026-08-25):
//  ① 홈 히어로 1권 고정 → 좌우 슬라이딩 카드. 읽는 중 종이책 + 최근 밀리 책을 최근순으로.
//  ② 밀리 카드는 엎기 기록 대상이 아니다 (밀리가 자동 집계 — 이중 계상 방지).
//  ③ 밀리 책도 앱에서 완독 처리 → 카드에서 빠짐. 밀리에서 다시 읽으면(기록이 완독 시각보다
//     최신) 자동으로 되살아난다 (종이책 rereadBook 과 대칭).

private func at(_ s: String) -> Date {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    // "yyyy-MM-dd" (자정) 과 "yyyy-MM-dd HH:mm" 둘 다 허용
    f.dateFormat = s.contains(" ") ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd"
    return f.date(from: s)!
}

@MainActor
@Suite struct RTHomeCardsTests {

    private func model(now: String = "2026-08-25 20:00") -> RTAppModel {
        let m = RTAppModel()
        m.now = { at(now) }
        m.userData = RTUserData(books: [], sessions: [])
        return m
    }
    private func paper(_ isbn: String, _ title: String, added: String) -> RTBook {
        RTBook(isbn: isbn, title: title, author: "저자", publisher: "출판",
               coverUrl: "https://cdn/\(isbn).jpg", addedAt: at(added))
    }

    // ① 종이책 + 밀리책이 '최근 읽은 순'으로 한 배열에 섞인다
    @Test func cardsMergePaperAndEbookByRecency() {
        let m = model()
        m.userData = RTUserData(
            books: [paper("A", "몰입", added: "2026-08-01"), paper("B", "파친코", added: "2026-08-02")],
            sessions: [
                .init(isbn: "A", mode: "flip", seconds: 600, endedAt: at("2026-08-24 10:00"), pauseCount: 0),
                .init(isbn: "B", mode: "flip", seconds: 600, endedAt: at("2026-08-20 10:00"), pauseCount: 0),
            ])
        m.ebookReadAt = ["삼미 슈퍼스타즈": at("2026-08-25 18:20")]   // 가장 최신
        m.ebookCovers = ["삼미 슈퍼스타즈": "https://millie/cover.jpg"]

        let titles = m.homeCards.map(\.title)
        #expect(titles == ["삼미 슈퍼스타즈", "몰입", "파친코"])
    }

    // ① 밀리 카드는 밀리 표지·출처를 갖는다
    @Test func ebookCardCarriesMillieCoverAndKind() {
        let m = model()
        m.ebookReadAt = ["삼미 슈퍼스타즈": at("2026-08-25 18:20")]
        m.ebookCovers = ["삼미 슈퍼스타즈": "https://millie/cover.jpg"]

        let card = m.homeCards.first!
        #expect(card.isEbook)
        #expect(card.coverUrl == "https://millie/cover.jpg")
        #expect(card.isbn == nil)          // 서재 책이 아님
    }

    // ② 밀리 카드는 엎기 기록 대상이 아니다
    @Test func ebookCardIsNotRecordable() {
        let m = model()
        m.ebookReadAt = ["삼미 슈퍼스타즈": at("2026-08-25 18:20")]
        m.userData = RTUserData(books: [paper("A", "몰입", added: "2026-08-01")], sessions: [])

        #expect(m.homeCards[0].isEbook && !m.homeCards[0].recordable)
        #expect(!m.homeCards[1].isEbook && m.homeCards[1].recordable)
    }

    // ② 엎기 대상 = 선택 카드가 종이책이면 그 책, 밀리면 nil (기록 시작 안 함)
    @Test func flipTargetFollowsSelectedCard() {
        let m = model()
        m.ebookReadAt = ["삼미 슈퍼스타즈": at("2026-08-25 18:20")]
        m.userData = RTUserData(
            books: [paper("A", "몰입", added: "2026-08-01")],
            sessions: [.init(isbn: "A", mode: "flip", seconds: 600, endedAt: at("2026-08-24 10:00"), pauseCount: 0)])

        m.homeCardIndex = 0                       // 밀리 카드 선택
        #expect(m.flipTargetISBN == nil)
        m.homeCardIndex = 1                       // 종이책 카드 선택
        #expect(m.flipTargetISBN == "A")
    }

    // ③ 밀리 완독 처리 → 카드에서 빠짐
    @Test func finishingEbookRemovesCard() {
        let m = model()
        m.ebookReadAt = ["삼미 슈퍼스타즈": at("2026-08-25 18:20"), "독학이라는 세계": at("2026-08-21 15:55")]
        #expect(m.homeCards.count == 2)

        m.finishEbook("삼미 슈퍼스타즈")
        #expect(m.homeCards.map(\.title) == ["독학이라는 세계"])
    }

    // ③ 완독 후 밀리에서 다시 읽으면(기록이 더 최신) 되살아난다
    @Test func rereadingEbookAfterFinishRestoresCard() {
        let m = model(now: "2026-08-25 20:00")
        m.ebookReadAt = ["삼미 슈퍼스타즈": at("2026-08-25 18:20")]
        m.finishEbook("삼미 슈퍼스타즈")
        #expect(m.homeCards.isEmpty)

        // 다음 동기화로 더 최신 기록이 들어옴 = 다시 읽는 중
        m.ebookReadAt = ["삼미 슈퍼스타즈": at("2026-08-26 09:00")]
        #expect(m.homeCards.map(\.title) == ["삼미 슈퍼스타즈"])
    }

    // 완독 처리한 종이책은 기존대로 카드에서 제외 (currentBook 규칙 계승)
    @Test func finishedPaperBookExcluded() {
        let m = model()
        var b = paper("A", "몰입", added: "2026-08-01")
        b.finished = true
        m.userData = RTUserData(books: [b, paper("B", "파친코", added: "2026-08-02")], sessions: [])
        #expect(m.homeCards.map(\.title) == ["파친코"])
    }

    // ② 세션 시작은 선택 카드의 책에 귀속 (홈 캐러셀에서 고른 책 = 기록 대상)
    @Test func startedSessionBelongsToSelectedCard() {
        let m = model()
        m.userData = RTUserData(
            books: [paper("A", "몰입", added: "2026-08-01"), paper("B", "파친코", added: "2026-08-02")],
            sessions: [
                .init(isbn: "A", mode: "flip", seconds: 600, endedAt: at("2026-08-24 10:00"), pauseCount: 0),
                .init(isbn: "B", mode: "flip", seconds: 600, endedAt: at("2026-08-20 10:00"), pauseCount: 0),
            ])
        #expect(m.homeCards.map(\.title) == ["몰입", "파친코"])

        m.homeCardIndex = 1            // 파친코 선택
        m.simFlip()
        #expect(m.session?.isbn == "B")
    }

    // 홈 CTA(start)도 선택 카드를 보류해야 한다. simFlip 직행만 맞고 CTA 경로가
    // currentBook으로 되돌아가면 실제 엎기 세션이 다른 책에 귀속된다.
    @Test func homeStartBelongsToSelectedCard() {
        let m = model()
        m.userData = RTUserData(
            books: [paper("A", "몰입", added: "2026-08-01"), paper("B", "파친코", added: "2026-08-02")],
            sessions: [
                .init(isbn: "A", mode: "flip", seconds: 600, endedAt: at("2026-08-24 10:00"), pauseCount: 0),
                .init(isbn: "B", mode: "flip", seconds: 600, endedAt: at("2026-08-20 10:00"), pauseCount: 0),
            ])

        m.homeCardIndex = 1
        m.start()
        m.simFlip()
        #expect(m.session?.isbn == "B")
    }

    // 책상세 '이어서 읽기'(start(isbn:)) 는 홈 카드 선택과 무관하게 그 책 유지
    @Test func continueReadingOverridesCardSelection() {
        let m = model()
        m.userData = RTUserData(
            books: [paper("A", "몰입", added: "2026-08-01"), paper("B", "파친코", added: "2026-08-02")],
            sessions: [])
        m.homeCardIndex = 0
        m.start(isbn: "B")             // 03 대기 진입
        m.simFlip()
        #expect(m.session?.isbn == "B")
    }

    // ③ 밀리 완독은 홈 카드에서 직접 실행 가능해야 한다 (UI 진입점 — 뷰가 이 API 를 쓴다)
    @Test func ebookCardExposesFinishAction() {
        let m = model()
        m.ebookReadAt = ["삼미 슈퍼스타즈": at("2026-08-25 18:20")]
        m.userData = RTUserData(books: [paper("A", "몰입", added: "2026-08-01")], sessions: [])

        // 밀리 카드는 완독 처리 대상, 종이 카드는 아님(종이는 기존 08 상세의 '완독' CTA 사용)
        #expect(m.homeCards[0].finishable)
        #expect(!m.homeCards[1].finishable)

        // 홈에서 현재 카드를 완독 처리 → 카드에서 빠지고 인덱스가 범위 안으로 보정된다
        m.homeCardIndex = 0
        m.finishSelectedCard()
        #expect(m.homeCards.map(\.title) == ["몰입"])
        #expect(m.homeCardIndex == 0)
    }

    // 마지막 카드를 완독 처리해도 인덱스가 범위를 벗어나지 않는다 (크래시 방지)
    @Test func finishingLastCardClampsIndex() {
        let m = model()
        m.ebookReadAt = ["삼미": at("2026-08-25 18:20"), "독학": at("2026-08-21 15:55")]
        m.homeCardIndex = 1                 // 마지막 카드(독학)
        m.finishSelectedCard()
        #expect(m.homeCards.count == 1)
        #expect(m.homeCardIndex == 0)
    }

    // 카드 순서는 호출마다 동일해야 한다 (Dictionary 순회 + 비안정 sorted 로 흔들리면
    // 캐러셀이 그리는 카드와 CTA 가 판단하는 카드가 어긋난다 — 실기기 2026-08-26:
    // 종이책 카드인데 '밀리에서 자동 기록 중' CTA 가 떴다)
    @Test func homeCardsOrderIsDeterministic() {
        let m = model()
        let same = at("2026-08-20 10:00")           // 전부 동률 — 최악 조건
        m.userData = RTUserData(
            books: [paper("A", "가", added: "2026-08-20"), paper("B", "나", added: "2026-08-20"),
                    paper("C", "다", added: "2026-08-20")],
            sessions: [])
        m.ebookReadAt = ["밀리1": same, "밀리2": same, "밀리3": same, "밀리4": same]

        let first = m.homeCards.map(\.id)
        for _ in 0..<50 { #expect(m.homeCards.map(\.id) == first) }
    }

    // 선택 카드의 종류와 CTA 판정(recordable)이 항상 일치해야 한다
    @Test func selectedCardRecordableMatchesCardKind() {
        let m = model()
        let same = at("2026-08-20 10:00")
        m.userData = RTUserData(
            books: [paper("A", "종이", added: "2026-08-20")], sessions: [])
        m.ebookReadAt = ["밀리": same]              // 종이책과 동률

        for i in 0..<m.homeCards.count {
            m.homeCardIndex = i
            #expect(m.selectedCardRecordable == m.homeCards[i].recordable)
            #expect(m.selectedCardRecordable == !m.homeCards[i].isEbook)
        }
    }

    // 데모(userData nil)는 카드 없음 — rtshot 오라클 경로 불변
    @Test func demoHasNoCards() {
        let m = RTAppModel()
        #expect(m.homeCards.isEmpty)
    }
}

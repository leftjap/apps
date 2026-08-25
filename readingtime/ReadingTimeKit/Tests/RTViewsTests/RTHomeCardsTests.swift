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

    // 데모(userData nil)는 카드 없음 — rtshot 오라클 경로 불변
    @Test func demoHasNoCards() {
        let m = RTAppModel()
        #expect(m.homeCards.isEmpty)
    }
}

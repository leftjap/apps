import Testing
import Foundation
@testable import RTViews

// 홈 '마지막 기록' 행 탭 → 그 기록의 책 상세(08). 기록 isbn 없음(수동)·기록 없음 → 읽는 중 책 폴백.
@MainActor
@Suite struct RTRecentDetailTests {
    static func model(books: [RTBook], sessions: [RTSessionRecord]) -> RTAppModel {
        let m = RTAppModel()
        m.userData = RTUserData(books: books, sessions: sessions)
        m.login()
        return m
    }

    static let bookA = RTBook(isbn: "111", title: "A", author: "a", publisher: "p",
                              coverUrl: "", addedAt: Date(timeIntervalSince1970: 0))
    static let bookB = RTBook(isbn: "222", title: "B", author: "b", publisher: "p",
                              coverUrl: "", addedAt: Date(timeIntervalSince1970: 1000))

    @Test func opensLastRecordBook() {
        // A 가 읽는 중(최근 추가는 B?) — currentBook 무관하게 '마지막 기록'의 책(A)이 열려야 함
        let m = Self.model(books: [Self.bookA, Self.bookB], sessions: [
            RTSessionRecord(isbn: "222", mode: "flip", seconds: 60,
                            endedAt: Date(timeIntervalSince1970: 100), pauseCount: 0),
            RTSessionRecord(isbn: "111", mode: "flip", seconds: 60,
                            endedAt: Date(timeIntervalSince1970: 200), pauseCount: 0),   // 최신
        ])
        m.openRecentDetail()
        #expect(m.route == .detail)
        #expect(m.selectedBook?.isbn == "111")
    }

    @Test func manualRecordFallsBackToCurrentBook() {
        let m = Self.model(books: [Self.bookA], sessions: [
            RTSessionRecord(isbn: nil, mode: "manual", seconds: 60,
                            endedAt: Date(timeIntervalSince1970: 100), pauseCount: 0),
        ])
        m.openRecentDetail()
        #expect(m.route == .detail)
        #expect(m.selectedBook?.isbn == m.currentBook?.isbn)
    }

    @Test func noRecordsFallsBackToCurrentBook() {
        let m = Self.model(books: [Self.bookA], sessions: [])
        m.openRecentDetail()
        #expect(m.route == .detail)
        #expect(m.selectedBook?.isbn == m.currentBook?.isbn)
    }

    // ── 상세 뒤로가기 출처 (홈 진입이 생기며 서재 하드코딩이 결함이 됨) ──

    @Test func detailFromHomeGoesBackHome() {
        let m = Self.model(books: [Self.bookA], sessions: [])
        m.openRecentDetail()                     // 홈 → 상세
        #expect(m.detailOrigin == .home)
    }

    @Test func detailFromLibraryGoesBackToLibrary() {
        let m = Self.model(books: [Self.bookA], sessions: [])
        m.nav(.library)
        m.nav(.detail)                           // 서재 → 상세 (서재 행 탭 경로)
        #expect(m.detailOrigin == .library)
    }

    @Test func reenteringDetailKeepsOrigin() {
        let m = Self.model(books: [Self.bookA], sessions: [])
        m.openRecentDetail()                     // 홈 → 상세
        m.navScreenID("09")                      // 상세 내 완독(09 = 상세+finish 시트) 재진입
        #expect(m.detailOrigin == .home)         // 출처 유지 — 서재로 오염되면 안 됨
    }
}

// 통계 랭킹 책 탭 → 그 책 상세(08). 뒤로가기는 통계로 복귀(detailOrigin=statsWeek).
@MainActor
@Suite struct RTStatsBookDetailTests {
    @Test func openBookDetailFromStatsSetsIsbnAndNavigates() {
        let m = RTAppModel()
        m.nav(.statsWeek)
        m.openBookDetail(isbn: "9788937473135")
        #expect(m.selectedISBN == "9788937473135")
        #expect(m.route == .detail)
    }
    @Test func backFromStatsBookReturnsToStats() {
        let m = RTAppModel()
        m.nav(.statsWeek)
        m.openBookDetail(isbn: "X")
        #expect(m.detailOrigin == .statsWeek)   // 서재가 아니라 통계로 복귀
    }
    @Test func partnerStatsBookKeepsPartnerAndReturnsToStats() {
        let m = RTAppModel()
        m.openPartnerStats()            // statsSubject=.partner, route=statsWeek
        m.openBookDetail(isbn: "X")
        #expect(m.route == .detail)
        #expect(m.detailOrigin == .statsWeek)
        #expect(m.statsSubject == .partner)   // nav(.detail)는 파트너 리셋 안 함
    }
    @Test func partnerSelectedBookResolvesFromPartnerData() {
        let m = RTAppModel()
        let book = RTBook(isbn: "P1", title: "차남들의 세계사", author: "이기호",
                          publisher: "민음사", coverUrl: "", addedAt: Date())
        m.partnerData = RTUserData(books: [book], sessions: [])
        m.selectedISBN = "P1"
        #expect(m.partnerSelectedBook?.title == "차남들의 세계사")
    }
}

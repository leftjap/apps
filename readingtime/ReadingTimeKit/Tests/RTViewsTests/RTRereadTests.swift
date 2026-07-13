import Testing
import Foundation
@testable import RTViews

// 완독 책 다시 읽기 + 세션 귀속 정본.
// 세션은 "시작한 책"에 귀속(구: 저장 시점 currentBook 고정 — 상세 시작 세션이 엉뚱한 책에 기록).
// 다시 읽기 = 완독만 해제(별점·완독일 보존) 후 그 책으로 세션 시작.
// 홈 히어로 = 미완독 중 max(추가 시각, 마지막 세션 시각).

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

private func book(_ isbn: String, added: String, rating: Int? = nil,
                  finished: String? = nil) -> RTBook {
    RTBook(isbn: isbn, title: "책\(isbn)", author: "a", publisher: "p", coverUrl: "",
           addedAt: day(added), finished: finished != nil, rating: rating,
           finishedAt: finished.map { day($0) })
}

@MainActor
@Suite struct RTSessionAttributionTests {
    func model(books: [RTBook], sessions: [RTSessionRecord] = []) -> RTAppModel {
        let m = RTAppModel()
        m.userData = RTUserData(books: books, sessions: sessions)
        m.now = { day("2026-07-13") }
        return m
    }

    @Test func detailTapSessionRecordsToSelectedBook() {
        let m = model(books: [book("X", added: "2026-07-01"), book("Y", added: "2026-07-02")])
        m.selectedISBN = "X"
        m.setMode(.tap)
        m.continueReading()
        m.saveSession()
        #expect(m.userData?.sessions.last?.isbn == "X")
    }

    @Test func detailFlipSessionRecordsToSelectedBook() {
        let m = model(books: [book("X", added: "2026-07-01"), book("Y", added: "2026-07-02")])
        m.selectedISBN = "X"
        m.continueReading()          // flip 기본 → 대기(03)
        #expect(m.route == .flipWait)
        m.simFlip()                  // 엎기 → 세션 시작
        m.saveSession()
        #expect(m.userData?.sessions.last?.isbn == "X")
    }

    @Test func homeStartIgnoresStaleSelection() {
        let m = model(books: [book("X", added: "2026-07-01"), book("Y", added: "2026-07-02")])
        m.selectedISBN = "X"         // 상세 다녀온 잔존 선택
        m.setMode(.tap)
        m.start()                    // 홈 CTA — 히어로(Y) 대상
        m.saveSession()
        #expect(m.userData?.sessions.last?.isbn == "Y")
    }

    @Test func cancelClearsPendingTarget() {
        let m = model(books: [book("X", added: "2026-07-01"), book("Y", added: "2026-07-02")])
        m.selectedISBN = "X"
        m.continueReading()          // flip 대기, 세션 미생성
        m.cancelSession()            // 취소 → 홈
        m.selectedISBN = nil
        m.simFlip()                  // 홈 엎기(FlipEngine 경로) — 히어로(Y) 대상
        m.saveSession()
        #expect(m.userData?.sessions.last?.isbn == "Y")
    }
}

@MainActor
@Suite struct RTCurrentBookTests {
    func model(books: [RTBook], sessions: [RTSessionRecord] = []) -> RTAppModel {
        let m = RTAppModel()
        m.userData = RTUserData(books: books, sessions: sessions)
        m.now = { day("2026-07-13") }
        return m
    }

    @Test func recentlyReadBeatsEarlierAdded() {
        let m = model(
            books: [book("X", added: "2026-07-01"), book("Y", added: "2026-07-02")],
            sessions: [.init(isbn: "X", mode: "tap", seconds: 60,
                             endedAt: day("2026-07-03"), pauseCount: 0)])
        #expect(m.currentBook?.isbn == "X")
    }

    @Test func newlyAddedBeatsOlderSession() {
        let m = model(
            books: [book("X", added: "2026-07-01"), book("Y", added: "2026-07-04")],
            sessions: [.init(isbn: "X", mode: "tap", seconds: 60,
                             endedAt: day("2026-07-03"), pauseCount: 0)])
        #expect(m.currentBook?.isbn == "Y")
    }

    @Test func noSessionsFallsBackToAddedAt() {
        let m = model(books: [book("X", added: "2026-07-01"), book("Y", added: "2026-07-02")])
        #expect(m.currentBook?.isbn == "Y")
    }
}

@MainActor
@Suite struct RTRereadTests {
    func model(books: [RTBook], sessions: [RTSessionRecord] = []) -> RTAppModel {
        let m = RTAppModel()
        m.userData = RTUserData(books: books, sessions: sessions)
        m.now = { day("2026-07-13") }
        return m
    }

    @Test func rereadRestoresReadingPreservingHistory() {
        let m = model(books: [book("X", added: "2026-07-01", rating: 4, finished: "2026-07-02")])
        m.selectedISBN = "X"
        m.setMode(.tap)
        m.rereadBook()
        let b = m.userData?.books.first
        #expect(b?.finished == false)
        #expect(b?.rating == 4)                       // 별점 보존
        #expect(b?.finishedAt == day("2026-07-02"))   // 완독일 보존 (캘린더 점 유지)
        #expect(m.session != nil)                     // 즉시 세션 시작
        m.saveSession()
        #expect(m.userData?.sessions.last?.isbn == "X")
        #expect(m.currentBook?.isbn == "X")           // 히어로 복귀
    }

    @Test func rereadIgnoresUnfinishedBook() {
        let m = model(books: [book("X", added: "2026-07-01")])
        m.selectedISBN = "X"
        m.rereadBook()
        #expect(m.session == nil)
        #expect(m.route != .flipWait)
    }

    @Test func finishSheetPresetsExistingRating() {
        let m = model(books: [book("X", added: "2026-07-01", rating: 2, finished: "2026-07-02")])
        m.selectedISBN = "X"
        m.openSheet(.finish)
        #expect(m.rating == 2)
    }

    @Test func finishSheetKeepsDefaultWithoutRating() {
        let m = model(books: [book("X", added: "2026-07-01")])
        m.selectedISBN = "X"
        m.openSheet(.finish)
        #expect(m.rating == 4)
    }

    @Test func refinishUpdatesFinishedAt() {
        let m = model(books: [book("X", added: "2026-07-01", rating: 4, finished: "2026-07-02")])
        m.selectedISBN = "X"
        m.setMode(.tap)
        m.rereadBook()
        m.saveSession()
        m.openSheet(.finish)
        m.rate(5)
        m.saveFinished()
        let b = m.userData?.books.first
        #expect(b?.finished == true)
        #expect(b?.rating == 5)
        #expect(b?.finishedAt == day("2026-07-13"))   // 재완독일로 갱신
    }
}

@MainActor
@Suite struct RTEmptyHomeCopyTests {
    @Test func nextBookVariantWhenLibraryHasBooks() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("X", added: "2026-07-01", rating: 4,
                                             finished: "2026-07-02")])
        #expect(Screen14EmptyHome(model: m).nextBook == true)
    }

    @Test func onboardingVariantWhenNoBooks() {
        let m = RTAppModel()
        m.userData = RTUserData()
        #expect(Screen14EmptyHome(model: m).nextBook == false)
    }

    @Test func demoPathKeepsOnboardingCopy() {
        #expect(Screen14EmptyHome(model: nil).nextBook == false)   // 픽셀 오라클 경로 불변
    }
}

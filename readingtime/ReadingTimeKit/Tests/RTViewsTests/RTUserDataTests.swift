import Testing
import Foundation
@testable import RTViews

// §6-④ 실데이터 정본 — 라이브 모드(userData 주입) 시 책 등록/세션 기록/파생값.
// 데모 모드(userData nil)는 기존 동작 불변이 회귀 가드.

private let hit0 = RTBookHit(title: "몰입 Flow", author: "미하이 칙센트미하이",
                             publisher: "한울림", isbn: "9788931009552",
                             coverUrl: "https://example.com/c.jpg")

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

@MainActor
@Suite struct RTUserDataTests {
    static var hit: RTBookHit { hit0 }

    func liveModel(now: Date = day("2026-07-04")) -> RTAppModel {
        let m = RTAppModel()
        m.userData = RTUserData()
        m.now = { now }
        return m
    }

    @Test func liveToggleAddAddsAndRemovesBook() {
        let m = liveModel()
        m.searchResults = [Self.hit]
        var changes = 0
        m.onUserDataChange = { _ in changes += 1 }

        m.toggleAdd(Self.hit.isbn)
        #expect(m.userData?.books.count == 1)
        #expect(m.userData?.books.first?.title == "몰입 Flow")
        #expect(m.added.contains(Self.hit.isbn))
        #expect(changes == 1)

        m.toggleAdd(Self.hit.isbn)
        #expect(m.userData?.books.isEmpty == true)
        #expect(!m.added.contains(Self.hit.isbn))
        #expect(changes == 2)
    }

    @Test func demoToggleAddKeepsSetOnly() {
        let m = RTAppModel()   // userData nil = 데모
        m.toggleAdd("flow")
        m.toggleAdd("money")
        #expect(m.userData == nil)
        #expect(m.added.contains("money"))
        #expect(!m.added.contains("flow"))   // 데모 시드 "flow" 는 토글로 제거됨
    }

    @Test func saveSessionAppendsRecord() {
        let now = day("2026-07-04", hour: 22)
        let m = liveModel(now: now)
        m.searchResults = [Self.hit]
        m.toggleAdd(Self.hit.isbn)

        m.sessionSeed = 0
        m.startSession(.flip)
        m.syncElapsed(95)
        m.togglePause()
        m.saveSession()

        let rec = m.userData?.sessions.first
        #expect(m.userData?.sessions.count == 1)
        #expect(rec?.seconds == 95)
        #expect(rec?.mode == "flip")
        #expect(rec?.isbn == Self.hit.isbn)
        #expect(rec?.endedAt == now)
        #expect(rec?.pauseCount == 1)
    }

    @Test func saveFinishedMarksCurrentBook() {
        let m = liveModel()
        m.searchResults = [Self.hit]
        m.toggleAdd(Self.hit.isbn)
        m.rate(5)
        m.saveFinished()
        #expect(m.userData?.books.first?.finished == true)
        #expect(m.userData?.books.first?.rating == 5)
        #expect(m.userData?.books.first?.finishedAt == m.now())
        #expect(m.currentBook == nil)   // 완독되면 읽는 중 없음
    }

    @Test func currentBookPicksLatestUnfinished() {
        let m = liveModel()
        let old = RTBook(isbn: "1", title: "옛책", author: "a", publisher: "p",
                         coverUrl: "", addedAt: day("2026-07-01"))
        let new = RTBook(isbn: "2", title: "새책", author: "b", publisher: "p",
                         coverUrl: "", addedAt: day("2026-07-03"))
        let done = RTBook(isbn: "3", title: "완독", author: "c", publisher: "p",
                          coverUrl: "", addedAt: day("2026-07-04"), finished: true)
        m.userData = RTUserData(books: [old, new, done])
        #expect(m.currentBook?.isbn == "2")
    }

    @Test func derivedTodayWeekStreak() {
        let m = liveModel(now: day("2026-07-04", hour: 23))   // 토요일
        m.userData = RTUserData(sessions: [
            .init(isbn: nil, mode: "flip", seconds: 600, endedAt: day("2026-07-04"), pauseCount: 0),
            .init(isbn: nil, mode: "tap", seconds: 300, endedAt: day("2026-07-04", hour: 8), pauseCount: 0),
            .init(isbn: nil, mode: "flip", seconds: 400, endedAt: day("2026-07-03"), pauseCount: 0),
            .init(isbn: nil, mode: "flip", seconds: 200, endedAt: day("2026-06-28"), pauseCount: 0), // 지난주 일요일
        ])
        #expect(m.todaySeconds == 900)
        // 이번 주(월요일 시작 2026-06-29~) = 7/3 + 7/4
        #expect(m.weekSeconds == 1300)
        // 연속: 7/4·7/3 기록, 7/2 없음 → 2일
        #expect(m.streakDays == 2)
    }

    @Test func streakZeroWhenNoRecent() {
        let m = liveModel(now: day("2026-07-04"))
        m.userData = RTUserData(sessions: [
            .init(isbn: nil, mode: "flip", seconds: 100, endedAt: day("2026-06-20"), pauseCount: 0),
        ])
        #expect(m.streakDays == 0)
    }
}

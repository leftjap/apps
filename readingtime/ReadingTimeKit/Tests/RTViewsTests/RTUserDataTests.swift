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
        m.openSheet(.addbook)
        var changes = 0
        m.onUserDataChange = { _ in changes += 1 }

        m.toggleAdd(Self.hit.isbn)
        #expect(m.userData?.books.count == 1)
        #expect(m.userData?.books.first?.title == "몰입 Flow")
        #expect(m.added.contains(Self.hit.isbn))
        #expect(changes == 1)
        #expect(m.sheet == nil)   // 검색 결과 선택 → 시트 자동 닫힘 (실기기 피드백)

        m.openSheet(.addbook)
        m.toggleAdd(Self.hit.isbn)
        #expect(m.userData?.books.isEmpty == true)
        #expect(!m.added.contains(Self.hit.isbn))
        #expect(changes == 2)
        #expect(m.sheet == .addbook)   // 해제는 시트 유지
    }

    @Test func demoToggleAddKeepsSheetOpen() {
        let m = RTAppModel()   // 데모: rtshot 13 시드가 시트 열림+체크 상태를 렌더해야 함
        m.openSheet(.addbook)
        m.toggleAdd("money")
        #expect(m.sheet == .addbook)
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

    @Test func perBookTotalsAndRecent() {
        let m = liveModel(now: day("2026-07-04", hour: 23))
        m.userData = RTUserData(sessions: [
            .init(isbn: "A", mode: "flip", seconds: 300, endedAt: day("2026-07-04", hour: 9), pauseCount: 0),
            .init(isbn: "A", mode: "tap", seconds: 400, endedAt: day("2026-07-02"), pauseCount: 0),
            .init(isbn: "B", mode: "flip", seconds: 100, endedAt: day("2026-07-01"), pauseCount: 0),
        ])
        #expect(m.totalSeconds(isbn: "A") == 700)
        #expect(m.sessionCount(isbn: "A") == 2)
        let r = m.recentRecords(2)
        #expect(r.count == 2)
        #expect(r[0].endedAt == day("2026-07-04", hour: 9))   // 최신순
    }

    @Test func weekBarRatiosNormalized() {
        let m = liveModel(now: day("2026-07-04", hour: 23))   // 토
        m.userData = RTUserData(sessions: [
            .init(isbn: nil, mode: "flip", seconds: 600, endedAt: day("2026-06-29"), pauseCount: 0), // 월
            .init(isbn: nil, mode: "flip", seconds: 300, endedAt: day("2026-07-04"), pauseCount: 0), // 토
        ])
        let bars = m.weekBarRatios
        #expect(bars.count == 7)
        #expect(bars[0] == 1.0)
        #expect(bars[5] == 0.5)
        #expect(bars[2] == 0)
        #expect(m.weekTodayIndex == 5)
    }

    @Test func weekOffsetAndDayMinutes() {
        let m = liveModel(now: day("2026-07-04", hour: 23))   // 토
        m.userData = RTUserData(sessions: [
            .init(isbn: nil, mode: "flip", seconds: 600, endedAt: day("2026-07-04"), pauseCount: 0),
            .init(isbn: nil, mode: "flip", seconds: 400, endedAt: day("2026-07-03"), pauseCount: 0),
            .init(isbn: nil, mode: "flip", seconds: 200, endedAt: day("2026-06-28"), pauseCount: 0), // 지난주 일
        ])
        #expect(m.weekSeconds(offset: -1) == 200)
        let mins = m.weekDayMinutes
        #expect(mins.count == 7)
        #expect(mins[4] == 6)    // 금 7/3 = 400s → 6분
        #expect(mins[5] == 10)   // 토 7/4
        #expect(mins[0] == 0)
    }

    @Test func formatHelpers() {
        #expect(RTAppModel.hmString(26_760) == "7:26")
        #expect(RTAppModel.hmString(0) == "0:00")
        let now = day("2026-07-04", hour: 23)
        #expect(RTAppModel.recentWhen(day("2026-07-04", hour: 14), now: now) == "오늘 14:00")
        #expect(RTAppModel.recentWhen(day("2026-05-20"), now: now) == "5.20")
    }

    @Test func selectedBookFallsBackAndDeletes() {
        let m = liveModel()
        m.searchResults = [Self.hit]
        m.toggleAdd(Self.hit.isbn)
        #expect(m.selectedBook?.isbn == Self.hit.isbn)   // selectedISBN nil → currentBook 폴백
        m.selectedISBN = Self.hit.isbn
        m.deleteBook()
        #expect(m.userData?.books.isEmpty == true)
        #expect(m.route == .library)
    }

    @Test func librarySortRules() {
        func book(_ isbn: String, _ title: String, added: String, rating: Int?, finished: String?) -> RTBook {
            RTBook(isbn: isbn, title: title, author: "a", publisher: "p", coverUrl: "",
                   addedAt: day(added), finished: true, rating: rating,
                   finishedAt: finished.map { day($0) })
        }
        let a = book("1", "나", added: "2026-07-01", rating: 4, finished: "2026-07-02")
        let b = book("2", "가", added: "2026-07-03", rating: 5, finished: "2026-07-01")
        let c = book("3", "다", added: "2026-06-30", rating: 4, finished: nil)   // finishedAt 없으면 addedAt
        let books = [a, b, c]
        #expect(books.sortedForLibrary(.recent).map(\.isbn) == ["1", "2", "3"])
        #expect(books.sortedForLibrary(.name).map(\.isbn) == ["2", "1", "3"])
        #expect(books.sortedForLibrary(.rating).map(\.isbn) == ["2", "1", "3"])   // 동률(4) 은 원순서 안정
    }

    @Test func addTimeAppendsManualRecord() {
        let m = liveModel()
        m.searchResults = [Self.hit]
        m.toggleAdd(Self.hit.isbn)
        m.addtimeValue = 45
        m.addTime()
        let rec = m.userData?.sessions.first
        #expect(rec?.mode == "manual")
        #expect(rec?.seconds == 45 * 60)
        #expect(rec?.isbn == Self.hit.isbn)
        #expect(m.sheet == nil)
        #expect(m.addtimeValue == 35)   // 데모 리셋 규칙 유지
    }

    @Test func streakZeroWhenNoRecent() {
        let m = liveModel(now: day("2026-07-04"))
        m.userData = RTUserData(sessions: [
            .init(isbn: nil, mode: "flip", seconds: 100, endedAt: day("2026-06-20"), pauseCount: 0),
        ])
        #expect(m.streakDays == 0)
    }
}

// 탭 세션 wall-clock — UI 틱 유실(잠금·서스펜드)과 무관하게 실제 경과 보전
@MainActor
@Suite struct RTTapSessionClockTests {
    func session(_ mode: RTMode, _ status: RTSessionStatus) -> RTSession {
        RTSession(mode: mode, status: status, elapsed: 0, pauseCount: 0, startedAt: day("2026-07-04"))
    }

    @Test func tracksTapWallClockAcrossSuspend() {
        var c = RTTapSessionClock()
        let t0 = day("2026-07-04", hour: 10)
        c.track(session(.tap, .recording), at: t0)
        #expect(c.isTracking)
        // 틱 유실 상황: 55초 뒤 상태 변화 없이 elapsed 조회 → 실제 경과 반환
        #expect(c.elapsed(at: t0.addingTimeInterval(55)) == 55)
    }

    @Test func pauseAndResume() {
        var c = RTTapSessionClock()
        let t0 = day("2026-07-04", hour: 10)
        c.track(session(.tap, .recording), at: t0)
        c.track(session(.tap, .paused), at: t0.addingTimeInterval(30))
        #expect(c.elapsed(at: t0.addingTimeInterval(100)) == 30)   // 정지 중 경과 없음
        c.track(session(.tap, .recording), at: t0.addingTimeInterval(100))
        #expect(c.elapsed(at: t0.addingTimeInterval(130)) == 60)   // 30 + 30
    }

    @Test func ignoresFlipAndResets() {
        var c = RTTapSessionClock()
        let t0 = day("2026-07-04", hour: 10)
        c.track(session(.flip, .recording), at: t0)
        #expect(!c.isTracking)
        c.track(session(.tap, .recording), at: t0)
        #expect(c.isTracking)
        c.track(nil, at: t0.addingTimeInterval(10))   // 세션 종료 → 리셋
        #expect(!c.isTracking)
    }

    @Test func repeatedTicksDontDisturb() {
        var c = RTTapSessionClock()
        let t0 = day("2026-07-04", hour: 10)
        c.track(session(.tap, .recording), at: t0)
        c.track(session(.tap, .recording), at: t0.addingTimeInterval(1))   // 틱로 인한 재발행
        c.track(session(.tap, .recording), at: t0.addingTimeInterval(2))
        #expect(c.elapsed(at: t0.addingTimeInterval(20)) == 20)
    }
}

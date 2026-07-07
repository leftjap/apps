import Testing
import Foundation
@testable import RTViews

// 홈 리디자인 신규 파생값 — "N일째"(함께한 일수) + 연속 기록 체인 도트 배열.
// 시간 의존은 model.now 주입으로 결정적 실행.
@MainActor
@Suite struct RTHomeDerivedTests {
    let cal = Calendar(identifier: .gregorian)

    func date(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 12, _ min: Int = 0) -> Date {
        cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: min))!
    }
    func model(now: Date) -> RTAppModel {
        let m = RTAppModel(); m.now = { now }; return m
    }
    func book(added: Date) -> RTBook {
        RTBook(isbn: "i", title: "t", author: "a", publisher: "p", coverUrl: "", addedAt: added)
    }
    func rec(_ d: Date) -> RTSessionRecord {
        RTSessionRecord(isbn: nil, mode: "flip", seconds: 600, endedAt: d, pauseCount: 0)
    }

    @Test func daysSinceAddedCountsInclusive() {
        // 6/1 등록 → 6/18 은 18일째
        let m = model(now: date(2026, 6, 18, 10))
        m.userData = RTUserData(books: [book(added: date(2026, 6, 1, 9))], sessions: [])
        #expect(m.daysSinceAdded(m.currentBook!) == 18)
    }

    @Test func daysSinceAddedSameDayIsOne() {
        let m = model(now: date(2026, 6, 18, 23))
        m.userData = RTUserData(books: [book(added: date(2026, 6, 18, 1))], sessions: [])
        #expect(m.daysSinceAdded(m.currentBook!) == 1)
    }

    @Test func streakChainMarksSessionDays() {
        // 세션: 6/18(오늘)·6/17·6/15 → 최근 5일(6/14~6/18) = [F,T,F,T,T]
        let m = model(now: date(2026, 6, 18, 20))
        m.userData = RTUserData(books: [], sessions: [
            rec(date(2026, 6, 18)), rec(date(2026, 6, 17)), rec(date(2026, 6, 15)),
        ])
        #expect(m.streakChain(5) == [false, true, false, true, true])
    }

    @Test func streakChainMultipleSessionsSameDayCollapse() {
        let m = model(now: date(2026, 6, 18, 20))
        m.userData = RTUserData(books: [], sessions: [
            rec(date(2026, 6, 18, 9)), rec(date(2026, 6, 18, 21)),
        ])
        #expect(m.streakChain(3) == [false, false, true])
    }

    @Test func streakChainEmptyWhenNoUserData() {
        let m = RTAppModel()   // userData nil (데모)
        #expect(m.streakChain(4) == [false, false, false, false])
    }

    // recentWhen 에 "어제 HH:mm" 케이스 추가 (홈 마지막 기록 데모 표기 "어제 22:14" 를
    // 라이브 경로도 재현하도록 — 리뷰 지적 #5, 스펙이 "필요 시 추가" 명시).
    @Test func recentWhenYesterday() {
        let now = date(2026, 6, 18, 9)
        let yesterday = date(2026, 6, 17, 22, 14)
        #expect(RTAppModel.recentWhen(yesterday, now: now) == "어제 22:14")
    }
    @Test func recentWhenTodayAndOlderUnchanged() {
        let now = date(2026, 6, 18, 9)
        #expect(RTAppModel.recentWhen(date(2026, 6, 18, 8, 5), now: now) == "오늘 08:05")
        #expect(RTAppModel.recentWhen(date(2026, 6, 15, 22), now: now) == "6.15")   // 이틀 전은 M.d
    }
}

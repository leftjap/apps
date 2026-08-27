import Testing
import Foundation
@testable import RTViews

// 밀리(전자책) 일별 데이터의 통계 합산 — 표시 계층 통합 (README: DB에선 안 섞음).
// ebookDaily: "yyyy-MM-dd"(실발생일) → seconds. 60초 이상인 밀리 날만 연속·읽은 날로 인정
// (11 월간 "17/21일 읽음 · 밀리 포함" 스펙 정합).

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

@MainActor
@Suite struct RTEbookStatsTests {
    // 2026-07-13(월) 기준 — 주간 = 07-13(월)~07-19(일)
    func model() -> RTAppModel {
        let m = RTAppModel()
        m.userData = RTUserData(sessions: [
            .init(isbn: nil, mode: "flip", seconds: 600, endedAt: day("2026-07-13"), pauseCount: 0),
        ])
        m.now = { day("2026-07-13") }
        return m
    }

    @Test func todayIncludesEbook() {
        let m = model()
        m.ebookDaily = ["2026-07-13": 290]
        #expect(m.todaySeconds == 600 + 290)
    }

    @Test func weekIncludesEbookAndPrevWeekExcluded() {
        let m = model()
        m.ebookDaily = ["2026-07-13": 290, "2026-07-12": 999]   // 07-12(일) = 지난주
        #expect(m.weekSeconds == 600 + 290)
        #expect(m.weekSeconds(offset: -1) == 999)
    }

    @Test func streakCountsMillieOnlyDays() {
        let m = model()   // 종이: 오늘만
        m.ebookDaily = ["2026-07-12": 150, "2026-07-11": 60]   // 밀리만 읽은 이틀
        #expect(m.streakDays == 3)
        #expect(m.streakChain(3) == [true, true, true])
    }

    @Test func weekDayMinutesIncludesEbook() {
        let m = model()
        m.ebookDaily = ["2026-07-13": 300]
        #expect(m.weekDayMinutes[0] == (600 + 300) / 60)   // 월요일 칸
    }

    @Test func zeroSecondsEbookDayDoesNotCountAsRead() {
        let m = RTAppModel()
        m.userData = RTUserData()
        m.now = { day("2026-07-13") }
        m.ebookDaily = ["2026-07-13": 0]
        #expect(m.streakDays == 0)
        #expect(m.todaySeconds == 0)
    }

    @Test func ebookDayUnderOneMinuteIsIgnoredEverywhere() {
        let m = RTAppModel()
        m.userData = RTUserData()
        m.now = { day("2026-07-13") }
        m.ebookDaily = ["2026-07-13": 59]
        #expect(m.ebookSeconds(on: day("2026-07-13")) == 0)
        #expect(m.todaySeconds == 0)
        #expect(m.weekSeconds == 0)
        #expect(m.streakDays == 0)
        #expect(m.streakChain(1) == [false])
        #expect(m.countedEbookTotalSeconds == 0)
        #expect(m.countedEbookDayCount == 0)
    }

    @Test func oneMinuteEbookDayCounts() {
        let m = RTAppModel()
        m.userData = RTUserData()
        m.now = { day("2026-07-13") }
        m.ebookDaily = ["2026-07-13": 60]
        #expect(m.ebookSeconds(on: day("2026-07-13")) == 60)
        #expect(m.streakDays == 1)
        #expect(m.countedEbookTotalSeconds == 60)
        #expect(m.countedEbookDayCount == 1)
    }

    @Test func ebookBreakdownUsesDayBook() {
        let m = model()
        m.ebookDaily = ["2026-07-13": 600]
        m.ebookBooks = ["2026-07-13": ["디 마이너스"]]
        let r = m.ebookBreakdown(on: day("2026-07-13"))
        #expect(r.map(\.title) == ["디 마이너스"])
        #expect(r.first?.seconds == 600)
    }

    @Test func ebookBreakdownDoesNotInventMultiBookSplit() {
        let m = model()
        m.ebookDaily = ["2026-07-13": 600]
        m.ebookBooks = ["2026-07-13": ["A", "B"]]
        let r = m.ebookBreakdown(on: day("2026-07-13"))
        #expect(r.map(\.title) == ["밀리의서재"])
        #expect(r.map(\.seconds) == [600])
    }

    @Test func ebookBreakdownDoesNotGuessPreviousBook() {
        let m = model()
        m.ebookDaily = ["2026-07-13": 100]
        m.ebookBooks = ["2026-07-10": ["그래서 브랜딩이 필요합니다"]]
        #expect(m.ebookBreakdown(on: day("2026-07-13")).first?.title == "밀리의서재")
    }

    @Test func ebookBreakdownFallsBackToServiceName() {
        let m = model()
        m.ebookDaily = ["2026-07-13": 100]
        #expect(m.ebookBreakdown(on: day("2026-07-13")).first?.title == "밀리의서재")
    }

    @Test func demoModeUnaffected() {
        let m = RTAppModel()   // userData nil = 데모
        m.ebookDaily = ["2026-07-13": 999]
        m.now = { day("2026-07-13") }
        #expect(m.todaySeconds == 0)
        #expect(m.streakDays == 0)
    }
}

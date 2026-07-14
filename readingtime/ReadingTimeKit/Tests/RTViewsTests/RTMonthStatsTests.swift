import Testing
import Foundation
@testable import RTViews

// 월간(11) 통계 — 주체(.me/.partner) 분리 + 밀리 합산.
// 실기기 보고 2026-07-14: 파트너 월간에 내 세션·내 밀리가 새어 "소연 통계에
// 내 책이 겹쳐" 보임 (주간엔 분기가 있는데 월간엔 없어서). 파트너는 partnerData 만.

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}
private func session(_ ended: String, _ sec: Int) -> RTSessionRecord {
    RTSessionRecord(isbn: nil, mode: "flip", seconds: sec, endedAt: day(ended), pauseCount: 0)
}

@MainActor
@Suite struct RTMonthStatsTests {
    // buildLive 직접 — 내 월간: 종이 + 밀리 합산
    @Test func meMonthIncludesMillie() {
        let cal = Calendar(identifier: .gregorian)
        let data = RTUserData(sessions: [session("2026-07-10", 600)])          // 종이 10분
        let live = Screen11Month.buildLive(data: data, now: day("2026-07-14"),
            ebookSec: { cal.isDate($0, inSameDayAs: day("2026-07-13")) ? 1200 : 0 })  // 밀리 20분(7/13)
        #expect(live.totalHM == "0:30")   // 10 + 20
        #expect(live.readDays == 2)       // 7/10 종이 + 7/13 밀리
    }

    // buildLive 기본 인자(ebook=0) — 파트너용: 밀리 없이 종이만
    @Test func partnerBuildHasNoMillie() {
        let pd = RTUserData(sessions: [session("2026-07-11", 600)])   // 파트너 종이 10분
        let live = Screen11Month.buildLive(data: pd, now: day("2026-07-14"))
        #expect(live.totalHM == "0:10")
        #expect(live.readDays == 1)
    }

    // 라우팅 — statsSubject == .partner 면 partnerData 만, 내 세션·내 밀리 불참
    @Test func partnerMonthUsesPartnerDataOnly() {
        let m = RTAppModel()
        m.now = { day("2026-07-14") }
        m.userData = RTUserData(sessions: [session("2026-07-05", 3600)])  // 내 종이 60분
        m.ebookDaily = ["2026-07-14": 1800]                               // 내 밀리 30분
        m.partnerData = RTUserData(sessions: [session("2026-07-11", 600)])// 파트너 종이 10분
        m.statsSubject = .partner
        let live = Screen11Month(model: m).live
        #expect(live?.totalHM == "0:10")   // 파트너 10분만 (내 90분 아님)
        #expect(live?.readDays == 1)       // 파트너 7/11 하루만
    }

    // 라우팅 — .me 면 내 데이터 + 내 밀리
    @Test func meMonthRouting() {
        let m = RTAppModel()
        m.now = { day("2026-07-14") }
        m.userData = RTUserData(sessions: [session("2026-07-05", 3600)])  // 종이 60분
        m.ebookDaily = ["2026-07-13": 600]                                // 밀리 10분
        m.statsSubject = .me
        let live = Screen11Month(model: m).live
        #expect(live?.totalHM == "1:10")   // 60 + 10
        #expect(live?.readDays == 2)
    }
}

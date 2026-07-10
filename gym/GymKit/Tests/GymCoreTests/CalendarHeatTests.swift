import Foundation
import Testing
@testable import GymCore

// 통계 월 캘린더 볼륨 히트맵 — PWA stats.js applyWorkedToCalendar 정합.
// 농도 alpha = 0.14 + 0.82 × (일볼륨 / 월최대볼륨), 숫자색 a>0.52 흰색 / 굵기 a>0.4 600.
@Suite struct CalendarHeatTests {

    func sess(_ date: String, _ sets: [(Double, Int)], status: GymSessionStatus = .completed) -> GymSession {
        GymSession(id: "s-\(date)", date: date,
                   blocks: [GymBlock(exerciseId: "bench_press",
                                     sets: sets.map { GymSet(weight: $0.0, reps: $0.1, done: true) })],
                   status: status)
    }

    @Test func dayVolumesSumsDoneSetsOfDisplayedMonthOnly() {
        let xs = [
            sess("2026-07-08", [(100, 8), (110, 6)]),   // 800 + 660 = 1460
            sess("2026-07-08", [(50, 10)]),             // 같은 날 두 번째 세션 → 합산 500
            sess("2026-06-30", [(100, 10)]),            // 다른 달 → 제외
        ]
        let v = GymCalendarHeat.dayVolumes(sessions: xs, year: 2026, month: 7)
        #expect(v == [8: 1960])
    }

    @Test func cardioOnlyDayIsWorkedWithZeroVolume() {
        // 유산소 단독일 — done 이지만 weight/reps nil → 볼륨 0. worked 로 잡되 최소 농도.
        let s = GymSession(id: "c", date: "2026-07-04",
                           blocks: [GymBlock(exerciseId: "cycle",
                                             sets: [GymSet(done: true, duration: 1500, distance: 10)])],
                           status: .completed)
        let v = GymCalendarHeat.dayVolumes(sessions: [s], year: 2026, month: 7)
        #expect(v == [4: 0])
        #expect(GymCalendarHeat.alpha(dayVol: 0, maxVol: 6920) == 0.14)
    }

    @Test func nonCompletedSessionsExcluded() {
        let xs = [sess("2026-07-01", [(100, 10)], status: .active)]
        #expect(GymCalendarHeat.dayVolumes(sessions: xs, year: 2026, month: 7).isEmpty)
    }

    @Test func alphaIsLinearFromFloorToFull() {
        #expect(GymCalendarHeat.alpha(dayVol: 6920, maxVol: 6920) == 0.96)
        #expect(abs(GymCalendarHeat.alpha(dayVol: 3460, maxVol: 6920) - 0.55) < 1e-9)
        #expect(GymCalendarHeat.alpha(dayVol: 100, maxVol: 0) == 0.14)   // max 0 방어
    }

    @Test func numberStyleThresholdsMatchPWA() {
        #expect(GymCalendarHeat.numberIsWhite(alpha: 0.53))
        #expect(!GymCalendarHeat.numberIsWhite(alpha: 0.52))   // 초과일 때만 (> 0.52)
        #expect(GymCalendarHeat.numberIsBold(alpha: 0.41))
        #expect(!GymCalendarHeat.numberIsBold(alpha: 0.40))    // 초과일 때만 (> 0.4)
    }
}

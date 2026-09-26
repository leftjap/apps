import Testing
import Foundation
@testable import GymCore

// 유산소 직전 기록 줄 (사용자 2026-09-26) — 근력 세트바 자리에 최근 러닝을 편다.
// 9/17 에 요일별 수치 원이 날짜만 보이는 2주 카드로 바뀐 뒤, 트레드밀 화면의 지난 수치는
// 입력 전 히어로 고스트와 키패드 "직전" 줄뿐이었다. 근력은 칸 = 세트, 유산소는 세션당 한 번이라 칸 = 세션이다.
@Suite struct CardioRecordBarTests {

    func run(_ date: String, min: Double?, km: Double?, ex: String = "treadmill",
             status: GymSessionStatus = .completed) -> GymSession {
        var set = GymSet(done: true)
        set.duration = min.map { $0 * 60 }
        set.distance = km
        return GymSession(id: date, date: date, startTime: 0,
                          blocks: [GymBlock(exerciseId: ex, sets: [set])], status: status)
    }

    // 실기기 9/19~9/25 모양 — 9/24 는 거리 없이 시간만 남아 있다.
    var history: [GymSession] {
        [run("2026-09-18", min: 1.5, km: 1.7),
         run("2026-09-19", min: 14, km: 1.8),
         run("2026-09-20", min: 15, km: 1.9),
         run("2026-09-21", min: 16, km: 2.0),
         run("2026-09-24", min: 17, km: nil),
         run("2026-09-25", min: 18, km: 2.1)]
    }

    @Test func pastIsLastFourRunsOldestFirst() {
        let bar = GymSessionLogic.cardioRecordBar(history: history, exerciseId: "treadmill", todaySet: nil)
        #expect(bar.past.map(\.top) == ["1.9", "2.0", "—", "2.1"])
        #expect(bar.past.map(\.bottom) == ["9/20", "9/21", "9/24", "9/25"])
    }

    // 거리가 빠진 날은 0 이 아니라 "—" — 기록이 비었다는 사실을 그대로 보여준다.
    @Test func missingDistanceIsDashNotZero() {
        let bar = GymSessionLogic.cardioRecordBar(history: history, exerciseId: "treadmill", todaySet: nil)
        #expect(bar.past[2] == .init(top: "—", bottom: "9/24", distanceKm: 0))
    }

    @Test func todayShowsEnteredValuesOrDash() {
        let empty = GymSessionLogic.cardioRecordBar(history: history, exerciseId: "treadmill",
                                                    todaySet: GymSet(preset: true))
        #expect(empty.today == .init(top: "—", bottom: "오늘", distanceKm: 0))
        var s = GymSet(preset: false); s.distance = 2.2; s.duration = 19 * 60
        let typed = GymSessionLogic.cardioRecordBar(history: history, exerciseId: "treadmill", todaySet: s)
        #expect(typed.today == .init(top: "2.2", bottom: "오늘", distanceKm: 2.2))
    }

    // 최고 = 전체 기록 중 최장 거리 (최근 4회 밖이어도). 오늘 입력이 넘으면 오늘이 최고.
    @Test func bestIsLongestDistanceIncludingToday() {
        let old = [run("2026-08-01", min: 30, km: 3.0)] + history
        let bar = GymSessionLogic.cardioRecordBar(history: old, exerciseId: "treadmill", todaySet: nil)
        #expect(bar.best == .init(top: "3.0", bottom: "8/1", distanceKm: 3.0))
        var s = GymSet(preset: false); s.distance = 3.2; s.duration = 31 * 60
        let beat = GymSessionLogic.cardioRecordBar(history: old, exerciseId: "treadmill", todaySet: s)
        #expect(beat.best == .init(top: "3.2", bottom: "오늘", distanceKm: 3.2))
    }

    // 다른 유산소 종목·진행 중 세션은 섞지 않는다 (주간 카드와 같은 집계 범위).
    @Test func ignoresOtherExercisesAndActiveSessions() {
        let mixed = history + [run("2026-09-26", min: 40, km: 9.9, ex: "cycle"),
                               run("2026-09-26", min: 20, km: 2.5, status: .active)]
        let bar = GymSessionLogic.cardioRecordBar(history: mixed, exerciseId: "treadmill", todaySet: nil)
        #expect(bar.past.last?.top == "2.1")
        #expect(bar.best?.top == "2.1")
    }

    @Test func noHistoryMeansNoPastAndNoBest() {
        let bar = GymSessionLogic.cardioRecordBar(history: [], exerciseId: "treadmill", todaySet: nil)
        #expect(bar.past.isEmpty)
        #expect(bar.best == nil)
    }
}

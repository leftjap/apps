import Foundation
import Testing
@testable import GymCore

// 날짜 상세 시트 로직 — stats.js sessionToWorkoutEntry/mergeWorkoutEntries + day-detail-sheet.js formatDayLabel 정합.
@Suite struct DayDetailTests {

    func benchSession() -> GymSession {
        var s = GymSession(id: "s1", date: "2026-05-06", blocks: [
            GymBlock(exerciseId: "bench_press", sets: [
                GymSet(weight: 60, reps: 10, done: true),
                GymSet(weight: 65, reps: 10, done: true, pr: true),
                GymSet(weight: 70, reps: 8, done: false)]),          // 미완료 제외
            GymBlock(exerciseId: "dumbbell_fly", sets: [
                GymSet(weight: 18, reps: 12, done: false)]),          // done 0 → 행 제외
        ], tags: ["chest"], totalVolume: 1250, status: .completed)
        s.durationMin = 52
        return s
    }

    @Test func entryFromWeightSession() {
        let e = GymDayDetailLogic.entry(for: benchSession(), custom: [])
        #expect(e.tag == "가슴")
        #expect(e.vol == 1250)
        #expect(e.min == 52)
        #expect(e.pr == 1)
        #expect(e.ex.count == 1)   // done 0 종목 제외
        #expect(e.ex[0].n == "벤치프레스")
        #expect(e.ex[0].s == "2세트 · 1,250kg")
        #expect(e.ex[0].setCount == 2)
    }

    @Test func entryCardioUsesDurationAndDistance() {
        let s = GymSession(id: "c1", date: "2026-05-06", blocks: [
            GymBlock(exerciseId: "treadmill", sets: [
                GymSet(done: true, duration: 1800, distance: 3.2)]),
        ], tags: ["cardio"], status: .completed)
        let e = GymDayDetailLogic.entry(for: s, custom: [])
        #expect(e.ex[0].s == "30분 · 3.2km")
        // duration 미입력 cardio(구버그 데이터) → "—"
        let s2 = GymSession(id: "c2", date: "2026-05-06", blocks: [
            GymBlock(exerciseId: "treadmill", sets: [GymSet(done: true)]),
        ], status: .completed)
        #expect(GymDayDetailLogic.entry(for: s2, custom: []).ex[0].s == "—")
    }

    @Test func mergeSumsAndCombinesSameExercise() {
        let a = GymDayDetailLogic.entry(for: benchSession(), custom: [])
        var s2 = benchSession(); s2.id = "s2"; s2.durationMin = 30; s2.totalVolume = 600
        s2.blocks = [GymBlock(exerciseId: "bench_press", sets: [GymSet(weight: 60, reps: 10, done: true)])]
        let b = GymDayDetailLogic.entry(for: s2, custom: [])
        let m = GymDayDetailLogic.merged([a, b])
        #expect(m.vol == 1850)
        #expect(m.min == 82)
        #expect(m.ex.count == 1)
        #expect(m.ex[0].s == "3세트 · 1,850kg")
    }

    @Test func dayLabelFormat() {
        #expect(GymDayDetailLogic.dayLabel("2026-05-06") == "5월 6일 · 수요일")
        #expect(GymDayDetailLogic.dayLabel("2026-07-10") == "7월 10일 · 금요일")
        #expect(GymDayDetailLogic.dayLabel("bad") == "")
    }
}

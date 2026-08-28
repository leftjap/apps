import Foundation
import Testing
import GymCore
@testable import GymViews

// 칼로리 **전 경로** 대조 — 2026-08-28 실기기 세션 #0070 (폰 컨테이너 덤프 원본값).
//
// CalorieRealSessionTests 는 GymCalorieEntry 를 손으로 만들어 수식만 봤다. 여기서는 실제 세션을
// GymAppModel 에 넣어 `estimatedCalories()` 가 스스로 엔트리를 구성하게 한다 —
// MET 조회(빌트인·커스텀)·done 세트 집계·유산소 분리·최신 체중 선택까지 함께 검증된다.
@MainActor @Suite struct CalorieEndToEndTests {

    static func done(_ w: Double?, _ r: Int) -> GymSet {
        GymSet(weight: w, reps: r, done: true, preset: false)
    }

    func realSession() -> GymSession {
        let start: Int64 = 1_787_995_527_841        // 2026-08-28 18:25:27.841 KST
        var s = GymSession(id: "s0070", date: "2026-08-28", startTime: start, status: .active)
        var treadmill = GymSet(preset: false)
        treadmill.done = true; treadmill.duration = 600; treadmill.distance = 1; treadmill.calories = 46
        s.blocks = [
            GymBlock(exerciseId: "military_press", sets: [   // met 4.5
                Self.done(20, 9), Self.done(30, 15), Self.done(40, 13),
                Self.done(50, 11), Self.done(60, 9), Self.done(60, 10)]),
            GymBlock(exerciseId: "side_lateral", sets: [     // met 3.5
                Self.done(8, 12), Self.done(12, 12), Self.done(12, 12), Self.done(16, 8)]),
            GymBlock(exerciseId: "wrist_curl", sets: [       // met 3.0
                Self.done(20, 12), Self.done(20, 13), Self.done(20, 12)]),
            GymBlock(exerciseId: "hanging_leg_raise", sets: [// met 4.0 · 맨몸(볼륨 0)
                Self.done(nil, 9), Self.done(nil, 8), Self.done(nil, 7)]),
            GymBlock(exerciseId: "leg_extension", sets: [    // met 4.0
                Self.done(20, 12), Self.done(30, 13), Self.done(40, 10),
                Self.done(45, 9), Self.done(45, 10)]),
            GymBlock(exerciseId: "cust_e66d1133", sets: [    // 커스텀 시티드 레그프레스 met 4.0
                Self.done(45, 15), Self.done(75, 12), Self.done(90, 12),
                Self.done(90, 12), Self.done(90, 11)]),
            GymBlock(exerciseId: "treadmill", sets: [treadmill]),   // met 7.0 · 콘솔 46kcal
        ]
        // endSession 은 finalize **전에** 칼로리를 구하므로 그때 경과는 (now-start) 버림 = 46분.
        s.endTime = start + 2_809_453   // 실측 종료 19:12:17.294
        return s
    }

    func model() -> GymAppModel {
        let m = GymAppModel(snapshotSession: realSession())
        m.custom = [GymCustomExercise(id: "cust_e66d1133", name: "시티드 레그프레스",
                                      part: "legs", equipment: "barbell", met: 4.0)]
        m.weights = [GymWeight(date: "2026-08-25", kg: 74.2, height: 173),
                     GymWeight(date: "2026-08-18", kg: 73.0, height: 173)]
        return m
    }

    /// 영수증에 찍힌 229 가 전 경로에서 그대로 나온다.
    @Test func endToEndMatchesDeviceReceipt() {
        let m = model()
        #expect(m.elapsedMinutes() == 46, "경과는 버림 46분 (실측 46.82분)")
        #expect(m.estimatedCalories() == 229)
    }

    /// 최신 체중을 쓴다 — 74.2 대신 73.0 을 쓰면 값이 달라진다.
    @Test func usesLatestBodyWeight() {
        let m = model()
        m.weights = [GymWeight(date: "2026-08-18", kg: 73.0, height: 173)]
        #expect(m.estimatedCalories() != 229)
    }

    /// 커스텀 종목 MET 이 실제로 조회된다 — met 을 8.0 으로 올리면 총계가 오른다.
    @Test func customExerciseMetIsResolved() {
        let m = model()
        let base = m.estimatedCalories()
        m.custom = [GymCustomExercise(id: "cust_e66d1133", name: "시티드 레그프레스",
                                      part: "legs", equipment: "barbell", met: 8.0)]
        #expect(m.estimatedCalories() > base)
    }
}

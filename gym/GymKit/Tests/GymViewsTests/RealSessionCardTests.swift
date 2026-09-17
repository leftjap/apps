import Foundation
import Testing
import GymCore
@testable import GymViews

// 실기기 기록 → 히스토리 카드 대조.
//
// 시뮬레이터에서 만든 기록이 아니라 **실제로 저장됐던 데이터**로 본다:
//  · 세션 #0070 (2026-08-28, 폰 컨테이너 덤프 — CalorieEndToEndTests 와 같은 원본)
//    근력 6종목(맨몸 hanging_leg_raise · 커스텀 시티드 레그프레스 포함) + 트레드밀이 한 세션에 있다.
//  · 프로덕션 2026-07-09 세션의 blocks jsonb 원형 (RealServerDecodeTests 와 같은 원본)
//    PWA 저장분이라 블록·세트에 id 가 없고, pullover_machine 과 treadmill 이 함께 들어 있다.
//
// 보는 것은 하나다: 그날 그 종목을 했으면 그 칸만 차고, 다른 종목·유산소는 새어 들어오지 않는가.
@MainActor @Suite struct RealSessionCardTests {

    static func done(_ w: Double?, _ r: Int) -> GymSet { GymSet(weight: w, reps: r, done: true, preset: false) }

    /// 실기기 세션 #0070 원본 (완료 상태로 이력에 넣는다).
    static func realSession0070() -> GymSession {
        var s = GymSession(id: "s0070", date: "2026-08-28",
                           startTime: 1_787_995_527_841, status: .completed)
        var treadmill = GymSet(preset: false)
        treadmill.done = true; treadmill.duration = 600; treadmill.distance = 1; treadmill.calories = 46
        s.blocks = [
            GymBlock(exerciseId: "military_press", sets: [
                done(20, 9), done(30, 15), done(40, 13), done(50, 11), done(60, 9), done(60, 10)]),
            GymBlock(exerciseId: "side_lateral", sets: [
                done(8, 12), done(12, 12), done(12, 12), done(16, 8)]),
            GymBlock(exerciseId: "wrist_curl", sets: [done(20, 12), done(20, 13), done(20, 12)]),
            GymBlock(exerciseId: "hanging_leg_raise", sets: [   // 맨몸 — 볼륨 0
                done(nil, 9), done(nil, 8), done(nil, 7)]),
            GymBlock(exerciseId: "leg_extension", sets: [
                done(20, 12), done(30, 13), done(40, 10), done(45, 9), done(45, 10)]),
            GymBlock(exerciseId: "cust_e66d1133", sets: [       // 커스텀 시티드 레그프레스
                done(45, 15), done(75, 12), done(90, 12), done(90, 12), done(90, 11)]),
            GymBlock(exerciseId: "treadmill", sets: [treadmill]),
        ]
        return s
    }

    /// 프로덕션 blocks jsonb 원형 — id 없는 PWA 저장 shape 그대로 디코딩해 쓴다.
    static let realServerBlocksJSON = """
    [{"type":"single","exerciseId":"pullover_machine","finishedAt":1783585000000,
      "sets":[{"pr":false,"done":true,"reps":20,"preset":false,"weight":15},
              {"pr":false,"done":true,"reps":15,"preset":false,"weight":25}]},
     {"type":"single","exerciseId":"treadmill",
      "sets":[{"pr":false,"done":true,"preset":false,"duration":1500,"distance":3.2}]}]
    """

    func model(today: String, history: [GymSession]) -> GymAppModel {
        let m = GymAppModel(snapshotSession: GymSession(id: "empty", date: today))
        m.referenceToday = GymAppModel.dayFmt.date(from: today)!
        m.custom = [GymCustomExercise(id: "cust_e66d1133", name: "시티드 레그프레스",
                                      part: "legs", equipment: "barbell", met: 4.0)]
        m.history = history
        return m
    }

    func days(_ m: GymAppModel, _ ex: String) -> [LiftHistoryDay] {
        let kind = GymCardKind.from(equipment: GymExercises.def(ex, custom: m.custom)?.equipment ?? "barbell")
        let week = GymSessionLogic.liftMetricWeek(history: m.history, todaySets: [],
                                                  exerciseId: ex, kind: kind, now: m.referenceToday)
        return SessionLiftHistoryCard.days(
            week: week,
            thisCells: m.weekCells(around: m.referenceToday),
            prevCells: m.weekCells(around: m.referenceToday, weekOffset: -1),
            refToday: m.referenceToday)
    }
    func filled(_ m: GymAppModel, _ ex: String) -> [String] {
        days(m, ex).filter(\.mark.ran).map(\.iso).sorted()
    }

    // 세션 #0070 의 근력 6종목은 저마다 그날 한 칸만 찬다. 맨몸·커스텀도 같다.
    @Test func everyLiftInTheRealSessionFillsExactlyItsOwnDay() {
        let m = model(today: "2026-08-28", history: [Self.realSession0070()])
        for ex in ["military_press", "side_lateral", "wrist_curl",
                   "hanging_leg_raise", "leg_extension", "cust_e66d1133"] {
            #expect(filled(m, ex) == ["2026-08-28"], "\(ex) 가 제 날짜 한 칸만 채우지 않았다")
        }
    }

    // 같은 세션에 트레드밀이 있어도 근력 카드에는 안 들어온다. 그 세션에 없던 종목은 아예 비어 있다.
    @Test func treadmillAndAbsentExercisesStayOutOfLiftCards() {
        let m = model(today: "2026-08-28", history: [Self.realSession0070()])
        #expect(filled(m, "bench_press").isEmpty, "그날 안 한 종목이 찼다")
        #expect(filled(m, "lat_pulldown").isEmpty)
        // 트레드밀 블록 하나뿐인 날을 더해도 근력 카드는 그대로다.
        var runOnly = GymSession(id: "run", date: "2026-08-27", status: .completed)
        var t = GymSet(preset: false); t.done = true; t.duration = 1800; t.distance = 4
        runOnly.blocks = [GymBlock(exerciseId: "treadmill", sets: [t])]
        let m2 = model(today: "2026-08-28", history: [Self.realSession0070(), runOnly])
        #expect(filled(m2, "military_press") == ["2026-08-28"], "유산소만 한 날이 근력 카드에 찍혔다")
    }

    // id 없는 프로덕션 저장 shape 도 그대로 반영된다 — 디코딩만 되고 카드에서 빠지면 안 된다.
    @Test func realServerShapeWithoutIdsFillsTheCard() throws {
        let blocks = try JSONDecoder().decode([GymBlock].self,
                                              from: Data(Self.realServerBlocksJSON.utf8))
        var s = GymSession(id: "prod-0709", date: "2026-08-26", status: .completed)
        s.blocks = blocks
        let m = model(today: "2026-08-28", history: [s])
        #expect(filled(m, "pullover_machine") == ["2026-08-26"])
        #expect(filled(m, "bench_press").isEmpty)
    }

    // 지난주 행도 같은 규칙이다 — 2026-08-28(금) 기준 지난주는 08-17~08-23.
    @Test func lastWeekRowUsesTheSameRecords() {
        var prev = Self.realSession0070()
        prev.id = "s0069"; prev.date = "2026-08-20"      // 지난주 목
        let m = model(today: "2026-08-28", history: [Self.realSession0070(), prev])
        let d = days(m, "leg_extension")
        #expect(d.filter(\.mark.ran).map(\.iso).sorted() == ["2026-08-20", "2026-08-28"])
        // 지난주 칸은 앞 7개 안에 있어야 한다 (행이 뒤바뀌면 여기서 걸린다).
        #expect(d.prefix(7).contains { $0.iso == "2026-08-20" && $0.mark.ran })
        #expect(d.suffix(7).contains { $0.iso == "2026-08-28" && $0.mark.ran })
    }
}

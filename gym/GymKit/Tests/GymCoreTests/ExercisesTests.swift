import Testing
@testable import GymCore

// 운동 카탈로그 — exercises.js 정합 (41종·7부위·증분·resolver).
@Suite struct ExercisesTests {
    // 부위 칩 순서 — 등·가슴·어깨·하체·팔·코어 + 유산소 (사용자 2026-07-19 요청).
    // 운동 추가 바텀시트(SessionSheets)·관리 화면(AdminScreen)·빌트인 목록이 이 순서를 공유한다.
    @Test func partOrderIsBackChestShoulderLegsArmsCore() {
        #expect(GymExercises.partOrder == ["back", "chest", "shoulder", "legs", "arms", "core", "cardio"])
    }

    @Test func catalogCounts() {
        #expect(GymExercises.builtins.count == 41)
        #expect(GymExercises.partOrder.count == 7)
        #expect(GymExercises.listByPart("chest").count == 6)
        #expect(GymExercises.listByPart("back").count == 10)
        #expect(GymExercises.listByPart("legs").count == 7)
        #expect(GymExercises.listByPart("arms").count == 8)
        #expect(GymExercises.listByPart("cardio").count == 3)
        #expect(GymExercises.listByPart("core").count == 2)
    }

    @Test func incrementByEquipment() {
        #expect(GymExercises.increment(forEquipment: "barbell") == 5)
        #expect(GymExercises.increment(forEquipment: "dumbbell") == 2)
        #expect(GymExercises.increment(forEquipment: "machine") == 5)
        #expect(GymExercises.increment(forEquipment: "cable") == 5)
        #expect(GymExercises.increment(forEquipment: "bodyweight") == 0)
        #expect(GymExercises.increment(forEquipment: "cardio") == 0)
    }

    @Test func wristCurlIncrementOverride() {
        let w = GymExercises.builtin("wrist_curl")!
        #expect(w.equipment == "dumbbell")   // 장비 기본은 2
        #expect(w.weightIncrement == 5)       // 명시 override 5
    }

    @Test func resolvers() {
        #expect(GymExercises.resolveName("bench_press") == "벤치프레스")
        #expect(GymExercises.resolvePart("bench_press") == "chest")
        #expect(GymExercises.increment(forExercise: "bench_press") == 5)
        #expect(GymExercises.resolveName("unknown_xyz") == "unknown_xyz")  // fallback = id
        #expect(GymExercises.builtin("treadmill")!.isCardio == true)
        #expect(GymExercises.partName("chest") == "가슴")
    }

    @Test func customResolve() {
        let c = GymCustomExercise(id: "cust_1", name: "내 운동", part: "arms", equipment: "cable")
        #expect(GymExercises.resolveName("cust_1", custom: [c]) == "내 운동")
        #expect(GymExercises.resolvePart("cust_1", custom: [c]) == "arms")
        #expect(GymExercises.increment(forExercise: "cust_1", custom: [c]) == 5)  // cable=5
    }

    // 커스텀 운동도 장비가 bodyweight 면 빌트인 맨몸 운동과 같은 취급이어야 한다 — 카드 종류와
    // 프리셋 세트 둘 다. 커스텀은 추가 시 장비를 고를 수 없어 전부 barbell 로 저장되는데
    // (createCustomExercise), 그 상태로는 코어 운동이 "0kg × 10회" 로 떴다 (사용자 2026-09-10).
    @Test func customBodyweightExerciseIsRepsOnly() {
        let c = GymCustomExercise(id: "cust_x", name: "디클라인 레그업", part: "core",
                                  equipment: "bodyweight", defaultSets: 3, defaultReps: 10,
                                  defaultWeight: 0)
        let def = GymExercises.def("cust_x", custom: [c])
        #expect(def?.equipment == "bodyweight")
        #expect(GymCardKind.from(equipment: def!.equipment) == .bodyweight)
        #expect(GymExercises.increment(forExercise: "cust_x", custom: [c]) == 0)

        // 프리셋에 중량이 실리면 안 된다 — weight 0 이 기록에 남아 볼륨·표기가 중량 운동처럼 된다.
        let sets = GymSessionLogic.buildPresetSets(def)
        #expect(sets.count == 3)
        #expect(sets.allSatisfy { $0.weight == nil && $0.reps == 10 })
    }
}

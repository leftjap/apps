import Testing
@testable import GymCore

// 운동 카탈로그 — exercises.js 정합 (41종·7부위·증분·resolver).
@Suite struct ExercisesTests {
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
}

import Foundation

// Gym 운동 마스터 데이터 — PWA src/db/exercises.js 1:1 포팅 (spec §11, 작업지시서(3)).
// 정적 카탈로그(코드 배포로 갱신, 마이그레이션 없음). 사용자 추가 운동은 GymCustomExercise (LocalStore).
//
// 부위(part): chest / back / legs / shoulder / arms / core / cardio  (PART_IDS 순서 = 칩 순서)
// 장비(equipment): barbell / dumbbell / machine / cable / bodyweight / cardio
// 중량 증분: equipment 로 결정 (INCREMENT[equipment]), 명시 override 우선 (wrist_curl=5).
// met: 칼로리 추정 (total_kcal = met × 체중 × 시간(시) × 1.05, spec §7-3).

// 운동 정의 1건 (exercises.js BUILTIN 요소 정합).
public struct GymExerciseDef: Codable, Sendable, Identifiable, Hashable {
    public let id: String
    public let name: String
    public let part: String
    public let equipment: String
    public let defaultSets: Int
    public let defaultReps: Int
    public let defaultWeight: Double
    public let met: Double
    public let weightIncrementOverride: Double?   // 장비 기본 override (없으면 nil)

    public init(id: String, name: String, part: String, equipment: String,
                defaultSets: Int, defaultReps: Int, defaultWeight: Double, met: Double,
                weightIncrementOverride: Double? = nil) {
        self.id = id; self.name = name; self.part = part; self.equipment = equipment
        self.defaultSets = defaultSets; self.defaultReps = defaultReps
        self.defaultWeight = defaultWeight; self.met = met
        self.weightIncrementOverride = weightIncrementOverride
    }

    // 실효 중량 증분 — 명시 override 가 있으면 그것, 없으면 장비별 기본 (resolveWeightIncrement 정합).
    public var weightIncrement: Double {
        if let o = weightIncrementOverride, o > 0 { return o }
        return GymExercises.increment(forEquipment: equipment)
    }
    // 중량 입력 종목 여부 (맨몸·유산소 제외).
    public var usesWeight: Bool { weightIncrement > 0 || (equipment != "bodyweight" && equipment != "cardio") }
    public var isCardio: Bool { equipment == "cardio" }
}

public enum GymExercises {
    // 부위 ID 순서 (칩 순서) + 표시명. 등·가슴·어깨·하체·팔·코어 + 유산소 (사용자 2026-07-19).
    // 운동 추가 바텀시트·관리 화면 칩·빌트인 목록이 공유한다.
    public static let partOrder = ["back", "chest", "shoulder", "legs", "arms", "core", "cardio"]
    static let partNameTable: [String: String] = [
        "chest": "가슴", "back": "등", "legs": "하체", "shoulder": "어깨",
        "arms": "팔", "core": "코어", "cardio": "유산소",
    ]
    public static func partName(_ id: String) -> String { partNameTable[id] ?? id }

    // 장비별 증분 (INCREMENT 정합).
    static let incrementTable: [String: Double] = [
        "barbell": 5, "dumbbell": 2, "machine": 5, "cable": 5, "bodyweight": 0, "cardio": 0,
    ]
    public static func increment(forEquipment eq: String) -> Double { incrementTable[eq] ?? 0 }

    // 기본 운동 41종 (exercises.js BUILTIN_EXERCISES 정합, 정의 순서 유지).
    public static let builtins: [GymExerciseDef] = [
        // chest (6)
        .init(id: "bench_press", name: "벤치프레스", part: "chest", equipment: "barbell", defaultSets: 5, defaultReps: 10, defaultWeight: 60, met: 5.0),
        .init(id: "incline_bench", name: "인클라인 벤치", part: "chest", equipment: "barbell", defaultSets: 4, defaultReps: 10, defaultWeight: 45, met: 5.0),
        .init(id: "decline_bench", name: "디클라인 벤치", part: "chest", equipment: "barbell", defaultSets: 4, defaultReps: 10, defaultWeight: 50, met: 5.0),
        .init(id: "dumbbell_fly", name: "덤벨 플라이", part: "chest", equipment: "dumbbell", defaultSets: 3, defaultReps: 12, defaultWeight: 18, met: 4.5),
        .init(id: "cable_crossover", name: "케이블 크로스오버", part: "chest", equipment: "cable", defaultSets: 3, defaultReps: 12, defaultWeight: 20, met: 4.0),
        .init(id: "push_up", name: "푸시업", part: "chest", equipment: "bodyweight", defaultSets: 3, defaultReps: 15, defaultWeight: 0, met: 3.8),
        // back (10)
        .init(id: "deadlift", name: "데드리프트", part: "back", equipment: "barbell", defaultSets: 4, defaultReps: 8, defaultWeight: 90, met: 6.0),
        .init(id: "romanian_deadlift", name: "루마니안 데드리프트", part: "back", equipment: "barbell", defaultSets: 4, defaultReps: 10, defaultWeight: 70, met: 6.0),
        .init(id: "barbell_row", name: "바벨 로우", part: "back", equipment: "barbell", defaultSets: 5, defaultReps: 10, defaultWeight: 55, met: 5.0),
        .init(id: "dumbbell_row", name: "덤벨 로우", part: "back", equipment: "dumbbell", defaultSets: 4, defaultReps: 10, defaultWeight: 22, met: 4.5),
        .init(id: "seated_row", name: "시티드 로우", part: "back", equipment: "machine", defaultSets: 4, defaultReps: 10, defaultWeight: 50, met: 4.5),
        .init(id: "cable_row", name: "케이블 로우", part: "back", equipment: "cable", defaultSets: 4, defaultReps: 10, defaultWeight: 45, met: 4.5),
        .init(id: "t_bar_row", name: "티바 로우", part: "back", equipment: "barbell", defaultSets: 4, defaultReps: 10, defaultWeight: 40, met: 5.0),
        .init(id: "pull_up", name: "풀업", part: "back", equipment: "bodyweight", defaultSets: 3, defaultReps: 8, defaultWeight: 0, met: 6.0),
        .init(id: "chin_up", name: "친업", part: "back", equipment: "bodyweight", defaultSets: 3, defaultReps: 8, defaultWeight: 0, met: 6.0),
        .init(id: "lat_pulldown", name: "랫 풀다운", part: "back", equipment: "cable", defaultSets: 4, defaultReps: 10, defaultWeight: 50, met: 4.5),
        // shoulder (5)
        .init(id: "shoulder_press", name: "숄더 프레스", part: "shoulder", equipment: "barbell", defaultSets: 4, defaultReps: 10, defaultWeight: 30, met: 4.5),
        .init(id: "military_press", name: "밀리터리 프레스", part: "shoulder", equipment: "barbell", defaultSets: 4, defaultReps: 8, defaultWeight: 35, met: 4.5),
        .init(id: "side_lateral", name: "사이드 레터럴", part: "shoulder", equipment: "dumbbell", defaultSets: 3, defaultReps: 12, defaultWeight: 8, met: 3.5),
        .init(id: "front_raise", name: "프론트 레이즈", part: "shoulder", equipment: "dumbbell", defaultSets: 3, defaultReps: 12, defaultWeight: 8, met: 3.5),
        .init(id: "rear_lateral", name: "리어 레터럴", part: "shoulder", equipment: "dumbbell", defaultSets: 3, defaultReps: 12, defaultWeight: 8, met: 3.5),
        // legs (7)
        .init(id: "squat", name: "스쿼트", part: "legs", equipment: "barbell", defaultSets: 5, defaultReps: 10, defaultWeight: 70, met: 5.5),
        .init(id: "lunge", name: "런지", part: "legs", equipment: "dumbbell", defaultSets: 3, defaultReps: 12, defaultWeight: 14, met: 5.0),
        .init(id: "leg_press", name: "레그 프레스", part: "legs", equipment: "machine", defaultSets: 4, defaultReps: 10, defaultWeight: 100, met: 5.0),
        .init(id: "hip_thrust", name: "힙 쓰러스트", part: "legs", equipment: "barbell", defaultSets: 4, defaultReps: 10, defaultWeight: 60, met: 5.0),
        .init(id: "leg_extension", name: "레그 익스텐션", part: "legs", equipment: "machine", defaultSets: 3, defaultReps: 12, defaultWeight: 35, met: 4.0),
        .init(id: "leg_curl", name: "레그 컬", part: "legs", equipment: "machine", defaultSets: 3, defaultReps: 12, defaultWeight: 30, met: 4.0),
        .init(id: "calf_raise", name: "카프 레이즈", part: "legs", equipment: "machine", defaultSets: 4, defaultReps: 15, defaultWeight: 50, met: 3.5),
        // arms (8)
        .init(id: "bicep_curl", name: "바벨 컬", part: "arms", equipment: "barbell", defaultSets: 4, defaultReps: 10, defaultWeight: 25, met: 3.5),
        .init(id: "hammer_curl", name: "해머 컬", part: "arms", equipment: "dumbbell", defaultSets: 3, defaultReps: 12, defaultWeight: 14, met: 3.5),
        .init(id: "dumbbell_curl", name: "덤벨 컬", part: "arms", equipment: "dumbbell", defaultSets: 4, defaultReps: 10, defaultWeight: 16, met: 3.5),
        .init(id: "cable_curl", name: "케이블 컬", part: "arms", equipment: "cable", defaultSets: 3, defaultReps: 12, defaultWeight: 25, met: 3.5),
        .init(id: "tricep_extension", name: "트라이셉 익스텐션", part: "arms", equipment: "dumbbell", defaultSets: 3, defaultReps: 12, defaultWeight: 12, met: 3.5),
        .init(id: "tricep_pushdown", name: "트라이셉 푸시다운", part: "arms", equipment: "cable", defaultSets: 4, defaultReps: 12, defaultWeight: 25, met: 3.5),
        .init(id: "dips", name: "딥스", part: "arms", equipment: "bodyweight", defaultSets: 3, defaultReps: 10, defaultWeight: 0, met: 5.0),
        .init(id: "wrist_curl", name: "리스트 컬", part: "arms", equipment: "dumbbell", defaultSets: 3, defaultReps: 15, defaultWeight: 5, met: 3.0, weightIncrementOverride: 5),
        // cardio (3)
        .init(id: "treadmill", name: "트레드밀", part: "cardio", equipment: "cardio", defaultSets: 1, defaultReps: 0, defaultWeight: 0, met: 7.0),
        .init(id: "cycle", name: "사이클", part: "cardio", equipment: "cardio", defaultSets: 1, defaultReps: 0, defaultWeight: 0, met: 6.5),
        .init(id: "elliptical", name: "엘립티컬", part: "cardio", equipment: "cardio", defaultSets: 1, defaultReps: 0, defaultWeight: 0, met: 5.0),
        // core (2)
        .init(id: "hanging_leg_raise", name: "행잉 레그 레이즈", part: "core", equipment: "bodyweight", defaultSets: 3, defaultReps: 12, defaultWeight: 0, met: 4.0),
        .init(id: "decline_situp", name: "디클라인 싯업", part: "core", equipment: "bodyweight", defaultSets: 3, defaultReps: 15, defaultWeight: 0, met: 4.0),
    ]

    static let builtinIndex: [String: GymExerciseDef] = Dictionary(uniqueKeysWithValues: builtins.map { ($0.id, $0) })

    // 빌트인 운동 조회 (getBuiltinExercise 정합).
    public static func builtin(_ id: String) -> GymExerciseDef? { builtinIndex[id] }

    // 부위별 빌트인 (정의 순서 유지, listBuiltinByPart 정합).
    public static func listByPart(_ part: String) -> [GymExerciseDef] { builtins.filter { $0.part == part } }

    // 운동 id → 표시명. builtin → 커스텀 → id fallback (resolveExerciseName 정합, 동기).
    public static func resolveName(_ id: String, custom: [GymCustomExercise] = []) -> String {
        if id.isEmpty { return "" }
        if let b = builtinIndex[id] { return b.name }
        if let c = custom.first(where: { $0.id == id }) { return c.name }
        return id
    }

    // 운동 id → 부위 ID. builtin → 커스텀 → 빈 문자열.
    public static func resolvePart(_ id: String, custom: [GymCustomExercise] = []) -> String {
        if let b = builtinIndex[id] { return b.part }
        if let c = custom.first(where: { $0.id == id }) { return c.part }
        return ""
    }

    // 운동 id → 실효 중량 증분. builtin(override 포함) → 커스텀(장비별) → 0.
    public static func increment(forExercise id: String, custom: [GymCustomExercise] = []) -> Double {
        if let b = builtinIndex[id] { return b.weightIncrement }
        if let c = custom.first(where: { $0.id == id }) { return increment(forEquipment: c.equipment) }
        return 0
    }

    // 운동 id → 정의 (builtin 우선, 커스텀은 GymExerciseDef 로 승격).
    public static func def(_ id: String, custom: [GymCustomExercise] = []) -> GymExerciseDef? {
        if let b = builtinIndex[id] { return b }
        if let c = custom.first(where: { $0.id == id }) {
            return GymExerciseDef(id: c.id, name: c.name, part: c.part, equipment: c.equipment,
                                  defaultSets: c.defaultSets, defaultReps: c.defaultReps,
                                  defaultWeight: c.defaultWeight, met: c.met)
        }
        return nil
    }
}

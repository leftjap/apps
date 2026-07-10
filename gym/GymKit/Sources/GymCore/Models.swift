import Foundation

// Gym 데이터 모델 — PWA Dexie schema.js + Supabase 0001_gym_init.sql 1:1 매핑.
// 로컬 정본(개인 앱) + 클라우드 동기화. 필드명은 Swift 관용(camelCase), 인코딩은 다음 증분 CloudStore 에서 매핑.

// 세트 1개 — { weight: Double?, reps: Int?, done: Bool } (session.js sets).
// cardio/bodyweight 는 weight/reps 가 nil 가능.
public struct GymSet: Codable, Sendable, Identifiable, Hashable {
    public var id: UUID
    public var weight: Double?
    public var reps: Int?
    public var done: Bool
    public var pr: Bool          // 이 세트가 역대 e1RM 신기록이면 true (spec §12, §6-11)
    public var preset: Bool      // 프리셋(미수정 placeholder) 여부 — 사용자 입력/완료 시 false (spec §6-3-3)
    public var duration: Double? // 유산소 — 초 단위 (표시·입력은 분, spec §6-4)
    public var distance: Double? // 유산소 — km

    public init(id: UUID = UUID(), weight: Double? = nil, reps: Int? = nil, done: Bool = false,
                pr: Bool = false, preset: Bool = false, duration: Double? = nil, distance: Double? = nil) {
        self.id = id
        self.weight = weight
        self.reps = reps
        self.done = done
        self.pr = pr
        self.preset = preset
        self.duration = duration
        self.distance = distance
    }

    // 구 데이터(pr·preset·duration·distance 키 없음) 관용 디코딩 — 온디바이스 진행 세션 파손 방지.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(UUID.self, forKey: .id) ?? UUID()
        weight = try c.decodeIfPresent(Double.self, forKey: .weight)
        reps = try c.decodeIfPresent(Int.self, forKey: .reps)
        done = try c.decodeIfPresent(Bool.self, forKey: .done) ?? false
        pr = try c.decodeIfPresent(Bool.self, forKey: .pr) ?? false
        preset = try c.decodeIfPresent(Bool.self, forKey: .preset) ?? false
        duration = try c.decodeIfPresent(Double.self, forKey: .duration)
        distance = try c.decodeIfPresent(Double.self, forKey: .distance)
    }

    // 세트 볼륨 = 중량 × 횟수 (nil 방어).
    public var volume: Double { Double(weight ?? 0) * Double(reps ?? 0) }
}

// 블록 — 현재 single 만 (circuit 폐기, spec §16). { type:'single', exerciseId, sets }.
public struct GymBlock: Codable, Sendable, Identifiable, Hashable {
    public var id: UUID
    public var type: String        // "single"
    public var exerciseId: String
    public var sets: [GymSet]
    public var finishedAt: Double?  // ms epoch — 완료 정렬용(footer done 순서)

    public init(id: UUID = UUID(), type: String = "single", exerciseId: String,
                sets: [GymSet] = [], finishedAt: Double? = nil) {
        self.id = id
        self.type = type
        self.exerciseId = exerciseId
        self.sets = sets
        self.finishedAt = finishedAt
    }
}

public enum GymSessionStatus: String, Codable, Sendable {
    case active, paused, completed
}

// 운동 세션 — gym_sessions.
public struct GymSession: Codable, Sendable, Identifiable {
    public var id: String
    public var date: String            // yyyy-MM-dd (KST 실발생일)
    public var startTime: Int64?       // ms epoch
    public var endTime: Int64?
    public var blocks: [GymBlock]
    public var tags: [String]
    public var totalVolume: Double
    public var totalCalories: Int
    public var durationMin: Int
    public var status: GymSessionStatus

    public init(id: String, date: String, startTime: Int64? = nil, endTime: Int64? = nil,
                blocks: [GymBlock] = [], tags: [String] = [], totalVolume: Double = 0,
                totalCalories: Int = 0, durationMin: Int = 0, status: GymSessionStatus = .active) {
        self.id = id
        self.date = date
        self.startTime = startTime
        self.endTime = endTime
        self.blocks = blocks
        self.tags = tags
        self.totalVolume = totalVolume
        self.totalCalories = totalCalories
        self.durationMin = durationMin
        self.status = status
    }
}

// 개인 기록 — gym_prs. type: e1rm/weight/reps/volume.
public enum GymPRType: String, Codable, Sendable {
    case e1rm, weight, reps, volume
}
public struct GymPR: Codable, Sendable, Identifiable {
    public var exerciseId: String
    public var type: GymPRType      // 기본 e1rm
    public var weight: Double
    public var reps: Int
    public var e1rm: Double
    public var date: String
    public var sessionId: String?
    // gym_prs PK = exerciseId + '_' + type (pr.js buildPR / queries.upsertPR 정합).
    public var id: String { "\(exerciseId)_\(type.rawValue)" }
    public init(exerciseId: String, type: GymPRType = .e1rm, weight: Double, reps: Int,
                e1rm: Double, date: String, sessionId: String? = nil) {
        self.exerciseId = exerciseId; self.type = type; self.weight = weight; self.reps = reps
        self.e1rm = e1rm; self.date = date; self.sessionId = sessionId
    }
}

// 체중 로그 — weights (date PK, 하루 1건). height 는 1회 설정 후 고정(spec §12).
public struct GymWeight: Codable, Sendable, Identifiable {
    public var date: String
    public var kg: Double
    public var height: Int?      // Optional → 구 데이터(height 키 없음) 자연 관용
    public var id: String { date }
    public init(date: String, kg: Double, height: Int? = nil) {
        self.date = date; self.kg = kg; self.height = height
    }
}

// 커스텀 운동 — customExercises (spec §10-1, gym_custom_exercises). 장비·기본값·met 포함.
public struct GymCustomExercise: Codable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var part: String
    public var equipment: String
    public var defaultSets: Int
    public var defaultReps: Int
    public var defaultWeight: Double
    public var met: Double
    public init(id: String, name: String, part: String, equipment: String = "barbell",
                defaultSets: Int = 4, defaultReps: Int = 10, defaultWeight: Double = 20, met: Double = 4.0) {
        self.id = id; self.name = name; self.part = part; self.equipment = equipment
        self.defaultSets = defaultSets; self.defaultReps = defaultReps
        self.defaultWeight = defaultWeight; self.met = met
    }
    // 구 데이터(equipment 등 없음) 관용 디코딩.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? id
        part = try c.decodeIfPresent(String.self, forKey: .part) ?? "chest"
        equipment = try c.decodeIfPresent(String.self, forKey: .equipment) ?? "barbell"
        defaultSets = try c.decodeIfPresent(Int.self, forKey: .defaultSets) ?? 4
        defaultReps = try c.decodeIfPresent(Int.self, forKey: .defaultReps) ?? 10
        defaultWeight = try c.decodeIfPresent(Double.self, forKey: .defaultWeight) ?? 20
        met = try c.decodeIfPresent(Double.self, forKey: .met) ?? 4.0
    }
}

// 사용자 설정 — gym_user_settings (spec §12). 단일 레코드.
public struct GymUserSettings: Codable, Sendable {
    public var weeklyGoal: Int
    public var height: Int?
    public var birthYear: Int?
    public var goalWeight: Double
    public var hiddenExercises: [String]      // 숨김(임시 비활성)
    public var deletedExercises: [String]     // 빌트인 영속 삭제 (spec §10-1)
    public var exerciseOrder: [String: [String]]        // 부위별 정렬
    public var exercisePartOverride: [String: String]   // 운동 부위 변경
    public var updatedAt: Double              // ms epoch — 설정 LWW 병합용 (sync.js 정합)
    public init(weeklyGoal: Int = 4, height: Int? = nil, birthYear: Int? = nil, goalWeight: Double = 69,
                hiddenExercises: [String] = [], deletedExercises: [String] = [],
                exerciseOrder: [String: [String]] = [:], exercisePartOverride: [String: String] = [:],
                updatedAt: Double = 0) {
        self.weeklyGoal = weeklyGoal; self.height = height; self.birthYear = birthYear
        self.goalWeight = goalWeight; self.hiddenExercises = hiddenExercises
        self.deletedExercises = deletedExercises; self.exerciseOrder = exerciseOrder
        self.exercisePartOverride = exercisePartOverride; self.updatedAt = updatedAt
    }
    // 구 데이터 관용 디코딩 — 필드 추가 시 파손 방지.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        weeklyGoal = try c.decodeIfPresent(Int.self, forKey: .weeklyGoal) ?? 4
        height = try c.decodeIfPresent(Int.self, forKey: .height)
        birthYear = try c.decodeIfPresent(Int.self, forKey: .birthYear)
        goalWeight = try c.decodeIfPresent(Double.self, forKey: .goalWeight) ?? 69
        hiddenExercises = try c.decodeIfPresent([String].self, forKey: .hiddenExercises) ?? []
        deletedExercises = try c.decodeIfPresent([String].self, forKey: .deletedExercises) ?? []
        exerciseOrder = try c.decodeIfPresent([String: [String]].self, forKey: .exerciseOrder) ?? [:]
        exercisePartOverride = try c.decodeIfPresent([String: String].self, forKey: .exercisePartOverride) ?? [:]
        updatedAt = try c.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0
    }
}

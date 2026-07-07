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

    public init(id: UUID = UUID(), weight: Double? = nil, reps: Int? = nil, done: Bool = false) {
        self.id = id
        self.weight = weight
        self.reps = reps
        self.done = done
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
    public var id: String
    public var exerciseId: String
    public var type: GymPRType
    public var value: Double
    public var date: String
    public init(id: String, exerciseId: String, type: GymPRType, value: Double, date: String) {
        self.id = id; self.exerciseId = exerciseId; self.type = type; self.value = value; self.date = date
    }
}

// 체중 로그 — weights (date PK, 하루 1건).
public struct GymWeight: Codable, Sendable, Identifiable {
    public var date: String
    public var kg: Double
    public var id: String { date }
    public init(date: String, kg: Double) { self.date = date; self.kg = kg }
}

// 커스텀 운동 — customExercises (spec §10-1).
public struct GymCustomExercise: Codable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var part: String
    public init(id: String, name: String, part: String) {
        self.id = id; self.name = name; self.part = part
    }
}

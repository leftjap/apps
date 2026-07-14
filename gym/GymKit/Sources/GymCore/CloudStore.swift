import Foundation
import Supabase

// Gym ↔ 공유 Supabase 배선 (ReadingTime CloudStore 패턴). gym_sessions/gym_prs/gym_weights.
// 로컬(개인 앱) 정본 + 클라우드 동기화·백업·멀티디바이스.
//
// [검증] 공식 API: SupabaseClient(supabaseURL:supabaseKey:), auth.signInWithOAuth(provider:redirectTo:),
//   auth.user(), from().upsert(_:onConflict:).execute(), from().select().eq().execute().value.
// [부분확인] Google OAuth 는 generic web-OAuth(ASWebAuthenticationSession) 경로 — 추가 패키지 없음.
// [미검증] 실 OAuth·upsert·fetch 런타임은 실기기/시뮬 네트워크 필요 — 컴파일까지만 검증.
@MainActor
public final class CloudStore: ObservableObject {
    public init() {}

    @Published public private(set) var signedIn = false
    @Published public private(set) var userEmail: String?   // 프로필 동기화 카드 표시용 (profile.js sync-user)

    private let client = SupabaseClient(supabaseURL: Config.supabaseURL, supabaseKey: Config.supabaseAnonKey)
    private var ownerID: UUID?

    // 허용 이메일 화이트리스트 (spec §3 — auth.js ALLOWED_EMAILS 정합).
    public static let allowedEmails = ["leftjap@gmail.com", "soyoun312@gmail.com"]
    public nonisolated static func isAllowedEmail(_ email: String?) -> Bool {
        guard let e = email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !e.isEmpty else { return false }
        return allowedEmails.contains(e)
    }
    public enum AuthError: Error { case emailNotAllowed }

    // KST 실발생일 (study UTC 드리프트 회피)
    static let dayFmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    // 기존 세션 복원 (재로그인 불필요) — 화이트리스트 외 계정은 즉시 로그아웃 (spec §3).
    public func restore() async {
        if let user = try? await client.auth.user() {
            guard Self.isAllowedEmail(user.email) else { await signOut(); return }
            ownerID = user.id; signedIn = true; userEmail = user.email
        }
    }

    // prompt=select_account — Safari 의 기존 구글 세션을 그대로 쓰면 계정 선택 없이 즉시
    // 통과해(허용 계정이 2개: leftjap·soyoun) 어느 계정으로 로그인되는지 고를 수 없다.
    static let googleOAuthParams: [(name: String, value: String?)] = [(name: "prompt", value: "select_account")]

    public func signInWithGoogle() async throws {
        let session = try await client.auth.signInWithOAuth(
            provider: .google, redirectTo: Config.oauthRedirect, queryParams: Self.googleOAuthParams)
        guard Self.isAllowedEmail(session.user.email) else {
            await signOut()
            throw AuthError.emailNotAllowed
        }
        ownerID = session.user.id; signedIn = true; userEmail = session.user.email
    }

    /// 검증용 — 실제 OAuth 창을 띄우지 않고, 로그인 시 만들어질 URL 을 그대로 생성.
    /// signInWithGoogle 과 **같은 파라미터**를 쓰므로 테스트가 실제 동작에서 어긋날 수 없다.
    public func googleSignInURL() throws -> URL {
        try client.auth.getOAuthSignInURL(provider: .google, redirectTo: Config.oauthRedirect,
                                          queryParams: Self.googleOAuthParams)
    }

    public func signOut() async {
        try? await client.auth.signOut(); ownerID = nil; signedIn = false; userEmail = nil
    }

    // 검증 훅 — 발급된 세션 토큰 직접 주입 (실기기 E2E: OAuth 웹플로우 없이 실계정 sync 검증).
    // SDK 가 세션을 영속하므로 이후 실행은 restore() 로 로그인 유지. 화이트리스트 가드 동일 적용.
    public func setSession(accessToken: String, refreshToken: String) async {
        guard let session = try? await client.auth.setSession(accessToken: accessToken,
                                                              refreshToken: refreshToken) else { return }
        guard Self.isAllowedEmail(session.user.email) else { await signOut(); return }
        ownerID = session.user.id; signedIn = true; userEmail = session.user.email
    }

    // push/pull 일시 실패 자동 재시도 — spec §4 "5초, 15초, 45초" (sync.js withRetry 정합).
    static let retryDelaysSec: [UInt64] = [5, 15, 45]
    func withRetry<T>(_ op: () async throws -> T) async throws -> T {
        var lastError: Error?
        for (i, delay) in ([0] + Self.retryDelaysSec).enumerated() {
            if delay > 0 { try? await Task.sleep(nanoseconds: delay * 1_000_000_000) }
            do { return try await op() }
            catch {
                lastError = error
                if i == Self.retryDelaysSec.count { break }
            }
        }
        throw lastError ?? URLError(.unknown)
    }

    // MARK: - sessions

    // 세션 upsert (id PK, owner 격리 RLS)
    public func upsertSession(_ s: GymSession) async throws {
        guard let owner = ownerID else { return }
        try await withRetry {
            try await client.from("gym_sessions").upsert(SessionRow(from: s, owner: owner), onConflict: "id").execute()
        }
    }
    public func upsertSessions(_ xs: [GymSession]) async throws {
        guard let owner = ownerID, !xs.isEmpty else { return }
        // 마지막 방어선 — 같은 id 가 배치에 두 번 있으면 Postgres 가 upsert 를 통째로 거부한다
        // (21000: ON CONFLICT DO UPDATE cannot affect row a second time) → 동기화 영구 실패.
        var seen = Set<String>()
        let rows = xs.filter { seen.insert($0.id).inserted }.map { SessionRow(from: $0, owner: owner) }
        try await withRetry {
            try await client.from("gym_sessions").upsert(rows, onConflict: "id").execute()
        }
    }
    // 세션 삭제 (owner 격리 RLS). 로컬 삭제를 서버로 전파 — 안 하면 다음 sync 의
    // mergeSessions(id-union) 가 서버 잔존 행을 되살린다 (2026-07-14 부활 회귀).
    public func deleteSessions(ids: [String]) async throws {
        guard let owner = ownerID, !ids.isEmpty else { return }
        try await withRetry {
            try await client.from("gym_sessions")
                .delete().eq("user_id", value: owner.uuidString).in("id", values: ids).execute()
        }
    }
    // 내 세션 조회 (RLS owner-only)
    public func fetchSessions() async throws -> [GymSession] {
        try await withRetry {
            let rows: [SessionRow] = try await client.from("gym_sessions")
                .select("id,date,status,start_time,end_time,blocks,tags,total_volume,total_calories,duration_min")
                .order("date", ascending: false).execute().value
            return rows.map { $0.toModel() }
        }
    }

    // MARK: - prs

    public func upsertPRs(_ xs: [GymPR]) async throws {
        guard let owner = ownerID, !xs.isEmpty else { return }
        let rows = xs.map { PRRow(from: $0, owner: owner) }
        try await withRetry {
            try await client.from("gym_prs").upsert(rows, onConflict: "id").execute()
        }
    }
    public func fetchPRs() async throws -> [GymPR] {
        try await withRetry {
            let rows: [PRRow] = try await client.from("gym_prs")
                .select("id,exercise_id,type,weight,reps,e1rm,date,session_id").execute().value
            return rows.map { $0.toModel() }
        }
    }

    // MARK: - weights (0002 마이그레이션 컬럼: user_id/date/weight/height)

    public func upsertWeights(_ xs: [GymWeight]) async throws {
        guard let owner = ownerID, !xs.isEmpty else { return }
        let rows = xs.map { WeightRow(from: $0, owner: owner) }
        try await withRetry {
            try await client.from("gym_weights").upsert(rows, onConflict: "user_id,date").execute()
        }
    }
    public func fetchWeights() async throws -> [GymWeight] {
        try await withRetry {
            let rows: [WeightRow] = try await client.from("gym_weights")
                .select("date,weight,height").order("date", ascending: false).execute().value
            return rows.map { $0.toModel() }
        }
    }

    // MARK: - custom exercises

    public func upsertCustomExercises(_ xs: [GymCustomExercise]) async throws {
        guard let owner = ownerID, !xs.isEmpty else { return }
        let rows = xs.map { CustomExerciseRow(from: $0, owner: owner) }
        try await withRetry {
            try await client.from("gym_custom_exercises").upsert(rows, onConflict: "id").execute()
        }
    }
    public func fetchCustomExercises() async throws -> [GymCustomExercise] {
        try await withRetry {
            let rows: [CustomExerciseRow] = try await client.from("gym_custom_exercises")
                .select("id,name,part,equipment,default_sets,default_reps,default_weight,met").execute().value
            return rows.map { $0.toModel() }
        }
    }

    // MARK: - settings (user_id PK 단일 row, settings jsonb — updatedAt 은 jsonb 동행 LWW)

    public func upsertSettings(_ s: GymUserSettings) async throws {
        guard let owner = ownerID else { return }
        try await withRetry {
            try await client.from("gym_user_settings")
                .upsert(SettingsRow(from: s, owner: owner), onConflict: "user_id").execute()
        }
    }
    public func fetchSettings() async throws -> GymUserSettings? {
        try await withRetry {
            let rows: [SettingsRow] = try await client.from("gym_user_settings")
                .select("user_id,settings").execute().value
            return rows.first?.settings
        }
    }
}

// gym_sessions row (Supabase 컬럼명 snake_case ↔ 모델 매핑). blocks 는 jsonb → [GymBlock].
struct SessionRow: Codable {
    let id: String
    let user_id: String?
    let date: String
    let status: String
    let start_time: Int64?
    let end_time: Int64?
    let blocks: [GymBlock]
    let tags: [String]
    let total_volume: Double
    let total_calories: Int
    let duration_min: Int

    init(from s: GymSession, owner: UUID) {
        id = s.id; user_id = owner.uuidString; date = s.date; status = s.status.rawValue
        start_time = s.startTime; end_time = s.endTime; blocks = s.blocks; tags = s.tags
        total_volume = s.totalVolume; total_calories = s.totalCalories; duration_min = s.durationMin
    }
    func toModel() -> GymSession {
        GymSession(id: id, date: date, startTime: start_time, endTime: end_time, blocks: blocks,
                   tags: tags, totalVolume: total_volume, totalCalories: total_calories,
                   durationMin: duration_min, status: GymSessionStatus(rawValue: status) ?? .completed)
    }
}

// gym_prs row — PK = `<exerciseId>_<type>` 합성 (sync.js toSupabasePR 정합).
struct PRRow: Codable {
    let id: String
    let user_id: String?
    let exercise_id: String
    let type: String
    let weight: Double
    let reps: Int
    let e1rm: Double
    let date: String?
    let session_id: String?

    init(from p: GymPR, owner: UUID) {
        id = p.id; user_id = owner.uuidString; exercise_id = p.exerciseId; type = p.type.rawValue
        weight = p.weight; reps = p.reps; e1rm = p.e1rm; date = p.date; session_id = p.sessionId
    }
    func toModel() -> GymPR {
        GymPR(exerciseId: exercise_id, type: GymPRType(rawValue: type) ?? .e1rm,
              weight: weight, reps: reps, e1rm: e1rm, date: date ?? "", sessionId: session_id)
    }
}

// gym_weights row — 0002 마이그레이션 컬럼 (user_id/date/weight/height).
struct WeightRow: Codable {
    let user_id: String?
    let date: String
    let weight: Double
    let height: Int?

    init(from w: GymWeight, owner: UUID) {
        user_id = owner.uuidString; date = w.date; weight = w.kg; height = w.height
    }
    func toModel() -> GymWeight { GymWeight(date: date, kg: weight, height: height) }
}

// gym_custom_exercises row.
struct CustomExerciseRow: Codable {
    let id: String
    let user_id: String?
    let name: String
    let part: String
    let equipment: String
    let default_sets: Int
    let default_reps: Int
    let default_weight: Double
    let met: Double

    init(from c: GymCustomExercise, owner: UUID) {
        id = c.id; user_id = owner.uuidString; name = c.name; part = c.part; equipment = c.equipment
        default_sets = c.defaultSets; default_reps = c.defaultReps; default_weight = c.defaultWeight; met = c.met
    }
    func toModel() -> GymCustomExercise {
        GymCustomExercise(id: id, name: name, part: part, equipment: equipment,
                          defaultSets: default_sets, defaultReps: default_reps,
                          defaultWeight: default_weight, met: met)
    }
}

// gym_user_settings row — settings jsonb (updatedAt 은 jsonb 안에 동행, LWW 클럭 일관).
struct SettingsRow: Codable {
    let user_id: String?
    let settings: GymUserSettings

    init(from s: GymUserSettings, owner: UUID) {
        user_id = owner.uuidString; settings = s
    }
}

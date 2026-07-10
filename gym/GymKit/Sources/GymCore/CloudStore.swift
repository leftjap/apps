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
            ownerID = user.id; signedIn = true
        }
    }

    public func signInWithGoogle() async throws {
        let session = try await client.auth.signInWithOAuth(provider: .google, redirectTo: Config.oauthRedirect)
        guard Self.isAllowedEmail(session.user.email) else {
            await signOut()
            throw AuthError.emailNotAllowed
        }
        ownerID = session.user.id; signedIn = true
    }

    public func signOut() async {
        try? await client.auth.signOut(); ownerID = nil; signedIn = false
    }

    // 세션 upsert (id PK, owner 격리 RLS)
    public func upsertSession(_ s: GymSession) async throws {
        guard let owner = ownerID else { return }
        try await client.from("gym_sessions").upsert(SessionRow(from: s, owner: owner), onConflict: "id").execute()
    }

    // 내 세션 조회 (RLS owner-only)
    public func fetchSessions() async throws -> [GymSession] {
        let rows: [SessionRow] = try await client.from("gym_sessions")
            .select("id,date,status,start_time,end_time,blocks,tags,total_volume,total_calories,duration_min")
            .order("date", ascending: false).execute().value
        return rows.map { $0.toModel() }
    }

    public func upsertWeight(_ w: GymWeight, on date: Date) async throws {
        guard let owner = ownerID else { return }
        try await client.from("gym_weights")
            .upsert(WeightRow(owner_id: owner.uuidString, day: w.date, kg: w.kg), onConflict: "owner_id,day").execute()
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

struct WeightRow: Encodable { let owner_id: String; let day: String; let kg: Double }

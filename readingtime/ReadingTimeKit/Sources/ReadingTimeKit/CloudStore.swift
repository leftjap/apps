import Foundation
import Supabase

// v8 데이터 모델 Session.method 중 종이책 기록으로 앱이 쓰는 값 (millie 는 읽기 전용 — 앱이 쓰지 않음)
public enum SessionSource: String, Sendable {
    case flip, tap, manual
}

// 리딩타임 ↔ 공유 Supabase 배선.
// 종이책: readingtime_daily 에 쓰기/읽기. 전자책(밀리): book_reading_seconds 읽기 전용.
// 통합은 여기서(두 테이블 fetch) 합쳐 반환 — DB에선 안 섞음(종이가 '밀리'로 오라벨되는 것 방지).
//
// [검증] 공식 문서 확인: SupabaseClient(supabaseURL:supabaseKey:), from().upsert(_:onConflict:).execute(),
//   from().select().eq(_:value:).execute().value, auth.user()(현재 User·UUID), Provider.google 케이스.
// [부분확인] signInWithOAuth 는 형태(provider·redirectTo)만 문서 확인. Google은 docs가 native(GoogleSignIn-iOS
//   + signInWithIdToken)를 권장하나, 여기선 의존성 최소화를 위해 generic web-OAuth 경로를 택함(유효하나 비권장 경로).
// [미검증] Xcode 빌드로 컴파일 검증 못 함(환경에 Xcode 없음) → 실기기 빌드로 확인 필요.
@MainActor
public final class CloudStore: ObservableObject {
    public init() {}

    @Published public private(set) var signedIn = false

    private let client = SupabaseClient(supabaseURL: Config.supabaseURL, supabaseKey: Config.supabaseAnonKey)
    private var ownerID: UUID?

    // KST 실발생일 기준 day 키 (study UTC 드리프트 회피)
    private let dayFmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    // 기존 세션 복원 (이미 로그인했으면 재로그인 불필요). 문서 확인: auth.user() → 현재 User.
    public func restore() async {
        if let user = try? await client.auth.user() {
            ownerID = user.id
            signedIn = true
        }
    }

    // Google 로그인 → owner_id = auth.uid().
    // generic web-OAuth(ASWebAuthenticationSession) 경로 — 추가 패키지 불필요.
    // (docs의 Google 권장은 native GoogleSignIn-iOS + signInWithIdToken. 의존성 커서 web-OAuth 채택.)
    public func signInWithGoogle() async throws {
        let session = try await client.auth.signInWithOAuth(provider: .google, redirectTo: Config.oauthRedirect)
        ownerID = session.user.id
        signedIn = true
    }

    // 종이책 세션 종료 시 오늘치에 delta 초를 더해 upsert (read-modify-write; 단일 사용자라 경쟁 무시)
    public func addPaperSeconds(_ delta: Int, source: SessionSource, on date: Date) async throws {
        guard let owner = ownerID, delta > 0 else { return }
        let day = dayFmt.string(from: date)
        let src = source.rawValue
        let current = try await paperSeconds(owner: owner, day: day, source: src)
        let row = PaperDailyRow(owner_id: owner.uuidString, day: day, seconds: current + delta, source: src)
        try await client.from("readingtime_daily")
            .upsert(row, onConflict: "owner_id,day,source")
            .execute()
    }

    private func paperSeconds(owner: UUID, day: String, source: String) async throws -> Int {
        let rows: [SecondsRow] = try await client.from("readingtime_daily")
            .select("seconds")
            .eq("owner_id", value: owner.uuidString)
            .eq("day", value: day)
            .eq("source", value: source)
            .execute().value
        return rows.first?.seconds ?? 0
    }

    // 종이책 일별 (내 readingtime_daily — RLS로 본인 것만)
    public func fetchPaperDaily() async throws -> [DailyRow] {
        try await client.from("readingtime_daily").select("day,seconds").execute().value
    }

    // 전자책(밀리) 일별 (book_reading_seconds 전체 = 전부 밀리, 읽기 전용)
    public func fetchEbookDaily() async throws -> [DailyRow] {
        try await client.from("book_reading_seconds").select("day,seconds").execute().value
    }
}

private struct PaperDailyRow: Encodable {
    let owner_id: String
    let day: String
    let seconds: Int
    let source: String
}
private struct SecondsRow: Decodable { let seconds: Int }
public struct DailyRow: Decodable, Sendable {
    public let day: String
    public let seconds: Int
}

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
    // 프로필 표시 이름 — user_metadata.display_name(수동 설정) 우선, 없으면 구글 full_name
    @Published public private(set) var displayName: String?

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

    // 기존 세션 복원 (이미 로그인했으면 재로그인 불필요).
    // currentSession = 로컬 저장 세션(네트워크 불필요) 우선 — auth.user()만 쓰면 네트워크 지연/실패 시
    // 유효 세션도 signedIn=false 오탐(실기기 실측: 지오 폰). 로컬 세션 있으면 즉시 인증 확정.
    public func restore() async {
        if let session = client.auth.currentSession {
            ownerID = session.user.id
            signedIn = true
            displayName = Self.displayName(of: session.user)
            return
        }
        if let user = try? await client.auth.user() {
            ownerID = user.id
            signedIn = true
            displayName = Self.displayName(of: user)
        }
    }

    private static func displayName(of user: User) -> String? {
        user.userMetadata["display_name"]?.stringValue ?? user.userMetadata["full_name"]?.stringValue
    }

    // Google 로그인 → owner_id = auth.uid().
    // generic web-OAuth(ASWebAuthenticationSession) 경로 — 추가 패키지 불필요.
    // (docs의 Google 권장은 native GoogleSignIn-iOS + signInWithIdToken. 의존성 커서 web-OAuth 채택.)
    public func signInWithGoogle() async throws {
        let session = try await client.auth.signInWithOAuth(provider: .google, redirectTo: Config.oauthRedirect)
        ownerID = session.user.id
        signedIn = true
        displayName = Self.displayName(of: session.user)
    }

    // 이름 수정 → auth user_metadata.display_name 갱신 (문서·소스 확인: update(user:) → PUT /user, data 는 병합)
    public func updateDisplayName(_ name: String) async throws {
        guard signedIn else { return }   // 데모/미로그인: 로컬 표시만 (서버 없음)
        let user = try await client.auth.update(user: UserAttributes(data: ["display_name": .string(name)]))
        displayName = Self.displayName(of: user)
    }

    // 로그아웃 — 로컬 세션 제거 (개인 앱: 실패해도 UI 로그아웃은 진행)
    public func signOut() async {
        try? await client.auth.signOut()
        ownerID = nil
        signedIn = false
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

    // ── 함께 읽기 — RTUserData 스냅샷 공유(파트너가 읽음) + 프레즌스 ──
    // data = 앱이 인코딩한 RTUserData JSON. CloudStore 는 문자열만 저장/전달(인코딩은 앱 레이어).
    public func uploadUserData(_ json: String) async throws {
        guard let owner = ownerID else { return }
        let row = UserDataUpsert(owner_id: owner.uuidString, data: json,
                                 updated_at: ISO8601DateFormatter().string(from: Date()))
        try await client.from("readingtime_userdata")
            .upsert(row, onConflict: "owner_id")
            .execute()
    }

    // 프레즌스 — 세션 recording 시작 시 now, 종료/일시정지 시 nil. (upsert 가 행을 보장하므로 update)
    public func setReadingSince(_ date: Date?) async throws {
        guard let owner = ownerID else { return }
        let iso = date.map { ISO8601DateFormatter().string(from: $0) }
        try await client.from("readingtime_userdata")
            .update(ReadingSincePatch(reading_since: iso))
            .eq("owner_id", value: owner.uuidString)
            .execute()
    }

    // 파트너 uid — 본인 아닌 household 멤버 (순수 로직은 Config, 대소문자 정합 테스트됨).
    private var partnerOwnerID: String? {
        ownerID.flatMap { Config.partnerOwnerID(myOwnerID: $0.uuidString) }
    }

    /// 파트너 표시 이름 (보는 사람 기준 — 본인 아닌 household 멤버). 미로그인 시 nil.
    public var partnerName: String? {
        ownerID.flatMap { Config.partnerName(myOwnerID: $0.uuidString) }
    }

    // 파트너 스냅샷 로드 (household 상대 — RLS 로 파트너 것만 읽힘). data JSON + 프레즌스 시각.
    public func fetchPartner() async throws -> (data: String, readingSince: Date?)? {
        guard let partner = partnerOwnerID else { return nil }
        let rows: [PartnerSnapshotRow] = try await client.from("readingtime_userdata")
            .select("data,reading_since")
            .eq("owner_id", value: partner)
            .execute().value
        guard let r = rows.first else { return nil }
        return (r.data, r.reading_since.flatMap(Self.parseTimestamp))
    }

    // timestamptz 파싱 — 소수초 유무 둘 다 허용
    private static func parseTimestamp(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }

    // 종이책 일별 (내 readingtime_daily — RLS로 본인 것만)
    public func fetchPaperDaily() async throws -> [DailyRow] {
        try await client.from("readingtime_daily").select("day,seconds").execute().value
    }

    // 전자책(밀리) 일별 (book_reading_seconds 전체 = 전부 밀리, 읽기 전용)
    public func fetchEbookDaily() async throws -> [DailyRow] {
        try await client.from("book_reading_seconds").select("day,seconds").execute().value
    }

    // 밀리 일별×책별 (book_reading_books, 읽기 전용) — 일별 시간의 책 귀속
    public struct EbookBookRow: Decodable, Sendable {
        public let day: String
        public let title: String
    }
    public func fetchEbookBooks() async throws -> [EbookBookRow] {
        try await client.from("book_reading_books").select("day,title").execute().value
    }

    // 밀리 현재 읽는 책 제목 (book_current_reading, 읽기 전용) — 통계 밀리 행 표기
    public func fetchCurrentEbookTitle() async throws -> String? {
        struct Row: Decodable { let title: String }
        let rows: [Row] = try await client.from("book_current_reading").select("title").execute().value
        return rows.first?.title
    }
}

private struct PaperDailyRow: Encodable {
    let owner_id: String
    let day: String
    let seconds: Int
    let source: String
}
private struct SecondsRow: Decodable { let seconds: Int }
private struct UserDataUpsert: Encodable { let owner_id: String; let data: String; let updated_at: String }
private struct ReadingSincePatch: Encodable { let reading_since: String? }
private struct PartnerSnapshotRow: Decodable { let data: String; let reading_since: String? }
public struct DailyRow: Decodable, Sendable {
    public let day: String
    public let seconds: Int
}

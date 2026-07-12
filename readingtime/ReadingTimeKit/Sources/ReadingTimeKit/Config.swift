import Foundation

// 공유 Supabase 접속 설정. anon 키는 공개 안전(RLS 격리, ~/apps/CLAUDE.md).
// service_role 은 절대 여기 넣지 않음.
public enum Config {
    public static let supabaseURL = URL(string: "https://tcbooffrdacfatywdzcm.supabase.co")!
    public static let supabaseAnonKey = "sb_publishable_NST_Oha1KDfo8IC-i_4xPw_o0nVXZ77"
    public static let oauthRedirect = URL(string: "readingtime://auth-callback")!

    // 함께 읽기 household — 고정 2인. 파트너 = 본인 아닌 쪽. (RLS 0003 과 동일 uid)
    public static let householdOwners = [
        "7bae5645-61c6-4476-9ff2-4c30a72812ff",   // 지오 leftjap@
        "aeafd9a7-4094-4e7c-a621-188d6b2e336d",   // 소연 soyoun312@
    ]
    // uid → 표시 이름 (README §184 매핑). 파트너 행/통계 헤더 이름.
    public static let householdNames = [
        "7bae5645-61c6-4476-9ff2-4c30a72812ff": "지오",
        "aeafd9a7-4094-4e7c-a621-188d6b2e336d": "소연",
    ]

    // 파트너 uid — 본인 아닌 household 멤버. UUID.uuidString(대문자) vs Config(소문자) 소문자 비교.
    public static func partnerOwnerID(myOwnerID: String) -> String? {
        let me = myOwnerID.lowercased()
        return householdOwners.first { $0.lowercased() != me }
    }
    // 파트너 표시 이름 (보는 사람 기준 — 지오 폰=소연, 소연 폰=지오)
    public static func partnerName(myOwnerID: String) -> String? {
        partnerOwnerID(myOwnerID: myOwnerID).flatMap { householdNames[$0] }
    }
}

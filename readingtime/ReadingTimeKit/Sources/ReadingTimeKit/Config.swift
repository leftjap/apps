import Foundation

// 공유 Supabase 접속 설정. anon 키는 공개 안전(RLS 격리, ~/apps/CLAUDE.md).
// service_role 은 절대 여기 넣지 않음.
public enum Config {
    public static let supabaseURL = URL(string: "https://tcbooffrdacfatywdzcm.supabase.co")!
    public static let supabaseAnonKey = "sb_publishable_NST_Oha1KDfo8IC-i_4xPw_o0nVXZ77"
    public static let oauthRedirect = URL(string: "readingtime://auth-callback")!
}

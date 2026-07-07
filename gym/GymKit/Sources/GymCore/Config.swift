import Foundation

// 공유 Supabase 접속 설정 (Gym·Study·Book·ReadingTime 동일 프로젝트).
// anon 키는 공개 안전(RLS 격리, ~/apps/CLAUDE.md). service_role 절대 금지.
public enum Config {
    public static let supabaseURL = URL(string: "https://tcbooffrdacfatywdzcm.supabase.co")!
    // VITE_SUPABASE_ANON_KEY 와 동일 값 (repo secret). 실배선 시 주입/확인.
    public static let supabaseAnonKey = "sb_publishable_NST_Oha1KDfo8IC-i_4xPw_o0nVXZ77"
    public static let oauthRedirect = URL(string: "gym://auth-callback")!
}

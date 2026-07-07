import Foundation

// 로컬 영속 — 개인 단일사용자 앱이라 UserDefaults JSON (ReadingTime RTUserData 정본 패턴).
// Codable struct 그대로 저장 → SwiftData @Model 재구조화 불필요. 클라우드(CloudStore)는 백업·멀티디바이스용.
public enum LocalStore {
    static let sessionKey = "gym.session.v1"

    public static func saveSession(_ s: GymSession) {
        if let d = try? JSONEncoder().encode(s) {
            UserDefaults.standard.set(d, forKey: sessionKey)
        }
    }
    public static func loadSession() -> GymSession? {
        guard let d = UserDefaults.standard.data(forKey: sessionKey) else { return nil }
        return try? JSONDecoder().decode(GymSession.self, from: d)
    }
    public static func clearSession() {
        UserDefaults.standard.removeObject(forKey: sessionKey)
    }
}

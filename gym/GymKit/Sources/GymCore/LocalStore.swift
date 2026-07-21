import Foundation

// 로컬 영속 — 개인 단일사용자 앱이라 UserDefaults JSON (ReadingTime RTUserData 정본 패턴).
// PWA Dexie 5 store(sessions/prs/weights/customExercises/settings) 대응 (queries.js CRUD).
// 클라우드(CloudStore)는 백업·멀티디바이스용.
public enum LocalStore {
    static let sessionKey = "gym.session.v1"          // 진행 중 세션 (단건)
    static let historyKey = "gym.sessions.v1"         // 완료 세션 이력 (배열)
    static let prsKey = "gym.prs.v1"
    static let weightsKey = "gym.weights.v1"
    static let customExKey = "gym.customExercises.v1"
    static let settingsKey = "gym.settings.v1"
    static let syncStateKey = "gym.syncState.v1"      // 동기화 시도/성공/실패 (조용한 실패 차단)
    static let lastAddexPartKey = "gym.lastAddexPart.v1"   // 운동 추가 시트 기본 부위 (마지막 선택 기억)

    // MARK: - generic JSON persist
    static func save<T: Encodable>(_ v: T, _ key: String) {
        if let d = try? JSONEncoder().encode(v) { UserDefaults.standard.set(d, forKey: key) }
    }
    static func load<T: Decodable>(_ type: T.Type, _ key: String) -> T? {
        guard let d = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: d)
    }

    // MARK: - 진행 중 세션 (기존 API 유지)
    public static func saveSession(_ s: GymSession) { save(s, sessionKey) }
    public static func loadSession() -> GymSession? { load(GymSession.self, sessionKey) }
    public static func clearSession() { UserDefaults.standard.removeObject(forKey: sessionKey) }

    // MARK: - 완료 세션 이력 (date desc 정렬 유지)
    public static func loadSessions() -> [GymSession] { load([GymSession].self, historyKey) ?? [] }
    public static func saveSessions(_ xs: [GymSession]) { save(xs, historyKey) }
    public static func upsertSessionHistory(_ s: GymSession) {
        var xs = loadSessions().filter { $0.id != s.id }
        xs.append(s)
        xs.sort { ($0.startTime ?? 0, $0.date) > ($1.startTime ?? 0, $1.date) }
        saveSessions(xs)
    }
    public static func deleteSession(id: String) { saveSessions(loadSessions().filter { $0.id != id }) }

    // MARK: - PR (id = exerciseId_type)
    public static func loadPRs() -> [GymPR] { load([GymPR].self, prsKey) ?? [] }
    public static func savePRs(_ xs: [GymPR]) { save(xs, prsKey) }
    public static func upsertPR(_ p: GymPR) {
        var xs = loadPRs().filter { $0.id != p.id }
        xs.append(p)
        savePRs(xs)
    }
    public static func prsByExercise(_ exerciseId: String) -> [GymPR] {
        loadPRs().filter { $0.exerciseId == exerciseId }
    }

    // MARK: - 체중 (date PK, date desc)
    public static func loadWeights() -> [GymWeight] { load([GymWeight].self, weightsKey) ?? [] }
    public static func saveWeights(_ xs: [GymWeight]) { save(xs, weightsKey) }
    public static func upsertWeight(_ w: GymWeight) {
        var xs = loadWeights().filter { $0.date != w.date }
        xs.append(w)
        xs.sort { $0.date > $1.date }
        saveWeights(xs)
    }
    public static func deleteWeight(date: String) { saveWeights(loadWeights().filter { $0.date != date }) }

    // MARK: - 커스텀 운동
    public static func loadCustomExercises() -> [GymCustomExercise] { load([GymCustomExercise].self, customExKey) ?? [] }
    public static func saveCustomExercises(_ xs: [GymCustomExercise]) { save(xs, customExKey) }
    public static func upsertCustomExercise(_ e: GymCustomExercise) {
        var xs = loadCustomExercises().filter { $0.id != e.id }
        xs.append(e)
        saveCustomExercises(xs)
    }
    public static func deleteCustomExercise(id: String) {
        saveCustomExercises(loadCustomExercises().filter { $0.id != id })
    }

    // MARK: - 설정 (단일 레코드, 없으면 기본값)
    public static func loadSettings() -> GymUserSettings { load(GymUserSettings.self, settingsKey) ?? GymUserSettings() }
    public static func saveSettings(_ s: GymUserSettings) { save(s, settingsKey) }

    // MARK: - 동기화 상태 (백업이 멈춘 걸 화면·진단으로 알 수 있게)
    public static func loadSyncState() -> GymSyncState { load(GymSyncState.self, syncStateKey) ?? GymSyncState() }
    public static func saveSyncState(_ s: GymSyncState) { save(s, syncStateKey) }

    // MARK: - 운동 추가 시트 기본 부위 (로컬 전용 UI 선호 — 클라우드 동기화 대상 아님)
    public static func loadLastAddexPart() -> String? { load(String.self, lastAddexPartKey) }
    public static func saveLastAddexPart(_ p: String) { save(p, lastAddexPartKey) }
    public static func clearLastAddexPart() { UserDefaults.standard.removeObject(forKey: lastAddexPartKey) }
}

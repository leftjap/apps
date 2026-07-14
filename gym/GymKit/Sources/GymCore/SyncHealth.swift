import Foundation

// 동기화 건강 상태 — "조용한 실패" 차단 (2026-07-14 사고).
// 기존 구조는 (1) 미로그인 시 syncNow 가 그냥 return, (2) syncNow 의 catch 가 에러를 전부 삼킴,
// (3) 프로필 카드가 signedIn 만 보고 "동기화 정상" 표시 → 백업이 4일 멈춘 걸 알 방법이 없었다.
// 이제 시도/성공/실패를 영속(LocalStore.syncState)하고, 아래 판정으로 화면에 드러낸다.
public struct GymSyncState: Codable, Sendable, Equatable {
    public var signedIn: Bool
    public var userEmail: String?
    public var lastAttemptAt: Int64?     // ms epoch — 마지막 sync 시도
    public var lastSuccessAt: Int64?     // ms epoch — push 까지 끝난 마지막 시각
    public var lastError: String?        // 마지막 시도의 실패 사유 (성공 시 nil)

    public init(signedIn: Bool = false, userEmail: String? = nil, lastAttemptAt: Int64? = nil,
                lastSuccessAt: Int64? = nil, lastError: String? = nil) {
        self.signedIn = signedIn
        self.userEmail = userEmail
        self.lastAttemptAt = lastAttemptAt
        self.lastSuccessAt = lastSuccessAt
        self.lastError = lastError
    }
}

public enum GymSyncHealth {
    /// 이 일수 이상 백업 성공이 없으면 위험으로 본다.
    public static let staleDays = 2

    /// 마지막 백업 성공 이후 경과 일수 (KST 자정 기준). 성공 이력이 없으면 nil.
    public static func daysSinceSuccess(_ s: GymSyncState, now: Date) -> Int? {
        guard let ms = s.lastSuccessAt else { return nil }
        let cal = GymWeightLogic.kst
        let last = cal.startOfDay(for: Date(timeIntervalSince1970: Double(ms) / 1000))
        return cal.dateComponents([.day], from: last, to: cal.startOfDay(for: now)).day
    }

    /// 백업이 위험한 상태 — 미로그인 · 성공 이력 없음 · 오래된 성공 · 최근 시도 실패.
    public static func isAtRisk(_ s: GymSyncState, now: Date) -> Bool {
        if !s.signedIn { return true }
        if s.lastError != nil { return true }
        guard let d = daysSinceSuccess(s, now: now) else { return true }
        return d >= staleDays
    }

    /// 프로필 카드·홈 배너 문구.
    public static func statusText(_ s: GymSyncState, now: Date) -> String {
        guard s.signedIn else { return "로그인 필요 · 백업 안 됨" }
        guard let d = daysSinceSuccess(s, now: now) else { return "아직 백업된 적 없음" }
        let ago = d == 0 ? "오늘" : "\(d)일 전"
        if s.lastError != nil { return "동기화 실패 · 마지막 백업 \(ago)" }
        return d >= staleDays ? "백업 \(ago) · 확인 필요" : "백업 완료 · \(ago)"
    }
}

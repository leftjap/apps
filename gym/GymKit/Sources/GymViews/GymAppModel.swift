import SwiftUI

// 앱 상태 — 라우팅 정본 (PWA app.js 라우트 이식). 인터랙션·세션 상태는 증분 확장.
public enum GymRoute: Equatable { case home, session, stats }

@MainActor
public final class GymAppModel: ObservableObject {
    @Published public var route: GymRoute = .home
    public var statsInitialTab: StatsScreenView.Tab = .cal   // 검증 훅용 초기 탭

    public init() {}

    public func startSession() { route = .session }
    public func goHome() { route = .home }
    public func openStats() { route = .stats }
}

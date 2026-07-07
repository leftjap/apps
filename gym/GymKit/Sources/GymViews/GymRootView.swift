import SwiftUI

// 앱 루트 — 라우트별 화면 전환 (RTRootView 패턴). iOS 앱 타깃과 gymshot 이 공유.
public struct GymRootView: View {
    @ObservedObject var model: GymAppModel
    public init(model: GymAppModel) { self.model = model }

    public var body: some View {
        ZStack {
            switch model.route {
            case .home:
                HomeScreenView(onStart: { model.startSession() }, onStats: { model.openStats() })
            case .session:
                SessionScreenView(model: model, onHome: { model.goHome() })
            case .stats:
                StatsScreenView(initialTab: model.statsInitialTab, onHome: { model.goHome() })
            case .summary:
                SummaryScreenView(model: model, onHome: { model.goHome() })
            case .admin:
                AdminScreenView(initialTab: model.adminInitialTab, cloud: model.cloud,
                                onHome: { model.goHome() }, onStats: { model.openStats() },
                                onLogin: { Task { await model.login() } },
                                onLogout: { Task { await model.logout() } })
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(GY.shell)
    }
}

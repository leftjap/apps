import SwiftUI

// 앱 루트 — 라우트별 화면 전환 (RTRootView 패턴). iOS 앱 타깃과 gymshot 이 공유.
public struct GymRootView: View {
    @ObservedObject var model: GymAppModel
    public init(model: GymAppModel) { self.model = model }

    public var body: some View {
        ZStack {
            switch model.route {
            case .login:
                // 인증 확정 전엔 로그인 폼 대신 중립 스플래시(런치와 동일 배경) — 로그인 화면 깜빡임 차단.
                // restoreCloud 확정 후: 복원 성공 → .home, 미로그인 → authResolved=true 로 폼 노출.
                if model.authResolved {
                    GymLoginView(onLogin: { Task { await model.login() } })
                } else {
                    Color.clear   // ZStack .background(GY.shell) 가 비쳐 런치 배경 유지
                }
            case .home:
                HomeScreenView(model: model, onStart: { model.startSession() },
                               onStats: { model.openStats() }, onAdmin: { model.openAdmin() })
            case .session:
                SessionScreenView(model: model, onHome: { model.goHome() })
            case .stats:
                StatsScreenView(model: model, initialTab: model.statsInitialTab,
                                onHome: { model.goHome() }, onAdmin: { model.openAdmin() })
            case .summary:
                SummaryScreenView(model: model, onHome: { model.goHome() })
            case .admin:
                AdminScreenView(model: model, initialTab: model.adminInitialTab,
                                onHome: { model.goHome() }, onStats: { model.openStats() },
                                onLogin: { Task { await model.login() } },
                                onLogout: { Task { await model.logout() } })
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(GY.shell)
    }
}

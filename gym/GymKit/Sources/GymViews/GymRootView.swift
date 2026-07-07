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
                SessionScreenView(onHome: { model.goHome() })
            case .stats:
                StatsScreenView(onHome: { model.goHome() })
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(GY.shell)
    }
}

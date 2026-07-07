import SwiftUI
import GymViews
import GymCore

// Gym iOS 앱 진입점 — UI/상태는 GymViews(GymRootView + GymAppModel), 데이터는 GymCore(CloudStore).
@main
struct GymApp: App {
    @StateObject private var model: GymAppModel

    init() {
        let errs = GymFonts.register()
        if !errs.isEmpty { assertionFailure("폰트 등록 실패: \(errs.joined(separator: "; "))") }
        let model = GymAppModel()
        let args = ProcessInfo.processInfo.arguments
        if args.contains("--reset") { model.resetSession() }   // 검증용 영속 초기화
        // 검증 훅 — simctl launch ... --route session (ReadingTime --seq 패턴)
        var routeArg: String?
        if let i = args.firstIndex(of: "--route"), args.count > i + 1 {
            routeArg = args[i + 1]
            switch args[i + 1] {
            case "session": model.route = .session
            case "stats": model.route = .stats
            case "summary": model.route = .summary
            case "admin": model.route = .admin
            default: break
            }
        }
        if let i = args.firstIndex(of: "--tab"), args.count > i + 1 {
            if routeArg == "admin", let t = GymAppModel.adminTab(args[i + 1]) {
                model.adminInitialTab = t
            } else if let t = GymAppModel.statsTab(args[i + 1]) {
                model.statsInitialTab = t
            }
        }
        _model = StateObject(wrappedValue: model)
    }

    var body: some Scene {
        WindowGroup {
            // 세이프에어리어(상태바·홈 인디케이터) 준수 — 콘텐츠는 안전 영역 내, 배경만 전체.
            GymRootView(model: model)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(GY.shell.ignoresSafeArea())
                .task { await model.restoreCloud() }   // 기존 로그인 복원 (미로그인 시 no-op)
        }
    }
}

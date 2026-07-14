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
        // 검증 훅 — 발급 세션 토큰 주입 (실기기 E2E sync 검증, restoreCloud 가 소비)
        if let i = args.firstIndex(of: "--auth-tokens"), args.count > i + 2 {
            model.pendingAuthTokens = (args[i + 1], args[i + 2])
        }
        // 검증 훅(시뮬 전용) — 실 OAuth 없이 로그인 상태 UI 구동 (로그아웃 플로우 테스트).
        #if targetEnvironment(simulator)
        if args.contains("--fake-signin") {
            model.debugForceSignedIn = true   // restoreCloud 가 syncState 를 덮어쓰지 않게
            model.syncState = GymSyncState(signedIn: true, userEmail: "leftjap@gmail.com",
                                           lastSuccessAt: Int64(Date().timeIntervalSince1970 * 1000))
            if routeArg == nil { model.route = .home }
        }
        #endif
        _model = StateObject(wrappedValue: model)
    }

    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            // 세이프에어리어(상태바·홈 인디케이터) 준수 — 콘텐츠는 안전 영역 내, 배경만 전체.
            GymRootView(model: model)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(GY.shell.ignoresSafeArea())
                .task { await model.restoreCloud() }   // 기존 로그인 복원 (미로그인 시 no-op)
                // 포그라운드 복귀마다 재동기화 — 백그라운드 전환으로 죽은 sync 를 복구한다.
                // (콜드런치의 .task 만으로는, 로그인 직후 앱을 닫으면 백업이 영영 안 올라간다)
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await model.syncOnForeground() } }
                }
        }
    }
}

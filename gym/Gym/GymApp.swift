import SwiftUI
import GymViews

// Gym iOS 앱 진입점 — UI/상태는 GymViews(GymRootView + GymAppModel).
// 시안 뷰포트 390×844 고정 → 기기 크기에 비율 유지 스케일·중앙 배치 (ReadingTimeApp 패턴).
@main
struct GymApp: App {
    @StateObject private var model: GymAppModel

    init() {
        let errs = GymFonts.register()
        if !errs.isEmpty { assertionFailure("폰트 등록 실패: \(errs.joined(separator: "; "))") }
        let model = GymAppModel()
        // 검증 훅 — simctl launch ... --route session (ReadingTime --seq 패턴)
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "--route"), args.count > i + 1 {
            switch args[i + 1] {
            case "session": model.route = .session
            case "stats": model.route = .stats
            default: break
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
        }
    }
}

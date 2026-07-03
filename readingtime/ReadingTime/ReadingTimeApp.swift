import SwiftUI
import RTViews
import ReadingTimeKit

// 리딩타임 iOS 앱 진입점 — UI/상태는 전부 RTViews(RTRootView + RTAppModel),
// 여기선 실서비스 배선만: 알라딘 검색·클라우드 저장·엎기 센서·keep-alive.
@main
struct ReadingTimeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model: RTAppModel
    @StateObject private var flip: FlipEngine
    @StateObject private var keepAlive = KeepAlive()
    private let cloud: CloudStore

    init() {
        let regErrors = RTFonts.register()
        if !regErrors.isEmpty {
            assertionFailure("폰트 등록 실패: \(regErrors.joined(separator: "; "))")
        }
        let cloud = CloudStore()
        self.cloud = cloud

        let model = RTAppModel()
        model.sessionSeed = 0   // 실앱: 세션은 0초부터 (데모 시드 26:14 는 rtshot/rtapp 전용)

        // 시뮬레이터 검증용: simctl launch ... -- --seq "login,simFlip" (rtapp 과 동일 문법)
        let launchArgs = ProcessInfo.processInfo.arguments
        if let i = launchArgs.firstIndex(of: "--seq"), launchArgs.count > i + 1 {
            launchArgs[i + 1].split(separator: ",").forEach { model.apply(String($0)) }
        }

        let aladin = AladinClient()
        model.searchProvider = { query in
            try await aladin.search(query: query, maxResults: 10).map {
                RTBookHit(title: $0.title, author: Aladin.cleanAuthor($0.author),
                          publisher: $0.publisher, isbn: $0.isbn, coverUrl: $0.coverUrl)
            }
        }
        model.onSessionSaved = { mode, seconds in
            Task {
                try? await cloud.addPaperSeconds(seconds, source: mode == .flip ? .flip : .tap, on: Date())
            }
        }
        _model = StateObject(wrappedValue: model)
        _flip = StateObject(wrappedValue: FlipEngine(model: model))
    }

    var body: some Scene {
        WindowGroup {
            RTRootView(model: model)
                .rtMotion(true)
                .frame(width: 390, height: 844)
                .ignoresSafeArea()
                .task { await cloud.restore() }
                .onReceive(model.$route) { route in
                    // 엎기 대기·타이머 화면에서만 센서 + keep-alive 가동
                    if route == .flipWait || route == .flipTimer {
                        keepAlive.start()
                        flip.startMonitoring()
                    } else {
                        flip.stopMonitoring()
                        keepAlive.stop()
                    }
                }
                .onChange(of: scenePhase) { _, phase in
                    // 백그라운드↔포그라운드 전환마다 모션 스트림 재시작 (iOS 11+ 버그 대응)
                    if phase == .background || phase == .active {
                        flip.handleScenePhaseChange()
                    }
                    if phase == .active {
                        flip.syncModel()   // 백그라운드 경과 wall-clock 보정
                    }
                }
        }
    }
}

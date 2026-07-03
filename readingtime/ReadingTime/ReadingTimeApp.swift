import SwiftUI
import RTViews
import ReadingTimeKit
import os.log

// 리딩타임 iOS 앱 진입점 — UI/상태는 전부 RTViews(RTRootView + RTAppModel),
// 여기선 실서비스 배선만: 알라딘 검색·클라우드 저장·엎기 센서·keep-alive.
@main
struct ReadingTimeApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model: RTAppModel
    @StateObject private var flip: FlipEngine
    @StateObject private var keepAlive = KeepAlive()
    private let cloud: CloudStore
    private let liveActivity = LiveActivityController()

    init() {
        let regErrors = RTFonts.register()
        if !regErrors.isEmpty {
            assertionFailure("폰트 등록 실패: \(regErrors.joined(separator: "; "))")
        }
        let cloud = CloudStore()
        self.cloud = cloud

        let model = RTAppModel()
        model.sessionSeed = 0   // 실앱: 세션은 0초부터 (데모 시드 26:14 는 rtshot/rtapp 전용)

        // 실데이터 정본 (§6-④) — UserDefaults JSON 영속 (개인 앱: 로컬이 정본)
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        if let raw = UserDefaults.standard.data(forKey: "rt.userData"),
           let saved = try? dec.decode(RTUserData.self, from: raw) {
            model.userData = saved
        } else {
            model.userData = RTUserData()
        }
        model.onUserDataChange = { data in
            let enc = JSONEncoder()
            enc.dateEncodingStrategy = .iso8601
            if let raw = try? enc.encode(data) {
                UserDefaults.standard.set(raw, forKey: "rt.userData")
            }
        }

        // 개인 앱: 로그인 1회 유지 (로그아웃 시까지) — UserDefaults 영속
        model.onAuthChange = { loggedIn in
            UserDefaults.standard.set(loggedIn, forKey: "rt.loggedIn")
            UserDefaults.standard.synchronize()   // 즉시 플러시 — 강제 종료에도 로그인 상태 유지
            if !loggedIn {
                Task { await cloud.signOut() }    // 로그아웃 시 Supabase 세션도 제거
            }
        }
        if UserDefaults.standard.bool(forKey: "rt.loggedIn") {
            model.nav(.home)
        }

        // 로그인 버튼 → Google OAuth (ASWebAuthenticationSession) → 성공 시 홈 진입
        model.loginHandler = { [weak model] in
            Task { @MainActor in
                do {
                    try await cloud.signInWithGoogle()
                    model?.login()
                } catch {
                    Logger(subsystem: "com.leftjap.readingtime", category: "auth")
                        .error("google 로그인 실패/취소: \(String(describing: error), privacy: .public)")
                }
            }
        }

        // 시뮬레이터 검증용: simctl launch ... --seq "login,start" --sim-motion "1:0.95,8:0.2"
        // (--seq = 상태 진입, --sim-motion = 합성 gravity.z 주입 — CoreMotion 없는 시뮬에서 flip 재현)
        let launchArgs = ProcessInfo.processInfo.arguments
        if let i = launchArgs.firstIndex(of: "--seq"), launchArgs.count > i + 1 {
            launchArgs[i + 1].split(separator: ",").forEach { model.apply(String($0)) }
        }
        var motionScript: String?
        if let i = launchArgs.firstIndex(of: "--sim-motion"), launchArgs.count > i + 1 {
            motionScript = launchArgs[i + 1]
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
        _flip = StateObject(wrappedValue: FlipEngine(model: model, motionScript: motionScript))
    }

    var body: some Scene {
        WindowGroup {
            // 시안 뷰포트 390×844 고정 — 작은 화면(iPhone 11 Pro 375×812 등)은 비율 유지 축소·중앙 배치
            GeometryReader { geo in
                let scale = min(1, min(geo.size.width / 390, geo.size.height / 844))
                RTRootView(model: model)
                    .rtMotion(true)
                    .frame(width: 390, height: 844)
                    .scaleEffect(scale)
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
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
                .onReceive(model.$session) { session in
                    // 잠금 화면 Live Activity — 상태 전환만 반영(초 틱은 시스템 자동 타이머)
                    liveActivity.sync(session: session)
                }
                .onChange(of: scenePhase) { _, phase in
                    // 백그라운드↔포그라운드 전환마다 모션 스트림 재시작 (iOS 11+ 버그 대응)
                    if phase == .background || phase == .active {
                        flip.handleScenePhaseChange()
                    }
                    if phase == .active {
                        flip.syncModel()   // 백그라운드 경과 wall-clock 보정
                        flip.cancelPendingSignals()   // 발화 전 잠금 신호 알림은 불필요
                    }
                }
        }
    }
}

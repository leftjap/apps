import SwiftUI
import RTViews
import ReadingTimeKit
import os.log

// 리딩타임 iOS 앱 진입점 — UI/상태는 전부 RTViews(RTRootView + RTAppModel),
// 여기선 실서비스 배선만: 알라딘 검색·클라우드 저장·엎기 센서·keep-alive.
@main
struct ReadingTimeApp: App {
    // 탭 세션 wall-clock 홀더 — 잠금/서스펜드로 UI 틱이 멈춰도 실제 경과 보전
    @MainActor final class TapClock: ObservableObject {
        var clock = RTTapSessionClock()
    }

    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var model: RTAppModel
    @StateObject private var flip: FlipEngine
    @StateObject private var keepAlive = KeepAlive()
    @StateObject private var tapClock = TapClock()
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

    /// 세션 자동 잠금 정책 — 서드파티는 잠긴 화면을 깨울 수 없으므로(알림·LA alert
    /// 실기기 실측 무효, 2026-07-04) "기록·대기 중 = 사용 중"으로 잠금 자체를 방지.
    /// 일시정지 상태는 일반 자동 잠금 복귀 (방치 시 영구 미잠금 방지 — 잠기면
    /// keep-alive+LA 폴백이 이어받고, 다시 엎으면 기록 재개).
    private static func updateAwake(route: RTRoute, session: RTSession?) {
        let recording = session?.status == .recording
        let keepAwake = route == .flipWait
            || (route == .flipTimer && recording)
            || (route == .tapTimer && recording)
        UIApplication.shared.isIdleTimerDisabled = keepAwake
    }

    /// 엎혀서 기록 중 = 화면이 바닥을 향한 상태 — 완전 검은 오버레이로 OLED 픽셀 오프(절전).
    /// 근접 센서(하드웨어 오프)의 백업이자, 센서가 안 덮이는 표면에서도 배터리를 지킨다.
    private var faceDownDark: Bool {
        model.route == .flipTimer && model.session?.status == .recording
    }

    var body: some Scene {
        WindowGroup {
            // 시안 뷰포트 390×844 고정 — 작은 화면(iPhone 11 Pro 375×812 등)은 비율 유지 축소·중앙 배치
            GeometryReader { geo in
                let scale = min(1, min(geo.size.width / 390, geo.size.height / 844))
                RTRootView(model: model)
                    .rtMotion(!faceDownDark)   // 엎힘(검은 화면) 중 무한 모션 동결 — GPU 절전
                    .frame(width: 390, height: 844)
                    .scaleEffect(scale)
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
            .ignoresSafeArea()
            .overlay {
                if faceDownDark {
                    Color.black.ignoresSafeArea()
                }
            }
            .animation(.easeOut(duration: 0.25), value: faceDownDark)
            .statusBarHidden(faceDownDark)
                .task { await cloud.restore() }
                .onReceive(model.$route) { route in
                    let flipSession = route == .flipWait || route == .flipTimer
                    Self.updateAwake(route: route, session: model.session)
                    // 엎기 모드: 근접 센서로 엎힌 동안 화면 하드웨어 오프(통화와 동일 메커니즘)
                    // → 배터리 소모 없이, 들어올리면 즉시 04 타이머 화면 + 포그라운드 강햅틱.
                    // 포그라운드 전용 (잠금 중 진동 간섭 배제 — scenePhase 핸들러와 동일 규칙)
                    UIDevice.current.isProximityMonitoringEnabled = flipSession && scenePhase == .active
                    // 엎기 대기·타이머 화면에서만 센서 + keep-alive 가동 (수동 잠금 폴백용)
                    if flipSession {
                        keepAlive.start()
                        flip.startMonitoring()
                    } else {
                        flip.stopMonitoring()
                        keepAlive.stop()
                    }
                }
                .onReceive(model.$session) { session in
                    Self.updateAwake(route: model.route, session: session)
                }
                .onReceive(model.$session) { session in
                    // 잠금 화면 Live Activity — 상태 전환만 반영(초 틱은 시스템 자동 타이머)
                    liveActivity.sync(session: session, bookTitle: model.currentBook?.title)
                    tapClock.clock.track(session, at: Date())
                }
                .onChange(of: scenePhase) { _, phase in
                    // 근접 센서는 포그라운드 전용 — 비잠금 엎힘의 화면 오프용이며 잠금 시엔
                    // 화면이 이미 꺼져 있어 무용. 잠금+센서 덮임이 AudioServices 진동을
                    // 간섭하는 정황(7차 실기기: 진동 미발생) 배제 목적.
                    UIDevice.current.isProximityMonitoringEnabled =
                        phase == .active && (model.route == .flipWait || model.route == .flipTimer)
                    // 백그라운드↔포그라운드 전환마다 모션 스트림 재시작 (iOS 11+ 버그 대응)
                    if phase == .background || phase == .active {
                        flip.handleScenePhaseChange()
                    }
                    if phase == .active {
                        flip.syncModel()   // 백그라운드 경과 wall-clock 보정 (flip)
                        if model.session?.mode == .tap, tapClock.clock.isTracking {
                            model.syncElapsed(tapClock.clock.elapsed(at: Date()))   // tap 보정
                        }
                    }
                }
        }
    }
}

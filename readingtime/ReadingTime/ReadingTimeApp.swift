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
                // 함께 읽기 — 파트너가 읽도록 스냅샷 업로드 (로그인 시에만 실동작)
                if let json = String(data: raw, encoding: .utf8) {
                    Task { try? await cloud.uploadUserData(json) }
                }
            }
        }
        // 읽는 중 프레즌스 — 세션 시작/정지 시 reading_since 갱신
        model.onReadingPresence = { reading in
            Task { try? await cloud.setReadingSince(reading ? Date() : nil) }
        }

        // 개인 앱: 로그인 1회 유지 (로그아웃 시까지) — UserDefaults 영속
        model.onAuthChange = { [weak model] loggedIn in
            UserDefaults.standard.set(loggedIn, forKey: "rt.loggedIn")
            UserDefaults.standard.synchronize()   // 즉시 플러시 — 강제 종료에도 로그인 상태 유지
            if !loggedIn {
                UserDefaults.standard.removeObject(forKey: "rt.displayName")
                model?.displayName = nil
                try? FileManager.default.removeItem(at: Self.avatarURL)
                model?.avatarImage = nil
                // 파트너 캐시도 제거 (로그아웃 후 스테일 파트너 표시 방지)
                ["rt.partnerData", "rt.partnerName", "rt.partnerReadingSince"].forEach {
                    UserDefaults.standard.removeObject(forKey: $0)
                }
                model?.partnerData = nil
                Task { await cloud.signOut() }    // 로그아웃 시 Supabase 세션도 제거
            }
        }

        // 아바타 사진 — 기기 로컬이 정본 (Documents 는 백업 대상이라 기기 교체 시 따라옴).
        // 저장 데이터는 이미 256px PNG (setAvatar 가 규격화) → 로드 시 재규격화는 사실상 무비용.
        if let raw = try? Data(contentsOf: Self.avatarURL) {
            model.avatarImage = RTAppModel.prepareAvatar(raw)?.image
        }
        model.onAvatarChange = { data in
            do { try data.write(to: Self.avatarURL) } catch {
                Logger(subsystem: "com.leftjap.readingtime", category: "avatar")
                    .error("아바타 저장 실패: \(String(describing: error), privacy: .public)")
            }
        }

        if UserDefaults.standard.bool(forKey: "rt.loggedIn") {
            // 표시 이름: 마지막 로그인 값으로 즉시 표시 (오프라인 콜드스타트) — restore() 가 갱신
            model.displayName = UserDefaults.standard.string(forKey: "rt.displayName")
            model.nav(.home)
            Self.armPickupIfFirstToday(model)   // 하루 첫 실행 안무(#7a) — 읽던 책 있을 때 1회
            Self.applyCachedPartner(to: model)   // 함께 읽기 — 캐시된 파트너 즉시 표시(팝인 제거)
        }

        // 이름 수정 저장 → 즉시 영속 + 서버 갱신 (실패해도 로컬 유지 — 다음 restore() 가 서버 정본으로 수렴)
        model.onRename = { name in
            UserDefaults.standard.set(name, forKey: "rt.displayName")
            Task {
                do { try await cloud.updateDisplayName(name) } catch {
                    Logger(subsystem: "com.leftjap.readingtime", category: "auth")
                        .error("이름 서버 갱신 실패: \(String(describing: error), privacy: .public)")
                }
            }
        }

        // 로그인 버튼 → Google OAuth (ASWebAuthenticationSession) → 성공 시 홈 진입
        model.loginHandler = { [weak model] in
            Task { @MainActor in
                do {
                    try await cloud.signInWithGoogle()
                    Self.applyDisplayName(from: cloud, to: model)
                    model?.login()
                    // 로그인 직후 동기화 (앱 시작 .task 는 이미 지나감) — 스냅샷 올림 + 파트너 로드
                    if let model {
                        Self.uploadSnapshot(from: model, to: cloud)
                        await Self.loadPartner(from: cloud, to: model)
                        await Self.loadEbook(from: cloud, to: model)
                    }
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
        // --capture: 4초 후 실제 렌더된 윈도우를 Documents/rtscreen.png 로 저장 (실기기 화면 검증).
        // devicectl 엔 스크린샷 명령이 없어 앱이 자기 화면을 남기고 아래로 회수한다:
        //   xcrun devicectl device process launch --device <UDID> --terminate-existing <bundle> -- --capture
        //   (-- 종결자 필수: 없으면 devicectl 이 대시 인자를 삼켜 앱에 미전달. terminate 필수: 실행 중이면 인자 소실)
        //   xcrun devicectl device copy from --device <UDID> --domain-type appDataContainer \
        //     --domain-identifier <bundle> --source Documents/rtscreen.png --destination out.png
        if launchArgs.contains("--capture") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { Self.captureWindow() }
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

    /// 아바타 사진 파일 (256px PNG) — Documents 라 iCloud/iTunes 백업 포함
    private static let avatarURL = FileManager.default
        .urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("rt-avatar.png")

    /// 로그인/복원 성공 시 auth 표시 이름을 모델에 주입 + UserDefaults 영속 (오프라인 콜드스타트용)
    @MainActor private static func applyDisplayName(from cloud: CloudStore, to model: RTAppModel?) {
        guard let n = cloud.displayName, !n.isEmpty else { return }
        model?.displayName = n
        UserDefaults.standard.set(n, forKey: "rt.displayName")
    }

    /// 내 RTUserData 스냅샷을 클라우드에 1회 업로드 (앱 시작 시 — 파트너가 최신 상태를 읽도록).
    @MainActor private static func uploadSnapshot(from model: RTAppModel?, to cloud: CloudStore) {
        guard let data = model?.userData else { return }
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        guard let raw = try? enc.encode(data), let json = String(data: raw, encoding: .utf8) else { return }
        Task { try? await cloud.uploadUserData(json) }
    }

    /// 밀리(전자책) 일별 초 로드 — book_reading_seconds 읽기 전용, 통계 표시 계층 합산.
    /// 실패/미로그인은 무시 (기존 값 유지).
    @MainActor private static func loadEbook(from cloud: CloudStore, to model: RTAppModel?) async {
        // 빈 응답 무시 — 미로그인 RLS 는 에러가 아니라 빈 배열(200)이라 데모 시드·기존 값을 지운다
        if let t = try? await cloud.fetchCurrentEbookTitle() { model?.ebookTitle = t }
        if let books = try? await cloud.fetchEbookBooks(), !books.isEmpty {
            model?.ebookBooks = Dictionary(grouping: books, by: \.day).mapValues { $0.map(\.title) }
        }
        guard let rows = try? await cloud.fetchEbookDaily(), !rows.isEmpty else { return }
        model?.ebookDaily = Dictionary(rows.map { ($0.day, $0.seconds) }, uniquingKeysWith: +)
    }

    /// 함께 읽기 — 파트너 스냅샷(RTUserData JSON + 프레즌스)을 클라우드에서 받아 모델에 주입.
    /// reading_since 가 최근(≤12h — 크래시 스테일 가드)이면 "지금 읽는 중". 실패/미로그인은 무시.
    @MainActor private static func loadPartner(from cloud: CloudStore, to model: RTAppModel?) async {
        if let name = cloud.partnerName {   // 보는 사람 기준 이름
            model?.partnerName = name
            UserDefaults.standard.set(name, forKey: "rt.partnerName")
        }
        guard let snap = try? await cloud.fetchPartner() else { return }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        guard let raw = snap.data.data(using: .utf8),
              let pdata = try? dec.decode(RTUserData.self, from: raw) else { return }
        model?.partnerData = pdata
        model?.partnerReadingNow = snap.readingSince.map { Date().timeIntervalSince($0) < 12 * 3600 } ?? false
        // 캐시 — 다음 콜드스타트에 즉시 표시(네트워크 지연 팝인 제거, stale-while-revalidate)
        UserDefaults.standard.set(raw, forKey: "rt.partnerData")
        UserDefaults.standard.set(snap.readingSince, forKey: "rt.partnerReadingSince")
    }

    /// 캐시된 파트너 스냅샷을 즉시 주입 (콜드스타트 — 네트워크 loadPartner 전에 홈에 파트너 행 바로 표시)
    @MainActor private static func applyCachedPartner(to model: RTAppModel?) {
        let ud = UserDefaults.standard
        if let name = ud.string(forKey: "rt.partnerName") { model?.partnerName = name }
        guard let raw = ud.data(forKey: "rt.partnerData") else { return }
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        guard let pdata = try? dec.decode(RTUserData.self, from: raw) else { return }
        model?.partnerData = pdata
        let since = ud.object(forKey: "rt.partnerReadingSince") as? Date
        model?.partnerReadingNow = since.map { Date().timeIntervalSince($0) < 12 * 3600 } ?? false
    }

    /// 현재 렌더된 윈도우를 Documents/rtscreen.png 로 저장 (--capture 전용, 실기기 화면 검증).
    @MainActor private static func captureWindow() {
        guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene }).first,
              let window = scene.windows.first(where: { $0.isKeyWindow }) ?? scene.windows.first
        else { return }
        let renderer = UIGraphicsImageRenderer(bounds: window.bounds)
        let img = renderer.image { _ in
            window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
        }
        guard let data = img.pngData(),
              let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        else { return }
        try? data.write(to: dir.appendingPathComponent("rtscreen.png"))
    }

    /// 하루 첫 실행 안무(#7a) 무장 — 읽던 책이 있고 그 날짜 첫 진입일 때 1회 playPickup 세팅.
    /// UserDefaults 에 마지막 재생 날짜(로컬 타임존=KST) 저장. 안무는 Reduce Motion 시 뷰에서 생략.
    /// 소비 후 즉시 해제(2s 후 — 안무 1.55s 초과)해 같은 날 재진입 시 재생 방지.
    private static func armPickupIfFirstToday(_ model: RTAppModel) {
        guard model.currentBook != nil else { return }   // 집을 책이 없으면 안무 없음
        let d = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: Date())
        let today = "\(d.year ?? 0)-\(d.month ?? 0)-\(d.day ?? 0)"
        let key = "rt.lastPickupDay"
        guard UserDefaults.standard.string(forKey: key) != today else { return }
        UserDefaults.standard.set(today, forKey: key)
        model.playPickup = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { model.playPickup = false }
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
            // 시안 뷰포트 390×844 고정 — 화면 크기 무관 비율 유지 스케일·중앙 배치.
            // 축소(11 Pro 375×812 → 0.96)·확대(XR 414×896 → 1.06) 모두 허용: 최신 아이폰 종횡비가
            // 시안과 사실상 동일(±0.01%)해 레터박스가 소수점 픽셀로 사라짐. (XR 여백 결함 수정)
            GeometryReader { geo in
                let scale = min(geo.size.width / 390, geo.size.height / 844)
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
                .task {
                    await cloud.restore()
                    // --seq 데모/테스트 실행은 로컬 상태를 명시 주입 → 죽은 세션 리다이렉트 건너뜀
                    let demoLaunch = ProcessInfo.processInfo.arguments.contains("--seq")
                    if !demoLaunch && !cloud.signedIn && UserDefaults.standard.bool(forKey: "rt.loggedIn") {
                        // 세션 소실(만료/미인증) — 로컬 플래그만 로그인 상태라 홈은 뜨나 클라우드 동기화 불가.
                        // 재로그인 유도(로컬 데이터·아바타 보존 — onAuthChange 미발화). 재로그인 시 동기화 재개.
                        UserDefaults.standard.set(false, forKey: "rt.loggedIn")
                        model.nav(.login)
                    } else {
                        Self.applyDisplayName(from: cloud, to: model)
                        Self.uploadSnapshot(from: model, to: cloud)       // 내 스냅샷 1회 올림(파트너가 읽도록)
                        await Self.loadPartner(from: cloud, to: model)   // 함께 읽기 — 파트너 스냅샷
                        await Self.loadEbook(from: cloud, to: model)     // 밀리 일별 — 통계 합산
                    }
                }
                .onReceive(model.$route) { route in
                    // 센서·근접: 홈 추가 (§4-1) — 홈(포그라운드)에서 엎으면 대기 화면 없이 즉시 기록.
                    let sensorSession = route == .flipWait || route == .flipTimer || route == .home
                    // keep-alive(잠금 유지)·keep-awake: 녹화 대기/중에만 (홈 제외 — 배터리·영구
                    // 미잠금 방지, 홈은 "포그라운드로 떠 있는 동안만 무장"). (§4-1 주의)
                    let awakeSession = route == .flipWait || route == .flipTimer
                    Self.updateAwake(route: route, session: model.session)
                    // 엎기 모드: 근접 센서로 엎힌 동안 화면 하드웨어 오프(통화와 동일 메커니즘)
                    // → 배터리 소모 없이, 들어올리면 즉시 04 타이머 화면 + 포그라운드 강햅틱.
                    // 포그라운드 전용 (잠금 중 진동 간섭 배제 — scenePhase 핸들러와 동일 규칙)
                    UIDevice.current.isProximityMonitoringEnabled = sensorSession && scenePhase == .active
                    // 홈·엎기 대기·타이머 화면에서 센서 가동. keep-alive 는 녹화 대기/중에만.
                    if sensorSession { flip.startMonitoring() } else { flip.stopMonitoring() }
                    if awakeSession { keepAlive.start() } else { keepAlive.stop() }
                }
                .onReceive(model.$session) { session in
                    Self.updateAwake(route: model.route, session: session)
                }
                .onReceive(model.$session) { session in
                    // 잠금 화면 Live Activity — 상태 전환만 반영(초 틱은 시스템 자동 타이머)
                    liveActivity.sync(session: session, bookTitle: model.sessionBook?.title ?? model.currentBook?.title)
                    tapClock.clock.track(session, at: Date())
                }
                .onChange(of: scenePhase) { _, phase in
                    // 근접 센서는 포그라운드 전용 — 비잠금 엎힘의 화면 오프용이며 잠금 시엔
                    // 화면이 이미 꺼져 있어 무용. 잠금+센서 덮임이 AudioServices 진동을
                    // 간섭하는 정황(7차 실기기: 진동 미발생) 배제 목적.
                    UIDevice.current.isProximityMonitoringEnabled =
                        phase == .active && (model.route == .flipWait || model.route == .flipTimer || model.route == .home)
                    // 백그라운드↔포그라운드 전환마다 모션 스트림 재시작 (iOS 11+ 버그 대응)
                    if phase == .background || phase == .active {
                        flip.handleScenePhaseChange()
                    }
                    if phase == .background {
                        flip.noteBackgrounded()   // 비잠금 배경 진입 = 홈 이탈 → 엎힘 무장 해제
                    }
                    if phase == .active {
                        flip.setUnlockedOnActive()   // 포그라운드 = 확실한 비잠금 (lockstate 오발화 보정)
                        flip.syncModel()   // 백그라운드 경과 wall-clock 보정 (flip)
                        if model.session?.mode == .tap, tapClock.clock.isTracking {
                            model.syncElapsed(tapClock.clock.elapsed(at: Date()))   // tap 보정
                        }
                        // 홈으로 복귀 시 그 날짜 첫 진입이면 집어드는 안무 (§4)
                        if model.route == .home { Self.armPickupIfFirstToday(model) }
                        // 함께 읽기 — 포그라운드 복귀마다 파트너 프레즌스 갱신
                        Task {
                            await Self.loadPartner(from: cloud, to: model)
                            await Self.loadEbook(from: cloud, to: model)   // 밀리 갱신 (하루 중 적재)
                        }
                    }
                }
        }
    }
}

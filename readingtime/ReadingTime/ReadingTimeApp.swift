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
    /// 키보드 윗변(화면 좌표). 숨으면 화면 아래로 나가 RTKeyboard.canvasInset 이 0 이 된다.
    @State private var keyboardMinY: CGFloat = .greatestFiniteMagnitude
    private let cloud: CloudStore
    private let uploader: RTSnapshotUploader
    private let dailySync: RTSnapshotUploader
    private let liveActivity = LiveActivityController()
    private let location: LocationCapture

    init() {
        let launchArgs = ProcessInfo.processInfo.arguments
        let sequenceLaunch = launchArgs.contains("--seq")
        let regErrors = RTFonts.register()
        if !regErrors.isEmpty {
            assertionFailure("폰트 등록 실패: \(regErrors.joined(separator: "; "))")
        }
        let cloud = CloudStore()
        self.cloud = cloud

        let model = RTAppModel()
        model.sessionSeed = 0   // 실앱: 세션은 0초부터 (데모 시드 26:14 는 rtshot/rtapp 전용)

        // 서버 스냅샷 업로드 — 한 번에 하나, 마지막 것 우선. 실패하면 설정 시트에 '동기화 … 부터 실패' 가 뜬다.
        let uploader = RTSnapshotUploader(upload: { try await cloud.uploadUserData($0) },
                                          onResult: { [weak model] ok in
            model?.noteSyncResult(ok)
            if !ok { Logger(subsystem: "com.leftjap.readingtime", category: "sync").error("스냅샷 업로드 실패") }
        })
        self.uploader = uploader
        // readingtime_daily(Cue 앱이 읽음)를 앱 기록 합에 맞춘다 — 서버 값과 다른 행만, 한 번에 하나씩
        let dailySync = RTSnapshotUploader(upload: { [weak model] _ in
            guard let model else { return }
            try await Self.syncPaperDaily(model: model, cloud: cloud)
        }, onResult: { ok in
            if !ok { Logger(subsystem: "com.leftjap.readingtime", category: "sync").error("readingtime_daily 맞추기 실패") }
        })
        self.dailySync = dailySync

        // 실데이터 정본 (§6-④) — UserDefaults JSON 영속 (개인 앱: 로컬이 정본)
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        if sequenceLaunch {
            model.userData = RTUserData()
        } else {
            let local = RTUserData.loadLocal(UserDefaults.standard.data(forKey: "rt.userData"))
            model.userData = local.data
            model.needsUserDataRestore = local.needsRestore
            // 못 읽은 원본은 서버 복원이 rt.userData 를 덮기 전에 Documents 에 따로 둔다 (devicectl 로 회수 가능)
            if let raw = local.unreadable { Self.keepUnreadable(raw) }
        }
        if !sequenceLaunch {
            model.onUserDataChange = { [weak model] data in
                let enc = JSONEncoder()
                enc.dateEncodingStrategy = .iso8601
                if let raw = try? enc.encode(data) {
                    UserDefaults.standard.set(raw, forKey: "rt.userData")
                    // 함께 읽기 — 파트너가 읽도록 스냅샷 업로드 (로그인 시에만 실동작)
                    if model?.needsUserDataRestore == false, let json = String(data: raw, encoding: .utf8) {
                        uploader.submit(json)
                        dailySync.submit("")
                    }
                }
            }
            model.onSyncRetry = { [weak model] in Self.uploadSnapshot(from: model, to: uploader) }
        }
        // 읽는 중 프레즌스 — 세션 시작/정지 시 reading_since 갱신 + 시작 시 읽은 위치 캡처(§13)
        let location = LocationCapture()
        self.location = location
        if !sequenceLaunch {
            model.onReadingPresence = { reading in
                Task { try? await cloud.setReadingSince(reading ? Date() : nil) }
            }
            // 읽은 위치는 세션을 새로 시작할 때만 잡는다 (재개마다 잡으면 마지막 재개 위치가 세션 위치가 됐다)
            model.onSessionStart = { location.capture() }
            // 저장 시점에 세션에 부착할 위치 스냅샷 (미확보면 nil → 위치 없이 저장)
            model.locationProvider = { location.fix }
        }

        // 밀리 완독 처리 영속 — 제목 → 완독 시각. 이후 더 최신 밀리 기록이 오면 카드가 되살아난다.
        if !sequenceLaunch,
           let raw = UserDefaults.standard.data(forKey: "rt.finishedEbooks"),
           let saved = try? dec.decode([String: Date].self, from: raw) {
            model.finishedEbooks = saved
        }
        if !sequenceLaunch {
            model.onFinishedEbooksChange = { map in
                let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
                if let raw = try? enc.encode(map) {
                    UserDefaults.standard.set(raw, forKey: "rt.finishedEbooks")
                }
            }
        }

        // 홈에서 지운 밀리 책 (사용자 결정 2026-09-15) — 완독과 달리 다시 올라오지 않는다.
        if !sequenceLaunch,
           let raw = UserDefaults.standard.data(forKey: "rt.hiddenEbooks"),
           let saved = try? dec.decode(Set<String>.self, from: raw) {
            model.hiddenEbooks = saved
        }
        if !sequenceLaunch {
            model.onHiddenEbooksChange = { set in
                if let raw = try? JSONEncoder().encode(set) {
                    UserDefaults.standard.set(raw, forKey: "rt.hiddenEbooks")
                }
            }
        }

        // 밀리 숨김·완독 표시를 스냅샷과 맞춘다 — 업데이트 뒤 첫 실행이면 기기에만 있던 표시를 스냅샷에 싣는다.
        // 스냅샷을 바꾸는 다른 동작(아래 복구 등)보다 먼저 해야 스냅샷에 있던 표시를 잃지 않는다.
        if !sequenceLaunch { model.mergeEbookMarks() }

        // 책 없이 저장된 과거 기록 복구 — 2026-09-15 에 89분 탭 세션이 isbn:null 로 남았다.
        // 재발은 startSession 의 currentBook 폴백이 막고, 여기선 기존 기록만 되살린다.
        if !sequenceLaunch { model.repairUnattributedSessions() }

        // 개인 앱: 로그인 1회 유지 (로그아웃 시까지) — UserDefaults 영속
        if !sequenceLaunch {
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

            if UserDefaults.standard.bool(forKey: "rt.loggedIn"), !model.needsUserDataRestore {
                // 표시 이름: 마지막 로그인 값으로 즉시 표시 (오프라인 콜드스타트) — restore() 가 갱신
                model.displayName = UserDefaults.standard.string(forKey: "rt.displayName")
                model.nav(.home)
                Self.armPickupIfFirstToday(model)   // 하루 첫 실행 안무(#7a) — 읽던 책 있을 때 1회
                Self.applyCachedPartner(to: model)   // 함께 읽기 — 캐시된 파트너 즉시 표시(팝인 제거)
                // 진행 중이던 세션 복원 — 실기기 실측(2026-09-02): 메모리에만 있던 세션이 앱 종료로 유실
                // (09-01 16:16 시작분이 프레즌스만 남기고 사라짐). 일시정지 상태로 타이머 화면에 되살린다.
                if let raw = UserDefaults.standard.data(forKey: "rt.session"),
                   let saved = try? JSONDecoder().decode(RTSession.self, from: raw) {
                    model.restoreSession(saved)
                }
            }
            // 세션 영속 — 변화(시작·틱·일시정지·저장)마다 저장, 세션이 없어지면 삭제.
            // --seq(검증 실행)는 userData 와 같은 이유로 미배선 — 시뮬레이터 잔존값이 실행 간에 새지 않게.
            if !sequenceLaunch {
                model.onSessionPersist = { s in
                    if let s, let raw = try? JSONEncoder().encode(s) {
                        UserDefaults.standard.set(raw, forKey: "rt.session")
                    } else {
                        UserDefaults.standard.removeObject(forKey: "rt.session")
                    }
                }
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
                        if !cloud.signedIn { try await cloud.signInWithGoogle() }
                        Self.applyDisplayName(from: cloud, to: model)
                        if let model {
                            try await Self.restoreSnapshot(from: cloud, to: model)
                            Self.uploadSnapshot(from: model, to: uploader)
                            if !model.needsUserDataRestore { dailySync.submit("") }
                            await Self.loadPartner(from: cloud, to: model)
                            await Self.loadEbook(from: cloud, to: model)
                        }
                    } catch {
                        Logger(subsystem: "com.leftjap.readingtime", category: "auth")
                            .error("google 로그인 실패/취소: \(String(describing: error), privacy: .public)")
                    }
                }
            }
        }

        // 시뮬레이터 검증용: simctl launch ... --seq "login,start" --sim-motion "1:0.95,8:0.2"
        // (--seq = 상태 진입, --sim-motion = 합성 gravity.z 주입 — CoreMotion 없는 시뮬에서 flip 재현)
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

        // 밀리 편입 직후 알라딘 ISBN 매칭 (실패해도 밀리 키로 그대로 운영 — 조용히 무시)
        model.onMillieAdopted = { [weak model] key in
            Task { @MainActor in await model?.matchAdoptedMillieBook(key) }
        }
        let aladin = AladinClient()
        model.searchProvider = { query in
            try await aladin.search(query: query, maxResults: 10).map {
                RTBookHit(title: $0.title, author: Aladin.cleanAuthor($0.author),
                          publisher: $0.publisher, isbn: $0.isbn, coverUrl: $0.coverUrl)
            }
        }
        // 최근 검색어 영속 — 다시 켜도 책 추가 시트(검색칸 공란)에 목록으로 보인다. 11-08 판이 저장한
        // 마지막 검색(rt.lastSearch.*)은 검색어만 첫 항목으로 옮기고 지운다.
        // --seq(검증 실행)는 userData 와 같은 이유로 미배선.
        if !sequenceLaunch {
            let d = UserDefaults.standard
            model.restoreRecentQueries(RTAppModel.loadRecentQueries(
                saved: d.stringArray(forKey: "rt.recentQueries"),
                legacyQuery: d.string(forKey: "rt.lastSearch.query")))
            d.set(model.recentQueries, forKey: "rt.recentQueries")
            d.removeObject(forKey: "rt.lastSearch.query")
            d.removeObject(forKey: "rt.lastSearch.hits")
            model.onRecentQueriesChange = { d.set($0, forKey: "rt.recentQueries") }
        }
        // --stub-search <ok|many|empty|timeout|flaky>: 시뮬레이터 UI 검증용 검색 스텁 (XCUITest 전용 —
        // 실기기 실행엔 이 인자가 없어 항상 라이브 프록시). flaky = 첫 호출 시간 초과 → "다시 시도" 성공.
        if let i = launchArgs.firstIndex(of: "--stub-search"), launchArgs.count > i + 1 {
            model.searchProvider = Self.stubSearch(mode: launchArgs[i + 1])
        }
        // 잠금 화면 탭 모드 버튼(RTToggleReadingIntent) — 앱 프로세스에서 실행된다. 백그라운드에선 화면의
        // onReceive 가 늦을 수 있어 Live Activity 도 여기서 바로 맞춘다.
        let la = liveActivity
        RTLiveActivityBridge.toggle = { [weak model] in
            guard let model, model.session?.mode == .tap else { return }
            model.togglePause()
            la.sync(session: model.session, bookTitle: model.sessionBook?.title ?? model.currentBook?.title)
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

    /// 로컬 사본이 없으면 업로드보다 먼저 본인 서버 스냅샷을 복원한다.
    @MainActor private static func restoreSnapshot(from cloud: CloudStore, to model: RTAppModel) async throws {
        guard cloud.signedIn else { return }
        try await model.restoreUserDataIfNeeded { try await cloud.fetchUserData() }
        guard cloud.signedIn, model.route == .login else { return }
        model.login()
        if let raw = UserDefaults.standard.data(forKey: "rt.session"),
           let saved = try? JSONDecoder().decode(RTSession.self, from: raw) {
            model.restoreSession(saved)
        }
    }

    /// 내 RTUserData 스냅샷을 클라우드에 1회 업로드 (앱 시작·실패 후 복귀·설정 시트 재시도 — 파트너가 최신 상태를 읽도록).
    @MainActor private static func uploadSnapshot(from model: RTAppModel?, to uploader: RTSnapshotUploader) {
        guard model?.needsUserDataRestore == false, let data = model?.userData else { return }
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        guard let raw = try? enc.encode(data), let json = String(data: raw, encoding: .utf8) else { return }
        uploader.submit(json)
    }

    /// readingtime_daily 를 앱 기록 합(RTDailyMirror)에 맞춘다. 서버에서 내 행을 읽어 값이 다른 행만 덮어쓰고,
    /// 서버에만 있는 행(지운 기록)은 0 으로 둔다. 로컬 사본이 복원되기 전엔 하지 않는다 — 빈 기록으로 서버를 0 으로 만든다.
    @MainActor private static func syncPaperDaily(model: RTAppModel, cloud: CloudStore) async throws {
        guard cloud.signedIn, !model.needsUserDataRestore, let data = model.userData else { return }
        let server = try await cloud.fetchPaperDaily()
        let have = Dictionary(server.map { (RTDailyMirror.Key(day: $0.day, source: $0.source), $0.seconds) },
                              uniquingKeysWith: +)
        for (k, sec) in RTDailyMirror.changes(want: RTDailyMirror.rows(data), server: have) {
            try await cloud.setPaperDaily(day: k.day, source: k.source, seconds: sec)
        }
    }

    /// 디코딩 못 한 로컬 사본 보관 — Documents/rt-userData-unreadable-<epoch>.json
    private static func keepUnreadable(_ raw: Data) {
        let log = Logger(subsystem: "com.leftjap.readingtime", category: "sync")
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("rt-userData-unreadable-\(Int(Date().timeIntervalSince1970)).json")
        do {
            try raw.write(to: url)
            log.error("로컬 기록을 읽지 못해 원본을 보관함: \(url.lastPathComponent, privacy: .public)")
        } catch {
            log.error("못 읽은 로컬 기록 보관 실패: \(String(describing: error), privacy: .public)")
        }
    }

    /// 밀리(전자책) 일별 초 로드 — book_reading_seconds 읽기 전용, 통계 표시 계층 합산.
    /// 실패/미로그인은 무시 (기존 값 유지).
    @MainActor private static func loadEbook(from cloud: CloudStore, to model: RTAppModel?) async {
        // 빈 응답 무시 — 미로그인 RLS 는 에러가 아니라 빈 배열(200)이라 데모 시드·기존 값을 지운다
        if let books = try? await cloud.fetchEbookBooks(), !books.isEmpty {
            model?.ebookBooks = Dictionary(grouping: books, by: \.day).mapValues { $0.map(\.title) }
            model?.ebookCovers = Dictionary(books.compactMap { r in r.cover_url.map { (r.title, $0) } },
                                            uniquingKeysWith: { a, _ in a })
            // 홈 카드 최근순 정렬용 — 제목별 최신 read_at (구 동기화분 nil 은 제외)
            model?.ebookReadAt = Dictionary(books.compactMap { r in r.read_at.map { (r.title, $0) } },
                                            uniquingKeysWith: { a, b in max(a, b) })
        }
        // 책 단위 메타 (서재 편입·ISBN 매칭 재료) — 제목 키, 같은 제목 재등록 시 최신 우선
        if let meta = try? await cloud.fetchMillieBooks(), !meta.isEmpty {
            model?.millieMeta = Dictionary(meta.map { r in
                (r.title, RTMillieMeta(bookId: r.book_id, author: r.author,
                                       publisher: r.publisher, coverUrl: r.cover_url))
            }, uniquingKeysWith: { _, b in b })
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
        // reading_since 뒤에 끝난 세션이 있으면 그 독서는 이미 끝났다 — 시각만 보면
        // 세션이 끝난 뒤에도 최대 12시간 "지금 읽는 중"이 뜬다(실측 2026-09-16).
        model?.partnerReadingNow = RTAppModel.partnerIsReading(
            since: snap.readingSince,
            lastSessionEnd: pdata.sessions.max { $0.endedAt < $1.endedAt }?.endedAt,
            now: Date())
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
        model?.partnerReadingNow = RTAppModel.partnerIsReading(
            since: since,
            lastSessionEnd: pdata.sessions.max { $0.endedAt < $1.endedAt }?.endedAt,
            now: Date())
    }

    /// 시뮬레이터 검증용 검색 스텁 (--stub-search). 응답은 2026-09-10 배포 프록시 실응답("서성이다" 1위) 그대로.
    /// 1.5초 지연 = "검색 중…" 이 실제로 그려지는지 볼 시간. 실패는 URLError.timedOut(상류 무응답과 같은 경로).
    private static func stubSearch(mode: String) -> (String) async throws -> [RTBookHit] {
        final class Calls { var n = 0 }
        let calls = Calls()
        let hit = RTBookHit(title: "서성이다", author: "장강명", publisher: "현대문학", isbn: "9791167903792",
                            coverUrl: "https://image.aladin.co.kr/product/39984/93/cover200/k362130735_1.jpg")
        return { _ in
            calls.n += 1
            try await Task.sleep(nanoseconds: 1_500_000_000)
            switch mode {
            case "ok": return [hit]
            case "many":   // 목록이 키보드 아래까지 내려가는 길이 (키보드 위 스크롤 검증)
                return (1...10).map { RTBookHit(title: "책 \($0)", author: "저자", publisher: "출판사",
                                                 isbn: "stub-\($0)", coverUrl: "") }
            case "empty": return []
            case "millieSlow":   // demoCards 밀리 책과 같은 책을 4.5초 늦게 — 편입 뒤 ISBN 승격이 상세를 연 뒤에 오는 경우 재현
                try await Task.sleep(nanoseconds: 4_500_000_000)
                return [RTBookHit(title: "삼미 슈퍼스타즈의 마지막 팬클럽", author: "박민규", publisher: "한겨레출판",
                                  isbn: "9788984319700", coverUrl: "")]
            case "timeout": throw URLError(.timedOut)
            case "flaky":
                if calls.n == 1 { throw URLError(.timedOut) }
                return [hit]
            default: throw URLError(.badServerResponse)
            }
        }
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

    /// 근접 센서 정책 — 화면 오프가 유효한 상태에서만: 대기(03)·홈(즉시 엎기 대상)·**기록 중**(엎힘).
    /// 일시정지(들어올림 감지 직후)엔 즉시 해제 — 모니터링이 꺼지면 근접에 의한 화면 오프
    /// 조건 자체가 사라진다. 라우트 기준만으로 관리하던 기존 배선은 paused 에도 켜져 있어,
    /// 집어드는 손이 수화부 센서를 덮으면 암전 유지 (검은 화면 버그 2026-07-16, rtdbg 20:49
    /// 실측: 들어올림 감지 후 활성 복귀까지 6~11초 × 3회 — 모델은 정상 pause/resume, 화면만 미복귀).
    @MainActor private static var proximityOn: Bool?
    private static func updateProximity(route: RTRoute, session: RTSession?, active: Bool) {
        let recording = session?.status == .recording
        let want = active && (route == .flipWait || route == .home
            || (route == .flipTimer && recording))
        guard want != proximityOn else { return }
        proximityOn = want
        UIDevice.current.isProximityMonitoringEnabled = want
        RTDbg.p("proximity: \(want ? "on" : "off") (route=\(route.rawValue), rec=\(recording), active=\(active))")
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

    static func isDarkRoute(_ r: RTRoute) -> Bool { r == .flipWait || r == .flipTimer || r == .tapTimer }

    /// 엎혀서 기록 중 = 화면이 바닥을 향한 상태 — 완전 검은 오버레이로 OLED 픽셀 오프(절전).
    /// 근접 센서(하드웨어 오프)의 백업이자, 센서가 안 덮이는 표면에서도 배터리를 지킨다.
    /// 실제 엎힘(flip.isFaceDown)까지 봐야 한다 — 화면 탭으로 이어 읽으면 손에 든 채 기록 중이다.
    private var faceDownDark: Bool {
        model.route == .flipTimer && model.session?.status == .recording && flip.isFaceDown
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
                    .environment(\.rtKeyboardInset, RTKeyboard.canvasInset(
                        screenHeight: geo.size.height, keyboardMinY: keyboardMinY, scale: scale))
                    .frame(width: 390, height: 844)
                    .scaleEffect(scale)
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
            }
            .ignoresSafeArea()
            .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { n in
                if let end = n.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect { keyboardMinY = end.minY }
            }
            .overlay {
                if faceDownDark {
                    Color.black.ignoresSafeArea()
                }
            }
            .animation(.easeOut(duration: 0.25), value: faceDownDark)
            .statusBarHidden(faceDownDark)
            // 어두운 타이머 화면(03~05)은 밝은 상태 표시줄, 나머지는 어두운 상태 표시줄 — 정해 두지 않으면 기본(어두운 글자)이라
            // 03~05 에서 시계·배터리가 배경에 묻혔다. 밝은 화면을 .light 로 고정하면 기기를 다크 모드로 써도 경고창·
            // 날짜 휠·키보드가 종이 배경 위에서 흰 글자로 그려지지 않는다(2026-11-08 검토).
            .preferredColorScheme(Self.isDarkRoute(model.route) ? .dark : .light)
                .task {
                    let demoLaunch = ProcessInfo.processInfo.arguments.contains("--seq")
                    // --seq 데모/테스트는 로컬 상태를 명시 주입하므로 클라우드가 덮어쓰지 않게 격리한다.
                    guard !demoLaunch else { return }
                    await cloud.restore()
                    if !cloud.signedIn && UserDefaults.standard.bool(forKey: "rt.loggedIn") {
                        // 세션 소실(만료/미인증) — 로컬 플래그만 로그인 상태라 홈은 뜨나 클라우드 동기화 불가.
                        // 재로그인 유도(로컬 데이터·아바타 보존 — onAuthChange 미발화). 재로그인 시 동기화 재개.
                        UserDefaults.standard.set(false, forKey: "rt.loggedIn")
                        model.nav(.login)
                    } else {
                        Self.applyDisplayName(from: cloud, to: model)
                        do {
                            try await Self.restoreSnapshot(from: cloud, to: model)
                            Self.uploadSnapshot(from: model, to: uploader)
                            if !model.needsUserDataRestore { dailySync.submit("") }
                            await Self.loadPartner(from: cloud, to: model)
                            await Self.loadEbook(from: cloud, to: model)
                        } catch {
                            Logger(subsystem: "com.leftjap.readingtime", category: "sync")
                                .error("서버 데이터 복원 실패: \(String(describing: error), privacy: .public)")
                        }
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
                    Self.updateProximity(route: route, session: model.session, active: scenePhase == .active)
                    // 홈·엎기 대기·타이머 화면에서 센서 가동. keep-alive 는 녹화 대기/중에만.
                    if sensorSession { flip.startMonitoring() } else { flip.stopMonitoring() }
                    if awakeSession { keepAlive.start() } else { keepAlive.stop() }
                }
                .onReceive(model.$session) { session in
                    Self.updateAwake(route: model.route, session: session)
                    // 들어올림(일시정지) 순간 근접 모니터링 해제 — 집어드는 손이 센서를 덮고
                    // 있어도 화면 강제 재점등 (검은 화면 버그 2026-07-16, rtdbg 20:49 실측)
                    Self.updateProximity(route: model.route, session: session, active: scenePhase == .active)
                }
                .onReceive(model.$sheet) { sheet in
                    // 시간 직접 추가도 읽은 위치 부착 — 시트 열림 시 캡처, 저장은 addTime 이 provider 로
                    if sheet == .addtime { location.capture() }
                }
                .onReceive(model.$session) { session in
                    // 잠금 화면 Live Activity — 상태 전환만 반영(초 틱은 시스템 자동 타이머)
                    liveActivity.sync(session: session, bookTitle: model.sessionBook?.title ?? model.currentBook?.title)
                }
                .onChange(of: scenePhase) { _, phase in
                    // 근접 센서는 포그라운드 전용 — 비잠금 엎힘의 화면 오프용이며 잠금 시엔
                    // 화면이 이미 꺼져 있어 무용. 잠금+센서 덮임이 AudioServices 진동을
                    // 간섭하는 정황(7차 실기기: 진동 미발생) 배제 목적.
                    Self.updateProximity(route: model.route, session: model.session, active: phase == .active)
                    // 백그라운드↔포그라운드 전환마다 모션 스트림 재시작 (iOS 11+ 버그 대응)
                    if phase == .background || phase == .active {
                        flip.handleScenePhaseChange()
                    }
                    if phase == .background {
                        flip.noteBackgrounded()   // 비잠금 배경 진입 = 홈 이탈 → 엎힘 무장 해제
                    }
                    if phase == .active {
                        flip.setUnlockedOnActive()   // 포그라운드 = 확실한 비잠금 (lockstate 오발화 보정)
                        model.refreshElapsed()   // 백그라운드 동안 멈춘 틱을 세션 벽시계 기준점으로 보정 (엎기·탭 공통)
                        // 홈으로 복귀 시 그 날짜 첫 진입이면 집어드는 안무 (§4)
                        if model.route == .home { Self.armPickupIfFirstToday(model) }
                        // 지난 업로드가 실패했으면 복귀할 때 다시 올린다 (네트워크가 돌아왔을 수 있다)
                        // (onSyncRetry 는 --seq 검증 실행엔 배선하지 않는다 — 로그인 없는 업로드가 '성공'으로 끝나 실패 표시를 지운다)
                        if model.syncFailedAt != nil { model.onSyncRetry?() }
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

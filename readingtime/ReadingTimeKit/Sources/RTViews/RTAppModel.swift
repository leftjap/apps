import Foundation
import Combine

// 앱 상태 머신 — 인터랙션 정본 prototype/app.js 이식.
// 라우트·모드·세션·시트·데모 상태 전부 여기서 관리. 화면은 이 모델을 주입받아 렌더만 한다.
// 시간 의존(탭존 250ms 디바운스·초 틱)은 주입 가능하게 분리 — 테스트는 수동 스케줄러 사용.

public enum RTRoute: String, Sendable {
    case login = "01"
    case home = "02"
    case flipWait = "03"
    case flipTimer = "04"
    case tapTimer = "05"
    case done = "06"
    case detail = "08"
    case statsWeek = "10"
    case statsMonth = "11"
    case library = "12"
    case emptyHome = "14"
}

public enum RTSheet: String, Sendable {
    case addtime, finish, addbook, settings, sort, bookmenu
}

public enum RTMode: String, Sendable { case flip, tap }
public enum RTSessionStatus: Sendable { case recording, paused }

public struct RTSession: Sendable {
    public var mode: RTMode
    public var status: RTSessionStatus
    public var elapsed: Int          // 초 (데모 셸: app.js 와 동일하게 초 틱 누적)
    public var pauseCount: Int
}

public enum RTLibraryFilter: String, Sendable { case all, reading, finished }
public enum RTLibrarySort: String, Sendable { case recent, name, rating }

// 검색 결과 (알라딘 BookMeta 의 UI 표시 서브셋 — RTViews 는 ReadingTimeKit 비의존)
public struct RTBookHit: Equatable, Sendable {
    public let title: String
    public let author: String
    public let publisher: String
    public let isbn: String
    public let coverUrl: String

    public init(title: String, author: String, publisher: String, isbn: String, coverUrl: String) {
        self.title = title
        self.author = author
        self.publisher = publisher
        self.isbn = isbn
        self.coverUrl = coverUrl
    }
}

// 탭존 디바운스용 스케줄러 — 테스트에서 수동 발화 가능하게 주입
public protocol RTTapScheduler {
    /// work 를 delay 후 실행 예약. 반환값 = 취소 클로저.
    func schedule(after delay: TimeInterval, _ work: @escaping @MainActor () -> Void) -> () -> Void
}

public struct RTDispatchTapScheduler: RTTapScheduler {
    public init() {}
    public func schedule(after delay: TimeInterval, _ work: @escaping @MainActor () -> Void) -> () -> Void {
        let item = DispatchWorkItem { Task { @MainActor in work() } }
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
        return { item.cancel() }
    }
}

@MainActor
public final class RTAppModel: ObservableObject {
    // app.js state 대응
    @Published public var route: RTRoute = .login
    @Published public var mode: RTMode = .flip
    @Published public var session: RTSession?
    @Published public var justResumed = false
    @Published public var sheet: RTSheet?
    @Published public var addtimeValue = 35          // 시안 데모 상태
    @Published public var addtimePreset: Int? = 15
    @Published public var rating = 4                 // 09 데모: 4★
    @Published public var added: Set<String> = ["flow"]  // 13 데모: 첫 행 추가됨
    @Published public var libraryFilter: RTLibraryFilter = .all
    @Published public var librarySort: RTLibrarySort = .recent
    @Published public var weekSel = 3                // 10 데모: 목요일 선택

    // 데모 시드: 시안 데모 값(00:26:14)과 일치 — 세션 시작 시 26:14 경과로 시작
    public static let demoElapsed = 26 * 60 + 14

    /// 세션 시작 경과 시드 — 데모(rtshot·rtapp)는 26:14, iOS 실앱은 0 으로 설정
    public var sessionSeed = RTAppModel.demoElapsed

    public static let ratingLabels = [1: "아쉬웠어요", 2: "그저 그랬어요", 3: "좋았어요",
                                      4: "아주 좋았어요", 5: "최고였어요"] // 4★=시안 확정, 나머지 임시

    // ── 통합 훅 (rtapp/iOS 앱이 배선: CloudStore·AladinClient) ──
    /// 저장하기 시 (모드, 경과초) — CloudStore.addPaperSeconds 배선용. 삭제는 미발화.
    public var onSessionSaved: ((RTMode, Int) -> Void)?
    /// 로그인(true)/로그아웃(false) — 개인 앱: 앱이 UserDefaults 로 영속해 1회 로그인 유지
    public var onAuthChange: ((Bool) -> Void)?
    /// 검색 프로바이더 (알라딘 라이브) — nil 이면 시트 13 은 시안 데모 rows 유지
    public var searchProvider: ((String) async throws -> [RTBookHit])?
    @Published public var searchQuery = "몰입"
    @Published public var searchResults: [RTBookHit]?

    private let tapScheduler: RTTapScheduler
    private var cancelPendingTap: (() -> Void)?

    public init(tapScheduler: RTTapScheduler = RTDispatchTapScheduler()) {
        self.tapScheduler = tapScheduler
    }

    public func search(_ q: String) async {
        searchQuery = q
        guard let searchProvider else { return }
        if let hits = try? await searchProvider(q) {
            searchResults = hits
        }
    }

    // ── 라우팅 (app.js nav) ──
    public func nav(_ to: RTRoute) {
        if sheet != nil { sheet = nil }
        route = to
    }

    /// 해시 별칭 07=02+addtime, 09=08+finish, 13=12+addbook (app.js SHEET_ROUTES)
    public func navScreenID(_ id: String) {
        switch id {
        case "07": nav(.home); sheet = .addtime
        case "09": nav(.detail); sheet = .finish
        case "13": nav(.library); sheet = .addbook
        default:
            if let r = RTRoute(rawValue: id) { nav(r) } else { nav(.home) }
        }
    }

    public func openSheet(_ s: RTSheet) { sheet = s }
    public func closeSheet() { sheet = nil }

    // ── 액션 (app.js data-act 대응) ──
    public func login() {
        nav(.home)
        onAuthChange?(true)
    }

    public func setMode(_ m: RTMode) { mode = m }

    public func start() {
        if mode == .flip { nav(.flipWait) }
        else { startSession(.tap); nav(.tapTimer) }
    }

    public func cancelSession() { session = nil; nav(.home) }

    public func simFlip() { startSession(.flip); nav(.flipTimer) }

    public func switchTap() { mode = .tap; startSession(.tap); nav(.tapTimer) }

    public func togglePause() {
        guard var s = session else { return }
        if s.status == .recording { s.status = .paused; s.pauseCount += 1 }
        else { s.status = .recording; justResumed = true }
        session = s
    }

    public func endSession() {
        if var s = session { s.status = .paused; session = s }
        nav(.done)
    }

    public func saveSession() {
        if let s = session { onSessionSaved?(s.mode, s.elapsed) }
        session = nil
        nav(.home)
    }

    public func deleteSession() { session = nil; nav(.home) }

    public func continueReading() { start() }

    // 탭 존: 단일 탭 = 일시정지/재개, 더블 탭 = 종료 (~250ms 디바운스, app.js handleTapZone)
    public func tapZone() {
        if let cancel = cancelPendingTap {
            cancel()
            cancelPendingTap = nil
            endSession()
            return
        }
        cancelPendingTap = tapScheduler.schedule(after: 0.25) { [weak self] in
            guard let self else { return }
            self.cancelPendingTap = nil
            self.togglePause()
        }
    }

    // ── 07 시간 직접 추가 ──
    public func step(_ d: Int) {
        addtimeValue = max(5, addtimeValue + d)
        addtimePreset = nil
    }

    public func preset(_ n: Int) {
        addtimeValue += n            // 가산형 (시안 데모: 35 + "+15" 선택 상태)
        addtimePreset = n
    }

    public func addTime() {
        addtimeValue = 35
        addtimePreset = 15
        closeSheet()
    }

    // ── 09 완독 별점 ──
    public func rate(_ n: Int) { rating = n }
    public func saveFinished() { closeSheet(); nav(.library) }

    // ── 13 책 추가 ──
    public func toggleAdd(_ key: String) {
        if added.contains(key) { added.remove(key) } else { added.insert(key) }
    }

    // ── 설정·책 메뉴 ──
    public func logout() {
        closeSheet()
        nav(.login)
        onAuthChange?(false)
    }
    public func deleteBook() { closeSheet(); nav(.library) }

    // ── 12 서재 ──
    public func setLibraryFilter(_ f: RTLibraryFilter) { libraryFilter = f }
    public func setLibrarySort(_ s: RTLibrarySort) { librarySort = s; closeSheet() }

    // ── 10 주간 차트 ──
    public func selectWeek(_ i: Int) { weekSel = i }

    // ── 타이머 틱 (app.js startTick — recording 일 때만 1초 증가) ──
    public func tick() {
        guard var s = session, s.status == .recording else { return }
        s.elapsed += 1
        session = s
    }

    // ── 세션 시작 (app.js startSession — 시드는 sessionSeed) ──
    public func startSession(_ mode: RTMode) {
        session = RTSession(mode: mode, status: .recording,
                            elapsed: sessionSeed, pauseCount: 0)
    }

    /// wall-clock 재동기화 (iOS: 백그라운드 경과를 FlipEngine 이 실측 → UI 반영)
    public func syncElapsed(_ seconds: Int) {
        guard var s = session else { return }
        s.elapsed = seconds
        session = s
    }

    // ── 액션 문자열 적용 (rtshot --seq 상태 파라미터 렌더용) ──
    public func apply(_ action: String) {
        let parts = action.split(separator: ":", maxSplits: 1).map(String.init)
        let arg = parts.count > 1 ? parts[1] : ""
        switch parts[0] {
        case "login": login()
        case "nav": navScreenID(arg)
        case "sheet": RTSheet(rawValue: arg).map { openSheet($0) }
        case "closeSheet": closeSheet()
        case "mode": RTMode(rawValue: arg).map { setMode($0) }
        case "start": start()
        case "cancelSession": cancelSession()
        case "simFlip": simFlip()
        case "switchTap": switchTap()
        case "togglePause": togglePause()
        case "endSession": endSession()
        case "tapZone": tapZone()
        case "save": saveSession()
        case "delete": deleteSession()
        case "continueReading": continueReading()
        case "step": Int(arg).map { step($0) }
        case "preset": Int(arg).map { preset($0) }
        case "addTime": addTime()
        case "rate": Int(arg).map { rate($0) }
        case "saveFinished": saveFinished()
        case "toggleAdd": toggleAdd(arg)
        case "logout": logout()
        case "deleteBook": deleteBook()
        case "filter": RTLibraryFilter(rawValue: arg).map { setLibraryFilter($0) }
        case "sort": RTLibrarySort(rawValue: arg).map { setLibrarySort($0) }
        case "week": Int(arg).map { selectWeek($0) }
        case "tick": tick()
        default: break
        }
    }

    // ── 파생값 (app.js hmsParts·sessionMin) ──
    public var sessionMinutes: Int { (session?.elapsed ?? 0) / 60 }

    public static func hms(_ sec: Int) -> (h: String, m: String, s: String) {
        func f(_ n: Int) -> String { String(format: "%02d", n) }
        return (f(sec / 3600), f(sec / 60 % 60), f(sec % 60))
    }
}

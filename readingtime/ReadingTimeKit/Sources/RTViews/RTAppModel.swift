import Foundation
import Combine
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

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
    public var startedAt: Date       // 세션 시작 시각 (06 원장 표시용 — 데모 렌더는 미사용)
    public var isbn: String? = nil   // 세션 대상 책 (시작 시점 캡처 — 기록 귀속·다크/완료/LA 표기)
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
    // 하루 첫 실행 안무(#7a) 재생 플래그 — 앱 셸이 UserDefaults 날짜 판정 후 홈 진입 시 1회 set.
    // 데모(rtshot/rtapp)·기본은 false → 홈은 정지 #7b (픽셀 오라클 불변)
    @Published public var playPickup = false
    // 프로필 표시 이름 — 앱 셸이 auth user_metadata.display_name 에서 주입.
    // nil/빈값 = 데모 정본 "지훈"/"지" 폴백 (rtshot/rtapp 픽셀 오라클 불변)
    @Published public var displayName: String?

    /// 표시 이름 (데모 폴백) — 홈 메뉴·설정 시트가 사용
    public var displayNameOrDemo: String {
        if let n = displayName, !n.isEmpty { return n }
        return "지훈"
    }
    /// 아바타 이니셜 — 표시 이름 첫 글자 (사진이 없을 때 쓰는 폴백)
    public var displayInitial: String { String(displayNameOrDemo.prefix(1)) }

    /// 아바타 사진 — 앱 셸이 Documents/rt-avatar.png 에서 주입.
    /// nil = 이니셜 폴백 (rtshot/rtapp 데모 픽셀 오라클 불변)
    @Published public var avatarImage: CGImage?

    // ── 함께 읽기(파트너 프레즌스) — README design_handoff_reading_together ──
    /// 통계 화면 주체: 내 통계(.me) vs 파트너 통계(.partner). 홈 파트너 행 탭 시 .partner.
    public enum StatsSubject: Sendable { case me, partner }
    @Published public var statsSubject: StatsSubject = .me

    /// 파트너 데이터 (공유 Supabase 로드 — 백엔드 RLS/프레즌스는 별도 작업). nil = 데모(시안 값)로 렌더.
    @Published public var partnerData: RTUserData?
    /// 파트너 사진 (미커밋 → nil, 이니셜 "소" 폴백)
    @Published public var partnerAvatar: CGImage?
    /// 파트너 이름 — 보는 사람 기준(지오 폰=소연, 소연 폰=지오). 앱이 uid→이름 주입.
    /// 데모/미로그인 기본 "소연"(시안, 뷰어=지오 가정). rtshot 픽셀 오라클 불변.
    @Published public var partnerName: String = "소연"
    public var partnerInitial: String { String(partnerName.prefix(1)) }
    /// 파트너 "지금 읽는 중" 프레즌스 — 백엔드가 활성 세션 신호로 세팅(현재 미배선 → false)
    @Published public var partnerReadingNow = false

    /// 홈 파트너 행 탭 → 파트너 통계(주간)
    public func openPartnerStats() {
        statsSubject = .partner
        nav(.statsWeek)
    }
    /// 내 통계 진입 (홈 메뉴) — 주체 .me 리셋
    public func openMyStats() {
        statsSubject = .me
        nav(.statsWeek)
    }

    /// 데모 파트너 주입 (검증·기기 데모용 — 백엔드 배선 전) — 시안값(소연·작별하지 않는다·오늘 24분)
    /// reading=false 면 idle(3시간 전) — 마지막 세션 3시간 전, 링/헤일로 없음.
    public func loadDemoPartner(reading: Bool = true) {
        let t = now()
        let ended = reading ? t : t.addingTimeInterval(-3 * 3600)
        // 실 표지 URL(알라딘) — 파트너 통계 표지 로딩 검증용 실데이터
        let book = RTBook(isbn: "9788937489341", title: "차남들의 세계사", author: "이기호",
                          publisher: "민음사",
                          coverUrl: "https://image.aladin.co.kr/product/4443/8/cover200/8937489341_1.jpg",
                          addedAt: t)
        partnerData = RTUserData(books: [book],
            sessions: [RTSessionRecord(isbn: book.isbn, mode: "flip", seconds: 24 * 60, endedAt: ended, pauseCount: 0)])
        partnerReadingNow = reading
    }

    /// 사진 선택 저장 시 (설정 시트) — 앱 셸이 배선: Documents 파일 영속
    public var onAvatarChange: ((Data) -> Void)?

    /// 아바타 렌더 최대 변: 40pt 원 × 화면 스케일(≤1.13) × @3x ≈ 136px → 256 으로 충분
    public static let avatarMaxPixel = 256

    /// 원본 사진 데이터를 아바타 규격(긴 변 ≤ 256px)으로 줄이고 PNG 로 재인코딩.
    /// 디코딩 불가한 데이터면 nil. (ImageIO — iOS/macOS 공용이라 헤드리스 테스트 가능)
    nonisolated public static func prepareAvatar(_ raw: Data) -> (image: CGImage, data: Data)? {
        guard let src = CGImageSourceCreateWithData(raw as CFData, nil),
              let img = CGImageSourceCreateThumbnailAtIndex(src, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceThumbnailMaxPixelSize: avatarMaxPixel,
              ] as CFDictionary)
        else { return nil }
        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, UTType.png.identifier as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(dest, img, nil)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return (img, out as Data)
    }

    /// 사진 선택 (설정 시트) — 규격화 후 모델 반영 + onAvatarChange 발화.
    /// 디코딩 실패 시 기존 아바타·파일 유지 (rename 의 빈값 거부와 같은 규칙)
    public func setAvatar(_ raw: Data) {
        guard let p = Self.prepareAvatar(raw) else { return }
        avatarImage = p.image
        onAvatarChange?(p.data)
    }

    /// 이름 수정 저장 시 (설정 시트) — 앱 셸이 배선: UserDefaults 영속 + auth user_metadata 갱신
    public var onRename: ((String) -> Void)?

    /// 이름 수정 (SCREENS.md §설정 "이름 수정") — trim 후 빈값 거부, 모델 반영 + onRename 발화
    public func rename(_ raw: String) {
        let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        displayName = name
        onRename?(name)
    }

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
    /// 로그인 버튼 핸들러 (iOS OAuth 배선) — nil 이면 즉시 login() (rtshot/rtapp 데모 경로)
    public var loginHandler: (() -> Void)?
    /// 읽는 중 프레즌스 변화 (true=recording 시작, false=정지/종료) — 앱이 CloudStore.setReadingSince 배선
    public var onReadingPresence: ((Bool) -> Void)?
    private func emitPresence() { onReadingPresence?(session?.status == .recording) }

    // ── 실데이터 정본 (§6-④) — nil 이면 데모 모드 (rtshot/rtapp 픽셀 오라클 불변) ──
    @Published public var userData: RTUserData? {
        didSet { if let d = userData { added = Set(d.books.map(\.isbn)) } }
    }
    /// 변경 영속 훅 (앱: UserDefaults JSON 저장)
    public var onUserDataChange: ((RTUserData) -> Void)?
    /// 시간 주입 (테스트 결정적 실행)
    public var now: () -> Date = { Date() }

    private func mutateUserData(_ mutate: (inout RTUserData) -> Void) {
        guard var d = userData else { return }
        mutate(&d)
        userData = d
        onUserDataChange?(d)
    }

    /// 홈 히어로 — 미완독 중 max(추가 시각, 마지막 세션 시각) 최신 책.
    /// 새로 추가한 책이 히어로가 되되, 다시 읽기 등 세션을 기록한 책이 있으면 그 책 우선.
    public var currentBook: RTBook? {
        guard let d = userData else { return nil }
        var lastRead = [String: Date]()
        for s in d.sessions {
            if let i = s.isbn, s.endedAt > (lastRead[i] ?? .distantPast) { lastRead[i] = s.endedAt }
        }
        func key(_ b: RTBook) -> Date { max(b.addedAt, lastRead[b.isbn] ?? .distantPast) }
        return d.books.filter { !$0.finished }.max { key($0) < key($1) }
    }

    /// 진행 중(또는 flip 대기로 보류 중) 세션의 대상 책 — 다크 03~05·완료 06·라이브 액티비티 표기용
    public var sessionBook: RTBook? {
        guard let isbn = session?.isbn ?? nextSessionISBN else { return nil }
        return userData?.books.first { $0.isbn == isbn }
    }

    /// 상세(08)·완독(09)·책메뉴 대상 — 서재에서 탭한 책, 미지정이면 읽는 중 책
    @Published public var selectedISBN: String?
    public var selectedBook: RTBook? {
        guard let d = userData else { return nil }
        if let isbn = selectedISBN, let b = d.books.first(where: { $0.isbn == isbn }) { return b }
        return currentBook
    }
    /// 파트너 상세 대상 책 — 파트너 통계에서 탭한 책(partnerData 기준, 읽기전용)
    public var partnerSelectedBook: RTBook? {
        guard let isbn = selectedISBN else { return nil }
        return partnerData?.books.first { $0.isbn == isbn }
    }

    /// 통계 랭킹 책 탭 → 그 책 상세(08). statsSubject 유지(파트너면 파트너 상세).
    public func openBookDetail(isbn: String) {
        selectedISBN = isbn
        nav(.detail)
    }

    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 2   // 월요일 시작 (v8 주간 통계)
        return c
    }

    public var todaySeconds: Int {
        guard let d = userData else { return 0 }
        let t = now()
        return d.sessions.filter { cal.isDate($0.endedAt, inSameDayAs: t) }
            .reduce(0) { $0 + $1.seconds }
    }

    public var weekSeconds: Int { weekSeconds(offset: 0) }

    /// offset 주(0=이번 주, -1=지난주) 총 초
    public func weekSeconds(offset: Int) -> Int {
        guard let d = userData,
              let base = cal.date(byAdding: .weekOfYear, value: offset, to: now()),
              let week = cal.dateInterval(of: .weekOfYear, for: base) else { return 0 }
        return d.sessions.filter { week.contains($0.endedAt) }.reduce(0) { $0 + $1.seconds }
    }

    /// 이번 주(월~일) 일별 분
    public var weekDayMinutes: [Int] {
        var per = [Int](repeating: 0, count: 7)
        guard let d = userData, let week = cal.dateInterval(of: .weekOfYear, for: now()) else { return per }
        for s in d.sessions where week.contains(s.endedAt) {
            let idx = cal.dateComponents([.day], from: week.start, to: cal.startOfDay(for: s.endedAt)).day ?? 0
            if (0..<7).contains(idx) { per[idx] += s.seconds }
        }
        return per.map { $0 / 60 }
    }

    /// 이번 주 시작일 (월요일)
    public var weekStart: Date {
        cal.dateInterval(of: .weekOfYear, for: now())?.start ?? now()
    }

    public func totalSeconds(isbn: String) -> Int {
        userData?.sessions.filter { $0.isbn == isbn }.reduce(0) { $0 + $1.seconds } ?? 0
    }

    public func sessionCount(isbn: String) -> Int {
        userData?.sessions.filter { $0.isbn == isbn }.count ?? 0
    }

    /// 최신순 세션 기록
    public func recentRecords(_ limit: Int) -> [RTSessionRecord] {
        Array((userData?.sessions ?? []).sorted { $0.endedAt > $1.endedAt }.prefix(limit))
    }

    /// 홈 '마지막 기록' 행 탭 — 그 기록의 책 상세(08).
    /// 기록 isbn 없음(수동 세션)·기록 없음이면 selectedISBN=nil → selectedBook 이 읽는 중 책 폴백.
    public func openRecentDetail() {
        selectedISBN = recentRecords(1).first?.isbn
        nav(.detail)
    }

    /// 이번 주(월~일) 일별 비율 (최댓값=1, 기록 없으면 0)
    public var weekBarRatios: [Double] {
        var per = [Double](repeating: 0, count: 7)
        guard let d = userData, let week = cal.dateInterval(of: .weekOfYear, for: now()) else { return per }
        for s in d.sessions where week.contains(s.endedAt) {
            let idx = cal.dateComponents([.day], from: week.start, to: cal.startOfDay(for: s.endedAt)).day ?? 0
            if (0..<7).contains(idx) { per[idx] += Double(s.seconds) }
        }
        let mx = per.max() ?? 0
        return mx > 0 ? per.map { $0 / mx } : per
    }

    /// 오늘의 주간 인덱스 (0=월)
    public var weekTodayIndex: Int {
        guard let week = cal.dateInterval(of: .weekOfYear, for: now()) else { return 0 }
        return min(6, max(0, cal.dateComponents([.day], from: week.start, to: cal.startOfDay(for: now())).day ?? 0))
    }

    /// "7:26" (시:분)
    public static func hmString(_ sec: Int) -> String {
        "\(sec / 3600):" + String(format: "%02d", sec / 60 % 60)
    }

    /// 최근 기록 시점 표기 — 오늘="오늘 HH:mm", 어제="어제 HH:mm", 그 외="M.d"
    public static func recentWhen(_ date: Date, now: Date) -> String {
        let c = Calendar(identifier: .gregorian)
        func hhmm() -> String {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "HH:mm"
            return f.string(from: date)
        }
        if c.isDate(date, inSameDayAs: now) { return "오늘 " + hhmm() }
        if let y = c.date(byAdding: .day, value: -1, to: now), c.isDate(date, inSameDayAs: y) {
            return "어제 " + hhmm()
        }
        return "\(c.component(.month, from: date)).\(c.component(.day, from: date))"
    }

    /// 상대시간 "방금 / N분 전 / N시간 전 / N일 전" (파트너 idle 배지)
    public static func agoText(_ date: Date, now: Date) -> String {
        let s = max(0, Int(now.timeIntervalSince(date)))
        if s < 60 { return "방금" }
        if s < 3600 { return "\(s / 60)분 전" }
        if s < 86400 { return "\(s / 3600)시간 전" }
        return "\(s / 86400)일 전"
    }

    /// 연속 기록일 — 오늘 기록 없으면 어제까지의 연속을 유지 표시
    public var streakDays: Int {
        guard let d = userData, !d.sessions.isEmpty else { return 0 }
        let days = Set(d.sessions.map { cal.startOfDay(for: $0.endedAt) })
        var cursor = cal.startOfDay(for: now())
        if !days.contains(cursor) {
            cursor = cal.date(byAdding: .day, value: -1, to: cursor)!
            if !days.contains(cursor) { return 0 }
        }
        var n = 0
        while days.contains(cursor) {
            n += 1
            cursor = cal.date(byAdding: .day, value: -1, to: cursor)!
        }
        return n
    }
    /// 이 책과 함께한 날수 ("N일째") — addedAt 당일 = 1 (홈 라이브 칩). 데모는 시안 고정("18일째").
    public func daysSinceAdded(_ book: RTBook) -> Int {
        let from = cal.startOfDay(for: book.addedAt)
        let to = cal.startOfDay(for: now())
        return (cal.dateComponents([.day], from: from, to: to).day ?? 0) + 1
    }

    /// 최근 count 일의 기록 달성 여부 (index 0 = count-1일 전 … 마지막 = 오늘). 홈 연속 체인.
    /// userData 없으면(데모) 전부 false — 화면이 시안 고정 패턴을 그린다.
    public func streakChain(_ count: Int) -> [Bool] {
        guard let d = userData else { return [Bool](repeating: false, count: count) }
        let days = Set(d.sessions.map { cal.startOfDay(for: $0.endedAt) })
        let today = cal.startOfDay(for: now())
        return (0..<count).map { i in
            guard let day = cal.date(byAdding: .day, value: -(count - 1 - i), to: today) else { return false }
            return days.contains(day)
        }
    }
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

    /// 상세(08) 뒤로가기 목적지 — 진입 시점의 출처로 자동 유도 (홈 '마지막 기록' 진입이 생기며
    /// 기존 서재 하드코딩이 결함이 됨). 상세 내 재진입(09 완독 등)은 출처 유지.
    public private(set) var detailOrigin: RTRoute = .library

    // ── 라우팅 (app.js nav) ──
    public func nav(_ to: RTRoute) {
        if sheet != nil { sheet = nil }
        // 상세 뒤로가기 목적지 = 진입 출처. 홈·서재·통계(주/월)에서 진입 가능 → 그 route 유지.
        if to == .detail && route != .detail {
            detailOrigin = [.home, .library, .statsWeek, .statsMonth].contains(route) ? route : .library
        }
        if to == .home { statsSubject = .me }   // 홈 복귀 시 파트너 통계 주체 리셋
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

    public func openSheet(_ s: RTSheet) {
        // 재완독: 기존 별점을 프리셋 (직전 다른 책 평가 잔존값 방지 겸)
        if s == .finish, let r = selectedBook?.rating { rating = r }
        sheet = s
    }
    public func closeSheet() { sheet = nil }

    // ── 액션 (app.js data-act 대응) ──
    public func login() {
        nav(.home)
        onAuthChange?(true)
    }

    /// 로그인 버튼 진입점 — OAuth 핸들러가 있으면 위임(성공 시 핸들러가 login() 호출)
    public func requestLogin() {
        if let loginHandler { loginHandler() } else { login() }
    }

    public func setMode(_ m: RTMode) { mode = m }

    /// 세션 시작 의도 — isbn 미지정이면 홈 히어로(currentBook) 대상.
    /// flip 은 대기(03)를 거쳐 startSession 에서 세션이 생기므로 대상을 보류해 둔다.
    public func start(isbn: String? = nil) {
        nextSessionISBN = isbn ?? currentBook?.isbn
        if mode == .flip { nav(.flipWait) }
        else { startSession(.tap); nav(.tapTimer) }
    }

    public func cancelSession() { session = nil; nextSessionISBN = nil; emitPresence(); nav(.home) }

    public func simFlip() { startSession(.flip); nav(.flipTimer) }

    public func switchTap() { mode = .tap; startSession(.tap); nav(.tapTimer) }

    public func togglePause() {
        guard var s = session else { return }
        if s.status == .recording { s.status = .paused; s.pauseCount += 1 }
        else { s.status = .recording; justResumed = true }
        session = s
        emitPresence()
    }

    public func endSession() {
        if var s = session { s.status = .paused; session = s }
        emitPresence()
        nav(.done)
    }

    public func saveSession() {
        if let s = session {
            onSessionSaved?(s.mode, s.elapsed)
            if userData != nil {
                let rec = RTSessionRecord(isbn: s.isbn, mode: s.mode.rawValue,
                                          seconds: s.elapsed, endedAt: now(),
                                          pauseCount: s.pauseCount)
                mutateUserData { $0.sessions.append(rec) }
            }
        }
        session = nil
        emitPresence()
        nav(.home)
    }

    public func deleteSession() { session = nil; nav(.home) }

    public func continueReading() { start(isbn: selectedBook?.isbn) }

    /// 완독 책 다시 읽기 — 완독만 해제(별점·완독일 보존)하고 그 책으로 세션 시작
    public func rereadBook() {
        guard let b = selectedBook, b.finished else { return }
        mutateUserData { d in
            if let i = d.books.firstIndex(where: { $0.isbn == b.isbn }) {
                d.books[i].finished = false
            }
        }
        start(isbn: b.isbn)
    }

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
        if userData != nil {
            let rec = RTSessionRecord(isbn: selectedBook?.isbn, mode: "manual",
                                      seconds: addtimeValue * 60, endedAt: now(), pauseCount: 0)
            mutateUserData { $0.sessions.append(rec) }
        }
        addtimeValue = 35
        addtimePreset = 15
        closeSheet()
    }

    // ── 09 완독 별점 ──
    public func rate(_ n: Int) { rating = n }
    public func saveFinished() {
        if let cur = selectedBook {
            mutateUserData { d in
                if let i = d.books.firstIndex(where: { $0.isbn == cur.isbn }) {
                    d.books[i].finished = true
                    d.books[i].rating = rating
                    d.books[i].finishedAt = now()
                }
            }
        }
        closeSheet()
        nav(.library)
    }

    // ── 13 책 추가 (라이브: userData 책 목록 동기, 데모: added 집합만) ──
    public func toggleAdd(_ key: String) {
        if added.contains(key) { added.remove(key) } else { added.insert(key) }
        guard userData != nil else { return }
        if added.contains(key) {
            guard let hit = searchResults?.first(where: { $0.isbn == key }),
                  userData?.books.contains(where: { $0.isbn == key }) != true else { return }
            mutateUserData {
                $0.books.append(RTBook(isbn: hit.isbn, title: hit.title, author: hit.author,
                                       publisher: hit.publisher, coverUrl: hit.coverUrl,
                                       addedAt: now()))
            }
            closeSheet()   // 검색 결과 선택 → 시트 자동 닫힘 (실기기 피드백 2026-07-04)
        } else {
            mutateUserData { $0.books.removeAll { $0.isbn == key } }
        }
    }

    // ── 설정·책 메뉴 ──
    public func logout() {
        closeSheet()
        nav(.login)
        onAuthChange?(false)
    }
    public func deleteBook() {
        if let b = selectedBook {
            mutateUserData { $0.books.removeAll { $0.isbn == b.isbn } }
            selectedISBN = nil
        }
        closeSheet()
        nav(.library)
    }

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

    /// start() 가 보류해 둔 세션 대상 (flip 대기 경유). FlipEngine 홈 엎기처럼
    /// start() 를 거치지 않는 경로는 startSession 의 currentBook 폴백이 대상.
    private var nextSessionISBN: String?

    // ── 세션 시작 (app.js startSession — 시드는 sessionSeed) ──
    public func startSession(_ mode: RTMode) {
        session = RTSession(mode: mode, status: .recording,
                            elapsed: sessionSeed, pauseCount: 0, startedAt: now(),
                            isbn: nextSessionISBN ?? currentBook?.isbn)
        nextSessionISBN = nil
        emitPresence()
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
        case "rename": rename(arg)
        case "partnerStats": openPartnerStats()   // 파트너 통계 진입(검증·데모)
        case "demoPartner": loadDemoPartner()      // 데모 파트너 주입(검증·기기 데모)
        case "demoPartnerIdle": loadDemoPartner(reading: false)   // idle 상태 검증
        case "openBook": openBookDetail(isbn: arg)   // 통계 책 → 상세 진입(검증)
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

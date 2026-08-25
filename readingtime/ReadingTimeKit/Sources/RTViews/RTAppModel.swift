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
    case statsMap = "15"
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

/// 홈 표지 카드 — 읽는 중 종이책 1권 또는 최근 밀리 책 1권.
/// 종이책은 엎기로 기록 시작(recordable), 밀리는 자동 집계라 기록 대상이 아니다.
public struct RTHomeCard: Identifiable, Equatable, Sendable {
    public let title: String
    public let author: String?
    public let coverUrl: String
    public let isbn: String?          // 서재 책만 보유 (밀리는 nil)
    public let isEbook: Bool
    public let lastReadAt: Date

    public var id: String { isEbook ? "millie:\(title)" : "book:\(isbn ?? title)" }
    /// 엎기 기록 대상 여부 — 밀리는 밀리 앱이 이미 시간을 재므로 false (이중 계상 방지)
    public var recordable: Bool { !isEbook && isbn != nil }

    public init(title: String, author: String?, coverUrl: String,
                isbn: String?, isEbook: Bool, lastReadAt: Date) {
        self.title = title
        self.author = author
        self.coverUrl = coverUrl
        self.isbn = isbn
        self.isEbook = isEbook
        self.lastReadAt = lastReadAt
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

    /// 전자책(밀리) 일별 초 — "yyyy-MM-dd"(실발생일) → seconds. book_reading_seconds 읽기 전용,
    /// 통계는 표시 계층에서 종이+전자 합산 (README 결정: DB에선 안 섞음). 데모(userData nil) 미적용.
    @Published public var ebookDaily: [String: Int] = [:]
    /// 밀리 현재 읽는 책 제목 (통계 밀리 행 표기 — 없으면 "밀리의서재" 폴백)
    @Published public var ebookTitle: String?
    /// 밀리 일별×책별 — day "yyyy-MM-dd" → 그날 읽은 책 제목들 (book_reading_books)
    @Published public var ebookBooks: [String: [String]] = [:]
    /// 밀리 책 표지 (제목 → cover_url, 밀리 CDN) — 랭킹·월간 캘린더 표기
    @Published public var ebookCovers: [String: String] = [:]

    /// 밀리 책별 '마지막으로 읽은 시각' (제목 → read_at). 홈 카드 최근순 정렬 정본.
    /// 원천(밀리 로컬 DB)은 초 단위인데 구 동기화가 날짜로 잘라 올렸다 — 0005 마이그로 복원.
    @Published public var ebookReadAt: [String: Date] = [:]
    /// 앱에서 완독 처리한 밀리 책 (제목 → 완독 처리 시각). 그 시각보다 최신 기록이 들어오면
    /// 다시 읽는 것으로 보고 카드가 되살아난다 (종이책 rereadBook 과 대칭).
    @Published public var finishedEbooks: [String: Date] = [:]
    /// 홈 캐러셀에서 현재 보고 있는 카드 인덱스
    @Published public var homeCardIndex = 0

    /// 홈 표지 카드 — 읽는 중 종이책 + 최근 밀리 책을 '최근 읽은 순'으로.
    /// 데모(userData nil)는 빈 배열 → 홈은 기존 시안 히어로를 그린다 (rtshot 오라클 불변).
    public var homeCards: [RTHomeCard] {
        guard let d = userData else { return [] }

        var lastRead: [String: Date] = [:]
        for s in d.sessions {
            if let i = s.isbn, s.endedAt > (lastRead[i] ?? .distantPast) { lastRead[i] = s.endedAt }
        }
        let paper = d.books.filter { !$0.finished }.map { b in
            RTHomeCard(title: b.title, author: b.author, coverUrl: b.coverUrl,
                       isbn: b.isbn, isEbook: false,
                       lastReadAt: max(b.addedAt, lastRead[b.isbn] ?? .distantPast))
        }
        // 밀리: 완독 처리 이후 더 최신 기록이 없으면 제외
        let ebook = ebookReadAt.compactMap { (title, readAt) -> RTHomeCard? in
            if let finishedAt = finishedEbooks[title], readAt <= finishedAt { return nil }
            return RTHomeCard(title: title, author: nil, coverUrl: ebookCovers[title] ?? "",
                              isbn: nil, isEbook: true, lastReadAt: readAt)
        }
        return (paper + ebook).sorted { $0.lastReadAt > $1.lastReadAt }
    }

    /// 엎기 기록 대상 — 선택된 카드가 종이책이면 그 ISBN, 밀리 카드면 nil(기록 시작 안 함).
    public var flipTargetISBN: String? {
        let cards = homeCards
        guard homeCardIndex >= 0, homeCardIndex < cards.count else { return currentBook?.isbn }
        return cards[homeCardIndex].recordable ? cards[homeCardIndex].isbn : nil
    }

    /// 선택된 홈 카드가 엎기·탭 기록 대상인가. 밀리 카드면 false → 홈 CTA 비활성.
    /// 카드가 없으면(데모) true — 기존 시안 동작 유지.
    public var selectedCardRecordable: Bool {
        let cards = homeCards
        guard !cards.isEmpty else { return true }
        let i = min(max(0, homeCardIndex), cards.count - 1)
        return cards[i].recordable
    }

    /// 밀리 책 완독 처리 (홈 카드에서 제외). 이후 더 최신 밀리 기록이 오면 자동 복귀.
    public func finishEbook(_ title: String) {
        finishedEbooks[title] = now()
        onFinishedEbooksChange?(finishedEbooks)
    }
    /// 완독 처리 영속 훅 (앱: UserDefaults JSON)
    public var onFinishedEbooksChange: (([String: Date]) -> Void)?

    /// 그날 밀리 시간의 책별 귀속 — 그날 책 균등 분할. 히스토리 없는 날(진도 기록은
    /// 변경 시에만 남음)은 직전 책, 그것도 없으면 현재 책/서비스명 폴백.
    public func ebookBreakdown(on date: Date) -> [(title: String, seconds: Int)] {
        let total = ebookSeconds(on: date)
        guard total > 0 else { return [] }
        let key = dayFormatter.string(from: date)
        if let titles = ebookBooks[key], !titles.isEmpty {
            return titles.map { ($0, total / titles.count) }
        }
        if let prev = ebookBooks.keys.filter({ $0 < key }).max(),
           let t = ebookBooks[prev]?.first {
            return [(t, total)]
        }
        return [(ebookTitle ?? "밀리의서재", total)]
    }

    private var dayFormatter: DateFormatter {
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = cal.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }
    public func ebookSeconds(on date: Date) -> Int {
        userData == nil ? 0 : ebookDaily[dayFormatter.string(from: date)] ?? 0
    }
    /// 기록 있는 날(startOfDay) — 종이 세션 ∪ 밀리(>0초). 연속·체인 판정 정본.
    private var readDays: Set<Date> {
        guard let d = userData else { return [] }
        var days = Set(d.sessions.map { cal.startOfDay(for: $0.endedAt) })
        let f = dayFormatter
        for (k, sec) in ebookDaily where sec > 0 {
            if let dt = f.date(from: k) { days.insert(cal.startOfDay(for: dt)) }
        }
        return days
    }

    public var todaySeconds: Int {
        guard let d = userData else { return 0 }
        let t = now()
        return d.sessions.filter { cal.isDate($0.endedAt, inSameDayAs: t) }
            .reduce(0) { $0 + $1.seconds } + ebookSeconds(on: t)
    }

    public var weekSeconds: Int { weekSeconds(offset: 0) }

    /// offset 주(0=이번 주, -1=지난주) 총 초
    public func weekSeconds(offset: Int) -> Int {
        guard let d = userData,
              let base = cal.date(byAdding: .weekOfYear, value: offset, to: now()),
              let week = cal.dateInterval(of: .weekOfYear, for: base) else { return 0 }
        let paper = d.sessions.filter { week.contains($0.endedAt) }.reduce(0) { $0 + $1.seconds }
        return paper + (0..<7).reduce(0) { sum, i in
            sum + (cal.date(byAdding: .day, value: i, to: week.start).map(ebookSeconds(on:)) ?? 0)
        }
    }

    /// 이번 주(월~일) 일별 분
    public var weekDayMinutes: [Int] {
        var per = [Int](repeating: 0, count: 7)
        guard let d = userData, let week = cal.dateInterval(of: .weekOfYear, for: now()) else { return per }
        for s in d.sessions where week.contains(s.endedAt) {
            let idx = cal.dateComponents([.day], from: week.start, to: cal.startOfDay(for: s.endedAt)).day ?? 0
            if (0..<7).contains(idx) { per[idx] += s.seconds }
        }
        for i in 0..<7 {
            if let day = cal.date(byAdding: .day, value: i, to: week.start) { per[i] += ebookSeconds(on: day) }
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
        for i in 0..<7 {
            if let day = cal.date(byAdding: .day, value: i, to: week.start) { per[i] += Double(ebookSeconds(on: day)) }
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
        let days = readDays
        if days.isEmpty { return 0 }
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
        guard userData != nil else { return [Bool](repeating: false, count: count) }
        let days = readDays
        let today = cal.startOfDay(for: now())
        return (0..<count).map { i in
            guard let day = cal.date(byAdding: .day, value: -(count - 1 - i), to: today) else { return false }
            return days.contains(day)
        }
    }
    @Published public var searchQuery = ""
    @Published public var searchResults: [RTBookHit]?

    private let tapScheduler: RTTapScheduler
    private var cancelPendingTap: (() -> Void)?

    public init(tapScheduler: RTTapScheduler = RTDispatchTapScheduler()) {
        self.tapScheduler = tapScheduler
    }

    public func search(_ q: String) async {
        searchQuery = q
        // 공란/공백 쿼리는 provider 미호출 — 최신 검색 결과를 지우지 않고 그대로 노출(§ "공란=최신 검색")
        let trimmed = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let searchProvider else { return }
        if let hits = try? await searchProvider(trimmed) {
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
            detailOrigin = [.home, .library, .statsWeek, .statsMonth, .statsMap].contains(route) ? route : .library
        }
        if to == .home { statsSubject = .me }   // 홈 복귀 시 파트너 통계 주체 리셋
        // 목업 setTab: 탭 전환 시 열린 장소 시트·책 상세를 닫는다
        if [.statsWeek, .statsMonth, .statsMap].contains(to) && to != route {
            placeSheet = nil
            recordBook = nil
        }
        route = to
    }

    /// 해시 별칭 07=02+addtime, 09=08+finish, 13=12+addbook (app.js SHEET_ROUTES)
    public func navScreenID(_ id: String) {
        switch id {
        case "07": nav(.home); sheet = .addtime
        case "09": nav(.detail); sheet = .finish
        case "13": nav(.library); openSheet(.addbook)
        default:
            if let r = RTRoute(rawValue: id) { nav(r) } else { nav(.home) }
        }
    }

    public func openSheet(_ s: RTSheet) {
        // 재완독: 기존 별점을 프리셋 (직전 다른 책 평가 잔존값 방지 겸)
        if s == .finish, let r = selectedBook?.rating { rating = r }
        // 책 추가: 검색창은 열 때마다 공란. 결과(searchResults)는 유지 = "공란이면 최신 검색 표시".
        if s == .addbook { searchQuery = "" }
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
                let fix = locationProvider?()
                let rec = RTSessionRecord(isbn: s.isbn, mode: s.mode.rawValue,
                                          seconds: s.elapsed, endedAt: now(),
                                          pauseCount: s.pauseCount,
                                          latitude: fix?.latitude, longitude: fix?.longitude,
                                          placeId: fix?.placeId, placeName: fix?.placeName,
                                          country: fix?.country)
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
            let fix = locationProvider?()
            let rec = RTSessionRecord(isbn: selectedBook?.isbn, mode: "manual",
                                      seconds: addtimeValue * 60, endedAt: now(), pauseCount: 0,
                                      latitude: fix?.latitude, longitude: fix?.longitude,
                                      placeId: fix?.placeId, placeName: fix?.placeName,
                                      country: fix?.country)
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

    // ── 15 지도 (작업지시서 §5·§9 State) ──
    // 카메라(팬·줌)는 MapKit(Screen15Map)이 소유 — §5.1 "투영·팬·줌·클러스터 로직은 SDK가 대체".
    // 모델은 시트/책 상세 상태만 관리한다.
    /// 장소 시트 — 열린 place id 들 (nil = 닫힘)
    @Published public var placeSheet: [String]?
    /// 책 상세 시트 — 책 인덱스 (nil = 닫힘). 장소 시트 위에 겹쳐 열림.
    @Published public var recordBook: Int?

    /// 지도·시트가 쓰는 데이터 — 실데이터 모드(userData 있음)는 항상 실집계.
    /// 위치 세션이 없으면 빈 지도가 정상 (위치 없는 책은 안 뜸 — 사용자 결정 2026-07-15).
    /// 시안 데모(§12)는 rtshot/rtapp(userData nil) 픽셀 오라클 전용.
    public var recordData: (places: [RTRecPlace], books: [RTRecBook]) {
        if let d = userData { return RTRecord.live(from: d) }
        return (RTRecordDemo.places, RTRecordDemo.books)
    }

    /// 가장 최근 위치 세션의 좌표 — 지도 기본 카메라(동네 프레이밍) 중심.
    /// 위치 없는 세션은 건너뛴다. 없으면 nil (뷰가 전체 뷰 폴백).
    public var latestReadCoord: (lat: Double, lng: Double)? {
        guard let d = userData else { return nil }
        return d.sessions.filter { $0.latitude != nil && $0.longitude != nil && $0.placeId != nil }
            .max { $0.endedAt < $1.endedAt }
            .map { ($0.latitude!, $0.longitude!) }
    }

    /// §5.5 통계 칩 — 실데이터는 "N곳" 집계(0곳 = nil → 칩 숨김), 데모는 시안 상수.
    public var mapChipText: String? {
        guard userData != nil else { return RTRecordDemo.mapChip }
        let n = recordData.places.count
        return n > 0 ? "\(n)곳" : nil
    }

    /// 위치 픽스 공급 훅 — 앱 셸이 CoreLocation 배선 (§16: 세션 시작·시간추가 시트 열림 시 캡처).
    /// nil 반환 = 위치 미확보 → 세션은 위치 없이 저장 (지도 미표시).
    public var locationProvider: (() -> RTPlaceFix?)?

    /// §5.6 단일 마커 탭 — openTarget(1권 책상세 / N권 시트). 클러스터 탭의 줌 투 핏은 MapKit 뷰가 처리.
    public func tapMarker(_ m: RTRecord.Marker) {
        guard !m.isCluster else { return }
        applyTarget(RTRecord.openTarget([m.placeId], places: recordData.places))
    }
    func applyTarget(_ t: RTRecord.Target) {
        switch t {
        case .book(let b): openMapBook(b)
        case .sheet(let ids): openPlaceSheet(ids)
        }
    }

    /// 지도에서 책 선택(단일 핀·장소 시트 커버) → 책상세 페이지(08) 이동 (사용자 요구 2026-07-15).
    /// index = recordData.books 인덱스. 실데이터(서재에 있는 ISBN)면 페이지로, 데모/oracle 은 §7 기록 시트 폴백.
    public func openMapBook(_ index: Int) {
        let books = recordData.books
        guard index >= 0, index < books.count else { return }
        let isbn = books[index].isbn
        if userData?.books.contains(where: { $0.isbn == isbn }) == true {
            placeSheet = nil                 // 지도 오버레이 닫고 페이지로 (전역 오버레이라 겹침 방지)
            recordBook = nil
            statsSubject = .me               // 지도는 항상 내 데이터 → 파트너 잔존 subject 리셋
            openBookDetail(isbn: isbn)       // selectedISBN + nav(.detail), detailOrigin = .statsMap
        } else {
            openRecordBook(index)            // 데모/oracle 폴백 (§7 기록 시트)
        }
    }
    public func openPlaceSheet(_ ids: [String]) { placeSheet = ids }
    public func closePlaceSheet() { placeSheet = nil }
    public func openRecordBook(_ id: Int) { recordBook = id }
    /// 책 상세 닫기 — 장소 시트에서 진입했으면 시트로 복귀(시트 상태 유지), 지도 직행이면 지도로.
    public func closeRecordBook() { recordBook = nil }

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
        // 세션 대상: start(isbn:) 이 보류한 책 > 홈 카드에서 고른 책 (캐러셀 도입 2026-08-25).
        // flipTargetISBN 은 카드 범위 밖이면 currentBook 으로 폴백한다.
        session = RTSession(mode: mode, status: .recording,
                            elapsed: sessionSeed, pauseCount: 0, startedAt: now(),
                            isbn: nextSessionISBN ?? flipTargetISBN)
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
        case "search": Task { await search(arg) }   // 라이브 검색 트리거(검증 — provider 배선 시)
        case "card": Int(arg).map { homeCardIndex = $0 }        // 홈 캐러셀 카드 선택(검증)
        case "finishEbook": finishEbook(arg)                     // 밀리 완독 처리(검증)
        case "demoCards":   // 홈 캐러셀 시드 — 종이책 2 + 밀리 2 (실표지·최근순 검증)
            let t = now()
            func ago(_ h: Double) -> Date { t.addingTimeInterval(-h * 3600) }
            userData = RTUserData(
                books: [
                    RTBook(isbn: "P1", title: "작별하지 않는다", author: "한강", publisher: "문학동네",
                           coverUrl: "https://image.aladin.co.kr/product/27877/5/cover200/8954682154_3.jpg",
                           addedAt: ago(72)),
                    RTBook(isbn: "P2", title: "파친코", author: "이민진", publisher: "인플루엔셜",
                           coverUrl: "https://image.aladin.co.kr/product/29496/39/cover200/s382931339_2.jpg",
                           addedAt: ago(96)),
                ],
                sessions: [
                    RTSessionRecord(isbn: "P1", mode: "flip", seconds: 52 * 60, endedAt: ago(30), pauseCount: 0),
                    RTSessionRecord(isbn: "P2", mode: "flip", seconds: 74 * 60, endedAt: ago(50), pauseCount: 0),
                ])
            ebookReadAt = ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]": ago(2),   // 최신 → 첫 카드
                           "독학이라는 세계": ago(40)]
            ebookCovers = [
                "삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]":
                    "https://img.millie.co.kr/200x/service/cover/179627237/6c18271ace30484f83644c87958de70b.jpg",
                "독학이라는 세계":
                    "https://image.millie.co.kr/service/cover/180153534/77b09fba84f14ed8967dcc48251988ff.jpg",
            ]
        case "searchReopen":   // 검색 완결 후 닫기→재열기 (재열기 공란+최신결과 유지 결정적 검증)
            Task { await search(arg); closeSheet(); openSheet(.addbook) }
        case "closeSheet": closeSheet()
        case "mode": RTMode(rawValue: arg).map { setMode($0) }
        case "rename": rename(arg)
        case "partnerStats": openPartnerStats()   // 파트너 통계 진입(검증·데모)
        case "demoPartner": loadDemoPartner()      // 데모 파트너 주입(검증·기기 데모)
        case "demoPartnerIdle": loadDemoPartner(reading: false)   // idle 상태 검증
        case "demoEbook":   // 밀리 일별 시드(오늘 29분·어제 10분·그제 20분) — 통계 합산 검증
            let t = now()
            let f = dayFormatter
            ebookDaily = [f.string(from: t): 1740,
                          f.string(from: cal.date(byAdding: .day, value: -1, to: t)!): 600,
                          f.string(from: cal.date(byAdding: .day, value: -2, to: t)!): 1200]
            ebookTitle = "도둑맞은 집중력"   // 시안 밀리 데모 책
            ebookBooks = [f.string(from: t): ["도둑맞은 집중력"],
                          f.string(from: cal.date(byAdding: .day, value: -1, to: t)!): ["디 마이너스"]]
            ebookCovers = ["디 마이너스": "https://img.millie.co.kr/200x/service/cover/7233614/7007cfd575de4dfab086f7ee0af373a4.jpg"]
        case "demoLive":   // 라이브 통계 시드(종이 3세션 + 목요일 밀리 36분) — 밀리 별도 표시 화면 검증
            let f = dayFormatter
            let ws = weekStart
            func dd(_ i: Int) -> Date { cal.date(byAdding: .day, value: i, to: ws)! }
            userData = RTUserData(
                books: [
                    RTBook(isbn: "P1", title: "작별하지 않는다", author: "한강", publisher: "문학동네",
                           coverUrl: "https://image.aladin.co.kr/product/27877/5/cover200/8954682154_3.jpg",
                           addedAt: dd(0)),
                    RTBook(isbn: "P2", title: "파친코", author: "이민진", publisher: "인플루엔셜",
                           coverUrl: "https://image.aladin.co.kr/product/29496/39/cover200/s382931339_2.jpg",
                           addedAt: dd(0)),
                ],
                sessions: [
                    RTSessionRecord(isbn: "P1", mode: "flip", seconds: 52 * 60, endedAt: dd(0), pauseCount: 0),  // 월
                    RTSessionRecord(isbn: "P2", mode: "flip", seconds: 74 * 60, endedAt: dd(1), pauseCount: 0),  // 화
                    RTSessionRecord(isbn: "P1", mode: "flip", seconds: 60 * 60, endedAt: dd(3), pauseCount: 0),  // 목(선택일)
                ])
            ebookTitle = "도둑맞은 집중력"
            ebookDaily = [f.string(from: dd(3)): 36 * 60]                       // 목: 밀리 36분
            ebookBooks = [f.string(from: dd(3)): ["도둑맞은 집중력"]]
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
        // ── 15 지도 (검증·데모) ──
        case "mapTapPin":   // 단일 마커 라벨로 탭 (예: mapTapPin:뉴욕) — 헤드리스 기본 뷰 기준
            let rd = recordData
            let v = RTRecord.defaultView
            RTRecord.markers(scale: v.scale, tx: v.tx, ty: v.ty, places: rd.places, books: rd.books)
                .first { $0.label == arg }.map { tapMarker($0) }
        case "seedLoc":   // 기존 세션 위치 백필 (실기기 1회 실행) — "lat|lng|placeId|placeName|country"
            // ("|" 구분: --seq 가 ","로 액션을 쪼개므로 콤마 사용 불가)
            let p = arg.split(separator: "|").map(String.init)
            if p.count == 5, let lat = Double(p[0]), let lng = Double(p[1]) {
                mutateUserData { d in
                    for i in d.sessions.indices where d.sessions[i].latitude == nil {
                        d.sessions[i].latitude = lat
                        d.sessions[i].longitude = lng
                        d.sessions[i].placeId = p[2]
                        d.sessions[i].placeName = p[3]
                        d.sessions[i].country = p[4]
                    }
                }
            }
        case "openPlace": openPlaceSheet(arg.split(separator: "+").map(String.init))
        case "openRecBook": Int(arg).map { openRecordBook($0) }
        case "mapBook": Int(arg).map { openMapBook($0) }   // 지도 책 선택 → 책상세 페이지(실데이터)/§7(데모)

        case "closePlace": closePlaceSheet()
        case "closeRecBook": closeRecordBook()
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

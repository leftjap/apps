import Foundation
import Combine
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// 앱 상태 머신 — 인터랙션 정본 prototype/app.js 이식.
// 라우트·모드·세션·시트·데모 상태 전부 여기서 관리. 화면은 이 모델을 주입받아 렌더만 한다.
// 05 탭 처리만은 시안 J(design-ref/design_handoff_tap_mode)가 정본 — 디바운스·더블탭 종료 없이 togglePause 즉시.

public enum RTRoute: String, Sendable {
    case login = "01"
    case home = "02"
    case flipWait = "03"
    case flipTimer = "04"
    case tapTimer = "05"
    case done = "06"
    case detail = "08"
    case stats = "10"       // 기록 원페이지 (주·월·지도 통합, design_handoff_record_onepage)
    case library = "12"
    case emptyHome = "14"
}

/// 기록 원페이지 바텀시트 — day(일) / list / place(장소 id)
public enum RTStatsSheet: Equatable, Sendable { case day(Int), list, place(String), cluster([String]) }   // cluster = 갈라지지 않는 핀의 장소 id 들

public enum RTSheet: String, Sendable {
    case addtime, finish, addbook, settings, sort, bookmenu
}

public enum RTMode: String, Sendable, Codable { case flip, tap }
public enum RTSessionStatus: String, Sendable, Codable { case recording, paused }

/// 홈 2주 캘린더 한 칸 (작업지시서 v3 §5.2)
public struct HomeCalCell: Sendable, Equatable {
    public let date: Date
    public let day: Int
    public let minutes: Int      // 종이 + 밀리 합산, 분 (내림)
    public let isToday: Bool
    public let isFuture: Bool
    public let isSunday: Bool

    public init(date: Date, day: Int, minutes: Int, isToday: Bool, isFuture: Bool, isSunday: Bool) {
        self.date = date
        self.day = day
        self.minutes = minutes
        self.isToday = isToday
        self.isFuture = isFuture
        self.isSunday = isSunday
    }
}

/// 홈 '역대 최고 대비' 게이지 상태 — 작업지시서 v3 §4-③ 상태표.
/// 뷰에서 분리한 이유: 신기록 상태(streak > best > 0)는 데모 시드로 렌더 도달이 안 돼
/// 로직 검증이 유일한 수단이다(AC #14). 4개 상태를 테스트로 고정한다.
public struct RTStreakGauge: Equatable, Sendable {
    /// 채움 비율 (0…1)
    public let frac: CGFloat
    /// 역대 최고 지점 눈금 위치. 평상시·타이는 1.0(트랙 오른쪽 끝)
    public let tickFrac: CGFloat
    /// 골드 그라데이션 + rtSweep 여부
    public let isNewRecord: Bool
    /// 하단 행(역대 최고 / 남음) 노출. 과거 완료 구간이 없으면 숨긴다
    public let showsBest: Bool
    public let remainLabel: String

    public init(streak: Int, best: Int) {
        let new = best > 0 && streak > best
        isNewRecord = new
        showsBest = best > 0
        frac = best <= 0 ? 0 : min(1, CGFloat(streak) / CGFloat(best))
        tickFrac = new ? CGFloat(best) / CGFloat(streak) : 1.0
        if new {
            remainLabel = "+\(streak - best)일"
        } else if best > 0 && streak == best {
            remainLabel = "최고 타이"
        } else {
            remainLabel = "\(best - streak)일 남음"
        }
    }
}

/// 탭 모드(05) 링 — 시안 J(design-ref/design_handoff_tap_mode) §1. 바깥 줄 = 이 세션, 안쪽 줄 = 역대 최장.
/// 뷰에서 분리한 이유: 타이·신기록·최장 0 상태는 데모 시드로 렌더에 도달하지 않아 로직 검증이 기준이다
/// (RTStreakGauge 와 같은 이유). 각도는 12시 = 0°, 시계 방향.
public struct RTTapRing: Equatable, Sendable {
    public enum State: Equatable, Sendable { case normal, tie, record }
    /// 링 한 바퀴(분) — 15분 단위, 최장·경과 중 큰 값의 1.2배 이상, 최소 30분
    public let scaleMinutes: Int
    /// 최장 줄 끝 (최장 0 이면 0 — 그리지 않는다)
    public let ghostDeg: Double
    /// 이 세션 줄 끝
    public let liveDeg: Double
    /// 남은 거리 점선 (liveDeg + 3° → ghostDeg − 2°). 경과 < 최장이고 1° 이상 남았을 때만
    public let gap: ClosedRange<Double>?
    /// 분 단위 정수 비교(홈 RTStreakGauge 와 같은 규칙) — 같은 분 = 타이, 넘은 분 = 신기록
    public let state: State
    /// 최장 줄·결승 눈금·점선·기록 줄 노출. 과거 세션이 없으면(최장 0) 숨긴다
    public let hasBest: Bool
    /// 신기록 "+N분" — 이 세션 분 − 최장 분
    public let overMinutes: Int

    public init(elapsed: Int, best: Int) {
        // 시안 식 max(30, ceil(max(best, elapsed)/60 × 1.2 / 15) × 15) 을 정수로 — ×1.2/60/15 = ÷750
        scaleMinutes = max(30, (max(best, elapsed) + 749) / 750 * 15)
        let scaleSec = Double(scaleMinutes * 60)
        hasBest = best > 0
        ghostDeg = hasBest ? 360 * Double(best) / scaleSec : 0
        liveDeg = 360 * min(1, Double(elapsed) / scaleSec)
        let from = liveDeg + 3, to = ghostDeg - 2
        gap = elapsed < best && to - from >= 1 ? from...to : nil
        let sessionMin = elapsed / 60, bestMin = best / 60
        state = !hasBest ? .normal : sessionMin > bestMin ? .record : sessionMin == bestMin ? .tie : .normal
        overMinutes = max(0, sessionMin - bestMin)
    }
}

/// 홈 캘린더 농도 — **절대 기준**. 지난 2주 최고치 기준(상대값)으로 하지 말 것:
/// 주마다 기준이 바뀌면 오늘 칸의 진하기를 다른 주와 비교할 수 없다(작업지시서 v3 §4-⑤).
public enum RTHomeCal {
    /// 이 분량에서 농도가 상한 근처가 된다. 사용자 분포 확인 후 45/90 조정 가능(§10-1).
    public static let fullMinutes = 60
    /// 상한 0.72 — 오늘 칸(1.0 + 헤일로)이 항상 화면에서 가장 진한 칸으로 남아야 한다.
    public static func alpha(_ minutes: Int) -> Double {
        min(0.72, 0.14 + 0.58 * Double(minutes) / Double(fullMinutes))
    }
}

public struct RTSession: Sendable, Codable {   // Codable: 진행 중 세션 영속 (앱 종료 시 유실 방지)
    public var mode: RTMode
    public var status: RTSessionStatus
    public var elapsed: Int          // 초 (데모 셸: app.js 와 동일하게 초 틱 누적)
    public var pauseCount: Int
    public var startedAt: Date       // 세션 시작 시각 (06 원장 표시용 — 데모 렌더는 미사용)
    public var isbn: String? = nil   // 세션 대상 책 (시작 시점 캡처 — 기록 귀속·다크/완료/LA 표기)
    /// 벽시계 기준점 — 상태가 마지막으로 바뀐 시각과 그때의 경과. 기록 중 경과 = anchorElapsed + (지금 − anchorAt).
    /// 엎기 엔진·화면 탭·앱 복원이 모두 이 기준점 하나로 계산한다 (2026-11-08: 엔진이 따로 둔 시계가 화면 탭 재개를
    /// 몰라, 폰을 들 때 그 값으로 덮어써 탭 이후 시간이 지워졌다). 일시정지 중이면 anchorAt = 멈춘 시각(저장 시각에 쓴다).
    /// 예전 저장본엔 없다(nil) — 그때는 종전 동작(틱 누적)만 한다.
    public var anchorAt: Date? = nil
    public var anchorElapsed: Int? = nil

    public init(mode: RTMode, status: RTSessionStatus, elapsed: Int, pauseCount: Int, startedAt: Date, isbn: String? = nil,
                anchorAt: Date? = nil, anchorElapsed: Int? = nil) {
        self.mode = mode; self.status = status; self.elapsed = elapsed; self.pauseCount = pauseCount
        self.startedAt = startedAt; self.isbn = isbn
        self.anchorAt = anchorAt; self.anchorElapsed = anchorElapsed
    }

    /// t 시점의 경과 — 기록 중이면 벽시계, 틱이 앞서 있으면 틱 값 (경과는 줄지 않는다)
    public func wallElapsed(at t: Date) -> Int {
        guard status == .recording, let a = anchorAt, let e = anchorElapsed else { return elapsed }
        return max(elapsed, e + max(0, Int(t.timeIntervalSince(a))))
    }

    mutating func anchor(at t: Date) {
        anchorAt = t
        anchorElapsed = elapsed
    }
}

public enum RTLibraryFilter: String, Sendable { case all, reading, finished }
public enum RTLibrarySort: String, Sendable { case recent, name, rating }

// 검색 결과 (알라딘 BookMeta 의 UI 표시 서브셋 — RTViews 는 ReadingTimeKit 비의존)
/// 밀리 책 단위 메타 — 데몬이 book_millie_books 로 미러한 로컬 카탈로그 행 (제목 키로 조인)
public struct RTMillieMeta: Equatable, Sendable {
    public let bookId: String
    public let author: String?
    public let publisher: String?
    public let coverUrl: String?

    public init(bookId: String, author: String?, publisher: String?, coverUrl: String?) {
        self.bookId = bookId
        self.author = author
        self.publisher = publisher
        self.coverUrl = coverUrl
    }
}

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

    /// 같은 책은 한 줄만 — 먼저 나온 것을 남긴다. 제목·저자·출판사가 같으면(카카오가 판을 따로 준다: 「예술원에 드리는
    /// 보고」 10-16판·10-29판, 2026-11-10 실기기) 또는 ISBN 이 같으면(잡지 호수는 ISBN 하나를 같이 쓴다 — 앱은 ISBN 으로
    /// 책을 구분해서 두 줄을 두면 하나를 추가할 때 나머지도 ✓) 같은 책으로 본다. 띄어쓰기·대소문자는 무시한다.
    public static func deduped(_ hits: [RTBookHit]) -> [RTBookHit] {
        func norm(_ s: String) -> String { s.lowercased().filter { !$0.isWhitespace } }
        var names = Set<String>(), isbns = Set<String>()
        return hits.filter { h in
            let name = norm(h.title) + "|" + norm(h.author) + "|" + norm(h.publisher)
            if names.contains(name) || (!h.isbn.isEmpty && isbns.contains(h.isbn)) { return false }
            names.insert(name)
            if !h.isbn.isEmpty { isbns.insert(h.isbn) }
            return true
        }
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
    /// 홈에서 바로 완독 처리할 수 있는가 — 밀리 전용. 종이책은 08 상세의 '완독' CTA 를 쓴다.
    public var finishable: Bool { isEbook }
    /// 홈 카드에서 지울 수 있는가 — 밀리 전용. 종이책은 서재 ⋯ 메뉴의 책 삭제를 쓴다.
    public var deletable: Bool { isEbook }

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

@MainActor
public final class RTAppModel: ObservableObject {
    // app.js state 대응
    @Published public var route: RTRoute = .login
    @Published public var mode: RTMode = .flip
    /// 진행 중 세션 — 변화마다 영속 훅(onSessionPersist)이 돈다. 실기기 실측(2026-09-02): 메모리에만 있던
    /// 세션이 앱 종료로 사라져 09-01 독서가 통째로 유실됐다(프레즌스 reading_since 만 남음).
    @Published public var session: RTSession? { didSet { onSessionPersist?(session) } }
    /// 세션 영속 훅 (앱: UserDefaults JSON 저장/삭제). 틱마다 호출되므로 값이 작다.
    public var onSessionPersist: ((RTSession?) -> Void)?
    @Published public var justResumed = false
    @Published public var sheet: RTSheet?
    @Published public var addtimeValue = 35          // 시안 데모 상태
    @Published public var addtimePreset: Int? = 15
    /// 07 일시 — nil = 저장하는 순간(지금). 피커로 고르면 그 시각이 기록의 끝 시각이 된다.
    @Published public var addtimeDate: Date?
    /// 07 을 '기록 고치기'로 연 대상 (08 기록 행 탭). nil = 새 기록 추가.
    @Published public private(set) var editingRecord: RTSessionRecord?
    /// 고치기 시트를 열 때 채운 분 — 분을 안 바꾸고 저장하면 원래 초를 그대로 둔다(표시값으로 덮으면 초가 사라진다)
    private var editPrefillMinutes: Int?
    /// 07 에서 기록할 책 — 시트를 열 때 상세의 책(고치기면 그 기록의 책)으로 채우고, 책 행에서 바꿀 수 있다.
    @Published public var addtimeISBN: String?
    public var addtimeBook: RTBook? {
        guard let isbn = addtimeISBN else { return nil }
        return userData?.books.first { $0.isbn == isbn }
    }
    /// 07 책 고르기 목록 — 종이책만(밀리 편입 책은 기록이 자동이다). 읽는 중(최근 읽은·추가한 순) → 완독(최근 완독순).
    public var addtimeBookChoices: [RTBook] {
        guard let d = userData else { return [] }
        var lastRead = [String: Date]()
        for s in d.sessions { if let i = s.isbn, s.endedAt > (lastRead[i] ?? .distantPast) { lastRead[i] = s.endedAt } }
        func key(_ b: RTBook) -> Date { max(b.addedAt, lastRead[b.isbn] ?? .distantPast) }
        let paper = d.books.filter { $0.millieBookId == nil }
        return paper.filter { !$0.finished }.sorted { key($0) > key($1) }
            + paper.filter(\.finished).sorted { ($0.finishedAt ?? $0.addedAt) > ($1.finishedAt ?? $1.addedAt) }
    }
    public func chooseAddtimeBook(_ isbn: String) { addtimeISBN = isbn }
    @Published public var rating = 4                 // 09 데모: 4★
    @Published public var added: Set<String> = ["flow"]  // 13 데모: 첫 행 추가됨
    @Published public var libraryFilter: RTLibraryFilter = .all
    @Published public var librarySort: RTLibrarySort = .recent
    @Published public var libraryQuery = ""
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
    @Published public var statsSubject: StatsSubject = .me { didSet { statsStamp += 1 } }

    /// 파트너 데이터 (공유 Supabase 로드 — 백엔드 RLS/프레즌스는 별도 작업). nil = 데모(시안 값)로 렌더.
    @Published public var partnerData: RTUserData? { didSet { statsStamp += 1 } }
    /// 파트너 사진 (미커밋 → nil, 이니셜 "소" 폴백)
    @Published public var partnerAvatar: CGImage?
    /// 파트너 이름 — 보는 사람 기준(지오 폰=소연, 소연 폰=지오). 앱이 uid→이름 주입.
    /// 데모/미로그인 기본 "소연"(시안, 뷰어=지오 가정). rtshot 픽셀 오라클 불변.
    @Published public var partnerName: String = "소연"
    public var partnerInitial: String { String(partnerName.prefix(1)) }
    /// 파트너 "지금 읽는 중" 프레즌스 — 백엔드가 활성 세션 신호로 세팅(현재 미배선 → false)
    @Published public var partnerReadingNow = false

    /// 홈 파트너 행 탭 → 파트너 통계(주간)
    /// 홈 파트너 행 요약 — 행이 답해야 하는 것은 "오늘 몇 분"이 아니라 **마지막으로 읽은 때와
    /// 그때 읽던 책**이다(사용자 보고 2026-09-16: 28일째 안 읽었는데 늘 "0분 오늘"이 떴다).
    /// 책은 서재 배열 순서가 아니라 마지막 세션의 책 — 미완독이 여러 권이면 둘이 갈린다.
    public var partnerSummary: (lastAt: Date?, lastBook: String?, readToday: Bool,
                                todayMinutes: Int, lastDayMinutes: Int)? {
        guard let d = partnerData else { return nil }
        let last = d.sessions.max { $0.endedAt < $1.endedAt }
        let title = last?.isbn.flatMap { isbn in d.books.first { $0.isbn == isbn }?.title }
        let todaySec = d.sessions.filter { cal.isDate($0.endedAt, inSameDayAs: now()) }
            .reduce(0) { $0 + $1.seconds }
        let readToday = last.map { cal.isDate($0.endedAt, inSameDayAs: now()) } ?? false
        // 마지막으로 읽은 '그날' 의 총 시간 — 오늘 안 읽었을 때 우측에 이 값을 보여준다
        let lastDaySec = last.map { l in
            d.sessions.filter { cal.isDate($0.endedAt, inSameDayAs: l.endedAt) }
                .reduce(0) { $0 + $1.seconds }
        } ?? 0
        return (last?.endedAt, title, readToday, todaySec / 60, lastDaySec / 60)
    }

    public func openPartnerStats() {
        statsSubject = .partner
        nav(.stats)
        // 현재 달에 파트너 기록이 없으면 빈 화면이 뜬다 — 마지막으로 읽은 달을 연다
        // (사용자 보고 2026-09-16: 행을 탭했더니 최근 기록이 없었다. 소연 기록은 8월까지).
        // nav(.stats) 가 statsMonth 를 nil(현재 달)로 초기화하므로 그 뒤에 지정한다.
        guard let last = partnerData?.sessions.max(by: { $0.endedAt < $1.endedAt })?.endedAt else { return }
        let ym = RTStatsYM(year: cal.component(.year, from: last), month: cal.component(.month, from: last))
        let today = RTStatsYM(year: cal.component(.year, from: now()), month: cal.component(.month, from: now()))
        statsMonth = ym == today ? nil : ym
    }
    /// 내 통계 진입 (홈 메뉴) — 주체 .me 리셋
    public func openMyStats() {
        statsSubject = .me
        nav(.stats)
    }

    /// 데모 파트너 주입 (검증·기기 데모용 — 백엔드 배선 전) — 시안값(소연·작별하지 않는다·오늘 24분)
    /// reading=false 면 idle(3시간 전) — 마지막 세션 3시간 전, 링/헤일로 없음.
    /// daysAgo > 0 이면 '한참 전에 읽고 그만둔' 상태 — 행 우측이 오늘치가 아니라 마지막으로
    /// 읽은 날을 대야 한다(사용자 보고 2026-09-16: 28일째 안 읽었는데 "0분 오늘"이 떴다).
    public func loadDemoPartner(reading: Bool = true, daysAgo: Int = 0) {
        let t = now()
        let ended = daysAgo > 0 ? t.addingTimeInterval(-Double(daysAgo) * 86_400)
                                : (reading ? t : t.addingTimeInterval(-3 * 3600))
        // 실 표지 URL(알라딘) — 파트너 통계 표지 로딩 검증용 실데이터
        let book = RTBook(isbn: "9788937489341", title: "차남들의 세계사", author: "이기호",
                          publisher: "민음사",
                          coverUrl: "https://image.aladin.co.kr/product/4443/8/cover200/8937489341_1.jpg",
                          addedAt: t)
        partnerData = RTUserData(books: [book],
            sessions: [RTSessionRecord(isbn: book.isbn, mode: "flip", seconds: 24 * 60, endedAt: ended, pauseCount: 0)])
        partnerReadingNow = reading && daysAgo == 0
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
    /// 05 링 데모 최장 — 시안 J 데모 값 47:00 (userData nil 경로)
    public static let demoBest = 47 * 60

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
    /// 최근 검색어가 바뀜 — 앱이 UserDefaults 에 저장해 다시 켠 뒤 restoreRecentQueries 로 되살린다
    public var onRecentQueriesChange: (([String]) -> Void)?
    /// 로그인 버튼 핸들러 (iOS OAuth 배선) — nil 이면 즉시 login() (rtshot/rtapp 데모 경로)
    public var loginHandler: (() -> Void)?
    /// 읽는 중 프레즌스 변화 (true=recording 시작, false=정지/종료) — 앱이 CloudStore.setReadingSince 배선
    public var onReadingPresence: ((Bool) -> Void)?
    private func emitPresence() { onReadingPresence?(session?.status == .recording) }

    // ── 실데이터 정본 (§6-④) — nil 이면 데모 모드 (rtshot/rtapp 픽셀 오라클 불변) ──
    @Published public var userData: RTUserData? {
        didSet {
            statsStamp += 1
            if let d = userData { added = Set(d.books.map(\.isbn)) } }
    }
    /// 변경 영속 훅 (앱: UserDefaults JSON 저장)
    public var onUserDataChange: ((RTUserData) -> Void)?
    /// 서버에 스냅샷을 못 올리기 시작한 시각 — nil = 정상. 설정 시트가 보여 주고, 누르면 다시 올린다.
    @Published public private(set) var syncFailedAt: Date?
    /// 설정 시트 '동기화' 행 탭 (앱: 현재 스냅샷 다시 업로드)
    public var onSyncRetry: (() -> Void)?
    /// 업로드 결과 — 실패가 이어지는 동안은 처음 실패한 시각을 유지한다
    public func noteSyncResult(_ ok: Bool) {
        if ok { syncFailedAt = nil } else if syncFailedAt == nil { syncFailedAt = now() }
    }
    /// 로컬 사본이 없는 기기는 서버 복원 전까지 스냅샷 업로드를 막는다.
    public var needsUserDataRestore = false
    public func restoreUserDataIfNeeded(fetch: () async throws -> String?) async throws {
        guard needsUserDataRestore else { return }
        let json = try await fetch()
        guard needsUserDataRestore else { return }
        if let json {
            let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
            let restored = try decoder.decode(RTUserData.self, from: Data(json.utf8))
            userData = restored
            onUserDataChange?(restored)
            mergeEbookMarks()   // 서버에 실린 밀리 숨김·완독 표시를 이 기기에도
        }
        needsUserDataRestore = false
    }
    /// 시간 주입 (테스트 결정적 실행)
    public var now: () -> Date = { Date() }

    private func mutateUserData(_ mutate: (inout RTUserData) -> Void) {
        guard var d = userData else { return }
        mutate(&d)
        // 밀리 숨김·완독 표시는 늘 스냅샷에 함께 싣는다 — 서버로 올라가 기기를 바꿔 복원할 때 되살아난다(2026-11-08)
        let hidden = hiddenEbooks.sorted()
        d.hiddenEbooks = hidden.isEmpty ? nil : hidden
        d.finishedEbooks = finishedEbooks.isEmpty ? nil : finishedEbooks
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
        return d.books.filter { !$0.finished && $0.millieBookId == nil }.max { key($0) < key($1) }   // 밀리 편입 책 제외
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

    private var cal: Calendar { dateTools().cal }

    /// Calendar·DateFormatter 캐시 — 접근할 때마다 새로 만들던 것이 홈 한 번 그리기 38ms·타이머 1초 갱신 9.5ms 의
    /// 대부분이었다(2026-11-08 맥 측정, 기록 700건·밀리 400일). 시간대가 바뀌면(여행) 새로 만든다.
    private var dateToolsCache: (tz: TimeZone, cal: Calendar, day: DateFormatter)?
    private func dateTools() -> (cal: Calendar, day: DateFormatter) {
        let tz = TimeZone.current
        if let t = dateToolsCache, t.tz == tz { return (t.cal, t.day) }
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 2   // 월요일 시작 (v8 주간 통계)
        c.timeZone = tz
        let f = DateFormatter()
        f.calendar = c
        f.timeZone = tz
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        dateToolsCache = (tz, c, f)
        return (c, f)
    }

    /// 전자책(밀리) 일별 초 — "yyyy-MM-dd"(실발생일) → seconds. book_reading_seconds 읽기 전용,
    /// 통계는 표시 계층에서 종이+전자 합산 (README 결정: DB에선 안 섞음). 데모(userData nil) 미적용.
    @Published public var ebookDaily: [String: Int] = [:] { didSet { statsStamp += 1 } }
    /// 밀리 일별×책별 — day "yyyy-MM-dd" → 그날 읽은 책 제목들 (book_reading_books)
    @Published public var ebookBooks: [String: [String]] = [:] { didSet { statsStamp += 1 } }
    /// 밀리 책 표지 (제목 → cover_url, 밀리 CDN) — 랭킹·월간 캘린더 표기
    @Published public var ebookCovers: [String: String] = [:] { didSet { statsStamp += 1 } }

    /// 밀리 책 단위 메타 (제목 → 저자·출판사·표지, book_millie_books) — 서재 편입·ISBN 매칭 재료.
    /// 밀리 book 캐시(최근 3권 롤링)에서 밀려난 과거 책은 저자까지만 있다(출판사 NULL — 원천 유실).
    @Published public var millieMeta: [String: RTMillieMeta] = [:]

    /// 밀리 책별 '마지막으로 읽은 시각' (제목 → read_at). 홈 카드 최근순 정렬 정본.
    /// 원천(밀리 로컬 DB)은 초 단위인데 구 동기화가 날짜로 잘라 올렸다 — 0005 마이그로 복원.
    @Published public var ebookReadAt: [String: Date] = [:]
    /// 앱에서 완독 처리한 밀리 책 (제목 → 완독 처리 시각). 그 시각보다 최신 기록이 들어오면
    /// 다시 읽는 것으로 보고 카드가 되살아난다 (종이책 rereadBook 과 대칭).
    @Published public var finishedEbooks: [String: Date] = [:]
    /// 홈 캐러셀에서 고른 카드의 안정 식별자. 인덱스를 들고 있으면 카드 배열이 재정렬될 때
    /// 같은 번호가 다른 책을 가리킨다 — loadEbook 이 포그라운드 복귀마다 밀리 기록을 다시
    /// 주입하므로 실제로 일어난다(실사고 2026-09-15: 고른 책은 서성이다인데 0번이 밀리 책이
    /// 되어 89분 세션이 isbn:null 로 저장됨).
    @Published private var selectedCardID: String?

    /// 홈 캐러셀에서 현재 보고 있는 카드 인덱스 — 저장은 카드 ID 로 하고 인덱스는 그때 계산한다.
    public var homeCardIndex: Int {
        get {
            guard let id = selectedCardID,
                  let i = homeCards.firstIndex(where: { $0.id == id }) else { return 0 }
            return i
        }
        set {
            let cards = homeCards
            selectedCardID = cards.indices.contains(newValue) ? cards[newValue].id : nil
        }
    }

    /// 홈 표지 카드 — 읽는 중 종이책 + 최근 밀리 책을 '최근 읽은 순'으로.
    /// 데모(userData nil)는 빈 배열 → 홈은 기존 시안 히어로를 그린다 (rtshot 오라클 불변).
    public var homeCards: [RTHomeCard] {
        guard let d = userData else { return [] }

        var lastRead: [String: Date] = [:]
        for s in d.sessions {
            if let i = s.isbn, s.endedAt > (lastRead[i] ?? .distantPast) { lastRead[i] = s.endedAt }
        }
        // 밀리 편입 책(다시 읽기 상태)은 종이 카드가 아니다 — 밀리 카드가 ebookReadAt 로 따로 서고,
        // 종이 카드로 새면 중복 노출 + 엎기 기록 대상이 된다 (실측 2026-09-02)
        let paper = d.books.filter { !$0.finished && $0.millieBookId == nil }.map { b in
            RTHomeCard(title: b.title, author: b.author, coverUrl: b.coverUrl,
                       isbn: b.isbn, isEbook: false,
                       lastReadAt: max(b.addedAt, lastRead[b.isbn] ?? .distantPast))
        }
        // 밀리: 완독 처리 이후 더 최신 기록이 없으면 제외. 30일 넘게 안 읽은 책도 제외 — 밀리에서 한 번 열어 본
        // 책이 홈에 끝없이 쌓였다(2026-11-08 검토). 다시 읽으면 read_at 이 갱신돼 돌아온다.
        let cutoff = now().addingTimeInterval(-Double(Self.millieCardDays) * 86_400)
        let ebook = ebookReadAt.compactMap { (title, readAt) -> RTHomeCard? in
            if hiddenEbooks.contains(title) || readAt < cutoff { return nil }
            if let finishedAt = finishedEbooks[title], readAt <= finishedAt { return nil }
            return RTHomeCard(title: title, author: nil, coverUrl: ebookCovers[title] ?? "",
                              isbn: nil, isEbook: true, lastReadAt: readAt)
        }
        return (paper + ebook).sorted { $0.lastReadAt > $1.lastReadAt }
    }

    /// 밀리 홈 카드 유지 기간(일)
    public static let millieCardDays = 30

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

    /// 홈에서 현재 카드를 완독 처리 (밀리 전용 — UI 진입점).
    /// 카드가 빠지면서 인덱스가 배열 밖으로 나가지 않게 보정한다.
    public func finishSelectedCard() {
        let cards = homeCards
        guard homeCardIndex >= 0, homeCardIndex < cards.count else { return }
        let card = cards[homeCardIndex]
        guard card.finishable else { return }
        finishEbook(card.title)
        homeCardIndex = min(homeCardIndex, max(0, homeCards.count - 1))
    }

    /// 밀리 책 완독 처리 — 홈 카드에서 제외하고 **서재에 편입**한다(사용자 결정 2026-09-01:
    /// 완독한 밀리 책이 어디에도 안 남던 공백 해소). 이후 더 최신 밀리 기록이 오면 카드는 자동 복귀.
    public func finishEbook(_ title: String) {
        finishedEbooks[title] = now()
        onFinishedEbooksChange?(finishedEbooks)
        adoptFinishedEbook(title)   // 편입이 스냅샷을 바꾸며 완독 표시도 함께 싣는다
    }
    /// 완독 처리 영속 훅 (앱: UserDefaults JSON)
    public var onFinishedEbooksChange: (([String: Date]) -> Void)?

    /// 홈에서 지운 밀리 책 (사용자 결정 2026-09-15) — 밀리에서 눌러보기만 한 책이 카드로
    /// 쌓이는데 지울 방법이 완독 처리뿐이었다(그건 서재에 편입시키는 반대 동작).
    /// 완독과 달리 더 최신 밀리 기록이 와도 되살아나지 않고, 기록에서도 빠진다.
    @Published public var hiddenEbooks: Set<String> = [] { didSet { statsStamp += 1 } }
    /// 삭제 영속 훅 (앱: UserDefaults JSON)
    public var onHiddenEbooksChange: ((Set<String>) -> Void)?

    public func deleteEbook(_ title: String) {
        hiddenEbooks.insert(title)
        onHiddenEbooksChange?(hiddenEbooks)
        mutateUserData { _ in }   // 숨김 표시를 스냅샷에 싣는다
    }

    /// 앱 시작·서버 복원 때 — 기기(UserDefaults) 표시와 스냅샷 표시를 합쳐 양쪽을 같게 맞춘다.
    /// 숨김은 합집합(되살리는 동작이 없다), 완독 시각은 더 늦은 쪽.
    public func mergeEbookMarks() {
        guard let d = userData else { return }
        let hidden = hiddenEbooks.union(d.hiddenEbooks ?? [])
        var finished = finishedEbooks
        for (title, at) in d.finishedEbooks ?? [:] { finished[title] = max(finished[title] ?? at, at) }
        if hidden != hiddenEbooks { hiddenEbooks = hidden; onHiddenEbooksChange?(hidden) }
        if finished != finishedEbooks { finishedEbooks = finished; onFinishedEbooksChange?(finished) }
        if (d.hiddenEbooks ?? []) != hidden.sorted() || (d.finishedEbooks ?? [:]) != finished {
            mutateUserData { _ in }
        }
    }

    /// 홈에서 현재 카드를 삭제 (밀리 전용 — UI 진입점). 인덱스가 배열 밖으로 나가지 않게 보정.
    public func deleteSelectedCard() {
        let cards = homeCards
        let i = homeCardIndex
        guard cards.indices.contains(i), cards[i].deletable else { return }
        deleteEbook(cards[i].title)
        homeCardIndex = min(i, max(0, homeCards.count - 1))
    }

    /// 삭제한 책만 있는 날을 뺀 밀리 일별 초 — 시간·연속·합계의 공통 정본.
    /// 그날 시간(book_reading_seconds)은 날짜 총합이라 책별로 안 나뉜다 → 남은 책이 있으면
    /// 그 시간은 남은 책 몫으로 둔다. 어느 책이 그날 읽혔는지 모르는 날(ebookBooks 없음)도 유지.
    private var visibleEbookDaily: [String: Int] {
        guard !hiddenEbooks.isEmpty else { return ebookDaily }
        if let c = visibleEbookCache, c.stamp == statsStamp { return c.daily }
        let v = ebookDaily.filter { day, _ in
            guard let titles = ebookBooks[day], !titles.isEmpty else { return true }
            return !titles.allSatisfy { hiddenEbooks.contains($0) }
        }
        visibleEbookCache = (statsStamp, v)
        return v
    }
    /// 입력(기록·밀리·숨김)이 바뀌면 statsStamp 가 오른다 — 그때만 다시 계산한다 (매초 타이머 갱신마다 훑지 않게)
    private var visibleEbookCache: (stamp: Int, daily: [String: Int])?
    private var readDaysCache: (stamp: Int, tz: TimeZone, days: Set<Date>)?

    // ── 밀리 서재 편입 (사용자 결정 2026-09-01) ────────────────────────────

    /// 편입 직후 호출 — 앱이 알라딘 ISBN 매칭(matchAdoptedMillieBook)을 비동기로 배선한다.
    public var onMillieAdopted: ((String) -> Void)?

    /// 완독 밀리 책을 RTBook 으로 서재에 남긴다. 데모(userData nil)는 기존 마커 동작만.
    /// 밀리 원천엔 ISBN 이 없어(2026-09-01 실측) 키는 "millie:<book_id>", 메타가 아직
    /// 동기화되지 않은 책은 "millie:t:<제목>" — 이후 알라딘 매칭이 실 ISBN 으로 올린다.
    private func adoptFinishedEbook(_ title: String) {
        guard userData != nil else { return }
        // 재완독 — 이미 편입된 항목이면 완독 상태만 갱신 (중복 생성 금지).
        // 아직 밀리 키면(첫 매칭이 네트워크 등으로 실패) 재완독을 복구 기회로 삼아 재매칭한다.
        if let existing = userData?.books.first(where: { $0.millieBookId != nil && $0.title == title }) {
            mutateUserData { d in
                if let i = d.books.firstIndex(where: { $0.isbn == existing.isbn }) {
                    d.books[i].finished = true
                    d.books[i].finishedAt = now()
                }
            }
            if existing.isbn.hasPrefix("millie:") { onMillieAdopted?(existing.isbn) }
            return
        }
        let meta = millieMeta[title]
        let key = "millie:" + (meta?.bookId ?? "t:" + title)
        // addedAt = 그 책을 처음 읽은 날 (일별 히스토리 최소 day, 없으면 지금)
        let firstDay = ebookBooks
            .filter { $0.value.contains(title) }.keys
            .compactMap { dayFormatter.date(from: $0) }.min()
        let book = RTBook(isbn: key, title: title,
                          author: meta?.author ?? "",
                          publisher: meta?.publisher ?? "",
                          coverUrl: meta?.coverUrl ?? ebookCovers[title] ?? "",
                          addedAt: firstDay ?? now(),
                          finished: true, rating: nil, finishedAt: now(),
                          millieBookId: meta?.bookId ?? title)
        mutateUserData { d in d.books.append(book) }
        onMillieAdopted?(key)
    }

    /// 편입된 밀리 책의 알라딘 ISBN 매칭 — 제목(대괄호 꼬리 제거)으로 검색해 저자가 맞는
    /// 첫 후보로 업그레이드한다. provider 부재·검색 실패·미스매치는 조용히 유지(밀리 키 운영).
    public func matchAdoptedMillieBook(_ key: String) async {
        guard let searchProvider,
              let book = userData?.books.first(where: { $0.isbn == key }) else { return }
        let query = Self.normalizedMillieTitle(book.title)
        guard let hits = try? await searchProvider(query), !hits.isEmpty else { return }
        guard let hit = Self.bestMillieMatch(hits: hits, title: book.title,
                                             author: book.author.isEmpty ? nil : book.author)
        else { return }
        upgradeMillieBook(key: key, to: hit)
    }

    /// 매칭 성공 → 밀리 키를 실 ISBN 으로 교체. 표지는 화면에 쓰던 밀리 것을 유지하고
    /// 빈 저자·출판사만 알라딘으로 보강한다. 같은 ISBN 이 서재에 이미 있으면(종이로도 보유)
    /// 중복을 만들지 않도록 포기한다 — 병합은 별건.
    public func upgradeMillieBook(key: String, to hit: RTBookHit) {
        // 이 책 상세가 열려 있으면 새 키를 따라간다 — 옛 키로 남으면 selectedBook 이 읽는 중 종이책으로 넘어가
        // 상세가 다른 책으로 바뀌었다(2026-11-08, MillieLibraryUITests 가 검색 응답 속도에 따라 실패한 원인)
        let followSelection = selectedISBN == key
        defer {
            if followSelection, userData?.books.contains(where: { $0.isbn == hit.isbn && $0.millieBookId != nil }) == true {
                selectedISBN = hit.isbn
            }
        }
        mutateUserData { d in
            guard let i = d.books.firstIndex(where: { $0.isbn == key }),
                  !d.books.contains(where: { $0.isbn == hit.isbn }) else { return }
            let old = d.books[i]
            d.books[i] = RTBook(isbn: hit.isbn, title: old.title,
                                author: old.author.isEmpty ? hit.author : old.author,
                                publisher: old.publisher.isEmpty ? hit.publisher : old.publisher,
                                coverUrl: old.coverUrl.isEmpty ? hit.coverUrl : old.coverUrl,
                                addedAt: old.addedAt, finished: old.finished,
                                rating: old.rating, finishedAt: old.finishedAt,
                                millieBookId: old.millieBookId)
        }
    }

    /// 밀리 제목 정규화 — 말미 대괄호 블록([개정2판] 등) 제거 + 공백 정리. 검색어·매칭 공용.
    static func normalizedMillieTitle(_ t: String) -> String {
        var s = t.trimmingCharacters(in: .whitespaces)
        while s.hasSuffix("]"), let open = s.lastIndex(of: "[") {
            s = String(s[..<open]).trimmingCharacters(in: .whitespaces)
        }
        return s
    }

    /// 밀리 저자 정규화 — "이기호 지음 / 박선경 그림" → "이기호". 첫 인명 토큰만 취한다.
    static func normalizedMillieAuthor(_ a: String) -> String {
        let first = a.split(whereSeparator: { "/,·".contains($0) }).first.map(String.init) ?? a
        var s = first.trimmingCharacters(in: .whitespaces)
        for role in ["지음", "옮김", "그림", "글", "저"] where s.hasSuffix(role) {
            s = String(s.dropLast(role.count)).trimmingCharacters(in: .whitespaces)
        }
        return s
    }

    /// 알라딘 후보 중 밀리 책과 같은 책 고르기 — 정규화 제목 일치 + 저자 토큰 포함.
    /// 알라딘은 부제를 "제목 - 부제" 로 붙이므로(실측 2026-09-01) 그 경계까지는 같은 책으로
    /// 본다. 저자를 모르면 제목 일치만으로 인정한다(동명 책 오매칭 방지 — 부제 경계는 유지).
    static func bestMillieMatch(hits: [RTBookHit], title: String, author: String?) -> RTBookHit? {
        let t = normalizedMillieTitle(title)
        func titleMatches(_ candidate: String) -> Bool {
            let c = normalizedMillieTitle(candidate)
            return c == t || c.hasPrefix(t + " - ")
        }
        if let author {
            let a = normalizedMillieAuthor(author)
            return hits.first { titleMatches($0.title) && $0.author.contains(a) }
        }
        return hits.first { titleMatches($0.title) }
    }

    /// 그날 밀리 시간의 책별 귀속 — 그날 책이 **정확히 1권**일 때만 그 책에 붙인다.
    /// 2권 이상이면 비율을 알 수 없고, 기록이 없으면 무슨 책인지 알 수 없으므로 서비스명으로 둔다.
    /// 직전 책·현재 책 추측은 금지 — 5월 독서에 8월에 읽는 책 이름이 붙던 원인(실측 56%).
    public func ebookBreakdown(on date: Date) -> [(title: String, seconds: Int)] {
        let total = ebookSeconds(on: date)
        guard total > 0 else { return [] }
        let titles = (ebookBooks[dayFormatter.string(from: date)] ?? [])
            .filter { !hiddenEbooks.contains($0) }
        if titles.count == 1 { return [(titles[0], total)] }
        return [("밀리의서재", total)]
    }

    private var dayFormatter: DateFormatter { dateTools().day }
    /// 밀리 하루 최소 인정 시간(초). 이 미만은 앱을 잠깐 띄운 것으로 보고 기록에서 뺀다.
    /// 실측(2026-08-28): 62일 중 25일이 1~56초라 연속·읽은 날 수가 그만큼 부풀어 있었다.
    /// 원본은 book_reading_seconds 에 그대로 두고 표시 계층에서만 거른다(비가역 손실 방지).
    public static let ebookMinSeconds = 60

    public func ebookSeconds(on date: Date) -> Int {
        guard userData != nil else { return 0 }
        let sec = visibleEbookDaily[dayFormatter.string(from: date)] ?? 0
        return sec >= Self.ebookMinSeconds ? sec : 0
    }
    /// 기록으로 인정된 밀리 총 시간(초) — 1분 미만 날 제외
    public var countedEbookTotalSeconds: Int {
        userData == nil ? 0 : visibleEbookDaily.values.filter { $0 >= Self.ebookMinSeconds }.reduce(0, +)
    }
    /// 기록으로 인정된 밀리 날수 — 1분 미만 날 제외 (홈 밀리 카드 '횟수')
    public var countedEbookDayCount: Int {
        userData == nil ? 0 : visibleEbookDaily.values.filter { $0 >= Self.ebookMinSeconds }.count
    }
    /// 기록 있는 날(startOfDay) — 종이 그날 합 1분 이상 ∪ 밀리(1분 이상). 연속·체인 판정 정본.
    /// 종이도 밀리와 같은 기준이다: 실수로 눌렀다 끈 몇 초짜리 탭 세션이 연속일을 이어 주면 안 된다(2026-11-08 검토).
    private var readDays: Set<Date> {
        guard let d = userData else { return [] }
        let tz = TimeZone.current
        if let c = readDaysCache, c.stamp == statsStamp, c.tz == tz { return c.days }
        var paper: [Date: Int] = [:]
        for s in d.sessions { paper[cal.startOfDay(for: s.endedAt), default: 0] += s.seconds }
        var days = Set(paper.filter { $0.value >= Self.ebookMinSeconds }.keys)
        let f = dayFormatter
        for (k, sec) in visibleEbookDaily where sec >= Self.ebookMinSeconds {
            if let dt = f.date(from: k) { days.insert(cal.startOfDay(for: dt)) }
        }
        readDaysCache = (statsStamp, tz, days)
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

    /// 밀리 책이 기록된 날 (최신순) — 1분 미만 날은 제외(ebookSeconds 규칙).
    /// 08 상세의 기록 행과 09 완독 시트의 누적이 같은 날 목록을 써야 한다.
    public func ebookReadDays(title: String) -> [Date] {
        let f = dayFormatter
        return ebookBooks.filter { $0.value.contains(title) }.keys.sorted(by: >)
            .compactMap { f.date(from: $0) }
            .filter { ebookSeconds(on: $0) > 0 }
    }

    /// 한 책의 누적 — (초, 기록 수). 종이는 세션 합·세션 수, 밀리는 귀속된 날 합·읽은 날 수.
    /// 밀리 시간은 그날 책이 1권일 때만 붙는다(ebookBreakdown 규칙 — 다권 날 추측 금지).
    /// 파트너 스냅샷엔 밀리 히스토리가 없으므로 ebooks: false 로 0 을 낸다 (내 기록 오염 방지).
    /// 08 상세 히어로와 09 완독 시트가 같은 수를 내야 하는 정본.
    public func bookTotals(_ book: RTBook, in data: RTUserData,
                           ebooks: Bool = true) -> (seconds: Int, count: Int) {
        if book.millieBookId != nil {
            guard ebooks else { return (0, 0) }
            let days = ebookReadDays(title: book.title)
            let sec = days.reduce(0) { $0 + (ebookBreakdown(on: $1).first { $0.title == book.title }?.seconds ?? 0) }
            return (sec, days.count)
        }
        let forBook = data.sessions.filter { $0.isbn == book.isbn }
        return (forBook.reduce(0) { $0 + $1.seconds }, forBook.count)
    }

    /// 최신순 세션 기록
    public func recentRecords(_ limit: Int) -> [RTSessionRecord] {
        Array((userData?.sessions ?? []).sorted { $0.endedAt > $1.endedAt }.prefix(limit))
    }

    /// 홈 '마지막 기록' 행 — 종이 세션과 밀리 기록 중 더 최근 것.
    /// 책이 안 붙은 종이 기록은 제목을 "기록" 으로 둔다. 다른 카드에서 이름을 빌려오면
    /// 읽지도 않은 책이 기록으로 보인다(실사고 2026-09-15).
    public var lastRecord: (title: String, minutes: Int, at: Date, isEbook: Bool)? {
        guard userData != nil else { return nil }
        let paper = recentRecords(1).first
        // 기록에서 뺀 날(1분 미만·지운 책)은 대표로 내세우지 않는다 — 통계에선 빼면서
        // 이 행에만 "0분 읽음" 으로 뜨던 불일치(2026-09-16).
        let ebook = ebookReadAt
            .filter { !hiddenEbooks.contains($0.key) && ebookSeconds(on: $0.value) > 0 }
            .max { $0.value < $1.value }
        let ebookIsLatest = ebook.map { e in paper.map { e.value > $0.endedAt } ?? true } ?? false

        if ebookIsLatest, let e = ebook {
            let min = ebookBreakdown(on: e.value).first { $0.title == e.key }.map { $0.seconds / 60 } ?? 0
            return (e.key, min, e.value, true)
        }
        guard let p = paper else { return nil }
        let title = p.isbn.flatMap { isbn in userData?.books.first { $0.isbn == isbn }?.title }
        return (title ?? "기록", p.seconds / 60, p.endedAt, false)
    }

    /// 홈 '마지막 기록' 행 탭 — 그 행이 이름을 댄 책의 상세(08).
    /// 행에 뜬 책과 열리는 책이 달라선 안 된다. 밀리 기록이 최신이면(밀리는 08 상세가 없다)
    /// 이동하지 않는다 — 종이책 상세로 새면 읽지도 않은 책을 연 것처럼 보인다.
    public func openRecentDetail() {
        if lastRecord?.isEbook == true { return }
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

    /// 파트너가 지금 읽는 중인가 — reading_since 만 보면 안 된다.
    /// 그 시각 뒤에 끝난 세션이 있으면 그 독서는 이미 끝났다(실데이터가 그 모양이었다:
    /// reading_since 09-15 11:46 · 마지막 세션 종료 12:31). 세션 기록이 아직 안 올라온
    /// 경우를 위해 12시간 상한도 남긴다 — 앱이 죽어 해제가 못 나갔을 때의 안전장치.
    public static func partnerIsReading(since: Date?, lastSessionEnd: Date?, now: Date) -> Bool {
        guard let since else { return false }
        if let end = lastSessionEnd, end >= since { return false }
        return now.timeIntervalSince(since) < 12 * 3600
    }

    /// 짧은 날짜 라벨 "오늘 / 어제 / M.d" — 파트너 행 우측처럼 폭이 좁은 자리용
    public static func shortDay(_ date: Date, now: Date) -> String {
        let c = Calendar(identifier: .gregorian)
        if c.isDate(date, inSameDayAs: now) { return "오늘" }
        if let y = c.date(byAdding: .day, value: -1, to: now), c.isDate(date, inSameDayAs: y) { return "어제" }
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
    ///
    /// 홈(02) 리디자인으로 화면 호출처는 사라졌으나 테스트 4건이 dayset 계약을 검증하고
    /// 그것이 bestStreak 회귀 방어로 쓰인다 — 삭제 금지(작업지시서 v3 AC #22).
    public func streakChain(_ count: Int) -> [Bool] {
        guard userData != nil else { return [Bool](repeating: false, count: count) }
        let days = readDays
        let today = cal.startOfDay(for: now())
        return (0..<count).map { i in
            guard let day = cal.date(byAdding: .day, value: -(count - 1 - i), to: today) else { return false }
            return days.contains(day)
        }
    }

    /// 역대 최고 연속일 — **현재 진행 중인 구간은 제외**한다 (작업지시서 v3 §5.1).
    /// 제외하지 않으면 기록 1일째에 best == streak 가 되어 "최고까지 0일"이 뜬다(AC #13).
    /// 동률이면 최근 구간. 과거 완료 구간이 없으면 (0, "") → 게이지 하단 행을 숨긴다.
    public var bestStreak: (days: Int, monthLabel: String) {
        let sorted = readDays.sorted()
        guard !sorted.isEmpty else { return (0, "") }

        // 진행 중 구간의 기준일 — 오늘, 오늘 미기록이면 어제 (streakDays 와 동일 판정)
        let today = cal.startOfDay(for: now())
        var anchor: Date? = readDays.contains(today) ? today : nil
        if anchor == nil, let y = cal.date(byAdding: .day, value: -1, to: today), readDays.contains(y) {
            anchor = y
        }

        // 연속 구간으로 분할
        var runs: [[Date]] = []
        var run: [Date] = [sorted[0]]
        for d in sorted.dropFirst() {
            if let next = cal.date(byAdding: .day, value: 1, to: run[run.count - 1]), next == d {
                run.append(d)
            } else {
                runs.append(run); run = [d]
            }
        }
        runs.append(run)

        // 진행 구간 제외 후 최장 — 동률이면 마지막 날이 더 최근인 쪽
        let done = runs.filter { r in anchor.map { !r.contains($0) } ?? true }
        guard let best = done.max(by: { a, b in
            a.count != b.count ? a.count < b.count : a[a.count - 1] < b[b.count - 1]
        }) else { return (0, "") }

        let last = best[best.count - 1]
        let y = cal.component(.year, from: last), mo = cal.component(.month, from: last)
        let label = y == cal.component(.year, from: now()) ? "\(mo)월" : "\(y).\(mo)"
        return (best.count, label)
    }

    /// 홈 2주 캘린더 창 — 월요일 시작 · 일요일 끝, 마지막 줄이 오늘이 포함된 주. 정확히 14칸.
    /// 롤링하지 않는다(작업지시서 v3 §4-⑤). 데모(userData nil)는 화면이 고정 배열을 쓰므로 빈 값.
    public var calendarWindow14: [HomeCalCell] {
        guard let d = userData,
              let week = cal.dateInterval(of: .weekOfYear, for: now()),
              let start = cal.date(byAdding: .day, value: -7, to: week.start) else { return [] }
        let today = cal.startOfDay(for: now())
        // 기록을 한 번만 훑어 날짜별로 묶는다 — 14칸마다 전체 기록을 비교하던 것이 홈 그리기 시간의 대부분이었다(2026-11-08 측정)
        let end = cal.date(byAdding: .day, value: 14, to: start) ?? start
        var paperByDay: [Date: Int] = [:]
        for s in d.sessions where s.endedAt >= start && s.endedAt < end {
            paperByDay[cal.startOfDay(for: s.endedAt), default: 0] += s.seconds
        }
        return (0..<14).compactMap { i in
            guard let date = cal.date(byAdding: .day, value: i, to: start) else { return nil }
            let day = cal.startOfDay(for: date)
            let future = day > today
            // 분 = (종이 세션 초 합 + 밀리 초) / 60, 내림 — todaySeconds 와 동일 규칙
            let paper = future ? 0 : paperByDay[day] ?? 0
            return HomeCalCell(date: day,
                               day: cal.component(.day, from: date),
                               minutes: future ? 0 : (paper + ebookSeconds(on: date)) / 60,
                               isToday: day == today,
                               isFuture: future,
                               isSunday: i % 7 == 6)
        }
    }
    @Published public var searchQuery = ""
    @Published public var searchResults: [RTBookHit]?
    /// searchResults 를 낸 검색어 — 검색칸 글자와 다르면 시트가 "이전 검색 · 검색어" 로 표시
    @Published public private(set) var resultsQuery: String?
    /// 최근 검색어 (최신 먼저, 최대 8개) — 결과가 있었던 검색만. 검색칸이 비면 시트 13 이 목록으로 보여 준다.
    @Published public private(set) var recentQueries: [String] = []
    static let recentQueryLimit = 8
    /// 검색 진행 중 — 시트 13 이 "검색 중…" 을 보인다. 프록시 상류가 느릴 때 아무 표시가 없으면
    /// 사용자는 검색 자체가 안 되는 것으로 본다 (실기기 보고 2026-09-10: "서성이다" 무반응).
    @Published public var searching = false
    /// 마지막 검색 실패 사유(사용자 문구). nil = 실패 없음. 새 검색 시작·시트 열기 시 지운다.
    @Published public var searchError: String?
    /// 마지막으로 provider 에 보낸 쿼리 — "다시 시도" 가 재사용.
    public private(set) var lastSearchQuery: String?
    /// 검색 세대 — 늦게 도착한 이전 검색의 결과·실패가 최신 검색을 덮어쓰지 않도록 판별.
    private var searchGeneration = 0

    public init() {}

    public func search(_ q: String) async {
        searchQuery = q
        // 공란/공백 쿼리는 provider 미호출 — 최신 검색 결과를 지우지 않고 그대로 노출(§ "공란=최신 검색")
        let trimmed = q.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let searchProvider else { return }
        searchGeneration += 1
        let generation = searchGeneration
        lastSearchQuery = trimmed
        searching = true
        searchError = nil
        do {
            let hits = RTBookHit.deduped(try await searchProvider(trimmed))
            guard generation == searchGeneration else { return }   // 더 새 검색이 시작됨 — 늦은 결과 폐기
            searchResults = hits                                    // 0건도 [] 로 반영 (nil = 이력 없음과 구분)
            resultsQuery = trimmed
            if !hits.isEmpty {
                setRecentQueries([trimmed] + recentQueries.filter { $0 != trimmed })
            }
        } catch {
            guard generation == searchGeneration else { return }
            // 실패를 삼키지 않는다 — try? 로 삼키던 시절엔 상류 무응답이 "검색이 안 됨" 으로 보였다
            searchError = Self.searchErrorMessage(error)
        }
        searching = false
    }

    /// 앱을 다시 켰을 때 저장해 둔 최근 검색어를 되살린다 (onRecentQueriesChange 의 짝 — 복원은 알리지 않는다)
    public func restoreRecentQueries(_ queries: [String]) {
        recentQueries = Self.cleanedQueries(queries)
    }

    /// 최근 검색어 × — 그 검색어만 지운다
    public func removeRecentQuery(_ query: String) {
        setRecentQueries(recentQueries.filter { $0 != query })
    }

    /// 저장된 목록, 없으면 11-08 판이 남긴 마지막 검색어(rt.lastSearch.query)를 첫 항목으로
    public static func loadRecentQueries(saved: [String]?, legacyQuery: String?) -> [String] {
        cleanedQueries(saved ?? (legacyQuery.map { [$0] } ?? []))
    }

    private func setRecentQueries(_ queries: [String]) {
        recentQueries = Self.cleanedQueries(queries)
        onRecentQueriesChange?(recentQueries)
    }

    /// 공백 제거·빈 칸 제외·중복 제거(앞쪽 우선)·최대 8개
    private static func cleanedQueries(_ queries: [String]) -> [String] {
        var seen = Set<String>()
        return Array(queries.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
            .prefix(recentQueryLimit))
    }

    /// 실패한 마지막 검색을 같은 쿼리로 다시 시도 (시트 13 "다시 시도").
    public func retrySearch() async {
        guard let q = lastSearchQuery else { return }
        await search(q)
    }

    /// 실패 사유 → 사용자 문구. 가장 흔한 실패는 프록시 상류(알라딘) 무응답 → 시간 초과라 따로 안내한다.
    /// RTViews 는 ReadingTimeKit 을 모르므로(AladinError 참조 불가) 5xx 등은 LocalizedError 문장으로 받는다.
    static func searchErrorMessage(_ error: Error) -> String {
        let generic = "검색에 실패했어요. 다시 시도해 주세요."
        if let urlError = error as? URLError {
            switch urlError.code {
            case .timedOut:
                return "검색 서버가 응답하지 않아요. 잠시 후 다시 시도해 주세요."
            case .notConnectedToInternet, .networkConnectionLost, .dnsLookupFailed,
                 .cannotFindHost, .cannotConnectToHost:
                return "인터넷 연결을 확인해 주세요."
            default:
                return generic
            }
        }
        if let described = (error as? LocalizedError)?.errorDescription, !described.isEmpty {
            return "\(described). 다시 시도해 주세요."
        }
        return generic
    }

    /// 상세(08) 뒤로가기 목적지 — 진입 시점의 출처로 자동 유도 (홈 '마지막 기록' 진입이 생기며
    /// 기존 서재 하드코딩이 결함이 됨). 상세 내 재진입(09 완독 등)은 출처 유지.
    public private(set) var detailOrigin: RTRoute = .library

    // ── 라우팅 (app.js nav) ──
    public func nav(_ to: RTRoute) {
        if sheet != nil { sheet = nil }
        // 상세 뒤로가기 목적지 = 진입 출처. 홈·서재·통계(주/월)에서 진입 가능 → 그 route 유지.
        if to == .detail && route != .detail {
            detailOrigin = [.home, .library, .stats].contains(route) ? route : .library
        }
        if to == .home { statsSubject = .me }   // 홈 복귀 시 파트너 통계 주체 리셋
        // 기록 원페이지 진입 — 현재 달·시트·전체 화면 지도 초기화 (08 에서 뒤로 복귀는 유지: 지도로 돌아온다)
        if to == .stats && route != .stats && route != .detail {
            statsMonth = nil
            statsSheet = nil
            mapFullscreen = false
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
        // 재완독은 그 책 별점을 프리셋, 평가 없는 책은 기본 4★ 로 되돌린다.
        // ?? 를 안 두면 직전에 평가한 다른 책의 별점이 남아 그대로 저장된다.
        if s == .finish { rating = selectedBook?.rating ?? 4 }
        // 책 추가: 검색창은 열 때마다 공란 → 최근 검색어 목록. 결과(searchResults)는 유지(최근 검색어를 다 지우면 보인다).
        // 실패 안내는 결과가 아니므로 지운다 (다시 열면 최신 결과부터).
        if s == .addbook { searchQuery = ""; searchError = nil }
        // 시간 직접 추가: 실데이터에선 시안 데모 상태(35분·+15 선택)로 열지 않는다. 일시 기본값은 지금.
        if s == .addtime {
            editingRecord = nil; editPrefillMinutes = nil
            if userData != nil { addtimeValue = 30; addtimePreset = nil; addtimeDate = nil; addtimeISBN = selectedBook?.isbn }
        }
        sheet = s
    }
    public func closeSheet() { sheet = nil; editingRecord = nil; editPrefillMinutes = nil }

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

    /// 세션 시작 의도 — isbn 미지정이면 홈 캐러셀에서 선택한 종이책 대상.
    /// flip 은 대기(03)를 거쳐 startSession 에서 세션이 생기므로 대상을 보류해 둔다.
    public func start(isbn: String? = nil) {
        nextSessionISBN = isbn ?? flipTargetISBN
        if mode == .flip { nav(.flipWait) }
        else { startSession(.tap); nav(.tapTimer) }
    }

    public func cancelSession() { session = nil; restoredGap = nil; nextSessionISBN = nil; mode = .flip; emitPresence(); nav(.home) }

    /// 앱 기동 시 영속된 세션 복원 — 종료 시점을 알 수 없으므로 **일시정지**로 되살려 타이머 화면에 둔다.
    /// 프레즌스는 즉시 해제(매달린 reading_since 정리). 사용자가 재개하거나 저장하면 정상 경로를 탄다.
    public func restoreSession(_ saved: RTSession) {
        var s = saved
        // 기록 중에 종료된 세션: 마지막 틱(마지막으로 살아 있던 시각)까지만 넣고, 꺼져 있던 시간은 넣을지 묻는다.
        // 1분 미만은 묻지 않는다. 기준점 없는 예전 저장본은 종전대로.
        var gap: Int?
        if s.status == .recording, let a = s.anchorAt, let e = s.anchorElapsed {
            let lastAlive = a.addingTimeInterval(TimeInterval(max(0, s.elapsed - e)))
            let g = Int(now().timeIntervalSince(lastAlive))
            if g >= 60 { gap = g }
            s.anchor(at: lastAlive)   // 일시정지 기준 = 마지막으로 살아 있던 시각 (저장 시각)
        }
        restoredGap = gap
        s.status = .paused
        mode = s.mode
        session = s
        emitPresence()
        nav(s.mode == .flip ? .flipTimer : .tapTimer)
    }

    /// 엎어서 기록 시작. at = 엎은 시각 (잠금 확인 뒤 소급 시작이면 과거 시각)
    public func simFlip(at: Date? = nil) { startSession(.flip, at: at); nav(.flipTimer) }

    public func switchTap() { mode = .tap; startSession(.tap); nav(.tapTimer) }

    /// 일시정지↔재개. at = 엎기 엔진이 감지한 시각 (화면 탭이면 지금)
    public func togglePause(at: Date? = nil) {
        guard var s = session else { return }
        let t = at ?? now()
        if s.status == .recording {
            s.elapsed = s.wallElapsed(at: t)
            s.status = .paused; s.pauseCount += 1
        } else { s.status = .recording; justResumed = true }
        s.anchor(at: t)
        session = s
        emitPresence()
    }

    /// 앱 활성 복귀 등 — 기록 중이면 벽시계 경과로 화면 값을 맞춘다 (틱은 백그라운드에서 멈출 수 있다)
    public func refreshElapsed() {
        guard var s = session, s.status == .recording else { return }
        let w = s.wallElapsed(at: now())
        guard w != s.elapsed else { return }
        s.elapsed = w
        session = s
    }

    /// 앱이 꺼져 있던 동안의 시간(초) — 복원한 세션이 기록 중이었을 때만. 화면이 넣을지 묻는다.
    @Published public private(set) var restoredGap: Int?

    public func includeRestoredGap() {
        guard let g = restoredGap, var s = session else { restoredGap = nil; return }
        s.elapsed += g
        s.anchor(at: now())
        restoredGap = nil
        session = s
    }

    public func dismissRestoredGap() { restoredGap = nil }

    public func endSession() {
        if var s = session {
            if s.status == .recording {
                let t = now()
                s.elapsed = s.wallElapsed(at: t)
                s.anchor(at: t)
            }
            s.status = .paused
            session = s
        }
        emitPresence()
        nav(.done)
    }

    public func saveSession() {
        if let s = session {
            onSessionSaved?(s.mode, s.elapsed)
            if userData != nil {
                let fix = locationProvider?().map(Self.coarse)
                // 저장 시각 = 마지막 기록 시각 — 밤에 멈추고 다음 날 저장해도 읽은 날로 남는다
                let endedAt = (s.status == .paused ? s.anchorAt : nil) ?? now()
                let rec = RTSessionRecord(isbn: s.isbn, mode: s.mode.rawValue,
                                          seconds: s.elapsed, endedAt: endedAt,
                                          pauseCount: s.pauseCount,
                                          latitude: fix?.latitude, longitude: fix?.longitude,
                                          placeId: fix?.placeId, placeName: fix?.placeName,
                                          country: fix?.country)
                mutateUserData { $0.sessions.append(rec) }
            }
        }
        session = nil
        restoredGap = nil
        mode = .flip   // 세션이 끝나면 다음 기록 시작(홈 CTA·서재 ▶·이어서 읽기)은 다시 엎기 — 탭은 '탭 시작'으로만
        emitPresence()
        nav(.home)
    }

    public func deleteSession() { session = nil; restoredGap = nil; mode = .flip; nav(.home) }

    /// 06 '이어 읽기' — 실수로 끝냈을 때. 저장하지 않고 일시정지 상태로 타이머 화면에 돌아간다.
    public func resumeFromDone() {
        guard let s = session else { return }
        mode = s.mode
        nav(s.mode == .flip ? .flipTimer : .tapTimer)
    }

    /// 책 없이 저장된 과거 세션 복구 — 그 기록이 끝난 시점에 읽는 중이던 종이책에 붙인다
    /// (currentBook 과 같은 규칙을 그 시각 기준으로 적용). 붙일 책이 없으면 그대로 둔다.
    /// 재발은 startSession 의 currentBook 폴백이 막으므로, 이 복구는 기존 기록용이다.
    public func repairUnattributedSessions() {
        guard let d = userData, d.sessions.contains(where: { $0.isbn == nil }) else { return }
        mutateUserData { data in
            for i in data.sessions.indices where data.sessions[i].isbn == nil {
                let when = data.sessions[i].endedAt
                var lastRead = [String: Date]()
                for s in data.sessions {
                    guard let key = s.isbn, s.endedAt <= when else { continue }
                    if s.endedAt > (lastRead[key] ?? .distantPast) { lastRead[key] = s.endedAt }
                }
                let candidates = data.books.filter {
                    !$0.finished && $0.millieBookId == nil && $0.addedAt <= when
                }
                data.sessions[i].isbn = candidates.max {
                    max($0.addedAt, lastRead[$0.isbn] ?? .distantPast)
                        < max($1.addedAt, lastRead[$1.isbn] ?? .distantPast)
                }?.isbn
            }
        }
    }

    public func continueReading() { start(isbn: selectedBook?.isbn) }

    /// 완독 책 다시 읽기 — 완독만 해제(별점·완독일 보존)하고 그 책으로 세션 시작.
    /// 밀리 편입 책은 세션이 무의미(자동 수집) — 완독 마커까지 해제해 홈 카드를 부활시킨다.
    public func rereadBook() {
        guard let b = selectedBook, b.finished else { return }
        // 완독 표시를 먼저 지운다 — 스냅샷 저장(mutateUserData)이 그 표시를 함께 싣는다
        if b.millieBookId != nil {
            finishedEbooks.removeValue(forKey: b.title)
            onFinishedEbooksChange?(finishedEbooks)
        }
        mutateUserData { d in
            if let i = d.books.firstIndex(where: { $0.isbn == b.isbn }) {
                d.books[i].finished = false
            }
        }
        if b.millieBookId != nil { return }
        start(isbn: b.isbn)
    }

    // ── 07 시간 직접 추가 ──
    public func step(_ d: Int) {
        // 하한 5분 — 이미 5분 미만(고치기로 연 짧은 기록)이면 빼기가 값을 올리지 않게 그 값에서 멈춘다
        addtimeValue = max(min(5, addtimeValue), addtimeValue + d)
        addtimePreset = nil
    }

    public func preset(_ n: Int) {
        addtimeValue += n            // 가산형 (시안 데모: 35 + "+15" 선택 상태)
        addtimePreset = n
    }

    public func addTime() {
        if userData != nil {
            let t = now()
            let endedAt = min(addtimeDate ?? t, t)   // 미래 시각으로는 기록하지 않는다
            if let old = editingRecord {
                let seconds = addtimeValue == editPrefillMinutes ? old.seconds : addtimeValue * 60
                let isbn = addtimeISBN ?? old.isbn
                mutateUserData { d in
                    guard let i = d.sessions.firstIndex(of: old) else { return }
                    d.sessions[i].seconds = seconds
                    d.sessions[i].endedAt = endedAt
                    d.sessions[i].isbn = isbn
                }
            } else {
                let fix = locationProvider?().map(Self.coarse)
                let rec = RTSessionRecord(isbn: addtimeISBN ?? selectedBook?.isbn, mode: "manual",
                                          seconds: addtimeValue * 60, endedAt: endedAt, pauseCount: 0,
                                          latitude: fix?.latitude, longitude: fix?.longitude,
                                          placeId: fix?.placeId, placeName: fix?.placeName,
                                          country: fix?.country)
                mutateUserData { $0.sessions.append(rec) }
            }
        }
        addtimeValue = 35
        addtimePreset = 15
        addtimeDate = nil
        closeSheet()
    }

    /// 08 기록 행 탭 → 07 시트를 '기록 고치기'로 연다. 서재 기록에 없는 값이면(이미 지워짐) 무시.
    public func openRecordEditor(_ rec: RTSessionRecord) {
        guard userData?.sessions.contains(rec) == true else { return }
        openSheet(.addtime)
        editingRecord = rec
        addtimeValue = max(1, rec.seconds / 60)
        editPrefillMinutes = addtimeValue
        addtimePreset = nil
        addtimeDate = rec.endedAt
        addtimeISBN = rec.isbn
    }

    /// 고치기 시트의 '이 기록 삭제' — 같은 값의 기록이 여럿이면 하나만 지운다.
    public func deleteEditingRecord() {
        if let old = editingRecord {
            mutateUserData { d in
                if let i = d.sessions.firstIndex(of: old) { d.sessions.remove(at: i) }
            }
        }
        closeSheet()
    }

    // ── 09 완독 별점 ──
    public func rate(_ n: Int) { rating = n }
    public func saveFinished() {
        if let cur = selectedBook {
            // 밀리 편입 책은 홈 카드 제외 마커도 같이 — 없으면 완독했는데 카드가 계속 뜬다.
            // 스냅샷 저장보다 먼저 세워야 그 저장에 함께 실린다.
            if cur.millieBookId != nil {
                finishedEbooks[cur.title] = now()
                onFinishedEbooksChange?(finishedEbooks)
            }
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
        // 기록(완독·별점·세션·밀리 연결)이 있는 책은 검색 시트에서 해제하지 않는다 — ✓ 한 번에 완독·별점이 지워지던 경로.
        // 서재에서 빼려면 책 메뉴의 삭제(deleteBook)를 쓴다. 기록 없는 책(방금 잘못 추가한 책)은 종전대로 해제.
        if added.contains(key), let d = userData, Self.hasRecords(key, in: d) { return }
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

    static func hasRecords(_ isbn: String, in d: RTUserData) -> Bool {
        let book = d.books.first { $0.isbn == isbn }
        return book?.finished == true || book?.rating != nil || book?.millieBookId != nil
            || d.sessions.contains { $0.isbn == isbn }
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

    // ── 기록 원페이지 (design_handoff_record_onepage §State Management) ──
    /// 표시 중인 달 (nil = 현재 달). 범위 = 첫 기록 달 … 현재 달.
    @Published public var statsMonth: RTStatsYM?
    /// 바텀시트 — nil = 닫힘
    @Published public var statsSheet: RTStatsSheet?
    /// 전체 화면 지도 (원페이지 위 오버레이). 08 로 push 했다 뒤로 오면 그대로 지도로 복귀.
    @Published public var mapFullscreen = false

    /// 화면이 먹는 데이터셋 — 파트너는 partnerData(종이만), 나는 userData + 내 밀리, 데모(userData nil)는 시안.
    /// 입력(세션·밀리·파트너·주체·오늘)이 바뀔 때만 재집계 — 지도 카메라 연속 콜백·시트·행 렌더가 매번
    /// 전체 세션을 다시 훑지 않게 한다. 스탬프는 입력 프로퍼티의 didSet 이 올린다.
    public var statsDataset: RTStatsDataset {
        let key = "\(statsSubject)|\(statsStamp)|\(userData == nil)|\(dayFormatter.string(from: now()))"
        if let c = statsCache, c.key == key { return c.ds }
        let ds = buildStatsDataset()
        statsCache = (key, ds)
        onStatsDatasetBuilt?()
        return ds
    }
    private var statsStamp = 0
    private var statsCache: (key: String, ds: RTStatsDataset)?
    /// 재집계 관측 훅 (검증용)
    public var onStatsDatasetBuilt: (() -> Void)?

    private func buildStatsDataset() -> RTStatsDataset {
        if statsSubject == .partner { return RTStats.live(data: partnerData ?? RTUserData(), now: now()) }
        guard let d = userData else { return RTStatsDemo.dataset }
        let days = ebookDaily.keys.compactMap { dayFormatter.date(from: $0) }
        return RTStats.live(data: d, now: now(), ebookDays: days,
                            ebookBreakdown: { self.ebookBreakdown(on: $0) },
                            ebookCover: { self.ebookCovers[$0] })
    }
    public var statsDisplayedMonth: RTStatsYM {
        if let m = statsMonth { return m }
        let t = statsDataset.today
        return RTStatsYM(year: t.year, month: t.month)
    }
    /// ‹ — 첫 기록 달까지. 월 전환 시 열린 시트는 닫는다.
    public func statsPrev() {
        let cur = statsDisplayedMonth
        guard cur > RTStats.monthRange(statsDataset).first else { return }
        statsMonth = cur.month == 1 ? RTStatsYM(year: cur.year - 1, month: 12)
                                    : RTStatsYM(year: cur.year, month: cur.month - 1)
        statsSheet = nil
    }
    /// › — 현재 달까지 (현재 달에 닿으면 nil = 현재)
    public func statsNext() {
        let cur = statsDisplayedMonth
        let last = RTStats.monthRange(statsDataset).last
        guard cur < last else { return }
        let next = cur.month == 12 ? RTStatsYM(year: cur.year + 1, month: 1)
                                   : RTStatsYM(year: cur.year, month: cur.month + 1)
        statsMonth = next == last ? nil : next
        statsSheet = nil
    }
    public func statsThisMonth() { statsMonth = nil; statsSheet = nil }
    /// 날짜 탭 — 읽은 과거·오늘만 day 시트 (미래·미기록·빈 칸 무시)
    public func statsTapDay(_ day: Int) {
        let ym = statsDisplayedMonth
        let mo = RTStats.month(statsDataset, year: ym.year, month: ym.month)
        guard let c = mo.cells.compactMap({ $0 }).first(where: { $0.day == day }),
              c.minutes > 0, !c.isFuture else { return }
        statsSheet = .day(day)
    }
    public func statsOpenList() { statsSheet = .list }
    public func statsTapPlace(_ id: String) { statsSheet = .place(id) }
    /// 갈라지지 않는 클러스터 핀 탭 — 구성원 전체를 합친 place 시트 (1곳이면 단일)
    public func statsTapPlaces(_ ids: [String]) { statsSheet = ids.count == 1 ? .place(ids[0]) : .cluster(ids) }
    public func statsCloseSheet() { statsSheet = nil }
    public func openMapFullscreen() { mapFullscreen = true }
    /// 닫기 → 원페이지 복귀 (열린 시트 닫힘. 카메라 리셋은 뷰가 재생성되며 기본 프레이밍으로 돌아온다)
    public func closeMapFullscreen() { mapFullscreen = false; statsSheet = nil }
    /// 시트 데이터 (뷰용) — 표시 중인 달 기준
    public var statsSheetData: RTStats.Sheet? {
        guard let s = statsSheet else { return nil }
        let ds = statsDataset, ym = statsDisplayedMonth
        switch s {
        case .day(let d): return RTStats.daySheet(ds, year: ym.year, month: ym.month, day: d)
        case .list: return RTStats.listSheet(ds, year: ym.year, month: ym.month)
        case .place(let id):
            guard let i = ds.places.firstIndex(where: { $0.id == id }) else { return nil }
            return RTStats.placeSheet(ds, place: i)
        case .cluster(let ids):
            let idx = ids.compactMap { id in ds.places.firstIndex { $0.id == id } }
            guard !idx.isEmpty else { return nil }
            return RTStats.placeSheet(ds, places: idx)
        }
    }
    /// 책 행·표지 탭 → 시트 닫고 책 상세(08) push. isbn 없는 밀리 책(미편입·귀속 불가)은 탭 무시.
    /// 데모(userData nil)는 08 데모 화면으로 (목업의 "책 상세 · 08 기존 화면" 스텁에 대응).
    public func statsTapBook(_ index: Int) {
        let ds = statsDataset
        guard index >= 0, index < ds.books.count else { return }
        statsSheet = nil
        if userData == nil { nav(.detail); return }
        let isbn = ds.books[index].isbn
        guard !isbn.isEmpty else { return }
        openBookDetail(isbn: isbn)
    }

    /// 지도 카드 '동네' 중심 = **가장 많이 읽은 장소**의 좌표 (동률이면 더 최근에 읽은 곳).
    /// 최근 위치 세션 기준이었을 때 한 달 전 방콕 출장지가 동네로 떠 태국어 지도가 보였다(실기기 실측 2026-09-02).
    /// 위치 없는 세션은 제외. 없으면 nil (카드는 전체 핀 프레이밍 폴백).
    public var cardAnchorCoord: (lat: Double, lng: Double)? {
        guard let d = userData else { return nil }
        var agg: [String: (sec: Int, last: Date, lat: Double, lng: Double)] = [:]
        for s in d.sessions {
            guard let pid = s.placeId, let lat = s.latitude, let lng = s.longitude else { continue }
            let cur = agg[pid] ?? (0, .distantPast, lat, lng)
            agg[pid] = (cur.sec + s.seconds, max(cur.last, s.endedAt), cur.lat, cur.lng)
        }
        return agg.values.max { a, b in a.sec != b.sec ? a.sec < b.sec : a.last < b.last }.map { ($0.lat, $0.lng) }
    }

    /// 위치 픽스 공급 훅 — 앱 셸이 CoreLocation 배선 (§16: 세션 시작·시간추가 시트 열림 시 캡처).
    /// nil 반환 = 위치 미확보 → 세션은 위치 없이 저장 (지도 미표시).
    public var locationProvider: (() -> RTPlaceFix?)?
    /// 세션을 새로 시작할 때만 (재개 제외) — 앱이 여기서 위치를 잡는다. 재개마다 잡으면 마지막 재개 위치가 세션 위치가 됐다.
    public var onSessionStart: (() -> Void)?

    /// 저장 좌표는 소수 셋째 자리(위도 약 110m)까지 — 기록은 서버 스냅샷으로 올라가고 파트너도 읽는다.
    /// 지도는 동 단위 장소 키로 묶고 120m 안을 같은 자리로 합치므로 이 정밀도로 충분하다(2026-11-08 검토).
    static func coarse(_ f: RTPlaceFix) -> RTPlaceFix {
        func r(_ x: Double) -> Double { (x * 1000).rounded() / 1000 }
        return RTPlaceFix(latitude: r(f.latitude), longitude: r(f.longitude), placeId: f.placeId,
                          placeName: f.placeName, country: f.country)
    }

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
    public func startSession(_ mode: RTMode, at: Date? = nil) {
        // 세션 대상: start(isbn:) 이 보류한 책 > 홈 카드에서 고른 책 (캐러셀 도입 2026-08-25).
        // flipTargetISBN 은 카드 범위 밖이면 currentBook 으로 폴백한다.
        // 마지막 폴백은 읽는 중 책 — 대상이 비어도 기록이 어느 책에도 안 붙는 일은 없어야 한다
        // (실사고 2026-09-15: 89분이 isbn:null 로 저장돼 통계·마지막 기록에서 사라짐).
        // flipTargetISBN 자체엔 폴백을 두지 않는다 — FlipEngine 의 밀리 카드 엎기 차단 기준이다.
        let t = at ?? now()
        var s = RTSession(mode: mode, status: .recording,
                          elapsed: sessionSeed, pauseCount: 0, startedAt: t,
                          isbn: nextSessionISBN ?? flipTargetISBN ?? currentBook?.isbn)
        s.anchor(at: t)
        session = s
        nextSessionISBN = nil
        onSessionStart?()
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
        case "query": searchQuery = arg              // 검색창 프리필(검증 — sheet:addbook 뒤에 둘 것: 열 때 비움)
        case "card": Int(arg).map { homeCardIndex = $0 }        // 홈 캐러셀 카드 선택(검증)
        case "sel": selectedISBN = arg                           // 상세 대상 지정(검증 — nav:08 과 조합)
        case "reread": rereadBook()                              // 다시 읽기(검증 — 밀리 미완독 상태 재현)
        case "statsPrev": statsPrev()                            // 기록 원페이지 (검증)
        case "statsNext": statsNext()
        case "statsThisMonth": statsThisMonth()
        case "statsDay": Int(arg).map { statsTapDay($0) }
        case "statsList": statsOpenList()
        case "statsMap": openMapFullscreen()
        case "statsPlace": statsTapPlace(arg)
        case "loadUserData":   // 검증: 실데이터 JSON(RTUserData, ISO8601) 로드 — 절대경로 또는 Documents 파일명
            if let d: RTUserData = Self.loadVerifyJSON(arg) { userData = d }
        case "loadEbook":      // 검증: {"daily":{day:sec},"books":{day:[title]},"covers":{title:url},"readAt":{title:iso}}
            if let e: RTVerifyEbook = Self.loadVerifyJSON(arg) {
                ebookDaily = e.daily
                ebookBooks = e.books
                ebookCovers = e.covers ?? [:]
                ebookReadAt = (e.readAt ?? [:]).compactMapValues { ISO8601DateFormatter().date(from: $0) }
            }
        case "finishEbook": finishEbook(arg)                     // 밀리 완독 처리(검증)
        case "demoCards":   // 홈 캐러셀 시드 — 종이책 2 + 밀리 2 (실표지·최근순 검증)
            finishedEbooks = [:]
            homeCardIndex = 0
            let t = now()
            func ago(_ h: Double) -> Date { t.addingTimeInterval(-h * 3600) }
            // '어제·그제' 는 날짜 기준 — 시간 기준(ago 30h)은 새벽 실행에서 하루 더 밀려
            // '어제 기록' 을 기대하는 검증이 flaky 해진다 (실측 2026-09-02 01:14 실패).
            let dcal = Calendar(identifier: .gregorian)
            func dayNoon(_ back: Int) -> Date {
                dcal.date(byAdding: .day, value: -back, to: dcal.startOfDay(for: t))!
                    .addingTimeInterval(12 * 3600)
            }
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
                    RTSessionRecord(isbn: "P1", mode: "flip", seconds: 52 * 60, endedAt: dayNoon(1), pauseCount: 0),
                    RTSessionRecord(isbn: "P2", mode: "flip", seconds: 74 * 60, endedAt: dayNoon(2), pauseCount: 0),
                ])
            ebookReadAt = ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]": ago(2),   // 최신 → 첫 카드
                           "독학이라는 세계": ago(40)]
            ebookCovers = [
                "삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]":
                    "https://img.millie.co.kr/200x/service/cover/179627237/6c18271ace30484f83644c87958de70b.jpg",
                "독학이라는 세계":
                    "https://image.millie.co.kr/service/cover/180153534/77b09fba84f14ed8967dcc48251988ff.jpg",
            ]
            // 일별 히스토리 — 밀리 상세(편입 책)의 기록 행 재료. 오늘은 비워 둔다
            // ('오늘 미기록' 캘린더 기대를 깨지 않게 — HomeRecordUITests).
            let edf = DateFormatter()
            edf.locale = Locale(identifier: "en_US_POSIX")
            edf.dateFormat = "yyyy-MM-dd"
            ebookDaily = [edf.string(from: dayNoon(1)): 26 * 60,    // 어제
                          edf.string(from: dayNoon(2)): 40 * 60]    // 그제
            ebookBooks = [edf.string(from: dayNoon(1)): ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"],
                          edf.string(from: dayNoon(2)): ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"]]
            // 서재 편입용 메타 (실데몬 book_millie_books 미러와 같은 형태)
            millieMeta = ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]":
                RTMillieMeta(bookId: "4c17703240404997", author: "박민규", publisher: "한겨레출판",
                             coverUrl: "https://img.millie.co.kr/200x/service/cover/179627237/6c18271ace30484f83644c87958de70b.jpg"),
                          "독학이라는 세계":
                RTMillieMeta(bookId: "dc5904c061df4a65", author: "시라토리 하루히코 지음 / 양필성 옮김",
                             publisher: "클랩북스", coverUrl: nil)]
        case "demoMillieOnly":   // 완독 종이책 + 최근 밀리 1권(마지막 카드→빈 홈 전환 검증)
            let t = now()
            userData = RTUserData(books: [
                RTBook(isbn: "P0", title: "완독한 종이책", author: "저자", publisher: "출판",
                       coverUrl: "", addedAt: t.addingTimeInterval(-172_800),
                       finished: true, rating: 4, finishedAt: t.addingTimeInterval(-86_400)),
            ])
            finishedEbooks = [:]
            ebookReadAt = ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]": t.addingTimeInterval(-7_200)]
            ebookCovers = [:]
            homeCardIndex = 0
        case "demoNewRecord":
            // 홈 게이지 신기록 상태(streak > best > 0) — 상태 매트릭스 C. 시안 #14a 에 없는 상태라
            // 이 시드가 유일한 렌더 경로다(골드 그라데이션 + rtSweep + "+N일" 눈으로 확인용).
            // 과거 완료 구간 4일(12~15일 전) + 현재 진행 구간 6일(오늘~5일 전) → best 4 / streak 6.
            var ncal = Calendar(identifier: .gregorian)
            ncal.firstWeekday = 2
            let nToday = ncal.startOfDay(for: now())
            func nDay(_ i: Int) -> Date {
                ncal.date(byAdding: .day, value: -i, to: nToday)!.addingTimeInterval(10 * 3600)
            }
            let nDays = Array(0...5) + Array(12...15)
            userData = RTUserData(
                books: [RTBook(isbn: "P1", title: "몰입", author: "미하이 칙센트미하이",
                               publisher: "한울림", coverUrl: "", addedAt: nDay(20))],
                sessions: nDays.map {
                    RTSessionRecord(isbn: "P1", mode: "flip", seconds: 30 * 60,
                                    endedAt: nDay($0), pauseCount: 0)
                })
            finishedEbooks = [:]
            ebookReadAt = [:]
            ebookCovers = [:]
            homeCardIndex = 0
        case "demoReread":   // 다시 읽기 UI 테스트 상태: initial | inProgress | allFinished
            let t = now()
            func ago(_ h: Double) -> Date { t.addingTimeInterval(-h * 3600) }
            let moneyReading = arg == "inProgress"
            let allFinished = arg == "allFinished"
            userData = RTUserData(
                books: [
                    RTBook(isbn: "9788931009552", title: "몰입", author: "미하이 칙센트미하이",
                           publisher: "한울림", coverUrl: "", addedAt: ago(24 * 18),
                           finished: allFinished, rating: allFinished ? 4 : nil,
                           finishedAt: allFinished ? ago(1) : nil),
                    RTBook(isbn: "9788936434120", title: "돈의 심리학", author: "모건 하우절",
                           publisher: "인플루엔셜", coverUrl: "", addedAt: ago(24 * 50),
                           finished: !moneyReading, rating: 4, finishedAt: ago(24 * 10)),
                ],
                sessions: [
                    RTSessionRecord(isbn: "9788931009552", mode: "flip", seconds: 26 * 60,
                                    endedAt: ago(24), pauseCount: 0),
                    RTSessionRecord(isbn: "9788936434120", mode: "tap", seconds: 2,
                                    endedAt: moneyReading ? ago(1) : ago(24 * 12), pauseCount: 0),
                ])
            selectedISBN = nil
            homeCardIndex = 0
        case "searchReopen":   // 검색 완결 후 닫기→재열기 (재열기 공란+최신결과 유지 결정적 검증)
            Task { await search(arg); closeSheet(); openSheet(.addbook) }
        case "closeSheet": closeSheet()
        case "mode": RTMode(rawValue: arg).map { setMode($0) }
        case "rename": rename(arg)
        case "partnerStats": openPartnerStats()   // 파트너 통계 진입(검증·데모)
        case "demoPartner": loadDemoPartner()      // 데모 파트너 주입(검증·기기 데모)
        case "demoPartnerIdle": loadDemoPartner(reading: false)   // idle 상태 검증
        case "demoPartnerStale": loadDemoPartner(reading: false, daysAgo: 28)  // 오래 안 읽은 상태 검증
        case "clearAvatar": avatarImage = nil       // UI 테스트 시작 상태 격리(저장 파일 잔존 무시)
        case "syncFailed": noteSyncResult(false)    // 설정 시트 동기화 실패 행 (검증)
        case "demoEbook":   // 밀리 일별 시드(오늘 29분·어제 10분·그제 20분) — 통계 합산 검증
            let t = now()
            let f = dayFormatter
            ebookDaily = [f.string(from: t): 1740,
                          f.string(from: cal.date(byAdding: .day, value: -1, to: t)!): 600,
                          f.string(from: cal.date(byAdding: .day, value: -2, to: t)!): 1200]
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
            ebookDaily = [f.string(from: dd(3)): 36 * 60]                       // 목: 밀리 36분
            ebookBooks = [f.string(from: dd(3)): ["도둑맞은 집중력"]]
        case "openBook": openBookDetail(isbn: arg)   // 통계 책 → 상세 진입(검증)
        case "start": start()
        case "cancelSession": cancelSession()
        case "simFlip": simFlip()
        case "restoreRecording":   // 검증: arg 초 동안 꺼져 있던 '기록 중' 엎기 세션 복원 (마지막 틱 = 지금 − arg)
            Int(arg).map { gap in
                let t = now().addingTimeInterval(TimeInterval(-gap - 60))
                restoreSession(RTSession(mode: .flip, status: .recording, elapsed: 160, pauseCount: 0,
                                         startedAt: t.addingTimeInterval(-100), isbn: currentBook?.isbn,
                                         anchorAt: t, anchorElapsed: 100))
            }
        case "switchTap": switchTap()
        case "togglePause": togglePause()
        case "endSession": endSession()
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
        case "tick": tick()
        case "elapsed": Int(arg).map { syncElapsed($0) }   // 경과 주입(검증 — 05 타이·신기록 상태 렌더)
        case "seedLoc":   // 기존 세션 위치 백필 (실기기 1회 실행) — "lat|lng|placeId|placeName|country"
            // ("|" 구분: --seq 가 ","로 액션을 쪼개므로 콤마 사용 불가)
            let p = arg.split(separator: "|").map(String.init)
            if p.count >= 5, let lat = Double(p[0]), let lng = Double(p[1]) {
                var left = p.count >= 6 ? (Int(p[5]) ?? Int.max) : Int.max   // 6번째 = 앞에서부터 N개만 (검증: 장소 2곳 만들기)
                mutateUserData { d in
                    for i in d.sessions.indices where d.sessions[i].latitude == nil && left > 0 {
                        d.sessions[i].latitude = lat
                        d.sessions[i].longitude = lng
                        d.sessions[i].placeId = p[2]
                        d.sessions[i].placeName = p[3]
                        d.sessions[i].country = p[4]
                        left -= 1
                    }
                }
            }
        default: break
        }
    }

    /// 검증용 JSON 로더 — 실기기와 같은 데이터로 헤드리스·시뮬레이터 렌더를 재현한다 (rtshot 은 절대경로,
    /// 시뮬레이터는 앱 Documents 의 파일명). 실앱 경로에서는 --seq 가 없으므로 호출되지 않는다.
    static func loadVerifyJSON<T: Decodable>(_ arg: String) -> T? {
        let url = arg.hasPrefix("/") ? URL(fileURLWithPath: arg)
            : FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent(arg)
        guard let data = try? Data(contentsOf: url) else { return nil }
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return try? dec.decode(T.self, from: data)
    }
    struct RTVerifyEbook: Decodable {
        let daily: [String: Int]
        let books: [String: [String]]
        let covers: [String: String]?
        let readAt: [String: String]?
    }

    // ── 파생값 (app.js hmsParts·sessionMin) ──
    public var sessionMinutes: Int { (session?.elapsed ?? 0) / 60 }

    public static func hms(_ sec: Int) -> (h: String, m: String, s: String) {
        func f(_ n: Int) -> String { String(format: "%02d", n) }
        return (f(sec / 3600), f(sec / 60 % 60), f(sec % 60))
    }

    /// 05 타이머·기록 줄 — 1시간 미만 "mm:ss", 이상 "h:mm:ss"(시 한 자리, 시안 J §1).
    /// hms 는 04·Live Activity 가 쓰므로 그대로 둔다.
    public static func clockParts(_ sec: Int) -> (h: String?, m: String, s: String) {
        func f(_ n: Int) -> String { String(format: "%02d", n) }
        return (sec >= 3600 ? String(sec / 3600) : nil, f(sec / 60 % 60), f(sec % 60))
    }

    public static func clock(_ sec: Int) -> String {
        let p = clockParts(sec)
        return (p.h.map { $0 + ":" } ?? "") + p.m + ":" + p.s
    }

    /// 05 링의 '최장' — 타이머로 잰(엎기·탭) 세션 중 최장(초). 직접 추가는 한 번에 잰 시간이 아니라 뺀다.
    /// 진행 중 세션은 저장 전이라 자동 제외. 데모(userData nil)는 시안 값 47분.
    public var bestSessionSeconds: Int {
        guard let d = userData else { return Self.demoBest }
        return d.sessions.filter { $0.mode == RTMode.flip.rawValue || $0.mode == RTMode.tap.rawValue }
            .map(\.seconds).max() ?? 0
    }
}

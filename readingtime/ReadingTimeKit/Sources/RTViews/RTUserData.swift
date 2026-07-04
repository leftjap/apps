import Foundation

// 실데이터 정본 (§6-④) — 등록 책 + 세션 기록. 개인 앱: JSON 영속(앱 타깃이 UserDefaults 배선).
// RTAppModel.userData 가 nil 이면 데모 모드 (rtshot/rtapp 픽셀 오라클 경로 불변).

public struct RTBook: Codable, Equatable, Sendable {
    public let isbn: String
    public var title: String
    public var author: String
    public var publisher: String
    public var coverUrl: String
    public var addedAt: Date
    public var finished: Bool
    public var rating: Int?
    public var finishedAt: Date?

    public init(isbn: String, title: String, author: String, publisher: String,
                coverUrl: String, addedAt: Date,
                finished: Bool = false, rating: Int? = nil, finishedAt: Date? = nil) {
        self.isbn = isbn
        self.title = title
        self.author = author
        self.publisher = publisher
        self.coverUrl = coverUrl
        self.addedAt = addedAt
        self.finished = finished
        self.rating = rating
        self.finishedAt = finishedAt
    }
}

public struct RTSessionRecord: Codable, Equatable, Sendable {
    public var isbn: String?      // 기록 시점의 읽는 중 책 (없으면 nil)
    public var mode: String       // RTMode.rawValue ("flip"|"tap") | "manual"
    public var seconds: Int
    public var endedAt: Date
    public var pauseCount: Int

    public init(isbn: String?, mode: String, seconds: Int, endedAt: Date, pauseCount: Int) {
        self.isbn = isbn
        self.mode = mode
        self.seconds = seconds
        self.endedAt = endedAt
        self.pauseCount = pauseCount
    }
}

public struct RTUserData: Codable, Equatable, Sendable {
    public var books: [RTBook]
    public var sessions: [RTSessionRecord]

    public init(books: [RTBook] = [], sessions: [RTSessionRecord] = []) {
        self.books = books
        self.sessions = sessions
    }
}

public extension Array where Element == RTBook {
    /// 서재 완독 정렬 — 프로토타입 규칙 정합: 최근(finishedAt, 없으면 addedAt)·
    /// 이름(ko 비교)·별점(내림차순, 동률은 원순서 안정)
    func sortedForLibrary(_ sort: RTLibrarySort) -> [RTBook] {
        switch sort {
        case .recent:
            return sorted { ($0.finishedAt ?? $0.addedAt) > ($1.finishedAt ?? $1.addedAt) }
        case .name:
            return sorted { $0.title.compare($1.title, locale: Locale(identifier: "ko")) == .orderedAscending }
        case .rating:
            return enumerated()
                .sorted { ($0.element.rating ?? 0) != ($1.element.rating ?? 0)
                    ? ($0.element.rating ?? 0) > ($1.element.rating ?? 0)
                    : $0.offset < $1.offset }
                .map(\.element)
        }
    }
}

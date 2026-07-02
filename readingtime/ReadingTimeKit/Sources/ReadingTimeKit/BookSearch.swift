import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// 알라딘 도서 검색 — Book 앱 Edge Function 프록시 재사용.
// 정본: book/src/db/aladin.js (정규화) + pick/supabase/functions/aladin/index.ts (배포본 계약).
// 배포본 계약(2026-07-02 실측): Origin=https://leftjap.github.io 필수(없으면 403),
// 하위 경로 ItemSearch.aspx|ItemLookUp.aspx 필수(없으면 404), 무인증(verify_jwt=false).
// 네이티브 URLSession 은 Origin 을 자동 부착하지 않으므로 명시 부착한다
// (프록시 주석: 헤더 위조 직접 호출은 저위험 수용).
public enum Aladin {

    public struct SubInfo: Decodable {
        public let subTitle: String?
    }

    public struct Item: Decodable {
        public let title: String?
        public let author: String?
        public let publisher: String?
        public let pubDate: String?
        public let cover: String?
        public let isbn: String?
        public let isbn13: String?
        public let itemId: Int?
        public let categoryName: String?
        public let subInfo: SubInfo?

        public init(title: String?, author: String?, publisher: String?, pubDate: String?, cover: String?,
                    isbn: String?, isbn13: String?, itemId: Int?, categoryName: String?, subInfo: SubInfo?) {
            self.title = title
            self.author = author
            self.publisher = publisher
            self.pubDate = pubDate
            self.cover = cover
            self.isbn = isbn
            self.isbn13 = isbn13
            self.itemId = itemId
            self.categoryName = categoryName
            self.subInfo = subInfo
        }
    }

    public struct SearchResponse: Decodable {
        public let totalResults: Int?
        public let item: [Item]?
    }

    public struct BookMeta: Equatable, Sendable {
        public let isbn: String
        public let title: String
        public let sub: String
        public let author: String
        public let publisher: String
        public let year: Int?
        public let category: String
        public let coverUrl: String
    }

    // "한강 (지은이)", "정세랑 (지은이), 김보희 (그림)" → 대표 저자명 (aladin.js cleanAuthor)
    public static func cleanAuthor(_ a: String?) -> String {
        guard let a, !a.isEmpty else { return "" }
        let first = a.components(separatedBy: ",")[0]
        return first
            .replacingOccurrences(of: #"\s*\([^)]*\)\s*"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // pubDate 에서 첫 4자리 숫자를 연도로 (aladin.js yearOf)
    public static func yearOf(_ pubDate: String?) -> Int? {
        guard let pubDate,
              let range = pubDate.range(of: #"\d{4}"#, options: .regularExpression) else { return nil }
        return Int(pubDate[range])
    }

    // isbn13 → isbn → itemId 폴백, 셋 다 없으면 nil (aladin.js normalize — JS falsy 의미 보존)
    public static func normalize(_ item: Item?) -> BookMeta? {
        guard let item else { return nil }
        let isbn = firstNonEmpty(item.isbn13, item.isbn)
            ?? item.itemId.flatMap { $0 != 0 ? String($0) : nil }
        guard let isbn else { return nil }
        return BookMeta(
            isbn: isbn,
            title: item.title ?? "",
            sub: item.subInfo?.subTitle ?? "",
            author: cleanAuthor(item.author),
            publisher: item.publisher ?? "",
            year: yearOf(item.pubDate),
            category: item.categoryName ?? "",
            coverUrl: item.cover ?? ""
        )
    }

    private static func firstNonEmpty(_ values: String?...) -> String? {
        for v in values where !(v ?? "").isEmpty { return v }
        return nil
    }
}

public enum AladinError: Error, Equatable {
    case badStatus(Int)
    case api(String)
}

public struct AladinClient {
    public let baseURL: URL
    public let origin: String
    private let session: URLSession

    public init(baseURL: URL = URL(string: "https://tcbooffrdacfatywdzcm.supabase.co")!,
                origin: String = "https://leftjap.github.io",
                session: URLSession = .shared) {
        self.baseURL = baseURL
        self.origin = origin
        self.session = session
    }

    // book aladin.js COMMON: output=js&Version=20131101&Cover=Big
    private static let common = [
        URLQueryItem(name: "output", value: "js"),
        URLQueryItem(name: "Version", value: "20131101"),
        URLQueryItem(name: "Cover", value: "Big"),
    ]

    public func searchRequest(query: String, maxResults: Int = 10, start: Int = 1) throws -> URLRequest {
        try request(path: "ItemSearch.aspx", params: [
            URLQueryItem(name: "Query", value: query),
            URLQueryItem(name: "QueryType", value: "Keyword"),
            URLQueryItem(name: "MaxResults", value: String(maxResults)),
            URLQueryItem(name: "start", value: String(start)),
            URLQueryItem(name: "SearchTarget", value: "Book"),
        ])
    }

    public func lookupRequest(isbn13: String) throws -> URLRequest {
        try request(path: "ItemLookUp.aspx", params: [
            URLQueryItem(name: "ItemId", value: isbn13),
            URLQueryItem(name: "ItemIdType", value: "ISBN13"),
        ])
    }

    public func search(query: String, maxResults: Int = 10) async throws -> [Aladin.BookMeta] {
        let res: Aladin.SearchResponse = try await fetch(searchRequest(query: query, maxResults: maxResults))
        return (res.item ?? []).compactMap(Aladin.normalize)
    }

    public func lookup(isbn13: String) async throws -> Aladin.BookMeta? {
        let res: Aladin.SearchResponse = try await fetch(lookupRequest(isbn13: isbn13))
        return (res.item ?? []).compactMap(Aladin.normalize).first
    }

    private func request(path: String, params: [URLQueryItem]) throws -> URLRequest {
        var comps = URLComponents(
            url: baseURL.appendingPathComponent("functions/v1/aladin/\(path)"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = params + Self.common
        var req = URLRequest(url: comps.url!)
        req.setValue(origin, forHTTPHeaderField: "Origin")
        return req
    }

    private func fetch<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw AladinError.badStatus(http.statusCode)
        }
        // aladin.js:45 — 응답 body 의 errorCode 존재 시 에러 (알라딘은 200 으로도 에러를 줌)
        if let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           dict["errorCode"] != nil {
            throw AladinError.api((dict["errorMessage"] as? String) ?? "aladin error")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

import Foundation
import Testing
@testable import ReadingTimeKit

// book/src/db/aladin.js 정규화의 Swift 포팅 검증.
// fixture = 배포 프록시 실응답(2026-07-02, Query=몰입&MaxResults=3).
@Suite struct BookSearchTests {

    // MARK: cleanAuthor — "한강 (지은이)", "A (지은이), B (그림)" → 대표 저자명

    @Test func cleanAuthorSingle() {
        #expect(Aladin.cleanAuthor("한강 (지은이)") == "한강")
    }

    @Test func cleanAuthorTakesFirstAndStripsParens() {
        #expect(Aladin.cleanAuthor("미하이 칙센트미하이 (지은이), 최인수 (옮긴이)") == "미하이 칙센트미하이")
        #expect(Aladin.cleanAuthor("정세랑 (지은이), 김보희 (그림)") == "정세랑")
    }

    @Test func cleanAuthorEmptyAndNil() {
        #expect(Aladin.cleanAuthor("") == "")
        #expect(Aladin.cleanAuthor(nil) == "")
    }

    // MARK: yearOf — pubDate 첫 4자리 숫자, 없으면 nil

    @Test func yearOfCases() {
        #expect(Aladin.yearOf("2004-07-05") == 2004)
        #expect(Aladin.yearOf("1999") == 1999)
        #expect(Aladin.yearOf("") == nil)
        #expect(Aladin.yearOf(nil) == nil)
        #expect(Aladin.yearOf("n/a") == nil)
    }

    // MARK: normalize — isbn13 → isbn → itemId 폴백, 셋 다 없으면 nil

    @Test func normalizeIsbnFallback() {
        let byIsbn13 = Aladin.Item(title: "T", author: nil, publisher: nil, pubDate: nil, cover: nil, isbn: "OLD", isbn13: "9788958270096", itemId: 1, categoryName: nil, subInfo: nil)
        #expect(Aladin.normalize(byIsbn13)?.isbn == "9788958270096")

        let byIsbn = Aladin.Item(title: "T", author: nil, publisher: nil, pubDate: nil, cover: nil, isbn: "8958270098", isbn13: nil, itemId: 1, categoryName: nil, subInfo: nil)
        #expect(Aladin.normalize(byIsbn)?.isbn == "8958270098")

        let byItemId = Aladin.Item(title: "T", author: nil, publisher: nil, pubDate: nil, cover: nil, isbn: nil, isbn13: nil, itemId: 102534693, categoryName: nil, subInfo: nil)
        #expect(Aladin.normalize(byItemId)?.isbn == "102534693")

        let none = Aladin.Item(title: "T", author: nil, publisher: nil, pubDate: nil, cover: nil, isbn: nil, isbn13: nil, itemId: nil, categoryName: nil, subInfo: nil)
        #expect(Aladin.normalize(none) == nil)
    }

    // MARK: 실응답 fixture 디코딩 + 정규화 파이프라인

    @Test func decodeAndNormalizeRealFixture() throws {
        let url = Bundle.module.url(forResource: "aladin-molip", withExtension: "json", subdirectory: "Resources")
            ?? Bundle.module.url(forResource: "aladin-molip", withExtension: "json")
        let data = try Data(contentsOf: #require(url))
        let res = try JSONDecoder().decode(Aladin.SearchResponse.self, from: data)

        #expect(res.totalResults == 408)
        #expect(res.item?.count == 3)

        let books = (res.item ?? []).compactMap(Aladin.normalize)
        #expect(books.count == 3)

        let first = try #require(books.first)
        #expect(first.isbn == "9788958270096")
        #expect(first.title == "몰입 Flow - 미치도록 행복한 나를 만난다")
        #expect(first.author == "미하이 칙센트미하이")
        #expect(first.publisher == "한울림")
        #expect(first.year == 2004)
        #expect(first.coverUrl.hasPrefix("https://image.aladin.co.kr/"))
    }

    // MARK: 요청 URL·헤더 계약 — 배포 프록시(pick 버전) 실측 기준
    // 실측(2026-07-02): Origin 없으면 403 {"error":"forbidden origin"},
    // 하위 경로 없으면 404 {"error":"not found"}, Origin=leftjap.github.io + ItemSearch.aspx → 200.

    @Test func searchRequestContract() throws {
        let req = try AladinClient().searchRequest(query: "몰입", maxResults: 10)
        let url = try #require(req.url)

        #expect(url.absoluteString.hasPrefix("https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/aladin/ItemSearch.aspx?"))
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let q = Dictionary(uniqueKeysWithValues: (comps?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        #expect(q["Query"] == "몰입")
        #expect(q["QueryType"] == "Keyword")
        #expect(q["SearchTarget"] == "Book")
        #expect(q["MaxResults"] == "10")
        #expect(q["start"] == "1")
        #expect(q["output"] == "js")
        #expect(q["Version"] == "20131101")
        #expect(q["Cover"] == "Big")

        // 네이티브 URLSession 은 Origin 자동 부착 안 함 → 명시 부착이 게이트 통과 조건
        #expect(req.value(forHTTPHeaderField: "Origin") == "https://leftjap.github.io")
    }

    @Test func lookupRequestContract() throws {
        let req = try AladinClient().lookupRequest(isbn13: "9788958270096")
        let url = try #require(req.url)
        #expect(url.absoluteString.hasPrefix("https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/aladin/ItemLookUp.aspx?"))
        let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let q = Dictionary(uniqueKeysWithValues: (comps?.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        #expect(q["ItemId"] == "9788958270096")
        #expect(q["ItemIdType"] == "ISBN13")
        #expect(req.value(forHTTPHeaderField: "Origin") == "https://leftjap.github.io")
    }

    // MARK: 라이브 통합 (옵트인: RT_LIVE=1 — 네트워크 의존)

    @Test(.enabled(if: ProcessInfo.processInfo.environment["RT_LIVE"] == "1"))
    func liveSearchAgainstDeployedProxy() async throws {
        let books = try await AladinClient().search(query: "몰입", maxResults: 3)
        #expect(!books.isEmpty)
        #expect(books.contains { $0.author == "미하이 칙센트미하이" })
    }
}

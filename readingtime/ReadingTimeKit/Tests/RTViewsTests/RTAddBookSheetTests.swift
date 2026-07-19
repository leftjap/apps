import Testing
import Foundation
@testable import RTViews

// 책 추가 시트(13) 검색창·결과·카운트 (사용자 요구 2026-07-19):
//  ① 검색창 기본값은 공란 (데모 "몰입" 프리필 제거) — 열 때마다 비움, 결과(최신 검색)는 유지.
//  ② 검색창 공란이면 최신 검색 도서 표시, 검색 이력 없으면 공란 (데모 5권 폴백 제거 — 라이브 한정).
//  ③ "검색 결과 · N건" = 실제 결과 수 정확 표시 (하드코딩 32 제거).
// 데모(provider 없음, rtshot 오라클)는 시안 그대로(몰입/32건/5권) 유지.

@MainActor
@Suite struct RTAddBookSheetTests {
    private func liveModel() -> RTAppModel {
        let m = RTAppModel()
        m.searchProvider = { q in
            [RTBookHit(title: "결과-\(q)", author: "저자", publisher: "출판", isbn: "i-\(q)", coverUrl: "")]
        }
        return m
    }

    // ① 검색창 기본값 공란
    @Test func searchQueryDefaultsEmpty() {
        #expect(RTAppModel().searchQuery == "")
    }

    // ① 시트 열면 검색창 비움 — 이전 쿼리 잔존 방지, 결과(최신 검색)는 유지
    @Test func openAddBookClearsQueryKeepsResults() async {
        let m = liveModel()
        await m.search("몰입")
        #expect(m.searchResults?.count == 1)
        m.openSheet(.addbook)
        #expect(m.searchQuery == "")
        #expect(m.searchResults?.count == 1)
    }

    // ① 해시 진입(navScreenID "13")도 동일하게 비움
    @Test func navScreenID13ClearsQuery() {
        let m = liveModel()
        m.searchQuery = "돈의 심리학"
        m.navScreenID("13")
        #expect(m.sheet == .addbook)
        #expect(m.searchQuery == "")
    }

    // ② 빈/공백 쿼리 검색은 provider 미호출 — 최신 결과 유지(공란 submit 이 결과를 안 지움)
    @Test func emptyQuerySearchKeepsRecent() async {
        let m = liveModel()
        await m.search("몰입")
        let recent = m.searchResults?.count
        await m.search("   ")
        #expect(m.searchResults?.count == recent)
    }

    // ③ 라이브 + 검색 이력 없음(nil) → 카운트·결과 공란 (데모 5권 폴백 제거)
    @Test func liveNoHistoryShowsEmpty() {
        let s = Sheet13AddBook(model: liveModel())   // searchResults nil
        #expect(s.isLive)
        #expect(s.countLabel == nil)
        #expect(s.rowTitles.isEmpty)
    }

    // ③ 라이브 + 결과 있음 → 카운트 = 실제 개수, 행 = 실제 결과
    @Test func liveWithResultsShowsAccurateCount() {
        let m = liveModel()
        m.searchResults = [
            RTBookHit(title: "몰입", author: "a", publisher: "p", isbn: "1", coverUrl: ""),
            RTBookHit(title: "그릿", author: "b", publisher: "q", isbn: "2", coverUrl: ""),
        ]
        let s = Sheet13AddBook(model: m)
        #expect(s.countLabel == "검색 결과 · 2건")
        #expect(s.rowTitles == ["몰입", "그릿"])
    }

    // 데모(provider 없음) — 시안 오라클 불변: 몰입/32건/5권
    @Test func demoKeepsMockOracle() {
        let s = Sheet13AddBook(model: RTAppModel())
        #expect(!s.isLive)
        #expect(s.countLabel == "검색 결과 · 32건")
        #expect(s.rowTitles.count == 5)
        #expect(s.rowTitles.first == "몰입")
    }
}

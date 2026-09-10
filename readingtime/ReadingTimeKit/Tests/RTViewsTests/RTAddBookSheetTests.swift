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

    // MARK: 검색 진행·실패·0건 (실기기 보고 2026-09-10: 프록시 상류 무응답을 try? 가 삼켜
    // "서성이다" 검색이 아무 반응 없이 끝남 → 검색 자체가 안 되는 것으로 보임)

    // provider 호출 동안 searching=true, 반환 후 false
    @Test func searchTogglesSearchingFlag() async {
        let m = RTAppModel()
        m.searchProvider = { _ in
            let running = await MainActor.run { m.searching }
            return [RTBookHit(title: running ? "running" : "idle", author: "", publisher: "", isbn: "1", coverUrl: "")]
        }
        #expect(!m.searching)
        await m.search("서성이다")
        #expect(m.searchResults?.first?.title == "running")
        #expect(!m.searching)
        #expect(m.searchError == nil)
        #expect(m.lastSearchQuery == "서성이다")
    }

    // provider 실패 → 사유 문구 + 직전 결과 유지 + searching 해제
    @Test func searchFailureSetsErrorKeepsPreviousResults() async {
        let m = liveModel()
        await m.search("몰입")
        #expect(m.searchResults?.count == 1)
        m.searchProvider = { _ in throw AddBookStubError() }
        await m.search("서성이다")
        #expect(m.searchError == "검색에 실패했어요. 다시 시도해 주세요.")
        #expect(!m.searching)
        #expect(m.searchResults?.count == 1)
        #expect(m.searchResults?.first?.title == "결과-몰입")
    }

    // 시간 초과(상류 무응답)·연결 없음·5xx 문장·기타 → 각각의 안내 문구
    @Test func searchErrorMessages() {
        #expect(RTAppModel.searchErrorMessage(URLError(.timedOut)) == "알라딘이 응답하지 않아요. 잠시 후 다시 시도해 주세요.")
        #expect(RTAppModel.searchErrorMessage(URLError(.notConnectedToInternet)) == "인터넷 연결을 확인해 주세요.")
        #expect(RTAppModel.searchErrorMessage(URLError(.cancelled)) == "검색에 실패했어요. 다시 시도해 주세요.")
        #expect(RTAppModel.searchErrorMessage(AddBookDescribedError()) == "알라딘 서버 오류 (503). 다시 시도해 주세요.")
        #expect(RTAppModel.searchErrorMessage(AddBookStubError()) == "검색에 실패했어요. 다시 시도해 주세요.")
    }

    // 새 검색 시작은 이전 실패 안내를 지운다
    @Test func newSearchClearsError() async {
        let m = liveModel()
        m.searchProvider = { _ in throw AddBookStubError() }
        await m.search("서성이다")
        #expect(m.searchError != nil)
        m.searchProvider = { q in
            [RTBookHit(title: "결과-\(q)", author: "", publisher: "", isbn: "n", coverUrl: "")]
        }
        await m.search("장강명")
        #expect(m.searchError == nil)
        #expect(m.searchResults?.first?.title == "결과-장강명")
    }

    // 다시 시도 = 마지막 쿼리로 재검색 (검색창을 비웠어도)
    @Test func retrySearchReusesLastQuery() async {
        let m = liveModel()
        m.searchProvider = { _ in throw AddBookStubError() }
        await m.search("서성이다")
        #expect(m.searchError != nil)
        m.searchQuery = ""
        m.searchProvider = { q in
            [RTBookHit(title: "재시도-\(q)", author: "", publisher: "", isbn: "r", coverUrl: "")]
        }
        await m.retrySearch()
        #expect(m.searchError == nil)
        #expect(m.searchResults?.first?.title == "재시도-서성이다")
    }

    // 이력 없이 다시 시도는 아무것도 안 함
    @Test func retryWithoutHistoryIsNoop() async {
        let m = liveModel()
        await m.retrySearch()
        #expect(m.searchResults == nil)
        #expect(!m.searching)
    }

    // 0건은 nil(이력 없음)이 아니라 [] — 카운트 0건 + 안내 문구
    @Test func emptyHitsShowZeroCountAndEmptyLabel() async {
        let m = RTAppModel()
        m.searchProvider = { _ in [] }
        await m.search("없는책")
        #expect(m.searchResults?.isEmpty == true)
        let s = Sheet13AddBook(model: m)
        #expect(s.countLabel == "검색 결과 · 0건")
        #expect(s.emptyLabel == "검색 결과가 없어요")
        #expect(s.errorLabel == nil)
        #expect(s.rowTitles.isEmpty)
    }

    // 늦게 도착한 이전 검색이 최신 검색을 덮어쓰지 않는다 — 느린 검색이 진행 중일 때
    // 새 검색이 끼어들어 먼저 끝나면, 뒤늦은 결과는 폐기되고 searching 도 다시 켜지지 않는다
    @Test func staleSearchDoesNotOverrideNewer() async {
        let m = RTAppModel()
        m.searchProvider = { q in
            if q == "느림" {
                await m.search("빠름")   // 느린 검색 도중 새 검색 완료
            }
            return [RTBookHit(title: q, author: "", publisher: "", isbn: q, coverUrl: "")]
        }
        await m.search("느림")
        #expect(m.searchResults?.first?.title == "빠름")
        #expect(!m.searching)
        #expect(m.searchError == nil)
    }

    // 늦게 도착한 이전 검색의 실패도 최신 검색을 더럽히지 않는다
    @Test func staleFailureDoesNotOverrideNewer() async {
        let m = RTAppModel()
        m.searchProvider = { q in
            if q == "느림" {
                await m.search("빠름")
                throw AddBookStubError()
            }
            return [RTBookHit(title: q, author: "", publisher: "", isbn: q, coverUrl: "")]
        }
        await m.search("느림")
        #expect(m.searchResults?.first?.title == "빠름")
        #expect(m.searchError == nil)
        #expect(!m.searching)
    }

    // 시트: 검색 중이면 카운트 자리에 "검색 중…", 실패·0건 안내는 숨김
    @Test func sheetShowsSearchingLabel() {
        let m = liveModel()
        m.searching = true
        m.searchError = "이전 실패"
        let s = Sheet13AddBook(model: m)
        #expect(s.isSearching)
        #expect(s.countLabel == "검색 중…")
        #expect(s.errorLabel == nil)
        #expect(s.emptyLabel == nil)
    }

    // 시트: 실패면 결과 영역에 사유 (+다시 시도), 0건 안내는 숨김
    @Test func sheetShowsErrorLabel() {
        let m = liveModel()
        m.searchResults = []
        m.searchError = "알라딘이 응답하지 않아요. 잠시 후 다시 시도해 주세요."
        let s = Sheet13AddBook(model: m)
        #expect(s.errorLabel == m.searchError)
        #expect(s.emptyLabel == nil)
        #expect(!s.isSearching)
    }

    // 데모(provider 없음)는 상태 표시 없음 — rtshot 오라클 불변
    @Test func demoIgnoresSearchStates() {
        let m = RTAppModel()
        m.searching = true
        m.searchError = "x"
        m.searchResults = []
        let s = Sheet13AddBook(model: m)
        #expect(!s.isSearching)
        #expect(s.errorLabel == nil)
        #expect(s.emptyLabel == nil)
        #expect(s.countLabel == "검색 결과 · 32건")
        #expect(s.rowTitles.count == 5)
    }

    // 시트를 다시 열면 실패 안내는 지우고(공란=최신 검색) 결과는 유지
    @Test func openAddBookClearsErrorKeepsResults() async {
        let m = liveModel()
        await m.search("몰입")
        m.searchError = "x"
        m.openSheet(.addbook)
        #expect(m.searchError == nil)
        #expect(m.searchQuery == "")
        #expect(m.searchResults?.count == 1)
    }
}

// 검색 실패 스텁 — 파일 스코프 (@MainActor 스위트 안 중첩 타입의 격리 추론을 피한다)
struct AddBookStubError: Error {}
struct AddBookDescribedError: LocalizedError {
    var errorDescription: String? { "알라딘 서버 오류 (503)" }
}

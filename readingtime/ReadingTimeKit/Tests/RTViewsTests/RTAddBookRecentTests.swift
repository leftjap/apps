import Testing
import Foundation
@testable import RTViews

// 책 추가 시트(13) 최근 검색어 — 사용자 요구 2026-11-08 "최근 검색 목록도 뜨면 좋을 듯":
//  11-08 구현은 마지막 검색 결과 한 묶음만 다시 보여 줘서, 검색한 적이 없으면 시트가 비었고 지난 검색어를 고를 수 없었다
//  (11-10 실기기 보고 "기존 검색이나 최신 검색 같은 걸 기본으로 보여주자고 했는데 없네").
//  → 검색칸이 비어 있으면 최근 검색어(최대 8개, 최신 먼저)를 보여 주고, 누르면 다시 검색, × 로 지운다.
//  결과가 있었던 검색어만 남기고, App 이 UserDefaults 에 저장한다(onRecentQueriesChange / restoreRecentQueries).
//  같은 책이 두 번 나오던 문제(11-10 "예술원에 드리는 보고" 10-16판·10-29판)는 RTBookHitDedupeTests.
//  이미 서재에 있는 책 중 기록(완독·별점·세션)이 있는 책은 검색 시트에서 해제되지 않는다 — ✓ 한 번에 완독·별점이 지워지던 경로.

@MainActor
@Suite struct RTAddBookRecentTests {
    private func liveModel() -> RTAppModel {
        let m = RTAppModel()
        m.searchProvider = { q in
            q == "없는책" ? [] :
            [RTBookHit(title: "결과-\(q)", author: "저자", publisher: "출판", isbn: "i-\(q)", coverUrl: "")]
        }
        return m
    }

    // 검색칸이 비어 있으면 결과 대신 최근 검색어 목록 (최신 먼저)
    @Test func blankFieldShowsRecentQueries() async {
        let m = liveModel()
        await m.search("이기호")
        await m.search("서성이다")
        m.openSheet(.addbook)
        let sheet = Sheet13AddBook(model: m)
        #expect(sheet.countLabel == "최근 검색")
        #expect(sheet.recentRows == ["서성이다", "이기호"])
        #expect(sheet.rowTitles.isEmpty)
    }

    // 검색한 적이 없으면 아무것도 띄우지 않는다
    @Test func blankFieldWithoutHistoryShowsNothing() {
        let m = liveModel()
        m.openSheet(.addbook)
        let sheet = Sheet13AddBook(model: m)
        #expect(sheet.countLabel == nil)
        #expect(sheet.recentRows.isEmpty)
    }

    // 검색칸 글자가 결과를 낸 검색어와 같으면 종전대로 "검색 결과 · N건"
    @Test func matchingFieldKeepsResultCount() async {
        let m = liveModel()
        await m.search("이기호")
        #expect(Sheet13AddBook(model: m).countLabel == "검색 결과 · 1건")
        #expect(Sheet13AddBook(model: m).recentRows.isEmpty)
    }

    // 새 검색어를 입력 중(아직 제출 전)이면 보이는 결과는 지난 검색의 것 — "최근 검색" 목록과 헷갈리지 않게 "이전 검색"
    @Test func typingNewQueryLabelsOldResultsAsPrevious() async {
        let m = liveModel()
        await m.search("이기호")
        m.searchQuery = "서성"
        #expect(Sheet13AddBook(model: m).countLabel == "이전 검색 · 이기호")
    }

    // 같은 검색어는 한 번만, 다시 검색하면 맨 앞으로
    @Test func repeatedQueryMovesToFront() async {
        let m = liveModel()
        for q in ["가", "나", " 가 "] { await m.search(q) }
        #expect(m.recentQueries == ["가", "나"])
    }

    // 최대 8개
    @Test func keepsAtMostEight() async {
        let m = liveModel()
        for i in 1...10 { await m.search("q\(i)") }
        #expect(m.recentQueries == (3...10).reversed().map { "q\($0)" })
    }

    // 결과가 없었던 검색어와 실패한 검색어는 남기지 않는다
    @Test func zeroResultAndFailedQueriesAreNotRemembered() async {
        let m = liveModel()
        await m.search("이기호")
        await m.search("없는책")
        m.searchProvider = { _ in throw AddBookStubError() }
        await m.search("서성이다")
        #expect(m.recentQueries == ["이기호"])
        #expect(m.resultsQuery == "없는책")
    }

    // × = 그 검색어만 지운다. 다 지우면 시트는 공란 (지난 결과를 다시 띄우지 않는다)
    @Test func removeRecentQuery() async {
        let m = liveModel()
        await m.search("이기호")
        await m.search("서성이다")
        m.removeRecentQuery("이기호")
        #expect(m.recentQueries == ["서성이다"])
        m.removeRecentQuery("서성이다")
        m.openSheet(.addbook)
        let sheet = Sheet13AddBook(model: m)
        #expect(sheet.countLabel == nil)
        #expect(sheet.rowTitles.isEmpty && sheet.recentRows.isEmpty && sheet.emptyLabel == nil)
    }

    // 바뀔 때마다 저장 훅으로 알린다 (App 이 UserDefaults 에 저장). 실패한 검색은 알리지 않는다
    @Test func changesReportedForPersistence() async {
        let m = liveModel()
        var saved: [[String]] = []
        m.onRecentQueriesChange = { saved.append($0) }
        await m.search("  이기호 ")
        m.searchProvider = { _ in throw AddBookStubError() }
        await m.search("서성이다")
        m.removeRecentQuery("이기호")
        #expect(saved == [["이기호"], []])
    }

    // 앱을 다시 켜면 저장된 검색어를 복원 (공백·중복 제거, 8개까지)
    @Test func restoreRecentQueries() {
        let m = liveModel()
        m.restoreRecentQueries([" 이기호", "", "서성이다", "이기호"] + (1...10).map { "q\($0)" })
        #expect(m.recentQueries == ["이기호", "서성이다"] + (1...6).map { "q\($0)" })
        m.openSheet(.addbook)
        #expect(Sheet13AddBook(model: m).recentRows.first == "이기호")
    }

    // 11-08 판이 저장한 마지막 검색어(rt.lastSearch.query)는 새 목록의 첫 항목으로 옮긴다
    @Test func legacyLastSearchMigrates() {
        #expect(RTAppModel.loadRecentQueries(saved: nil, legacyQuery: "예술원") == ["예술원"])
        #expect(RTAppModel.loadRecentQueries(saved: ["이기호"], legacyQuery: "예술원") == ["이기호"])
        #expect(RTAppModel.loadRecentQueries(saved: nil, legacyQuery: nil) == [])
    }

    // 데모(rtshot 오라클)는 시안 라벨 그대로
    @Test func demoLabelUnchanged() {
        #expect(Sheet13AddBook(model: RTAppModel()).countLabel == "검색 결과 · 32건")
    }
}

// 같은 책이 여러 번 나오지 않게 — 2026-11-10 실기기: "예술원" 검색에서 「예술원에 드리는 보고」 가 두 줄
// (카카오가 10-16판 9791141690960 과 10-29판 9791141691776 을 따로 준다. 제목·저자·출판사가 같아 화면으로 구분 불가).
// 같은 ISBN 을 쓰는 잡지 호수(「몸」 9772287128005 ×4)는 앱이 ISBN 으로 책을 구분하므로 한 줄만 남긴다
// (두 줄을 두면 하나를 추가할 때 나머지도 ✓ 가 되고, 목록 id 가 겹친다).
@MainActor
@Suite struct RTBookHitDedupeTests {
    private func hit(_ title: String, _ author: String = "이기호", _ publisher: String = "문학동네",
                     isbn: String) -> RTBookHit {
        RTBookHit(title: title, author: author, publisher: publisher, isbn: isbn, coverUrl: "")
    }

    @Test func sameTitleAuthorPublisherKeepsFirst() {
        let hits = [hit("예술원에 드리는 보고", isbn: "9791141690960"),
                    hit("예술원에 드리는 보고", isbn: "9791141691776"),
                    hit("전통예술원 전문사학위논문집 2", "전통예술원", "민속원", isbn: "9788956382050")]
        #expect(RTBookHit.deduped(hits).map(\.isbn) == ["9791141690960", "9788956382050"])
    }

    @Test func sameISBNKeepsFirst() {
        let hits = [hit("몸(2022년 6월호)", "창무예술원 편집부", "창무예술원", isbn: "9772287128005"),
                    hit("몸(2022년 3월호)", "편집부", "창무예술원", isbn: "9772287128005")]
        #expect(RTBookHit.deduped(hits).map(\.title) == ["몸(2022년 6월호)"])
    }

    // 띄어쓰기·대소문자만 다른 것도 같은 책
    @Test func normalizesSpacingAndCase() {
        let hits = [hit("Deep Work", "Cal Newport", "Grand Central", isbn: "a"),
                    hit("deep  work ", "cal newport", "grand central", isbn: "b")]
        #expect(RTBookHit.deduped(hits).count == 1)
    }

    // 제목이 다르면(리커버판 표기 등) 다른 줄, ISBN 이 비어 있으면 ISBN 으로는 합치지 않는다
    @Test func differentTitlesAndEmptyISBNStay() {
        let hits = [hit("예술원에 드리는 보고", isbn: "1"), hit("예술원에 드리는 보고 (리커버)", isbn: "2"),
                    hit("가", isbn: ""), hit("나", isbn: "")]
        #expect(RTBookHit.deduped(hits).count == 4)
    }

    // 검색이 중복을 걸러 결과·건수에 반영한다
    @Test func searchAppliesDedupe() async {
        let m = RTAppModel()
        m.searchProvider = { [self] _ in
            [hit("예술원에 드리는 보고", isbn: "9791141690960"), hit("예술원에 드리는 보고", isbn: "9791141691776")]
        }
        await m.search("예술원")
        #expect(m.searchResults?.count == 1)
        #expect(Sheet13AddBook(model: m).countLabel == "검색 결과 · 1건")
    }
}

// 검색 시트에서 기록 있는 책을 해제하지 않는다
@MainActor
@Suite struct RTAddBookKeepRecordedTests {
    private func liveModel(_ book: RTBook, sessions: [RTSessionRecord] = []) -> RTAppModel {
        let m = RTAppModel()
        m.userData = RTUserData()
        m.userData?.books = [book]
        m.userData?.sessions = sessions
        m.added = [book.isbn]
        m.searchResults = [RTBookHit(title: book.title, author: book.author, publisher: book.publisher,
                                     isbn: book.isbn, coverUrl: book.coverUrl)]
        m.openSheet(.addbook)
        return m
    }
    private func book(finished: Bool = false, rating: Int? = nil) -> RTBook {
        RTBook(isbn: "9791141690960", title: "예술원에 드리는 보고", author: "이기호", publisher: "문학동네",
               coverUrl: "", addedAt: Date(timeIntervalSince1970: 0), finished: finished, rating: rating)
    }

    @Test func finishedBookIsNotRemoved() {
        let m = liveModel(book(finished: true, rating: 5))
        m.toggleAdd("9791141690960")
        #expect(m.userData?.books.count == 1)
        #expect(m.userData?.books.first?.finished == true)
        #expect(m.userData?.books.first?.rating == 5)
        #expect(m.added.contains("9791141690960"))
    }

    @Test func bookWithSessionsIsNotRemoved() {
        let s = RTSessionRecord(isbn: "9791141690960", mode: "flip", seconds: 600,
                                endedAt: Date(timeIntervalSince1970: 100), pauseCount: 0)
        let m = liveModel(book(), sessions: [s])
        m.toggleAdd("9791141690960")
        #expect(m.userData?.books.count == 1)
        #expect(m.added.contains("9791141690960"))
    }

    // 기록 없는 책(방금 잘못 추가한 책)은 종전대로 해제된다
    @Test func bookWithoutRecordsIsRemoved() {
        let m = liveModel(book())
        m.toggleAdd("9791141690960")
        #expect(m.userData?.books.isEmpty == true)
        #expect(!m.added.contains("9791141690960"))
    }
}

// 키보드가 가리는 높이 → 390×844 캔버스 단위 (App 이 scaleEffect 로 축소·중앙 배치)
@Suite struct RTKeyboardInsetTests {
    // iPhone 11 Pro: 812pt 화면, 배율 375/390, 키보드 윗변 478pt → 캔버스 아래 347pt 가 가려짐
    @Test func iPhone11ProKoreanKeyboard() {
        let scale = 375.0 / 390.0
        let inset = RTKeyboard.canvasInset(screenHeight: 812, keyboardMinY: 478, scale: scale)
        #expect(abs(inset - 347.1) < 0.5)
    }

    @Test func hiddenKeyboardIsZero() {
        #expect(RTKeyboard.canvasInset(screenHeight: 812, keyboardMinY: 812, scale: 375.0 / 390.0) == 0)
        #expect(RTKeyboard.canvasInset(screenHeight: 812, keyboardMinY: 900, scale: 375.0 / 390.0) == 0)
    }
}

// 11-07 저녁~11-08 프록시 v15 동안 저장된 책은 카카오 120×174 썸네일 주소를 갖고 있다 — 그릴 때 원본(https)으로 바꾼다
@Suite struct RTCoverURLTests {
    @Test func kakaoThumbnailBecomesHttpsOriginal() {
        let thumb = "https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=http%3A%2F%2Ft1.daumcdn.net%2Flbook%2Fimage%2F7322495%3Ftimestamp%3D20261016142748"
        #expect(RTCoverURL.fullSize(thumb) == "https://t1.daumcdn.net/lbook/image/7322495?timestamp=20261016142748")
    }

    @Test func otherURLsUnchanged() {
        for s in ["https://image.aladin.co.kr/product/4443/8/cover200/8937489341_1.jpg",
                  "https://t1.daumcdn.net/lbook/image/7322495?timestamp=1",
                  "https://search1.kakaocdn.net/thumb/R120x174.q85/?fname=a",
                  ""] {
            #expect(RTCoverURL.fullSize(s) == s)
        }
    }
}

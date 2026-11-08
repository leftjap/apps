import Testing
import Foundation
@testable import RTViews

// 책 추가 시트(13) 최근 검색 — 사용자 요구 2026-11-08:
//  시트를 열면 검색칸이 바로 선택되고(키보드), 그 아래에 지난 검색 결과를 "최근 검색 · 검색어" 로 보여 준다.
//  지난 결과는 앱을 다시 켜도 남도록 App 이 저장·복원한다(onSearchResults / restoreLastSearch).
//  이미 서재에 있는 책 중 기록(완독·별점·세션)이 있는 책은 검색 시트에서 해제되지 않는다 — ✓ 한 번에 완독·별점이 지워지던 경로.

@MainActor
@Suite struct RTAddBookRecentTests {
    private func liveModel() -> RTAppModel {
        let m = RTAppModel()
        m.searchProvider = { q in
            [RTBookHit(title: "결과-\(q)", author: "저자", publisher: "출판", isbn: "i-\(q)", coverUrl: "")]
        }
        return m
    }

    // 검색칸이 비어 있으면 지난 결과는 "최근 검색 · 검색어"
    @Test func blankFieldLabelsResultsAsRecent() async {
        let m = liveModel()
        await m.search("이기호")
        m.openSheet(.addbook)
        #expect(Sheet13AddBook(model: m).countLabel == "최근 검색 · 이기호")
    }

    // 검색칸 글자가 결과를 낸 검색어와 같으면 종전대로 "검색 결과 · N건"
    @Test func matchingFieldKeepsResultCount() async {
        let m = liveModel()
        await m.search("이기호")
        #expect(Sheet13AddBook(model: m).countLabel == "검색 결과 · 1건")
    }

    // 새 검색어를 입력 중(아직 제출 전)이면 보이는 결과는 지난 검색의 것
    @Test func typingNewQueryLabelsOldResultsAsRecent() async {
        let m = liveModel()
        await m.search("이기호")
        m.searchQuery = "서성"
        #expect(Sheet13AddBook(model: m).countLabel == "최근 검색 · 이기호")
    }

    // 실패한 검색은 결과도, 결과를 낸 검색어도 바꾸지 않는다
    @Test func failedSearchKeepsResultsQuery() async {
        let m = liveModel()
        await m.search("이기호")
        m.searchProvider = { _ in throw AddBookStubError() }
        await m.search("서성이다")
        #expect(m.resultsQuery == "이기호")
        m.openSheet(.addbook)
        #expect(Sheet13AddBook(model: m).countLabel == "최근 검색 · 이기호")
    }

    // 성공한 검색만 저장 훅으로 알린다 (App 이 UserDefaults 에 저장)
    @Test func successReportsResultsForPersistence() async {
        let m = liveModel()
        var saved: [(String, [RTBookHit])] = []
        m.onSearchResults = { q, hits in saved.append((q, hits)) }
        await m.search("  이기호 ")
        m.searchProvider = { _ in throw AddBookStubError() }
        await m.search("서성이다")
        #expect(saved.count == 1)
        #expect(saved.first?.0 == "이기호")
        #expect(saved.first?.1.first?.title == "결과-이기호")
    }

    // 앱을 다시 켜면 저장된 지난 결과를 복원 → 시트에 "최근 검색"
    @Test func restoreLastSearchShowsRecent() {
        let m = liveModel()
        let hit = RTBookHit(title: "예술원에 드리는 보고", author: "이기호", publisher: "문학동네",
                            isbn: "9791141690960", coverUrl: "https://t1.daumcdn.net/lbook/image/7322495")
        m.restoreLastSearch(query: "이기호", hits: [hit])
        #expect(m.searchResults == [hit])
        #expect(Sheet13AddBook(model: m).countLabel == "최근 검색 · 이기호")
        #expect(Sheet13AddBook(model: m).rowTitles == ["예술원에 드리는 보고"])
    }

    // 저장 형식 — RTBookHit 는 JSON 으로 왕복된다
    @Test func bookHitRoundTripsJSON() throws {
        let hit = RTBookHit(title: "t", author: "a", publisher: "p", isbn: "i", coverUrl: "c")
        let back = try JSONDecoder().decode(RTBookHit.self, from: JSONEncoder().encode(hit))
        #expect(back == hit)
    }

    // 데모(rtshot 오라클)는 시안 라벨 그대로
    @Test func demoLabelUnchanged() {
        #expect(Sheet13AddBook(model: RTAppModel()).countLabel == "검색 결과 · 32건")
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

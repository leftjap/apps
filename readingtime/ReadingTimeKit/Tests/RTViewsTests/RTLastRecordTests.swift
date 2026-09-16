import Testing
import Foundation
@testable import RTViews

// 홈 '마지막 기록' 행의 정본 — 종이 세션과 밀리 기록 중 더 최근 것.
// 2026-09-15 실사고: 책이 안 붙은 종이 기록의 제목을 홈 첫 카드(homeCards.first)에서
// 빌려와 "만만하게 시작하는 왕초보 영어패턴_회화편 · 89분 읽음" 이 떴다. 실제로 읽은 책은
// 서성이다였고 왕초보는 밀리에서 잠깐 연 책이다. 다른 책 이름을 빌려오면 안 된다.

private func at(_ s: String) -> Date {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    f.dateFormat = s.contains(" ") ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd"
    return f.date(from: s)!
}

@MainActor
@Suite struct RTLastRecordTests {

    private func paper(_ isbn: String, _ title: String, added: String) -> RTBook {
        RTBook(isbn: isbn, title: title, author: "저자", publisher: "출판",
               coverUrl: "https://cdn/\(isbn).jpg", addedAt: at(added))
    }
    private func model(now: String = "2026-09-15 21:40") -> RTAppModel {
        let m = RTAppModel()
        m.now = { at(now) }
        m.userData = RTUserData(
            books: [paper("9791167903792", "서성이다", added: "2026-09-11 00:10")],
            sessions: [])
        return m
    }

    @Test func paperRecordReportsItsOwnBook() {
        let m = model()
        m.userData?.sessions = [.init(isbn: "9791167903792", mode: "tap", seconds: 5352,
                                      endedAt: at("2026-09-15 21:31"), pauseCount: 2)]
        m.ebookReadAt = ["만만하게 시작하는 왕초보 영어패턴_회화편": at("2026-09-11 13:06")]

        #expect(m.lastRecord?.title == "서성이다")
        #expect(m.lastRecord?.minutes == 89)
        #expect(m.lastRecord?.at == at("2026-09-15 21:31"))
    }

    @Test func recordWithoutABookDoesNotBorrowMillieTitle() {
        // 실사고 재현 — 책이 안 붙은 기록이 홈 첫 카드(밀리) 이름을 쓰면 안 된다.
        let m = model()
        m.userData?.sessions = [.init(isbn: nil, mode: "tap", seconds: 5352,
                                      endedAt: at("2026-09-15 21:31"), pauseCount: 2)]
        m.ebookReadAt = ["만만하게 시작하는 왕초보 영어패턴_회화편": at("2026-09-11 13:06")]
        #expect(m.homeCards.first?.title == "만만하게 시작하는 왕초보 영어패턴_회화편")

        #expect(m.lastRecord?.title == "기록")
        #expect(m.lastRecord?.minutes == 89)
    }

    @Test func newerMillieRecordWins() {
        let m = model()
        m.userData?.sessions = [.init(isbn: "9791167903792", mode: "tap", seconds: 1412,
                                      endedAt: at("2026-09-11 00:34"), pauseCount: 0)]
        m.ebookReadAt = ["만만하게 시작하는 왕초보 영어패턴_회화편": at("2026-09-11 13:06")]
        m.ebookDaily = ["2026-09-11": 245]
        m.ebookBooks = ["2026-09-11": ["만만하게 시작하는 왕초보 영어패턴_회화편"]]

        #expect(m.lastRecord?.title == "만만하게 시작하는 왕초보 영어패턴_회화편")
        #expect(m.lastRecord?.minutes == 4)       // 245초
        #expect(m.lastRecord?.at == at("2026-09-11 13:06"))
    }

    @Test func tappingRecordOpensTheBookItNames() {
        // 표시한 책과 탭했을 때 열리는 책이 달라선 안 된다.
        let m = model()
        m.userData?.sessions = [.init(isbn: "9791167903792", mode: "tap", seconds: 5352,
                                      endedAt: at("2026-09-15 21:31"), pauseCount: 2)]
        m.openRecentDetail()
        #expect(m.selectedISBN == "9791167903792")
        #expect(m.route == .detail)
    }

    @Test func tappingMillieRecordDoesNotOpenAPaperBook() {
        // 밀리 책이 표시된 행을 탭하면 종이책 상세로 새면 안 된다 — 밀리는 08 상세가 없으므로
        // 이동하지 않는다. (기록엔 "왕초보"가 떴는데 열리는 건 서성이다이던 문제)
        let m = model()
        m.userData?.sessions = [.init(isbn: "9791167903792", mode: "tap", seconds: 1412,
                                      endedAt: at("2026-09-11 00:34"), pauseCount: 0)]
        m.ebookReadAt = ["만만하게 시작하는 왕초보 영어패턴_회화편": at("2026-09-11 13:06")]
        m.ebookDaily = ["2026-09-11": 245]
        m.ebookBooks = ["2026-09-11": ["만만하게 시작하는 왕초보 영어패턴_회화편"]]
        #expect(m.lastRecord?.title == "만만하게 시작하는 왕초보 영어패턴_회화편")

        let before = m.route
        m.openRecentDetail()
        #expect(m.route == before)          // 이동하지 않는다
        #expect(m.selectedISBN == nil)
    }

    @Test func millieDayBelowMinimumIsNotTheLastRecord() {
        // 1분 미만인 밀리 날은 앱이 시간·연속·읽은 날에서 빼는데(ebookMinSeconds),
        // '마지막 기록' 에만 "0분 읽음" 으로 떴다. 기록에서 뺀 날을 대표로 내세우면 안 된다.
        let m = model()
        m.userData?.sessions = [.init(isbn: "9791167903792", mode: "tap", seconds: 600,
                                      endedAt: at("2026-09-09 10:00"), pauseCount: 0)]
        m.ebookReadAt = ["잠깐 연 책": at("2026-09-14 20:00")]     // 종이보다 최신
        m.ebookDaily = ["2026-09-14": 30]                          // 30초 = 인정 안 되는 날
        m.ebookBooks = ["2026-09-14": ["잠깐 연 책"]]

        #expect(m.lastRecord?.title == "서성이다")
        #expect(m.lastRecord?.isEbook == false)
    }

    @Test func millieDayAtOrAboveMinimumStaysTheLastRecord() {
        let m = model()
        m.userData?.sessions = [.init(isbn: "9791167903792", mode: "tap", seconds: 600,
                                      endedAt: at("2026-09-09 10:00"), pauseCount: 0)]
        m.ebookReadAt = ["제대로 읽은 책": at("2026-09-14 20:00")]
        m.ebookDaily = ["2026-09-14": 245]
        m.ebookBooks = ["2026-09-14": ["제대로 읽은 책"]]

        #expect(m.lastRecord?.title == "제대로 읽은 책")
        #expect(m.lastRecord?.minutes == 4)
    }

    @Test func noRecordsYieldsNil() {
        #expect(model().lastRecord == nil)
    }

    @Test func demoModelHasNoRecord() {
        // userData nil(데모/시안 픽셀 경로)은 화면이 고정값을 그린다.
        #expect(RTAppModel().lastRecord == nil)
    }
}

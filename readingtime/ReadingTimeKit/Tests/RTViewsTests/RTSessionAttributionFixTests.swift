import Testing
import Foundation
@testable import RTViews

// 2026-09-15 실사고 회귀 방지 — 89분(5352초) 탭 세션이 어느 책에도 안 붙어 저장됐다.
// 실물: {"endedAt":"2026-09-15T12:31:44Z","mode":"tap","seconds":5352,"isbn":null}
// 원인: 세션 대상이 홈 캐러셀 '인덱스'라는 휘발성 UI 상태였는데, 카드 배열은 포그라운드
//   복귀마다 loadEbook 으로 재정렬된다(밀리 read_at 기준). 같은 번호가 다른 책을 가리키고,
//   그 카드가 밀리면 flipTargetISBN 이 nil 을 내며 startSession 이 그대로 저장했다.

private func at(_ s: String) -> Date {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    f.dateFormat = s.contains(" ") ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd"
    return f.date(from: s)!
}

@MainActor
@Suite struct RTSessionAttributionFixTests {

    private func paper(_ isbn: String, _ title: String, added: String) -> RTBook {
        RTBook(isbn: isbn, title: title, author: "저자", publisher: "출판",
               coverUrl: "https://cdn/\(isbn).jpg", addedAt: at(added))
    }

    /// 2026-09-15 실데이터 — 서재 미완독 2권 + 09-10 서성이다 세션
    private func realModel(now: String = "2026-09-15 20:02") -> RTAppModel {
        let m = RTAppModel()
        m.now = { at(now) }
        m.sessionSeed = 0
        m.userData = RTUserData(
            books: [paper("9788960907706", "눈감지 마라", added: "2026-08-21 23:12"),
                    paper("9791167903792", "서성이다", added: "2026-09-11 00:10")],
            sessions: [.init(isbn: "9791167903792", mode: "tap", seconds: 1412,
                             endedAt: at("2026-09-11 00:34"), pauseCount: 0)])
        return m
    }

    /// loadEbook 이 실제로 주입하는 밀리 기록 (2026-09-15 Supabase 실값)
    private func loadMillie(_ m: RTAppModel) {
        m.ebookReadAt = ["만만하게 시작하는 왕초보 영어패턴_회화편": at("2026-09-11 13:06"),
                         "살찌지 않는 몸": at("2026-09-10 23:44"),
                         "최소한의 한국사": at("2026-09-06 15:08"),
                         "사피엔스": at("2026-09-06 15:02")]
    }

    // ── 선택은 인덱스가 아니라 책을 따라간다 ──

    @Test func selectedCardSurvivesCarouselReorder() {
        // 밀리 로드 전 서성이다를 고른 뒤 loadEbook 이 밀리 카드를 앞에 끼워 넣어도
        // 선택은 여전히 서성이다여야 한다. (인덱스만 들고 있으면 왕초보로 밀린다)
        let m = realModel()
        #expect(m.homeCards.map(\.title) == ["서성이다", "눈감지 마라"])
        m.homeCardIndex = 0

        loadMillie(m)
        #expect(m.homeCards.first?.title == "만만하게 시작하는 왕초보 영어패턴_회화편")
        #expect(m.homeCards[m.homeCardIndex].title == "서성이다")
        #expect(m.flipTargetISBN == "9791167903792")
        #expect(m.selectedCardRecordable)
    }

    @Test func tapStartAfterReorderRecordsTheSelectedBook() {
        // 실사고 재현 경로 — 홈 '탭 시작'(switchTap)은 start() 를 안 거쳐 그 시점
        // flipTargetISBN 을 다시 읽는다. 재정렬 뒤에도 고른 책에 붙어야 한다.
        let m = realModel()
        m.homeCardIndex = 0            // 서성이다
        loadMillie(m)

        m.switchTap()
        #expect(m.session?.isbn == "9791167903792")
    }

    @Test func sessionNeverSavesWithoutABookWhenOneIsBeingRead() {
        // 방어선 — 어떤 경로로 대상이 비어도 읽는 중 책이 있으면 그 책에 붙인다.
        // (89분이 isbn:null 로 저장된 재발 차단)
        let m = realModel()
        loadMillie(m)
        m.homeCardIndex = 0            // 밀리 카드 = 대상 없음

        m.switchTap()
        #expect(m.session?.isbn == "9791167903792")   // currentBook = 서성이다

        m.session?.elapsed = 5352
        m.saveSession()
        #expect(m.userData?.sessions.last?.isbn == "9791167903792")
        #expect(m.userData?.sessions.last?.seconds == 5352)
    }

    @Test func millieCardStillBlocksFlipStart() {
        // 폴백이 밀리 카드의 엎기 차단까지 풀면 안 된다 (이중 계상 방지 규칙 유지).
        let m = realModel()
        loadMillie(m)
        m.homeCardIndex = 0
        #expect(m.flipTargetISBN == nil)
        #expect(!m.selectedCardRecordable)
    }

    // ── 책 없이 저장된 과거 기록 복구 ──

    @Test func repairsUnattributedSessionToBookBeingReadThen() {
        // 2026-09-15 89분 복구 — 그 시점에 미완독이던 종이책 중 가장 최근에 읽은 책.
        let m = realModel(now: "2026-09-15 21:40")
        m.userData?.sessions.append(.init(isbn: nil, mode: "tap", seconds: 5352,
                                          endedAt: at("2026-09-15 21:31"), pauseCount: 2))
        m.repairUnattributedSessions()

        let fixed = m.userData?.sessions.last
        #expect(fixed?.isbn == "9791167903792")
        #expect(fixed?.seconds == 5352)
        #expect(m.totalSeconds(isbn: "9791167903792") == 1412 + 5352)
    }

    @Test func repairLeavesSessionsThatAlreadyHaveABook() {
        let m = realModel()
        m.repairUnattributedSessions()
        #expect(m.userData?.sessions.map(\.isbn) == ["9791167903792"])
    }

    @Test func repairSkipsWhenNoPaperBookWasBeingRead() {
        // 서재가 비었으면 붙일 곳이 없다 — 그대로 둔다(억지 귀속 금지).
        let m = RTAppModel()
        m.now = { at("2026-09-15 21:40") }
        m.userData = RTUserData(books: [], sessions: [
            .init(isbn: nil, mode: "tap", seconds: 600, endedAt: at("2026-09-15 21:31"), pauseCount: 0)])
        m.repairUnattributedSessions()
        #expect(m.userData?.sessions.first?.isbn == nil)
    }
}

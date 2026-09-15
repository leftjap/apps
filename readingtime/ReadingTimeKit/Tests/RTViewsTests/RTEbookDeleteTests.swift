import Testing
import Foundation
@testable import RTViews

// 밀리 책 삭제 (사용자 결정 2026-09-15) — 밀리에서 검색해 눌러보기만 한 책이 홈 캐러셀에
// 쌓이는데 지울 방법이 완독 처리뿐이었다. 완독은 서재에 편입시키므로 반대 동작이다.
// 삭제한 책은 홈에서 사라지고 기록(시간·연속·읽은 날·랭킹)에서도 빠진다. 완독과 달리
// 밀리에 더 최신 기록이 들어와도 되살아나지 않는다.
//
// 그날 시간(book_reading_seconds)은 날짜 단위 총합이라 책별로 나뉘지 않는다. 그래서
// 그날 남은 책이 없을 때만 시간을 뺀다 — 다른 책과 같이 읽은 날의 시간은 그 책 몫이다.

private func at(_ s: String) -> Date {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    f.dateFormat = s.contains(" ") ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd"
    return f.date(from: s)!
}

@MainActor
@Suite struct RTEbookDeleteTests {

    /// 2026-09-15 실데이터 — 09-10 살찌지 않는 몸 1권(182초) · 09-06 두 권(413초)
    private func model(now: String = "2026-09-15 21:40") -> RTAppModel {
        let m = RTAppModel()
        m.now = { at(now) }
        m.userData = RTUserData(books: [], sessions: [])
        m.ebookReadAt = ["살찌지 않는 몸": at("2026-09-10 23:44"),
                         "최소한의 한국사": at("2026-09-06 15:08"),
                         "사피엔스": at("2026-09-06 15:02")]
        m.ebookDaily = ["2026-09-10": 182, "2026-09-06": 413]
        m.ebookBooks = ["2026-09-10": ["살찌지 않는 몸"],
                        "2026-09-06": ["최소한의 한국사", "사피엔스"]]
        return m
    }

    @Test func deletedEbookLeavesHomeCards() {
        let m = model()
        #expect(m.homeCards.count == 3)

        m.deleteEbook("살찌지 않는 몸")
        #expect(m.homeCards.map(\.title) == ["최소한의 한국사", "사피엔스"])
    }

    @Test func deletedEbookStaysGoneWhenMillieSyncsAgain() {
        // 완독(finishEbook)은 더 최신 기록이 오면 되살아난다. 삭제는 되살아나지 않는다.
        let m = model()
        m.deleteEbook("살찌지 않는 몸")
        m.ebookReadAt["살찌지 않는 몸"] = at("2026-09-15 20:00")
        #expect(!m.homeCards.contains { $0.title == "살찌지 않는 몸" })
    }

    @Test func deletingTheOnlyBookOfADayRemovesThatDaysTime() {
        let m = model()
        #expect(m.ebookSeconds(on: at("2026-09-10")) == 182)

        m.deleteEbook("살찌지 않는 몸")
        #expect(m.ebookSeconds(on: at("2026-09-10")) == 0)
    }

    @Test func deletingOneOfTwoBooksKeepsThatDaysTime() {
        // 그날 시간은 책별로 안 나뉜다 — 남은 책이 있으면 시간은 그 책 몫으로 둔다.
        let m = model()
        m.deleteEbook("사피엔스")
        #expect(m.ebookSeconds(on: at("2026-09-06")) == 413)
        #expect(m.ebookBreakdown(on: at("2026-09-06")).map(\.title) == ["최소한의 한국사"])
    }

    @Test func deletedDayDropsOutOfStreakAndReadDays() {
        let m = model(now: "2026-09-10 23:50")
        #expect(m.streakDays == 1)

        m.deleteEbook("살찌지 않는 몸")
        #expect(m.streakDays == 0)
    }

    @Test func deletedEbookIsExcludedFromCountedTotals() {
        let m = model()
        #expect(m.countedEbookTotalSeconds == 182 + 413)
        #expect(m.countedEbookDayCount == 2)

        m.deleteEbook("살찌지 않는 몸")
        #expect(m.countedEbookTotalSeconds == 413)
        #expect(m.countedEbookDayCount == 1)
    }

    @Test func deleteFiresPersistenceHook() {
        let m = model()
        var saved: Set<String>?
        m.onHiddenEbooksChange = { saved = $0 }

        m.deleteEbook("살찌지 않는 몸")
        #expect(saved == ["살찌지 않는 몸"])
    }

    @Test func deletableOnlyForMillieCards() {
        // 종이책 카드는 서재 ⋯ 메뉴의 책 삭제를 쓴다 — 홈 카드에서 지우는 건 밀리 전용.
        let m = model()
        m.userData = RTUserData(
            books: [RTBook(isbn: "A", title: "몰입", author: "저", publisher: "출",
                           coverUrl: "", addedAt: at("2026-09-14"))],
            sessions: [])
        let paperCard = m.homeCards.first { !$0.isEbook }
        #expect(paperCard?.deletable == false)
        #expect(m.homeCards.first { $0.isEbook }?.deletable == true)
    }

    @Test func deletedEbookLeavesTheLastRecordRow() {
        // 지운 책이 '마지막 기록' 에 계속 뜨면 지운 것이 아니다.
        let m = model()
        m.userData = RTUserData(
            books: [RTBook(isbn: "A", title: "몰입", author: "저", publisher: "출",
                           coverUrl: "", addedAt: at("2026-09-01"))],
            sessions: [.init(isbn: "A", mode: "tap", seconds: 600,
                             endedAt: at("2026-09-09 10:00"), pauseCount: 0)])
        #expect(m.lastRecord?.title == "살찌지 않는 몸")

        m.deleteEbook("살찌지 않는 몸")
        // 남은 것 중 최신 = 종이 09-09 (밀리 최소한의 한국사는 09-06 이라 더 옛것)
        #expect(m.lastRecord?.title == "몰입")
        #expect(m.lastRecord?.isEbook == false)
    }

    @Test func deletedEbookLeavesStatsRanking() {
        let m = model()
        #expect(m.statsDataset.books.contains { $0.title == "살찌지 않는 몸" })

        m.deleteEbook("살찌지 않는 몸")
        #expect(!m.statsDataset.books.contains { $0.title == "살찌지 않는 몸" })
        // 09-06 은 두 권이라 원래부터 "밀리의서재" 로 뭉친다 — 삭제와 무관하게 남는다
        #expect(m.statsDataset.books.contains { $0.title == "밀리의서재" })
    }

    @Test func deleteSelectedCardKeepsIndexInRange() {
        let m = model()
        m.homeCardIndex = 2                 // 사피엔스 (마지막)
        m.deleteSelectedCard()
        #expect(m.homeCards.count == 2)
        #expect(m.homeCardIndex < m.homeCards.count)
    }
}

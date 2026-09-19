import Testing
import Foundation
@testable import RTViews

// 09 완독 시트가 **선택한 책**을 보여야 한다.
// 실기기 보고 2026-09-19: '압록강은 흐른다' 를 완독 처리했는데 시트에 시안 데모 책(몰입)의
// 제목·저자·누적(4:12 · 8회 · 18일)이 떴다. Sheet09Finish 가 시안 문자열을 그대로 들고 있고
// selectedBook 을 한 번도 읽지 않아서다. 08 상세(Screen08Detail.Live)는 이미 실데이터를 쓴다.

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

private let paperBook = RTBook(isbn: "9788937473135", title: "압록강은 흐른다", author: "이미륵",
                               publisher: "민음사", coverUrl: "https://img/a.jpg",
                               addedAt: day("2026-09-17"))
private let millieBook = RTBook(isbn: "밀리:도둑맞은 집중력", title: "도둑맞은 집중력",
                                author: "요한 하리", publisher: "어크로스", coverUrl: "",
                                addedAt: day("2026-09-10"), millieBookId: "m-1")

@MainActor
private func paperModel() -> RTAppModel {
    let m = RTAppModel()
    m.now = { day("2026-09-19") }
    m.userData = RTUserData(books: [paperBook], sessions: [
        .init(isbn: paperBook.isbn, mode: "flip", seconds: 20 * 60, endedAt: day("2026-09-18"), pauseCount: 0),
        .init(isbn: paperBook.isbn, mode: "tap", seconds: 26 * 60, endedAt: day("2026-09-19"), pauseCount: 0),
    ])
    m.login()
    m.openBookDetail(isbn: paperBook.isbn)
    return m
}

@MainActor
private func millieModel() -> RTAppModel {
    let m = RTAppModel()
    m.now = { day("2026-09-19") }
    m.userData = RTUserData(books: [millieBook], sessions: [])
    m.ebookDaily = ["2026-09-17": 30 * 60, "2026-09-18": 12 * 60, "2026-09-19": 40]  // 40초 날은 미달 제외
    m.ebookBooks = ["2026-09-17": ["도둑맞은 집중력"],
                    "2026-09-18": ["도둑맞은 집중력"],
                    "2026-09-19": ["도둑맞은 집중력"]]
    m.login()
    m.openBookDetail(isbn: millieBook.isbn)
    return m
}

// ── 08 상세 핀 — 09 시트가 참조할 정본 수. 리팩터링으로 흔들리면 안 된다 ──
@MainActor
@Suite struct RTDetailTotalsPinTests {
    @Test func paperDetailTotals() throws {
        let live = try #require(Screen08Detail(model: paperModel()).live)
        #expect(live.book.title == "압록강은 흐른다")   // 대체 표지 재료 — 09 시트와 같아야 한다
        #expect(live.total == "0:46")     // 20분 + 26분
        #expect(live.count == 2)          // 세션 2회
        #expect(live.days == 3)           // 9.17 추가 → 9.19 = 3일째
        #expect(live.isMillie == false)
        #expect(live.rows.count == 2)
    }

    @Test func millieDetailTotals() throws {
        let live = try #require(Screen08Detail(model: millieModel()).live)
        #expect(live.total == "0:42")     // 30분 + 12분 (40초 날 제외)
        #expect(live.count == 2)          // 읽은 날 2일
        #expect(live.days == 10)          // 9.10 추가 → 9.19
        #expect(live.isMillie == true)
        #expect(live.rows.count == 2)
    }
}

// ── 09 완독 시트 ──
@MainActor
@Suite struct RTFinishSheetTests {
    @Test func showsSelectedPaperBookNotMockup() throws {
        let m = paperModel()
        m.openSheet(.finish)
        let live = try #require(Sheet09Finish(model: m).live)
        #expect(live.subtitle == "압록강은 흐른다 · 이미륵 · 3일 동안")   // 몰입이 아니라
        // 표지 이미지가 없을 때 제목이 찍힌 대체 표지가 떠야 한다 (시안 표지엔 제목이 있었다)
        #expect(live.title == "압록강은 흐른다")
        #expect(live.author == "이미륵")
        #expect(live.total == "0:46")
        #expect(live.count == 2)
        #expect(live.countUnit == "회")
        #expect(live.countLabel == "세션")
        #expect(live.days == 3)
        #expect(live.coverUrl == "https://img/a.jpg")
    }

    @Test func millieBookCountsReadDaysNotSessions() throws {
        let m = millieModel()
        m.openSheet(.finish)
        let live = try #require(Sheet09Finish(model: m).live)
        #expect(live.subtitle == "도둑맞은 집중력 · 요한 하리 · 10일 동안")
        #expect(live.total == "0:42")
        #expect(live.count == 2)
        #expect(live.countUnit == "일")
        #expect(live.countLabel == "읽은 날")
    }

    // 데모(userData nil) 경로는 시안 고정값 그대로 — rtshot 09 정적/‑‑app 픽셀 오라클 불변
    @Test func demoPathKeepsMockup() {
        let m = RTAppModel()
        m.login()
        m.navScreenID("09")
        #expect(Sheet09Finish(model: m).live == nil)
        #expect(Sheet09Finish(model: nil).live == nil)
    }

    // 별점 잔존: 평가 없는 책을 열면 직전 책 별점이 남으면 안 된다 (기본 4★로 복귀)
    @Test func ratingResetsForUnratedBook() {
        let m = paperModel()
        m.openSheet(.finish)
        m.rate(1)
        m.saveFinished()                       // 압록강 = 1★ 저장
        let other = RTBook(isbn: "222", title: "B", author: "b", publisher: "p",
                           coverUrl: "", addedAt: day("2026-09-18"))
        m.userData?.books.append(other)
        m.openBookDetail(isbn: "222")
        m.openSheet(.finish)
        #expect(m.rating == 4)                 // 직전 책의 1★ 이 남으면 안 됨
    }

    @Test func ratingPresetsFromBooksOwnRating() {
        let m = paperModel()
        m.openSheet(.finish)
        m.rate(5)
        m.saveFinished()
        m.openBookDetail(isbn: paperBook.isbn)
        m.openSheet(.finish)
        #expect(m.rating == 5)                 // 재완독은 그 책 별점을 그대로
    }

    // 저장 자체는 선택한 책에 들어간다 (회귀 방지 — 표시만 틀렸다는 진단의 근거)
    @Test func savesToSelectedBook() throws {
        let m = paperModel()
        m.openSheet(.finish)
        m.rate(3)
        m.saveFinished()
        let saved = try #require(m.userData?.books.first { $0.isbn == paperBook.isbn })
        #expect(saved.finished)
        #expect(saved.rating == 3)
    }
}

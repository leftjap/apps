import Testing
import Foundation
@testable import RTViews

// 밀리(전자책) 별도 표시 유지 — 사용자 요청: 밀리 책은 통계에서 별도로 구분해 보여야 한다.
// 기록 원페이지에서 밀리 책이 ① 랭킹에 밀리 필(millie 플래그) ② day 시트에 "밀리에서 자동 기록"
// 서브라인으로 표기되는지 회귀 방지. (구 주간 팝오버 "· 밀리" 규칙의 후계)

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

@MainActor
@Suite struct RTMillieStatsTests {
    private func liveModel() -> RTAppModel {
        let m = RTAppModel()
        m.now = { day("2026-07-15") }
        m.userData = RTUserData(
            books: [RTBook(isbn: "P1", title: "작별하지 않는다", author: "한강",
                           publisher: "", coverUrl: "", addedAt: day("2026-07-13"))],
            sessions: [.init(isbn: "P1", mode: "flip", seconds: 60 * 60, endedAt: day("2026-07-16"), pauseCount: 0)])
        m.ebookDaily = ["2026-07-16": 36 * 60]                 // 밀리 36분
        m.ebookBooks = ["2026-07-16": ["도둑맞은 집중력"]]
        m.ebookCovers = ["도둑맞은 집중력": "https://img.millie.co.kr/x.jpg"]
        return m
    }

    @Test func rankingFlagsMillieBook() throws {
        let m = liveModel()
        let ds = m.statsDataset
        let mo = RTStats.month(ds, year: 2026, month: 7)
        let millie = try #require(mo.ranked.first { ds.books[$0.book].title == "도둑맞은 집중력" })
        #expect(ds.books[millie.book].millie)
        #expect(ds.books[millie.book].coverUrl == "https://img.millie.co.kr/x.jpg")   // 실표지 관통
        #expect(RTStats.hm(millie.sec) == "0:36")
        let paper = try #require(mo.ranked.first { ds.books[$0.book].title == "작별하지 않는다" })
        #expect(!ds.books[paper.book].millie)
    }

    @Test func daySheetMarksMillieRow() throws {
        let m = liveModel()
        let ds = m.statsDataset
        let s = RTStats.daySheet(ds, year: 2026, month: 7, day: 16)
        #expect(s.sub == "2권 · 1시간 36분 읽음")
        let millie = try #require(s.rows.first { ds.books[$0.book].title == "도둑맞은 집중력" })
        #expect(millie.sub == "밀리에서 자동 기록" && millie.subMillie && !millie.pin && millie.value == "36분")
        let paper = try #require(s.rows.first { ds.books[$0.book].title == "작별하지 않는다" })
        #expect(paper.pin && !paper.subMillie && paper.value == "60분")
    }

    // 파트너 통계는 내 밀리가 섞이지 않는다 (실기기 보고 2026-07-14 재발 방지)
    @Test func partnerDatasetHasNoMyMillie() {
        let m = liveModel()
        m.partnerData = RTUserData(sessions: [.init(isbn: nil, mode: "flip", seconds: 600,
                                                    endedAt: day("2026-07-11"), pauseCount: 0)])
        m.statsSubject = .partner
        let mo = RTStats.month(m.statsDataset, year: 2026, month: 7)
        #expect(mo.totalSec == 0, "isbn 없는 파트너 세션은 책 귀속이 없어 집계 제외, 내 밀리 36분도 없음")
        #expect(m.statsDataset.books.isEmpty)
    }

    // 내 통계는 종이 + 밀리 합산 (구 RTMonthStatsTests.meMonthIncludesMillie 후계)
    @Test func myDatasetMergesPaperAndMillie() {
        let m = liveModel()
        let mo = RTStats.month(m.statsDataset, year: 2026, month: 7)
        #expect(RTStats.hm(mo.totalSec) == "1:36")
        #expect(mo.readDays == 1)
    }
}

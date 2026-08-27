import Testing
import Foundation
@testable import RTViews

// 밀리(전자책) 별도 표시 유지 — 사용자 요청: 시안엔 밀리 강조가 없지만 밀리 책은 통계에서
// 별도로 구분해 보여야 한다. 라이브(실데이터) 주간 통계에서 밀리 책이
//  ① 팝오버에 "제목 · 밀리" 로 표기되고
//  ② 랭킹에 "밀리" 태그 + 앰버(gold) 색으로 표기되는지 회귀 방지.
// (2026-07-15 리팩터에서 팝오버 "· 밀리" 를 실수로 떨어뜨렸다가 복원 — 이 테스트가 재발 차단)

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

@MainActor
@Suite struct RTMillieStatsTests {
    // 2026-07-16(목) 선택. 그 주 월요일 = 07-13. sel=3(목).
    private func liveModel() -> RTAppModel {
        let m = RTAppModel()
        m.now = { day("2026-07-15") }        // 이번 주(월 07-13 ~ 일 07-19)
        m.weekSel = 3                        // 목요일 선택
        m.userData = RTUserData(
            books: [RTBook(isbn: "P1", title: "작별하지 않는다", author: "한강",
                           publisher: "", coverUrl: "", addedAt: day("2026-07-13"))],
            sessions: [.init(isbn: "P1", mode: "flip", seconds: 60 * 60, endedAt: day("2026-07-16"), pauseCount: 0)])
        m.ebookDaily = ["2026-07-16": 36 * 60]                 // 목: 밀리 36분
        m.ebookBooks = ["2026-07-16": ["도둑맞은 집중력"]]
        return m
    }

    @Test func popoverMarksMillieBook() throws {
        let live = try #require(Screen10Stats(model: liveModel()).live)
        // 선택일(목) 팝오버: 종이 "작별하지 않는다" 60분 + 밀리 "도둑맞은 집중력 · 밀리" 36분
        let millieRow = try #require(live.popRows.first { $0.name.contains("밀리") })
        #expect(millieRow.name == "도둑맞은 집중력 · 밀리")
        #expect(millieRow.min == 36)
        #expect(millieRow.dot == RT.amber)
        #expect(live.popRows.contains { $0.name == "작별하지 않는다" })   // 종이는 라벨 없음
    }

    @Test func rankingTagsMillieBook() throws {
        let live = try #require(Screen10Stats(model: liveModel()).live)
        let millie = try #require(live.ranks.first { $0.title == "도둑맞은 집중력" })
        #expect(millie.tag == "밀리")
        #expect(millie.color == RT.amber)
        #expect(millie.value == "0:36")
        // 종이 책은 밀리 태그 없음
        let paper = try #require(live.ranks.first { $0.title == "작별하지 않는다" })
        #expect(paper.tag == nil)
    }

    // 밀리 책 상세 = "밀리의서재" 태그 / 종이 = "직접 기록" (§7, 데모 엔진 경로)
    @Test func bookDetailTagsMillie() {
        let millie = RTRecord.buildBook(2)   // 도둑맞은 집중력 (millie)
        #expect(millie.tag == "밀리의서재")
        let paper = RTRecord.buildBook(4)    // 파친코
        #expect(paper.tag == "직접 기록")
    }

    // 밀리 책 = 장소 시트 표지에 "밀리" 배지 (§6)
    @Test func placeSheetBadgesMillie() {
        let sheet = RTRecord.buildSheet(["ny"])   // 파친코 + 도둑맞은 집중력(밀리)
        let millie = sheet.covers.first { $0.title == "도둑맞은 집중력" }!
        #expect(millie.millie)
        let paper = sheet.covers.first { $0.title == "파친코" }!
        #expect(!paper.millie)
    }
}

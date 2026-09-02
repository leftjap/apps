import Testing
import Foundation
@testable import RTViews

// 기록 원페이지 데이터셋 캐시 — 지도 카메라 콜백(연속)·시트·행 렌더가 statsDataset 을 매번 재집계하지 않도록
// 입력(userData·밀리·파트너·주체·오늘 날짜)이 바뀔 때만 다시 만든다. 캐시가 낡은 값을 돌려주면 안 된다.
private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

@MainActor
@Suite struct RTStatsCacheTests {
    private func model() -> RTAppModel {
        let m = RTAppModel()
        m.now = { day("2026-09-02") }
        m.userData = RTUserData(
            books: [RTBook(isbn: "A", title: "몰입", author: "", publisher: "", coverUrl: "", addedAt: day("2026-08-01"))],
            sessions: [.init(isbn: "A", mode: "flip", seconds: 600, endedAt: day("2026-09-01"), pauseCount: 0)])
        return m
    }

    @Test func repeatedAccessDoesNotRebuild() {
        let m = model()
        var builds = 0
        m.onStatsDatasetBuilt = { builds += 1 }
        _ = m.statsDataset; _ = m.statsDataset; _ = m.statsDataset
        #expect(builds == 1, "입력이 같으면 한 번만 집계")
    }

    @Test func paperSessionChangeInvalidates() {
        let m = model()
        #expect(m.statsDataset.sessions.count == 1)
        m.userData?.sessions.append(.init(isbn: "A", mode: "flip", seconds: 300,
                                          endedAt: day("2026-09-02"), pauseCount: 0))
        #expect(m.statsDataset.sessions.count == 2, "세션 추가가 캐시에 반영되지 않음")
    }

    @Test func millieDataChangeInvalidates() {
        let m = model()
        #expect(m.statsDataset.books.count == 1)
        m.ebookDaily = ["2026-09-02": 1200]
        m.ebookBooks = ["2026-09-02": ["도둑맞은 집중력"]]
        #expect(m.statsDataset.books.map(\.title).contains("도둑맞은 집중력"), "밀리 갱신이 캐시에 반영되지 않음")
        m.ebookCovers = ["도둑맞은 집중력": "https://m/1.jpg"]
        #expect(m.statsDataset.books.first { $0.title == "도둑맞은 집중력" }?.coverUrl == "https://m/1.jpg")
    }

    @Test func subjectAndPartnerChangeInvalidate() {
        let m = model()
        m.partnerData = RTUserData(books: [RTBook(isbn: "P", title: "파트너책", author: "", publisher: "",
                                                  coverUrl: "", addedAt: day("2026-08-01"))],
                                   sessions: [.init(isbn: "P", mode: "flip", seconds: 60, endedAt: day("2026-09-01"), pauseCount: 0)])
        #expect(m.statsDataset.books.map(\.title) == ["몰입"])
        m.statsSubject = .partner
        #expect(m.statsDataset.books.map(\.title) == ["파트너책"], "주체 전환이 캐시에 반영되지 않음")
        m.partnerData = RTUserData()
        #expect(m.statsDataset.books.isEmpty, "파트너 데이터 교체가 캐시에 반영되지 않음")
    }

    @Test func dayRolloverInvalidates() {
        let m = model()
        #expect(m.statsDataset.today.day == 2)
        m.now = { day("2026-09-03") }
        #expect(m.statsDataset.today.day == 3, "날짜가 바뀌면 오늘·미래 판정이 갱신돼야 한다")
    }

    @Test func demoPathIsNotCachedAcrossLoginState() {
        let m = RTAppModel()           // userData nil = 데모
        #expect(m.statsDataset.places.count == 10)
        m.userData = RTUserData()      // 실데이터(빈)로 전환
        #expect(m.statsDataset.places.isEmpty)
    }
}

import Testing
@testable import ReadingTimeKit

// 클라우드 조회 행 제한 (2026-11-08 검토) — Supabase(PostgREST)는 한 번에 최대 1000행만 돌려준다.
// 밀리 일별·책별 표는 매일 늘어나므로, 한 번에 받으면 언젠가 오래된(또는 최신) 행이 말없이 잘린다.
@Suite struct PagedFetchTests {
    @Test func readsAllPagesUntilAShortPage() async throws {
        let all = Array(0..<2345)
        var ranges: [ClosedRange<Int>] = []
        let rows = try await CloudStore.fetchAllPages(pageSize: 1000) { r in
            ranges.append(r)
            return Array(all[r.clamped(to: 0...(all.count - 1))])
        }
        #expect(rows == all)
        #expect(ranges == [0...999, 1000...1999, 2000...2999])
    }

    @Test func exactMultipleStopsOnEmptyPage() async throws {
        let all = Array(0..<1000)
        var calls = 0
        let rows = try await CloudStore.fetchAllPages(pageSize: 1000) { r in
            calls += 1
            return r.lowerBound >= all.count ? [] : Array(all[r])
        }
        #expect(rows.count == 1000 && calls == 2)
    }
}

import Testing
import Foundation
@testable import RTViews

// §13 Data Model — ReadingSession 에 위치(latitude/longitude/placeId/placeName/country) 도입.
// 세션은 readingtime_userdata.data 의 JSON 스냅샷이라 SQL 스키마 변경 없이 필드 추가로 끝난다.
// 필드는 옵셔널 → 위치 없는 기존 기록도 그대로 디코드된다(하위호환).

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

@Suite struct RTSessionLocationTests {

    @Test func legacySessionJSONWithoutLocationStillDecodes() throws {
        let json = """
        {"isbn":"111","mode":"flip","seconds":600,"endedAt":768000000,"pauseCount":0}
        """
        let rec = try JSONDecoder().decode(RTSessionRecord.self, from: Data(json.utf8))
        #expect(rec.isbn == "111")
        #expect(rec.seconds == 600)
        #expect(rec.latitude == nil && rec.placeId == nil)
    }

    @Test func locationRoundTrips() throws {
        let rec = RTSessionRecord(isbn: "111", mode: "flip", seconds: 600, endedAt: day("2026-06-24"),
                                  pauseCount: 0, latitude: 40.7, longitude: -74.0,
                                  placeId: "ny", placeName: "뉴욕", country: "미국")
        let data = try JSONEncoder().encode(rec)
        let back = try JSONDecoder().decode(RTSessionRecord.self, from: data)
        #expect(back == rec)
        #expect(back.placeName == "뉴욕" && back.country == "미국")
    }

    // §13 집계 — 실데이터 세션 → 지도 place 목록 (엔진이 데모와 동일 규칙으로 소비)
    @Test func buildsPlacesFromUserData() {
        let books = [
            RTBook(isbn: "A", title: "파친코", author: "이민진", publisher: "", coverUrl: "", addedAt: day("2026-06-01")),
            RTBook(isbn: "B", title: "도둑맞은 집중력", author: "요한 하리", publisher: "", coverUrl: "", addedAt: day("2026-06-01")),
        ]
        let sessions = [
            RTSessionRecord(isbn: "A", mode: "flip", seconds: 96 * 60, endedAt: day("2026-06-24"), pauseCount: 0,
                            latitude: 40.7, longitude: -74.0, placeId: "ny", placeName: "뉴욕", country: "미국"),
            RTSessionRecord(isbn: "B", mode: "flip", seconds: 48 * 60, endedAt: day("2026-06-23"), pauseCount: 0,
                            latitude: 40.7, longitude: -74.0, placeId: "ny", placeName: "뉴욕", country: "미국"),
            RTSessionRecord(isbn: "A", mode: "flip", seconds: 36 * 60, endedAt: day("2026-06-06"), pauseCount: 0,
                            latitude: 35.7, longitude: 139.7, placeId: "tokyo", placeName: "도쿄", country: "일본"),
            // 위치 없는 세션 → 지도에서 제외
            RTSessionRecord(isbn: "A", mode: "manual", seconds: 10 * 60, endedAt: day("2026-06-01"), pauseCount: 0),
        ]
        let data = RTUserData(books: books, sessions: sessions)
        let ds = RTStats.live(data: data, now: day("2026-06-30"))

        #expect(ds.places.count == 2)
        let ny = ds.places.first { $0.id == "ny" }!
        #expect(ny.name == "뉴욕" && ny.lat == 40.7 && ny.lng == -74.0)
        #expect(ds.sessions.filter { $0.place != nil }.count == 3, "위치 없는 수동 10분은 지도 제외")

        // 엔진이 데모와 동일하게 소비되는지 (시안 뉴욕 장소 시트와 같은 구조)
        let sheet = RTStats.placeSheet(ds, place: ds.places.firstIndex { $0.id == "ny" }!)
        #expect(sheet.sub == "2권 · 2시간 24분 읽음")           // 96 + 48
        #expect(ds.books[sheet.rows[0].book].title == "파친코" && sheet.rows[0].value == "1:36"
                && sheet.rows[0].sub == "1회 읽음")

        // 6월 집계 — 파친코 = 뉴욕 96 + 도쿄 36 + 수동 10 (달력·랭킹은 위치 무관 전체)
        let mo = RTStats.month(ds, year: 2026, month: 6)
        let pachinko = mo.ranked.first { ds.books[$0.book].title == "파친코" }!
        #expect(RTStats.hm(pachinko.sec) == "2:22" && pachinko.days == 3)
    }

    @Test func placesEmptyWhenNoLocationRecorded() {
        let data = RTUserData(sessions: [
            RTSessionRecord(isbn: nil, mode: "flip", seconds: 600, endedAt: day("2026-06-01"), pauseCount: 0),
        ])
        #expect(RTStats.live(data: data, now: day("2026-06-30")).places.isEmpty)
    }
}

import Testing
import Foundation
@testable import RTViews

// 기록 원페이지 엔진 — 정본: design_handoff_record_onepage/README.md §데모 경로 8월 기대값(AC 9)
// + 실데이터 매핑(종이 세션 + 밀리 일별, 파트너는 종이만, 그 달 완독 필, 장소 대륙).
private func ymd(_ y: Int, _ m: Int, _ d: Int, hour: Int = 12) -> Date {
    Calendar(identifier: .gregorian).date(from: DateComponents(year: y, month: m, day: d, hour: hour))!
}

@MainActor
@Suite struct RTStatsEngineTests {
    let demo = RTStatsDemo.dataset

    // ── 데모 8월 (README §데모 경로 기대값 전부) ──

    @Test func demoAugustSummary() {
        let mo = RTStats.month(demo, year: 2026, month: 8)
        #expect(mo.isCurrent)
        #expect(RTAppModel.hmString(mo.totalSec) == "14:52")
        #expect(mo.readDays == 19)
        #expect(mo.denomDays == 27)
    }

    @Test func demoAugustCalendarMatchesHomeDemo() {
        let mo = RTStats.month(demo, year: 2026, month: 8)
        #expect(mo.cells.prefix(5).allSatisfy { $0 == nil }, "8/1(토) — 월요일 시작 오프셋 5")
        #expect(mo.cells.count == 5 + 31)
        // 8/17–27 = 홈 demoCal14 (0,0,34,52,41,63,28,12,47,39,46) — 오라클 공유
        let mins = (17...27).map { d in mo.cells[5 + d - 1]!.minutes }
        #expect(mins == [0, 0, 34, 52, 41, 63, 28, 12, 47, 39, 46])
        let today = mo.cells[5 + 26]!
        #expect(today.isToday && !today.isFuture && today.day == 27)
        #expect(mo.cells[5 + 27]!.isFuture)
        #expect(mo.cells[5 + 1]!.isSunday, "8/2 = 일요일")
    }

    @Test func demoAugustRanking() {
        let mo = RTStats.month(demo, year: 2026, month: 8)
        let top = mo.ranked.prefix(3).map { "\(demo.books[$0.book].title)|\($0.days)|\(RTStats.hm($0.sec))|\($0.done)" }
        #expect(top == ["몰입|7|4:58|false", "돈의 심리학|3|2:26|true", "사피엔스|4|2:15|false"])
        #expect(demo.books[mo.ranked[2].book].millie)
        #expect(mo.ranked.count == 12)                       // 그 외 9권 = 스트립 6 + "+3"
        let millie = Set(mo.ranked.filter { demo.books[$0.book].millie }.map { demo.books[$0.book].title })
        #expect(millie == ["도둑맞은 집중력", "미드나잇 라이브러리", "사피엔스", "불편한 편의점"])
        #expect(mo.ranked.filter(\.done).map { demo.books[$0.book].title } == ["돈의 심리학"])
    }

    @Test func demoMonthRangeAndPastMonth() {
        let r = RTStats.monthRange(demo)
        #expect(r.first == RTStatsYM(year: 2026, month: 5) && r.last == RTStatsYM(year: 2026, month: 8))
        let jul = RTStats.month(demo, year: 2026, month: 7)
        #expect(!jul.isCurrent && jul.denomDays == 31)
        #expect(jul.cells.prefix(2).allSatisfy { $0 == nil }, "7/1(수) — 오프셋 2")
        #expect(jul.cells.compactMap { $0 }.allSatisfy { !$0.isFuture && !$0.isToday })
        #expect(jul.ranked.filter(\.done).map { demo.books[$0.book].title } == ["파친코"])
        // 5월 시드니 출장 세션 고정 (오세아니아 핀)
        #expect(demo.sessions.contains { $0.month == 5 && $0.day == 20 && demo.places[$0.place!].name == "시드니" })
    }

    @Test func demoDaySheet() {
        let s = RTStats.daySheet(demo, year: 2026, month: 8, day: 22)
        #expect(s.title == "8월 22일 토요일")
        #expect(s.sub == "2권 · 1시간 3분 읽음")
        #expect(s.rows.map { "\(demo.books[$0.book].title)|\($0.value)|\($0.sub)|\($0.pin)" }
                == ["몰입|40분|서울|true", "사피엔스|23분|밀리에서 자동 기록|false"])
        #expect(RTStats.daySheet(demo, year: 2026, month: 8, day: 27).title == "8월 27일 목요일 · 오늘")
    }

    @Test func demoListAndPlaceSheets() {
        let l = RTStats.listSheet(demo, year: 2026, month: 8)
        #expect(l.title == "이달 읽은 책" && l.sub == "12권 · 14:52")
        #expect(l.rows.first?.rank == 1 && l.rows.first?.sub == "7일 읽음" && l.rows.first?.value == "4:58")
        #expect(RTStats.listSheet(demo, year: 2026, month: 7).title == "7월에 읽은 책")

        // 뉴욕 — 목업 DOM 실측(2026-09-02): "2권 · 1시간 11분 읽음", 1984 1회 0:51 / 노르웨이의 숲 1회 0:20
        let ny = demo.places.firstIndex { $0.name == "뉴욕" }!
        let p = RTStats.placeSheet(demo, place: ny)
        #expect(p.title == "뉴욕" && p.sub == "2권 · 1시간 11분 읽음")
        #expect(p.rows.map { "\(demo.books[$0.book].title)|\($0.sub)|\($0.value)" }
                == ["1984|1회 읽음|0:51", "노르웨이의 숲|1회 읽음|0:20"])
    }

    @Test func demoMapChipAndCardPins() {
        #expect(RTStats.chipText(demo) == "10개 도시 · 4개 대륙")
        let v = RTStats.cardView
        let pins = RTStats.clusters(demo) { p in
            let q = RTStats.proj(lat: p.lat, lng: p.lng)
            return CGPoint(x: q.x * v.s + v.tx, y: q.y * v.s + v.ty)
        }.filter { $0.x > -10 && $0.x < 346 && $0.y > 30 && $0.y < 160 }
        // 목업 DOM 실측(2026-09-02): 카드 핀은 "서울 외 2" 하나 — README 의 "도쿄" 는 카드 필터(x<346)
        // 밖(x≈356)이라 목업에 그려지지 않는다. 정본 = 목업.
        #expect(pins.map { "\($0.label)@\(Int($0.x)),\(Int($0.y))" } == ["서울 외 2@250,80"])
        #expect(pins[0].badge == 8)
        // 표지 = 클러스터 내 가장 많이 읽은 책 (최근 책 아님)
        #expect(demo.books[pins[0].cover].title == "몰입")
    }

    @Test func demoFullscreenPinsMatchMockup() {
        // 목업 DOM 실측: fitAll = translate(-96.18, 313.87) scale(.4795), 핀 5개 (앵커 좌표)
        let f = RTStats.fitAll(demo)
        #expect(abs(f.s - 0.479531) < 0.0005 && abs(f.tx + 96.182) < 0.05 && abs(f.ty - 313.866) < 0.05)
        let pins = RTStats.clusters(demo) { p in
            let q = RTStats.proj(lat: p.lat, lng: p.lng)
            return CGPoint(x: q.x * f.s + f.tx, y: q.y * f.s + f.ty)
        }
        #expect(pins.map { "\($0.label)@\(Int($0.x)),\(Int($0.y))" }
                == ["서울 외 4@313,384", "파리 외 1@147,369", "두바이@217,400", "뉴욕@45,380", "시드니@345,479"])
    }

    @Test func demoFitAllKeepsAllPinsInside() {
        let f = RTStats.fitAll(demo)
        for p in demo.places {
            let q = RTStats.proj(lat: p.lat, lng: p.lng)
            let x = q.x * f.s + f.tx, y = q.y * f.s + f.ty
            #expect(x >= 45 && x <= 345 && y >= 162 && y <= 682, "\(p.name) (\(x),\(y))")
        }
    }

    // ── 실데이터 매핑 ──

    private func book(_ isbn: String, _ title: String, finishedAt: Date? = nil) -> RTBook {
        RTBook(isbn: isbn, title: title, author: "a", publisher: "p", coverUrl: "https://c/\(isbn).jpg",
               addedAt: ymd(2026, 7, 1), finished: finishedAt != nil, finishedAt: finishedAt)
    }
    private func sess(_ isbn: String, _ y: Int, _ m: Int, _ d: Int, min: Int,
                      place: (id: String, name: String, lat: Double, lng: Double)? = nil) -> RTSessionRecord {
        RTSessionRecord(isbn: isbn, mode: "flip", seconds: min * 60, endedAt: ymd(y, m, d), pauseCount: 0,
                        latitude: place?.lat, longitude: place?.lng, placeId: place?.id, placeName: place?.name,
                        country: nil)
    }

    @Test func liveMergesPaperAndMillieAndMarksDoneInMonth() {
        let data = RTUserData(books: [book("A", "몰입"), book("B", "파친코", finishedAt: ymd(2026, 8, 20))],
                              sessions: [sess("A", 2026, 8, 3, min: 30), sess("A", 2026, 8, 5, min: 20),
                                         sess("B", 2026, 8, 5, min: 10), sess("B", 2026, 7, 30, min: 60)])
        let ds = RTStats.live(data: data, now: ymd(2026, 8, 27),
                              ebookDays: [ymd(2026, 8, 4), ymd(2026, 8, 5)],
                              ebookBreakdown: { d in
                                  Calendar(identifier: .gregorian).component(.day, from: d) == 4
                                      ? [("도둑맞은 집중력", 25 * 60)] : [("밀리의서재", 15 * 60)] },
                              ebookCover: { $0 == "도둑맞은 집중력" ? "https://m/1.jpg" : nil })
        let mo = RTStats.month(ds, year: 2026, month: 8)
        #expect(mo.readDays == 3 && RTAppModel.hmString(mo.totalSec) == "1:40")   // 30+20+10+25+15
        #expect(mo.cells[5 + 4]!.minutes == 45, "8/5 = 종이 30 + 밀리(다권 날) 15")
        let titles = mo.ranked.map { ds.books[$0.book].title }
        #expect(titles == ["몰입", "도둑맞은 집중력", "밀리의서재", "파친코"])
        #expect(ds.books.first { $0.title == "도둑맞은 집중력" }?.millie == true)
        #expect(ds.books.first { $0.title == "도둑맞은 집중력" }?.coverUrl == "https://m/1.jpg")
        #expect(ds.books.first { $0.title == "밀리의서재" }?.isbn == "", "귀속 불가 밀리 날은 탭 불가")
        #expect(mo.ranked.first { ds.books[$0.book].title == "파친코" }?.done == true)
        #expect(RTStats.month(ds, year: 2026, month: 7).ranked.first?.done == false, "완독 달이 아니면 필 없음")
        #expect(RTStats.monthRange(ds).first == RTStatsYM(year: 2026, month: 7))
    }

    @Test func liveAdoptedMillieBookCarriesLibraryIsbn() {
        var adopted = book("millie:4c17", "삼미")
        adopted.millieBookId = "4c17"
        let data = RTUserData(books: [adopted], sessions: [])
        let ds = RTStats.live(data: data, now: ymd(2026, 8, 27), ebookDays: [ymd(2026, 8, 10)],
                              ebookBreakdown: { _ in [("삼미", 600)] })
        let b = ds.books.first { $0.title == "삼미" }
        #expect(b?.millie == true && b?.isbn == "millie:4c17", "편입 책은 탭 → 08 가능")
    }

    @Test func livePlacesAndContinents() {
        let seoul = (id: "KR:서울특별시:성수동", name: "성수동", lat: 37.54, lng: 127.05)
        let tokyo = (id: "JP:도쿄", name: "도쿄", lat: 35.7, lng: 139.7)
        let grid = (id: "48.856,2.352", name: "48.856,2.352", lat: 48.856, lng: 2.352)   // 역지오코딩 실패 폴백
        let data = RTUserData(books: [book("A", "몰입")],
                              sessions: [sess("A", 2026, 8, 1, min: 30, place: seoul),
                                         sess("A", 2026, 8, 2, min: 20, place: tokyo),
                                         sess("A", 2026, 8, 3, min: 10, place: grid),
                                         sess("A", 2026, 8, 4, min: 10)])                 // 위치 없음
        let ds = RTStats.live(data: data, now: ymd(2026, 8, 27))
        #expect(ds.places.map(\.name) == ["성수동", "도쿄", "48.856,2.352"])
        #expect(ds.places.map(\.continent) == ["아시아", "아시아", nil])
        #expect(RTStats.chipText(ds) == "3개 도시 · 1개 대륙")
        #expect(ds.sessions.filter { $0.place == nil }.count == 1)
        #expect(RTStats.chipText(RTStats.live(data: RTUserData(), now: ymd(2026, 8, 27))) == nil)
    }

    @Test func emptyMonthAndNoRecordsRange() {
        let empty = RTStats.live(data: RTUserData(), now: ymd(2026, 8, 27))
        let r = RTStats.monthRange(empty)
        #expect(r.first == r.last && r.last == RTStatsYM(year: 2026, month: 8), "기록 없으면 현재 달만")
        let mo = RTStats.month(empty, year: 2026, month: 8)
        #expect(mo.ranked.isEmpty && mo.readDays == 0 && mo.denomDays == 27)
        #expect(RTStats.listSheet(empty, year: 2026, month: 8).sub == "0권 · 0:00")
    }

    @Test func korMinFormatting() {
        #expect(RTStats.korMin(63) == "1시간 3분")
        #expect(RTStats.korMin(45) == "45분")
        #expect(RTStats.korMin(120) == "2시간")
    }

    @Test func fixedSixRowsPadsToFortyTwo() {
        #expect(RTStats.month(demo, year: 2026, month: 8, fixedSixRows: true).cells.count == 42)
        #expect(RTStats.month(demo, year: 2026, month: 6, fixedSixRows: true).cells.count == 42)   // 6월 = 5행 달
        #expect(RTStats.month(demo, year: 2026, month: 6).cells.count == 30)
    }
}

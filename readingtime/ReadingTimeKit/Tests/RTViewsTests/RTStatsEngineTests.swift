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

    // 5~7월은 목업 gen(seed) 시드 생성 — 이식한 mulberry32/gen 이 비트 동일한지 목업 DOM 실측값(2026-09-02)으로 고정
    @Test func demoGeneratedMonthsMatchMockupDOM() {
        func top3(_ mo: RTStats.Month) -> [String] {
            mo.ranked.prefix(3).map { "\(demo.books[$0.book].title)|\($0.done ? "완독" : "")|\($0.days)일|\(RTStats.hm($0.sec))" }
        }
        let jul = RTStats.month(demo, year: 2026, month: 7)
        #expect(RTStats.hm(jul.totalSec) == "13:18" && jul.readDays == 14 && jul.denomDays == 31)
        #expect(top3(jul) == ["작별하지 않는다||5일|4:40", "파친코|완독|6일|4:39", "1984||4일|2:35"])
        #expect(jul.ranked.count == 4, "그 외 1권")

        let jun = RTStats.month(demo, year: 2026, month: 6)
        #expect(RTStats.hm(jun.totalSec) == "2:54" && jun.readDays == 7 && jun.denomDays == 30)
        #expect(top3(jun) == ["1984||4일|1:49", "노르웨이의 숲||3일|0:49", "도둑맞은 집중력||1일|0:16"])
        #expect(jun.ranked.count == 3, "스트립 없음")

        let may = RTStats.month(demo, year: 2026, month: 5)
        #expect(RTStats.hm(may.totalSec) == "17:49" && may.readDays == 21 && may.denomDays == 31)
        #expect(top3(may) == ["도둑맞은 집중력||7일|5:34", "페스트|완독|6일|3:53", "돈의 심리학||6일|3:30"])
        #expect(may.ranked.count == 5, "그 외 2권")
    }

    // 사용자 결정 2026-09-02: 현재 달의 '많이 읽은 책'은 이달이 아니라 **최근 4주(오늘 포함 28일)** 기준.
    // 월초에 목록이 비는 문제. 과거 달은 그 달 기준 유지. 기대값은 세션을 직접 합산해(엔진 경로와 별개) 만든다.
    @Test func recentFourWeeksRankingForCurrentMonth() {
        let r = RTStats.recentRanked(demo, days: 28)
        var expect: [Int: (sec: Int, days: Set<Int>)] = [:]
        for s in demo.sessions where (s.month == 8) || (s.month == 7 && s.day == 31) {
            expect[s.book, default: (0, [])].sec += s.sec
            expect[s.book]!.days.insert(s.month * 100 + s.day)
        }
        let want = expect.keys.sorted().sorted { expect[$0]!.sec != expect[$1]!.sec ? expect[$0]!.sec > expect[$1]!.sec : $0 < $1 }
        // 목업 DOM 실측(2026-09-02, 4주 규칙 반영 후): 몰입 8일 5:22 / 돈의 심리학 완독 3일 2:26 / 사피엔스 밀리 4일 2:15 · 그 외 9권
        #expect(r.ranked.prefix(3).map { "\(demo.books[$0.book].title)|\($0.days)|\(RTStats.hm($0.sec))|\($0.done)" }
                == ["몰입|8|5:22|false", "돈의 심리학|3|2:26|true", "사피엔스|4|2:15|false"])
        #expect(r.ranked.count == 12)
        #expect(r.ranked.map(\.book) == want)
        #expect(r.ranked.map(\.sec) == want.map { expect[$0]!.sec })
        #expect(r.ranked.map(\.days) == want.map { expect[$0]!.days.count })
        // 8월 1일보다 앞선 7/31 세션이 실제로 포함되는지 (창이 달 경계를 넘는다는 증거)
        #expect(demo.sessions.contains { $0.month == 7 && $0.day == 31 }, "데모 7/31 세션 존재 전제")
        #expect(r.totalSec == demo.sessions.filter { $0.month == 8 || ($0.month == 7 && $0.day == 31) }.reduce(0) { $0 + $1.sec })
        // 완독 필 = 표시 중인 달(현재 달)에 완독한 책만 (README §4-1) — 8월 완독 돈의 심리학 O, 7월 완독 파친코 X
        #expect(r.ranked.first { $0.book == 1 }?.done == true)
        #expect(r.ranked.first { $0.book == 4 }?.done != true)
    }

    @Test func recentWindowStartsWhenTodayIsEarlyInMonth() {
        // 9/2 가 오늘이면 창 = 8/6 ~ 9/2 (28일)
        var ds = RTStatsDemo.dataset
        ds.today = (2026, 9, 2)
        let r = RTStats.recentRanked(ds, days: 28)
        #expect(r.start.month == 8 && r.start.day == 6 && r.end.month == 9 && r.end.day == 2)
        #expect(r.ranked.allSatisfy { _ in true })
        #expect(r.totalSec == ds.sessions.filter { $0.month == 8 && $0.day >= 6 }.reduce(0) { $0 + $1.sec })
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
        // 현재 달의 list 시트 = 최근 4주 창(07-31~08-27) — 기대값은 세션 직접 합산
        let l = RTStats.listSheet(demo, year: 2026, month: 8)
        let win = demo.sessions.filter { $0.month == 8 || ($0.month == 7 && $0.day == 31) }
        var per: [Int: Int] = [:]; for s in win { per[s.book, default: 0] += s.sec }
        let top = per.keys.sorted().sorted { per[$0]! != per[$1]! ? per[$0]! > per[$1]! : $0 < $1 }.first!
        #expect(l.title == "최근 4주 읽은 책" && l.sub == "\(per.count)권 · \(RTStats.hm(win.reduce(0) { $0 + $1.sec }))")
        #expect(l.rows.first?.rank == 1 && l.rows.first?.book == top && l.rows.first?.value == RTStats.hm(per[top]!))
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

    // 실기기 실측 2026-09-02: 역지오코딩 실패로 좌표 키("37.556,126.929")가 된 세션이 30m 옆 서교동과
    // 별개 장소가 돼 "서교동 외 1" 클러스터를 만들었고, 어느 배율에서도 안 갈라져 시트가 영영 안 열렸다.
    @Test func livePlacesMergeWithin120m() {
        let named = (id: "KR:서울특별시:서교동", name: "서교동", lat: 37.5558, lng: 126.9290)
        let grid = (id: "37.556,126.929", name: "37.556,126.929", lat: 37.556, lng: 126.929)   // 약 30m
        let far = (id: "KR:인천광역시:귤현동", name: "귤현동", lat: 37.5717, lng: 126.7378)      // 17km
        let data = RTUserData(books: [book("A", "몰입")], sessions: [
            sess("A", 2026, 7, 29, min: 62, place: grid),        // 좌표 키가 먼저 와도
            sess("A", 2026, 7, 28, min: 71, place: named),
            sess("A", 2026, 8, 6, min: 41, place: far),
        ])
        let ds = RTStats.live(data: data, now: ymd(2026, 9, 2))
        #expect(ds.places.map(\.name) == ["서교동", "귤현동"], "30m 옆 좌표 키 장소는 이름 있는 장소로 병합")
        let seo = ds.places.firstIndex { $0.name == "서교동" }!
        #expect(ds.sessions.filter { $0.place == seo }.count == 2)
        #expect(RTStats.chipText(ds) == "2개 도시 · 1개 대륙")
    }

    @Test func placeSheetAggregatesClusterMembers() {
        // 서로 200m 떨어진 두 장소(병합 대상 아님)가 한 핀으로 묶였을 때 — 시트는 두 장소를 합쳐 보여준다
        let a = (id: "KR:서울특별시:성수동", name: "성수동", lat: 37.5440, lng: 127.0560)
        let b = (id: "KR:서울특별시:성수동:카페", name: "성수동 카페", lat: 37.5458, lng: 127.0560)
        let data = RTUserData(books: [book("A", "몰입"), book("B", "파친코")], sessions: [
            sess("A", 2026, 8, 1, min: 30, place: a), sess("A", 2026, 8, 2, min: 20, place: b),
            sess("B", 2026, 8, 3, min: 10, place: b),
        ])
        let ds = RTStats.live(data: data, now: ymd(2026, 9, 2))
        #expect(ds.places.count == 2)
        let sheet = RTStats.placeSheet(ds, places: [0, 1])
        #expect(sheet.title == "성수동 외 1" && sheet.sub == "2권 · 1시간 읽음")
        #expect(sheet.rows.map { "\(ds.books[$0.book].title)|\($0.sub)|\($0.value)" } == ["몰입|2회 읽음|0:50", "파친코|1회 읽음|0:10"])
        #expect(RTStats.placeSheet(ds, places: [0]).title == "성수동", "단일은 기존 그대로")
        // 갈라질 수 없는 클러스터 판정 — 구성원 최대 거리 250m 미만
        #expect(RTStats.spanMeters(ds, places: [0, 1]) < 250)
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

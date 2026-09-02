import Testing
import Foundation
@testable import RTViews

// 지도 실데이터 정본화 (사용자 결정 2026-07-15):
//  ① 실기기(userData 있음)는 위치 세션이 없어도 시안 데모로 폴백하지 않는다
//     — 위치 없는 책은 지도에 아예 안 뜨는 게 정상. 데모는 rtshot/rtapp(userData nil) 전용.
//  ② 기본 카메라(카드) = 가장 최근 위치 세션의 좌표(동네 프레이밍) — latestReadCoord 가 그 좌표 정본.
//  ③ 기존 세션 백필 — seedLoc 액션이 위치 없는 세션에만 위치를 일괄 부여 (실기기 1회 실행용).
//  ④ 위치 캡처 — 앱 셸이 locationProvider 훅을 배선하면 저장 시 세션에 위치가 부착된다.
//  ⑤ 책 탭 — 서재 ISBN 이 있는 책만 08 로 push, 귀속 불가 밀리는 무시, 데모는 08 데모.

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

private let p1 = (lat: 37.54, lng: 127.05)

@MainActor
@Suite struct RTMapLiveDataTests {

    private func book(_ isbn: String, _ title: String) -> RTBook {
        RTBook(isbn: isbn, title: title, author: "", publisher: "", coverUrl: "", addedAt: day("2026-07-01"))
    }
    private func located(_ isbn: String, _ ended: String, lat: Double = p1.lat, lng: Double = p1.lng,
                         pid: String = "KR:서울특별시:성수동", name: String = "성수동") -> RTSessionRecord {
        RTSessionRecord(isbn: isbn, mode: "flip", seconds: 600, endedAt: day(ended), pauseCount: 0,
                        latitude: lat, longitude: lng, placeId: pid, placeName: name, country: "대한민국")
    }

    // ① 실데이터 모드는 위치 세션이 없어도 데모 폴백 없음
    @Test func liveDatasetNeverFallsBackToDemo() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")],
                                sessions: [.init(isbn: "A", mode: "flip", seconds: 600,
                                                 endedAt: day("2026-07-10"), pauseCount: 0)])
        #expect(m.statsDataset.places.isEmpty)          // 데모 10개 도시가 아니라 빈 지도
        #expect(RTStats.chipText(m.statsDataset) == nil)  // 칩 숨김
    }

    // ① 데모 모드(userData nil)는 시안 데모 유지 (rtshot/rtapp 픽셀 오라클 불변)
    @Test func demoDatasetKeepsMockPlaces() {
        let m = RTAppModel()
        #expect(m.statsDataset.places.count == 10)
        #expect(RTStats.chipText(m.statsDataset) == "10개 도시 · 4개 대륙")
    }

    // ② 가장 최근 위치 세션의 좌표 — 위치 없는 더 최신 세션은 건너뛴다
    @Test func latestReadCoordPicksMostRecentLocatedSession() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [
            located("A", "2026-07-08", lat: 35.7, lng: 139.7, pid: "JP:도쿄", name: "도쿄"),
            located("A", "2026-07-10"),                                       // 최신 위치 세션 = 성수동
            .init(isbn: "A", mode: "manual", seconds: 300, endedAt: day("2026-07-12"), pauseCount: 0),
        ])
        let c = m.latestReadCoord
        #expect(c?.lat == p1.lat && c?.lng == p1.lng)
    }

    @Test func latestReadCoordNilWithoutLocatedSessions() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")],
                                sessions: [.init(isbn: "A", mode: "flip", seconds: 600,
                                                 endedAt: day("2026-07-10"), pauseCount: 0)])
        #expect(m.latestReadCoord == nil)
        #expect(RTAppModel().latestReadCoord == nil)   // 데모 모드도 nil (카드는 전체 핀 프레이밍)
    }

    // ③ seedLoc 백필 — 위치 없는 세션에만 부여, 있는 세션은 유지, 영속 훅 발화
    @Test func seedLocBackfillsOnlyLocationlessSessions() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [
            .init(isbn: "A", mode: "flip", seconds: 600, endedAt: day("2026-07-01"), pauseCount: 0),
            located("A", "2026-07-05", lat: 35.7, lng: 139.7, pid: "JP:도쿄", name: "도쿄"),
        ])
        var persisted: RTUserData?
        m.onUserDataChange = { persisted = $0 }

        m.apply("seedLoc:37.54|127.05|KR:서울특별시:성수동|성수동|대한민국")

        let s = m.userData!.sessions
        #expect(s[0].latitude == 37.54 && s[0].longitude == 127.05)
        #expect(s[0].placeId == "KR:서울특별시:성수동" && s[0].placeName == "성수동" && s[0].country == "대한민국")
        #expect(s[1].placeId == "JP:도쿄" && s[1].latitude == 35.7)      // 기존 위치 불변
        #expect(persisted != nil)                                        // UserDefaults 영속 경로 발화
    }

    // ④ 세션 저장 시 locationProvider 의 위치가 세션에 부착
    @Test func saveSessionAttachesProviderLocation() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [])
        m.locationProvider = {
            RTPlaceFix(latitude: p1.lat, longitude: p1.lng,
                       placeId: "KR:서울특별시:성수동", placeName: "성수동", country: "대한민국")
        }
        m.start(isbn: "A")
        m.simFlip()
        m.saveSession()

        let rec = m.userData!.sessions.last!
        #expect(rec.latitude == p1.lat && rec.longitude == p1.lng)
        #expect(rec.placeId == "KR:서울특별시:성수동" && rec.placeName == "성수동" && rec.country == "대한민국")
    }

    // ④ 시간 직접 추가도 동일 부착. provider 없으면(미배선) 위치 없음 그대로
    @Test func addTimeAttachesProviderLocation() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [])
        m.addTime()                                    // provider 미배선
        #expect(m.userData!.sessions.last!.latitude == nil)

        m.locationProvider = {
            RTPlaceFix(latitude: p1.lat, longitude: p1.lng,
                       placeId: "KR:서울특별시:성수동", placeName: "성수동", country: "대한민국")
        }
        m.addTime()
        #expect(m.userData!.sessions.last!.placeName == "성수동")
    }

    // §14 실표지 — 실데이터 책의 coverUrl 이 지도 핀(표지·스택)까지 관통한다 (데모는 "" → 색면 플레이스홀더)
    @Test func liveCoverUrlThreadsThroughPins() {
        var b1 = book("A", "몰입"); b1.coverUrl = "https://cdn/a.jpg"
        var b2 = book("B", "파친코"); b2.coverUrl = "https://cdn/b.jpg"
        let m = RTAppModel()
        m.userData = RTUserData(books: [b1, b2], sessions: [
            located("A", "2026-07-10"),
            located("A", "2026-07-11"),                     // 몰입 20분 = 가장 많이 읽은 책 → 표지
            located("B", "2026-07-08"),
        ])
        let ds = m.statsDataset
        let pin = RTStats.clusters(ds) { _ in .zero }[0]
        #expect(ds.books[pin.cover].coverUrl == "https://cdn/a.jpg")
        #expect(pin.badge == 2 && ds.books[pin.stack[0]].coverUrl == "https://cdn/b.jpg")
    }

    @Test func demoPinsHaveNoCoverUrl() {
        let ds = RTStatsDemo.dataset
        let f = RTStats.fitAll(ds)
        let pins = RTStats.clusters(ds) { p in
            let q = RTStats.proj(lat: p.lat, lng: p.lng)
            return CGPoint(x: q.x * f.s + f.tx, y: q.y * f.s + f.ty)
        }
        #expect(pins.allSatisfy { ds.books[$0.cover].coverUrl.isEmpty })
    }

    // ⑤ 책 탭 → 책상세 페이지(08) 이동 — 서재 ISBN 보존, 시트 닫힘, 뒤로가기 = 기록 복귀
    @Test func tapBookNavigatesToDetailForLiveData() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [located("A", "2026-07-10")])
        m.now = { day("2026-07-15") }
        m.login(); m.nav(.stats)
        m.statsTapDay(10)
        #expect(m.statsSheet == .day(10))
        let idx = m.statsDataset.books.firstIndex { $0.title == "몰입" }!
        m.statsTapBook(idx)
        #expect(m.route == .detail)
        #expect(m.selectedISBN == "A")
        #expect(m.statsSheet == nil)
        #expect(m.detailOrigin == .stats)
    }

    // ⑤ 귀속 불가 밀리("밀리의서재", isbn "") 는 탭 무시 — 시트만 닫힘
    @Test func tapUnresolvedMillieIsIgnored() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [])
        m.ebookDaily = ["2026-07-10": 1800]
        m.ebookBooks = ["2026-07-10": ["책1", "책2"]]      // 2권 → 귀속 불가
        m.now = { day("2026-07-15") }
        m.login(); m.nav(.stats)
        m.statsOpenList()
        let idx = m.statsDataset.books.firstIndex { $0.title == "밀리의서재" }!
        m.statsTapBook(idx)
        #expect(m.route == .stats && m.statsSheet == nil)
    }

    // 파트너 통계에서 책 탭 — 파트너 책은 partnerSelectedBook 으로 풀린다 (statsSubject 유지)
    @Test func tapPartnerBookKeepsPartnerSubject() {
        let m = RTAppModel()
        m.userData = RTUserData()
        m.partnerData = RTUserData(books: [book("P1", "차남들의 세계사")], sessions: [located("P1", "2026-07-10")])
        m.now = { day("2026-07-15") }
        m.login()
        m.openPartnerStats()
        m.statsTapBook(0)
        #expect(m.route == .detail && m.statsSubject == .partner)
        #expect(m.partnerSelectedBook?.title == "차남들의 세계사")
    }

    // 칩 — 실데이터 집계 "N개 도시 · N개 대륙" (KR·JP 모두 아시아 → 1개 대륙)
    @Test func chipAggregatesLivePlaces() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [
            located("A", "2026-07-05"),
            located("A", "2026-07-08", lat: 35.7, lng: 139.7, pid: "JP:도쿄", name: "도쿄"),
        ])
        #expect(RTStats.chipText(m.statsDataset) == "2개 도시 · 1개 대륙")
    }
}

import Testing
import Foundation
@testable import RTViews

// 지도 실데이터 정본화 (사용자 결정 2026-07-15):
//  ① 실기기(userData 있음)는 위치 세션이 없어도 시안 데모(§12 13개 도시)로 폴백하지 않는다
//     — 위치 없는 책은 지도에 아예 안 뜨는 게 정상. 데모는 rtshot/rtapp(userData nil) 전용.
//  ② 기본 카메라 = 가장 최근 위치 세션의 좌표(동네 프레이밍) — latestReadCoord 가 그 좌표 정본.
//  ③ 기존 세션 백필 — seedLoc 액션이 위치 없는 세션에만 위치를 일괄 부여 (실기기 1회 실행용).
//  ④ 위치 캡처 — 앱 셸이 locationProvider 훅을 배선하면 저장 시 세션에 위치가 부착된다.

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
    @Test func liveRecordDataNeverFallsBackToDemo() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")],
                                sessions: [.init(isbn: "A", mode: "flip", seconds: 600,
                                                 endedAt: day("2026-07-10"), pauseCount: 0)])
        #expect(m.recordData.places.isEmpty)          // 데모 13개 도시가 아니라 빈 지도
    }

    // ① 데모 모드(userData nil)는 시안 데모 유지 (rtshot/rtapp 픽셀 오라클 불변)
    @Test func demoRecordDataKeepsMockPlaces() {
        let m = RTAppModel()
        #expect(m.recordData.places.count == 13)
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
        #expect(RTAppModel().latestReadCoord == nil)   // 데모 모드도 nil (데모는 뷰가 전체 뷰)
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

    // §14 실표지 — 실데이터 책의 coverUrl 이 지도 핀(마커)·장소 시트·책 상세까지 관통한다
    // (데모는 "" → 기존 색+제목 플레이스홀더 경로 불변)
    @Test func liveCoverUrlThreadsThroughMarkerSheetAndDetail() {
        var b1 = book("A", "몰입"); b1.coverUrl = "https://cdn/a.jpg"
        var b2 = book("B", "파친코"); b2.coverUrl = "https://cdn/b.jpg"
        let data = RTUserData(books: [b1, b2], sessions: [
            located("A", "2026-07-10"),                     // 최신 → 대표 표지
            located("B", "2026-07-08"),
        ])
        let (places, books) = RTRecord.live(from: data)
        // 책 인덱스는 세션 시간 오름차순 첫 등장 순 → 파친코(07-08)가 0, 몰입(07-10)이 1
        #expect(books.map(\.coverUrl) == ["https://cdn/b.jpg", "https://cdn/a.jpg"])

        let m = RTRecord.clusters({ _ in .zero }, places: places, books: books)[0]
        #expect(m.coverUrl == "https://cdn/a.jpg")          // 대표(최신) = 몰입
        #expect(m.s1Url == "https://cdn/b.jpg")             // 스택 2번째 = 파친코

        let sheet = RTRecord.buildSheet(["KR:서울특별시:성수동"], places: places, books: books)
        #expect(Set(sheet.covers.map(\.coverUrl)) == ["https://cdn/a.jpg", "https://cdn/b.jpg"])

        let moip = books.firstIndex { $0.title == "몰입" }!
        let detail = RTRecord.buildBook(moip, places: places, books: books)
        #expect(detail.coverUrl == "https://cdn/a.jpg")
    }

    // 데모 마커는 coverUrl "" (플레이스홀더 경로 — rtshot 픽셀 오라클 불변)
    @Test func demoMarkersHaveNoCoverUrl() {
        let v = RTRecord.defaultView
        let ms = RTRecord.markers(scale: v.scale, tx: v.tx, ty: v.ty)
        #expect(ms.allSatisfy { $0.coverUrl.isEmpty && $0.s1Url == nil && $0.s2Url == nil })
    }

    // §14 실책 ISBN — live() 가 지도 책에 서재 ISBN 을 보존해 책상세 페이지 진입을 가능케 한다
    @Test func liveBooksCarryIsbn() {
        let (_, books) = RTRecord.live(from: RTUserData(
            books: [book("A", "몰입")], sessions: [located("A", "2026-07-10")]))
        #expect(books.first?.isbn == "A")
    }

    // 지도 책 선택 → 책상세 페이지(08) 이동 (사용자 요구 2026-07-15: §7 바텀시트 아님)
    @Test func openMapBookNavigatesToDetailPageForLiveData() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [located("A", "2026-07-10")])
        m.nav(.statsMap)
        let idx = m.recordData.books.firstIndex { $0.title == "몰입" }!
        m.openMapBook(idx)
        #expect(m.route == .detail)
        #expect(m.selectedISBN == "A")
        #expect(m.recordBook == nil)          // §7 기록 시트 안 열림
        #expect(m.placeSheet == nil)
        #expect(m.detailOrigin == .statsMap)  // 뒤로가기 = 지도 복귀
    }

    // 장소 시트에서 책 선택 → 지도 오버레이 닫고 책상세 페이지로 (책상세 위로 시트 안 겹침)
    @Test func openMapBookFromPlaceSheetClosesOverlaysAndNavigates() {
        let m = RTAppModel()
        m.userData = RTUserData(
            books: [book("A", "몰입"), book("B", "파친코")],
            sessions: [located("A", "2026-07-10"), located("B", "2026-07-09")])   // 둘 다 성수동
        m.nav(.statsMap)
        m.openPlaceSheet(["KR:서울특별시:성수동"])
        let idx = m.recordData.books.firstIndex { $0.title == "파친코" }!
        m.openMapBook(idx)
        #expect(m.placeSheet == nil)
        #expect(m.route == .detail)
        #expect(m.selectedISBN == "B")
    }

    // 지도는 항상 내 데이터 → 파트너 잔존 subject 리셋 (Screen08Detail 이 내 책을 렌더)
    @Test func openMapBookResetsToOwnSubject() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [located("A", "2026-07-10")])
        m.partnerData = RTUserData()
        m.statsSubject = .partner
        m.nav(.statsMap)
        m.openMapBook(0)
        #expect(m.statsSubject == .me)
    }

    // 데모(userData nil)는 §7 기록 시트 폴백 유지 (rtshot/rtapp oracle 경로 불변)
    @Test func openMapBookDemoFallsBackToRecordSheet() {
        let m = RTAppModel()   // userData nil = 데모
        m.nav(.statsMap)
        m.openMapBook(8)       // 노르웨이의 숲 (데모)
        #expect(m.recordBook == 8)
        #expect(m.route == .statsMap)   // 페이지 이동 없음 (바텀시트 유지)
    }

    // 통계 칩 — 실데이터는 "N곳" 집계(§5.5 "실제앱은 집계값"), 0곳이면 숨김(nil), 데모는 시안 상수
    @Test func mapChipTextAggregatesLivePlaces() {
        let m = RTAppModel()
        m.userData = RTUserData(books: [book("A", "몰입")], sessions: [
            located("A", "2026-07-05"),
            located("A", "2026-07-08", lat: 35.7, lng: 139.7, pid: "JP:도쿄", name: "도쿄"),
        ])
        #expect(m.mapChipText == "2곳")

        m.userData = RTUserData()
        #expect(m.mapChipText == nil)                  // 빈 지도 → 칩 숨김

        #expect(RTAppModel().mapChipText == RTRecordDemo.mapChip)   // 데모 모드 = 시안 상수
    }
}

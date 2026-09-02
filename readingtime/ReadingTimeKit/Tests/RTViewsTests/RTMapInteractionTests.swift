import Testing
import Foundation
@testable import RTViews

// 기록 원페이지 상호작용 — 모델 레벨 (README §Interactions / §State Management).
// 카메라(팬·줌·클러스터 확대)는 MapKit(RTMapFullscreen)이 소유 — 실기기 화면 검증으로 확인.

@MainActor
@Suite struct RTMapInteractionTests {

    private func statsModel() -> RTAppModel {
        let m = RTAppModel()       // userData nil = 데모 (오늘 2026-08-27, 달 범위 5~8월)
        m.login()
        m.nav(.stats)
        return m
    }

    @Test func initialState() {
        let m = statsModel()
        #expect(m.route == .stats)
        #expect(m.statsSheet == nil && !m.mapFullscreen)
        #expect(m.statsDisplayedMonth == RTStatsYM(year: 2026, month: 8))
    }

    // ‹ › 는 첫 기록 달(5월) … 현재 달(8월) 안에서만. 현재 달에 닿으면 nil(=현재)
    @Test func monthNavigationBounds() {
        let m = statsModel()
        m.statsNext()
        #expect(m.statsMonth == nil, "현재 달에서 › 무시")
        m.statsPrev(); m.statsPrev(); m.statsPrev()
        #expect(m.statsDisplayedMonth == RTStatsYM(year: 2026, month: 5))
        m.statsPrev()
        #expect(m.statsDisplayedMonth == RTStatsYM(year: 2026, month: 5), "첫 기록 달에서 ‹ 무시")
        m.statsNext(); m.statsNext(); m.statsNext()
        #expect(m.statsMonth == nil, "현재 달 복귀 = nil")
        m.statsPrev()
        m.statsThisMonth()
        #expect(m.statsMonth == nil)
    }

    // 월 전환 시 열린 시트는 닫힌다
    @Test func monthChangeClosesSheet() {
        let m = statsModel()
        m.statsOpenList()
        #expect(m.statsSheet == .list)
        m.statsPrev()
        #expect(m.statsSheet == nil)
        m.statsOpenList()
        m.statsThisMonth()
        #expect(m.statsSheet == nil)
    }

    // 날짜 탭 — 읽은 날만 day 시트, 미래·미기록 무시
    @Test func dayTapOnlyForReadDays() {
        let m = statsModel()
        m.statsTapDay(22)
        #expect(m.statsSheet == .day(22))
        m.statsCloseSheet()
        m.statsTapDay(28)                       // 미래
        #expect(m.statsSheet == nil)
        m.statsTapDay(2)                        // 8/2 미기록
        #expect(m.statsSheet == nil)
    }

    @Test func placeTapOpensPlaceSheetAndDataResolves() {
        let m = statsModel()
        m.openMapFullscreen()
        m.statsTapPlace("뉴욕")
        #expect(m.statsSheet == .place("뉴욕"))
        #expect(m.statsSheetData?.title == "뉴욕")
        m.statsTapPlace("없는 곳")
        #expect(m.statsSheetData == nil, "모르는 장소 id 는 시트 데이터 없음")
    }

    // 갈라지지 않는 클러스터(실기기 실측 2026-09-02) — 구성원 전체를 합친 place 시트
    @Test func clusterTapOpensAggregatedSheet() {
        let m = statsModel()
        m.openMapFullscreen()
        m.statsTapPlaces(["서울", "제주"])
        #expect(m.statsSheet == .cluster(["서울", "제주"]))
        let data = m.statsSheetData
        #expect(data?.kind == .place && data?.title == "서울 외 1")
        m.statsTapPlaces(["서울"])
        #expect(m.statsSheet == .place("서울"), "1곳이면 단일 시트")
        m.statsTapPlaces(["없는 곳"])
        #expect(m.statsSheetData == nil)
    }

    // 전체 화면 지도 닫기 → 시트도 닫힘. 08 로 갔다 뒤로 오면 지도는 그대로(README: 지도로 복귀)
    @Test func mapFullscreenLifecycle() {
        let m = statsModel()
        m.openMapFullscreen()
        m.statsTapPlace("뉴욕")
        m.closeMapFullscreen()
        #expect(!m.mapFullscreen && m.statsSheet == nil)

        m.openMapFullscreen()
        m.statsTapPlace("뉴욕")
        m.statsTapBook(6)                        // 1984 (데모 → 08 데모 화면)
        #expect(m.route == .detail && m.statsSheet == nil)
        #expect(m.mapFullscreen, "상세로 push 해도 지도 상태 유지")
        m.nav(m.detailOrigin)                    // 뒤로
        #expect(m.route == .stats && m.mapFullscreen, "뒤로 = 지도로 복귀")
    }

    // 홈에서 다시 진입하면 현재 달·시트·지도 초기화
    @Test func reenteringStatsResetsState() {
        let m = statsModel()
        m.statsPrev()
        m.openMapFullscreen()
        m.nav(.home)
        m.nav(.stats)
        #expect(m.statsMonth == nil && m.statsSheet == nil && !m.mapFullscreen)
    }

    // 뒤로가기 목적지 — 기록 원페이지에서 열린 상세는 기록으로 복귀
    @Test func detailFromStatsReturnsToStats() {
        let m = statsModel()
        m.statsTapBook(0)
        #expect(m.route == .detail && m.detailOrigin == .stats)
    }

    // rtshot --seq 액션 배선
    @Test func seqActionsDriveStats() {
        let m = RTAppModel()
        for a in ["login", "nav:10", "statsPrev", "statsDay:5"] { m.apply(a) }
        #expect(m.route == .stats && m.statsDisplayedMonth == RTStatsYM(year: 2026, month: 7))
        // 7/5 기록 여부는 데이터셋에서 직접 판정 (항상 참인 단언 금지)
        let read5 = RTStatsDemo.dataset.sessions.contains { $0.year == 2026 && $0.month == 7 && $0.day == 5 }
        #expect(m.statsSheet == (read5 ? .day(5) : nil))
        m.apply("statsThisMonth"); m.apply("statsMap"); m.apply("statsPlace:뉴욕")
        #expect(m.mapFullscreen && m.statsSheet == .place("뉴욕"))
    }
}

import Testing
import Foundation
@testable import RTViews

// 지도 상호작용 (§5.2 팬/줌 · §5.6 탭 분기) — 목업 Component 의 onMarkerTap/zoomAround/setTab 정합.

@MainActor
@Suite struct RTMapInteractionTests {

    private func mapModel() -> RTAppModel {
        let m = RTAppModel()
        m.login()
        m.nav(.statsMap)
        return m
    }
    private func marker(_ m: RTAppModel, label: String) -> RTRecord.Marker {
        RTRecord.markers(scale: m.mapScale, tx: m.mapTx, ty: m.mapTy).first { $0.label == label }!
    }

    @Test func initialViewIsDefault() {
        let m = mapModel()
        #expect(m.route == .statsMap)
        #expect(m.mapScale == 0.46 && m.mapTx == -88 && m.mapTy == 258)
        #expect(m.placeSheet == nil && m.recordBook == nil)
    }

    // §5.6-2/4: 단일 마커 + distinct 1권 → 책 상세 직행
    @Test func tapSinglePlaceOneBookOpensBookDetail() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "시드니"))
        #expect(m.recordBook == 8)          // 노르웨이의 숲
        #expect(m.placeSheet == nil)
    }

    // §5.6-2/4: 단일 마커 + distinct 2권 → 장소 시트
    @Test func tapSinglePlaceMultiBookOpensSheet() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "뉴욕"))
        #expect(m.placeSheet == ["ny"])
        #expect(m.recordBook == nil)
    }

    // §5.6-3: 클러스터 + 분리 가능(raw ≤ 5.6) → 줌 투 핏 (시트 안 열림)
    @Test func tapSpreadClusterZoomsIn() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "서울 외 5"))
        #expect(m.placeSheet == nil && m.recordBook == nil)
        #expect(abs(m.mapScale - 2.9388) < 0.01)     // 확대됨
        #expect(m.mapScale > 0.46)
    }

    // §5.6-3: 클러스터인데 더 못 나뉨(raw > 5.6) → openTarget → 5권 → 시트
    @Test func tapTightClusterOpensSheet() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "파리 외 2"))
        #expect(m.placeSheet == ["paris", "london", "rome"])
    }

    // 줌 투 핏 후 클러스터가 풀린다 — 6 마커 → 11 마커.
    // 서울·제주는 이 배율(2.94)에서도 화면상 33px 거리라 임계 52px 안 → 계속 묶인다("서울 외 1").
    @Test func afterZoomClusterSeparates() {
        let m = mapModel()
        #expect(RTRecord.markers(scale: m.mapScale, tx: m.mapTx, ty: m.mapTy).count == 6)
        m.tapMarker(marker(m, label: "서울 외 5"))
        let after = RTRecord.markers(scale: m.mapScale, tx: m.mapTx, ty: m.mapTy)
        #expect(after.count == 11)
        #expect(after.contains { $0.label == "서울 외 1" })   // 서울+제주
        #expect(after.contains { $0.label == "도쿄" })        // 도쿄는 단독으로 분리
        #expect(after.contains { $0.label == "홍콩" })
        #expect(after.contains { $0.label == "방콕" })
        #expect(after.contains { $0.label == "싱가포르" })
    }

    // 분리된 뒤 도쿄 탭 → 도쿄 distinct 2권(파친코·노르웨이) → 장소 시트
    @Test func afterZoomTapTokyoOpensSheet() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "서울 외 5"))
        m.tapMarker(marker(m, label: "도쿄"))
        #expect(m.placeSheet == ["tokyo"])
    }

    // §5.6-1: 드래그였던 pointerup 의 탭은 무시
    @Test func draggedTapIsIgnored() {
        let m = mapModel()
        m.mapMoved = true
        m.tapMarker(marker(m, label: "뉴욕"))
        #expect(m.placeSheet == nil && m.recordBook == nil)
    }

    // §5.2 줌 버튼 — 뷰포트 중심(195,373) 기준 factor 1.6
    @Test func zoomInAroundViewportCenter() {
        let m = mapModel()
        m.mapZoom(1.6)
        #expect(abs(m.mapScale - 0.736) < 0.0001)
        #expect(abs(m.mapTx - (-257.8)) < 0.01)
        #expect(abs(m.mapTy - 189) < 0.01)
    }

    @Test func zoomClampsAtBounds() {
        let m = mapModel()
        for _ in 0..<20 { m.mapZoom(1.6) }
        #expect(abs(m.mapScale - 4.2) < 0.0001)      // 상한
        for _ in 0..<40 { m.mapZoom(1 / 1.6) }
        #expect(abs(m.mapScale - 0.34) < 0.0001)     // 하한
    }

    @Test func resetRestoresDefaultView() {
        let m = mapModel()
        m.mapZoom(1.6)
        m.mapPan(tx: 10, ty: 20)
        m.mapReset()
        #expect(m.mapScale == 0.46 && m.mapTx == -88 && m.mapTy == 258)
    }

    // 장소 시트 → 표지 탭 → 책 상세 (시트 위에 겹쳐 열림, 닫으면 시트 복귀)
    @Test func sheetCoverOpensBookOverSheet() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "뉴욕"))
        m.openRecordBook(4)                     // 파친코 표지 탭
        #expect(m.placeSheet == ["ny"])         // 시트는 살아 있음
        #expect(m.recordBook == 4)
        m.closeRecordBook()
        #expect(m.recordBook == nil)
        #expect(m.placeSheet == ["ny"])         // 시트로 복귀
    }

    // 목업 setTab: 탭 전환 시 열린 시트를 닫는다
    @Test func switchingTabClosesSheets() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "뉴욕"))
        m.openRecordBook(4)
        m.nav(.statsWeek)
        #expect(m.placeSheet == nil && m.recordBook == nil)
        #expect(m.route == .statsWeek)
    }

    // 3탭 왕복 라우팅
    @Test func threeTabRouting() {
        let m = mapModel()
        m.nav(.statsWeek);  #expect(m.route == .statsWeek)
        m.nav(.statsMonth); #expect(m.route == .statsMonth)
        m.nav(.statsMap);   #expect(m.route == .statsMap)
        m.nav(.home);       #expect(m.route == .home)
    }
}

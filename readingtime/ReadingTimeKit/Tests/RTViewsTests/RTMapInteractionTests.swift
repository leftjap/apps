import Testing
import Foundation
@testable import RTViews

// 지도 상호작용 — 모델 레벨(§5.6 단일 마커 탭 → 시트/책, 시트 겹침, 탭 전환 시 닫힘).
// 카메라(팬·줌·클러스터 확대)는 MapKit(Screen15Map)이 소유 — §5.1 "투영·팬·줌은 SDK가 대체".
// 따라서 여기선 모델이 담당하는 시트/책/라우팅만 검증하고, 카메라 이동은 실기기 화면 검증으로 확인.

@MainActor
@Suite struct RTMapInteractionTests {

    private func mapModel() -> RTAppModel {
        let m = RTAppModel()
        m.login()
        m.nav(.statsMap)
        return m
    }
    // 기본 뷰(헤드리스) 마커에서 라벨로 조회 — 단일 마커 탭 검증용
    private func marker(_ m: RTAppModel, label: String) -> RTRecord.Marker {
        let v = RTRecord.defaultView
        return RTRecord.markers(scale: v.scale, tx: v.tx, ty: v.ty).first { $0.label == label }!
    }

    @Test func initialState() {
        let m = mapModel()
        #expect(m.route == .statsMap)
        #expect(m.placeSheet == nil && m.recordBook == nil)
    }

    // §5.6-2/4: 단일 마커 + distinct 1권 → 책 상세 (데모 모드 = §7 기록 시트 폴백).
    // 실데이터는 책상세 페이지(08)로 이동 — RTMapLiveDataTests.openMapBookNavigatesToDetailPageForLiveData.
    @Test func tapSinglePlaceOneBookOpensRecordSheetInDemo() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "시드니"))
        #expect(m.recordBook == 8)          // 노르웨이의 숲 (데모 폴백)
        #expect(m.placeSheet == nil)
    }

    // §5.6-2/4: 단일 마커 + distinct 2권 → 장소 시트
    @Test func tapSinglePlaceMultiBookOpensSheet() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "뉴욕"))
        #expect(m.placeSheet == ["ny"])
        #expect(m.recordBook == nil)
    }

    // 클러스터 마커 탭은 모델에서 no-op (MapKit 뷰가 카메라 확대) — 시트/책 안 열림
    @Test func tapClusterIsModelNoop() {
        let m = mapModel()
        m.tapMarker(marker(m, label: "서울 외 5"))
        #expect(m.placeSheet == nil && m.recordBook == nil)
    }

    // 장소 시트 → 표지 탭 → 책 상세 (시트 위에 겹쳐 열림, 닫으면 시트로 복귀)
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

    // 클러스터링 자체(52px 체인)는 기본 뷰에서 6개 마커 — 엔진 정합(RTRecordEngineTests 와 별개로 여기서도)
    @Test func defaultViewHasSixMarkers() {
        let v = RTRecord.defaultView
        #expect(RTRecord.markers(scale: v.scale, tx: v.tx, ty: v.ty).count == 6)
    }
}

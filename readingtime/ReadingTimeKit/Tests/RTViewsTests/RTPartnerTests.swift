import Testing
import Foundation
@testable import RTViews

// 함께 읽기(파트너 프레즌스) — statsSubject 전환 + 파트너 데모 파생.
// 홈 파트너 행 탭 → 파트너 통계, 홈/내 통계 복귀 시 .me 리셋 (README §Interactions).

@MainActor
@Suite struct RTPartnerTests {
    @Test func defaultSubjectIsMe() {
        #expect(RTAppModel().statsSubject == .me)
    }

    @Test func openPartnerStatsSetsSubjectAndNavigates() {
        let m = RTAppModel()
        m.openPartnerStats()
        #expect(m.statsSubject == .partner)
        #expect(m.route == .stats)
    }

    @Test func navHomeResetsSubjectToMe() {
        let m = RTAppModel()
        m.openPartnerStats()
        m.nav(.home)
        #expect(m.statsSubject == .me)
    }

    @Test func enteringMyStatsResetsSubject() {
        let m = RTAppModel()
        m.openPartnerStats()          // .partner
        m.openMyStats()               // 내 통계 재진입 → .me
        #expect(m.statsSubject == .me)
        #expect(m.route == .stats)
    }

    @Test func partnerDemoProfileMatchesMockup() {
        let m = RTAppModel()
        // 데모(시안): 소연 · 이니셜 "소"
        #expect(m.partnerName == "소연")
        #expect(m.partnerInitial == "소")
    }

    // 양방향: 파트너 이름은 보는 사람 기준(소연이 지오를 보면 "지오"). 앱이 uid→이름 주입.
    @Test func partnerNameIsSettableForViewer() {
        let m = RTAppModel()
        m.partnerName = "지오"          // 소연 폰에서 파트너 = 지오
        #expect(m.partnerName == "지오")
        #expect(m.partnerInitial == "지")
    }

    // idle 상대시간 "N시간 전" (README §설정 idle 배지)
    @Test func agoTextRelativeBuckets() {
        let now = Date(timeIntervalSinceReferenceDate: 1_000_000)
        #expect(RTAppModel.agoText(now.addingTimeInterval(-30), now: now) == "방금")
        #expect(RTAppModel.agoText(now.addingTimeInterval(-5 * 60), now: now) == "5분 전")
        #expect(RTAppModel.agoText(now.addingTimeInterval(-3 * 3600), now: now) == "3시간 전")
        #expect(RTAppModel.agoText(now.addingTimeInterval(-2 * 86400), now: now) == "2일 전")
    }
}

import Testing
@testable import ReadingTimeKit

// 함께 읽기 — 파트너 uid·이름 해석 (보는 사람 기준). UUID.uuidString 은 대문자라
// Config(소문자)와 대소문자 정합이 핵심 — 안 맞으면 파트너가 자기 자신으로 오인됨.
@Suite struct PartnerResolveTests {
    static let gio = "7bae5645-61c6-4476-9ff2-4c30a72812ff"
    static let soyeon = "aeafd9a7-4094-4e7c-a621-188d6b2e336d"

    @Test func gioPhoneSeesSoyeon() {
        // 지오가 보면 파트너 = 소연 (UUID.uuidString 은 대문자로 들어옴)
        #expect(Config.partnerName(myOwnerID: Self.gio.uppercased()) == "소연")
        #expect(Config.partnerOwnerID(myOwnerID: Self.gio.uppercased()) == Self.soyeon)
    }

    @Test func soyeonPhoneSeesGio() {
        #expect(Config.partnerName(myOwnerID: Self.soyeon.uppercased()) == "지오")
        #expect(Config.partnerOwnerID(myOwnerID: Self.soyeon.uppercased()) == Self.gio)
    }

    @Test func lowercaseAlsoResolves() {
        #expect(Config.partnerName(myOwnerID: Self.gio) == "소연")
        #expect(Config.partnerName(myOwnerID: Self.soyeon) == "지오")
    }

    @Test func nonHouseholdHasNoResolvedName() {
        // household 아닌 uid → 파트너 uid 는 아무거나(첫 요소) 잡히나, 이름 매핑은 그 값 기준.
        // 실사용은 household 로그인만이라 방어적 확인: 미지 uid 도 crash 없이 동작.
        let unknown = "00000000-0000-0000-0000-000000000000"
        #expect(Config.partnerOwnerID(myOwnerID: unknown) == Self.gio)   // 첫 멤버
    }
}

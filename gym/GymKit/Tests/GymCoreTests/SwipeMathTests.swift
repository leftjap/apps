import Foundation
import Testing
@testable import GymCore

// 히어로 스와이프 드래그 추종 수식 — PWA session.js wireSwipeHandlers 정합 (작업지시서 §4 / FIG 2).
@Suite struct SwipeMathTests {

    // engage — 수평 우세 + 8px 초과 (그 전엔 수직 스크롤 양보)
    @Test func engageRequiresHorizontalDominantOverEight() {
        #expect(GymSwipeMath.engaged(dx: -9, dy: 2))
        #expect(GymSwipeMath.engaged(dx: 9, dy: -3))
        #expect(!GymSwipeMath.engaged(dx: -8, dy: 0))     // 8 정확히 = 미달 (초과 조건)
        #expect(!GymSwipeMath.engaged(dx: -20, dy: 25))   // 수직 우세
    }

    // 드래그 추종 — 우드래그 0.25 저항, 좌 -150 클램프
    @Test func heroTranslateResistanceAndClamp() {
        #expect(GymSwipeMath.heroTranslate(-40) == -40)
        #expect(GymSwipeMath.heroTranslate(-200) == -150)   // 좌 클램프
        #expect(GymSwipeMath.heroTranslate(40) == 10)       // 우 저항 ×0.25
    }

    // "완료" 칩 비례 노출 — p = min(1, max(0, -dx/90))
    @Test func revealProgressProportional() {
        #expect(GymSwipeMath.revealProgress(0) == 0)
        #expect(GymSwipeMath.revealProgress(30) == 0)        // 우드래그 = 0
        #expect(abs(GymSwipeMath.revealProgress(-45) - 0.5) < 0.0001)
        #expect(GymSwipeMath.revealProgress(-90) == 1)
        #expect(GymSwipeMath.revealProgress(-200) == 1)      // 상한 1
    }

    // 종료 판정 — 좌 -60 커밋 / 우 +60(수평 우세) 이전 수정 / <10px 탭 폴백 / 그 외 스프링백
    @Test func endActionThresholds() {
        #expect(GymSwipeMath.endAction(dx: -60, dy: 0) == .commit)
        #expect(GymSwipeMath.endAction(dx: -61, dy: 40) == .commit)     // 좌커밋은 수평우세 조건 없음 (session.js 정합)
        #expect(GymSwipeMath.endAction(dx: 60, dy: 10) == .revert)
        #expect(GymSwipeMath.endAction(dx: 60, dy: 80) == .springBack)  // 우는 수평 우세 필요
        #expect(GymSwipeMath.endAction(dx: -9, dy: 5) == .tap)          // 미세 떨림 → 탭 폴백
        #expect(GymSwipeMath.endAction(dx: -30, dy: 5) == .springBack)  // 애매 → 스프링백
    }
}

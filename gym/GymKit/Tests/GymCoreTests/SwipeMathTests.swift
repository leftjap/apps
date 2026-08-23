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

// 히어로 탭 존 — 중앙(키패드)을 숫자 폭에 맞춘다 (실기기 2026-08-23 "숫자패드 구간이 넓다").
// 고정 40% 는 행 폭 323 에서 중앙 129pt — 횟수(숫자 ~61pt)에선 두 배로 넓어 여백 탭이 먹히고,
// 중량(숫자 ~145pt)에선 오히려 좁아 숫자 끝을 눌러도 증감이 된다.
@Suite struct HeroZoneTests {
    @Test func centerMatchesNumberWidthWithPadding() {
        // 횟수 "10" ≈ 61pt → 좌우 8pt 여유 = 77pt (구 129pt 에서 축소)
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 61, rowWidth: 323) == 77)
    }
    @Test func centerNeverEatsTheSideTapTargets() {
        // 중량 "888" 처럼 숫자가 넓어도 좌우 증감 영역 44pt 는 지킨다
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 300, rowWidth: 323) == 323 - 88)
    }
    @Test func centerHasMinimumTapTarget() {
        // 한 자리 수라도 중앙은 44pt 이상
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 10, rowWidth: 323) == 44)
    }
    // 좌/우는 남는 폭을 반씩 — 중앙이 가운데에 놓인다.
    @Test func sidesSplitTheRemainder() {
        let c = GymSwipeMath.heroCenterZone(numberWidth: 61, rowWidth: 323)
        #expect(GymSwipeMath.heroSideZone(center: c, rowWidth: 323) == (323 - 77) / 2)
    }
}

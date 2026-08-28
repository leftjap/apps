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

    // 드래그 추종 — 양방향 1:1, ±150 클램프.
    // 종전엔 우드래그만 ×0.25 로 감쇠했다. 판정(endAction)은 감쇠 전 원본을 쓰므로
    // 60pt 를 끌면 화면은 15pt 만 움직이는데 세트가 되돌려졌다 (실기기 2026-08-28).
    @Test func heroTranslateTracksHonestlyBothWays() {
        #expect(GymSwipeMath.heroTranslate(-40) == -40)
        #expect(GymSwipeMath.heroTranslate(-200) == -150)   // 좌 클램프
        #expect(GymSwipeMath.heroTranslate(40) == 40)       // 우 저항 제거 — 끈 만큼 움직인다
        #expect(GymSwipeMath.heroTranslate(200) == 150)     // 우 클램프 (좌와 대칭)
    }

    /// 판정 임계에서 화면이 **실제로 그만큼** 움직여야 한다 — 보이는 것과 판정의 정합.
    /// 이게 깨져 있으면 "안 걸렸네" 싶은 손짓이 조용히 세트를 되돌린다 (실기기 2026-08-28).
    @Test func visibleTravelMatchesJudgementAtThreshold() {
        #expect(GymSwipeMath.endAction(dx: 60, dy: 0) == .revert)
        #expect(GymSwipeMath.heroTranslate(60) == 60)
        #expect(GymSwipeMath.endAction(dx: -60, dy: 0) == .commit)
        #expect(GymSwipeMath.heroTranslate(-60) == -60)
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
    // 요청이 "축소" 이므로 어떤 행에서도 종전 40% 보다 넓어지지 않는다.
    // 숫자에 그대로 맞추면 세 자리 중량(숫자 213pt)에서 중앙이 229pt 로 벌어져 여백이 46pt 가 된다.
    @Test func centerNeverGrowsBeyondTheOldFortyPercent() {
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 213, rowWidth: 323) == 323 * 0.4)
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 300, rowWidth: 323) == 323 * 0.4)
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

    // 실기기(11 Pro) 실제 폭 — 히어로 행은 가로 패딩 없이 전폭 375pt (SessionScreen 은
    // .frame(maxWidth:.infinity) 만 건다). 종전 40% = 150pt 였다.
    @Test func realDeviceWidths() {
        let row = 375.0
        // 횟수 "8"  (mono 50, advance 31.0) → 47pt. 종전 150pt
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 31, rowWidth: row) == 47)
        // 횟수 "10" (advance 61.0) → 77pt
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 61, rowWidth: row) == 77)
        // 중량 "70" (mono 122, advance 144.6) → 상한 40% 에 걸려 150pt 유지 (회귀 없음)
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 144.6, rowWidth: row) == 150)
        #expect(GymSwipeMath.heroCenterZone(numberWidth: 213.5, rowWidth: row) == 150)
        // 좌우 증감 여백: 횟수 8 → 164pt (종전 112.5)
        #expect(GymSwipeMath.heroSideZone(center: 47, rowWidth: row) == 164)
    }

    /// 가장자리 불감대 — 시안 `#cardSwipeArea { padding: 0 26px }` (mocks/session.html:346).
    /// 이식에서 이 여백이 빠져 증감 존이 화면 끝(x=0)까지 닿았고, 폰을 집을 때 베젤 근처에
    /// 스치는 접촉이 그대로 ±증분으로 먹혔다 (실기기 2026-08-28 "값이 임의로 줄어듦").
    @Test func edgeGutterKeepsZonesOffTheBezel() {
        #expect(GymSwipeMath.heroEdgeGutter == 26)
        // 횟수 "8" side 164 → 실제 히트 138pt (x 26..164)
        #expect(GymSwipeMath.heroTapZone(side: 164) == 138)
        // 중량 2자리 side 112.5 → 86.5pt
        #expect(GymSwipeMath.heroTapZone(side: 112.5) == 86.5)
        // 여백이 불감대보다 좁아도 음수로 안 내려간다
        #expect(GymSwipeMath.heroTapZone(side: 20) == 0)
        // 애플 최소 히트 44pt 는 실사용 폭(≥86.5)에서 여유 있게 확보된다
        #expect(GymSwipeMath.heroTapZone(side: 112.5) > 44)
    }
}

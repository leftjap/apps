import Testing
import Foundation
@testable import RTViews

// 스와이프 뒤로가기 판정 — today 앱 sheetGesture.js 상수 포팅 정합
// (DECIDE 6px · 각도비 1.2 · SNAP 0.4 · VEL 0.5px/ms=500pt/s · VEL_RATIO 0.2)

@Suite struct RTSwipeBackTests {
    @Test func classifyNeedsDecideDistance() {
        #expect(RTSwipeBack.classify(dx: 3, dy: 2) == nil)          // pending
        #expect(RTSwipeBack.classify(dx: 10, dy: 2) == .active)     // 오른쪽 가로 우세
        #expect(RTSwipeBack.classify(dx: -10, dy: 2) == .rejected)  // 왼쪽 → 뒤로가기 아님
        #expect(RTSwipeBack.classify(dx: 7, dy: 7) == .rejected)    // 각도비 1.2 미달
    }

    @Test func snapByDistanceOrFlick() {
        // 40% 초과 → 통과
        #expect(RTSwipeBack.shouldPop(dx: 160, width: 390, velocity: 0))
        #expect(!RTSwipeBack.shouldPop(dx: 150, width: 390, velocity: 0))
        // 빠른 플릭: 20% 만 끌어도 통과
        #expect(RTSwipeBack.shouldPop(dx: 90, width: 390, velocity: 600))
        #expect(!RTSwipeBack.shouldPop(dx: 70, width: 390, velocity: 600))
        // 느리면 20% 로는 부족
        #expect(!RTSwipeBack.shouldPop(dx: 90, width: 390, velocity: 300))
    }
}

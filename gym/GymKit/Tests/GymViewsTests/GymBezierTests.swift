import Foundation
import Testing
@testable import GymViews

// cubic-bezier 솔버 — 정답값은 독립 참조 구현(WebKit UnitBezier, Node)으로 산출 (2026-07-11).
@Suite struct GymBezierTests {
    @Test func matchesSianSwapCurve() {
        let b = UnitBezier(0.32, 0.72, 0.18, 1)   // 시안 gHeroSwapW/R/Hint
        #expect(abs(b.solve(0.1) - 0.246426) < 1e-4)
        #expect(abs(b.solve(0.25) - 0.653973) < 1e-4)
        #expect(abs(b.solve(0.5) - 0.928087) < 1e-4)
        #expect(abs(b.solve(0.75) - 0.988319) < 1e-4)
        #expect(abs(b.solve(0.9) - 0.998453) < 1e-4)
    }
    @Test func endpointsExact() {
        let b = UnitBezier(0.32, 0.72, 0.18, 1)
        #expect(b.solve(0) == 0)
        #expect(b.solve(1) == 1)
    }
    @Test func knownEaseValue() {
        // cubic-bezier(.25,.1,.25,1) = CSS ease, solve(0.5) ≈ 0.8024 (교차검증)
        #expect(abs(UnitBezier(0.25, 0.1, 0.25, 1).solve(0.5) - 0.802403) < 1e-3)
    }
    @Test func linearIdentity() {
        let b = UnitBezier(0, 0, 1, 1)
        for x in stride(from: 0.0, through: 1.0, by: 0.1) { #expect(abs(b.solve(x) - x) < 1e-4) }
    }
    @Test func monotonicIncreasing() {
        let b = UnitBezier(0.32, 0.72, 0.18, 1)
        var prev = -1.0
        for x in stride(from: 0.0, through: 1.0, by: 0.05) {
            let y = b.solve(x); #expect(y >= prev); prev = y
        }
    }
}

// 구간별 베지어 이징으로 시안 키프레임 트랙을 평가. 경계는 시안 값과 정확히 일치해야.
@Suite struct HeroSwapCurveTests {
    @Test func boundariesHitSianValues() {
        // 중량 x: 0%=88(진입 대기) · 38%=88 · 55%=-8 · 100%=0
        let track = [(0.0, 88.0), (0.38, 88.0), (0.55, -8.0), (1.0, 0.0)]
        #expect(abs(HeroSwapCurve.eval(track, at: 0.0) - 88) < 1e-6)
        #expect(abs(HeroSwapCurve.eval(track, at: 0.38) - 88) < 1e-6)
        #expect(abs(HeroSwapCurve.eval(track, at: 0.55) - (-8)) < 1e-6)
        #expect(abs(HeroSwapCurve.eval(track, at: 1.0) - 0) < 1e-6)
    }
    @Test func midSegmentUsesBezierNotLinear() {
        // 38%→55% 구간 중앙(p=0.465)에서 베지어(빠른 이징)라 선형 중앙값(40)보다 훨씬 낮아야
        let track = [(0.0, 88.0), (0.38, 88.0), (0.55, -8.0), (1.0, 0.0)]
        let mid = HeroSwapCurve.eval(track, at: (0.38 + 0.55) / 2)
        let linearMid = (88.0 + -8.0) / 2   // 40
        #expect(mid < linearMid - 20)        // 베지어 solve(0.5)=0.928 → 88+(-8-88)*0.928 = -1.1
        #expect(abs(mid - (88 + (-8 - 88) * 0.928087)) < 0.5)
    }
    @Test func clampsOutOfRange() {
        let track = [(0.0, 5.0), (1.0, 9.0)]
        #expect(HeroSwapCurve.eval(track, at: -0.5) == 5.0)
        #expect(HeroSwapCurve.eval(track, at: 1.5) == 9.0)
    }
}

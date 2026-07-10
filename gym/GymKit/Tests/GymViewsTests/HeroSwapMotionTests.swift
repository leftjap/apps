import Foundation
import Testing
@testable import GymViews

// 히어로 스왑 모션 웨이포인트 — 시안 gHeroSwapW/R 값에 정확히 맞아야 (회귀 방지).
@Suite struct HeroSwapMotionTests {
    // 중량 라이브: 38% 진입대기 · 55% 착지(-8/1.08/불투명/플래시1) · 100% 정착
    @Test func weightLiveHitsSianWaypoints() {
        let at38 = HeroSwapMotion.live(dxIn: 88, landOvershoot: -8, landScale: 1.08, at: 0.38)
        #expect(abs(at38.x - 88) < 1e-6); #expect(at38.opacity < 1e-6)   // 아직 투명·진입 위치
        let at55 = HeroSwapMotion.live(dxIn: 88, landOvershoot: -8, landScale: 1.08, at: 0.55)
        #expect(abs(at55.x - (-8)) < 1e-6); #expect(abs(at55.scale - 1.08) < 1e-6)
        #expect(abs(at55.opacity - 1) < 1e-6); #expect(abs(at55.flash - 1) < 1e-6)
        let at74 = HeroSwapMotion.live(dxIn: 88, landOvershoot: -8, landScale: 1.08, at: 0.74)
        #expect(abs(at74.flash - 1) < 1e-6)   // 74% 까지 플래시 유지
        let at100 = HeroSwapMotion.live(dxIn: 88, landOvershoot: -8, landScale: 1.08, at: 1.0)
        #expect(abs(at100.x) < 1e-6); #expect(abs(at100.scale - 1) < 1e-6); #expect(abs(at100.flash) < 1e-6)
    }
    // 횟수 라이브: 착지 -6 (중량 -8 과 구분)
    @Test func repsLiveLandsAtMinus6() {
        let at55 = HeroSwapMotion.live(dxIn: 82, landOvershoot: -6, landScale: 1.09, at: 0.55)
        #expect(abs(at55.x - (-6)) < 1e-6); #expect(abs(at55.scale - 1.09) < 1e-6)
    }
    // 미드 구간은 베지어(빠른 이징)라 선형보다 앞선다 (진행 정합 증거)
    @Test func midSegmentIsBezierNotLinear() {
        let mid = HeroSwapMotion.live(dxIn: 88, landOvershoot: -8, landScale: 1.08, at: (0.38 + 0.55) / 2)
        #expect(mid.x < 0)   // 선형이면 40, 베지어(0.928)면 ≈ -1
    }
    // 고스트: 24% 퇴장 완료(-96, 투명), 그 전엔 가시
    @Test func ghostExitsBy24pct() {
        let at0 = HeroSwapMotion.ghost(dxOut: -96, fromDrag: false, at: 0)
        #expect(abs(at0.x) < 1e-6); #expect(abs(at0.opacity - 1) < 1e-6)
        let at24 = HeroSwapMotion.ghost(dxOut: -96, fromDrag: false, at: 0.24)
        #expect(abs(at24.x - (-96)) < 1e-6); #expect(at24.opacity < 1e-6); #expect(abs(at24.skew - (-6)) < 1e-6)
    }
    // fromDrag 고스트: 위치 불변, 제자리 페이드
    @Test func fromDragGhostFadesInPlace() {
        let f = HeroSwapMotion.ghost(dxOut: -96, fromDrag: true, at: 0.24)
        #expect(abs(f.x) < 1e-6); #expect(f.opacity < 1e-6)   // 0.197 에서 이미 0
    }
    // 지연 반영 — reps 55ms: 초반 지연 구간 ep=0, 종료 시 ep=1
    @Test func delayShiftsEffectiveProgress() {
        #expect(HeroSwapMotion.effectiveP(0, delay: 0.055) == 0)
        #expect(abs(HeroSwapMotion.effectiveP(1, delay: 0.055) - 1) < 1e-9)
        // p 가 지연 비율(0.055/0.815) 이하면 여전히 0
        #expect(HeroSwapMotion.effectiveP(0.055 / 0.815, delay: 0.055) < 1e-9)
    }
    @Test func noDelayIsIdentity() {
        #expect(abs(HeroSwapMotion.effectiveP(0.5, delay: 0) - 0.5) < 1e-9)
    }
}

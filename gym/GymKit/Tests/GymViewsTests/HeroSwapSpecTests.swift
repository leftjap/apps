import Foundation
import Testing
@testable import GymViews

// 세트 완료 좌스와이프 히어로 스왑 — 시안 #7b gHeroSwapW/R 정본 수치.
//  중량(gHeroSwapW): OUT -96 · IN +88 · 착지 x -8 · scale 1.08 · 지연 0
//  횟수(gHeroSwapR): OUT -88 · IN +82 · 착지 x -6 · scale 1.09 · 지연 55ms
// 기존 HeroRowSwapIn 은 착지 오버슈트를 -8 로 하드코딩해 횟수도 -8 이 됐다(시안 -6 과 2px 어긋남).
@Suite struct HeroSwapSpecTests {
    @Test func weightSpecMatchesSian() {
        let s = HeroSwapSpec.weight
        #expect(s.dxIn == 88); #expect(s.dxOut == -96)
        #expect(s.landOvershoot == -8); #expect(s.landScale == 1.08); #expect(s.delay == 0)
    }
    @Test func repsSpecMatchesSian() {
        let s = HeroSwapSpec.reps
        #expect(s.dxIn == 82); #expect(s.dxOut == -88)
        #expect(s.landOvershoot == -6)   // 시안 gHeroSwapR 55% translateX(-6px)
        #expect(s.landScale == 1.09); #expect(s.delay == 0.055)
    }
}

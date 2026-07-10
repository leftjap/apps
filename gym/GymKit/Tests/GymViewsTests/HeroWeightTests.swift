import Foundation
import Testing
@testable import GymViews

// 히어로 큰 숫자 굵기 — 시안·PWA 정본은 프리셋 여부와 무관하게 고정.
//   중량(122px) = 600, 횟수(50px) = 400  (PWA .hero-weight 600 / .hero-reps 400 고정, session.js 는 굵기 미변경).
// 기존 구현은 `preset ? 300 : ...` 로 프리셋을 얇게 그려, 증량하면 굵기가 튀는 회귀가 있었다.
@Suite struct HeroWeightTests {
    @Test func weightIsAlways600RegardlessOfPreset() {
        #expect(SessionHero.weightMonoWeight(preset: true) == 600)
        #expect(SessionHero.weightMonoWeight(preset: false) == 600)
    }
    @Test func repsIsAlways400RegardlessOfPreset() {
        #expect(SessionHero.repsMonoWeight(preset: true) == 400)
        #expect(SessionHero.repsMonoWeight(preset: false) == 400)
    }
}

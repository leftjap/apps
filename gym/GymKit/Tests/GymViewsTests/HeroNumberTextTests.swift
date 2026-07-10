import Foundation
import Testing
@testable import GymViews

// 히어로 큰 숫자 자간 — 시안 letter-spacing 은 글자 사이에만 넣고 마지막 글자 뒤엔 넣지 않아야
// iOS Text 가 프레임에 잉크를 자르지 않는다. AttributedString .kern 은 글자 뒤에 붙으므로
// 마지막 글자를 제외한 모든 글자에 tracking 을 준다 → (n-1) 개 자간.
@Suite struct HeroNumberTextTests {
    private func kerns(_ s: AttributedString) -> [Double] {
        s.runs.flatMap { run -> [Double] in
            let n = String(s[run.range].characters).count
            return Array(repeating: (run.kern.map(Double.init)) ?? 0, count: n)
        }
    }

    @Test func lastGlyphHasNoTrailingKern() {
        let a = HeroNumberText.kerned("65", tracking: -6.7)
        let ks = kerns(a)
        #expect(ks.count == 2)
        #expect(ks[0] == -6.7)   // '6' 뒤에만
        #expect(ks[1] == 0)      // '5' 뒤엔 자간 없음 (프레임 안 좁아짐)
    }

    @Test func threeDigitsGetTwoKerns() {
        let ks = kerns(HeroNumberText.kerned("100", tracking: -6.7))
        #expect(ks == [-6.7, -6.7, 0])
    }

    @Test func singleGlyphHasNoKern() {
        let ks = kerns(HeroNumberText.kerned("8", tracking: -1))
        #expect(ks == [0])
    }

    @Test func emptyStringDoesNotCrash() {
        #expect(String(HeroNumberText.kerned("", tracking: -6.7).characters).isEmpty)
    }
}

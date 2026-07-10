import Foundation
import CoreText
import Testing
@testable import GymViews

// 시안 --font-mono = "Space Grotesk" + `font-variant-numeric: tabular-nums` (시안 #6b 655행).
// 브라우저 실측 (2026-07-11, 122px/600): '6' = '5' = '0' = 75.64pt · "65" = 151.28pt.
//
// 기존 구현은 named instance 만 골라 써서 두 가지가 어긋났다:
//   1) Space Grotesk VF 에 600 인스턴스가 없어 `.mono(_,600)` 이 Light_Bold(실제 wght 700) 로 떨어짐
//   2) tabular 미적용 → '6'=75.23 '5'=73.16 '0'=78.84 (프로포셔널)
@Suite struct MonoFontTests {
    init() { _ = GymFonts.register() }

    private func lineWidth(_ f: CTFont, _ s: String) -> Double {
        let attrs = [kCTFontAttributeName as NSAttributedString.Key: f]
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: s, attributes: attrs))
        return CTLineGetTypographicBounds(line, nil, nil, nil)
    }

    @Test func monoUsesSpaceGrotesk() {
        #expect((CTFontCopyFamilyName(GymMonoFont.ctFont(size: 122, weight: 600)) as String) == "Space Grotesk")
    }

    @Test func monoResolvesExactWeightNotNearestNamedInstance() {
        // 600 은 named instance 가 없어 예전엔 700(Light_Bold)로 떨어졌다. 이제 축으로 정확히 600.
        // (기본값 300 은 variation 딕셔너리에서 생략될 수 있어 400~700 만 확인)
        for w in [400, 500, 600, 700] {
            let f = GymMonoFont.ctFont(size: 122, weight: w)
            let actual = (CTFontCopyVariation(f) as? [CFNumber: Any])?[GymMonoFont.wghtAxis] as? Double
            #expect(actual == Double(w), "wght \(w) → \(String(describing: actual))")
        }
    }

    @Test func monoDigitsAreTabular() {
        let f = GymMonoFont.ctFont(size: 122, weight: 600)
        let w6 = lineWidth(f, "6"), w5 = lineWidth(f, "5"), w0 = lineWidth(f, "0")
        #expect(abs(w6 - w5) < 0.01)
        #expect(abs(w6 - w0) < 0.01)
        #expect(abs(w6 - 75.64) < 0.1)          // 브라우저 실측
    }

    @Test func monoLineWidthMatchesBrowser() {
        let f = GymMonoFont.ctFont(size: 122, weight: 600)
        #expect(abs(lineWidth(f, "65") - 151.28) < 0.1)   // 브라우저 실측 (letter-spacing 0)
    }
}

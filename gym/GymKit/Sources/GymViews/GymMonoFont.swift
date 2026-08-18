import SwiftUI
import CoreText

// Space Grotesk (가변 mono) — 시안 --font-mono + `font-variant-numeric: tabular-nums`.
//
// named instance(Light_Bold 등)만 골라 쓰면 두 가지가 시안과 어긋난다:
//   1) VF 에 600 named instance 가 없어 `.mono(_,600)` 이 700 으로 떨어짐(히어로 중량이 과굵음)
//   2) tabular 미적용 → 숫자 폭이 제각각('6'75.23 '5'73.16), tracking 과 겹쳐 마지막 글자 잉크가 잘림
//
// 대신 wght 축을 정확히 지정하고 tabular 피처를 켠다. 브라우저 실측(122px/600)과 일치:
//   '6'='5'='0'=75.64pt · "65"(ls0)=151.28pt.
public enum GymMonoFont {
    // 'wght' variation axis id (big-endian 'w','g','h','t').
    public static let wghtAxis = 0x77676874 as CFNumber

    // 가변 축 합성의 베이스 — Light(300) named instance. wght 를 덮어써 임의 굵기를 만든다.
    private static let baseName = "SpaceGrotesk-Light"

    public static func ctFont(size: CGFloat, weight: Int) -> CTFont {
        let base = CTFontCreateWithName(baseName as CFString, size, nil)
        let attrs: [CFString: Any] = [
            kCTFontVariationAttribute: [wghtAxis: weight],
            // tabular_nums — kNumberSpacingType(6) / kMonospacedNumbersSelector(0).
            kCTFontFeatureSettingsAttribute: [[
                kCTFontFeatureTypeIdentifierKey: 6,
                kCTFontFeatureSelectorIdentifierKey: 0,
            ]],
        ]
        let desc = CTFontDescriptorCreateCopyWithAttributes(
            CTFontCopyFontDescriptor(base), attrs as CFDictionary)
        return CTFontCreateWithFontDescriptor(desc, size, nil)
    }

    public static func font(size: CGFloat, weight: Int) -> Font {
        Font(ctFont(size: size, weight: weight))
    }

    /// 렌더 폭(pt) — 히어로 숫자 단계 축소 판정용 (유산소 카드 §6-1). tracking 은 미포함.
    public static func width(_ s: String, size: CGFloat, weight: Int) -> CGFloat {
        let f = ctFont(size: size, weight: weight)
        let line = CTLineCreateWithAttributedString(
            NSAttributedString(string: s, attributes: [kCTFontAttributeName as NSAttributedString.Key: f]))
        return CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    }
}

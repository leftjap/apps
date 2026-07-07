import SwiftUI

// CSS 색 → SwiftUI 변환 유틸.
// paper.css 는 oklch() 를 광범위하게 씀 → SwiftUI 는 oklch 미지원이므로
// CSS 와 동일한 oklch→sRGB 변환을 직접 구현해 픽셀 일치를 보장한다.
public extension Color {

    // hex (0xRRGGBB)
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }

    // oklch(L% C H) — CSS Color Level 4 정의 그대로.
    //  L: 0…1 (paper.css 는 %, 예: 67% → 0.67 을 넣는다)
    //  C: chroma, H: hue(도)
    // 변환: oklch→oklab→LMS→선형 sRGB→감마 sRGB. gamut clamp.
    init(oklch L: Double, _ C: Double, _ H: Double, alpha: Double = 1) {
        let h = H * .pi / 180
        let a = C * cos(h)
        let b = C * sin(h)

        // oklab → LMS' (nonlinear)
        let l_ = L + 0.3963377774 * a + 0.2158037573 * b
        let m_ = L - 0.1055613458 * a - 0.0638541728 * b
        let s_ = L - 0.0894841775 * a - 1.2914855480 * b
        let l = l_ * l_ * l_
        let m = m_ * m_ * m_
        let s = s_ * s_ * s_

        // LMS → 선형 sRGB
        let lr =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        let lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        let lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

        func gamma(_ x: Double) -> Double {
            let c = min(max(x, 0), 1)
            return c >= 0.0031308 ? 1.055 * pow(c, 1 / 2.4) - 0.055 : 12.92 * c
        }
        self.init(.sRGB, red: gamma(lr), green: gamma(lg), blue: gamma(lb), opacity: alpha)
    }
}

public extension LinearGradient {
    // CSS linear-gradient(<deg>, stops...) — 0deg=to top, 시계방향.
    // 라인 길이 L = |w·sinθ| + |h·cosθ| (박스 크기 반영, UnitPoint 정규화 왜곡 방지).
    // (ReadingTimeKit RTTokens.css 와 동일 알고리즘)
    static func css(_ degrees: Double, size: CGSize = CGSize(width: 1, height: 1),
                    _ stops: [(color: Color, location: Double)]) -> LinearGradient {
        let rad = degrees * .pi / 180
        let dx = sin(rad)
        let dy = -cos(rad)
        let w = max(size.width, 0.0001), h = max(size.height, 0.0001)
        let len = abs(w * dx) + abs(h * dy)
        let cx = w / 2, cy = h / 2
        let start = UnitPoint(x: (cx - dx * len / 2) / w, y: (cy - dy * len / 2) / h)
        let end = UnitPoint(x: (cx + dx * len / 2) / w, y: (cy + dy * len / 2) / h)
        return LinearGradient(
            stops: stops.map { .init(color: $0.color, location: $0.location) },
            startPoint: start, endPoint: end
        )
    }
}

import SwiftUI

// 디자인 토큰 — design-ref/v3/README.md §Design Tokens (hex 그대로)
public enum RT {
    public static let paper = Color(hex: 0xF6F3EA)
    public static let surface = Color(hex: 0xFDFBF4)
    public static let sheet = Color(hex: 0xFAF7EE)
    public static let hair = Color(hex: 0xE9E2CF)
    public static let hair2 = Color(hex: 0xEAE3D0)
    public static let hair3 = Color(hex: 0xE8E1CD)
    public static let ink = Color(hex: 0x17150F)
    public static let body = Color(hex: 0x3F3A2D)
    public static let muted = Color(hex: 0x8C8570)
    public static let faint = Color(hex: 0xB5AD97)
    public static let ghost = Color(hex: 0xC6BEA8)
    public static let green = Color(hex: 0x2C4A3C)
    public static let ctaText = Color(hex: 0xF2EEDD)
    public static let greenTint = Color(hex: 0xE9EFE6)
    public static let amber = Color(hex: 0xC9973B)
    public static let amberTint = Color(hex: 0xF6ECD6)
    public static let amberDeep = Color(hex: 0xB8862E)
    public static let terra = Color(hex: 0xC2553A)
    public static let gold = Color(hex: 0xE2CF9E)
    public static let darkSub = Color(hex: 0x8FA393)
    public static let segBg = Color(hex: 0xECE7D8)

    // linear-gradient(160deg,#3a5c4b,#26413a) — size 는 사용처 실크기
    public static func ctaGrad(_ size: CGSize) -> LinearGradient {
        .css(160, size: size, [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)])
    }
    // linear-gradient(175deg,#15211a 0%,#0e1712 50%,#0a100c 100%)
    public static func darkGrad(_ size: CGSize) -> LinearGradient {
        .css(175, size: size, [(Color(hex: 0x15211A), 0), (Color(hex: 0x0E1712), 0.5), (Color(hex: 0x0A100C), 1)])
    }
    // 표지 kraft: linear-gradient(168deg,#eee1bc,#e3d09e)
    public static func kraftGrad(_ size: CGSize) -> LinearGradient {
        .css(168, size: size, [(Color(hex: 0xEEE1BC), 0), (Color(hex: 0xE3D09E), 1)])
    }
}

public extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: alpha)
    }
}

public extension LinearGradient {
    // CSS linear-gradient(<deg>, stops...) — CSS 스펙 그대로: 0deg=to top, 시계방향,
    // 그라데이션 라인 길이 L = |w·sinθ| + |h·cosθ| (박스 크기 반영. UnitPoint 정규화 왜곡 방지
    // 를 위해 사용처의 실제 크기를 받아 픽셀 공간에서 계산).
    static func css(_ degrees: Double, size: CGSize = CGSize(width: 1, height: 1),
                    _ stops: [(color: Color, location: Double)]) -> LinearGradient {
        let rad = degrees * .pi / 180
        let dx = sin(rad)
        let dy = -cos(rad) // 화면 y-다운 기준 end 방향
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

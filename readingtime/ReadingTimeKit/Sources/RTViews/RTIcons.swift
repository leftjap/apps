import SwiftUI

// 시안 인라인 SVG path 모음 (frames/*.html 원본 그대로)
public enum RTIconPath {
    public static let logo = [
        "M12 5.8C9.6 4.2 6.5 3.8 3.6 4.5v14.2c2.9-.7 6-.3 8.4 1.3 2.4-1.6 5.5-2 8.4-1.3V4.5c-2.9-.7-6-.3-8.4 1.3z",
        "M12 5.8v14.2",
    ]
    public static let plus = ["M12 5v14M5 12h14"]
    public static let play = ["M8 5.5v13l11-6.5z"]
    public static let check = ["M5 12.5l4.5 4.5L19 7"]
    // 엎기(폰 회전)
    public static let flip = [
        "M8.5 4.5h7v15h-7z", // rect x8.5 y4.5 w7 h15 rx2 — rx 는 뷰에서 무시(스트로크 시각 차 미미) 대신 아래 라운드 rect 사용 권장
        "M4.2 9.2a8 8 0 0 1 3-3.6M19.8 14.8a8 8 0 0 1-3 3.6",
        "M4.2 6.2v3h3M19.8 17.8v-3h-3",
    ]
    // 탭(손) — 02 세그먼트·08 기록용
    public static let tapSeg = [
        "M10 9.5V5.4a1.8 1.8 0 0 1 3.6 0v6.6",
        "M13.6 9a1.7 1.7 0 0 1 3.4 0v5.5a5 5 0 0 1-5 5h-1a4 4 0 0 1-2.9-1.3l-3.1-3.2a1.7 1.7 0 0 1 2.5-2.3l1.5 1.3",
    ]
    // 탭존(손) — 05·08 탭 타일용
    public static let tapZone = [
        "M9 11.5V6a2 2 0 0 1 4 0v5",
        "M13 10a2 2 0 0 1 4 0v4.5a6 6 0 0 1-6 6h-.8a5 5 0 0 1-3.6-1.5l-3.3-3.4a1.9 1.9 0 0 1 2.7-2.6l1.5 1.4",
    ]
    public static let monitor = ["M3 5h18v12H3z", "M8 21h8M12 17v4"] // rect rx2 근사 별도 처리
    public static let clock = ["M12 8.5v3.5l2.5 2.5"] // + circle r8 별도
    public static let chevR = ["M1 1l6 7-6 7"] // viewBox 9×16
    public static let back = ["M12 4 6 10l6 6"] // viewBox 20
}

// 엎기 아이콘 (rect rx2 정확 재현)
public struct FlipIcon: View {
    let size: CGFloat
    let color: Color
    let lineWidth: CGFloat
    public init(size: CGFloat, color: Color, lineWidth: CGFloat = 2) {
        self.size = size
        self.color = color
        self.lineWidth = lineWidth
    }
    public var body: some View {
        let sc = size / 24
        ZStack {
            RoundedRectangle(cornerRadius: 2 * sc)
                .stroke(color, lineWidth: lineWidth * sc)
                .frame(width: 7 * sc, height: 15 * sc)
                .position(x: 12 * sc, y: 12 * sc)
            RTIcon([
                "M4.2 9.2a8 8 0 0 1 3-3.6M19.8 14.8a8 8 0 0 1-3 3.6",
                "M4.2 6.2v3h3M19.8 17.8v-3h-3",
            ], size: size, stroke: color, lineWidth: lineWidth)
        }
        .frame(width: size, height: size)
    }
}

// 탭 아이콘 (세그먼트 변형)
public struct TapIcon: View {
    let size: CGFloat
    let color: Color
    let lineWidth: CGFloat
    public init(size: CGFloat, color: Color, lineWidth: CGFloat = 1.9) {
        self.size = size
        self.color = color
        self.lineWidth = lineWidth
    }
    public var body: some View {
        RTIcon(RTIconPath.tapSeg, size: size, stroke: color, lineWidth: lineWidth)
    }
}

// 우향 셰브런 (viewBox 9×16)
public struct ChevronRight: View {
    let width: CGFloat
    let height: CGFloat
    let color: Color
    public init(width: CGFloat = 10, height: CGFloat = 10, color: Color) {
        self.width = width
        self.height = height
        self.color = color
    }
    public var body: some View {
        RTIcon(RTIconPath.chevR, width: width, height: height, viewBoxW: 9, viewBoxH: 16,
               stroke: color, lineWidth: 2.2)
    }
}

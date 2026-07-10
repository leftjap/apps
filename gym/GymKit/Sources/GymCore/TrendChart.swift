import Foundation
import CoreGraphics

// 8주 추이 차트 기하 — PWA stats.js renderWeeklyTrendChart + `<svg viewBox="0 0 320 160">` 정합.
//
// PWA 는 SVG 를 `width:100%; height:150px` 로 두고 기본 preserveAspectRatio="xMidYMid meet" 를 쓴다.
// → 균일 축소 + 좌우 레터박스. 이걸 재현하지 않고 컨테이너 폭을 그대로 쓰면 마지막 점(cx=320, r=4)이
//   우측에서 절반 잘린다 (2026-07-10 실기기 캡처로 확인).
public enum GymTrendChart {
    public static let vbW: CGFloat = 320, vbH: CGFloat = 160
    public static let padTop: CGFloat = 14, padBot: CGFloat = 14
    public static var chartH: CGFloat { vbH - padTop - padBot }   // 132

    /// viewBox → 컨테이너 좌표 매핑 (xMidYMid meet).
    public struct Fit {
        public let scale: CGFloat
        public let offsetX: CGFloat
        public let offsetY: CGFloat
        public func x(_ v: CGFloat) -> CGFloat { offsetX + v * scale }
        public func y(_ v: CGFloat) -> CGFloat { offsetY + v * scale }
        public func len(_ v: CGFloat) -> CGFloat { v * scale }
    }

    public static func fit(width: CGFloat, height: CGFloat) -> Fit {
        let s = min(width / vbW, height / vbH)
        return Fit(scale: s, offsetX: (width - vbW * s) / 2, offsetY: (height - vbH * s) / 2)
    }

    /// 막대 — slot = 320/n, barW = slot×0.55, 0인 주는 max(8, chartH×0.08) placeholder.
    public static func bar(index i: Int, count n: Int, value v: Double, maxValue: Double) -> CGRect {
        let slot = vbW / CGFloat(max(1, n)), barW = slot * 0.55
        let ratio = maxValue > 0 ? CGFloat(v / maxValue) : 0
        let h = ratio > 0 ? max(4, ratio * chartH) : max(8, chartH * 0.08)
        return CGRect(x: CGFloat(i) * slot + (slot - barW) / 2, y: padTop + (chartH - h),
                      width: barW, height: h)
    }

    /// 선/점 — step = 320/(n-1), 0 도 baseline 을 따라간다.
    public static func point(index i: Int, count n: Int, value v: Double, maxValue: Double) -> CGPoint {
        let step = n > 1 ? vbW / CGFloat(n - 1) : 0
        let ratio = maxValue > 0 ? CGFloat(v / maxValue) : 0
        return CGPoint(x: CGFloat(i) * step, y: padTop + (chartH - ratio * chartH))
    }
}

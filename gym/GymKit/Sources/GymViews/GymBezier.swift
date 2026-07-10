import CoreGraphics

// cubic-bezier(x1,y1,x2,y2) 솔버 — WebKit UnitBezier 알고리즘 (Newton-Raphson + 이분 폴백).
// CSS animation-timing-function 을 SwiftUI 로 정확히 이식하기 위한 것.
public struct UnitBezier: Sendable {
    private let cx, bx, ax, cy, by, ay: Double
    public init(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) {
        cx = 3 * x1; bx = 3 * (x2 - x1) - cx; ax = 1 - cx - bx
        cy = 3 * y1; by = 3 * (y2 - y1) - cy; ay = 1 - cy - by
    }
    private func sampleX(_ t: Double) -> Double { ((ax * t + bx) * t + cx) * t }
    private func sampleY(_ t: Double) -> Double { ((ay * t + by) * t + cy) * t }
    private func sampleDX(_ t: Double) -> Double { (3 * ax * t + 2 * bx) * t + cx }

    // 입력 x(진행 0…1) → 출력 y(이징된 진행). solve(0)=0, solve(1)=1.
    public func solve(_ x: Double, epsilon: Double = 1e-7) -> Double {
        if x <= 0 { return 0 }
        if x >= 1 { return 1 }
        var t = x
        for _ in 0..<8 {   // Newton-Raphson
            let x2 = sampleX(t) - x
            if abs(x2) < epsilon { return sampleY(t) }
            let d = sampleDX(t)
            if abs(d) < 1e-7 { break }
            t -= x2 / d
        }
        var lo = 0.0, hi = 1.0; t = x   // 이분 폴백
        while lo < hi {
            let x2 = sampleX(t)
            if abs(x2 - x) < epsilon { return sampleY(t) }
            if x > x2 { lo = t } else { hi = t }
            t = (hi - lo) / 2 + lo
        }
        return sampleY(t)
    }
}

// 시안 히어로 스왑/힌트 이징 — 구간별 cubic-bezier(.32,.72,.18,1).
public enum HeroSwapCurve {
    public static let bezier = UnitBezier(0.32, 0.72, 0.18, 1)

    // 키프레임 트랙 [(진행비율, 값)] 을 구간별 베지어 이징으로 평가 (CSS per-keyframe timing 정합).
    // stops 는 진행비율 오름차순. 범위 밖은 양끝 값으로 clamp.
    public static func eval(_ stops: [(Double, Double)], at p: Double) -> Double {
        guard let first = stops.first else { return 0 }
        if p <= first.0 { return first.1 }
        for i in 1..<stops.count {
            let (p0, v0) = stops[i - 1]
            let (p1, v1) = stops[i]
            if p <= p1 {
                let local = (p - p0) / (p1 - p0)
                return v0 + (v1 - v0) * bezier.solve(local)
            }
        }
        return stops.last!.1
    }
}

// 히어로 스왑 모션 값 (시안 gHeroSwapW/R). ep = 유효 진행(0…1, 지연 반영 후).
public enum HeroSwapMotion {
    public struct Frame: Equatable, Sendable {
        public let x: Double, scale: Double, opacity: Double, skew: Double, flash: Double
    }

    // 지연(reps 55ms)을 반영한 유효 진행 — 선형 p(길이 0.76+delay) → 지연 구간 0, 이후 0…1.
    public static let duration = 0.76
    public static func effectiveP(_ p: Double, delay: Double) -> Double {
        let total = duration + delay
        return max(0, min(1, (p * total - delay) / duration))
    }

    // IN(새 값): 0~38% 대기(투명) → 55% 착지(landOvershoot·landScale·crail 플래시) → 100% 정착.
    public static func live(dxIn: Double, landOvershoot: Double, landScale: Double, at ep: Double) -> Frame {
        Frame(
            x:       HeroSwapCurve.eval([(0, dxIn), (0.38, dxIn), (0.55, landOvershoot), (1, 0)], at: ep),
            scale:   HeroSwapCurve.eval([(0, 0.86), (0.38, 0.86), (0.55, landScale), (1, 1)], at: ep),
            opacity: HeroSwapCurve.eval([(0, 0), (0.38, 0), (0.55, 1), (1, 1)], at: ep),
            skew:    HeroSwapCurve.eval([(0, 5), (0.38, 5), (0.55, 0), (1, 0)], at: ep),
            flash:   HeroSwapCurve.eval([(0, 0), (0.55, 1), (0.74, 1), (1, 0)], at: ep))
    }

    // OUT(옛 값 고스트): 0~24% 좌 퇴장 + 페이드. fromDrag 는 제자리 페이드(0.15s=19.7%).
    public static func ghost(dxOut: Double, fromDrag: Bool, at ep: Double) -> Frame {
        Frame(
            x:       fromDrag ? 0 : HeroSwapCurve.eval([(0, 0), (0.24, dxOut), (1, dxOut)], at: ep),
            scale:   fromDrag ? 1 : HeroSwapCurve.eval([(0, 1), (0.24, 0.86), (1, 0.86)], at: ep),
            opacity: fromDrag ? HeroSwapCurve.eval([(0, 1), (0.197, 0), (1, 0)], at: ep)
                              : HeroSwapCurve.eval([(0, 1), (0.24, 0), (1, 0)], at: ep),
            skew:    fromDrag ? 0 : HeroSwapCurve.eval([(0, 0), (0.24, -6), (1, -6)], at: ep),
            flash:   0)
    }
}

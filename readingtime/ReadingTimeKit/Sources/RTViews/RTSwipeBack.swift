import Foundation
import CoreGraphics

// 좌→우 스와이프 뒤로가기의 순수 판정 로직.
// today 앱 사이드바/시트 제스처(sheetGesture.js)의 "손가락 1:1 추적 + 관성 snap" 상수를
// 가로축으로 포팅 — 두 앱의 스와이프 질감을 일치시킨다.
public enum RTSwipeBack {
    public enum Decision { case active, rejected }

    public static let decidePt: CGFloat = 6      // 방향 미결정 임계 (DECIDE_PX)
    public static let angleRatio: CGFloat = 1.2  // 가로:세로 우세비 (ANGLE)
    public static let snapRatio: CGFloat = 0.4   // 이동/폭 초과 시 전환 (SNAP_RATIO)
    public static let velRatio: CGFloat = 0.2    // 플릭 시 최소 이동 비율 (VEL_RATIO)
    public static let velThreshold: CGFloat = 500 // pt/s = 0.5 px/ms (VEL_TH)
    // CURVE cubic-bezier(.25,.46,.45,.94) — 뷰 쪽 Animation.timingCurve 로 사용
    public static let curve: (Double, Double, Double, Double) = (0.25, 0.46, 0.45, 0.94)

    /// 첫 6pt 이동 시점의 제스처 분류. nil = 아직 미결정.
    public static func classify(dx: CGFloat, dy: CGFloat) -> Decision? {
        guard abs(dx) >= decidePt || abs(dy) >= decidePt else { return nil }
        return (dx > 0 && abs(dx) > abs(dy) * angleRatio) ? .active : .rejected
    }

    /// 손을 뗄 때 뒤로가기 확정 여부 (거리 40% 초과 or 빠른 플릭 + 20% 초과)
    public static func shouldPop(dx: CGFloat, width: CGFloat, velocity: CGFloat) -> Bool {
        guard width > 0 else { return false }
        let pct = dx / width
        return pct > snapRatio || (velocity > velThreshold && pct > velRatio)
    }
}

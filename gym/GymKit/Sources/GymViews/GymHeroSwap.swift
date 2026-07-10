import SwiftUI
import GymCore

// 세트 완료 좌스와이프 모션 (작업지시서 §5.3 / #7b 정본) —
// gHeroSwapW/R(760ms, cubic-bezier(.32,.72,.18,1)) + gSwipeHint(760ms) 키프레임 이식.
// 라이브 히어로(새 값) = IN 트랙, 고스트(옛 값) = OUT 트랙. 전부 pointer-events 불간섭.

// IN — 새 값이 우측(+88/+82)에서 진입, 착지 오버슈트(1.08/1.09) + crail 플래시 후 정착.
// 시간축: 0~38% 대기(고스트 퇴장 구간) → 55% 착지 → 74% 플래시 유지 → 100% 정착. 횟수 행은 55ms 지연.
struct HeroRowSwapIn: ViewModifier {
    var trigger: Int
    var delay: Double         // 0 (중량) / 0.055 (횟수)
    var dxIn: CGFloat         // 88 / 82
    var landScale: CGFloat    // 1.08 / 1.09
    var landOvershoot: CGFloat = -8   // 착지 오버슈트 — 중량 -8 / 횟수 -6 (시안 gHeroSwapW/R 55%)
    var baseColor: Color = GY.ink1    // 정착 색 — 중량 ink-1 / 횟수 ink-2 (시안 §6)
    struct V {
        var x: CGFloat = 0; var s: CGFloat = 1; var o: CGFloat = 1
        var skew: CGFloat = 0; var flash: CGFloat = 0
    }
    func body(content: Content) -> some View {
        content.keyframeAnimator(initialValue: V(), trigger: trigger) { view, v in
            view
                // 착지 색 플래시 — gHeroSwapW/R 의 color 키프레임 (55%~74% crail-deep → 100% 정착)
                .foregroundStyle(Color.lerpSRGB(baseColor, GY.crailDeep, v.flash))
                .opacity(v.o)
                .scaleEffect(v.s)
                .transformEffect(CGAffineTransform(a: 1, b: 0, c: tan(v.skew * .pi / 180), d: 1, tx: 0, ty: 0))
                .offset(x: v.x)
        } keyframes: { _ in
            KeyframeTrack(\.x) {
                MoveKeyframe(dxIn)
                LinearKeyframe(dxIn, duration: 0.29 + delay)
                CubicKeyframe(landOvershoot, duration: 0.13)
                CubicKeyframe(0, duration: 0.34)
            }
            KeyframeTrack(\.s) {
                MoveKeyframe(0.86)
                LinearKeyframe(0.86, duration: 0.29 + delay)
                CubicKeyframe(landScale, duration: 0.13)
                CubicKeyframe(1, duration: 0.34)
            }
            KeyframeTrack(\.o) {
                MoveKeyframe(0)
                LinearKeyframe(0, duration: 0.29 + delay)
                CubicKeyframe(1, duration: 0.13)
                LinearKeyframe(1, duration: 0.34)
            }
            KeyframeTrack(\.skew) {
                MoveKeyframe(5)
                LinearKeyframe(5, duration: 0.29 + delay)
                CubicKeyframe(0, duration: 0.13)
                LinearKeyframe(0, duration: 0.34)
            }
            KeyframeTrack(\.flash) {
                MoveKeyframe(0)
                LinearKeyframe(0, duration: 0.29 + delay)
                LinearKeyframe(1, duration: 0.13)
                LinearKeyframe(1, duration: 0.14)   // 74% 까지 유지
                LinearKeyframe(0, duration: 0.20)
            }
        }
    }
}

// OUT — 옛 값 고스트: 좌 -96px(중량) / -88px(횟수, 55ms 지연) + skewX(-6°) + 페이드 (0~24% = 182ms).
// 드래그 커밋(fromDrag)은 이미 좌로 끌려 있으므로 위치 점프 없이 제자리 페이드 (session.js 정합).
struct HeroGhostOut: ViewModifier {
    let fromDrag: Bool
    var dxOut: CGFloat = -96    // 시안 §6 gHeroSwapW -96 / gHeroSwapR -88
    var delay: Double = 0       // 횟수 행 55ms
    @State private var fired = false
    struct V { var x: CGFloat = 0; var s: CGFloat = 1; var o: CGFloat = 1; var skew: CGFloat = 0 }
    func body(content: Content) -> some View {
        content.keyframeAnimator(initialValue: V(), trigger: fired) { view, v in
            view
                .opacity(v.o)
                .scaleEffect(v.s)
                .transformEffect(CGAffineTransform(a: 1, b: 0, c: tan(v.skew * .pi / 180), d: 1, tx: 0, ty: 0))
                .offset(x: v.x)
        } keyframes: { _ in
            KeyframeTrack(\.x) {
                LinearKeyframe(0, duration: delay)
                CubicKeyframe(fromDrag ? 0 : dxOut, duration: 0.182)
                LinearKeyframe(fromDrag ? 0 : dxOut, duration: 0.6)
            }
            KeyframeTrack(\.s) {
                LinearKeyframe(1, duration: delay)
                CubicKeyframe(fromDrag ? 1 : 0.86, duration: 0.182)
                LinearKeyframe(fromDrag ? 1 : 0.86, duration: 0.6)
            }
            KeyframeTrack(\.o) {
                LinearKeyframe(1, duration: delay)
                CubicKeyframe(0, duration: fromDrag ? 0.15 : 0.182)
                LinearKeyframe(0, duration: 0.6)
            }
            KeyframeTrack(\.skew) {
                LinearKeyframe(0, duration: delay)
                CubicKeyframe(fromDrag ? 0 : -6, duration: 0.182)
                LinearKeyframe(fromDrag ? 0 : -6, duration: 0.6)
            }
        }
        .onAppear { fired = true }
        .allowsHitTesting(false)
    }
}

// sRGB 선형 보간 — 히어로 착지 색 플래시 (SwiftUI Color 는 Animatable 이 아니라 직접 계산).
extension Color {
    static func lerpSRGB(_ a: Color, _ b: Color, _ t: Double) -> Color {
        guard t > 0 else { return a }
        guard t < 1 else { return b }
        #if canImport(UIKit)
        let ca = UIColor(a), cb = UIColor(b)
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        ca.getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
        cb.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        let f = CGFloat(t)
        return Color(.sRGB, red: Double(r1 + (r2 - r1) * f), green: Double(g1 + (g2 - g1) * f),
                     blue: Double(b1 + (b2 - b1) * f), opacity: Double(a1 + (a2 - a1) * f))
        #else
        return t < 0.5 ? a : b
        #endif
    }
}

// 시안 셰브런 ‹ — "M15 5l-7 7 7 7" (viewBox 24×24, 42px, stroke 2.8, round)
struct ChevronLeftGlyph: Shape {
    static func stroke(_ size: CGFloat) -> StrokeStyle {
        StrokeStyle(lineWidth: 2.8 * size / 24, lineCap: .round, lineJoin: .round)
    }
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        var p = Path()
        p.move(to: CGPoint(x: 15 * s, y: 5 * s))
        p.addLine(to: CGPoint(x: 8 * s, y: 12 * s))
        p.addLine(to: CGPoint(x: 15 * s, y: 19 * s))
        return p
    }
}

// 좌스와이프 방향 큐 (gSwipeHint 760ms) — crail 스트릭 밴드 + 삼중 셰브런 + 리딩 엣지 라인이 좌향 흐름.
// 위치는 전부 시안 #7b 의 % 기준 (컨테이너 폭·높이 비례) — 고정 pt 하드코딩 금지.
struct SwipeCue: View {
    @State private var fired = false
    struct V { var x: CGFloat = 52; var o: CGFloat = 0 }
    var body: some View {
        GeometryReader { g in
            let w = g.size.width, h = g.size.height
            ZStack(alignment: .topLeading) {
                // 스트릭 밴드 — top:0; left:-16%; right:-16%; height:128; radius 64
                LinearGradient(stops: [
                    .init(color: .clear, location: 0),
                    .init(color: Color(oklch: 0.67, 0.12, 50).opacity(0.10), location: 0.28),
                    .init(color: Color(oklch: 0.67, 0.12, 50).opacity(0.32), location: 0.60),
                    .init(color: Color(oklch: 0.67, 0.12, 50).opacity(0.05), location: 0.72),
                    .init(color: .clear, location: 1),
                ], startPoint: .leading, endPoint: .trailing)
                .frame(width: w * 1.32, height: 128)
                .clipShape(RoundedRectangle(cornerRadius: 64))
                .offset(x: -w * 0.16, y: 0)
                // 리딩 엣지 라인 — top:4%; bottom:4%; right:-6%; width 3; radius 2
                LinearGradient(stops: [
                    .init(color: .clear, location: 0),
                    .init(color: Color(oklch: 0.67, 0.12, 50).opacity(0.85), location: 0.5),
                    .init(color: .clear, location: 1),
                ], startPoint: .top, endPoint: .bottom)
                .frame(width: 3, height: h * 0.92)
                .clipShape(RoundedRectangle(cornerRadius: 2))
                .offset(x: w * 1.06 - 3, y: h * 0.04)
                // 삼중 셰브런 ‹‹‹ — top:30%; right:-2%; 42px, margin-left -24, 불투명도 1/0.55/0.28
                HStack(spacing: -24) {
                    ForEach(0..<3, id: \.self) { i in
                        ChevronLeftGlyph()
                            .stroke(Color(oklch: 0.48, 0.14, 50), style: ChevronLeftGlyph.stroke(42))
                            .frame(width: 42, height: 42)
                            .opacity([1, 0.55, 0.28][i])
                    }
                }
                .fixedSize()
                .offset(x: w * 1.02 - 78, y: h * 0.30)   // 3칩 폭 = 42*3 - 24*2 = 78
            }
        }
        .keyframeAnimator(initialValue: V(), trigger: fired) { view, v in
            view.offset(x: v.x).opacity(v.o)
        } keyframes: { _ in
            KeyframeTrack(\.x) {
                MoveKeyframe(52)
                LinearKeyframe(-52, duration: 0.395)   // 52%
                LinearKeyframe(-108, duration: 0.365)  // 100%
            }
            KeyframeTrack(\.o) {
                MoveKeyframe(0)
                LinearKeyframe(1, duration: 0.137)     // 18%
                LinearKeyframe(0.6, duration: 0.258)   // 52%
                LinearKeyframe(0, duration: 0.365)     // 100%
            }
        }
        .onAppear { fired = true }
        .allowsHitTesting(false)
    }
}

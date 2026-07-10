import SwiftUI
import GymCore

// 세트 완료 좌스와이프 모션 (작업지시서 §5.3 / #7b 정본) —
// gHeroSwapW/R(760ms, cubic-bezier(.32,.72,.18,1)) + gSwipeHint(760ms) 키프레임 이식.
// 라이브 히어로(새 값) = IN 트랙, 고스트(옛 값) = OUT 트랙. 전부 pointer-events 불간섭.

// IN — 새 값이 우측(+88/+82)에서 진입, 착지 오버슈트(1.08/1.09) + crail 플래시 후 정착.
// 시간축: 0~38% 대기(고스트 퇴장 구간) → 55% 착지 → 74% 플래시 유지 → 100% 정착. 횟수 행은 55ms 지연.
struct HeroRowSwapIn: ViewModifier {
    var trigger: Int
    var delay: Double        // 0 (중량) / 0.055 (횟수)
    var dxIn: CGFloat        // 88 / 82
    var landScale: CGFloat   // 1.08 / 1.09
    struct V {
        var x: CGFloat = 0; var s: CGFloat = 1; var o: CGFloat = 1
        var skew: CGFloat = 0; var flash: CGFloat = 0
    }
    func body(content: Content) -> some View {
        content.keyframeAnimator(initialValue: V(), trigger: trigger) { view, v in
            view
                .opacity(v.o)
                .scaleEffect(v.s)
                .transformEffect(CGAffineTransform(a: 1, b: 0, c: tan(v.skew * .pi / 180), d: 1, tx: 0, ty: 0))
                .offset(x: v.x)
                .shadow(color: GY.crailDeep.opacity(v.flash * 0.55), radius: 9)   // 착지 crail 플래시 근사
        } keyframes: { _ in
            KeyframeTrack(\.x) {
                MoveKeyframe(dxIn)
                LinearKeyframe(dxIn, duration: 0.29 + delay)
                CubicKeyframe(-8, duration: 0.13)
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

// OUT — 옛 값 고스트: 좌 -96px + skewX(-6°) + 페이드 (0~24% = 182ms).
// 드래그 커밋(fromDrag)은 이미 좌로 끌려 있으므로 위치 점프 없이 제자리 페이드 (session.js 정합).
struct HeroGhostOut: ViewModifier {
    let fromDrag: Bool
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
                CubicKeyframe(fromDrag ? 0 : -96, duration: 0.182)
                LinearKeyframe(fromDrag ? 0 : -96, duration: 0.6)
            }
            KeyframeTrack(\.s) {
                CubicKeyframe(fromDrag ? 1 : 0.86, duration: 0.182)
                LinearKeyframe(fromDrag ? 1 : 0.86, duration: 0.6)
            }
            KeyframeTrack(\.o) {
                CubicKeyframe(0, duration: fromDrag ? 0.15 : 0.182)
                LinearKeyframe(0, duration: 0.6)
            }
            KeyframeTrack(\.skew) {
                CubicKeyframe(fromDrag ? 0 : -6, duration: 0.182)
                LinearKeyframe(fromDrag ? 0 : -6, duration: 0.6)
            }
        }
        .onAppear { fired = true }
        .allowsHitTesting(false)
    }
}

// 좌스와이프 방향 큐 (gSwipeHint 760ms) — crail 스트릭 밴드 + 삼중 셰브런 + 리딩 엣지 라인이 좌향 흐름.
struct SwipeCue: View {
    @State private var fired = false
    struct V { var x: CGFloat = 52; var o: CGFloat = 0 }
    var body: some View {
        ZStack {
            // 스트릭 밴드 — 좌향 crail 그라디언트 (h128, radius 64)
            LinearGradient(stops: [
                .init(color: .clear, location: 0),
                .init(color: Color(oklch: 0.67, 0.12, 50).opacity(0.10), location: 0.28),
                .init(color: Color(oklch: 0.67, 0.12, 50).opacity(0.32), location: 0.60),
                .init(color: Color(oklch: 0.67, 0.12, 50).opacity(0.05), location: 0.72),
                .init(color: .clear, location: 1),
            ], startPoint: .leading, endPoint: .trailing)
            .frame(height: 128)
            .clipShape(RoundedRectangle(cornerRadius: 64))
            .padding(.horizontal, -32)
            // 리딩 엣지 라인 — 우측 세로 그라디언트 3px
            HStack {
                Spacer()
                LinearGradient(stops: [
                    .init(color: .clear, location: 0),
                    .init(color: Color(oklch: 0.67, 0.12, 50).opacity(0.85), location: 0.5),
                    .init(color: .clear, location: 1),
                ], startPoint: .top, endPoint: .bottom)
                .frame(width: 3, height: 150)
                .clipShape(Capsule())
                .padding(.trailing, -4)
            }
            // 삼중 셰브런 ‹‹‹ (42px, 0.55/0.28 페이드)
            HStack(spacing: -24) {
                ForEach(0..<3, id: \.self) { i in
                    Image(systemName: "chevron.left")
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(Color(oklch: 0.48, 0.14, 50))
                        .opacity([1, 0.55, 0.28][i])
                }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.trailing, 8)
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

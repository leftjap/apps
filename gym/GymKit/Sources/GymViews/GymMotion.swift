import SwiftUI
import GymCore

// 상시 모션 컴포넌트 — mocks @keyframes 이식 (barPulse/segGlow/breath, 카운트업).
// 전부 reduced-motion 게이트 + 스냅샷(gymshot) 모드에서는 정적 (ImageRenderer 안전).

// box-shadow "0 0 0 Npx color" 링 펄스 — 도형 밖으로 spread 되는 글로우를 외곽 스트로크로 재현.
// CSS: 0%,100% alpha 0 / 50% alpha max, infinite → autoreverse 반주기.
struct PulseGlow: ViewModifier {
    var color: Color
    var maxAlpha: Double
    var spread: CGFloat
    var cornerRadius: CGFloat
    var period: Double = 1.8
    @State private var on = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .inset(by: -spread / 2)
                    .strokeBorder(color.opacity(on ? maxAlpha : 0), lineWidth: spread)
                    .allowsHitTesting(false)
            }
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion else { return }
                withAnimation(.easeInOut(duration: period / 2).repeatForever(autoreverses: true)) {
                    on = true
                }
            }
    }
}

extension View {
    // 세트 세그 글로우 (mocks barPulse/segGlow — crail 4px 링 펄스)
    func segGlow(cornerRadius: CGFloat, alpha: Double = 0.16) -> some View {
        modifier(PulseGlow(color: GY.crailBase, maxAlpha: alpha, spread: 4, cornerRadius: cornerRadius))
    }
    // 조건부 세그 글로우 — now 세그에만 (뷰 타입 안정 위해 ViewBuilder 분기)
    @ViewBuilder func segGlowIf(_ cond: Bool, cornerRadius: CGFloat, alpha: Double = 0.16) -> some View {
        if cond { segGlow(cornerRadius: cornerRadius, alpha: alpha) } else { self }
    }
    // 이어하기 카드 숨쉬기 (mocks breath — crail 5px 링 펄스, 2.8s)
    func breathGlow(cornerRadius: CGFloat) -> some View {
        modifier(PulseGlow(color: GY.crailBase, maxAlpha: 0.10, spread: 5,
                           cornerRadius: cornerRadius, period: 2.8))
    }
}

// 볼륨 카운트업 — session.js animNum(620ms ease-out-cubic) 정합. withAnimation 트랜잭션에서만 구동
// (커밋 시에만 호출부가 애니 래핑 → 키패드 수정·리로드 오발화 없음, PWA countUp 가드 정합).
struct CountUpVolumeText: View, Animatable {
    var value: Double
    var tint: Color = GY.ink1   // 초과(over) 시 crail-deep (mock .cur.over)
    var animatableData: Double {
        get { value }
        set { value = newValue }
    }
    static let nf: NumberFormatter = {
        let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f
    }()
    var body: some View {
        Text(Self.nf.string(from: NSNumber(value: value.rounded())) ?? "0")
            .font(.mono(32, 700)).tracking(-1.12).foregroundStyle(tint)
    }
}

// 햅틱 링 (mocks #hapticRing, 부록 작업지시서) — 세트 완료 커밋 직후 1회.
// 일반: 420ms scale .4→1 / PR: 540ms scale .4→2.1 (글로우는 소프트 섀도로 근사).
struct HapticRing: View {
    let isPR: Bool
    @State private var expand = false
    var body: some View {
        Circle()
            .strokeBorder(GY.crailBase, lineWidth: 2)
            .frame(width: 118, height: 118)
            .shadow(color: GY.crailBase.opacity(isPR ? 0.45 : 0.3), radius: expand ? (isPR ? 14 : 8) : 0)
            .scaleEffect(expand ? (isPR ? 2.1 : 1.0) : 0.4)
            .opacity(expand ? 0 : 0.9)
            .allowsHitTesting(false)
            .onAppear {
                withAnimation(.timingCurve(0.2, 0.7, 0.2, 1, duration: isPR ? 0.54 : 0.42)) {
                    expand = true
                }
            }
    }
}

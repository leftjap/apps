import SwiftUI

// MOTION.md 키프레임 카탈로그 → SwiftUI 이식. duration·easing·delay 는 스펙 유지.
// 원칙: 모션은 상태 전달 — 정지 상태에서 "살아있는" 모션(물결·점멸)은 반드시 멈춘다.
//
// rtMotionEnabled 기본 false: rtshot 정적 렌더는 항상 키프레임 종료 상태(픽셀 검증 기준)와
// 동일하게 나온다. rtapp(데모 셸)만 .rtMotion(true) 로 활성화.
// prefers-reduced-motion: 활성화 상태라도 accessibilityReduceMotion 이면 무한 모션은 정적 대체.

private struct RTMotionEnabledKey: EnvironmentKey {
    static let defaultValue = false
}

public extension EnvironmentValues {
    var rtMotionEnabled: Bool {
        get { self[RTMotionEnabledKey.self] }
        set { self[RTMotionEnabledKey.self] = newValue }
    }
}

public extension View {
    func rtMotion(_ enabled: Bool = true) -> some View {
        environment(\.rtMotionEnabled, enabled)
    }
}

// 책 부유 위상 — 단일 소스(RTBook3D 부유 + 접지 그림자 동기가 공유). support.js: sin(.7t)·3.5.
public func rtBookFloatY(_ t: Double) -> CGFloat { CGFloat(sin(t * 0.7) * 3.5) }

// "오늘 읽음" 카운트업 값 — 등장 후 경과초(elapsed) → 정수값. ease-out cubic, ~1s.
// RTMotionFrame 이 라이브에서 등장-후-경과초를 넘기므로(절대시각 아님) 이 함수가 진행을 담당.
public func rtCountUpValue(_ target: Int, elapsed: Double) -> Int {
    let p = min(1, max(0, elapsed / 1.0))
    return Int((Double(target) * (1 - pow(1 - p, 3))).rounded())
}

// rtEnter/rtRise 진입 스태거 (홈 02: 칩 dy10·.5s·.04s / 제목블록·카드 dy16·.6s / .18s·.26s) —
// opacity 0→1 + translateY dy→0, ease-out 근사. rtFrozenTime 으로 결정적 검증 가능(RTEntrance 와
// 달리 delay/dy 파라미터화 + --at 프레임 지원).
public extension View {
    func rtRiseIn(dy: CGFloat = 16, duration: Double = 0.6, delay: Double = 0) -> some View {
        modifier(RTRiseIn(dy: dy, duration: duration, delay: delay))
    }
}
struct RTRiseIn: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.rtFrozenTime) private var frozen
    let dy: CGFloat
    let duration: Double
    let delay: Double
    @State private var shown = false

    private func pose(_ content: Content, _ p: Double) -> some View {
        content.opacity(p).offset(y: dy * (1 - p))
    }
    func body(content: Content) -> some View {
        if let frozen {
            let raw = min(1, max(0, (frozen - delay) / duration))
            return AnyView(pose(content, 1 - pow(1 - raw, 3)))   // ease-out cubic 근사
        } else if enabled && !reduce {
            return AnyView(pose(content, shown ? 1 : 0).onAppear {
                withAnimation(.easeOut(duration: duration).delay(delay)) { shown = true }
            })
        } else {
            return AnyView(content)
        }
    }
}

// CSS cubic-bezier(x1,y1,x2,y2) 와 동일 정의(P0=(0,0), P3=(1,1)) — x=progress 에서의 y(진행값).
// 뉴턴-랩슨으로 베지어 매개변수 t 를 역산. 고정-시간 검증 프레임이 실제 라이브 .timingCurve
// 애니메이션(오버슈트 포함)과 일치하도록 사용 — .rtBookDropIn() 등.
func rtCubicBezier(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double, at progress: Double) -> Double {
    let x = min(1, max(0, progress))
    if x == 0 { return 0 }
    if x == 1 { return 1 }
    func bx(_ t: Double) -> Double { 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t }
    func by(_ t: Double) -> Double { 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t }
    func dbx(_ t: Double) -> Double { 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2) }
    var t = x
    for _ in 0..<8 {
        let dx = dbx(t)
        if abs(dx) < 1e-6 { break }
        t -= (bx(t) - x) / dx
        t = min(1, max(0, t))
    }
    return by(t)
}

// 고정 시간 주입 — rtshot --at <t> 가 특정 모션 프레임을 결정적으로 렌더(화면 검증)하도록.
// nil = 라이브(TimelineView 실시간). 값 = 등장 후 경과초 t 로 고정.
private struct RTFrozenTimeKey: EnvironmentKey { static let defaultValue: Double? = nil }
public extension EnvironmentValues {
    var rtFrozenTime: Double? {
        get { self[RTFrozenTimeKey.self] }
        set { self[RTFrozenTimeKey.self] = newValue }
    }
}

// 책 드롭-인 진입 (rtBookIn): opacity 0→1 + translateY -28→0 + scale .9→1→1.02→1,
// ~0.9s cubic-bezier(.2,1.05,.3,1) delay .12s. 정지=정립, 라이브=onAppear 1회, 검증=고정 진행률.
public extension View {
    func rtBookDropIn() -> some View { modifier(RTBookDropIn()) }
}
struct RTBookDropIn: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.rtFrozenTime) private var frozen
    @State private var p: Double = 0
    @ViewBuilder private func pose(_ content: Content, _ pp: Double) -> some View {
        content.opacity(pp).offset(y: -28 * (1 - pp)).scaleEffect(0.9 + 0.1 * pp)
    }
    func body(content: Content) -> some View {
        if let frozen {
            let raw = min(1, max(0, (frozen - 0.12) / 0.9))
            pose(content, rtCubicBezier(0.2, 1.05, 0.3, 1, at: raw))
        } else if enabled && !reduce {
            pose(content, p).onAppear {
                withAnimation(.timingCurve(0.2, 1.05, 0.3, 1, duration: 0.9).delay(0.12)) { p = 1 }
            }
        } else {
            content
        }
    }
}

// 모션 프레임 래퍼: 정지 렌더(픽셀 오라클)=rest, 라이브=등장 후 경과초, 검증=고정 t.
// t 는 반드시 "등장 후 경과초" — 라이브도 절대시각이 아니라 등장 시점 기준 경과초를 넘긴다.
// (이전엔 timeIntervalSinceReferenceDate(절대초 ~8e8)를 넘겨 ① 일회성 카운트업이 라이브에서
//  즉시 스냅되고 ② 주기 모션의 라이브 위상이 --at 검증 프레임과 어긋났음 — 리뷰 지적 #1 수정.)
// start 는 onAppear(라이브 경로에서만) 에 캡처 — frozen/rest 렌더 경로는 Date() 를 호출하지 않아
// rtshot 결정성 유지.
public struct RTMotionFrame<Rest: View, Anim: View>: View {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduce
    @Environment(\.rtFrozenTime) private var frozen
    @State private var start: Date?
    let rest: () -> Rest
    let anim: (Double) -> Anim
    public init(@ViewBuilder rest: @escaping () -> Rest, @ViewBuilder anim: @escaping (Double) -> Anim) {
        self.rest = rest; self.anim = anim
    }
    public var body: some View {
        if let frozen {
            anim(frozen)
        } else if enabled && !reduce {
            TimelineView(.animation) { ctx in
                anim(ctx.date.timeIntervalSince(start ?? ctx.date))
            }
            .onAppear { if start == nil { start = Date() } }
        } else {
            rest()
        }
    }
}

// 공통: 모션 허용 여부(플래그 + reduce-motion) 판단 후 무한 왕복 애니메이션 구동.
// rest = 비활성(정적 렌더) 값 — CSS 의 "애니메이션 없는 기본 스타일"과 동일해야 한다.
private struct RTAnimated<V: Equatable>: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let rest: V
    let from: V
    let to: V
    let animation: Animation
    let apply: (AnyView, V) -> AnyView
    @State private var value: V?

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        return apply(AnyView(content), active ? (value ?? from) : rest)
            .onAppear {
                guard active else { return }
                value = from
                withAnimation(animation) { value = to }
            }
    }
}

// ── v4Float: translateY 0→-6→0, 6~8s ease-in-out ∞ (로고·홈 표지·빈 표지 부유) ──
public extension View {
    func rtFloat(duration: Double = 7, delay: Double = 0) -> some View {
        modifier(RTAnimated(
            rest: CGFloat(0), from: CGFloat(0), to: CGFloat(-6),
            animation: .easeInOut(duration: duration / 2).delay(delay).repeatForever(autoreverses: true),
            apply: { v, y in AnyView(v.offset(y: y)) }))
    }

    // ── rtShadow8: scale 1↔.86, opacity .42↔.26 ∞ (홈 표지 바닥 그림자, 부유 동기) ──
    // 정적(모션 off) = scale 1 · opacity .42 (시안 0% 키프레임)
    func rtFloorShadow(duration: Double = 10) -> some View {
        modifier(RTFloorShadow(duration: duration))
    }

    // ── v4Blink: opacity 1→.25→1 ∞ (라이브 점·스트릭 마지막 점·검색 캐럿) ──
    func rtBlink(duration: Double = 1.6) -> some View {
        modifier(RTAnimated(
            rest: 1.0, from: 1.0, to: 0.25,
            animation: .easeInOut(duration: duration / 2).repeatForever(autoreverses: true),
            apply: { v, o in AnyView(v.opacity(o)) }))
    }

    // ── v5Fade: opacity 0→1 + translateY 8→0, .45~.6s + delay (진입 스태거) ──
    func rtEntrance(delay: Double = 0, duration: Double = 0.5) -> some View {
        modifier(RTEntrance(delay: delay, duration: duration))
    }

    // ── v5Pop: scale .6→1.1→1 (체크 원·표지·스테퍼 숫자·추가됨 ✓) ──
    func rtPop(delay: Double = 0, duration: Double = 0.45) -> some View {
        modifier(RTPop(delay: delay, duration: duration))
    }

    // ── v5Sweep: scaleX 0→1 origin left (밑줄·신규 바·진행 바) ──
    func rtSweep(delay: Double = 0, duration: Double = 1.0) -> some View {
        modifier(RTSweep(delay: delay, duration: duration))
    }

    // ── v6Spin: rotate 360 linear ∞ (04 점선 링 26s·밀리 동기화 5s) ──
    func rtSpin(duration: Double) -> some View {
        modifier(RTSpin(duration: duration))
    }

    // ── v6Breath: opacity .45↔1 (03 00:00:00·10 시간대) ──
    func rtBreath(duration: Double = 2.8) -> some View {
        modifier(RTAnimated(
            rest: 1.0, from: 1.0, to: 0.45,
            animation: .easeInOut(duration: duration / 2).repeatForever(autoreverses: true),
            apply: { v, o in AnyView(v.opacity(o)) }))
    }

    // ── v8Dim: opacity .85↔.58, 3.4s ∞ (일시정지 시간 숫자) ──
    func rtPausedDim() -> some View {
        modifier(RTAnimated(
            rest: 1.0, from: 0.85, to: 0.58,
            animation: .easeInOut(duration: 1.7).repeatForever(autoreverses: true),
            apply: { v, o in AnyView(v.opacity(o)) }))
    }

    // ── v5Tick: opacity 1↔.15 step 1s ∞ (라이브 타이머 콜론 — 일시정지 시 정지) ──
    func rtColonTick(active: Bool = true, restOpacity: Double = 1) -> some View {
        modifier(RTColonTick(active: active, restOpacity: restOpacity))
    }
}

// ── v5RippleBtn: 보더 링 scale 1→1.22 + fade, 2.6~3s ease-out ∞ (홈/빈홈 CTA "무장됨" 링) ──
public extension View {
    func rtRippleBtn(duration: Double = 3) -> some View {
        modifier(RTRippleBtn(duration: duration))
    }
}

struct RTRippleBtn: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let duration: Double
    @State private var animating = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .scaleEffect(active && animating ? 1.22 : 1)
            .opacity(active && animating ? 0 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.easeOut(duration: duration).repeatForever(autoreverses: false)) {
                    animating = true
                }
            }
    }
}

// rtShadow8 — scale 1↔.86, opacity .42↔.26 (부유 동기). 정적 = scale 1 · opacity .42
struct RTFloorShadow: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let duration: Double
    @State private var t = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .scaleEffect(active && t ? 0.86 : 1)
            .opacity(active && t ? 0.26 : 0.42)
            .onAppear {
                guard active else { return }
                withAnimation(.easeInOut(duration: duration / 2).repeatForever(autoreverses: true)) { t = true }
            }
    }
}

// v5Fade 진입 — 종료 상태로 렌더 시작해야 하는 정적 렌더와 달리, 모션 시 0에서 시작
struct RTEntrance: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let delay: Double
    let duration: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .opacity(active && !shown ? 0 : 1)
            .offset(y: active && !shown ? 8 : 0)
            .onAppear {
                guard active else { return }
                withAnimation(.easeOut(duration: duration).delay(delay)) { shown = true }
            }
    }
}

// v5Pop — cubic-bezier(.2,1.2,.4,1) 근사: spring 오버슈트
struct RTPop: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let delay: Double
    let duration: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .scaleEffect(active && !shown ? 0.6 : 1)
            .opacity(active && !shown ? 0 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.timingCurve(0.2, 1.2, 0.4, 1, duration: duration).delay(delay)) { shown = true }
            }
    }
}

// v5Sweep — scaleX 0→1 (origin left)
struct RTSweep: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let delay: Double
    let duration: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .scaleEffect(x: active && !shown ? 0 : 1, y: 1, anchor: .leading)
            .onAppear {
                guard active else { return }
                withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: duration).delay(delay)) { shown = true }
            }
    }
}

// v6Spin — linear 360 ∞
struct RTSpin: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let duration: Double
    @State private var angle: Double = 0

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        return content
            .rotationEffect(.degrees(active ? angle : 0))
            .onAppear {
                guard active else { return }
                withAnimation(.linear(duration: duration).repeatForever(autoreverses: false)) { angle = 360 }
            }
    }
}

// v5Tick — 0~54% 불투명 1, 55~100% .15 (1s steps ∞). 정지 시 restOpacity.
struct RTColonTick: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let active: Bool
    var restOpacity: Double = 1

    func body(content: Content) -> some View {
        if enabled && !reduceMotion && active {
            TimelineView(.periodic(from: .now, by: 0.05)) { ctx in
                let phase = ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 1)
                content.opacity(phase < 0.55 ? 1 : 0.15)
            }
        } else {
            content.opacity(restOpacity)
        }
    }
}

// ── v6Flip: rotateX 0(0~12%)→180(42~58%)→360(88~100%), ∞ (03 폰 텀블·04 미니 플립) ──
public extension View {
    func rtTumble(duration: Double) -> some View {
        modifier(RTTumble(duration: duration))
    }

    /// v7Shadow — 텀블과 동기: scale 1↔1.28, opacity .32↔.6 (같은 hold 구간)
    func rtTumbleShadow(duration: Double, restOpacity: Double = 0.32) -> some View {
        modifier(RTTumbleShadow(duration: duration, restOpacity: restOpacity))
    }

    /// 조건부 v6Spin (04 점선 링 — app.js: paused 일 때만 회전)
    @ViewBuilder func rtSpinIf(_ condition: Bool, duration: Double) -> some View {
        if condition { rtSpin(duration: duration) } else { self }
    }
}

// v6Flip 위상: 구간 홀드 + 세그먼트 보간 (easing 은 ease-in-out 근사)
func rtFlipAngle(_ t: Double) -> Double {
    let p = t.truncatingRemainder(dividingBy: 1)
    func seg(_ a: Double, _ b: Double) -> Double {
        let x = (p - a) / (b - a)
        return x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2   // easeInOut
    }
    switch p {
    case ..<0.12: return 0
    case ..<0.42: return 180 * seg(0.12, 0.42)
    case ..<0.58: return 180
    case ..<0.88: return 180 + 180 * seg(0.58, 0.88)
    default: return 360
    }
}

struct RTTumble: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let duration: Double

    func body(content: Content) -> some View {
        if enabled && !reduceMotion {
            TimelineView(.animation) { ctx in
                let t = ctx.date.timeIntervalSinceReferenceDate / duration
                content.rotation3DEffect(.degrees(rtFlipAngle(t)), axis: (x: 1, y: 0, z: 0),
                                         perspective: 0.6)
            }
        } else {
            content
        }
    }
}

struct RTTumbleShadow: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let duration: Double
    let restOpacity: Double

    func body(content: Content) -> some View {
        if enabled && !reduceMotion {
            TimelineView(.animation) { ctx in
                let t = ctx.date.timeIntervalSinceReferenceDate / duration
                let k = rtFlipAngle(t) <= 180 ? rtFlipAngle(t) / 180 : (360 - rtFlipAngle(t)) / 180
                content
                    .scaleEffect(1 + 0.28 * k)
                    .opacity(0.32 + (0.6 - 0.32) * k)
            }
        } else {
            content.opacity(restOpacity)
        }
    }
}

// ── v8Up: translateY 46→0 + fade, .55s (바텀시트 슬라이드-업) ──
public extension View {
    func rtSheetUp() -> some View {
        modifier(RTSheetUp())
    }
}

struct RTSheetUp: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .offset(y: active && !shown ? 46 : 0)
            .opacity(active && !shown ? 0 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.timingCurve(0.2, 0.9, 0.3, 1, duration: 0.55)) { shown = true }
            }
    }
}

// ── v5Stack: scaleY 0→1.06→1 origin bottom, .6s ×.06s 스태거 (10 주간 바) ──
public extension View {
    func rtStack(delay: Double = 0) -> some View {
        modifier(RTStack(delay: delay))
    }

    /// v7TipPop: scale .55→1 + fade, .5s (10 팝오버, 기본 delay 1.05s)
    func rtTipPop(delay: Double = 1.05) -> some View {
        modifier(RTTipPop(delay: delay))
    }
}

struct RTStack: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let delay: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .scaleEffect(x: 1, y: active && !shown ? 0.001 : 1, anchor: .bottom)
            .onAppear {
                guard active else { return }
                withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.6).delay(delay)) { shown = true }
            }
    }
}

struct RTTipPop: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let delay: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .scaleEffect(active && !shown ? 0.55 : 1)
            .opacity(active && !shown ? 0 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.timingCurve(0.2, 1.2, 0.4, 1, duration: 0.5).delay(delay)) { shown = true }
            }
    }
}

// ── v7Star: scale .4→1.14→1 + rotate -18°→4°→0, .6s, .08s 스태거 (09 별점 팝) ──
public extension View {
    func rtStarPop(delay: Double = 0) -> some View {
        modifier(RTStarPop(delay: delay))
    }
}

struct RTStarPop: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let delay: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .scaleEffect(active && !shown ? 0.4 : 1)
            .rotationEffect(.degrees(active && !shown ? -18 : 0))
            .opacity(active && !shown ? 0 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.timingCurve(0.2, 1.4, 0.5, 1, duration: 0.6).delay(delay)) { shown = true }
            }
    }
}

// ── 페이드 인 (v5Draw·v5Fade 의 translate 없는 근사 — 체크 패스 드로우 등) ──
public extension View {
    func rtFadeIn(delay: Double = 0, duration: Double = 0.5) -> some View {
        modifier(RTFadeIn(delay: delay, duration: duration))
    }

    /// v5Drop: translateY -16→2→0 + fade (06 "+N분" 칩 낙하) — 오버슈트 커브 근사
    func rtDrop(delay: Double = 1.9, duration: Double = 0.6) -> some View {
        modifier(RTDrop(delay: delay, duration: duration))
    }

    /// v5Ripple 루프를 기존 링 뷰에 적용 (06 체크 원 둘레·09 표지 둘레)
    func rtRippleLoop(duration: Double, delay: Double = 0) -> some View {
        modifier(RTRippleLoop(duration: duration, delay: delay))
    }
}

struct RTFadeIn: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let delay: Double
    let duration: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .opacity(active && !shown ? 0 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.easeOut(duration: duration).delay(delay)) { shown = true }
            }
    }
}

struct RTDrop: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let delay: Double
    let duration: Double
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .offset(y: active && !shown ? -16 : 0)
            .opacity(active && !shown ? 0 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.timingCurve(0.2, 1.2, 0.4, 1, duration: duration).delay(delay)) { shown = true }
            }
    }
}

struct RTRippleLoop: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let duration: Double
    let delay: Double
    @State private var animating = false

    func body(content: Content) -> some View {
        let active = enabled && !reduceMotion
        content
            .scaleEffect(active ? (animating ? 1.65 : 0.5) : 1)
            .opacity(active ? (animating ? 0 : 0.55) : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.easeOut(duration: duration).delay(delay).repeatForever(autoreverses: false)) {
                    animating = true
                }
            }
    }
}

// ── v5Pop 1회 — 일시정지→재개 순간 (04 엠블럼, MOTION.md 상태 전환) ──
public extension View {
    func rtResumePop(paused: Bool) -> some View {
        modifier(RTResumePop(paused: paused))
    }
}

struct RTResumePop: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let paused: Bool
    @State private var scale: CGFloat = 1

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .onChange(of: paused) { newVal in
                guard enabled && !reduceMotion, newVal == false else { return }
                scale = 0.6
                withAnimation(.timingCurve(0.2, 1.2, 0.4, 1, duration: 0.45)) { scale = 1 }
            }
    }
}

// ── v7Tap: 존 링 scale .55→1.9 + fade, 2.4s ease-out ∞ — 모션 전용(정적 렌더엔 없음) ──
public struct RTZoneTapRing: View {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animating = false
    public init() {}

    public var body: some View {
        if enabled && !reduceMotion {
            Circle().stroke(Color(hex: 0xE2CF9E, alpha: 0.55), lineWidth: 2)
                .frame(width: 56, height: 56)
                .scaleEffect(animating ? 1.9 : 0.55)
                .opacity(animating ? 0 : 0.7)
                .onAppear {
                    withAnimation(.easeOut(duration: 2.4).repeatForever(autoreverses: false)) {
                        animating = true
                    }
                }
        }
    }
}

// ── 하루 첫 실행 안무 (#7a) — 1.55s 집어 들기 ──
// 축 분리(§4): 수직 y / 수평 x+기울기 / 크기 / 초점 을 각각 독립 KeyframeTrack 으로 (구간 이음매 제거).
// 비활성(정지 홈 #7b·모션 off·Reduce Motion) = 최종 정지 상태 + 부유(rtFloat) — rtshot 픽셀 오라클 불변.
public extension View {
    /// 책 표지 집어 들기 (수직/수평·기울기/크기/초점 4트랙). 비활성 시 정지 + rtFloat.
    func rtPickupCover(_ firstRun: Bool) -> some View {
        modifier(RTPickupCover(firstRun: firstRun))
    }
    /// 크롬 지연 페이드인 (착지 후 기록 탭·탭 링·데이터). 비활성 시 즉시 표시.
    func rtPickupChrome(_ firstRun: Bool, delay: Double) -> some View {
        modifier(RTPickupChrome(firstRun: firstRun, delay: delay))
    }
    /// 바닥 그림자 진입 (rtShadowIn: 46%까지 없음→78% 1.04/.85→100% 1.0, 1.55s ease-out).
    /// 표지 착지에 맞춰 그림자가 자라 들어온다. 비활성 시 즉시 표시(부유는 rtFloorShadow 담당).
    func rtPickupShadow(_ firstRun: Bool) -> some View {
        modifier(RTPickupShadow(firstRun: firstRun))
    }
}

struct RTPickupShadow: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let firstRun: Bool
    @State private var run = false
    private var active: Bool { firstRun && enabled && !reduceMotion }

    struct Pose { var op: Double; var sc: CGFloat }

    func body(content: Content) -> some View {
        if active {
            content
                .keyframeAnimator(initialValue: Pose(op: 0, sc: 0.46), trigger: run) { view, p in
                    view.opacity(p.op).scaleEffect(p.sc)
                } keyframes: { _ in
                    KeyframeTrack(\.op) {
                        LinearKeyframe(0, duration: 1.55 * 0.46)
                        LinearKeyframe(0.85, duration: 1.55 * 0.32, timingCurve: .easeOut)
                        LinearKeyframe(1, duration: 1.55 * 0.22, timingCurve: .easeOut)
                    }
                    KeyframeTrack(\.sc) {
                        LinearKeyframe(0.46, duration: 1.55 * 0.46)
                        LinearKeyframe(1.04, duration: 1.55 * 0.32, timingCurve: .easeOut)
                        LinearKeyframe(1, duration: 1.55 * 0.22, timingCurve: .easeOut)
                    }
                }
                .onAppear { run = true }
        } else {
            content
        }
    }
}

struct RTPickupPose {
    var y: CGFloat
    var x: CGFloat
    var rot: Double
    var scale: CGFloat
    var blur: CGFloat
    var bright: Double
    static let start = RTPickupPose(y: -282, x: 52, rot: 0, scale: 0.42, blur: 2.4, bright: 0.955)
}

struct RTPickupCover: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let firstRun: Bool
    @State private var run = false
    private var active: Bool { firstRun && enabled && !reduceMotion }

    func body(content: Content) -> some View {
        if active {
            content
                .keyframeAnimator(initialValue: RTPickupPose.start, trigger: run) { view, p in
                    view
                        .brightness(p.bright - 1)                 // 초점(밝기)
                        .blur(radius: p.blur)                     // 초점(블러)
                        .scaleEffect(p.scale, anchor: UnitPoint(x: 0.5, y: 0.62))  // 크기
                        .rotationEffect(.degrees(p.rot))          // 수평(기울기)
                        .offset(x: p.x, y: p.y)                   // 수평/수직 이동 (최외곽)
                } keyframes: { _ in
                    // 수직 y: -282 → -296(14%, 들어올림) → 0. 정점 속도 0.
                    KeyframeTrack(\.y) {
                        LinearKeyframe(-296, duration: 1.55 * 0.14,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.45, y: 0), endControlPoint: .init(x: 0.35, y: 1)))
                        LinearKeyframe(0, duration: 1.55 * 0.86,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.5, y: 0), endControlPoint: .init(x: 0.16, y: 1)))
                    }
                    // 수평 x: 52 → 55(22%) → 0 — 늦게 출발해 호
                    KeyframeTrack(\.x) {
                        LinearKeyframe(55, duration: 1.55 * 0.22,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.45, y: 0), endControlPoint: .init(x: 0.4, y: 1)))
                        LinearKeyframe(0, duration: 1.55 * 0.78,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.5, y: 0.05), endControlPoint: .init(x: 0.2, y: 1)))
                    }
                    // 기울기: 0 → -1.4°(22%) → 0
                    KeyframeTrack(\.rot) {
                        LinearKeyframe(-1.4, duration: 1.55 * 0.22,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.45, y: 0), endControlPoint: .init(x: 0.4, y: 1)))
                        LinearKeyframe(0, duration: 1.55 * 0.78,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.5, y: 0.05), endControlPoint: .init(x: 0.2, y: 1)))
                    }
                    // 크기: 0.42 → 1.0
                    KeyframeTrack(\.scale) {
                        LinearKeyframe(1.0, duration: 1.55,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.55, y: 0.05), endControlPoint: .init(x: 0.18, y: 1)))
                    }
                    // 초점: blur 2.4→0 · 밝기 .955→1 (1.45s)
                    KeyframeTrack(\.blur) {
                        LinearKeyframe(0, duration: 1.45,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.4, y: 0.3), endControlPoint: .init(x: 0.3, y: 0.3)))
                    }
                    KeyframeTrack(\.bright) {
                        LinearKeyframe(1.0, duration: 1.45,
                            timingCurve: .bezier(startControlPoint: .init(x: 0.4, y: 0.3), endControlPoint: .init(x: 0.3, y: 0.3)))
                    }
                }
                .rtFloat(duration: 10, delay: 1.75)   // 착지(1.55s)+200ms 후 부유 시작 (속도 0 핸드오프)
                .onAppear { run = true }
        } else {
            content.rtFloat(duration: 10)   // 정지 홈 #7b: 부유
        }
    }
}

struct RTPickupChrome: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let firstRun: Bool
    let delay: Double
    @State private var shown = false
    private var active: Bool { firstRun && enabled && !reduceMotion }

    func body(content: Content) -> some View {
        content
            .opacity(active && !shown ? 0 : 1)
            .onAppear {
                guard active else { return }
                withAnimation(.easeOut(duration: 0.55).delay(delay)) { shown = true }
            }
    }
}

// ── v5Ripple: scale .5→1.65 + fade, ∞ 3겹 1.4s 위상차 (05·04 기록 중 동심원) ──
// 정적 렌더(모션 off)는 기존 정지 프레임(scale 1, 지정 opacity)과 동일해야 한다.
public struct RTRipple: View {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let baseOpacity: Double
    let phase: Double       // 0 / 1.4 / 2.8s
    let size: CGFloat
    let duration: Double
    @State private var animating = false

    public init(baseOpacity: Double, phase: Double, size: CGFloat = 280, duration: Double = 4.2) {
        self.baseOpacity = baseOpacity
        self.phase = phase
        self.size = size
        self.duration = duration
    }

    public var body: some View {
        let active = enabled && !reduceMotion
        Circle()
            .stroke(Color(hex: 0xE2CF9E, alpha: baseOpacity), lineWidth: 1.5)
            .frame(width: size, height: size)
            .scaleEffect(active ? (animating ? 1.65 : 0.5) : 1)
            .opacity(active ? (animating ? 0 : 0.55) : 1)   // v5Ripple 0% opacity .55
            .onAppear {
                guard active else { return }
                withAnimation(.easeOut(duration: duration).delay(phase).repeatForever(autoreverses: false)) {
                    animating = true
                }
            }
    }
}

import SwiftUI
import GymCore

// 유산소 카드 — 확정 시안 7a / 작업지시서 2026-08-18 (`specs/2026-08-18-cardio-input-design.md`).
//
// **거리 하나만 입력하고 좌 스와이프로 저장한다** (사용자 2026-09-26). 시간·칼로리 입력과 지표
// 로테이션은 없앴다. 좌 스와이프 = 저장, 우 스와이프 = 되돌리기 — 근력 히어로와 같은 판정
// (GymSwipeMath, ±60pt). 입력 없이 밀면 직전 기록 거리가 저장된다(근력이 미리 채운 값을 확정하는
// 것과 같은 규칙). 밀지 않고 종료해도 입력한 거리는 cardioEntered 술어 + 종료/마감이 보존한다.
//
// 집계는 **이 종목만** (트레드밀 카드는 트레드밀 기록만). 홈 유산소 행(전 종목 합산)과 수치가
// 달라지는 것은 의도된 것이다 (§5).
struct CardioPanel: View {
    let history: [GymSession]
    let set: GymSet?              // 히어로가 읽는 현재 세트
    let todaySets: [GymSet]       // 오늘 블록 전체 — 주간 합계(구데이터 다중 세트 합)
    let exerciseId: String
    let now: Date
    let locked: Bool
    var onKeypad: (() -> Void)? = nil
    var onSetValue: ((Double) -> Void)? = nil
    var onCommit: (() -> Bool)? = nil     // 좌 스와이프 저장 — false 면 저장할 값이 없다
    var onRevert: (() -> Void)? = nil     // 우 스와이프 되돌리기

    private let metric = GymCardioMetric.distance
    @State private var dragX: CGFloat = 0
    @State private var dragging = false
    @State private var flash = false

    private var prevRun: GymSessionLogic.GymCardioRun? {
        GymSessionLogic.recentCardioRuns(history: history, exerciseId: exerciseId, limit: 1).last
    }

    var body: some View {
        GeometryReader { geo in
            let L = GymCardioLayout(cardWidth: geo.size.width)   // §6-1 치수는 기기 폭에서 유도
            VStack(spacing: 0) {
                weekModule
                gestureArea(L)
            }
            .padding(.horizontal, GymCardioLayout.horizontalPadding)
            .padding(.top, 20)
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
        }
        .accessibilityIdentifier("cardio-card")
    }

    // MARK: - 이번 주 합계 (2주 카드는 SessionScreen 이 근력과 공통으로 그린다)

    private var weekModule: some View {
        let wk = GymSessionLogic.cardioMetricWeek(history: history, todaySets: todaySets,
                                                  exerciseId: exerciseId, metric: metric, now: now)
        return HStack(alignment: .firstTextBaseline, spacing: 2) {
            Spacer(minLength: 0)
            Text(wk.total).font(.mono(16, 600)).tracking(-0.48).foregroundStyle(GY.ink2)
            Text(wk.unit).font(.sans(11, 600)).foregroundStyle(GY.ink4)
        }
    }

    // MARK: - 제스처 영역 — 좌우 여백 탭 = ±0.1km, 숫자 탭 = 키패드, 수평 드래그 = 저장/되돌리기

    private func gestureArea(_ L: GymCardioLayout) -> some View {
        let revealP = GymSwipeMath.revealProgress(Double(dragX))
        return ZStack {
            HStack(spacing: 0) {
                stepZone(-1).frame(width: L.tapZone)
                Spacer(minLength: 0)
                stepZone(1).frame(width: L.tapZone)
            }
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                heroCell(W: L.contentWidth).offset(x: dragX)
                Spacer(minLength: 0)
            }
        }
        .frame(maxHeight: .infinity)
        .contentShape(Rectangle())
        // "저장" 칩 비례 노출 — 근력 히어로의 완료 칩(complete-reveal)과 같은 모양·진행도
        .overlay(alignment: .trailing) {
            HStack(spacing: 7) {
                Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                Text("저장").font(.sans(13, 600))
            }
            .foregroundStyle(GY.crailDeep)
            .padding(.init(top: 7, leading: 11, bottom: 7, trailing: 14))
            .background(GY.crailSoft, in: Capsule())
            .overlay(Capsule().strokeBorder(GY.crailBase, lineWidth: 1))
            .opacity(revealP)
            .scaleEffect(0.9 + CGFloat(revealP) * 0.1)
            .offset(x: (1 - CGFloat(revealP)) * 14)
            .allowsHitTesting(false)
            .accessibilityIdentifier("cardio-save-reveal")
        }
        .gesture(
            DragGesture(minimumDistance: GymCardioLayout.dragSlop)
                .onChanged { v in
                    guard !locked else { return }
                    let dx = Double(v.translation.width), dy = Double(v.translation.height)
                    if !dragging {
                        guard GymSwipeMath.engaged(dx: dx, dy: dy) else { return }
                        dragging = true
                    }
                    dragX = CGFloat(GymSwipeMath.heroTranslate(dx))
                }
                .onEnded { v in
                    let was = dragging
                    dragging = false
                    if was {
                        switch GymSwipeMath.endAction(dx: Double(v.translation.width),
                                                      dy: Double(v.translation.height)) {
                        case .commit: _ = onCommit?()
                        case .revert: onRevert?()
                        case .tap, .springBack: break
                        }
                    }
                    withAnimation(.easeOut(duration: 0.18)) { dragX = 0 }
                }
        )
    }

    private func stepZone(_ dir: Int) -> some View {
        Color.clear.contentShape(Rectangle())
            .onTapGesture { step(dir) }
            .accessibilityIdentifier(dir > 0 ? "cardio-inc" : "cardio-dec")
    }

    // 증감 — 현재값(없으면 직전 러닝) ± 0.1, 하한 0. 쓰기는 호출부가 applyCardio 로 넘긴다 (§5-1).
    private func step(_ dir: Int) {
        guard !locked else { return }
        let base = currentValue ?? refValue ?? 0
        onSetValue?(metric.stepped(from: base, dir: dir))
        flash = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { flash = false }
    }

    // MARK: - 히어로

    private func heroCell(W: CGFloat) -> some View {
        let d = display
        let size = heroFontSize(d.text, unit: metric.unit, W: W)
        return VStack(spacing: 0) {
            Text(Self.heroLabel(metric, source: d.source)).font(.sans(12, 600)).tracking(1.2)
                .foregroundStyle(Color(oklch: 0.70, 0.006, 60))
                .lineLimit(1)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(d.text).font(.mono(size, 300)).tracking(-0.05 * size)
                    .foregroundStyle(d.color)
                    .accessibilityIdentifier("cardio-hero-\(metric.rawValue)")
                Text(metric.unit).font(.sans(15, 500)).foregroundStyle(Color(oklch: 0.74, 0.006, 60))
            }
            .padding(.top, 12)
            .opacity(flash ? 0.45 : 1)
            .contentShape(Rectangle())
            .onTapGesture { if !locked { onKeypad?() } }
        }
        .frame(width: W)
    }

    /// 값+단위가 넘치면 단계 축소 100 → 88 → 76 (§6-1). 줄바꿈·생략 없음.
    /// 임계는 콘텐츠 폭 W — 규칙의 목적이 넘침 방어라서다 (탭 영역을 빼면 두 자리 값도 줄어든다).
    private func heroFontSize(_ text: String, unit: String, W: CGFloat) -> CGFloat {
        for s in [CGFloat(100), 88, 76] {
            let digits = GymMonoFont.width(text, size: s, weight: 300) - 0.05 * s * CGFloat(max(0, text.count - 1))
            if digits + 6 + CGFloat(unit.count) * 8.5 <= W { return s }
        }
        return 76
    }

    // MARK: - 표시값

    private var currentValue: Double? { self.set.flatMap { metric.value(in: $0) } }
    /// 직전 러닝 거리. 0 은 "안 적은 것" 으로 보고 고스트를 내밀지 않는다.
    private var refValue: Double? {
        guard let v = prevRun?.distanceKm, v > 0 else { return nil }
        return v
    }
    /// 히어로 숫자의 출처 — 라벨이 이걸 밝혀 고스트를 이번 기록으로 오인하는 것을 막는다.
    enum HeroSource { case saved, entered, ghost, empty }

    /// 저장됨·입력값(잉크) > 직전 러닝 고스트(ink4) > "0" 고스트.
    private var display: (text: String, color: Color, source: HeroSource) {
        if let v = currentValue {
            return (metric.format(v), locked ? GY.ink4 : GY.ink1, set?.done == true ? .saved : .entered)
        }
        if let r = refValue { return (metric.format(r), GY.ink4, .ghost) }
        return (metric.format(0), GY.ink4, .empty)
    }

    /// 고스트 숫자는 회색이라는 것만으로는 이번 기록과 구별되지 않는다 — 값을 넣지 않고 넘어가
    /// 기록이 비는 사고가 있었다 (2026-09-10 실데이터 8/21·9/8). 라벨로 밝힌다.
    static func heroLabel(_ m: GymCardioMetric, source: HeroSource) -> String {
        switch source {
        case .saved:   "\(m.label) · 저장됨"
        case .entered: m.label
        case .ghost:   "\(m.label) · 직전 기록"
        case .empty:   "\(m.label) · 미입력"
        }
    }
}

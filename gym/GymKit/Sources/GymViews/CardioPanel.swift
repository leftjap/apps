import SwiftUI
import GymCore

// 유산소 카드 — 확정 시안 7a / 작업지시서 2026-08-18 (`specs/2026-08-18-cardio-input-design.md`).
//
// 스와이프는 **완료가 아니라 지표 로테이션**이다: 시간 → 거리 → 칼로리. 히어로 값·주간 캘린더
// 숫자·주간 합계·단위가 모두 함께 전환된다. 완료/저장 버튼·스와이프 완료·롱프레스 확정은 없다 —
// 보존은 cardioEntered 술어 + 종료/마감이 보장한다 (§7).
//
// 집계는 **이 종목만** (트레드밀 카드는 트레드밀 기록만). 홈 유산소 행(전 종목 합산)과 수치가
// 달라지는 것은 의도된 것이다 (§5).
struct CardioPanel: View {
    let history: [GymSession]
    let set: GymSet?              // 히어로·요약이 읽는 현재 세트
    let todaySets: [GymSet]       // 오늘 블록 전체 — 원 값(구데이터 다중 세트 합)
    let exerciseId: String
    let now: Date
    let locked: Bool
    var initialMetric: GymCardioMetric = .duration     // 스냅샷 검증 훅 (실앱은 항상 .duration)
    var onKeypad: ((GymCardioMetric) -> Void)? = nil
    var onSetValue: ((GymCardioMetric, Double) -> Void)? = nil

    // 지표 선택은 카드 로컬 상태 — 저장하지 않는다. 진입 시 항상 시간 (§9).
    @State private var picked: GymCardioMetric? = nil
    private var metric: GymCardioMetric { picked ?? initialMetric }
    @State private var dragDX: CGFloat = 0
    @State private var flash: GymCardioMetric? = nil

    private var metrics: [GymCardioMetric] { GymCardioMetric.allCases }
    private var idx: Int { metrics.firstIndex(of: metric) ?? 0 }
    private var prevRun: GymSessionLogic.GymCardioRun? {
        GymSessionLogic.recentCardioRuns(history: history, exerciseId: exerciseId, limit: 1).last
    }

    var body: some View {
        GeometryReader { geo in
            let L = GymCardioLayout(cardWidth: geo.size.width)   // §6-1 치수는 기기 폭에서 유도
            VStack(spacing: 0) {
                weekModule(L)
                gestureArea(L)
            }
            .padding(.horizontal, GymCardioLayout.horizontalPadding)
            .padding(.top, 20)
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
        }
        .accessibilityIdentifier("cardio-card")
    }

    // MARK: - 주간 캘린더 (§2)

    private func weekModule(_ L: GymCardioLayout) -> some View {
        let wk = GymSessionLogic.cardioMetricWeek(history: history, todaySets: todaySets,
                                                  exerciseId: exerciseId, metric: metric, now: now)
        let dia = L.circleDiameter
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(Array(wk.days.enumerated()), id: \.offset) { i, d in
                    if i > 0 { Spacer(minLength: 0) }
                    dayCircle(d, dia: dia)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Spacer(minLength: 0)
                sumPair(wk.total, wk.unit)
                sumPair("\(wk.dayCount)", "일")
            }
            .padding(.top, 10)
        }
    }

    private func dayCircle(_ d: GymSessionLogic.CardioDay, dia: CGFloat) -> some View {
        VStack(spacing: 7) {
            ZStack {
                switch d.style {
                case .filled:    Circle().fill(GY.cardioTeal)
                case .todayRef:  Circle().strokeBorder(GY.cardioTealSoft, lineWidth: 2.4)
                case .ring:      Circle().strokeBorder(GY.line, lineWidth: 1.5)
                case .ringFaint: Circle().strokeBorder(GY.lineSoft, lineWidth: 1.5)
                }
                if let t = d.text {
                    Text(t).font(.mono(13.5, 600)).tracking(-0.405)   // -0.03em @13.5, 3자리 대응
                        .foregroundStyle(numberColor(d))
                }
            }
            .frame(width: dia, height: dia)
            Text(d.label)
                .font(.sans(11.5, d.isToday ? 700 : (d.style == .filled ? 600 : 500)))
                .foregroundStyle(labelColor(d))
        }
        .frame(width: dia)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("cardio-day-\(d.label)")
    }

    private func numberColor(_ d: GymSessionLogic.CardioDay) -> Color {
        switch d.style {
        case .filled:    .white
        case .todayRef:  GY.cardioTealSoft
        case .ring:      GY.ink4
        case .ringFaint: .clear
        }
    }
    private func labelColor(_ d: GymSessionLogic.CardioDay) -> Color {
        if d.isToday { return GY.cardioTeal }
        if d.style == .filled { return GY.ink3 }
        return Color(oklch: d.style == .ringFaint ? 0.82 : 0.78, 0.006, 60)
    }

    private func sumPair(_ v: String, _ unit: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(v).font(.mono(16, 600)).tracking(-0.48).foregroundStyle(GY.ink2)
            Text(unit).font(.sans(11, 600)).foregroundStyle(GY.ink4)
        }
    }

    // MARK: - 제스처 영역 (§4) — 히어로 · 도트 · 요약을 space-evenly 로 배분

    private func gestureArea(_ L: GymCardioLayout) -> some View {
        ZStack {
            // 증감 탭 — 세 블록 전체 높이. 히어로 숫자가 위에 있어 숫자 탭은 키패드로 간다.
            HStack(spacing: 0) {
                stepZone(-1).frame(width: L.tapZone)
                Spacer(minLength: 0)
                stepZone(1).frame(width: L.tapZone)
            }
            VStack(spacing: 0) {
                Spacer(minLength: 0)
                heroTrack(L)
                Spacer(minLength: 0)
                dots
                Spacer(minLength: 0)
                summaries
                Spacer(minLength: 0)
            }
        }
        .frame(maxHeight: .infinity)
        .contentShape(Rectangle())
        .gesture(
            // §4 8px 이하는 탭 — 증감과 충돌하지 않는다 (분기값은 기기 무관 고정)
            DragGesture(minimumDistance: GymCardioLayout.dragSlop)
                .onChanged { v in
                    dragDX = GymCardioGesture.translate(v.translation.width, from: metric)
                }
                .onEnded { v in
                    let dx = GymCardioGesture.translate(v.translation.width, from: metric)
                    let target = GymCardioGesture.commit(dx, from: metric,
                                                         threshold: L.swipeThreshold)
                    withAnimation(.easeOut(duration: 0.24)) { picked = target; dragDX = 0 }
                }
        )
    }

    private func stepZone(_ dir: Int) -> some View {
        Color.clear.contentShape(Rectangle())
            .onTapGesture { step(dir) }
            .accessibilityIdentifier(dir > 0 ? "cardio-inc" : "cardio-dec")
    }

    // 증감 — 현재값(없으면 직전 러닝) ± step, 하한 0. 쓰기는 호출부가 applyCardio 로 넘긴다 (§5-1).
    private func step(_ dir: Int) {
        guard !locked else { return }
        let base = currentValue(metric) ?? refValue(metric) ?? 0
        onSetValue?(metric, metric.stepped(from: base, dir: dir))
        flash = metric
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { flash = nil }
    }

    // MARK: - 히어로 트랙

    private func heroTrack(_ L: GymCardioLayout) -> some View {
        let W = L.contentWidth
        let near = min(1, abs(dragDX) / 160)
        let incoming = dragDX == 0 ? -1 : idx + (dragDX < 0 ? 1 : -1)
        return HStack(spacing: 0) {
            ForEach(Array(metrics.enumerated()), id: \.element) { i, m in
                heroCell(m, W: W)
                    .opacity(i == idx ? 1 - 0.45 * near
                             : (i == incoming ? 0.2 + 0.8 * near : 0.2))
                    .allowsHitTesting(i == idx)
            }
        }
        .frame(width: W * CGFloat(metrics.count), alignment: .leading)
        .offset(x: L.trackOffset(index: idx) + dragDX)
        .frame(width: W, height: 128, alignment: .leading)
        .clipped()
    }

    private func heroCell(_ m: GymCardioMetric, W: CGFloat) -> some View {
        let d = display(m)
        let size = heroFontSize(d.text, unit: m.unit, W: W)
        return VStack(spacing: 0) {
            Text(m.label).font(.sans(12, 600)).tracking(1.2)
                .foregroundStyle(Color(oklch: 0.70, 0.006, 60))
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(d.text).font(.mono(size, 300)).tracking(-0.05 * size)
                    .foregroundStyle(d.color)
                    .accessibilityIdentifier("cardio-hero-\(m.rawValue)")
                Text(m.unit).font(.sans(15, 500)).foregroundStyle(Color(oklch: 0.74, 0.006, 60))
            }
            .padding(.top, 12)
            .opacity(flash == m ? 0.45 : 1)
            .contentShape(Rectangle())
            .onTapGesture { if !locked { onKeypad?(m) } }
        }
        .frame(width: W)
    }

    /// 값+단위가 넘치면 단계 축소 100 → 88 → 76 (§6-1). 줄바꿈·생략 없음.
    ///
    /// 지시서의 임계는 `W−(탭 영역×2)` 지만 그 식은 **확정 시안 자신의 데이터에서도 발동한다** —
    /// 360pt 목업의 임계 106pt < 시안 실측 "32" 폭 107.5pt. 그대로 넣으면 두 자리 분(가장 흔한 값)이
    /// 100 → 76 으로 줄어 시안(§3 픽셀 정본)과 눈에 띄게 달라진다(실측 81.5pt vs 107.5pt).
    /// 규칙의 목적은 "줄바꿈·생략 금지" = 넘침 방어이므로 임계를 콘텐츠 폭 W 로 둔다.
    /// 히어로가 탭 영역과 겹치는 것은 시안도 마찬가지고, 숫자가 위에 있어 탭은 키패드로 간다.
    private func heroFontSize(_ text: String, unit: String, W: CGFloat) -> CGFloat {
        let avail = W
        for s in [CGFloat(100), 88, 76] {
            let digits = GymMonoFont.width(text, size: s, weight: 300) - 0.05 * s * CGFloat(max(0, text.count - 1))
            if digits + 6 + CGFloat(unit.count) * 8.5 <= avail { return s }
        }
        return 76
    }

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(Array(metrics.enumerated()), id: \.element) { i, _ in
                Capsule()
                    .fill(i == idx ? GY.crailBase : Color(oklch: 0.90, 0.006, 60))
                    .frame(width: i == idx ? 18 : 6, height: 6)
            }
        }
        .allowsHitTesting(false)
        .accessibilityIdentifier("cardio-dots")
    }

    // 비활성 두 지표 — 탭하면 그 지표로 전환 (§4).
    private var summaries: some View {
        HStack(alignment: .bottom, spacing: 46) {
            ForEach(metrics.filter { $0 != metric }, id: \.self) { m in
                let d = display(m)
                VStack(spacing: 6) {
                    Text(m.label).font(.sans(11, 600)).tracking(1)
                        .foregroundStyle(Color(oklch: 0.74, 0.006, 60))
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(d.text).font(.mono(28, 300)).tracking(-1.12).foregroundStyle(d.color)
                        Text(m.unit).font(.sans(10.5, 500))
                            .foregroundStyle(Color(oklch: 0.78, 0.006, 60))
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .contentShape(Rectangle())
                .onTapGesture { withAnimation(.easeOut(duration: 0.24)) { picked = m } }
                .accessibilityIdentifier("cardio-summary-\(m.rawValue)")
            }
        }
    }

    // MARK: - 표시값

    private func currentValue(_ m: GymCardioMetric) -> Double? { set.flatMap { m.value(in: $0) } }
    private func refValue(_ m: GymCardioMetric) -> Double? {
        guard let p = prevRun else { return nil }
        switch m {
        case .duration: return (p.durationSec / 60).rounded()
        case .distance: return p.distanceKm
        case .calories: return p.kcal
        }
    }
    /// 입력값(잉크) > 직전 러닝 고스트(ink4) > "0" 고스트 — 오늘 원의 참조값과 같은 원천이다 (§8-2).
    private func display(_ m: GymCardioMetric) -> (text: String, color: Color) {
        if let v = currentValue(m) { return (m.format(v), locked ? GY.ink4 : GY.ink1) }
        if let r = refValue(m) { return (m.format(r), GY.ink4) }
        return (m.format(0), GY.ink4)
    }
}

import SwiftUI
import GymCore

// 유산소 카드 (설계 2026-08-10 §2, spec §6-4 대체) — 5필드 수기 입력 + 최근 8회 차트.
// 스와이프 완료 없음: 입력 즉시 확정. 값이 고스트(ink4, 직전 러닝)→잉크로 진해지는 게 기록 피드백.
// 필드는 콘솔 배치를 따라 라벨 위·값 아래 (트레드밀 계기판 전사 워크플로).
struct CardioPanel: View {
    let set: GymSet?                              // 현재 세트 (입력값)
    let runs: [GymSessionLogic.GymCardioRun]      // 최근 8회, 과거→최신
    let locked: Bool
    var onField: ((GymAppModel.KeypadField) -> Void)? = nil

    private var prev: GymSessionLogic.GymCardioRun? { runs.last }

    // 표시값 결정 — 입력값(잉크) > 직전 러닝 고스트(ink4) > "0" 고스트.
    private func display(_ entered: Double?, ghost: Double?, dp1: Bool = false) -> (text: String, isGhost: Bool) {
        let f = dp1 ? Self.fmt1 : Self.fmt
        if let entered { return (f(entered), false) }
        if let ghost { return (f(ghost), true) }
        return ("0", true)
    }
    static func fmt(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v)
    }
    // 속도·경사 — 콘솔 계기판 표기 정합 1dp 고정 ("6.0", "3.4")
    static func fmt1(_ v: Double) -> String { String(format: "%.1f", v) }

    var body: some View {
        VStack(spacing: 0) {
            if runs.count >= 3 {
                chart.padding(.bottom, 10)
                    .accessibilityIdentifier("cardio-chart")
            }
            if let prev {
                prevLine(prev).padding(.bottom, 22)
            }
            // 시간 — 주인공 (히어로 DNA 축소 계승: mono 88/600)
            let dur = display(set?.duration.map { ($0 / 60).rounded() }, ghost: prev.map { ($0.durationSec / 60).rounded() })
            fieldTap(.duration) {
                VStack(spacing: 2) {
                    Text(HeroNumberText.kerned(dur.text, tracking: -4.8))   // -0.055em @88
                        .font(.mono(88, 600))
                        .foregroundStyle(inkPrimary(dur.isGhost))
                        .accessibilityIdentifier("cardio-duration")
                    Text("분").font(.sans(14, 600)).tracking(0.28).foregroundStyle(GY.ink4)
                }
            }
            // 거리 — 보조 (구 히어로 하단 행 계승: mono 44/400)
            let dist = display(set?.distance, ghost: prev?.distanceKm)
            fieldTap(.distance) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(HeroNumberText.kerned(dist.text, tracking: -0.9))
                        .font(.mono(44, 400))
                        .foregroundStyle(dist.isGhost ? GY.ink4 : GY.ink2)
                        .accessibilityIdentifier("cardio-distance")
                    Text("km").font(.sans(15, 500)).foregroundStyle(GY.ink3)
                }
                .padding(.top, 14)
            }
            // 강도·결과 행 — 콘솔 계기판 배치 (라벨 위 · 값 아래): 속도 / 경사 / 칼로리
            HStack(spacing: 0) {
                consoleCell(.speed, label: "속도", unit: "km/h",
                            v: display(set?.speed, ghost: prev?.speed, dp1: true))
                consoleCell(.incline, label: "경사", unit: "%",
                            v: display(set?.incline, ghost: prev?.incline, dp1: true))
                consoleCell(.calories, label: "칼로리", unit: "kcal",
                            v: display(set?.calories, ghost: prev?.kcal))
            }
            .padding(.top, 26)
            .padding(.horizontal, 10)
            // 페이스 — 시간·거리 자동 파생 (§6-4 유지)
            if let pace = GymSessionLogic.paceText(durationSec: set?.duration, distanceKm: set?.distance) {
                Text(pace).font(.mono(15, 500)).tracking(0.6)
                    .foregroundStyle(GY.crailDeep).padding(.top, 18)
                    .accessibilityIdentifier("cardio-pace")
            }
        }
        .padding(.horizontal, 26)
    }

    private func inkPrimary(_ ghost: Bool) -> Color {
        locked ? GY.ink4 : (ghost ? GY.ink4 : GY.ink1)
    }

    @ViewBuilder
    private func fieldTap(_ field: GymAppModel.KeypadField, @ViewBuilder _ content: () -> some View) -> some View {
        let inner = content().frame(maxWidth: .infinity).contentShape(Rectangle())
        if let onField, !locked {
            inner.onTapGesture { onField(field) }
        } else {
            inner
        }
    }

    // 계기판 셀 — 라벨(ink4 소문자 트래킹) 위 · 값+단위 아래.
    private func consoleCell(_ field: GymAppModel.KeypadField, label: String, unit: String,
                             v: (text: String, isGhost: Bool)) -> some View {
        fieldTap(field) {
            VStack(spacing: 5) {
                Text(label).font(.sans(11, 600)).tracking(1.1).foregroundStyle(GY.ink4)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(v.text).font(.mono(24, 500))
                        .foregroundStyle(locked || v.isGhost ? GY.ink4 : GY.ink2)
                        .accessibilityIdentifier("cardio-\(field.rawValue)")
                    Text(unit).font(.sans(11, 500)).foregroundStyle(GY.ink4)
                }
            }
            .padding(.vertical, 6)
        }
    }

    // 직전 러닝 한 줄 — "직전 15분 · 1.5km · 경사 3.4 · 81kcal" (있는 필드만).
    private func prevLine(_ p: GymSessionLogic.GymCardioRun) -> some View {
        var parts: [String] = ["\(Int((p.durationSec / 60).rounded()))분"]
        if let km = p.distanceKm { parts.append("\(Self.fmt(km))km") }
        if let inc = p.incline { parts.append("경사 \(Self.fmt(inc))") }
        if let k = p.kcal { parts.append("\(Int(k))kcal") }
        return HStack(spacing: 6) {
            Text("직전").font(.sans(11, 600)).tracking(1.1).foregroundStyle(GY.ink4)
            Text(parts.joined(separator: " · ")).font(.mono(13, 500)).foregroundStyle(GY.ink3)
        }
        .accessibilityIdentifier("cardio-prev")
    }

    // 최근 8회 막대 — 높이=분, 8주 추이 비례(slot×0.55) 계승. 마지막(직전) 막대만 crail 강조.
    // 최신이 오른쪽 끝 (시간축 관례 — 빈 슬롯은 왼쪽), 베이스라인으로 접지.
    private var chart: some View {
        let minutes = runs.map { $0.durationSec / 60 }
        let maxV = max(minutes.max() ?? 1, 1)
        let chartH: CGFloat = 56
        return VStack(spacing: 0) {
            GeometryReader { g in
                let slot = g.size.width / CGFloat(max(runs.count, 8))   // 8칸 고정 폭 — 기록 적어도 막대 폭 일정
                let barW = min(slot * 0.55, 26)
                HStack(alignment: .bottom, spacing: slot - barW) {
                    ForEach(minutes.indices, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(i == minutes.count - 1 ? GY.crailBase : GY.neutralBar)
                            .frame(width: barW, height: max(4, chartH * CGFloat(minutes[i] / maxV)))
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: chartH, alignment: .bottomTrailing)
            }
            .frame(height: chartH)
            Rectangle().fill(GY.lineSoft).frame(height: 1).padding(.top, 6)
        }
        .padding(.horizontal, 4)
    }
}

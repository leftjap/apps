import SwiftUI
import GymCore

// 이 종목 볼륨 — 세그먼트 도넛 링 (mocks .exvol, 작업지시서 §5.1·§5.4·§6.3).
// 68px 표시(viewBox 40 → scale 1.7). 세그먼트 = 세트별 볼륨, done=ink2 5.2 / active=crail 6.3 / upcoming=연톤 4.
// over 상태: 100% 달성 crail 풀링 + 초과 에메랄드 아크(r=21)·팁 도트·취소선·crail 숫자·▲칩(에메랄드).

private let sf: CGFloat = 68.0 / 40.0   // viewBox40 → 68px

struct SegmentRing: View {
    let segs: [VolSegment]
    @State private var pulse = false   // 진행 세그 맥동 (gPulse — opacity 1↔.35, session.js 정합)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        ZStack {
            ForEach(segs.indices, id: \.self) { i in
                let s = segs[i]
                let w: Double = s.state == .active ? 6.3 : (s.state == .done ? 5.2 : 4)
                let color: Color = s.state == .active ? GY.crailBase
                    : (s.state == .done ? GY.ink2 : Color(oklch: 0.94, 0.025, 50))
                Circle()
                    .trim(from: 0, to: s.arc / VolumeRing.ringC)
                    .stroke(color, style: StrokeStyle(lineWidth: w * sf, lineCap: .butt))
                    .rotationEffect(.degrees(s.rot))
                    .frame(width: 16 * sf * 2, height: 16 * sf * 2)  // r=16 centerline
                    .opacity(s.state == .active && pulse ? 0.35 : 1)
            }
        }
        .frame(width: 68, height: 68)
        .onAppear {
            guard !GymSnapshot.isActive, !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
    }
}

// 에메랄드 성장 팁 도트 — gTipPulse(1.2s, scale 1↔1.55) 초과 유지 중 상시 루프 (§5.4-3).
struct TipDot: View {
    @State private var big = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Circle().fill(GY.recordBase)
            .frame(width: 2.7 * sf * 2, height: 2.7 * sf * 2)
            .shadow(color: GY.recordBase.opacity(0.9), radius: 3)
            .scaleEffect(big ? 1.55 : 1)
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { big = true }
            }
    }
}

// 돌파 순간 1회성 (mock exRecordBurst) — 링 완성 스윕(gRingDraw 650ms) + 버스트 확산 링(gRingPulse 1.6s).
struct ExVolBurst: View {
    @State private var sweep = false
    @State private var expand = false
    var body: some View {
        ZStack {
            Circle().trim(from: 0, to: sweep ? 1 : 0)
                .stroke(GY.crailBase, style: StrokeStyle(lineWidth: 6.3 * sf, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 16 * sf * 2, height: 16 * sf * 2)
            Circle().stroke(GY.crailBase, lineWidth: 5.5 * sf)
                .frame(width: 16 * sf * 2, height: 16 * sf * 2)
                .scaleEffect(expand ? 1.34 : 1)
                .opacity(expand ? 0 : 0.5)
        }
        .allowsHitTesting(false)
        .onAppear {
            withAnimation(.timingCurve(0.3, 0.7, 0.2, 1, duration: 0.65)) { sweep = true }
            withAnimation(.easeOut(duration: 1.6)) { expand = true }
        }
    }
}

struct ExerciseVolumeRing: View {
    let sets: [GymSet]
    let cur: Int
    let pct: Int           // 67 (직전 대비)
    let curVol: Double     // 2020 — 커밋 시 카운트업 (호출부 withAnimation 게이트)
    let totVol: String     // "3,020"
    var exOver: Bool = false                    // 100% 달성 — crail 풀링 정적 (mock #exVolDrawWrap)
    var over: VolumeRing.Overflow = VolumeRing.overflow(exDoneVol: 0, prevExVol: 0)
    var burstMoment: Int = 0                    // 돌파 1회성 트리거 (커밋 핸들러가 증가)
    @State private var burstVisible = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let nf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()

    var body: some View {
        let segs = VolumeRing.segments(sets, cur: cur).segs
        HStack(alignment: .center, spacing: 18) {
            ZStack {  // .exring 68
                SegmentRing(segs: segs)
                if exOver {   // 100% 달성 — crail 풀링 (정적, 돌파 순간은 ExVolBurst 스윕)
                    Circle().stroke(GY.crailBase, style: StrokeStyle(lineWidth: 6.3 * sf, lineCap: .round))
                        .frame(width: 16 * sf * 2, height: 16 * sf * 2)
                }
                if over.isOver {   // 초과 에메랄드 아크 r=21 + 팁 도트 (mock #exVolArc/#exVolTip)
                    Circle().trim(from: 0, to: over.arcDash / VolumeRing.arcC)
                        .stroke(GY.recordBase, style: StrokeStyle(lineWidth: 3 * sf, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 21 * sf * 2, height: 21 * sf * 2)
                        .shadow(color: GY.recordBase.opacity(0.75), radius: 3)
                    if over.tipOpacity > 0 {
                        TipDot()   // 성장 팁 도트 — gTipPulse 1.2s scale 1↔1.55 (초과 유지 중 루프)
                            .offset(x: (over.tipX - 20) * sf, y: (over.tipY - 20) * sf)
                    }
                }
                if burstVisible {
                    ExVolBurst().id(burstMoment)
                }
                HStack(spacing: 1) {   // .exring-pct
                    Text("\(pct)").font(.mono(14, 700)).tracking(-0.28)
                        .contentTransition(.numericText())   // 커밋 크로스페이드 이중 노출 방지
                    Text("%").font(.mono(9.5, 600))
                }.foregroundStyle(GY.crailDeep)
            }
            .frame(width: 68, height: 68)

            HStack(alignment: .firstTextBaseline, spacing: 8) {  // .exnums — 초과 시 crail 숫자 + 취소선
                CountUpVolumeText(value: curVol, tint: over.isOver ? GY.crailDeep : GY.ink1)
                (Text("/ \(totVol)").font(.mono(13.5, 500))
                 + Text("kg").font(.mono(10.5, 500)))   // .tot .u — 시안 #6b 680행 / mocks 70행 모두 10.5
                    .foregroundStyle(GY.ink4).lineLimit(1).fixedSize()
                    .strikethrough(over.isOver)
                    .opacity(over.isOver ? 0.55 : 1)
            }
            // 플로팅 ▲칩(에메랄드, 숫자 위 9px absolute — mock .exchip). 돌파 삽입 시 팝(gPop2).
            .overlay(alignment: .topLeading) {
                if over.isOver {
                    HStack(spacing: 2) {
                        Text("▲").font(.system(size: 9))
                        Text("+\(Self.nf.string(from: NSNumber(value: over.overAmt)) ?? "\(over.overAmt)")")
                            .font(.mono(12.5, 700))
                    }
                    .foregroundStyle(GY.recordDeep)
                    .padding(.horizontal, 11).padding(.vertical, 6)
                    .background(GY.recordTint, in: Capsule())
                    .overlay(Capsule().strokeBorder(Color(oklch: 0.78, 0.10, 152), lineWidth: 1))
                    .shadow(color: GY.recordBase.opacity(0.45), radius: 7, y: 3)
                    .fixedSize()
                    .offset(y: -34)
                    .allowsHitTesting(false)
                    .transition(.scale(scale: 0.55).combined(with: .opacity))
                    .accessibilityIdentifier("exvol-chip")
                }
            }
        }
        .padding(.bottom, 15)
        .onChange(of: burstMoment) { _, _ in
            guard !reduceMotion else { return }
            burstVisible = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.7) { burstVisible = false }
        }
    }
}

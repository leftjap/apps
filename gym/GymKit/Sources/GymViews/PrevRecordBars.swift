import SwiftUI
import GymCore

// 세트바 (mocks #cardSetDots, 작업지시서 §3·§B). 슬롯 = 현재 세션 세트,
// 값 = GymSessionLogic.dotDisplay (done/current 실값, 미입력은 직전 세션 per-set 타깃 preview).
// 막대 높이 = 볼륨 비례 (무게 종목만) — working 상한 20px, 최고 슬롯 고정 24px (사용자 결정 B안).
struct SetBarSlot: Identifiable {
    let id: Int                 // set index
    let top: String             // 중량(굵게) — dotDisplay.top
    let bottom: String          // ×횟수(작게) — dotDisplay.bottom
    let isPreview: Bool         // 미입력 preview (회색 톤)
    let state: BarState
    let pr: Bool                // e1RM 신기록 세트 — accent 영구 표시 (spec §6-11)
    let volume: Double
}
enum BarState { case done, now, upcoming }

struct PrevRecordBars: View {
    let slots: [SetBarSlot]
    let best: (weight: Int, reps: Int)?   // 역대 최고(e1RM) 슬롯 — 무게 종목 + 존재 시만 (§3-5)
    var encodeHeight: Bool = true          // 볼륨 → 높이 인코딩 (무게 종목만)
    var dragP: CGFloat = 0                 // 좌드래그 진행도 — now 세그 미세 부풀림 scaleY(1+p·0.28)
    var onLongPressSlot: ((Int) -> Void)? = nil   // 세트 행 꾹누르기 → 수정/삭제 (§6-9)

    static let workHi: CGFloat = 20   // SET_BAR_WORK_HI
    static let bestH: CGFloat = 24    // SET_BAR_BEST_H

    // barHeightForVolume 포팅: round(max(9, min(hi, v/maxVol×hi))). maxVol≤0 → 9.
    private func barH(_ v: Double, _ maxVol: Double, hi: CGFloat) -> CGFloat {
        guard maxVol > 0 else { return 9 }
        return CGFloat((max(9, min(hi, v / maxVol * hi))).rounded())
    }

    var body: some View {
        let maxVol = slots.map(\.volume).max() ?? 0
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("직전 세션 기록").font(.sans(11, 600)).tracking(0.44).foregroundStyle(GY.ink4)
                Spacer()
                if encodeHeight {
                    Text("높이 = 볼륨").font(.sans(10, 500)).tracking(0.2).foregroundStyle(GY.ink4)
                }
            }
            HStack(alignment: .bottom, spacing: 7) {
                ForEach(slots) { s in
                    VStack(spacing: 8) {
                        let h = encodeHeight ? barH(s.volume, maxVol, hi: Self.workHi) : 9
                        RoundedRectangle(cornerRadius: 5)
                            .fill(s.state == .now ? GY.crailBase : (s.state == .done ? GY.ink2 : GY.sunken))
                            .frame(maxWidth: .infinity).frame(height: s.state == .now ? h + 2 : h)
                            .overlay(s.state == .upcoming
                                     ? RoundedRectangle(cornerRadius: 5).strokeBorder(GY.line, lineWidth: 1.5) : nil)
                            // now 세그 — 상시 글로우(barPulse) + 좌드래그 비례 부풀림 (session.js 드래그 추종)
                            .scaleEffect(x: 1, y: s.state == .now ? 1 + dragP * 0.28 : 1, anchor: .bottom)
                            // gBarPulse — 시안 §6: 0 0 0 6px crail/0.22 (PWA barPulse 는 4px/0.16)
                            .segGlowIf(s.state == .now, cornerRadius: 5, alpha: 0.22, spread: 6)
                        // 숫자 위계 (시안 #6b) — 진행중=crail-deep 700 / 완료=ink-2 600 / 예정=ink-3 600
                        VStack(spacing: 2) {
                            Text(s.top)
                                .font(.mono(12.5, s.state == .now ? 700 : 600))
                                .tracking(-0.25)   // -0.02em @12.5 (시안 609행 · mocks .seg-n .w)
                                .foregroundStyle(s.pr || s.state == .now ? GY.crailDeep
                                                 : s.state == .done ? GY.ink2 : GY.ink3)
                                .contentTransition(.numericText())   // 커밋 크로스페이드 이중 노출 방지
                            Text(s.bottom.isEmpty ? " " : s.bottom).font(.mono(10, 500))
                                .foregroundStyle(s.pr || s.state == .now ? GY.crailDeep : GY.ink4)
                                .contentTransition(.numericText())
                        }
                    }
                    .contentShape(Rectangle())
                    .onLongPressGesture(minimumDuration: 0.5) { onLongPressSlot?(s.id) }
                }
                if let best {   // ▲최고 슬롯 — 고정 천장 24px
                    Rectangle().fill(GY.line).frame(width: 1, height: 44).padding(.horizontal, 2)
                    VStack(spacing: 6) {
                        HStack(spacing: 3) {
                            Text("▲").font(.system(size: 7))
                            Text("최고").font(.sans(8, 700)).tracking(0.32)
                        }.foregroundStyle(GY.crailDeep)
                        RoundedRectangle(cornerRadius: 5)
                            .fill(GY.crailTint)
                            .frame(maxWidth: .infinity).frame(height: Self.bestH)
                            .overlay(RoundedRectangle(cornerRadius: 5)
                                .strokeBorder(GY.crailBase, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])))
                        VStack(spacing: 2) {
                            Text("\(best.weight)").font(.mono(12.5, 700)).tracking(-0.25).foregroundStyle(GY.crailDeep)
                            Text("×\(best.reps)").font(.mono(10, 500)).foregroundStyle(GY.crailDeep)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 24).padding(.top, 16)
    }
}

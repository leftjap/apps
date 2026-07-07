import SwiftUI

// 직전 세션 기록 막대 (mocks #cardSetDots, 작업지시서 §3). 높이 = 볼륨.
// seg: [막대(height=barH, radius 5, state색)] + [값 w ×r]. + ▲최고 대시 슬롯.
struct PrevSetBar: Identifiable {
    let id = UUID()
    let weight: Int
    let reps: Int
    let state: BarState
    var volume: Double { Double(weight) * Double(reps) }
}
enum BarState { case done, now, upcoming }

struct PrevRecordBars: View {
    let sets: [PrevSetBar]
    let best: (weight: Int, reps: Int)?

    // barHeightForVolume 포팅: round(max(9, min(24, v/maxVol*24)))
    private func barH(_ v: Double, _ maxVol: Double) -> CGFloat {
        guard maxVol > 0 else { return 9 }
        return CGFloat((max(9, min(24, v / maxVol * 24))).rounded())
    }

    var body: some View {
        let maxVol = sets.filter { $0.state != .now }.map(\.volume).max()
            ?? sets.map(\.volume).max() ?? 0
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("직전 세션 기록").font(.sans(11, 600)).tracking(0.44).foregroundStyle(GY.ink4)
                Spacer()
                Text("높이 = 볼륨").font(.sans(10, 500)).tracking(0.2).foregroundStyle(GY.ink4)
            }
            HStack(alignment: .bottom, spacing: 7) {
                ForEach(sets) { s in
                    VStack(spacing: 8) {
                        let h = s.state == .now ? barH(s.volume, maxVol) + 2 : barH(s.volume, maxVol)
                        RoundedRectangle(cornerRadius: 5)
                            .fill(s.state == .now ? GY.crailBase : (s.state == .done ? GY.ink2 : GY.sunken))
                            .frame(maxWidth: .infinity).frame(height: h)
                            .overlay(s.state == .upcoming
                                     ? RoundedRectangle(cornerRadius: 5).strokeBorder(GY.line, lineWidth: 1.5) : nil)
                        VStack(spacing: 2) {
                            Text("\(s.weight)").font(.mono(12.5, 600))
                                .foregroundStyle(s.state == .done ? GY.ink2 : GY.ink3)
                            Text("×\(s.reps)").font(.mono(10, 500)).foregroundStyle(GY.ink4)
                        }
                    }
                }
                if let best {   // ▲최고 슬롯
                    Rectangle().fill(GY.line).frame(width: 1, height: 44).padding(.horizontal, 2)
                    VStack(spacing: 6) {
                        HStack(spacing: 3) {
                            Text("▲").font(.system(size: 7))
                            Text("최고").font(.sans(8, 700)).tracking(0.32)
                        }.foregroundStyle(GY.crailDeep)
                        RoundedRectangle(cornerRadius: 5)
                            .fill(GY.crailTint)
                            .frame(maxWidth: .infinity).frame(height: barH(Double(best.weight * best.reps), maxVol))
                            .overlay(RoundedRectangle(cornerRadius: 5)
                                .strokeBorder(GY.crailBase, style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])))
                        VStack(spacing: 2) {
                            Text("\(best.weight)").font(.mono(12.5, 700)).foregroundStyle(GY.crailDeep)
                            Text("×\(best.reps)").font(.mono(10, 500)).foregroundStyle(GY.crailDeep)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 24).padding(.top, 16)
    }
}

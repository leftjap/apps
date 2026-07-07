import SwiftUI
import GymCore

// 이 종목 볼륨 — 세그먼트 도넛 링 (mocks .exvol, 작업지시서 §5.1).
// 68px 표시(viewBox 40 → scale 1.7). 세그먼트 = 세트별 볼륨, done=ink2 5.2 / active=crail 6.3 / upcoming=연톤 4.

struct SegmentRing: View {
    let segs: [VolSegment]
    private let sf = 68.0 / 40.0   // viewBox40 → 68px
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
            }
        }
        .frame(width: 68, height: 68)
    }
}

struct ExerciseVolumeRing: View {
    let sets: [GymSet]
    let cur: Int
    let pct: Int           // 67 (직전 대비)
    let curVol: String     // "2,020"
    let totVol: String     // "3,020"
    let overAmt: String?   // "+220" (초과 시)

    var body: some View {
        let segs = VolumeRing.segments(sets, cur: cur).segs
        HStack(alignment: .center, spacing: 18) {
            ZStack {  // .exring 68
                SegmentRing(segs: segs)
                HStack(spacing: 1) {   // .exring-pct
                    Text("\(pct)").font(.mono(14, 700)).tracking(-0.28)
                    Text("%").font(.mono(9.5, 600))
                }.foregroundStyle(GY.crailDeep)
            }
            .frame(width: 68, height: 68)

            HStack(alignment: .firstTextBaseline, spacing: 8) {  // .exnums
                Text(curVol).font(.mono(32, 700)).tracking(-1.12).foregroundStyle(GY.ink1)
                (Text("/ \(totVol)").font(.mono(13.5, 500))
                 + Text("kg").font(.mono(13.5, 500)))
                    .foregroundStyle(GY.ink4).lineLimit(1).fixedSize()
                if let overAmt {   // .exchip
                    HStack(spacing: 3) {
                        Text("▲").font(.system(size: 9))
                        Text(overAmt).font(.mono(12, 600))
                    }
                    .foregroundStyle(GY.crailDeep)
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(GY.crailSoft, in: Capsule())
                    .overlay(Capsule().strokeBorder(GY.crailBase, lineWidth: 1))
                }
            }
        }
        .padding(.bottom, 15)
    }
}

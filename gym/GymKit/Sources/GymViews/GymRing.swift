import SwiftUI

// 진행률 링 — SVG circle(트랙+arc) 이식. 상단에서 시작, 시계방향, 둥근 캡.
// 세션 볼륨 링(시안 #15a): size 56, stroke 4.76(=3.4×56/40), track=line, fill=cloudyBase.
public struct GymRing: View {
    let size: CGFloat
    let lineWidth: CGFloat
    let progress: Double          // 0…1
    let track: Color
    let fill: Color

    public init(size: CGFloat, lineWidth: CGFloat, progress: Double, track: Color, fill: Color) {
        self.size = size; self.lineWidth = lineWidth; self.progress = progress
        self.track = track; self.fill = fill
    }

    public var body: some View {
        ZStack {
            Circle().stroke(track, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: max(0, min(1, progress)))
                .stroke(fill, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))  // 12시 시작
        }
        .padding(lineWidth / 2)   // stroke 가 프레임 밖으로 안 나가게
        .frame(width: size, height: size)
    }
}

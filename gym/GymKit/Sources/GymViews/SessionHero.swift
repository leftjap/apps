import SwiftUI

// 히어로 — 중량×횟수 (mocks .hero-* / 옵션 B). 세션 화면 중앙, 스와이프=세트완료 영역.
// mono 는 실앱 Space Grotesk 번들 전 시스템 monospaced 폴백.
struct SessionHero: View {
    let weight: String   // "65"
    let unit: String     // "kg"
    let reps: String     // "10"
    var body: some View {
        VStack(spacing: 0) {
            // 중량
            Text(weight)
                .font(.system(size: 122, weight: .semibold, design: .monospaced))
                .tracking(-6.7)                 // -0.055em @122
                .foregroundStyle(GY.ink1)
                .lineSpacing(0)
            Text(unit)
                .font(.system(size: 15, weight: .semibold))
                .tracking(0.3).foregroundStyle(GY.ink4)
                .padding(.top, 6)
            // 횟수
            HStack(alignment: .firstTextBaseline, spacing: 9) {
                Text("×").font(.system(size: 24, weight: .light, design: .monospaced)).foregroundStyle(GY.ink4)
                Text(reps).font(.system(size: 50, weight: .regular, design: .monospaced))
                    .tracking(-1).foregroundStyle(GY.ink2)
                Text("회").font(.system(size: 16, weight: .medium)).foregroundStyle(GY.ink3)
            }
            .padding(.top, 18)
        }
    }
}

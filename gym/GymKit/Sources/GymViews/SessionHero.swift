import SwiftUI
import GymCore

// 히어로 — 현재 세트 크게 (mocks .hero-* / 옵션 B). equipment 별 분기 (spec §6-3·§6-4):
//  weight: 중량×횟수 / bodyweight: "맨몸"+횟수 / cardio: 시간(분)+거리(km)+페이스.
// 잠금(명시적 완료): ✓(sage 92px) + "N세트 완료" (cardio 제외). 프리셋은 가는 굵기로 구분(§6-3-3).
struct SessionHero: View {
    let kind: GymCardKind
    let topValue: String     // weight | 분 | "맨몸"
    let bottomValue: String  // reps | km
    let preset: Bool         // 미수정 placeholder — font-weight 차등
    let locked: Bool         // block.finishedAt read-only
    let doneSetCount: Int
    let pace: String?        // cardio "9:23/km" (시간·거리 둘 다 있을 때)
    var onTopTap: ((HeroZone) -> Void)? = nil     // 좌30 감소 / 중40 키패드 / 우30 증가
    var onBottomTap: ((HeroZone) -> Void)? = nil

    init(kind: GymCardKind = .weight, topValue: String, bottomValue: String,
         preset: Bool = false, locked: Bool = false, doneSetCount: Int = 0, pace: String? = nil,
         onTopTap: ((HeroZone) -> Void)? = nil, onBottomTap: ((HeroZone) -> Void)? = nil) {
        self.kind = kind; self.topValue = topValue; self.bottomValue = bottomValue
        self.preset = preset; self.locked = locked; self.doneSetCount = doneSetCount; self.pace = pace
        self.onTopTap = onTopTap; self.onBottomTap = onBottomTap
    }

    var body: some View {
        VStack(spacing: 0) {
            if locked && kind != .cardio {
                // 완료 read-only 요약 (§6-8)
                Text("✓").font(.mono(92, 500)).foregroundStyle(GY.sage)
                    .accessibilityIdentifier("hero-done")
                Text("\(doneSetCount)세트 완료").font(.sans(13, 600)).tracking(1.82)
                    .foregroundStyle(GY.sage).padding(.top, 18)
            } else {
                switch kind {
                case .weight:
                    big(topValue, unit: "kg").overlay { zones(onTopTap) }
                    repsRow(bottomValue, unit: "회").overlay { zones(onBottomTap) }
                case .bodyweight:
                    Text("맨몸").font(.sans(64, 700)).tracking(-1.9)
                        .foregroundStyle(GY.ink3)
                        .accessibilityIdentifier("hero-weight")
                        .frame(maxWidth: .infinity)
                    repsRow(bottomValue, unit: "회").overlay { zones(onBottomTap) }
                case .cardio:
                    big(topValue, unit: "분").overlay { zones(onTopTap) }
                    repsRow(bottomValue, unit: "km", showX: false).overlay { zones(onBottomTap) }
                    if let pace {
                        Text(pace).font(.mono(15, 500)).tracking(0.6)
                            .foregroundStyle(GY.crailDeep).padding(.top, 10)
                            .accessibilityIdentifier("hero-pace")
                    }
                }
            }
        }
    }

    // 탭 존 오버레이 — 행 전폭 기준 좌 30% / 중앙 40% / 우 30% (session.js ratio 0.3/0.7).
    @ViewBuilder
    func zones(_ handler: ((HeroZone) -> Void)?) -> some View {
        if let handler {
            GeometryReader { g in
                HStack(spacing: 0) {
                    Color.clear.contentShape(Rectangle())
                        .frame(width: g.size.width * 0.3)
                        .onTapGesture { handler(.minus) }
                        .accessibilityIdentifier("zone-minus")
                    Color.clear.contentShape(Rectangle())
                        .frame(width: g.size.width * 0.4)
                        .onTapGesture { handler(.center) }
                        .accessibilityIdentifier("zone-center")
                    Color.clear.contentShape(Rectangle())
                        .onTapGesture { handler(.plus) }
                        .accessibilityIdentifier("zone-plus")
                }
            }
        }
    }

    // 중량/시간 (mono, 프리셋은 300 가늘게)
    func big(_ v: String, unit: String) -> some View {
        VStack(spacing: 0) {
            Text(v)
                .font(.mono(122, preset ? 300 : 600))
                .tracking(-6.7)                 // -0.055em @122
                .foregroundStyle(locked ? GY.ink4 : GY.ink1)
                .lineSpacing(0)
                .accessibilityIdentifier("hero-weight")
            Text(unit)
                .font(.sans(15, 600))
                .tracking(0.3).foregroundStyle(GY.ink4)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)   // 탭 존 전폭 (§6-3 hit area)
    }

    // 횟수/거리 (cardio 는 × 기호 없음)
    func repsRow(_ v: String, unit: String, showX: Bool = true) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 9) {
            if showX { Text("×").font(.mono(24, 300)).foregroundStyle(GY.ink4) }
            Text(v).font(.mono(50, preset ? 300 : 400))
                .tracking(-1).foregroundStyle(locked ? GY.ink4 : GY.ink2)
                .accessibilityIdentifier("hero-reps")
            Text(unit).font(.sans(16, 500)).foregroundStyle(GY.ink3)
        }
        .padding(.top, 18)
        .frame(maxWidth: .infinity)
    }
}

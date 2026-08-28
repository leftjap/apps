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
    let prChip: String?      // "+5kg" — 직전 세션 최대 무게 초과 넛지 (§6-11 progressive overload)
    var swapMoment: Int = 0  // 세트완료 커밋 — 히어로 수평 스왑 IN 재생 (§5.3 gHeroSwapW/R)
    var ghostOut: Bool? = nil   // 옛 값 고스트 — 값 = fromDrag (행별 OUT: 중량 -96 / 횟수 -88·55ms)
    var flashTop: Bool = false     // ± 증감 직후 미세 플래시 (spec §6-3, PWA flashElement)
    var flashBottom: Bool = false
    var onTopTap: ((HeroZone) -> Void)? = nil     // 좌30 감소 / 중40 키패드 / 우30 증가
    var onBottomTap: ((HeroZone) -> Void)? = nil

    init(kind: GymCardKind = .weight, topValue: String, bottomValue: String,
         preset: Bool = false, locked: Bool = false, doneSetCount: Int = 0, pace: String? = nil,
         prChip: String? = nil, swapMoment: Int = 0, ghostOut: Bool? = nil,
         flashTop: Bool = false, flashBottom: Bool = false,
         onTopTap: ((HeroZone) -> Void)? = nil, onBottomTap: ((HeroZone) -> Void)? = nil) {
        self.kind = kind; self.topValue = topValue; self.bottomValue = bottomValue
        self.preset = preset; self.locked = locked; self.doneSetCount = doneSetCount; self.pace = pace
        self.prChip = prChip; self.swapMoment = swapMoment; self.ghostOut = ghostOut
        self.flashTop = flashTop; self.flashBottom = flashBottom
        self.onTopTap = onTopTap; self.onBottomTap = onBottomTap
    }

    // 스왑 모션은 **숫자 요소에만** 건다 (시안 #7b 310·315행 — kg·×·회 는 정지).
    // 색은 modifier 가 준다(Text 에 직접 걸면 바깥 foregroundStyle 이 무시됨 → 착지 플래시 소실).
    @ViewBuilder func heroNumber(_ v: String, font: Font, tracking: CGFloat, id: String,
                                 spec: HeroSwapSpec, base: Color) -> some View {
        // iOS Text.tracking 은 마지막 글자 뒤에도 자간을 적용해 프레임이 좁아지고, 그 좁은 프레임에
        // 마지막 글자 잉크를 자른다(브라우저는 letter-spacing 를 넣어도 잉크를 안 자름).
        // → 글자 사이에만 kern 을 넣는 AttributedString 으로 프레임을 넓혀 클립을 없앤다 (중앙 정렬 유지).
        let t = Text(HeroNumberText.kerned(v, tracking: tracking)).font(font)
        if let fromDrag = ghostOut {
            t.foregroundStyle(base)
                .modifier(HeroGhostOut(fromDrag: fromDrag, dxOut: spec.dxOut, delay: spec.delay))
                .accessibilityIdentifier(id)
        } else {
            t.modifier(HeroRowSwapIn(trigger: swapMoment, delay: spec.delay, dxIn: spec.dxIn,
                                     landScale: spec.landScale, landOvershoot: spec.landOvershoot,
                                     baseColor: base))
                .accessibilityIdentifier(id)
        }
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
                    big(topValue, unit: "kg", flash: flashTop).overlay { zones(onTopTap, numberWidth: Self.bigWidth(topValue)) }
                    repsRow(bottomValue, unit: "회", flash: flashBottom).overlay { zones(onBottomTap, numberWidth: Self.repsWidth(bottomValue)) }
                    if let prChip {   // mocks #cardPrChip — ▲ +Nkg (crail-soft pill)
                        HStack(spacing: 6) {
                            Text("▲").font(.system(size: 9)).foregroundStyle(GY.crailDeep)
                            Text(prChip).font(.mono(13, 600)).foregroundStyle(GY.ink1)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(GY.crailSoft, in: Capsule())
                        .overlay(Capsule().strokeBorder(GY.crailBase, lineWidth: 1))
                        .padding(.top, 18)
                        .accessibilityIdentifier("hero-prchip")
                    }
                case .bodyweight:
                    // 맨몸은 중량이 없다 — "맨몸" 표기를 빼고 횟수를 히어로 크기로 (사용자 2026-07-19).
                    // 탭 존은 그대로 onBottomTap(= 횟수 전용, heroTap 의 row == .bottom 가드 정합).
                    big(bottomValue, unit: "회", id: "hero-reps", flash: flashBottom).overlay { zones(onBottomTap, numberWidth: Self.bigWidth(bottomValue)) }
                case .cardio:
                    big(topValue, unit: "분", flash: flashTop).overlay { zones(onTopTap, numberWidth: Self.bigWidth(topValue)) }
                    repsRow(bottomValue, unit: "km", showX: false, flash: flashBottom).overlay { zones(onBottomTap, numberWidth: Self.repsWidth(bottomValue)) }
                    if let pace {
                        Text(pace).font(.mono(15, 500)).tracking(0.6)
                            .foregroundStyle(GY.crailDeep).padding(.top, 10)
                            .accessibilityIdentifier("hero-pace")
                    }
                }
            }
        }
    }

    // 탭 존 오버레이 — 중앙(키패드)은 **그려진 숫자 폭**에 맞추고 좌우가 나머지를 반씩 갖는다.
    // 40% 고정이던 종전엔 횟수 행에서 존이 숫자의 두 배라 여백 탭이 안 먹었다 (실기기 2026-08-23).
    //
    // 좌우 끝 `heroEdgeGutter`(26pt)는 불감대다 — 시안 `#cardSwipeArea { padding: 0 26px }`
    // (mocks/session.html:346) 의 여백이 이식에서 빠져 증감 존이 화면 끝(x=0)까지 닿았고,
    // 벤치에 둔 폰을 집을 때 베젤 근처 접촉이 그대로 ±증분으로 먹혔다 (실기기 2026-08-28).
    @ViewBuilder
    func zones(_ handler: ((HeroZone) -> Void)?, numberWidth: CGFloat) -> some View {
        if let handler {
            GeometryReader { g in
                let center = CGFloat(GymSwipeMath.heroCenterZone(
                    numberWidth: Double(numberWidth), rowWidth: Double(g.size.width)))
                let side = CGFloat(GymSwipeMath.heroSideZone(
                    center: Double(center), rowWidth: Double(g.size.width)))
                let tap = CGFloat(GymSwipeMath.heroTapZone(side: Double(side)))
                let gutter = side - tap
                HStack(spacing: 0) {
                    gutterZone(gutter)
                    Color.clear.contentShape(Rectangle())
                        .frame(width: tap)
                        .onTapGesture { handler(.minus) }
                        .accessibilityIdentifier("zone-minus")
                    Color.clear.contentShape(Rectangle())
                        .frame(width: center)
                        .onTapGesture { handler(.center) }
                        .accessibilityIdentifier("zone-center")
                    Color.clear.contentShape(Rectangle())
                        .frame(width: tap)
                        .onTapGesture { handler(.plus) }
                        .accessibilityIdentifier("zone-plus")
                    gutterZone(gutter)
                }
            }
        }
    }

    /// 가장자리 불감대 — **탭을 흡수한다.** 빈 구멍(allowsHitTesting false)으로 두면 화면 끝
    /// 접촉이 이웃 증감 존으로 새어 들어간다 (시뮬 실측: 존이 x=26 부터인데 x=8 탭이 감소로 먹힘.
    /// 내부 경계 112.67pt 는 정확 — 새는 건 가장자리뿐).
    func gutterZone(_ w: CGFloat) -> some View {
        Color.clear.contentShape(Rectangle())
            .frame(width: w)
            .onTapGesture { }
            .accessibilityIdentifier("zone-gutter")
    }

    // 그려진 숫자의 실제 폭 (tracking 은 글자 사이에만 붙으므로 n-1 개만 뺀다).
    static func bigWidth(_ v: String) -> CGFloat {
        GymMonoFont.width(v, size: 122, weight: 600) - 6.7 * CGFloat(max(0, v.count - 1))
    }
    static func repsWidth(_ v: String) -> CGFloat {
        GymMonoFont.width(v, size: 50, weight: 500) - 1.0 * CGFloat(max(0, v.count - 1))
    }

    // 히어로 큰 숫자 굵기 — 시안·PWA 고정. 프리셋이라고 얇게 그리지 않는다(증량 시 굵기 튐 방지).
    static func weightMonoWeight(preset: Bool) -> Int { 600 }   // .hero-weight 600 고정
    static func repsMonoWeight(preset: Bool) -> Int { 400 }     // .hero-reps 400 고정

    // 중량/시간 (mono). 스왑은 숫자만 — 단위는 정지.
    // id: 맨몸은 이 자리에 횟수가 오므로 "hero-reps" 로 넘긴다.
    func big(_ v: String, unit: String, id: String = "hero-weight", flash: Bool = false) -> some View {
        VStack(spacing: 0) {
            heroNumber(v, font: .mono(122, Self.weightMonoWeight(preset: preset)), tracking: -6.7,   // -0.055em @122
                       id: id, spec: .weight,
                       base: locked ? GY.ink4 : GY.ink1)
                .lineSpacing(0)
                .opacity(flash ? 0.45 : 1)
                .animation(.easeOut(duration: 0.075), value: flash)
            Text(unit)
                .font(.sans(15, 600))
                .tracking(0.3).foregroundStyle(GY.ink4)
                .padding(.top, 6)
                .opacity(ghostOut == nil ? 1 : 0)   // 고스트는 숫자만 — 단위는 라이브 히어로 것 하나만 보인다
        }
        .frame(maxWidth: .infinity)   // 탭 존 전폭 (§6-3 hit area)
    }

    // 횟수/거리 (cardio 는 × 기호 없음). 스왑은 숫자만 — × · 회 는 정지.
    func repsRow(_ v: String, unit: String, showX: Bool = true, repsDelay: Double = 0.055,
                 flash: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 9) {
            if showX {
                Text("×").font(.mono(24, 300)).foregroundStyle(GY.ink4)
                    .opacity(ghostOut == nil ? 1 : 0)
            }
            // 횟수 스왑 스펙 — 착지 -6·scale 1.09 (시안 gHeroSwapR). 지연은 호출 컨텍스트별(맨몸/유산소는 0).
            let repsSpec = HeroSwapSpec(dxIn: HeroSwapSpec.reps.dxIn, dxOut: HeroSwapSpec.reps.dxOut,
                                        landOvershoot: HeroSwapSpec.reps.landOvershoot,
                                        landScale: HeroSwapSpec.reps.landScale, delay: repsDelay)
            heroNumber(v, font: .mono(50, Self.repsMonoWeight(preset: preset)), tracking: -1,   // -0.02em @50
                       id: "hero-reps", spec: repsSpec,
                       base: locked ? GY.ink4 : GY.ink2)
                .opacity(flash ? 0.45 : 1)
                .animation(.easeOut(duration: 0.075), value: flash)
            Text(unit).font(.sans(16, 500)).foregroundStyle(GY.ink3)
                .opacity(ghostOut == nil ? 1 : 0)
        }
        .padding(.vertical, 6)   // 시안 #6b 658행 padding:6px 0 (히트 영역)
        .padding(.top, 18)
        .frame(maxWidth: .infinity)
    }
}

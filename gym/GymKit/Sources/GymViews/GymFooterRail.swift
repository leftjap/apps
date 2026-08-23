import SwiftUI
import GymCore

// 세션 하단 운동종목 레일 — 작업지시서 §4 3단 깊이(완료=눌림/현재=떠오름/예정=평면) 네이티브 이식.
// PWA mocks/session.html .fp-* 정합. 상태: done / current / upcoming.

public enum RailState {
    case done, current, upcoming
    var idName: String {
        switch self { case .done: "done"; case .current: "current"; case .upcoming: "upcoming" }
    }
    init(core: GymSessionLogic.GymRailState) {
        switch core {
        case .done: self = .done
        case .current: self = .current
        case .upcoming: self = .upcoming
        }
    }
    var core: GymSessionLogic.GymRailState {
        switch self { case .done: .done; case .current: .current; case .upcoming: .upcoming }
    }
}

// 시안 #15a 체크 — "M2.4 6.3l2.4 2.4L9.6 3.4" (viewBox 12×12, 11px, stroke 1.7)
struct CheckGlyph: Shape {
    static func stroke(_ size: CGFloat) -> StrokeStyle {
        StrokeStyle(lineWidth: 1.7 * size / 12, lineCap: .round, lineJoin: .round)
    }
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 12
        var p = Path()
        p.move(to: CGPoint(x: 2.4 * s, y: 6.3 * s))
        p.addLine(to: CGPoint(x: 4.8 * s, y: 8.7 * s))
        p.addLine(to: CGPoint(x: 9.6 * s, y: 3.4 * s))
        return p
    }
}

// 시안 #15a ＋ — "M10 4v12M4 10h12" (viewBox 20×20, 19px, stroke 1.7)
struct PlusGlyph: Shape {
    static func stroke(_ size: CGFloat) -> StrokeStyle {
        StrokeStyle(lineWidth: 1.7 * size / 20, lineCap: .round)
    }
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 20
        var p = Path()
        p.move(to: CGPoint(x: 10 * s, y: 4 * s)); p.addLine(to: CGPoint(x: 10 * s, y: 16 * s))
        p.move(to: CGPoint(x: 4 * s, y: 10 * s)); p.addLine(to: CGPoint(x: 16 * s, y: 10 * s))
        return p
    }
}

// 완료(done) — 납작한 회색 칩 + 무채색 체크. 눌림 inset 그림자 없이 가라앉혀 "정리됨".
struct DoneChip: View {
    let name: String
    var body: some View {
        HStack(spacing: 7) {
            CheckGlyph().stroke(Color(oklch: 0.70, 0.006, 60), style: CheckGlyph.stroke(11))
                .frame(width: 11, height: 11)
            Text(name)
                .font(.sans(14.5, 500))
                .lineLimit(1)
                .foregroundStyle(Color(oklch: 0.58, 0.006, 60))
        }
        .padding(.horizontal, 16)
        .frame(height: 40)
        .background(Color(oklch: 0.963, 0.003, 60), in: RoundedRectangle(cornerRadius: 14))
        .overlay(  // inset 0 0 0 1px oklch(93.5% .005 60) — 헤어라인만 (눌림 그림자 제거)
            RoundedRectangle(cornerRadius: 14).strokeBorder(Color(oklch: 0.935, 0.005, 60), lineWidth: 1))
    }
}

// 예정(upcoming) — 평면 아웃라인 칩 (§4.3)
struct UpcomingChip: View {
    let name: String
    var body: some View {
        Text(name)
            .font(.sans(14.5, 600))
            .lineLimit(1)
            .foregroundStyle(Color(oklch: 0.60, 0.008, 60))
            .padding(.horizontal, 15)
            .frame(height: 40)
            .overlay(  // inset 0 0 0 1.5px oklch(91% .006 60)
                RoundedRectangle(cornerRadius: 12).strokeBorder(Color(oklch: 0.91, 0.006, 60), lineWidth: 1.5))
    }
}

// 재생 중 이퀄라이저 — 라이브 점/세트 표기 대체. 막대 3개(짧·긴·중) 스태거 스케일.
// PWA `.fp-chip__eq` 정합: w 3.2 · r 2 · h 8/15/11 · fpEq 1.15s · delay 0/−0.45/−0.85.
// CSS 는 음수 delay 로 위상을 어긋내지만 SwiftUI 엔 delay 음수가 없어 각 막대의 시작 위상을
// `phase` 로 직접 준다 (0.45/1.15 = 0.391, 0.85/1.15 = 0.739 주기만큼 앞선 상태).
struct EqualizerGlyph: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animating = false
    private static let bars: [(h: CGFloat, phase: Double)] = [(8, 0), (15, 0.391), (11, 0.739)]

    var body: some View {
        HStack(alignment: .bottom, spacing: 2.5) {
            ForEach(Array(Self.bars.enumerated()), id: \.offset) { _, bar in
                Capsule(style: .continuous)
                    .fill(GY.crailBase)
                    .frame(width: 3.2, height: bar.h)
                    .scaleEffect(y: animating ? 1 : 0.4, anchor: .bottom)
                    .animation(reduceMotion || GymSnapshot.isActive ? nil
                               : .easeInOut(duration: 1.15 / 2)
                                   .repeatForever(autoreverses: true)
                                   .delay((1 - bar.phase) * 1.15 / 2),
                               value: animating)
            }
        }
        .frame(height: 15, alignment: .bottom)
        .onAppear {
            guard !GymSnapshot.isActive, !reduceMotion else { return }
            animating = true
        }
    }
}

// 현재(current) — 정지한 웜화이트 카드 + crail 테두리 + 재생 이퀄라이저.
// 카드는 정지(스케일 맥동 제거), 이퀄라이저 막대만 움직여 "운동 중"을 전달 → 튀지 않지만 눈에 띔.
struct CurrentChip: View {
    let name: String
    var body: some View {
        HStack(spacing: 11) {
            EqualizerGlyph()
            Text(name)
                .font(.sans(18, 800))
                .lineLimit(1)
                .foregroundStyle(GY.ink1)
                .tracking(-0.36) // -0.02em @18px
        }
        .padding(.horizontal, 20)
        .frame(height: 50)
        .background(
            LinearGradient(colors: [Color(hex: 0xFFFDFA), Color(hex: 0xF6F3EC)],
                           startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: 16))
        .overlay(  // 0 0 0 1.7px var(--crail-base) — 정지 링
            RoundedRectangle(cornerRadius: 16).strokeBorder(GY.crailBase, lineWidth: 1.7))
        // 드롭 섀도 — CSS 는 음수 spread(-9/-14)로 그림자 도형을 줄인다. SwiftUI 엔 spread 가 없으므로
        // 안쪽으로 줄인 불투명 사각형이 그림자를 던지게 하고, 칩 본체가 그 위를 덮는다.
        .background {
            ZStack {
                RoundedRectangle(cornerRadius: 7).fill(Color.black)
                    .padding(9)     // spread -9px
                    .shadow(color: Color(hex: 0x14120E).opacity(0.34), radius: 8, y: 6)   // 0 6px 16px -9px
                RoundedRectangle(cornerRadius: 2).fill(Color.black)
                    .padding(14)    // spread -14px
                    .shadow(color: Color(hex: 0x14120E).opacity(0.26), radius: 13, y: 14) // 0 14px 26px -14px
            }
            .allowsHitTesting(false)   // 안쪽으로 줄인 도형이라 칩의 불투명 배경에 완전히 가려진다
        }
        .compositingGroup()
        .offset(y: -2)
    }
}

// 칩 제스처 — 탭(전환) + 꾹누르기(메뉴). **스크롤을 막지 않는 게 최우선.**
//
// 종전엔 칩마다 단독 `.onLongPressGesture(0.5)` 를 달았다. 이게 ScrollView 의 팬 인식과
// 경쟁해 레일을 밀 때 첫 움직임이 씹혔고, `onPressingChanged` 가 손이 닿는 즉시 0.96 눌림을
// 그려 스크롤을 시작할 때마다 칩이 한 번 움찔했다 (실기기 2026-08-23 "바로 안 되고 버벅").
//
// 고친 방식:
//  · 꾹누르기를 simultaneousGesture 로 — 팬과 동시 인식이라 스크롤을 지연시키지 않는다.
//  · 눌림 표시는 손가락이 **머무를 때만**. 6pt 넘게 움직이면 그 즉시 해제해 스크롤 시작이
//    깔끔하게 넘어간다.
struct RailChipPressable: ViewModifier {
    var onTap: () -> Void
    var onLongPress: () -> Void
    @State private var pressed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content
            .scaleEffect(pressed && !reduceMotion ? 0.96 : 1)
            .animation(.easeOut(duration: 0.12), value: pressed)
            .onTapGesture { onTap() }
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.5, maximumDistance: 10)
                    .onEnded { _ in
                        pressed = false
                        onLongPress()
                    }
            )
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        // 스크롤로 넘어가는 순간 눌림을 뗀다 — 안 그러면 미는 동안 칩이 눌린 채 끌린다.
                        let moved = abs(v.translation.width) > 6 || abs(v.translation.height) > 6
                        if pressed == moved { pressed = !moved }
                    }
                    .onEnded { _ in pressed = false }
            )
    }
}

// 승격 착지 팝 — 칩이 current 가 되는 순간 그 자리(레일, 사용자 시선·손가락 지점)에서
// scale 0.9→1.06→1 로 터지는 전환 확인 신호 (사용자 2026-07-23 "하단엔 효과가 없다").
// Item identity 가 blockIdx 로 안정돼 있어 onAppear = upcoming/done→current 전환 시점 1회.
// 착지 연출은 도착 시점에 — 탭 즉시 터뜨리면 스크롤 이동과 겹쳐 "이동→안착" 서사가 죽는다
// (실기기 보고 2026-07-24 "안착했다는 느낌이 안 산다"). 스크롤(railTravel)이 끝나는 시점에
// 스쿼시+링을 재생해 이동의 종점을 찍는다.
// 두 박자 이동(사용자 2026-07-24 최종): 정렬이 끝 그림을 표준화해 위치 신호가 0 이므로,
// 이동 신호는 여정에 넣는다 — 탭 자리에서 승격된 채 dwell 만큼 머문 뒤("네가 고른 게 이거")
// 정렬 위치로 미끄러진다("작업 위치로 이동").
enum RailLanding {
    static let dwell = 0.22     // 탭 자리 머무름 — 승격을 손가락 위치에서 보여주는 박자
    static let travel = 0.58    // dwell + 스크롤 이동 — 착지 스쿼시·링·안착 햅틱의 동조점
}

struct CurrentChipLandPop: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var fired = false
    func body(content: Content) -> some View {
        content
            // 착지 스쿼시 — 이동 대기(1.0 유지) → 눌림(0.94) → 반동(1.07) → 정착
            .keyframeAnimator(initialValue: 1.0, trigger: fired) { view, s in
                view.scaleEffect(s)
            } keyframes: { _ in
                CubicKeyframe(1.0, duration: RailLanding.travel)
                CubicKeyframe(0.94, duration: 0.09)
                CubicKeyframe(1.07, duration: 0.16)
                CubicKeyframe(1.0, duration: 0.16)
            }
            // crail 확산 링 — 착지 순간 칩 테두리에서 바깥으로 퍼지며 소멸 (0.55s).
            // 세트완료 햅틱 링과 같은 모션 언어.
            // offset(y:-2) — CurrentChip body 마지막 줄의 렌더 오프셋은 레이아웃 프레임을 안 옮기므로
            // overlay 가 2pt 아래에 붙어 링이 칩 테두리와 어긋난다 (감사 확정 #9).
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(GY.crailBase, lineWidth: 2.5)
                    .offset(y: -2)
                    .keyframeAnimator(initialValue: 0.0, trigger: fired) { ring, p in
                        // 재생 중(0<p<1)에만 확산 — 종료 상태를 scale 1 로 되돌려야
                        // 투명 링이 칩의 접근성 프레임을 부풀리지 않는다 (UI 테스트 실측 결함)
                        let live = p > 0 && p < 1
                        ring
                            .scaleEffect(live ? 1 + 0.45 * p : 1)
                            .opacity(live ? (1 - p) * 0.85 : 0)
                    } keyframes: { _ in
                        CubicKeyframe(0.0, duration: RailLanding.travel)   // 이동 중 대기
                        CubicKeyframe(1.0, duration: 0.55)
                    }
                    .allowsHitTesting(false)
            }
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion else { return }
                fired = true
            }
    }
}

// ＋ 종목 추가 버튼 (§4.4) — 탭 → 운동 선택 바텀시트 (§6-2)
struct AddExerciseButton: View {
    var action: () -> Void = {}
    var body: some View {
        Button(action: action) {
            PlusGlyph().stroke(GY.ink3, style: PlusGlyph.stroke(19))
                .frame(width: 19, height: 19)
                .frame(width: 44, height: 44)
                .background(GY.card, in: Circle())
                .overlay(Circle().strokeBorder(GY.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("rail-add")
    }
}

// 레일 컨테이너 — 트랙(스크롤) + ＋버튼(고정). 현재 카드 중앙 정렬은 스크롤/정렬 로직(다음 증분).
// 칩 탭 = 블록 이동(§6-8), 꾹누르기(500ms) = 액션시트(§6-9).
public struct GymFooterRail: View {
    public struct Item: Identifiable {
        // 안정 identity = blockIdx — UUID 는 매 렌더 재생성이라 칩 뷰가 통째로 다시 만들어져
        // 상태 전환 애니(착지 팝·재정렬 슬라이드)가 불가능했다 (사용자 2026-07-23 레일 무피드백 보고).
        public var id: Int { blockIdx }
        public let name: String; public let state: RailState
        public let blockIdx: Int   // 원본 blocks 인덱스 (재정렬돼도 탭 타깃 보존)
        public init(name: String, state: RailState, blockIdx: Int = 0) {
            self.name = name; self.state = state; self.blockIdx = blockIdx
        }
    }
    let items: [Item]
    var onTapItem: (Int) -> Void
    var onLongPressItem: (Int) -> Void
    var onAdd: () -> Void
    public init(items: [Item], onTapItem: @escaping (Int) -> Void = { _ in },
                onLongPressItem: @escaping (Int) -> Void = { _ in },
                onAdd: @escaping () -> Void = {}) {
        self.items = items
        self.onTapItem = onTapItem; self.onLongPressItem = onLongPressItem; self.onAdd = onAdd
    }

    // 현재 칩의 콘텐츠 좌표 x 범위 — 폭(maxX−minX)으로 scrollTo anchor 를 계산한다.
    struct CurChipMaxXKey: PreferenceKey {
        static let defaultValue: CGFloat = 0
        static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
            let n = nextValue(); if n > 0 { value = n }
        }
    }
    struct CurChipMinXKey: PreferenceKey {
        static let defaultValue: CGFloat = 0
        static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
            let n = nextValue(); if n > 0 { value = n }
        }
    }
    struct ChipsMaxXKey: PreferenceKey {
        static let defaultValue: CGFloat = 0
        static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
            let n = nextValue(); if n > 0 { value = n }
        }
    }
    @State private var curMaxX: CGFloat = 0
    @State private var curMinX: CGFloat = 0
    @State private var chipsMaxX: CGFloat = 0
    @State private var viewportW: CGFloat = 0
    // 두 박자 이동 — 지연 정렬 예약의 세대 토큰(연타 시 이전 예약 무효화) + 머무름 종료 시각
    @State private var alignGen = 0
    @State private var dwellUntil: Date = .distantPast
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // 마지막 종목처럼 현재 칩 뒤가 짧으면 scrollTo 가 클램프돼 좌측 inset 정렬이 실패한다 — 부족분만 채운다.
    var trailingSpacer: CGFloat {
        CGFloat(GymSessionLogic.railTrailingSpacer(
            hasCurrent: items.contains { $0.state == .current },
            currentChipMinX: Double(curMinX), chipsMaxX: Double(chipsMaxX),
            viewportWidth: Double(viewportW)))
    }

    var chipsRow: some View {
        HStack(spacing: 0) {
            HStack(spacing: 10) {
                ForEach(items) { item in
                    Group {
                        switch item.state {
                        case .done: DoneChip(name: item.name)
                        case .current:
                            CurrentChip(name: item.name)
                                .background(GeometryReader { g in
                                    Color.clear
                                        .preference(key: CurChipMaxXKey.self,
                                                    value: g.frame(in: .named("railContent")).maxX)
                                        .preference(key: CurChipMinXKey.self,
                                                    value: g.frame(in: .named("railContent")).minX)
                                })
                                // 승격 순간 착지 팝 — identity 안정으로 onAppear = current 전환 시점
                                .modifier(CurrentChipLandPop())
                        case .upcoming: UpcomingChip(name: item.name)
                        }
                    }
                    .id(item.id)   // 스크롤 타깃 = blockIdx (align 의 scrollTo 와 일치)
                    .accessibilityIdentifier("rail-\(item.state.idName)-\(item.name)")
                    .modifier(RailChipPressable(onTap: { onTapItem(item.blockIdx) },
                                                onLongPress: { onLongPressItem(item.blockIdx) }))
                }
            }
            // 슬라이드·모프 — 추가/삭제 시 자리 이동 + 승격/강등 시 칩 폭·스타일 전환(제자리 모프).
            // 상태를 키에 포함해야 dwell 동안 승격 변형이 스냅이 아니라 부드러운 모프로 보인다.
            .animation(GymSnapshot.isActive || reduceMotion ? nil : .easeOut(duration: 0.25),
                       value: items.map { "\($0.blockIdx):\($0.state.idName)" }.joined(separator: "|"))
            .background(GeometryReader { g in   // 칩 줄 우단 — 스페이서는 제외해야 되먹임이 없다
                Color.clear.preference(key: ChipsMaxXKey.self,
                                       value: g.frame(in: .named("railContent")).maxX)
            })
            Color.clear.frame(width: trailingSpacer, height: 1)
        }
        .fixedSize(horizontal: true, vertical: false) // white-space:nowrap — 칩 자연폭 유지
        // 하단 30: 현재 카드 드롭섀도를 스크롤 트랙 안에서 완결시켜 ScrollView·마스크 경계의
        // 절단선을 없앤다 (레일 그림자픽스 작업지시서 · PWA .fp-rail padding 12 4 30 정합).
        .padding(.top, 12).padding(.bottom, 30)
        .padding(.horizontal, 4)
    }

    // 현재 칩을 좌측 railLeftInset 위치로 (직전 완료 칩은 우측 끝 16px 만 노출).
    // 전 종목 완료(current 없음)면 선두로 되돌려 완료 칩이 좌측에 잘리지 않게 한다.
    func align(_ proxy: ScrollViewProxy, viewportW: CGFloat, animated: Bool) {
        guard let target = GymSessionLogic.railScrollTarget(
            states: items.map(\.state.core),
            currentChipMinX: Double(curMinX), currentChipMaxX: Double(curMaxX),
            viewportWidth: Double(viewportW)) else { return }
        let apply = {
            // scrollTo 타깃 = 칩의 안정 id(blockIdx) — railScrollTarget 의 위치 idx 를 매핑
            switch target {
            case .leading: if let first = items.first { proxy.scrollTo(first.id, anchor: .leading) }
            case .anchored(let idx, let anchorX):
                guard items.indices.contains(idx) else { return }
                proxy.scrollTo(items[idx].id, anchor: UnitPoint(x: anchorX, y: 0.5))
            }
        }
        if animated {
            // 스프링 — 이동이 눌러앉듯 정착해 "옮겨갔다"가 읽힌다 (착지 연출과 동조, RailLanding.travel)
            withAnimation(.spring(response: 0.42, dampingFraction: 0.82)) { apply() }
        } else { apply() }
    }

    public var body: some View {
        // 전환 감지 키는 **현재 칩의 blockIdx** — items 내 위치 idx 로 잡으면 완료 재정렬이 위치를
        // 보정해 버리는 전환(순서 밖 완료·완료 칩 탭)에서 값이 안 바뀌어 두 박자가 통째로 스킵되고
        // 착지 연출·안착 햅틱만 정지한 레일에 뒤늦게 붙는다 (감사 확정 #2·#5·#16).
        let currentKey = items.first { $0.state == .current }?.blockIdx
        HStack(spacing: 8) {
            Group {
                if GymSnapshot.isActive {
                    // 스냅샷 — ImageRenderer 는 ScrollView 내부 미렌더 → 평면
                    chipsRow
                        .frame(maxWidth: .infinity, alignment: items.count <= 1 ? .center : .leading)
                        .clipped()
                } else {
                    // 실앱 — 가로 스크롤. 완료 칩이 없으면 선두 고정, 있으면 현재 칩을 좌측
                    // railLeftInset 위치로 정렬해 직전 완료 칩 우측 끝 16px 만 남긴다 (PWA .fp-rail 정합).
                    // scrollTo 초기 위치만 정하므로 사용자 스크롤은 자유(완료 칩 전체 열람 가능).
                    GeometryReader { vp in
                        ScrollViewReader { proxy in
                            ScrollView(.horizontal, showsIndicators: false) {
                                chipsRow.coordinateSpace(name: "railContent")
                            }
                            .onPreferenceChange(CurChipMaxXKey.self) { curMaxX = $0 }
                            .onPreferenceChange(CurChipMinXKey.self) { curMinX = $0 }
                            .onPreferenceChange(ChipsMaxXKey.self) { chipsMaxX = $0 }
                            .onAppear {
                                viewportW = vp.size.width
                                align(proxy, viewportW: vp.size.width, animated: false)
                            }
                            .onChange(of: vp.size.width) { _, w in viewportW = w }
                            // 두 박자 — 탭 자리에서 dwell 만큼 머문 뒤 정렬 위치로 미끄러진다.
                            // reduce-motion 은 두 박자를 건너뛰고 즉시 정렬 (감사 확정 #3·#8 —
                            // 다른 모션은 전부 게이트돼 있는데 이 경로만 스프링이 남아 있었다).
                            .onChange(of: currentKey) { _, _ in
                                guard !reduceMotion else {
                                    align(proxy, viewportW: vp.size.width, animated: false)
                                    return
                                }
                                alignGen += 1
                                let gen = alignGen
                                // 차단 창은 재정렬 애니(0.25s)보다 길어야 한다 — 짧으면 잔여 구간의
                                // 측정값 변화가 무애니 스냅으로 스프링을 덮는다 (감사 확정 #4).
                                dwellUntil = Date().addingTimeInterval(RailLanding.dwell + 0.06)
                                DispatchQueue.main.asyncAfter(deadline: .now() + RailLanding.dwell) {
                                    guard gen == alignGen else { return }   // 이후 전환이 예약 대체
                                    align(proxy, viewportW: vp.size.width, animated: true)
                                }
                            }
                            // 측정값 변화로 인한 즉시 정렬은 dwell 중 차단 — 안 그러면 승격 직후
                            // 칩 폭 변화가 무애니 스냅으로 끝 그림을 선점해 머무름이 죽는다
                            .onChange(of: curMaxX) { _, _ in
                                guard Date() >= dwellUntil else { return }
                                align(proxy, viewportW: vp.size.width, animated: false)
                            }
                            .onChange(of: curMinX) { _, _ in
                                guard Date() >= dwellUntil else { return }
                                align(proxy, viewportW: vp.size.width, animated: false)
                            }
                            // 스페이서가 늘어난 뒤 재정렬 — 늘기 전 align 은 클램프돼 있었다
                            .onChange(of: trailingSpacer) { _, _ in
                                guard Date() >= dwellUntil else { return }
                                align(proxy, viewportW: vp.size.width, animated: false)
                            }
                        }
                    }
                    .frame(height: 92)   // track = padding 12 + 현재카드 50 + padding 30 (그림자 여백)
                }
            }
            // 우측만 페이드 마스크 (§3 — 완료 종목은 왼쪽에 다 보이게, 우측만 "더 있음" 암시)
            .mask(
                HStack(spacing: 0) {
                    Rectangle()
                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: 22)
                }
            )
            // 레일은 상12/하30 비대칭 패딩이라 칩이 92pt 프레임 중심보다 9pt 위에 놓인다.
            // HStack .center 정렬 하에서 + 버튼에 하단 18 패딩을 주면 시각 중심이 9pt 올라가 칩과 정렬
            // (PWA .fp-add margin-bottom:18px 정합). 패딩은 레일보다 낮아 푸터 총 높이 불변.
            AddExerciseButton(action: onAdd).padding(.bottom, 18)
        }
        .padding(.top, 16).padding(.bottom, 6).padding(.horizontal, 12)   // 하단 22→6: 트랙 여백 늘린 만큼 축소(총 높이 유지)
        .overlay(alignment: .top) { Rectangle().fill(GY.lineSoft).frame(height: 1) } // inset 상단 구분선
        .background(GY.shell)
    }
}

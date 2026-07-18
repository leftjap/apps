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
        public let id = UUID(); public let name: String; public let state: RailState
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
    @State private var curMaxX: CGFloat = 0
    @State private var curMinX: CGFloat = 0

    var chipsRow: some View {
        HStack(spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
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
                    case .upcoming: UpcomingChip(name: item.name)
                    }
                }
                .id(i)
                .accessibilityIdentifier("rail-\(item.state.idName)-\(item.name)")
                .onTapGesture { onTapItem(item.blockIdx) }
                .onLongPressGesture(minimumDuration: 0.5) { onLongPressItem(item.blockIdx) }
            }
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
            switch target {
            case .leading: proxy.scrollTo(0, anchor: .leading)
            case .anchored(let idx, let anchorX):
                proxy.scrollTo(idx, anchor: UnitPoint(x: anchorX, y: 0.5))
            }
        }
        if animated { withAnimation(.easeOut(duration: 0.3)) { apply() } } else { apply() }
    }

    public var body: some View {
        let currentIdx = items.firstIndex { $0.state == .current }
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
                            .onAppear { align(proxy, viewportW: vp.size.width, animated: false) }
                            .onChange(of: currentIdx) { _, _ in
                                align(proxy, viewportW: vp.size.width, animated: true)
                            }
                            .onChange(of: curMaxX) { _, _ in
                                align(proxy, viewportW: vp.size.width, animated: false)
                            }
                            .onChange(of: curMinX) { _, _ in
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
            AddExerciseButton(action: onAdd)
        }
        .padding(.top, 16).padding(.bottom, 6).padding(.horizontal, 12)   // 하단 22→6: 트랙 여백 늘린 만큼 축소(총 높이 유지)
        .overlay(alignment: .top) { Rectangle().fill(GY.lineSoft).frame(height: 1) } // inset 상단 구분선
        .background(GY.shell)
    }
}

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

// 완료(done) — 눌린 회색 칩 + 무채색 체크 (§4.2)
struct DoneChip: View {
    let name: String
    var body: some View {
        HStack(spacing: 7) {
            CheckGlyph().stroke(Color(oklch: 0.72, 0.006, 60), style: CheckGlyph.stroke(11))
                .frame(width: 11, height: 11)
            Text(name)
                .font(.sans(14.5, 500))
                .lineLimit(1)
                .foregroundStyle(Color(oklch: 0.62, 0.008, 60))
        }
        .padding(.horizontal, 15)
        .frame(height: 40)
        .background(Color(oklch: 0.965, 0.004, 60), in: RoundedRectangle(cornerRadius: 13))
        // inset 0 1px 3px rgba(20,18,14,.09) — 상단 안쪽 4px 만 어둡게 (blur 3 + y 1)
        .overlay(alignment: .top) {
            LinearGradient(colors: [Color(hex: 0x14120E).opacity(0.09), .clear],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: 4)
                .allowsHitTesting(false)
        }
        .clipShape(RoundedRectangle(cornerRadius: 13))
        .overlay(  // inset 0 0 0 1px oklch(93.5% .005 60) — 눌림 테두리
            RoundedRectangle(cornerRadius: 13).strokeBorder(Color(oklch: 0.935, 0.005, 60), lineWidth: 1))
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

// 현재(current) — 떠오른 흰 카드 + crail 테두리 + 브리드 (§4.1 · §5 fpCurrent 2.4s)
// 피크: 리프트 -5px + scale 1.035 + 테두리 진해짐(oklch 62% .15 47) + crail 글로우(0 0 11px .42) + 그림자 심화.
struct CurrentChip: View {
    let name: String
    @State private var breathe = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Text(name)
            .font(.sans(19, 800))
            .lineLimit(1)
            .foregroundStyle(GY.ink1)
            .tracking(-0.38) // -0.02em @19px
            .padding(.horizontal, 19)
            .frame(height: 50)
            .background(
                LinearGradient(colors: [Color(hex: 0xFFFFFF), Color(hex: 0xFAF9F5)],
                               startPoint: .top, endPoint: .bottom),
                in: RoundedRectangle(cornerRadius: 15))
            .overlay(alignment: .top) {  // 상단 하이라이트 오버레이 (fp-chip__hl — radius 15 15 0 0)
                UnevenRoundedRectangle(cornerRadii: .init(topLeading: 15, topTrailing: 15))
                    .fill(LinearGradient(colors: [.white.opacity(0.7), .clear], startPoint: .top, endPoint: .bottom))
                    .frame(height: 25)
                    .allowsHitTesting(false)
            }
            .overlay(  // crail 테두리 링 — 피크에 진해짐 (fpCurrent)
                RoundedRectangle(cornerRadius: 15)
                    .strokeBorder(breathe ? Color(oklch: 0.62, 0.15, 47) : GY.crailBase, lineWidth: 1.5))
            // 드롭 섀도 — CSS 는 음수 spread(-6/-12)로 그림자 도형을 줄인다. SwiftUI 엔 spread 가 없으므로
            // 안쪽으로 줄인 불투명 사각형이 그림자를 던지게 하고, 칩 본체가 그 위를 덮는다.
            .background {
                ZStack {
                    RoundedRectangle(cornerRadius: 9).fill(Color.black)
                        .padding(6)     // spread -6px
                        .shadow(color: Color(hex: 0x14120E).opacity(breathe ? 0.34 : 0.30),
                                radius: breathe ? 10 : 6, y: breathe ? 11 : 5)
                    RoundedRectangle(cornerRadius: 3).fill(Color.black)
                        .padding(12)    // spread -12px
                        .shadow(color: Color(hex: 0x14120E).opacity(breathe ? 0.36 : 0.32),
                                radius: breathe ? 18 : 12, y: breathe ? 22 : 14)
                }
                .allowsHitTesting(false)   // 안쪽으로 줄인 도형이라 칩의 불투명 배경에 완전히 가려진다
            }
            // compositingGroup — 칩(배경+테두리+하이라이트)을 불투명 레이어로 평탄화한 뒤 그림자를 던진다.
            // 이게 없으면 crail 글로우가 반투명 합성을 통해 칩 내부로 번져 흰 바탕이 탁해진다
            // (시안 box-shadow 는 요소 배경 안에 절대 안 그려짐).
            .compositingGroup()
            .shadow(color: GY.crailBase.opacity(breathe ? 0.42 : 0), radius: 5.5)   // 피크 crail 글로우
            .scaleEffect(breathe ? 1.035 : 1)
            .offset(y: breathe ? -5 : -3)
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) { breathe = true }
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

    // 현재 칩의 우측 끝(콘텐츠 좌표) — 뷰포트 안에 다 들어오면 스크롤하지 않는다.
    struct CurChipMaxXKey: PreferenceKey {
        static let defaultValue: CGFloat = 0
        static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
            let n = nextValue(); if n > 0 { value = n }
        }
    }
    @State private var curMaxX: CGFloat = 0

    var chipsRow: some View {
        HStack(spacing: 10) {
            ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                Group {
                    switch item.state {
                    case .done: DoneChip(name: item.name)
                    case .current:
                        CurrentChip(name: item.name)
                            .background(GeometryReader { g in
                                Color.clear.preference(key: CurChipMaxXKey.self,
                                                       value: g.frame(in: .named("railContent")).maxX)
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

    // 현재 카드가 뷰포트 안에 온전히 들어오면 좌측 정렬 유지, 아니면 중앙 정렬.
    // 전 종목 완료(current 없음)면 선두로 되돌려 완료 칩이 좌측에 잘리지 않게 한다.
    func align(_ proxy: ScrollViewProxy, viewportW: CGFloat, animated: Bool) {
        guard let target = GymSessionLogic.railScrollTarget(
            states: items.map(\.state.core),
            currentChipMaxX: Double(curMaxX), viewportWidth: Double(viewportW)) else { return }
        let apply = {
            switch target {
            case .leading: proxy.scrollTo(0, anchor: .leading)
            case .center(let idx): proxy.scrollTo(idx, anchor: .center)
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
                    // 실앱 — 가로 스크롤. 현재 카드가 이미 전부 보이면 스크롤하지 않고(= scrollLeft 0,
                    // 완료 칩이 왼쪽에 다 보임 · §7 수용기준 · 시안 #15a/#14a 렌더 · PWA .fp-rail 정합),
                    // 뷰포트를 벗어날 때만 트랙 중앙으로 정렬한다 (§3).
                    GeometryReader { vp in
                        ScrollViewReader { proxy in
                            ScrollView(.horizontal, showsIndicators: false) {
                                chipsRow.coordinateSpace(name: "railContent")
                            }
                            .onPreferenceChange(CurChipMaxXKey.self) { curMaxX = $0 }
                            .onAppear { align(proxy, viewportW: vp.size.width, animated: false) }
                            .onChange(of: currentIdx) { _, _ in
                                align(proxy, viewportW: vp.size.width, animated: true)
                            }
                            .onChange(of: curMaxX) { _, _ in
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

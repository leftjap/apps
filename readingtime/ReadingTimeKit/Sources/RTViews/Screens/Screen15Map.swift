import SwiftUI

// 15 기록 · 지도 — 정본: 작업지시서 §5 + mockups/RTRecord.dc.html.
// 지형(대륙 타원)은 목업과 동일한 플레이스홀더. 투영·팬/줌·클러스터 규칙은 엔진(RTRecord)에 있고
// 이 화면은 렌더만 한다. 지도 SDK 로 교체 시 RTMapWorld 만 갈아끼우면 된다(§0·§16).

// ── 스킨 (§11) — mapStyle 기본 'paper' (확정) ──
public struct RTMapSkin {
    public let land: Color
    public let landStroke: Color
    public let grat: Color
    public let label: Color
    public let labelBg: Color
    public let pinFrame: Color
    public let pinFrameLine: Color
    public let chipBg: Color
    public let chipBorder: Color
    public let chipIcon: Color
    public let chipText: Color
    public let ctrlBg: Color
    public let ctrlBorder: Color
    public let ctrlIcon: Color
    public let pinShadow: Color

    public static let paper = RTMapSkin(
        land: Color(hex: 0xDCCFB4),
        landStroke: Color(hex: 0x786948, alpha: 0.22),
        grat: Color(hex: 0x786948, alpha: 0.08),
        label: Color(hex: 0x6F6752),
        labelBg: Color(hex: 0xFFFFFF, alpha: 0.72),
        pinFrame: Color(hex: 0xFDFBF4),
        pinFrameLine: Color(hex: 0x786948, alpha: 0.16),
        chipBg: Color(hex: 0xFFFFFF, alpha: 0.86),
        chipBorder: Color(hex: 0xE5DFCD),
        chipIcon: Color(hex: 0x3A5C4B),
        chipText: Color(hex: 0x6F6752),
        ctrlBg: Color(hex: 0xFFFFFF, alpha: 0.92),
        ctrlBorder: Color(hex: 0xE5DFCD),
        ctrlIcon: Color(hex: 0x6F6752),
        pinShadow: Color(hex: 0x281E0F, alpha: 0.5))   // 0 9px 16px -7px rgba(40,30,15,.5)
}

public struct Screen15Map: View {
    var model: RTAppModel?
    private let skin = RTMapSkin.paper

    static let viewportH: CGFloat = 844 - 98   // 지도 전면 (top:98)

    public init(model: RTAppModel? = nil) { self.model = model }

    private var scale: Double { model?.mapScale ?? RTRecord.defaultView.scale }
    private var tx: Double { model?.mapTx ?? RTRecord.defaultView.tx }
    private var ty: Double { model?.mapTy ?? RTRecord.defaultView.ty }
    /// 위치 기록이 있으면 실데이터, 없으면 시안 데모(§12)
    private var rd: (places: [RTRecPlace], books: [RTRecBook]) {
        model?.recordData ?? (RTRecordDemo.places, RTRecordDemo.books)
    }
    private var markers: [RTRecord.Marker] {
        let d = rd
        return RTRecord.markers(scale: scale, tx: tx, ty: ty, places: d.places, books: d.books)
    }
    /// §5.5 통계 칩 — 데모는 시안 상수, 실데이터는 집계(도시 수).
    /// (목업의 "5개 대륙" 은 데이터에서 파생되지 않는 표시 상수 — 대륙 판정 규칙이 스펙에 없어
    ///  실데이터에선 도시 수만 집계한다)
    private var chipText: String {
        let places = rd.places
        let isDemo = places.count == RTRecordDemo.places.count
            && places.first?.id == RTRecordDemo.places.first?.id
        return isDemo ? RTRecordDemo.mapChip : "\(places.count)개 도시"
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            mapArea
                .frame(width: 390, height: Self.viewportH)
                .clipped()
                .padding(.top, 98)
            StatsHeader(active: .map, model: model)
        }
        .frame(width: 390, height: 844)
    }

    var mapArea: some View {
        RTMapOcean()
            .frame(width: 390, height: Self.viewportH)
            // 월드 레이어 — CSS transform: translate(tx,ty) scale(s), origin 0 0
            .overlay(alignment: .topLeading) {
                RTMapWorld(skin: skin)
                    .frame(width: 1000, height: 500)
                    .scaleEffect(scale, anchor: .topLeading)
                    .offset(x: tx, y: ty)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .topLeading) {
                ForEach(markers) { m in
                    RTMapPin(m: m, skin: skin)
                        .position(x: m.left, y: m.top - (m.hpx + 13) / 2)   // 꼬리 끝(하단)이 좌표 앵커
                        .zIndex(m.z)
                        .onTapGesture { model?.tapMarker(m) }
                }
                .frame(width: 390, height: Self.viewportH, alignment: .topLeading)
            }
            .contentShape(Rectangle())
            .gesture(pan)
            .overlay(alignment: .topLeading) { chip }
            .overlay(alignment: .bottomTrailing) { zoomControls }
    }

    // §5.2 팬 — 이동량 5px 초과 시 _moved (탭 오인 방지), pointerup 60ms 뒤 해제
    var pan: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                guard let m = model else { return }
                if abs(v.translation.width) > 5 || abs(v.translation.height) > 5 { m.mapMoved = true }
                if m.mapMoved {
                    if panStart == nil { panStart = (m.mapTx, m.mapTy) }
                    m.mapPan(tx: (panStart?.0 ?? m.mapTx) + v.translation.width,
                             ty: (panStart?.1 ?? m.mapTy) + v.translation.height)
                }
            }
            .onEnded { _ in
                guard let m = model else { return }
                panStart = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) { m.mapMoved = false }
            }
    }
    @State private var panStart: (Double, Double)?

    // §5.5 통계 칩
    var chip: some View {
        HStack(spacing: 8) {
            RTPinIcon(size: 13, color: skin.chipIcon)
            Text(chipText).font(.mono(11, 600)).foregroundColor(skin.chipText).rtLB(RTLB.m11)
        }
        .padding(EdgeInsets(top: 8, leading: 13, bottom: 8, trailing: 13))   // border 1 포함
        .background(Capsule().fill(skin.chipBg))
        .overlay(Capsule().strokeBorder(skin.chipBorder, lineWidth: 1))   // CSS border = 박스 안쪽
        .rtBoxShadow(Capsule(), color: Color.black.opacity(0.3), blur: 12, y: 4, spread: -6)
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 0, trailing: 0))
        .allowsHitTesting(false)
    }

    // §5.5 줌 컨트롤
    var zoomControls: some View {
        VStack(spacing: 8) {
            ctrlBtn { RTIcon(RTMapIcon.plus, size: 17, stroke: skin.ctrlIcon, lineWidth: 2.4, join: .miter) }
                .onTapGesture { model?.mapZoom(1.6) }
            ctrlBtn { RTIcon(RTMapIcon.minus, size: 17, stroke: skin.ctrlIcon, lineWidth: 2.4, join: .miter) }
                .onTapGesture { model?.mapZoom(1 / 1.6) }
            ctrlBtn { RTResetIcon(size: 16, color: skin.ctrlIcon) }
                .onTapGesture { model?.mapReset() }
        }
        .padding(EdgeInsets(top: 0, leading: 0, bottom: 24, trailing: 14))
    }

    func ctrlBtn<C: View>(@ViewBuilder _ icon: () -> C) -> some View {
        RoundedRectangle(cornerRadius: 12).fill(skin.ctrlBg)
            .frame(width: 38, height: 38)
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(skin.ctrlBorder, lineWidth: 1))
            .overlay(icon())
            .rtBoxShadow(RoundedRectangle(cornerRadius: 12), color: Color.black.opacity(0.4),
                         blur: 14, y: 6, spread: -6)
            .contentShape(RoundedRectangle(cornerRadius: 12))
    }
}

// ── 바다 배경 (§11 paper) ──
// CSS radial-gradient(130% 100% at 28% 18%, #eef1ee 0%, #e5eae8 52%, #dce2df 100%)
// SwiftUI 는 축별 반지름이 다른 타원 그라데이션이 없어, 원형 그라데를 축별로 스케일해 재현.
struct RTMapOcean: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let r: CGFloat = 500
            ZStack {
                Color(hex: 0xDCE2DF)   // 100% 스톱 — 그라데 바깥 영역
                Rectangle()
                    .fill(RadialGradient(
                        stops: [.init(color: Color(hex: 0xEEF1EE), location: 0),
                                .init(color: Color(hex: 0xE5EAE8), location: 0.52),
                                .init(color: Color(hex: 0xDCE2DF), location: 1)],
                        center: .center, startRadius: 0, endRadius: r))
                    .frame(width: r * 2, height: r * 2)
                    .scaleEffect(x: (1.3 * w) / r, y: (1.0 * h) / r)
                    .position(x: 0.28 * w, y: 0.18 * h)
            }
        }
    }
}

// ── 월드 레이어 (1000×500 등장방형) — 그래티큘 + 대륙 플레이스홀더 ──
// ⚠ 지형은 목업과 동일한 손그림 타원(§0 "플레이스홀더"). 지도 SDK 도입 시 이 뷰만 교체.
struct RTMapWorld: View {
    let skin: RTMapSkin

    // <ellipse cx cy rx ry>
    static let land: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
        (250, 112, 112, 46), (232, 152, 92, 66), (300, 180, 40, 30),
        (430, 66, 34, 26),
        (332, 300, 54, 96), (352, 250, 40, 40),
        (516, 118, 54, 40),
        (548, 252, 70, 102), (560, 205, 52, 46),
        (732, 132, 162, 72), (700, 200, 70, 52), (792, 228, 34, 30),
        (876, 320, 58, 40),
    ]
    static let hLines: [CGFloat] = [83, 167, 250, 333, 417]
    static let vLines: [CGFloat] = [125, 250, 375, 500, 625, 750, 875]

    var body: some View {
        Canvas { ctx, _ in
            // 그래티큘 (stroke-width 1, 월드 좌표 — 레이어와 함께 스케일)
            var grid = Path()
            for y in Self.hLines { grid.move(to: CGPoint(x: 0, y: y)); grid.addLine(to: CGPoint(x: 1000, y: y)) }
            for x in Self.vLines { grid.move(to: CGPoint(x: x, y: 0)); grid.addLine(to: CGPoint(x: x, y: 500)) }
            ctx.stroke(grid, with: .color(skin.grat), lineWidth: 1)

            // 대륙 (fill + stroke 1.5)
            for e in Self.land {
                let p = Path(ellipseIn: CGRect(x: e.0 - e.2, y: e.1 - e.3, width: e.2 * 2, height: e.3 * 2))
                ctx.fill(p, with: .color(skin.land))
                ctx.stroke(p, with: .color(skin.landStroke), lineWidth: 1.5)
            }
        }
        .frame(width: 1000, height: 500)
    }
}

// ── 마커(핀) (§5.4) ──
struct RTMapPin: View {
    let m: RTRecord.Marker
    let skin: RTMapSkin

    var coverSize: CGSize { CGSize(width: m.w, height: m.hpx) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                // 스택(겹친 표지) — 뒤에 2·3번째 책이 회전·오프셋된 폴라로이드로
                if m.hasStack, let s1 = m.s1 {
                    stackCard(s1).rotationEffect(.degrees(7)).offset(x: 5, y: 3)
                }
                if m.hasS2, let s2 = m.s2 {
                    stackCard(s2).rotationEffect(.degrees(-7)).offset(x: -5, y: 4)
                }
                frameCard
            }
            .overlay(alignment: .topTrailing) {
                if m.showBadge { badge.offset(x: 8, y: -8) }
            }
            tail.padding(.top, -1)
        }
        // 바닥 그림자 — 앵커(꼬리 끝) 중심의 타원
        .background(alignment: .bottom) {
            Ellipse().fill(Color(hex: 0x1E160C, alpha: 0.22))
                .frame(width: m.shadowW, height: 6)
                .blur(radius: 1.5)
                .offset(y: 3)
        }
        // 라벨 — 버튼 아래 3px
        .overlay(alignment: .bottom) {
            Text(m.label)
                .font(.mono(9.5, 600)).tracking(9.5 * -0.01)
                .foregroundColor(skin.label)
                .fixedSize()
                .padding(EdgeInsets(top: 1, leading: 5, bottom: 1, trailing: 5))
                .background(RoundedRectangle(cornerRadius: 5).fill(skin.labelBg))
                .alignmentGuide(.bottom) { _ in -3 }
        }
        .rtPinDrop()
    }

    func stackCard(_ fill: RTFill) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(fill.paint(coverSize))
            .frame(width: m.w, height: m.hpx)
            .padding(3)
            .background(RoundedRectangle(cornerRadius: 7).fill(skin.pinFrame))
            .rtBoxShadow(RoundedRectangle(cornerRadius: 7), color: skin.pinShadow,
                         blur: 16, y: 9, spread: -7)
    }

    var frameCard: some View {
        RTFillCover(fill: m.coverFill, tc: m.coverTC, title: m.coverTitle,
                    size: coverSize, radius: 4, spine: 2, spineAlpha: 0.18,
                    fontSize: 8, lineHeight: 8.4, pad: 2)
            .padding(3)
            .background(RoundedRectangle(cornerRadius: 7).fill(skin.pinFrame))
            .rtRing(7, skin.pinFrameLine, width: 1)   // CSS `outline` = 박스 바깥
            .rtBoxShadow(RoundedRectangle(cornerRadius: 7), color: skin.pinShadow,
                         blur: 16, y: 9, spread: -7)
    }

    var badge: some View {
        Text("\(m.count)")
            .font(.mono(10.5, 700))
            .foregroundColor(.white)
            .padding(.horizontal, 5)
            .frame(minWidth: 20, minHeight: 20)
            .background(Capsule().fill(RT.terra))
            .overlay(Capsule().stroke(skin.pinFrame, lineWidth: 2))
            .rtBoxShadow(Capsule(), color: Color.black.opacity(0.42), blur: 7, y: 3, spread: -1)
    }

    // 꼬리 — border-left/right 7 transparent + border-top 8 solid
    var tail: some View {
        Path { p in
            p.move(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: 14, y: 0))
            p.addLine(to: CGPoint(x: 7, y: 8))
            p.closeSubpath()
        }
        .fill(skin.pinFrame)
        .frame(width: 14, height: 8)
        .shadow(color: Color(hex: 0x1E160C, alpha: 0.22), radius: 0.75, x: 0, y: 2)
    }
}

// rtPinDrop — translate(-50%,-118%)scale.4 → (-50%,-100%)scale1, .4s cubic-bezier(.2,1.2,.4,1)
// (좌표 앵커는 .position 이 잡으므로 여기선 -18% 상대 이동 + 스케일만)
extension View {
    func rtPinDrop() -> some View { modifier(RTPinDrop()) }
}
struct RTPinDrop: ViewModifier {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduce
    @State private var shown = false

    func body(content: Content) -> some View {
        let active = enabled && !reduce
        content
            .scaleEffect(active && !shown ? 0.4 : 1, anchor: .bottom)
            .opacity(active && !shown ? 0 : 1)
            .offset(y: active && !shown ? -18 : 0)
            .onAppear {
                guard active else { return }
                withAnimation(.timingCurve(0.2, 1.2, 0.4, 1, duration: 0.4)) { shown = true }
            }
    }
}

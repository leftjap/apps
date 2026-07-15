import SwiftUI
import MapKit

// 15 기록 · 지도 — 정본: 작업지시서 §5.
// §0·§5.1·§14: 지형은 **실제 지도 SDK(MapKit)** 로 그리고, 그 위에 이 문서가 정의하는
// 핀 / 클러스터 / 배지 / 시트 / 책 상세 레이어를 얹는다. 투영·팬·줌은 MapKit이 담당하고,
// UI·상호작용 규칙(52px 체인 클러스터, 탭 분기)은 동일하게 유지한다.
//
// 헤드리스(rtshot)는 MapKit 타일을 렌더하지 못하므로, 픽셀 오라클 검증용으로만 목업의
// 손그림 플레이스홀더(등장방형 월드)를 쓴다 — 실기기·데모 셸(rtapp)은 항상 MapKit.

// ── 스킨 (핀 프레임 색 — MapKit 위/플레이스홀더 위 공용) ──
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
    @Environment(\.rtHeadless) private var headless
    var model: RTAppModel?
    private let skin = RTMapSkin.paper

    static let viewportH: CGFloat = 844 - 98   // 지도 전면 (top:98)
    static let mapSize = CGSize(width: 390, height: viewportH)

    @State private var camera: MapCameraPosition = .automatic
    @State private var visibleRect: MKMapRect?
    @State private var region: MKCoordinateRegion?

    public init(model: RTAppModel? = nil) { self.model = model }

    private var rd: (places: [RTRecPlace], books: [RTRecBook]) {
        model?.recordData ?? (RTRecordDemo.places, RTRecordDemo.books)
    }

    /// §5.5 통계 칩 — 실데이터는 "N곳" 집계(0곳 = 숨김), 데모는 시안 상수 (모델 정본)
    private var chipText: String? {
        model?.mapChipText ?? RTRecordDemo.mapChip
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            Group {
                if headless { headlessMap } else { realMap }
            }
            .frame(width: 390, height: Self.viewportH)
            .clipped()
            .padding(.top, 98)
            .overlay(alignment: .topLeading) { chip.padding(.top, 98) }
            .overlay(alignment: .bottomTrailing) { zoomControls }
            StatsHeader(active: .map, model: model)
        }
        .frame(width: 390, height: 844)
    }

    // ── 실기기 · 데모 셸: MapKit ──
    var realMap: some View {
        Map(position: $camera, interactionModes: [.pan, .zoom]) {
            ForEach(realClusters) { m in
                Annotation("", coordinate: CLLocationCoordinate2D(latitude: m.centroidLat,
                                                                  longitude: m.centroidLng),
                           anchor: .bottom) {
                    RTMapPin(m: m, skin: skin)
                        .onTapGesture { tap(m) }
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .onMapCameraChange(frequency: .continuous) { ctx in
            visibleRect = ctx.rect
            region = ctx.region
        }
        .onAppear { if region == nil { camera = .region(defaultRegion()) } }
    }

    /// MapKit 카메라(MKMapPoint 투영) 기준 화면좌표로 52px 체인 클러스터.
    private var realClusters: [RTRecord.Marker] {
        guard let rect = visibleRect, rect.size.width > 0 else { return [] }
        let sz = Self.mapSize
        return RTRecord.clusters({ p in
            let mp = MKMapPoint(CLLocationCoordinate2D(latitude: p.lat, longitude: p.lng))
            return CGPoint(x: (mp.x - rect.origin.x) / rect.size.width * sz.width,
                           y: (mp.y - rect.origin.y) / rect.size.height * sz.height)
        }, places: rd.places, books: rd.books)
    }

    // §5.6 탭 — 클러스터면 줌 투 핏(카메라), 단일이면 openTarget(모델)
    private func tap(_ m: RTRecord.Marker) {
        if m.isCluster { fitMembers(m.members) } else { model?.tapMarker(m) }
    }

    private func fitMembers(_ ids: [String]) {
        let coords = ids.compactMap { id in rd.places.first { $0.id == id } }
            .map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
        guard !coords.isEmpty else { return }
        withAnimation(.easeInOut(duration: 0.5)) { camera = .region(fitRegion(coords, pad: 2.4, min: 0.03)) }
    }

    /// 기본 카메라 — 가장 최근 위치 세션의 동네(~1.3km) 프레이밍 (사용자 결정 2026-07-15:
    /// "기본값은 동네 지도" — 동에서 시작해 구→시→세계로 확장). 없으면 전체 뷰(데모).
    private func defaultRegion() -> MKCoordinateRegion {
        guard let c = model?.latestReadCoord else { return allRegion() }
        return MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: c.lat, longitude: c.lng),
                                  latitudinalMeters: 1300, longitudinalMeters: 1300)
    }

    private func allRegion() -> MKCoordinateRegion {
        let coords = rd.places.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
        guard !coords.isEmpty else { return MKCoordinateRegion(.world) }
        return fitRegion(coords, pad: 1.5, min: 8, maxLat: 140, maxLng: 320)
    }

    private func fitRegion(_ coords: [CLLocationCoordinate2D], pad: Double, min minSpan: Double,
                           maxLat: Double = 160, maxLng: Double = 340) -> MKCoordinateRegion {
        let lats = coords.map(\.latitude), lngs = coords.map(\.longitude)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2,
                                            longitude: (lngs.min()! + lngs.max()!) / 2)
        let span = MKCoordinateSpan(
            latitudeDelta: Swift.min(maxLat, Swift.max(minSpan, (lats.max()! - lats.min()!) * pad)),
            longitudeDelta: Swift.min(maxLng, Swift.max(minSpan, (lngs.max()! - lngs.min()!) * pad)))
        return MKCoordinateRegion(center: center, span: span)
    }

    private func zoom(_ factor: Double) {
        guard let r = region else { return }
        let span = MKCoordinateSpan(
            latitudeDelta: Swift.min(160, Swift.max(0.002, r.span.latitudeDelta * factor)),
            longitudeDelta: Swift.min(340, Swift.max(0.002, r.span.longitudeDelta * factor)))
        withAnimation(.easeInOut(duration: 0.3)) { camera = .region(MKCoordinateRegion(center: r.center, span: span)) }
    }

    // ── 헤드리스(rtshot 픽셀 오라클): 목업 플레이스홀더 등장방형 월드 ──
    var headlessMap: some View {
        let v = RTRecord.defaultView
        let markers = RTRecord.markers(scale: v.scale, tx: v.tx, ty: v.ty,
                                       places: rd.places, books: rd.books)
        return RTMapOcean()
            .frame(width: 390, height: Self.viewportH)
            .overlay(alignment: .topLeading) {
                RTMapWorld(skin: skin)
                    .frame(width: 1000, height: 500)
                    .scaleEffect(v.scale, anchor: .topLeading)
                    .offset(x: v.tx, y: v.ty)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .topLeading) {
                ForEach(markers) { m in
                    RTMapPin(m: m, skin: skin)
                        .position(x: m.left, y: m.top - (m.hpx + 13) / 2)
                        .zIndex(m.z)
                }
                .frame(width: 390, height: Self.viewportH, alignment: .topLeading)
            }
    }

    // §5.5 통계 칩 (0곳 = 숨김)
    @ViewBuilder var chip: some View {
        if let chipText {
            chipBody(chipText)
        }
    }
    func chipBody(_ text: String) -> some View {
        HStack(spacing: 8) {
            RTPinIcon(size: 13, color: skin.chipIcon)
            Text(text).font(.mono(11, 600)).foregroundColor(skin.chipText).rtLB(RTLB.m11)
        }
        .padding(EdgeInsets(top: 8, leading: 13, bottom: 8, trailing: 13))
        .background(Capsule().fill(skin.chipBg))
        .overlay(Capsule().strokeBorder(skin.chipBorder, lineWidth: 1))
        .rtBoxShadow(Capsule(), color: Color.black.opacity(0.3), blur: 12, y: 4, spread: -6)
        .padding(EdgeInsets(top: 12, leading: 14, bottom: 0, trailing: 0))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // §5.5 줌 컨트롤
    var zoomControls: some View {
        VStack(spacing: 8) {
            ctrlBtn { RTIcon(RTMapIcon.plus, size: 17, stroke: skin.ctrlIcon, lineWidth: 2.4, join: .miter) }
                .onTapGesture { zoom(1 / 1.6) }
            ctrlBtn { RTIcon(RTMapIcon.minus, size: 17, stroke: skin.ctrlIcon, lineWidth: 2.4, join: .miter) }
                .onTapGesture { zoom(1.6) }
            ctrlBtn { RTResetIcon(size: 16, color: skin.ctrlIcon) }
                .onTapGesture { withAnimation(.easeInOut(duration: 0.4)) { camera = .region(defaultRegion()) } }
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

// ── 바다 배경 (헤드리스 플레이스홀더, §11 paper) ──
struct RTMapOcean: View {
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let r: CGFloat = 500
            ZStack {
                Color(hex: 0xDCE2DF)
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

// ── 월드 레이어 (헤드리스 플레이스홀더 — 실기기는 MapKit) ──
struct RTMapWorld: View {
    let skin: RTMapSkin
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
            var grid = Path()
            for y in Self.hLines { grid.move(to: CGPoint(x: 0, y: y)); grid.addLine(to: CGPoint(x: 1000, y: y)) }
            for x in Self.vLines { grid.move(to: CGPoint(x: x, y: 0)); grid.addLine(to: CGPoint(x: x, y: 500)) }
            ctx.stroke(grid, with: .color(skin.grat), lineWidth: 1)
            for e in Self.land {
                let p = Path(ellipseIn: CGRect(x: e.0 - e.2, y: e.1 - e.3, width: e.2 * 2, height: e.3 * 2))
                ctx.fill(p, with: .color(skin.land))
                ctx.stroke(p, with: .color(skin.landStroke), lineWidth: 1.5)
            }
        }
        .frame(width: 1000, height: 500)
    }
}

// ── 마커(핀) (§5.4) — MapKit 위/플레이스홀더 위 공용 ──
struct RTMapPin: View {
    let m: RTRecord.Marker
    let skin: RTMapSkin

    var coverSize: CGSize { CGSize(width: m.w, height: m.hpx) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                if m.hasStack, let s1 = m.s1 {
                    stackCard(s1, m.s1Url).rotationEffect(.degrees(7)).offset(x: 5, y: 3)
                }
                if m.hasS2, let s2 = m.s2 {
                    stackCard(s2, m.s2Url).rotationEffect(.degrees(-7)).offset(x: -5, y: 4)
                }
                frameCard
            }
            .overlay(alignment: .topTrailing) {
                if m.showBadge { badge.offset(x: 8, y: -8) }
            }
            tail.padding(.top, -1)
        }
        .background(alignment: .bottom) {
            Ellipse().fill(Color(hex: 0x1E160C, alpha: 0.22))
                .frame(width: m.shadowW, height: 6)
                .blur(radius: 1.5)
                .offset(y: 3)
        }
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

    func stackCard(_ fill: RTFill, _ url: String?) -> some View {
        Group {
            if let url {                     // §14 실표지 (실데이터)
                RTRemoteCover(url: url, size: CGSize(width: m.w, height: m.hpx), radius: 4)
            } else {
                RoundedRectangle(cornerRadius: 4)
                    .fill(fill.paint(coverSize))
                    .frame(width: m.w, height: m.hpx)
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 7).fill(skin.pinFrame))
        .rtBoxShadow(RoundedRectangle(cornerRadius: 7), color: skin.pinShadow, blur: 16, y: 9, spread: -7)
    }

    var frameCard: some View {
        Group {
            if m.coverUrl.isEmpty {          // 데모 — 색+제목 플레이스홀더 (픽셀 오라클 불변)
                RTFillCover(fill: m.coverFill, tc: m.coverTC, title: m.coverTitle,
                            size: coverSize, radius: 4, spine: 2, spineAlpha: 0.18,
                            fontSize: 8, lineHeight: 8.4, pad: 2)
            } else {                         // §14 실표지 (실데이터)
                RTRemoteCover(url: m.coverUrl, size: coverSize, radius: 4, title: m.coverTitle)
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 7).fill(skin.pinFrame))
        .rtRing(7, skin.pinFrameLine, width: 1)   // CSS `outline` = 박스 바깥
        .rtBoxShadow(RoundedRectangle(cornerRadius: 7), color: skin.pinShadow, blur: 16, y: 9, spread: -7)
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

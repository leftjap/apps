import SwiftUI
import MapKit

// 독서 지도 전체 화면 — 정본: README §5. 원페이지 지도 카드 탭 → 이 뷰(fullScreenCover 대신 루트 오버레이).
// 지형은 MapKit(실기기), 헤드리스(rtshot)는 목업 플레이스홀더(등장방형 월드) — 픽셀 오라클 전용.
// 핀·클러스터·칩·컨트롤 규칙은 엔진(RTStats.clusters / fitAll / chipText)이 정한다.

// ── 스킨 (핀 프레임·칩·컨트롤 색 — MapKit 위/플레이스홀더 위 공용) ──
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
        grat: Color(hex: 0x786948, alpha: 0.09),
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

public struct RTMapFullscreen: View {
    @Environment(\.rtHeadless) private var headless
    var model: RTAppModel?
    private let ds: RTStatsDataset
    private let skin = RTMapSkin.paper
    static let size = CGSize(width: 390, height: 844)

    @State private var camera: MapCameraPosition = .automatic
    @State private var visibleRect: MKMapRect?
    @State private var region: MKCoordinateRegion?

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.ds = model?.statsDataset ?? RTStatsDemo.dataset
    }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            Group {
                if headless { headlessMap } else { realMap }
            }
            .frame(width: Self.size.width, height: Self.size.height)
            .clipped()
            chip.padding(EdgeInsets(top: 58, leading: 14, bottom: 0, trailing: 0))
        }
        .frame(width: Self.size.width, height: Self.size.height)
        .overlay(alignment: .topTrailing) {
            Button { model?.closeMapFullscreen() } label: {
                ctrlBtn { RTIcon(RTMapIcon.close, size: 15, stroke: skin.ctrlIcon, lineWidth: 2.4) }
            }
            .buttonStyle(.plain)
            .padding(EdgeInsets(top: 54, leading: 0, bottom: 0, trailing: 14))
            .accessibilityLabel("지도 닫기")
            .accessibilityIdentifier("stats.mapClose")
        }
        .overlay(alignment: .bottomTrailing) { controls }
        // 컨테이너 식별자는 자식 버튼 식별자를 덮어쓴다 — 전체 화면 존재 판정은 stats.mapClose 로
    }

    // ── 실기기 · 데모 셸: MapKit ──
    var realMap: some View {
        Map(position: $camera, interactionModes: [.pan, .zoom]) {
            ForEach(realPins) { m in
                let p = ds.places[m.anchor]
                Annotation("", coordinate: CLLocationCoordinate2D(latitude: p.lat, longitude: p.lng),
                           anchor: .bottom) {
                    RTMapPin(ds: ds, m: m)
                        .onTapGesture { tap(m) }
                        // MapKit 이 지명 라벨("성수동")도 접근성 요소로 내놓아 텍스트 조회가 겹친다 → 핀은 장소 id 로
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(m.label)
                        .accessibilityIdentifier("stats.pin.\(p.id)")
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, emphasis: .muted, pointsOfInterest: .excludingAll))   // muted: 종이 톤과 맞춤 (탐침 2026-09-02)
        .onMapCameraChange(frequency: .continuous) { ctx in
            visibleRect = ctx.rect
            region = ctx.region
        }
        .onAppear { if region == nil { camera = .region(Self.fitAllRegion(ds)) } }
    }

    /// MapKit 카메라(MKMapPoint 투영) 기준 화면좌표로 52px 체인 클러스터
    private var realPins: [RTStats.Pin] {
        guard let rect = visibleRect, rect.size.width > 0 else { return [] }
        return RTStats.clusters(ds) { p in
            let mp = MKMapPoint(CLLocationCoordinate2D(latitude: p.lat, longitude: p.lng))
            return CGPoint(x: (mp.x - rect.origin.x) / rect.size.width * Self.size.width,
                           y: (mp.y - rect.origin.y) / rect.size.height * Self.size.height)
        }
    }

    // 핀 탭 — 클러스터 = 줌투핏, 단일 = place 시트
    private func tap(_ m: RTStats.Pin) {
        if m.isCluster {
            let coords = m.members.map { CLLocationCoordinate2D(latitude: ds.places[$0].lat, longitude: ds.places[$0].lng) }
            withAnimation(.easeInOut(duration: 0.5)) { camera = .region(Self.fitRegion(coords, pad: 2.4, min: 0.03)) }
        } else {
            model?.statsTapPlace(ds.places[m.anchor].id)
        }
    }

    /// 기본 카메라 = 모든 핀 프레이밍 — 핀 범위를 폭 300·높이 520 안에(중심 195,422 = 화면 중심).
    /// 핀 1곳이면 그 곳 ~1.3km. 기록 없으면 세계.
    static func fitAllRegion(_ ds: RTStatsDataset) -> MKCoordinateRegion {
        let coords = RTStats.placeAggs(ds).map { ds.places[$0.place] }
            .map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lng) }
        guard let first = coords.first else { return MKCoordinateRegion(.world) }
        if coords.count == 1 {
            return MKCoordinateRegion(center: first, latitudinalMeters: 1300, longitudinalMeters: 1300)
        }
        return fitRegion(coords, padLat: 844.0 / 520.0, padLng: 390.0 / 300.0, min: 0.03)
    }

    static func fitRegion(_ coords: [CLLocationCoordinate2D], pad: Double, min minSpan: Double) -> MKCoordinateRegion {
        fitRegion(coords, padLat: pad, padLng: pad, min: minSpan)
    }
    static func fitRegion(_ coords: [CLLocationCoordinate2D], padLat: Double, padLng: Double,
                          min minSpan: Double) -> MKCoordinateRegion {
        let lats = coords.map(\.latitude), lngs = coords.map(\.longitude)
        let center = CLLocationCoordinate2D(latitude: (lats.min()! + lats.max()!) / 2,
                                            longitude: (lngs.min()! + lngs.max()!) / 2)
        let span = MKCoordinateSpan(
            latitudeDelta: Swift.min(160, Swift.max(minSpan, (lats.max()! - lats.min()!) * padLat)),
            longitudeDelta: Swift.min(340, Swift.max(minSpan, (lngs.max()! - lngs.min()!) * padLng)))
        return MKCoordinateRegion(center: center, span: span)
    }

    private func zoom(_ factor: Double) {
        guard let r = region else { return }
        let span = MKCoordinateSpan(
            latitudeDelta: Swift.min(160, Swift.max(0.002, r.span.latitudeDelta * factor)),
            longitudeDelta: Swift.min(340, Swift.max(0.002, r.span.longitudeDelta * factor)))
        withAnimation(.easeInOut(duration: 0.3)) { camera = .region(MKCoordinateRegion(center: r.center, span: span)) }
    }

    // ── 헤드리스(rtshot 픽셀 오라클): 목업 플레이스홀더 월드, fitAll 카메라 ──
    var headlessMap: some View {
        let f = RTStats.fitAll(ds)
        let pins = RTStats.clusters(ds) { p in
            let q = RTStats.proj(lat: p.lat, lng: p.lng)
            return CGPoint(x: q.x * f.s + f.tx, y: q.y * f.s + f.ty)
        }.filter { $0.x > -60 && $0.x < 450 && $0.y > -60 && $0.y < 900 }
        return RTMapOcean()
            .frame(width: Self.size.width, height: Self.size.height)
            .overlay(alignment: .topLeading) {
                RTMapWorld(skin: skin)
                    .frame(width: 1000, height: 500)
                    .scaleEffect(f.s, anchor: .topLeading)
                    .offset(x: f.tx, y: f.ty)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .topLeading) {
                ForEach(pins) { m in
                    RTMapPin(ds: ds, m: m)
                        .position(x: m.x, y: m.y - RTMapPin.fullHeight / 2)
                        .zIndex(m.isCluster ? 20 : 10)
                }
                .frame(width: Self.size.width, height: Self.size.height, alignment: .topLeading)
            }
    }

    // 칩 좌상 (14, 58) — mono 11/600, 0곳이면 숨김
    @ViewBuilder var chip: some View {
        if let text = RTStats.chipText(ds) {
            HStack(spacing: 8) {
                RTPinIcon(size: 13, color: skin.chipIcon, lineWidth: 2)
                Text(text).font(.mono(11, 600)).foregroundColor(skin.chipText).rtLB(RTLB.m11)
            }
            .padding(EdgeInsets(top: 7, leading: 12, bottom: 7, trailing: 12))
            .background(Capsule().fill(skin.chipBg))
            .overlay(Capsule().strokeBorder(skin.chipBorder, lineWidth: 1))
            .rtBoxShadow(Capsule(), color: Color.black.opacity(0.3), blur: 12, y: 4, spread: -6)
            .allowsHitTesting(false)
        }
    }

    // 우하 (14, bottom 28): 줌+ / 줌− / 리셋(전체 핀 프레이밍)
    var controls: some View {
        VStack(spacing: 8) {
            Button { zoom(1 / 1.45) } label: {
                ctrlBtn { RTIcon(RTMapIcon.plus, size: 17, stroke: skin.ctrlIcon, lineWidth: 2.4, join: .miter) }
            }
            .buttonStyle(.plain).accessibilityLabel("확대").accessibilityIdentifier("stats.mapZoomIn")
            Button { zoom(1.45) } label: {
                ctrlBtn { RTIcon(RTMapIcon.minus, size: 17, stroke: skin.ctrlIcon, lineWidth: 2.4, join: .miter) }
            }
            .buttonStyle(.plain).accessibilityLabel("축소").accessibilityIdentifier("stats.mapZoomOut")
            Button { withAnimation(.easeInOut(duration: 0.4)) { camera = .region(Self.fitAllRegion(ds)) } } label: {
                ctrlBtn { RTResetIcon(size: 16, color: skin.ctrlIcon) }
            }
            .buttonStyle(.plain).accessibilityLabel("전체 보기").accessibilityIdentifier("stats.mapReset")
        }
        .padding(EdgeInsets(top: 0, leading: 0, bottom: 28, trailing: 14))
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

// ── 바다 배경 (플레이스홀더 · 카드) — radial-gradient(120% 90% at 30% 20%, #eef1ee, #e5eae8 52%, #dce2df) ──
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
                    .scaleEffect(x: (1.2 * w) / r, y: (0.9 * h) / r)
                    .position(x: 0.3 * w, y: 0.2 * h)
            }
        }
    }
}

// ── 월드 레이어 (헤드리스 플레이스홀더 — 실기기는 MapKit): 타원 블롭 + 25px 격자 ──
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

    var body: some View {
        Canvas { ctx, _ in
            var grid = Path()
            for i in 0...20 { let y = CGFloat(i) * 25; grid.move(to: CGPoint(x: 0, y: y)); grid.addLine(to: CGPoint(x: 1000, y: y)) }
            for i in 0...40 { let x = CGFloat(i) * 25; grid.move(to: CGPoint(x: x, y: 0)); grid.addLine(to: CGPoint(x: x, y: 500)) }
            ctx.stroke(grid, with: .color(skin.grat), lineWidth: 0.5)
            for e in Self.land {
                let p = Path(ellipseIn: CGRect(x: e.0 - e.2, y: e.1 - e.3, width: e.2 * 2, height: e.3 * 2))
                ctx.fill(p, with: .color(skin.land))
                ctx.stroke(p, with: .color(skin.landStroke), lineWidth: 1.5)
            }
        }
        .frame(width: 1000, height: 500)
    }
}

// ── 핀 (README §5) — 전체 화면(표지 30×42) / 카드 축소판(22×31). MapKit 위/플레이스홀더 위 공용 ──
struct RTMapPin: View {
    let ds: RTStatsDataset
    let m: RTStats.Pin
    var mini = false
    private let skin = RTMapSkin.paper

    /// 레이아웃 높이 = 표지 + 프레임 6 + 꼬리 − 1 (헤드리스 position 기준)
    static let fullHeight: CGFloat = 42 + 6 + 8 - 1
    static let miniHeight: CGFloat = 31 + 6 + 7 - 1

    var cw: CGFloat { mini ? 22 : 30 }
    var ch: CGFloat { mini ? 31 : 42 }
    var cr: CGFloat { mini ? 3 : 4 }
    var fr: CGFloat { mini ? 6 : 7 }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                if m.stack.count == 2 {   // 2권 이상 = 표지 팬 (뒤 2장)
                    stackCard(ds.books[m.stack[0]]).rotationEffect(.degrees(7)).offset(x: mini ? 4 : 5, y: 3)
                    stackCard(ds.books[m.stack[1]]).rotationEffect(.degrees(-7)).offset(x: mini ? -4 : -5, y: 4)
                }
                frameCard
            }
            .overlay(alignment: .topTrailing) {
                if let n = m.badge { badge(n).offset(x: mini ? 7 : 8, y: mini ? -7 : -8) }
            }
            tail.padding(.top, -1)
        }
        .background(alignment: .bottom) {
            Ellipse().fill(Color(hex: 0x1E160C, alpha: 0.22))
                .frame(width: mini ? 24 : 30, height: mini ? 5 : 6)
                .blur(radius: 1.5)
                .offset(y: 3)
        }
        .overlay(alignment: .bottom) {
            Text(m.label)
                .font(.mono(mini ? 8.5 : 9.5, 600)).tracking((mini ? 8.5 : 9.5) * -0.01)
                .foregroundColor(skin.label)
                .fixedSize()
                .padding(EdgeInsets(top: 1, leading: 5, bottom: 1, trailing: 5))
                .background(RoundedRectangle(cornerRadius: 5).fill(skin.labelBg))
                .alignmentGuide(.bottom) { _ in -3 }
        }
        .rtPinDrop()
    }

    func stackCard(_ b: RTStatsBook) -> some View {
        Group {
            if b.coverUrl.isEmpty {
                RoundedRectangle(cornerRadius: cr).fill(b.fill.paint(CGSize(width: cw, height: ch)))
                    .frame(width: cw, height: ch)
            } else {
                RTRemoteCover(url: b.coverUrl, size: CGSize(width: cw, height: ch), radius: cr)
            }
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: fr).fill(skin.pinFrame))
        .rtBoxShadow(RoundedRectangle(cornerRadius: fr), color: skin.pinShadow,
                     blur: mini ? 14 : 16, y: mini ? 8 : 9, spread: -7)
    }

    var frameCard: some View {
        RTStatsCover(book: ds.books[m.cover], size: CGSize(width: cw, height: ch), radius: cr,
                     fontSize: mini ? 6.5 : 8, lineHeight: (mini ? 6.5 : 8) * 1.08, pad: mini ? 1 : 2)
            .padding(3)
            .background(RoundedRectangle(cornerRadius: fr).fill(skin.pinFrame))
            .rtRing(fr, skin.pinFrameLine, width: 1)   // CSS `outline` = 박스 바깥
            .rtBoxShadow(RoundedRectangle(cornerRadius: fr), color: skin.pinShadow,
                         blur: mini ? 14 : 16, y: mini ? 8 : 9, spread: -7)
    }

    func badge(_ n: Int) -> some View {
        Text("\(n)")
            .font(.mono(mini ? 9.5 : 10, 700))
            .foregroundColor(.white)
            .padding(.horizontal, mini ? 4 : 5)
            .frame(minWidth: mini ? 17 : 19, minHeight: mini ? 17 : 19)
            .background(Capsule().fill(RT.terra))
            .overlay(Capsule().stroke(skin.pinFrame, lineWidth: 2))
            .rtBoxShadow(Capsule(), color: Color.black.opacity(0.42), blur: 7, y: 3, spread: -1)
    }

    var tail: some View {
        let w: CGFloat = mini ? 12 : 14, h: CGFloat = mini ? 7 : 8
        return Path { p in
            p.move(to: CGPoint(x: 0, y: 0))
            p.addLine(to: CGPoint(x: w, y: 0))
            p.addLine(to: CGPoint(x: w / 2, y: h))
            p.closeSubpath()
        }
        .fill(skin.pinFrame)
        .frame(width: w, height: h)
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

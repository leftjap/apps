import SwiftUI
import MapKit

// 기록 원페이지 — 정본: design-ref/design_handoff_record_onepage/README.md + mockups/RTRecordOnePage.dc.html.
// 3탭(주·월·지도)을 단일 스크롤로 통합: ① 월 헤더+이동 ② 서머리 ③ 월 히트맵 ④ 많이 읽은 책 ⑤ 지도 카드.
// 데모(userData nil) = RTStatsDemo(오늘 2026-08-27) → rtshot 픽셀 오라클(.oracle/ora-onepage.png).
// 라이브 = model.statsDataset (종이 세션 + 밀리 일별, 파트너는 종이만).
public struct ScreenStats: View {
    @Environment(\.rtHeadless) private var headless
    var model: RTAppModel?
    private let ds: RTStatsDataset
    private let ym: RTStatsYM
    private let mo: RTStats.Month
    private let range: (first: RTStatsYM, last: RTStatsYM)
    private let skin = RTMapSkin.paper

    public init(model: RTAppModel? = nil) {
        self.model = model
        let ds = model?.statsDataset ?? RTStatsDemo.dataset
        self.ds = ds
        let ym = model?.statsDisplayedMonth ?? RTStatsYM(year: ds.today.year, month: ds.today.month)
        self.ym = ym
        self.mo = RTStats.month(ds, year: ym.year, month: ym.month)
        self.range = RTStats.monthRange(ds)
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            // CSS: position:absolute; top:102; bottom:0; overflow-y:auto; padding:0 22px 28px
            RTScrollArea { content }
            StatsHeader(model: model)
        }
        .frame(width: 390, height: 844)
    }

    var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            monthHeader
            summary.padding(.top, 6)
            dowHeader.padding(EdgeInsets(top: 11, leading: 0, bottom: 5, trailing: 0))
            grid
            sectionTitle(mo.isCurrent ? "이달 많이 읽은 책" : "\(ym.month)월에 많이 읽은 책")
                .padding(EdgeInsets(top: 16, leading: 2, bottom: 4, trailing: 2))
            if mo.ranked.isEmpty {
                Text(mo.isCurrent ? "이달엔 아직 기록이 없어요" : "\(ym.month)월에는 기록이 없어요")
                    .font(.sans(12, 500)).foregroundColor(RT.faint).rtLB(RTLB.n12)
                    .frame(maxWidth: .infinity)
                    .padding(EdgeInsets(top: 20, leading: 0, bottom: 12, trailing: 0))
            } else {
                ForEach(Array(mo.ranked.prefix(3).enumerated()), id: \.offset) { i, r in
                    bookRow(r).accessibilityIdentifier("stats.rankRow.\(i + 1)")
                }
                if mo.ranked.count > 3 { strip }
            }
            HStack(alignment: .firstTextBaseline) {
                Text("독서 지도").font(.sans(14, 800)).foregroundColor(RT.ink).rtLB(RTLB.n14)
                Spacer(minLength: 0)
                Text("전체 기간").font(.mono(9.5, 400)).foregroundColor(RT.ghost)
            }
            .padding(EdgeInsets(top: 18, leading: 2, bottom: 8, trailing: 2))
            mapCard
        }
    }

    func sectionTitle(_ t: String) -> some View {
        Text(t).font(.sans(14, 800)).foregroundColor(RT.ink).rtLB(RTLB.n14)
    }

    // ── ① 월 헤더 + 이동 ──
    var monthHeader: some View {
        HStack(alignment: .center, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(ym.month)월").font(.sans(26, 900)).tracking(26 * -0.04).foregroundColor(RT.ink)
                    .lineLimit(1).fixedSize().rtLB(RTLB.n26h)
                    .accessibilityIdentifier("stats.monthTitle")
                Text(String(ym.year)).font(.mono(13, 600)).tracking(13 * 0.02).foregroundColor(RT.ghost)   // "2,026" 방지
                    .lineLimit(1).fixedSize()
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                if !mo.isCurrent {   // 과거 달을 보고 있을 때만
                    Text("이번 달").font(.sans(11, 700)).foregroundColor(RT.green)
                        .padding(.horizontal, 11).frame(height: 30)
                        .background(Capsule().fill(RT.greenTint))
                        .contentShape(Capsule())
                        .onTapGesture { model?.statsThisMonth() }
                        .accessibilityIdentifier("stats.thisMonth")
                }
                navBtn(back: true, enabled: ym > range.first) { model?.statsPrev() }
                    .accessibilityIdentifier("stats.prev").accessibilityLabel("이전 달")
                navBtn(back: false, enabled: ym < range.last) { model?.statsNext() }
                    .accessibilityIdentifier("stats.next").accessibilityLabel("다음 달")
            }
        }
    }

    // 화살표 30×30 r9 segBg · 경계에서 opacity .35 + 탭 무시
    func navBtn(back: Bool, enabled: Bool, action: @escaping () -> Void) -> some View {
        RoundedRectangle(cornerRadius: 9).fill(RT.segBg)
            .frame(width: 30, height: 30)
            .overlay(RTIcon([back ? "M12 4 6 10l6 6" : "M8 4l6 6-6 6"], size: 13, viewBox: 20,
                            stroke: RT.muted, lineWidth: 2.2))
            .opacity(enabled ? 1 : 0.35)
            .contentShape(Rectangle())
            .onTapGesture { if enabled { action() } }
    }

    // ── ② 서머리 (1줄) — "14:52 총 시간 · 19 / 27일 읽음" + 하단 hair3 ──
    var summary: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text(RTStats.hm(mo.totalSec))
                    .font(.mono(17, 700)).tracking(17 * -0.02).foregroundColor(RT.ink)
                Text("총 시간").font(.sans(12, 500)).foregroundColor(RT.muted)
                Circle().fill(Color(hex: 0xD5CDB8)).frame(width: 3, height: 3)
                HStack(spacing: 0) {
                    Text("\(mo.readDays)").font(.mono(12, 700)).foregroundColor(RT.green)
                    Text(" / \(mo.denomDays)일 읽음").font(.sans(12, 500)).foregroundColor(RT.muted)
                }
                Spacer(minLength: 0)
            }
            .lineLimit(1)
            .frame(height: RTLB.m17)
            .padding(.bottom, 9)
            Rectangle().fill(RT.hair3).frame(height: 1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("stats.summary")
        .accessibilityLabel("총 시간 \(RTStats.hm(mo.totalSec)), \(mo.denomDays)일 중 \(mo.readDays)일 읽음")
    }

    // ── ③ 요일 헤더 + 월 히트맵 (홈 문법 = RTHeatCell) ──
    var dowHeader: some View {
        HStack(spacing: 6) {
            ForEach(Array(["월", "화", "수", "목", "금", "토", "일"].enumerated()), id: \.offset) { i, d in
                Text(d).font(.mono(10, 500))
                    .foregroundColor(i == 6 ? RT.terra : RT.faint)
                    .rtLB(RTLB.m10)
                    .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }

    var grid: some View {
        let cells = mo.cells
        let rows = (cells.count + 6) / 7
        return VStack(spacing: 6) {
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { c in
                        let i = r * 7 + c
                        if i < cells.count, let cell = cells[i] {
                            RTHeatCell(c: cell, onTap: cell.minutes > 0 && !cell.isFuture
                                       ? { model?.statsTapDay(cell.day) } : nil)
                                .frame(maxWidth: .infinity)
                                // 미래 칸은 트리 제외(AC 10) — 식별자를 주면 XCUITest 트리에 다시 노출된다
                                .accessibilityIdentifier(cell.isFuture ? ""
                                    : String(format: "stats.cell.%04d-%02d-%02d", ym.year, ym.month, cell.day))
                        } else {
                            Color.clear.frame(maxWidth: .infinity).frame(height: 33)   // 전달 오프셋 빈 칸
                        }
                    }
                }
            }
        }
        .rtEntrance(delay: 0.05, duration: 0.5)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(ym.month)월 독서 기록")
    }

    // ── ④ 많이 읽은 책 — 상위 3행 (RTRankRow 개조: 진행바 제거 + 메타 라인) ──
    func bookRow(_ r: RTStats.Rank) -> some View {
        let b = ds.books[r.book]
        return HStack(spacing: 12) {
            RTStatsCover(book: b, size: CGSize(width: 30, height: 43), radius: 3,
                         fontSize: 7.5, lineHeight: 8.1, pad: 2)
                .rtBoxShadow(RoundedRectangle(cornerRadius: 3), color: Color(hex: 0x3A2C1C, alpha: 0.3),
                             blur: 7, y: 3, spread: -2)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Text(b.title).font(.sans(13, 700)).foregroundColor(RT.ink)
                        .lineLimit(1).truncationMode(.tail)
                    RTStatsPills(millie: b.millie, done: r.done)
                }
                .frame(height: RTLB.n13)
                Text("\(r.days)일 읽음").font(.sans(11, 500)).foregroundColor(RT.muted)
                    .rtLB(RTLB.n11).padding(.top, 3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(RTStats.hm(r.sec)).font(.mono(12.5, 700)).foregroundColor(RT.ink).rtLB(RTLB.m12_5)
        }
        .padding(EdgeInsets(top: 6, leading: 2, bottom: 6, trailing: 2))
        .contentShape(Rectangle())
        .onTapGesture { model?.statsTapBook(r.book) }
        .accessibilityElement(children: .combine)
    }

    // "그 외" 스트립 — 4위 이하: 라벨 + 표지 최대 6 + `+N` 칩. 블록 51 (상단 hair2 1 + 6 + 44)
    var strip: some View {
        let rest = Array(mo.ranked.dropFirst(3))
        let shown = Array(rest.prefix(6))
        let more = rest.count - shown.count
        return VStack(spacing: 0) {
            Rectangle().fill(RT.hair2).frame(height: 1)
            HStack(spacing: 4) {
                Text("그 외 \(rest.count)권").font(.sans(11, 600)).foregroundColor(RT.muted)
                    .frame(height: 44).padding(.trailing, 5)
                    .contentShape(Rectangle())
                    .onTapGesture { model?.statsOpenList() }
                    .accessibilityIdentifier("stats.stripLabel")
                ForEach(Array(shown.enumerated()), id: \.offset) { i, r in
                    stripCover(ds.books[r.book], index: r.book)
                        .accessibilityIdentifier("stats.strip.\(i + 1)")
                }
                if more > 0 {
                    RoundedRectangle(cornerRadius: 5).fill(RT.segBg)
                        .frame(width: 28, height: 40)
                        .overlay(Text("+\(more)").font(.mono(10, 700)).foregroundColor(RT.muted))
                        .frame(width: 34, height: 44)
                        .contentShape(Rectangle())
                        .onTapGesture { model?.statsOpenList() }
                        .accessibilityIdentifier("stats.stripMore")
                        .accessibilityLabel("그 외 \(more)권 더 보기")
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 6)
        }
        .padding(EdgeInsets(top: 4, leading: 2, bottom: 0, trailing: 2))
    }

    // 표지 28×40 r2.5 (히트 34×44) · 밀리 = 우상단 amber 도트 9 (paper 테두리 1.5)
    func stripCover(_ b: RTStatsBook, index: Int) -> some View {
        RTStatsCover(book: b, size: CGSize(width: 28, height: 40), radius: 2.5,
                     fontSize: 6, lineHeight: 6.6, pad: 1, spine: 1.5)
            .rtBoxShadow(RoundedRectangle(cornerRadius: 2.5), color: Color(hex: 0x3A2C1C, alpha: 0.32),
                         blur: 5, y: 2, spread: -1)
            .overlay(alignment: .topTrailing) {
                if b.millie {
                    Circle().fill(RT.amber).frame(width: 9, height: 9)
                        .overlay(Circle().strokeBorder(RT.paper, lineWidth: 1.5))
                        .offset(x: 3, y: -3)
                }
            }
            .frame(width: 34, height: 44)
            .contentShape(Rectangle())
            .onTapGesture { model?.statsTapBook(index) }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(b.title)
    }

    // ── ⑤ 독서 지도 카드 346×150 r20 — 실기기 MapKit 프리뷰 / 헤드리스 플레이스홀더 ──
    var mapCard: some View {
        Group {
            if headless { headlessCard } else { RTMapCardLive(model: model, ds: ds) }
        }
        .frame(width: 346, height: 150)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(RT.hair, lineWidth: 1))
        .overlay(alignment: .bottomLeading) { chip.padding(EdgeInsets(top: 0, leading: 13, bottom: 13, trailing: 0)) }
        .overlay(alignment: .bottomTrailing) { expandBtn.padding(EdgeInsets(top: 0, leading: 0, bottom: 13, trailing: 13)) }
        .contentShape(RoundedRectangle(cornerRadius: 20))
        .onTapGesture { model?.openMapFullscreen() }
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("stats.mapCard")
        .accessibilityLabel("독서 지도 전체 화면")
    }

    // 목업 카드 뷰: 월드 1000×500 을 translate(-2308,-357) scale(3) — 카드 내부(border 안쪽) 기준
    var headlessCard: some View {
        let v = RTStats.cardView
        let pins = RTStats.clusters(ds) { p in
            let q = RTStats.proj(lat: p.lat, lng: p.lng)
            return CGPoint(x: q.x * v.s + v.tx, y: q.y * v.s + v.ty)
        }.filter { $0.x > -10 && $0.x < 346 && $0.y > 30 && $0.y < 160 }
        return RTMapOcean()
            .frame(width: 344, height: 148)
            .overlay(alignment: .topLeading) {
                RTMapWorld(skin: skin)
                    .frame(width: 1000, height: 500)
                    .scaleEffect(v.s, anchor: .topLeading)
                    .offset(x: v.tx, y: v.ty)
                    .allowsHitTesting(false)
            }
            .overlay(alignment: .topLeading) {
                ForEach(pins) { m in
                    RTMapPin(ds: ds, m: m, mini: true)
                        .position(x: m.x, y: m.y - RTMapPin.miniHeight / 2)
                }
                .frame(width: 344, height: 148, alignment: .topLeading)
            }
            .clipped()
            .padding(1)
    }

    @ViewBuilder var chip: some View {
        if let text = RTStats.chipText(ds) {
            HStack(spacing: 7) {
                RTPinIcon(size: 12, color: skin.chipIcon, lineWidth: 2)
                Text(text).font(.mono(10.5, 600)).foregroundColor(skin.chipText).rtLB(RTLB.m10_5)
            }
            .padding(EdgeInsets(top: 6, leading: 11, bottom: 6, trailing: 11))
            .background(Capsule().fill(skin.chipBg))
            .overlay(Capsule().strokeBorder(skin.chipBorder, lineWidth: 1))
            .rtBoxShadow(Capsule(), color: Color.black.opacity(0.3), blur: 12, y: 4, spread: -6)
        }
    }

    var expandBtn: some View {
        RoundedRectangle(cornerRadius: 11).fill(skin.ctrlBg)
            .frame(width: 34, height: 34)
            .overlay(RoundedRectangle(cornerRadius: 11).strokeBorder(skin.ctrlBorder, lineWidth: 1))
            .overlay(RTIcon(["M14.5 4H20v5.5M9.5 20H4v-5.5M20 4l-6.8 6.8M4 20l6.8-6.8"],
                            size: 15, stroke: skin.ctrlIcon, lineWidth: 2.2))
            .rtBoxShadow(RoundedRectangle(cornerRadius: 11), color: Color.black.opacity(0.4),
                         blur: 14, y: 6, spread: -6)
    }
}

// ── 표지 — 데모(색면+축약 제목) / 실표지 ──
struct RTStatsCover: View {
    let book: RTStatsBook
    let size: CGSize
    let radius: CGFloat
    let fontSize: CGFloat
    let lineHeight: CGFloat
    let pad: CGFloat
    var spine: CGFloat = 2

    var body: some View {
        if book.coverUrl.isEmpty {
            RTFillCover(fill: book.fill, tc: book.tc, title: book.short, size: size, radius: radius,
                        spine: spine, spineAlpha: 0.18, fontSize: fontSize, lineHeight: lineHeight, pad: pad)
        } else {
            RTRemoteCover(url: book.coverUrl, size: size, radius: radius, title: book.title)
        }
    }
}

// ── 출처·완독 필 (sans 9/700, padding 1.5 6, r99, line-height 1.5) — 순서: 밀리 → 완독 ──
struct RTStatsPills: View {
    let millie: Bool
    let done: Bool
    var body: some View {
        if millie { pill("밀리", fg: RT.amberDeep, bg: RT.amberTint) }
        if done { pill("완독", fg: RT.green, bg: RT.greenTint) }
    }
    func pill(_ t: String, fg: Color, bg: Color) -> some View {
        Text(t).font(.sans(9, 700)).foregroundColor(fg)
            .frame(height: 13.5)
            .padding(EdgeInsets(top: 1.5, leading: 6, bottom: 1.5, trailing: 6))
            .background(Capsule().fill(bg))
            .fixedSize()
    }
}

// ── 실기기 지도 카드 — MapKit 프리뷰(제스처 비활성). 카메라 = 동네(latestReadCoord ~1.3km),
//    위치 세션이 없으면(최근 기록이 밀리만) 전체 핀 프레이밍(README 확인 2). 핀 = 축소판 RTMapPin.
struct RTMapCardLive: View {
    var model: RTAppModel?
    let ds: RTStatsDataset
    @State private var camera: MapCameraPosition = .automatic
    @State private var visibleRect: MKMapRect?
    static let size = CGSize(width: 344, height: 148)

    var body: some View {
        Map(position: $camera, interactionModes: []) {
            ForEach(pins) { m in
                let p = ds.places[m.anchor]
                Annotation("", coordinate: CLLocationCoordinate2D(latitude: p.lat, longitude: p.lng),
                           anchor: .bottom) {
                    RTMapPin(ds: ds, m: m, mini: true)
                }
            }
        }
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .onMapCameraChange(frequency: .continuous) { visibleRect = $0.rect }
        .onAppear { camera = .region(defaultRegion()) }
        .frame(width: Self.size.width, height: Self.size.height)
        .padding(1)
        .allowsHitTesting(false)
    }

    private var pins: [RTStats.Pin] {
        guard let rect = visibleRect, rect.size.width > 0 else { return [] }
        return RTStats.clusters(ds) { p in
            let mp = MKMapPoint(CLLocationCoordinate2D(latitude: p.lat, longitude: p.lng))
            return CGPoint(x: (mp.x - rect.origin.x) / rect.size.width * Self.size.width,
                           y: (mp.y - rect.origin.y) / rect.size.height * Self.size.height)
        }
    }

    private func defaultRegion() -> MKCoordinateRegion {
        if let c = model?.latestReadCoord {
            return MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: c.lat, longitude: c.lng),
                                      latitudinalMeters: 1300, longitudinalMeters: 1300)
        }
        return RTMapFullscreen.fitAllRegion(ds)
    }
}

import SwiftUI

// 기록 원페이지 바텀시트 — 공용 1종, 내용 3가지(day / list / place). 정본: README §6.
// 컨테이너 문법은 구 장소 시트(RTBottomSheet)를 그대로 쓴다.

// ── 공용: 하단 시트 셸 (그래버 + 카드) ──
struct RTBottomSheet<Content: View>: View {
    let bg: Color
    let shadowColor: Color
    let shadowBlur: CGFloat
    let shadowY: CGFloat
    let shadowSpread: CGFloat
    let padding: EdgeInsets
    let graberBottom: CGFloat
    @ViewBuilder let content: () -> Content

    private var shape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(topLeadingRadius: 26, bottomLeadingRadius: 0,
                               bottomTrailingRadius: 0, topTrailingRadius: 26)
    }

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(Color(hex: 0xE2DCCB))
                .frame(width: 40, height: 4)
                .padding(.bottom, graberBottom)
            content()
        }
        .padding(padding)
        .frame(width: 390, alignment: .top)
        .fixedSize(horizontal: false, vertical: true)
        .background(shape.fill(bg))
        .rtBoxShadow(shape, color: shadowColor, blur: shadowBlur, y: shadowY, spread: shadowSpread)
        .rtSheetUp()
    }
}

struct RTStatsSheetView: View {
    let sheet: RTStats.Sheet
    let ds: RTStatsDataset
    var model: RTAppModel?

    // 행 = padding 10+10 + 표지 52 + 하단 1 = 73. max-height 74% (624) → 넘치면 내부 스크롤
    static let rowH: CGFloat = 73
    static let headerBlock: CGFloat = 12 + 4 + 14 + 49.5 + 12   // 상단 padding·그래버·헤더(제목 29 + 3 + 서브 17.5)·행 margin
    static let maxSheetH: CGFloat = 844 * 0.74

    var body: some View {
        RTBottomSheet(bg: RT.sheet,
                      shadowColor: Color(hex: 0x14100A, alpha: 0.4),
                      shadowBlur: 48, shadowY: -20, shadowSpread: -14,
                      padding: EdgeInsets(top: 12, leading: 24, bottom: 34, trailing: 24),
                      graberBottom: 14) {
            VStack(alignment: .leading, spacing: 0) {
                header
                rows.padding(.top, 12)
            }
        }
        // 컨테이너에 식별자를 주면 자식(닫기 버튼)의 식별자를 덮어쓴다(XCUITest 실측 2026-09-02) → 제목에 부여
    }

    var header: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 12).fill(RT.greenTint)
                .frame(width: 40, height: 40)
                .overlay(icon)
            VStack(alignment: .leading, spacing: 0) {
                Text(sheet.title).font(.sans(20, 900)).tracking(20 * -0.02).foregroundColor(RT.ink)
                    .lineLimit(1).rtLB(RTLB.n20)
                    .accessibilityIdentifier("stats.sheet")
                Text(sheet.sub).font(.sans(12, 500)).foregroundColor(RT.muted)
                    .rtLB(RTLB.n12)
                    .padding(.top, 3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Button { model?.statsCloseSheet() } label: {
                RoundedRectangle(cornerRadius: 9).fill(RT.segBg)
                    .frame(width: 32, height: 32)
                    .overlay(RTIcon(RTMapIcon.close, size: 14, stroke: RT.muted, lineWidth: 2.4, join: .miter))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)               // 도형+제스처는 접근성 트리에 안 뜬다 — Button 이 식별자를 노출
            .accessibilityLabel("닫기")
            .accessibilityIdentifier("stats.sheet.close")
        }
    }

    // 타일 아이콘 18 stroke green 1.9 — day=캘린더 / list=펼친 책 / place=핀
    @ViewBuilder var icon: some View {
        switch sheet.kind {
        case .day:
            ZStack {
                RoundedRectangle(cornerRadius: 3 * 18 / 24).stroke(RT.green, lineWidth: 1.9 * 18 / 24)
                    .frame(width: 17 * 18 / 24, height: 16 * 18 / 24)
                    .position(x: 12 * 18 / 24, y: 13 * 18 / 24)
                RTIcon(["M8 3v4M16 3v4M3.5 10h17"], size: 18, stroke: RT.green, lineWidth: 1.9)
            }
            .frame(width: 18, height: 18)
        case .list:
            RTIcon(["M4 5.5A1.5 1.5 0 0 1 5.5 4H9a1 1 0 0 1 1 1v13a1 1 0 0 0-1-1H5.5A1.5 1.5 0 0 1 4 15.5z",
                    "M20 5.5A1.5 1.5 0 0 0 18.5 4H15a1 1 0 0 0-1 1v13a1 1 0 0 1 1-1h3.5a1.5 1.5 0 0 0 1.5-1.5z"],
                   size: 18, stroke: RT.green, lineWidth: 1.9)
        case .place:
            RTPinIcon(size: 18, color: RT.green, lineWidth: 1.9)
        }
    }

    var rows: some View {
        let h = CGFloat(sheet.rows.count) * Self.rowH
        let cap = Self.maxSheetH - Self.headerBlock - 34
        return RTCappedScroll(height: min(h, cap)) {
            VStack(spacing: 0) {
                ForEach(Array(sheet.rows.enumerated()), id: \.offset) { i, r in
                    row(r).accessibilityIdentifier("stats.sheet.row.\(i + 1)")
                }
            }
        }
    }

    func row(_ r: RTStats.Row) -> some View {
        let b = ds.books[r.book]
        return VStack(spacing: 0) {
            HStack(spacing: 13) {
                if let rank = r.rank {
                    Text("\(rank)").font(.mono(12, 700))
                        .foregroundColor(rank == 1 ? RT.ink : RT.ghost)
                        .frame(width: 14)
                }
                RTStatsCover(book: b, size: CGSize(width: 36, height: 52), radius: 4,
                             fontSize: 8.5, lineHeight: 9.35, pad: 2)
                    .rtBoxShadow(RoundedRectangle(cornerRadius: 4), color: Color(hex: 0x3A2C1C, alpha: 0.38),
                                 blur: 10, y: 5, spread: -4)
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 6) {
                        Text(b.title).font(.sans(13.5, 700)).foregroundColor(RT.ink)
                            .lineLimit(1).truncationMode(.tail)
                        RTStatsPills(millie: sheet.kind == .place ? false : b.millie, done: r.done)
                    }
                    .frame(height: 19.5)
                    HStack(spacing: 4) {
                        if r.pin { RTPinIcon(size: 9, color: RT.faint, lineWidth: 2.2) }
                        Text(r.sub).font(.sans(11, 500))
                            .foregroundColor(r.subMillie ? RT.amberDeep : RT.muted)
                            .lineLimit(1)
                    }
                    .frame(height: RTLB.n11)
                    .padding(.top, 3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(r.value).font(.mono(12.5, 700)).foregroundColor(RT.ink).rtLB(RTLB.m12_5)
            }
            .padding(EdgeInsets(top: 10, leading: 2, bottom: 10, trailing: 2))
            Rectangle().fill(RT.hair2).frame(height: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture { model?.statsTapBook(r.book) }
        .accessibilityElement(children: .combine)
    }
}

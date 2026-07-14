import SwiftUI

// 장소 시트(§6) · 책 상세 시트(§7) — 정본: 작업지시서 + 목업 CSS 실측 좌표.
// 둘 다 폰 루트에 겹쳐 열린다(책 상세가 장소 시트 위). 데이터는 엔진(RTRecord)이 만든다.

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

    // 높이 = 콘텐츠 (CSS max-height 78/92% 는 시안 데이터에선 도달하지 않는다.
    // 표지가 많아질 때의 상한은 §6 이 지정한 표지 그리드 300px 내부 스크롤이 담당).
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

// 시트 스탯 카드 — #fdfbf4 / border #e9e2cf / radius 14 / padding 11px 12px (border 포함 12/13)
struct RTSheetStat<V: View>: View {
    let label: String
    var labelTop: CGFloat = 2      // 기간 카드만 3 (목업 실측)
    @ViewBuilder let value: () -> V

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            value()
            Text(label).font(.sans(10.5, 500)).foregroundColor(RT.faint)
                .rtLB(RTLB.n10_5)
                .padding(.top, labelTop)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .rtRecCard(14, EdgeInsets(top: 11, leading: 12, bottom: 11, trailing: 12))
    }
}

// 스탯 3칸 행 — CSS flex 기본 align-items:stretch (제일 큰 카드 높이에 맞춰 늘어남)
struct RTSheetStatRow<C: View>: View {
    @ViewBuilder let cards: () -> C
    var body: some View {
        HStack(spacing: 9, content: cards)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// mono 값 + Noto 접미 ("2권", "3회", "2곳")
func rtStatValue(_ v: String, _ unit: String? = nil) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 0) {
        Text(v).font(.mono(17, 700)).foregroundColor(RT.ink)
        if let unit {
            Text(unit).font(.sans(11, 400)).foregroundColor(RT.muted)
        }
    }
    .frame(height: RTLB.m17)
}

// ── §6 장소 시트 ──
struct RTPlaceSheetView: View {
    let sheet: RTRecord.PlaceSheet
    var model: RTAppModel?

    // 표지 버튼 높이 = 표지 95 + mt6 + 제목 13.2 + mt1 + 시간 13 = 128.2 (CSS 실측)
    static let coverItemH: CGFloat = 128.2
    static let gridCap: CGFloat = 300

    var body: some View {
        RTBottomSheet(bg: RT.sheet,
                      shadowColor: Color(hex: 0x14100A, alpha: 0.4),
                      shadowBlur: 48, shadowY: -20, shadowSpread: -14,
                      padding: EdgeInsets(top: 12, leading: 24, bottom: 30, trailing: 24),
                      graberBottom: 14) {
            VStack(alignment: .leading, spacing: 0) {
                header
                RTSheetStatRow {
                    RTSheetStat(label: "여기서 읽은 책") { rtStatValue("\(sheet.statBooks)", "권") }
                    RTSheetStat(label: "누적 시간") { rtStatValue(sheet.statTime) }
                    RTSheetStat(label: "기간", labelTop: 3) {
                        // CSS 는 공백에서만 줄바꿈(keep-all) → "6.23 –" / "6.24" (카드 내부 폭 82)
                        RTWrapLines(sheet.period, size: 13, weight: 700, mono: true, color: RT.ink,
                                    lineHeight: RTLB.m13, width: 82, alignment: .leading)
                            .padding(.top, 3)
                    }
                }
                .padding(.top, 16)
                Text("여기서 읽은 책").font(.sans(13, 800)).foregroundColor(RT.ink)
                    .rtLB(RTLB.n13)
                    .padding(EdgeInsets(top: 18, leading: 0, bottom: 10, trailing: 0))
                covers
            }
        }
    }

    var header: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 12).fill(RT.greenTint)
                .frame(width: 40, height: 40)
                .overlay(RTPinIcon(size: 19, color: RT.green))
            VStack(alignment: .leading, spacing: 0) {
                Text(sheet.name).font(.sans(20, 900)).tracking(20 * -0.02).foregroundColor(RT.ink)
                    .rtLB(RTLB.n20)
                Text(sheet.sub).font(.sans(12, 500)).foregroundColor(RT.muted)
                    .rtLB(RTLB.n12)
                    .padding(.top, 3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            RoundedRectangle(cornerRadius: 9).fill(RT.segBg)
                .frame(width: 32, height: 32)
                .overlay(RTIcon(RTMapIcon.close, size: 14, stroke: RT.muted, lineWidth: 2.4, join: .miter))
                .contentShape(Rectangle())
                .onTapGesture { model?.closePlaceSheet() }
        }
    }

    // 표지 그리드 — flex wrap gap 14×12, max-height 300 내부 스크롤(§6).
    // CSS `padding:0 4px 4px` → 컨테이너 높이 = 아이템 + 하단 4 (그림자 여백)
    var covers: some View {
        let rows = Int(ceil(Double(sheet.covers.count) / 4.0))
        let h = CGFloat(rows) * Self.coverItemH + CGFloat(max(0, rows - 1)) * 14 + 4
        return RTCappedScroll(height: min(h, Self.gridCap)) {
            RTFlowGrid(itemWidth: 66, hSpacing: 12, vSpacing: 14, count: sheet.covers.count) { i in
                coverButton(sheet.covers[i], index: i)
            }
            .padding(.bottom, 4)
        }
    }

    func coverButton(_ cv: RTRecord.SheetCover, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                RTFillCover(fill: cv.fill, tc: cv.tc, title: cv.title,
                            size: CGSize(width: 66, height: 95), radius: 5,
                            spine: 3, spineAlpha: 0.18, fontSize: 12, lineHeight: 13.2,
                            pad: 4, wrap: true)
                    .rtBoxShadow(RoundedRectangle(cornerRadius: 5),
                                 color: Color(hex: 0x3A2C1C, alpha: 0.42), blur: 16, y: 8, spread: -6)
                if cv.millie {
                    Text("밀리")
                        .font(.mono(6.5, 700)).tracking(6.5 * 0.04)
                        .foregroundColor(.white)
                        .rtLB(RTLB.m6_5)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(RoundedRectangle(cornerRadius: 3).fill(Color(hex: 0xB8862E, alpha: 0.9)))
                        .padding(3)
                }
            }
            Text(cv.title).font(.sans(11, 600)).foregroundColor(RT.ink)
                .lineLimit(1).truncationMode(.tail)
                .frame(width: 66, height: 13.2, alignment: .leading)
                .padding(.top, 6)
            Text(cv.time).font(.mono(10, 400)).foregroundColor(RT.muted)
                .rtLB(RTLB.m10)
                .padding(.top, 1)
        }
        .frame(width: 66, height: RTPlaceSheetView.coverItemH, alignment: .topLeading)
        .contentShape(Rectangle())
        .onTapGesture { model?.openRecordBook(cv.bookId) }
        .rtPop(delay: Double(index) * 0.05, duration: 0.42)
    }
}

// flex-wrap 재현 — 고정 폭 아이템을 좌→우로 채우고 넘치면 다음 줄 (시트 내부 폭 342 → 4열)
struct RTFlowGrid<Content: View>: View {
    let itemWidth: CGFloat
    let hSpacing: CGFloat
    let vSpacing: CGFloat
    let count: Int
    @ViewBuilder let item: (Int) -> Content

    private var columns: Int {
        let w: CGFloat = 390 - 24 * 2
        return max(1, Int((w + hSpacing) / (itemWidth + hSpacing)))
    }

    var body: some View {
        let rows = Int(ceil(Double(count) / Double(columns)))
        VStack(alignment: .leading, spacing: vSpacing) {
            ForEach(0..<max(rows, 0), id: \.self) { r in
                HStack(alignment: .top, spacing: hSpacing) {
                    ForEach(0..<columns, id: \.self) { c in
                        let i = r * columns + c
                        if i < count { item(i) } else { Color.clear.frame(width: itemWidth, height: 0) }
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// ── §7 책 상세 시트 ──
struct RTBookSheetView: View {
    let book: RTRecord.BookDetail
    var model: RTAppModel?

    var body: some View {
        RTBottomSheet(bg: RT.paper,
                      shadowColor: Color(hex: 0x14100A, alpha: 0.45),
                      shadowBlur: 50, shadowY: -22, shadowSpread: -14,
                      padding: EdgeInsets(top: 12, leading: 22, bottom: 30, trailing: 22),
                      graberBottom: 16) {
            VStack(alignment: .leading, spacing: 0) {
                header
                RTSheetStatRow {
                    RTSheetStat(label: "총 시간") { rtStatValue(book.statTime) }
                    RTSheetStat(label: "세션") { rtStatValue("\(book.statSessions)", "회") }
                    RTSheetStat(label: "읽은 곳") { rtStatValue("\(book.statPlaces)", "곳") }
                }
                .padding(.top, 16)
                Text("읽은 곳").font(.sans(13, 800)).foregroundColor(RT.ink).rtLB(RTLB.n13)
                    .padding(EdgeInsets(top: 18, leading: 0, bottom: 9, trailing: 0))
                placeChips
                Text("읽은 기록").font(.sans(13, 800)).foregroundColor(RT.ink).rtLB(RTLB.n13)
                    .padding(EdgeInsets(top: 18, leading: 0, bottom: 4, trailing: 0))
                ForEach(Array(book.sessions.enumerated()), id: \.offset) { _, s in
                    sessionRow(s)
                }
            }
        }
    }

    var header: some View {
        HStack(alignment: .top, spacing: 14) {
            RTFillCover(fill: book.fill, tc: book.tc, title: book.title,
                        size: CGSize(width: 72, height: 104), radius: 5,
                        spine: 3, spineAlpha: 0.18, fontSize: 13, lineHeight: 14.56,
                        pad: 5, wrap: true)
                .rtBoxShadow(RoundedRectangle(cornerRadius: 5),
                             color: Color(hex: 0x3A2C1C, alpha: 0.45), blur: 20, y: 10, spread: -7)
            VStack(alignment: .leading, spacing: 0) {
                Text(book.tag).font(.sans(10, 700))
                    .foregroundColor(Color(hex: book.millie ? 0xB8862E : 0x2C4A3C))
                    .rtLB(RTLB.n10)
                    .padding(EdgeInsets(top: 3, leading: 8, bottom: 3, trailing: 8))
                    .background(Capsule().fill(Color(hex: book.millie ? 0xF6ECD6 : 0xE9EFE6)))
                Text(book.title).font(.sans(20, 900)).tracking(20 * -0.02).foregroundColor(RT.ink)
                    .frame(height: 24, alignment: .leading)   // line-height:1.2
                    .padding(.top, 8)
                Text(book.author).font(.sans(13, 500)).foregroundColor(RT.muted)
                    .rtLB(RTLB.n13)
                    .padding(.top, 4)
            }
            .padding(.top, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
            RoundedRectangle(cornerRadius: 9).fill(RT.segBg)
                .frame(width: 32, height: 32)
                .overlay(RTIcon(RTMapIcon.close, size: 14, stroke: RT.muted, lineWidth: 2.4, join: .miter))
                .contentShape(Rectangle())
                .onTapGesture { model?.closeRecordBook() }
        }
    }

    var placeChips: some View {
        HStack(spacing: 7) {
            ForEach(Array(book.places.enumerated()), id: \.offset) { _, p in
                HStack(spacing: 4) {
                    RTPinIcon(size: 9, color: RT.green, lineWidth: 2.4)
                    Text(p).font(.sans(11, 600)).foregroundColor(Color(hex: 0x6F6752)).rtLB(RTLB.n11)
                }
                .padding(EdgeInsets(top: 5, leading: 11, bottom: 5, trailing: 11))   // border 1 포함
                .background(Capsule().fill(Color.white))
                .overlay(Capsule().strokeBorder(RT.hair, lineWidth: 1))
            }
            Spacer(minLength: 0)
        }
    }

    func sessionRow(_ s: RTRecord.BookRow) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text(s.date).font(.mono(12, 600)).foregroundColor(RT.ink)
                    .frame(minWidth: 38, alignment: .leading)
                HStack(spacing: 4) {
                    RTPinIcon(size: 10, color: RT.faint, lineWidth: 2.2)
                    Text(s.place).font(.sans(12, 500)).foregroundColor(RT.muted)
                }
                Spacer(minLength: 0)
                Text(s.dur).font(.mono(12, 600)).foregroundColor(RT.green)
            }
            .frame(height: RTLB.n12)
            .padding(EdgeInsets(top: 11, leading: 2, bottom: 11, trailing: 2))
            Rectangle().fill(Color(hex: 0xECE5D2)).frame(height: 1)
        }
    }
}

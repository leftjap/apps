import SwiftUI

// v8 12 서재 — 스펙: frames/12.html
public struct Screen12Library: View {
    public init() {}

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            VStack(alignment: .leading, spacing: 0) {
                search
                toolbar.padding(.top, 12)
                Text("읽는 중").font(.mono(10, 600)).tracking(10 * 0.18)
                    .foregroundColor(RT.faint)
                    .padding(EdgeInsets(top: 16, leading: 2, bottom: 10, trailing: 0))
                readingCard
                HStack(spacing: 4) {
                    Text("완독").font(.mono(10, 600)).tracking(10 * 0.18).foregroundColor(RT.faint)
                    Text("13").font(.mono(10, 600)).tracking(10 * 0.18).foregroundColor(RT.ghost)
                }
                .padding(EdgeInsets(top: 20, leading: 2, bottom: 12, trailing: 0))
                grid
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .padding(.top, 102)
            header
        }
        .frame(width: 390, height: 844)
    }

    var header: some View {
        HStack {
            HStack(spacing: 4) {
                RTIcon(RTIconPath.back, size: 17, viewBox: 20, stroke: RT.body, lineWidth: 2.2)
                    .frame(width: 38, height: 38)
                Text("서재").font(.sans(17, 800)).foregroundColor(RT.ink)
                Text("14").font(.mono(12, 600)).foregroundColor(RT.faint).padding(.leading, 3)
            }
            Spacer()
            RoundedRectangle(cornerRadius: 11).fill(RT.ctaGrad(CGSize(width: 36, height: 36)))
                .frame(width: 36, height: 36)
                .overlay(RTIcon(RTIconPath.plus, size: 17, stroke: RT.ctaText, lineWidth: 2.6))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.42), radius: 5, x: 0, y: 6)
                .padding(.trailing, 2)
        }
        .padding(EdgeInsets(top: 52, leading: 18, bottom: 0, trailing: 18))
    }

    var search: some View {
        HStack(spacing: 9) {
            RTIcon(["M20 20l-3.6-3.6"], size: 16, stroke: Color(hex: 0xA59D87), lineWidth: 2)
                .overlay(Circle().stroke(Color(hex: 0xA59D87), lineWidth: 2 * 16 / 24)
                    .frame(width: 14 * 16 / 24, height: 14 * 16 / 24).offset(x: -16 / 24, y: -16 / 24))
            Text("내 책 · 저자 검색").font(.sans(13.5, 500)).foregroundColor(Color(hex: 0xA59D87))
            Spacer()
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(Color(hex: 0xEFEADB))
        .clipShape(RoundedRectangle(cornerRadius: 13))
        .overlay(RoundedRectangle(cornerRadius: 13).stroke(Color(hex: 0xE5DFCD), lineWidth: 1))
    }

    var toolbar: some View {
        HStack {
            HStack(spacing: 0) {
                filterSeg("전체", on: true)
                filterSeg("읽는 중", on: false)
                filterSeg("완독", on: false)
            }
            .padding(3)
            .background(Capsule().fill(RT.segBg))
            Spacer()
            HStack(spacing: 5) {
                RTIcon(["M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3"], size: 12, stroke: RT.muted, lineWidth: 2.2)
                Text("최근순").font(.sans(11.5, 600)).foregroundColor(RT.body)
            }
            .padding(EdgeInsets(top: 7, leading: 11, bottom: 7, trailing: 11))
            .background(Capsule().fill(RT.segBg))
        }
    }

    func filterSeg(_ t: String, on: Bool) -> some View {
        Text(t).font(.sans(12, on ? 700 : 600))
            .foregroundColor(on ? RT.ink : RT.muted)
            .padding(EdgeInsets(top: 6, leading: 14, bottom: 6, trailing: 14))
            .background(Capsule().fill(on ? RT.surface : Color.clear))
            .shadow(color: on ? Color(hex: 0x16140F, alpha: 0.06) : .clear, radius: 1, x: 0, y: 1)
    }

    var readingCard: some View {
        HStack(spacing: 14) {
            FlowCover(.init(width: 54, height: 79, spine: 3, frameInset: 4,
                            padTop: 22, padBottom: 6, authorEN: nil,
                            titleSize: 13, titleTop: 0, flowSize: 4.5, flowTop: 3,
                            ruleWidth: nil, authorKR: nil))
                .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.4), radius: 7, x: 0, y: 8)
            VStack(alignment: .leading, spacing: 0) {
                Text("몰입").font(.sans(15.5, 800)).foregroundColor(RT.ink)
                Text("미하이 칙센트미하이").font(.sans(11.5, 500)).foregroundColor(RT.muted)
                    .padding(.top, 3)
                Text("4:12 · 8회 · 18일째").font(.mono(11, 600)).foregroundColor(RT.faint)
                    .padding(.top, 9)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Circle().fill(RT.ctaGrad(CGSize(width: 40, height: 40)))
                .frame(width: 40, height: 40)
                .overlay(RTIcon(RTIconPath.play, size: 15, fill: RT.ctaText))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.42), radius: 5, x: 0, y: 6)
        }
        .padding(12)
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
        .shadow(color: Color(hex: 0x16140F, alpha: 0.03), radius: 1, x: 0, y: 1)
        .shadow(color: Color(hex: 0x16140F, alpha: 0.12), radius: 5, x: 0, y: 6) // 0 10 22 -18 근사
    }

    var grid: some View {
        let items: [(AnyView, Int)] = [
            (AnyView(GridCover.money), 4), (AnyView(GridCover.farewell), 5), (AnyView(GridCover.trend), 3),
            (AnyView(GridCover.light), 5), (AnyView(GridCover.same), 4), (AnyView(GridCover.focus), 3),
        ]
        let rows = stride(from: 0, to: items.count, by: 3).map { Array(items[$0..<min($0 + 3, items.count)]) }
        return VStack(spacing: 16) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 12) {
                    ForEach(Array(row.enumerated()), id: \.offset) { _, item in
                        VStack(spacing: 7) {
                            item.0
                                .frame(width: 86, height: 124)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                                .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.42), radius: 9, x: 0, y: 10)
                            stars(item.1)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    func stars(_ n: Int) -> some View {
        HStack(spacing: 1.4) {
            ForEach(0..<5, id: \.self) { i in
                Text("★").font(.system(size: 6.5))
                    .foregroundColor(i < n ? RT.amber : Color(hex: 0xDDD6C3))
            }
        }
    }
}

// ── 13 책 추가 (검색 시트, top 96 고정) ──
public struct Sheet13AddBook: View {
    public init() {}

    public var body: some View {
        VStack {
            Spacer().frame(height: 96)
            VStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 99).fill(Color(hex: 0xE2DCCB))
                    .frame(width: 40, height: 4)
                    .padding(.top, 10)
                HStack {
                    Text("책 추가").font(.sans(20, 900)).tracking(20 * -0.02).foregroundColor(RT.ink)
                    Spacer()
                    RoundedRectangle(cornerRadius: 9).fill(RT.segBg)
                        .frame(width: 32, height: 32)
                        .overlay(RTIcon(["M6 6l12 12M18 6L6 18"], size: 14, stroke: RT.muted, lineWidth: 2.4, cap: .round, join: .miter))
                }
                .padding(EdgeInsets(top: 15, leading: 24, bottom: 14, trailing: 24))
                VStack(alignment: .leading, spacing: 11) {
                    HStack(spacing: 10) {
                        RTIcon(["M20 20l-3.6-3.6"], size: 18, stroke: RT.muted, lineWidth: 2)
                            .overlay(Circle().stroke(RT.muted, lineWidth: 2 * 18 / 24)
                                .frame(width: 14 * 18 / 24, height: 14 * 18 / 24).offset(x: -18 / 24, y: -18 / 24))
                        Text("몰입").font(.sans(15, 500)).foregroundColor(RT.ink)
                        Rectangle().fill(RT.green).frame(width: 2, height: 19)
                        Spacer()
                    }
                    .padding(.horizontal, 15)
                    .frame(height: 50)
                    .background(RT.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(RT.green, lineWidth: 1.5))
                    .shadow(color: Color(hex: 0x16140F, alpha: 0.05), radius: 3, x: 0, y: 2)
                    Text("검색 결과 · 32건").font(.mono(10.5, 500)).tracking(10.5 * 0.06)
                        .foregroundColor(RT.faint)
                }
                .padding(EdgeInsets(top: 0, leading: 24, bottom: 12, trailing: 24))
                VStack(spacing: 0) {
                    row(cover: AnyView(SearchCover.flow), title: "몰입", meta: "미하이 칙센트미하이 · 한울림", added: true)
                    row(cover: AnyView(SearchCover.farewell), title: "작별하지 않는다", meta: "한강 · 문학동네", added: false)
                    row(cover: AnyView(SearchCover.money), title: "돈의 심리학", meta: "모건 하우절 · 인플루엔셜", added: false)
                    row(cover: AnyView(SearchCover.light), title: "우리가 빛의 속도로 갈 수 없다면", meta: "김초엽 · 허블", added: false)
                    row(cover: AnyView(SearchCover.trend), title: "트렌드 코리아 2026", meta: "김난도 외 · 미래의창", added: false)
                }
                .padding(EdgeInsets(top: 0, leading: 16, bottom: 20, trailing: 16))
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26)
                    .fill(RT.sheet)
                    .shadow(color: Color.black.opacity(0.28), radius: 23, x: 0, y: -14)
            )
        }
    }

    func row(cover: AnyView, title: String, meta: String, added: Bool) -> some View {
        HStack(spacing: 13) {
            cover
                .frame(width: 46, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 3))
                .shadow(color: Color.black.opacity(0.25), radius: 4, x: 0, y: 4)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.sans(14.5, 700)).foregroundColor(RT.ink)
                Text(meta).font(.sans(12, 400)).foregroundColor(RT.muted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if added {
                Circle().fill(RT.green)
                    .frame(width: 32, height: 32)
                    .overlay(RTIcon(RTIconPath.check, size: 15, stroke: RT.ctaText, lineWidth: 2.8))
                    .shadow(color: Color(hex: 0x26413A, alpha: 0.5), radius: 4.5, x: 0, y: 4)
            } else {
                Circle().fill(RT.segBg)
                    .frame(width: 32, height: 32)
                    .overlay(RTIcon(RTIconPath.plus, size: 15, stroke: RT.muted, lineWidth: 2.6))
            }
        }
        .padding(EdgeInsets(top: 11, leading: 8, bottom: 11, trailing: 8))
        .background(RoundedRectangle(cornerRadius: 13).fill(added ? RT.greenTint : Color.clear))
    }
}

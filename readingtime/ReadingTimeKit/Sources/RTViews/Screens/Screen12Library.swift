import SwiftUI

// v8 12 서재 — 스펙: frames/12.html. userData 주입 시 실데이터 (init 스냅샷).
public struct Screen12Library: View {
    struct Live {
        let total: Int
        let reading: [RTBook]
        let readingMeta: [String: String]   // isbn → "0:01 · 1회 · 1일째"
        let finished: [RTBook]
    }

    var model: RTAppModel?
    private let filter: RTLibraryFilter
    private let sort: RTLibrarySort
    private let live: Live?

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.filter = model?.libraryFilter ?? .all
        self.sort = model?.librarySort ?? .recent
        if let m = model, let d = m.userData {
            let cal = Calendar(identifier: .gregorian)
            let reading = d.books.filter { !$0.finished }.sorted { $0.addedAt > $1.addedAt }
            var meta: [String: String] = [:]
            for b in reading {
                let days = (cal.dateComponents([.day], from: cal.startOfDay(for: b.addedAt),
                                               to: cal.startOfDay(for: m.now())).day ?? 0) + 1
                meta[b.isbn] = "\(RTAppModel.hmString(m.totalSeconds(isbn: b.isbn))) · \(m.sessionCount(isbn: b.isbn))회 · \(days)일째"
            }
            self.live = Live(total: d.books.count, reading: reading, readingMeta: meta,
                             finished: d.books.filter { $0.finished })
        } else {
            self.live = nil
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            VStack(alignment: .leading, spacing: 0) {
                search
                toolbar.padding(.top, 12)
                if filter != .finished, live == nil || !(live!.reading.isEmpty) {
                    Text("읽는 중").font(.mono(10, 600)).tracking(10 * 0.18)
                        .foregroundColor(RT.faint)
                        .padding(EdgeInsets(top: 16, leading: 2, bottom: 10, trailing: 0))
                    if let live {
                        VStack(spacing: 10) {
                            ForEach(live.reading, id: \.isbn) { b in
                                liveReadingCard(b)
                            }
                        }
                    } else {
                        readingCard
                    }
                }
                if filter != .reading, live == nil || !(live!.finished.isEmpty) {
                    HStack(spacing: 4) {
                        Text("완독").font(.mono(10, 600)).tracking(10 * 0.18).foregroundColor(RT.faint)
                        Text(live.map { "\($0.finished.count)" } ?? "13")
                            .font(.mono(10, 600)).tracking(10 * 0.18).foregroundColor(RT.ghost)
                    }
                    .padding(EdgeInsets(top: 20, leading: 2, bottom: 12, trailing: 0))
                    grid
                }
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
                    .contentShape(Rectangle())
                    .onTapGesture { model?.nav(.home) }
                Text("서재").font(.sans(17, 800)).foregroundColor(RT.ink)
                Text(live.map { "\($0.total)" } ?? "14")
                    .font(.mono(12, 600)).foregroundColor(RT.faint).padding(.leading, 3)
            }
            Spacer()
            RoundedRectangle(cornerRadius: 11).fill(RT.ctaGrad(CGSize(width: 36, height: 36)))
                .frame(width: 36, height: 36)
                .overlay(RTIcon(RTIconPath.plus, size: 17, stroke: RT.ctaText, lineWidth: 2.6))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.42), radius: 5, x: 0, y: 6)
                .contentShape(Rectangle())
                .onTapGesture { model?.openSheet(.addbook) }
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

    static let sortLabels: [RTLibrarySort: String] = [.recent: "최근순", .name: "이름순", .rating: "별점순"]

    var toolbar: some View {
        HStack {
            HStack(spacing: 0) {
                filterSeg("전체", .all)
                filterSeg("읽는 중", .reading)
                filterSeg("완독", .finished)
            }
            .padding(3)
            .background(Capsule().fill(RT.segBg))
            Spacer()
            HStack(spacing: 5) {
                RTIcon(["M7 4v13M7 17l-3-3M7 17l3-3M17 20V7M17 7l-3 3M17 7l3 3"], size: 12, stroke: RT.muted, lineWidth: 2.2)
                Text(Self.sortLabels[sort] ?? "최근순").font(.sans(11.5, 600)).foregroundColor(RT.body)
            }
            .padding(EdgeInsets(top: 7, leading: 11, bottom: 7, trailing: 11))
            .background(Capsule().fill(RT.segBg))
            .contentShape(Capsule())
            .onTapGesture { model?.openSheet(.sort) }
        }
    }

    func filterSeg(_ t: String, _ f: RTLibraryFilter) -> some View {
        let on = filter == f
        return Text(t).font(.sans(12, on ? 700 : 600))
            .foregroundColor(on ? RT.ink : RT.muted)
            .padding(EdgeInsets(top: 6, leading: 14, bottom: 6, trailing: 14))
            .background(Capsule().fill(on ? RT.surface : Color.clear))
            .shadow(color: on ? Color(hex: 0x16140F, alpha: 0.06) : .clear, radius: 1, x: 0, y: 1)
            .contentShape(Capsule())
            .onTapGesture { model?.setLibraryFilter(f) }
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
                .contentShape(Circle())
                .onTapGesture { model?.start() }
        }
        .padding(12)
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
        .shadow(color: Color(hex: 0x16140F, alpha: 0.03), radius: 1, x: 0, y: 1)
        .shadow(color: Color(hex: 0x16140F, alpha: 0.12), radius: 5, x: 0, y: 6) // 0 10 22 -18 근사
        .contentShape(Rectangle())
        .onTapGesture { model?.nav(.detail) }
    }

    // 라이브 읽는 중 카드 — 데모 readingCard 와 동일 레이아웃, 원격 표지·실 메타
    func liveReadingCard(_ b: RTBook) -> some View {
        HStack(spacing: 14) {
            RTRemoteCover(url: b.coverUrl, size: .init(width: 54, height: 79), radius: 4)
                .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.4), radius: 7, x: 0, y: 8)
            VStack(alignment: .leading, spacing: 0) {
                Text(b.title).font(.sans(15.5, 800)).foregroundColor(RT.ink).lineLimit(1)
                Text(b.author).font(.sans(11.5, 500)).foregroundColor(RT.muted)
                    .padding(.top, 3).lineLimit(1)
                Text(live?.readingMeta[b.isbn] ?? "").font(.mono(11, 600)).foregroundColor(RT.faint)
                    .padding(.top, 9)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Circle().fill(RT.ctaGrad(CGSize(width: 40, height: 40)))
                .frame(width: 40, height: 40)
                .overlay(RTIcon(RTIconPath.play, size: 15, fill: RT.ctaText))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.42), radius: 5, x: 0, y: 6)
                .contentShape(Circle())
                .onTapGesture { model?.start() }
        }
        .padding(12)
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
        .shadow(color: Color(hex: 0x16140F, alpha: 0.03), radius: 1, x: 0, y: 1)
        .shadow(color: Color(hex: 0x16140F, alpha: 0.12), radius: 5, x: 0, y: 6)
        .contentShape(Rectangle())
        .onTapGesture {
            model?.selectedISBN = b.isbn
            model?.nav(.detail)
        }
    }

    // 완독 목록 (prototype FINISHED — 정렬용 제목 포함)
    static let finished: [(key: String, title: String, rating: Int)] = [
        ("money", "돈의 심리학", 4), ("farewell", "작별하지 않는다", 5), ("trend", "트렌드 코리아 2026", 3),
        ("light", "우리가 빛의 속도로 갈 수 없다면", 5), ("same", "불변의 법칙", 4), ("focus", "도둑맞은 집중력", 3),
    ]

    static let gridCovers: [String: AnyView] = [
        "money": AnyView(GridCover.money), "farewell": AnyView(GridCover.farewell),
        "trend": AnyView(GridCover.trend), "light": AnyView(GridCover.light),
        "same": AnyView(GridCover.same), "focus": AnyView(GridCover.focus),
    ]

    var sortedFinished: [(key: String, title: String, rating: Int)] {
        switch sort {
        case .recent: return Self.finished
        case .name: return Self.finished.sorted { $0.title.compare($1.title, locale: Locale(identifier: "ko")) == .orderedAscending }
        case .rating:
            // 동률은 원본 순서 유지 — Swift sort 는 안정성 비보장이라 인덱스로 명시 (프로토타입 JS 안정 정렬 정합)
            return Self.finished.enumerated()
                .sorted { $0.element.rating != $1.element.rating
                    ? $0.element.rating > $1.element.rating
                    : $0.offset < $1.offset }
                .map(\.element)
        }
    }

    /// 라이브 완독 정렬 (데모 sortedFinished 와 동일 규칙)
    var sortedLiveFinished: [RTBook] {
        guard let items = live?.finished else { return [] }
        switch sort {
        case .recent:
            return items.sorted { ($0.finishedAt ?? $0.addedAt) > ($1.finishedAt ?? $1.addedAt) }
        case .name:
            return items.sorted { $0.title.compare($1.title, locale: Locale(identifier: "ko")) == .orderedAscending }
        case .rating:
            return items.enumerated()
                .sorted { ($0.element.rating ?? 0) != ($1.element.rating ?? 0)
                    ? ($0.element.rating ?? 0) > ($1.element.rating ?? 0)
                    : $0.offset < $1.offset }
                .map(\.element)
        }
    }

    var grid: some View {
        Group {
            if live != nil {
                let items = sortedLiveFinished
                let rows = stride(from: 0, to: items.count, by: 3).map { Array(items[$0..<min($0 + 3, items.count)]) }
                VStack(spacing: 16) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                        HStack(spacing: 12) {
                            ForEach(Array(row.enumerated()), id: \.offset) { c, b in
                                VStack(spacing: 7) {
                                    RTRemoteCover(url: b.coverUrl, size: .init(width: 86, height: 124), radius: 4)
                                        .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.42), radius: 9, x: 0, y: 10)
                                    stars(b.rating ?? 0)
                                }
                                .frame(maxWidth: .infinity)
                                .rtEntrance(delay: 0.05 + Double(r * 3 + c) * 0.05, duration: 0.45)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    model?.selectedISBN = b.isbn
                                    model?.nav(.detail)
                                }
                            }
                            // 마지막 행 빈 칸 채움 (3열 균등폭 유지 — 높이 0 고정: Color 세로 팽창 방지)
                            ForEach(0..<(3 - row.count), id: \.self) { _ in
                                Color.clear.frame(maxWidth: .infinity).frame(height: 0)
                            }
                        }
                    }
                }
            } else {
                let items = sortedFinished
                let rows = stride(from: 0, to: items.count, by: 3).map { Array(items[$0..<min($0 + 3, items.count)]) }
                VStack(spacing: 16) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { r, row in
                        HStack(spacing: 12) {
                            ForEach(Array(row.enumerated()), id: \.offset) { c, item in
                                VStack(spacing: 7) {
                                    (Self.gridCovers[item.key] ?? AnyView(EmptyView()))
                                        .frame(width: 86, height: 124)
                                        .clipShape(RoundedRectangle(cornerRadius: 4))
                                        .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.42), radius: 9, x: 0, y: 10)
                                    stars(item.rating)
                                }
                                .frame(maxWidth: .infinity)
                                .rtEntrance(delay: 0.05 + Double(r * 3 + c) * 0.05, duration: 0.45)
                            }
                        }
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
    var model: RTAppModel?
    private let added: Set<String>
    private let results: [RTBookHit]?

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.added = model?.added ?? ["flow"]
        self.results = model?.searchResults
    }

    // 데모 검색 결과 (prototype SEARCH_ROWS)
    static let searchRows: [(key: String, title: String, meta: String)] = [
        ("flow", "몰입", "미하이 칙센트미하이 · 한울림"),
        ("farewell", "작별하지 않는다", "한강 · 문학동네"),
        ("money", "돈의 심리학", "모건 하우절 · 인플루엔셜"),
        ("light", "우리가 빛의 속도로 갈 수 없다면", "김초엽 · 허블"),
        ("trend", "트렌드 코리아 2026", "김난도 외 · 미래의창"),
    ]

    static let searchCovers: [String: AnyView] = [
        "flow": AnyView(SearchCover.flow), "farewell": AnyView(SearchCover.farewell),
        "money": AnyView(SearchCover.money), "light": AnyView(SearchCover.light),
        "trend": AnyView(SearchCover.trend),
    ]

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
                        .contentShape(Rectangle())
                        .onTapGesture { model?.closeSheet() }
                }
                .padding(EdgeInsets(top: 15, leading: 24, bottom: 14, trailing: 24))
                VStack(alignment: .leading, spacing: 11) {
                    HStack(spacing: 10) {
                        RTIcon(["M20 20l-3.6-3.6"], size: 18, stroke: RT.muted, lineWidth: 2)
                            .overlay(Circle().stroke(RT.muted, lineWidth: 2 * 18 / 24)
                                .frame(width: 14 * 18 / 24, height: 14 * 18 / 24).offset(x: -18 / 24, y: -18 / 24))
                        if let model, model.searchProvider != nil {
                            // 라이브 검색 (rtapp — 알라딘 프록시)
                            TextField("책 · 저자 검색", text: Binding(
                                get: { model.searchQuery },
                                set: { model.searchQuery = $0 }))
                                .textFieldStyle(.plain)
                                .font(.sans(15, 500)).foregroundColor(RT.ink)
                                .onSubmit { Task { await model.search(model.searchQuery) } }
                        } else {
                            Text("몰입").font(.sans(15, 500)).foregroundColor(RT.ink)
                            Rectangle().fill(RT.green).frame(width: 2, height: 19)
                                .rtBlink(duration: 1.1)
                            Spacer()
                        }
                    }
                    .padding(.horizontal, 15)
                    .frame(height: 50)
                    .background(RT.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(RT.green, lineWidth: 1.5))
                    .shadow(color: Color(hex: 0x16140F, alpha: 0.05), radius: 3, x: 0, y: 2)
                    Text("검색 결과 · \(results.map { "\($0.count)" } ?? "32")건")
                        .font(.mono(10.5, 500)).tracking(10.5 * 0.06)
                        .foregroundColor(RT.faint)
                }
                .padding(EdgeInsets(top: 0, leading: 24, bottom: 12, trailing: 24))
                Group {
                    if let results {
                        ScrollView(showsIndicators: false) {
                            VStack(spacing: 0) {
                                ForEach(results, id: \.isbn) { hit in
                                    row(cover: AnyView(liveCover(hit)),
                                        title: hit.title, meta: "\(hit.author) · \(hit.publisher)",
                                        added: added.contains(hit.isbn),
                                        toggle: { model?.toggleAdd(hit.isbn) })
                                }
                            }
                        }
                    } else {
                        VStack(spacing: 0) {
                            ForEach(Array(Self.searchRows.enumerated()), id: \.offset) { _, r in
                                row(cover: Self.searchCovers[r.key] ?? AnyView(EmptyView()),
                                    title: r.title, meta: r.meta,
                                    added: added.contains(r.key),
                                    toggle: { model?.toggleAdd(r.key) })
                            }
                        }
                    }
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

    // 라이브 검색 표지 — 알라딘 커버 URL (실패 시 크라프트 그라데이션)
    func liveCover(_ hit: RTBookHit) -> some View {
        AsyncImage(url: URL(string: hit.coverUrl)) { image in
            image.resizable().aspectRatio(contentMode: .fill)
        } placeholder: {
            RT.kraftGrad(CGSize(width: 46, height: 64))
        }
        .frame(width: 46, height: 64)
        .clipped()
    }

    func row(cover: AnyView, title: String, meta: String, added: Bool, toggle: @escaping () -> Void = {}) -> some View {
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
            Group {
                if added {
                    Circle().fill(RT.green)
                        .frame(width: 32, height: 32)
                        .overlay(RTIcon(RTIconPath.check, size: 15, stroke: RT.ctaText, lineWidth: 2.8))
                        .shadow(color: Color(hex: 0x26413A, alpha: 0.5), radius: 4.5, x: 0, y: 4)
                        .rtPop(duration: 0.4)   // v5Pop 추가됨 ✓
                } else {
                    Circle().fill(RT.segBg)
                        .frame(width: 32, height: 32)
                        .overlay(RTIcon(RTIconPath.plus, size: 15, stroke: RT.muted, lineWidth: 2.6))
                }
            }
            .contentShape(Circle())
            .onTapGesture { toggle() }
        }
        .padding(EdgeInsets(top: 11, leading: 8, bottom: 11, trailing: 8))
        .background(RoundedRectangle(cornerRadius: 13).fill(added ? RT.greenTint : Color.clear))
    }
}

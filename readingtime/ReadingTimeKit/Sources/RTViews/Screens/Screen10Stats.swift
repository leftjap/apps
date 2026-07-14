import SwiftUI

// 10 기록 · 주간 — 정본: 작업지시서 §3 + mockups/RTRecord.dc.html.
// 데모(model 없음/userData nil) = 시안 §12 데이터로 1:1 재현. userData 주입 시 실데이터.
public struct Screen10Stats: View {
    struct Live {
        let range: String
        let hours: Int
        let mins: Int
        let deltaMin: Int
        let week: [(d: String, date: String, v: Int, today: Bool, sun: Bool)]
        let maxMin: Int
        let popRows: [(name: String, min: Int, dot: Color)]
        let streak: Int
        let streakDays: [Bool]        // 최근 14일 (과거→오늘)
        let peak: (label: String, frac: CGFloat, width: CGFloat)?
        let ranks: [(isbn: String, title: String, coverUrl: String, tag: String?, fill: CGFloat, color: Color, value: String)]
    }

    static let palette: [Color] = [Color(hex: 0xD8C184), Color(hex: 0x3D5575), Color(hex: 0xE4572E)]

    var model: RTAppModel?
    private let sel: Int
    private let live: Live?

    public init(model: RTAppModel? = nil) {
        self.model = model
        let sel = min(max(model?.weekSel ?? 3, 0), 6)
        self.sel = sel
        if model?.statsSubject == .partner {
            if let m = model, let pd = m.partnerData {
                self.live = Self.buildLive(data: pd, now: m.now(), sel: sel)
            } else {
                self.live = Self.partnerDemoLive
            }
        } else if let m = model, let data = m.userData {
            self.live = Self.buildLive(data: data, now: m.now(), sel: sel, model: m)
        } else {
            self.live = nil
        }
    }

    /// 실데이터 RTUserData → Live. model 이 있으면 내 밀리(전자책)·연속일을 합산 (파트너는 nil).
    static func buildLive(data: RTUserData, now: Date, sel: Int, model: RTAppModel? = nil) -> Live {
        var cal = Calendar(identifier: .gregorian); cal.firstWeekday = 2   // 월요일 시작
        let labels = ["월", "화", "수", "목", "금", "토", "일"]
        func md(_ d: Date) -> String { "\(cal.component(.month, from: d)).\(cal.component(.day, from: d))" }
        func ebook(_ d: Date) -> Int { model?.ebookSeconds(on: d) ?? 0 }
        func weekTotal(_ offset: Int) -> Int {
            guard let base = cal.date(byAdding: .weekOfYear, value: offset, to: now),
                  let wk = cal.dateInterval(of: .weekOfYear, for: base) else { return 0 }
            let paper = data.sessions.filter { wk.contains($0.endedAt) }.reduce(0) { $0 + $1.seconds }
            return paper + (0..<7).reduce(0) { s, i in
                s + (cal.date(byAdding: .day, value: i, to: wk.start).map(ebook) ?? 0)
            }
        }
        let start = cal.dateInterval(of: .weekOfYear, for: now)?.start ?? now
        var perSec = [Int](repeating: 0, count: 7)
        if let wk = cal.dateInterval(of: .weekOfYear, for: now) {
            for s in data.sessions where wk.contains(s.endedAt) {
                let i = cal.dateComponents([.day], from: wk.start, to: cal.startOfDay(for: s.endedAt)).day ?? 0
                if (0..<7).contains(i) { perSec[i] += s.seconds }
            }
        }
        for i in 0..<7 {
            if let d = cal.date(byAdding: .day, value: i, to: start) { perSec[i] += ebook(d) }
        }
        let mins = perSec.map { $0 / 60 }
        let today = min(6, max(0, cal.dateComponents([.day], from: start, to: cal.startOfDay(for: now)).day ?? 0))
        let week = (0..<7).map { i -> (String, String, Int, Bool, Bool) in
            let date = cal.date(byAdding: .day, value: i, to: start)!
            return (labels[i], md(date), mins[i], i == today, i == 6)
        }
        let titles = Dictionary(uniqueKeysWithValues: data.books.map { ($0.isbn, $0.title) })
        let covers = Dictionary(uniqueKeysWithValues: data.books.map { ($0.isbn, $0.coverUrl) })

        // 선택일 책별 분해 (상위 2) + 밀리 귀속
        let selDate = cal.date(byAdding: .day, value: sel, to: start)!
        var perBook: [String: Int] = [:]
        for s in data.sessions where cal.isDate(s.endedAt, inSameDayAs: selDate) {
            perBook[s.isbn.flatMap { titles[$0] } ?? "기록", default: 0] += s.seconds
        }
        var popRows = perBook.sorted { $0.value > $1.value }.prefix(2).enumerated()
            .map { (i, kv) in (name: kv.key, min: kv.value / 60, dot: palette[i % palette.count]) }
        for e in model?.ebookBreakdown(on: selDate) ?? [] {
            popRows.append((name: e.title, min: e.seconds / 60, dot: RT.amber))
        }

        // 최근 14일 스트릭 도트
        var dayset = Set(data.sessions.map { cal.startOfDay(for: $0.endedAt) })
        let streakDays = (0..<14).map { i -> Bool in
            let d = cal.date(byAdding: .day, value: i - 13, to: cal.startOfDay(for: now))!
            if ebook(d) > 0 { dayset.insert(d) }
            return dayset.contains(d)
        }
        var streak = model?.streakDays ?? 0
        if model == nil {
            var cursor = cal.startOfDay(for: now)
            if !dayset.contains(cursor) { cursor = cal.date(byAdding: .day, value: -1, to: cursor)! }
            while dayset.contains(cursor) { streak += 1; cursor = cal.date(byAdding: .day, value: -1, to: cursor)! }
        }

        // 시간대 peak
        var hourHist = [Int](repeating: 0, count: 24)
        for s in data.sessions { hourHist[cal.component(.hour, from: s.endedAt)] += s.seconds }
        var peak: (label: String, frac: CGFloat, width: CGFloat)?
        if let top = hourHist.enumerated().max(by: { $0.element < $1.element }), top.element > 0 {
            let names = ["새벽", "새벽", "새벽", "새벽", "새벽", "새벽", "아침", "아침", "아침", "아침", "아침",
                         "낮", "낮", "낮", "낮", "낮", "낮", "저녁", "저녁", "저녁", "저녁", "밤", "밤", "밤"]
            func h12(_ h: Int) -> Int { let v = h % 12; return v == 0 ? 12 : v }
            let h0 = top.offset
            peak = ("주로 \(names[h0]) \(h12(h0))–\(h12(min(23, h0 + 2)))시", CGFloat(h0) / 24, max(0.1, 2.0 / 24))
        }

        // 이번 주 많이 읽은 책 (상위 3) — 종이 + 밀리
        var weekBook: [String: Int] = [:]
        if let wk = cal.dateInterval(of: .weekOfYear, for: now) {
            for s in data.sessions where wk.contains(s.endedAt) {
                if let isbn = s.isbn { weekBook[isbn, default: 0] += s.seconds }
            }
        }
        var ebookWeek: [String: Int] = [:]
        for i in 0..<7 {
            for e in model?.ebookBreakdown(on: cal.date(byAdding: .day, value: i, to: start)!) ?? [] {
                ebookWeek[e.title, default: 0] += e.seconds
            }
        }
        let maxBook = max(weekBook.values.max() ?? 0, ebookWeek.values.max() ?? 0)
        var ranks = weekBook.sorted { $0.value > $1.value }.enumerated()
            .map { (i, kv) in (isbn: kv.key, title: titles[kv.key] ?? "기록", coverUrl: covers[kv.key] ?? "",
                               tag: nil as String?,
                               fill: maxBook > 0 ? CGFloat(kv.value) / CGFloat(maxBook) : 0,
                               color: palette[i % palette.count],
                               value: RTAppModel.hmString(kv.value)) }
        for (t, sec) in ebookWeek where sec > 0 {
            ranks.append((isbn: "", title: t, coverUrl: model?.ebookCovers[t] ?? "", tag: "밀리",
                          fill: maxBook > 0 ? CGFloat(sec) / CGFloat(maxBook) : 0,
                          color: RT.amber, value: RTAppModel.hmString(sec)))
        }
        ranks.sort { $0.fill > $1.fill }
        ranks = Array(ranks.prefix(3))

        let total = weekTotal(0)
        let end = cal.date(byAdding: .day, value: 6, to: start)!
        return Live(range: "\(md(start)) – \(md(end))",
                    hours: total / 3600, mins: total / 60 % 60,
                    deltaMin: (total - weekTotal(-1)) / 60,
                    week: week, maxMin: max(1, mins.max() ?? 1), popRows: popRows,
                    streak: streak, streakDays: streakDays, peak: peak, ranks: ranks)
    }

    // 파트너 데모 통계 (주간 합 408 = 6:48)
    static let partnerDemoLive = Live(
        range: "5.19 – 5.25", hours: 6, mins: 48, deltaMin: 36,
        week: [("월", "5.19", 64, false, false), ("화", "5.20", 78, false, false),
               ("수", "5.21", 40, false, false), ("목", "5.22", 24, true, false),
               ("금", "5.23", 70, false, false), ("토", "5.24", 48, false, false),
               ("일", "5.25", 84, false, true)],
        maxMin: 84,
        popRows: [(name: "작별하지 않는다", min: 24, dot: palette[0])],
        streak: 9, streakDays: Array(repeating: true, count: 14),
        peak: (label: "주로 아침 7–9시", frac: 7.0 / 24, width: 2.0 / 24),
        ranks: [(isbn: "", title: "작별하지 않는다", coverUrl: "", tag: nil, fill: 1.0, color: palette[0], value: "4:20"),
                (isbn: "", title: "아몬드", coverUrl: "", tag: nil, fill: 0.365, color: palette[1], value: "1:35"),
                (isbn: "", title: "달러구트 꿈 백화점", coverUrl: "", tag: nil, fill: 0.204, color: palette[2], value: "0:53")])

    // ── 파생 (데모 = §12) ──
    private var range: String { live?.range ?? RTRecordDemo.weekRange }
    private var hours: Int { live?.hours ?? 7 }
    private var mins: Int { live?.mins ?? 26 }
    private var deltaMin: Int { live?.deltaMin ?? RTRecordDemo.weekDeltaMin }

    private struct Bar {
        let lbl: String, min: Int, h: CGFloat
        let today: Bool, sun: Bool, selected: Bool
    }
    private var bars: [Bar] {
        if let live {
            return live.week.enumerated().map { i, d in
                Bar(lbl: d.d,
                    min: d.v,
                    h: CGFloat((12 + Double(d.v) / Double(live.maxMin) * 72).rounded()),
                    today: d.today, sun: d.sun, selected: i == sel)
            }
        }
        return RTRecordDemo.week.enumerated().map { i, d in
            Bar(lbl: d.lbl, min: d.min, h: RTRecord.weekBarH(d.min),
                today: d.today, sun: d.sun, selected: i == sel)
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            RTScrollArea { content }
            StatsHeader(active: .week, model: model)
        }
        .frame(width: 390, height: 844)
    }

    var content: some View {
        VStack(alignment: .leading, spacing: 0) {
                Text(range).font(.mono(10.5, 500)).tracking(10.5 * 0.1)
                    .foregroundColor(RT.faint)
                    .rtLB(RTLB.m10_5)
                headline.padding(.top, 7)
                delta.padding(.top, 7)
                chartCard.padding(.top, 14)
                RTDuoRow(streak: live?.streak ?? RTRecordDemo.streak, dots: streakDots,
                         peakLabel: peakLabel, dim: peakDim, peak: peakSeg)
                    .padding(.top, 14)
                if live == nil || !(live!.ranks.isEmpty) {
                    Text("이번 주 많이 읽은 책").font(.sans(14, 800)).foregroundColor(RT.ink)
                        .rtLB(RTLB.n14)
                        .padding(EdgeInsets(top: 15, leading: 2, bottom: 8, trailing: 2))
                }
                ranksView
        }
    }

    // "이번 주 7시간 26분" (숫자만 mono) — line-height 1.2
    var headline: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("이번 주 ").font(.sans(26, 900)).tracking(26 * -0.04)
            Text("\(hours)").font(.mono(26, 900)).tracking(26 * -0.04)
            Text("시간 ").font(.sans(26, 900)).tracking(26 * -0.04)
            Text("\(mins)").font(.mono(26, 900)).tracking(26 * -0.04)
            Text("분").font(.sans(26, 900)).tracking(26 * -0.04)
        }
        .foregroundColor(RT.ink)
        .frame(height: RTLB.n26)
    }

    var delta: some View {
        let d = deltaMin
        let up = d >= 0
        return HStack(spacing: 7) {
            HStack(spacing: 4) {
                RTIcon([up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"], size: 10,
                       stroke: up ? RT.green : RT.terra, lineWidth: 3)
                Text("\(abs(d))분").font(.sans(11.5, 700)).foregroundColor(up ? RT.green : RT.terra)
                    .rtLB(RTLB.n11_5)
            }
            .padding(EdgeInsets(top: 4, leading: 10, bottom: 4, trailing: 10))
            .background(Capsule().fill(up ? RT.greenTint : RT.amberTint))
            Text("vs 지난주").font(.mono(10.5, 500)).foregroundColor(RT.faint).rtLB(RTLB.m10_5)
        }
        .frame(height: 25)
    }

    // 막대 차트 카드 — 내부 padding-top:84(팝오버 공간) + 막대 행 120
    var chartCard: some View {
        ZStack(alignment: .top) {
            barRow.padding(.top, 84)
            if live == nil || bars[sel].min > 0 { popover }
        }
        .frame(height: 204)
        .rtRecCard(20, EdgeInsets(top: 16, leading: 15, bottom: 12, trailing: 15), shadow: true)
    }

    // 팝오버 — left = (day+0.5)/7 (막대 중심), 카드는 차트 폭(314) 안으로 클램프
    static let chartW: CGFloat = 314   // 346 - 2(border) - 30(padding)

    var popover: some View {
        let center = (CGFloat(sel) + 0.5) / 7 * Self.chartW
        let rows: [(dot: Color, title: String, min: Int)] = live.map { l in
            l.popRows.map { (dot: $0.dot, title: $0.name, min: max(1, $0.min)) }
        } ?? RTRecord.weekTip(day: sel).rows.map { (dot: Color(hex: $0.dot), title: $0.title, min: $0.min) }
        let date = live.map { "\($0.week[sel].date) \($0.week[sel].d) · \($0.week[sel].v)분" }
            ?? RTRecord.weekTip(day: sel).date
        let half: CGFloat = live == nil ? 75 : 120
        let shift = max(0, half - center) - max(0, center + half - Self.chartW)

        return VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text(date).font(.mono(9.5, 600)).tracking(9.5 * 0.06)
                    .foregroundColor(Color(hex: 0x8F897B))
                    .rtLB(RTLB.m9_5)
                ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                    tipRow(dot: r.dot, name: r.title, min: "\(r.min)분")
                        .padding(.top, 7)
                }
            }
            .padding(EdgeInsets(top: 9, leading: 12, bottom: 9, trailing: 12))
            .frame(minWidth: 150, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 13).fill(RT.ink))
            .rtBoxShadow(RoundedRectangle(cornerRadius: 13), color: Color(hex: 0x16140F, alpha: 0.55),
                         blur: 26, y: 12, spread: -12)
            Rectangle().fill(RT.ink).frame(width: 2, height: 10)
        }
        .fixedSize()
        .offset(x: center + shift - Self.chartW / 2)
        .rtTipPop()
    }

    func tipRow(dot: Color, name: String, min: String) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2).fill(dot).frame(width: 7, height: 7)
            Text(name).font(.sans(11, 600)).foregroundColor(RT.ctaText)
                .lineLimit(1)
                .frame(maxWidth: 155, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 14)
            Text(min).font(.mono(11, 600)).foregroundColor(RT.faint)
        }
        .frame(height: 16)
    }

    // 막대 행 — height 120, gap 8. 값/막대/요일 색은 §3-4 상태표 그대로.
    var barRow: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(Array(bars.enumerated()), id: \.offset) { i, d in
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Text("\(d.min)")
                        .font(.mono(9, d.today || d.selected ? 700 : 500))
                        .foregroundColor(d.today ? RT.green : (d.selected ? RT.muted : RT.ghost))
                        .rtLB(RTLB.m9)
                    Group {
                        if d.selected {
                            RoundedRectangle(cornerRadius: 7)
                                .fill(LinearGradient.css(180, size: CGSize(width: 26, height: d.h),
                                                         [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)]))
                                .rtRing(7, Color(hex: 0x2C4A3C, alpha: 0.22), width: 2.5)
                        } else {
                            RoundedRectangle(cornerRadius: 7)
                                .fill(Color(hex: d.today ? 0xC9BE9C : 0xD6CBA9))
                        }
                    }
                    .frame(maxWidth: 26)
                    .frame(height: d.h)
                    .rtStack(delay: Double(i) * 0.06)
                    .padding(.top, 5)
                    Text(d.lbl).font(.mono(9.5, d.today ? 700 : 500))
                        .foregroundColor(d.today ? RT.ink : (d.sun ? RT.terra : RT.faint))
                        .rtLB(RTLB.m9_5)
                        .padding(.top, 5)
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .onTapGesture { model?.selectWeek(i) }
            }
        }
        .frame(height: 120)
    }

    var streakDots: [(color: Color, last: Bool)] {
        if let live {
            return live.streakDays.enumerated().map { i, has in
                (Color(hex: has ? 0xC2553A : 0xEEE7D4), i == 13)
            }
        }
        return RTRecord.streakDots().map { (Color(hex: $0.color), $0.isLast) }
    }
    var peakLabel: String {
        live.map { $0.peak?.label ?? "기록 부족" } ?? RTRecordDemo.peakLabel
    }
    var peakDim: (left: Double, width: Double)? {
        live == nil ? (0.56, 0.18) : nil     // 데모 보조 세그먼트
    }
    var peakSeg: (left: Double, width: Double)? {
        if let live {
            guard let p = live.peak else { return nil }
            return (min(Double(p.frac), 1 - Double(p.width)), Double(p.width))
        }
        return (0.79, 0.15)
    }

    // 이번 주 많이 읽은 책 (상위 3)
    @ViewBuilder var ranksView: some View {
        if let live {
            ForEach(Array(live.ranks.enumerated()), id: \.offset) { _, r in
                RTRankRow(cover: AnyView(RTRemoteCover(url: r.coverUrl, size: .init(width: 30, height: 43),
                                                       radius: 3, title: r.title)),
                          title: r.title, tag: r.tag, pct: r.fill, barColor: r.color, total: r.value,
                          onTap: { if !r.isbn.isEmpty { model?.openBookDetail(isbn: r.isbn) } })
            }
        } else {
            ForEach(Array(RTRecord.weekRanks().enumerated()), id: \.offset) { _, r in
                RTRankRow(cover: AnyView(demoCover(r)), title: r.title, tag: r.tag,
                          pct: CGFloat(r.pct) / 100, barColor: Color(hex: r.dot), total: r.total)
            }
        }
    }

    func demoCover(_ r: RTRecord.Rank) -> some View {
        RTFillCover(fill: r.fill, tc: r.tc, title: r.title,
                    size: CGSize(width: 30, height: 43), radius: 3,
                    spine: 2, spineAlpha: 0.16, fontSize: 7.5, lineHeight: 7.875,
                    pad: 2, topOffset: 14, wrap: true)
    }
}

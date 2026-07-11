import SwiftUI

// v8 10 기록 · 주간 — 스펙: frames/10.html. userData 주입 시 실데이터 (init 스냅샷).
public struct Screen10Stats: View {
    struct Live {
        let range: String
        let hours: Int
        let mins: Int
        let deltaMin: Int
        let week: [(d: String, date: String, v: Int, h: CGFloat, today: Bool, sun: Bool)]
        let popRows: [(name: String, min: Int, dot: Color)]
        let streak: Int
        let streakDays: [Bool]        // 최근 14일 (과거→오늘)
        let peak: (label: String, frac: CGFloat, width: CGFloat)?
        let ranks: [(title: String, coverUrl: String, fill: CGFloat, color: Color, value: String)]
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
            // 파트너 통계 — 시안 데모값(README). 백엔드 partnerData 배선 후 실계산으로 교체.
            self.live = Self.partnerDemoLive
        } else if let m = model, let data = m.userData {
            let cal = Calendar(identifier: .gregorian)
            let labels = ["월", "화", "수", "목", "금", "토", "일"]
            let mins = m.weekDayMinutes
            let maxV = mins.max() ?? 0
            let today = m.weekTodayIndex
            let start = m.weekStart
            func md(_ d: Date) -> String { "\(cal.component(.month, from: d)).\(cal.component(.day, from: d))" }
            let week = (0..<7).map { i -> (String, String, Int, CGFloat, Bool, Bool) in
                let date = cal.date(byAdding: .day, value: i, to: start)!
                let h: CGFloat = maxV > 0 && mins[i] > 0 ? max(4, CGFloat(mins[i]) / CGFloat(maxV) * 84) : 2
                return (labels[i], md(date), mins[i], h, i == today, i == 6)
            }
            // 선택일 책별 분해 (상위 2)
            let selDate = cal.date(byAdding: .day, value: sel, to: start)!
            let titles = Dictionary(uniqueKeysWithValues: data.books.map { ($0.isbn, $0.title) })
            var perBook: [String: Int] = [:]
            for s in data.sessions where cal.isDate(s.endedAt, inSameDayAs: selDate) {
                perBook[s.isbn.flatMap { titles[$0] } ?? "기록", default: 0] += s.seconds
            }
            let popRows = perBook.sorted { $0.value > $1.value }.prefix(2).enumerated()
                .map { (i, kv) in (name: kv.key, min: kv.value / 60, dot: Self.palette[i % Self.palette.count]) }
            // 최근 14일 스트릭 도트
            let dayset = Set(data.sessions.map { cal.startOfDay(for: $0.endedAt) })
            let streakDays = (0..<14).map { i -> Bool in
                let d = cal.date(byAdding: .day, value: i - 13, to: cal.startOfDay(for: m.now()))!
                return dayset.contains(d)
            }
            // 주 시간대 (최다 시각 2시간 창)
            var hourHist = [Int](repeating: 0, count: 24)
            for s in data.sessions { hourHist[cal.component(.hour, from: s.endedAt)] += s.seconds }
            var peak: (String, CGFloat, CGFloat)?
            if let top = hourHist.enumerated().max(by: { $0.element < $1.element }), top.element > 0 {
                let h0 = top.offset
                let names = ["새벽", "새벽", "새벽", "새벽", "새벽", "새벽", "아침", "아침", "아침", "아침", "아침",
                             "낮", "낮", "낮", "낮", "낮", "낮", "저녁", "저녁", "저녁", "저녁", "밤", "밤", "밤"]
                func h12(_ h: Int) -> Int { let v = h % 12; return v == 0 ? 12 : v }
                let label = "주로 \(names[h0]) \(h12(h0))–\(h12(min(23, h0 + 2)))시"
                peak = (label, CGFloat(h0) / 24, max(0.1, 2.0 / 24))
            }
            // 이번 주 많이 읽은 책 (상위 3)
            var weekBook: [String: Int] = [:]
            if let wk = cal.dateInterval(of: .weekOfYear, for: m.now()) {
                for s in data.sessions where wk.contains(s.endedAt) {
                    if let isbn = s.isbn { weekBook[isbn, default: 0] += s.seconds }
                }
            }
            let covers = Dictionary(uniqueKeysWithValues: data.books.map { ($0.isbn, $0.coverUrl) })
            let maxBook = weekBook.values.max() ?? 0
            let ranks = weekBook.sorted { $0.value > $1.value }.prefix(3).enumerated()
                .map { (i, kv) in (title: titles[kv.key] ?? "기록", coverUrl: covers[kv.key] ?? "",
                                   fill: maxBook > 0 ? CGFloat(kv.value) / CGFloat(maxBook) : 0,
                                   color: Self.palette[i % Self.palette.count],
                                   value: RTAppModel.hmString(kv.value)) }
            let total = m.weekSeconds
            let end = cal.date(byAdding: .day, value: 6, to: start)!
            self.live = Live(range: "\(md(start)) – \(md(end))",
                             hours: total / 3600, mins: total / 60 % 60,
                             deltaMin: (total - m.weekSeconds(offset: -1)) / 60,
                             week: week, popRows: popRows,
                             streak: m.streakDays, streakDays: streakDays,
                             peak: peak, ranks: ranks)
        } else {
            self.live = nil
        }
    }

    // 파트너 데모 통계 (README §② 데모값, 합계 내적 정합: 주간 합 408 = 6:48)
    static let partnerDemoLive = Live(
        range: "5.19 – 5.25", hours: 6, mins: 48, deltaMin: 36,
        week: [("월", "5.19", 64, 64, false, false), ("화", "5.20", 78, 78, false, false),
               ("수", "5.21", 40, 40, false, false), ("목", "5.22", 24, 24, true, false),
               ("금", "5.23", 70, 70, false, false), ("토", "5.24", 48, 48, false, false),
               ("일", "5.25", 84, 84, false, true)],
        popRows: [(name: "작별하지 않는다", min: 24, dot: palette[0])],
        streak: 9, streakDays: Array(repeating: true, count: 14),
        peak: (label: "주로 아침 7–9시", frac: 7.0 / 24, width: 2.0 / 24),
        ranks: [(title: "작별하지 않는다", coverUrl: "", fill: 1.0, color: palette[0], value: "4:20"),
                (title: "아몬드", coverUrl: "", fill: 0.365, color: palette[1], value: "1:35"),
                (title: "달러구트 꿈 백화점", coverUrl: "", fill: 0.204, color: palette[2], value: "0:53")])

    static let week: [(d: String, date: String, v: Int, h: CGFloat, today: Bool, sun: Bool)] = [
        ("월", "5.18", 38, 47, false, false), ("화", "5.19", 52, 64, false, false),
        ("수", "5.20", 30, 37, false, false), ("목", "5.21", 68, 84, true, false),
        ("금", "5.22", 44, 54, false, false), ("토", "5.23", 21, 26, false, false),
        ("일", "5.24", 55, 68, false, true),
    ]

    var week: [(d: String, date: String, v: Int, h: CGFloat, today: Bool, sun: Bool)] {
        live?.week ?? Self.week
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            VStack(alignment: .leading, spacing: 0) {
                Text(live?.range ?? "5.15 – 5.21").font(.mono(10.5, 500)).tracking(10.5 * 0.1)
                    .foregroundColor(RT.faint)
                headline.padding(.top, 7)
                delta.padding(.top, 7)
                chartCard.padding(.top, 14)
                if live == nil { millie.padding(.top, 11) }   // 밀리 연동 전 — 라이브에선 숨김
                duo.padding(.top, 11)
                if live == nil || !(live!.ranks.isEmpty) {
                    Text("이번 주 많이 읽은 책").font(.sans(14, 800)).foregroundColor(RT.ink)
                        .padding(EdgeInsets(top: 15, leading: 2, bottom: 8, trailing: 2))
                }
                if let live {
                    ForEach(Array(live.ranks.enumerated()), id: \.offset) { _, r in
                        rankRow(cover: AnyView(RTRemoteCover(url: r.coverUrl, size: .init(width: 30, height: 43), radius: 3)),
                                title: r.title, tag: nil, fill: r.fill, color: r.color, value: r.value)
                    }
                } else {
                    rankRow(cover: AnyView(rankFlow), title: "몰입", tag: nil, fill: 1.0, color: Color(hex: 0xD8C184), value: "4:12")
                    rankRow(cover: AnyView(rankMoney), title: "돈의 심리학", tag: nil, fill: 0.42, color: Color(hex: 0x1F2D45), value: "1:36")
                    rankRow(cover: AnyView(rankFocus), title: "도둑맞은 집중력", tag: "밀리", fill: 0.33, color: Color(hex: 0xE4572E), value: "1:38")
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 22)
            .padding(.top, 102)
            StatsHeader(active: .week, model: model)
        }
        .frame(width: 390, height: 844)
    }

    var headline: some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("이번 주 ").font(.sans(26, 900)).tracking(26 * -0.04)
            Text("\(live?.hours ?? 7)").font(.mono(26, 900)).tracking(26 * -0.04)
            Text("시간 ").font(.sans(26, 900)).tracking(26 * -0.04)
            Text("\(live?.mins ?? 26)").font(.mono(26, 900)).tracking(26 * -0.04)
            Text("분").font(.sans(26, 900)).tracking(26 * -0.04)
        }
        .foregroundColor(RT.ink)
    }

    var delta: some View {
        let d = live?.deltaMin ?? 52
        let up = d >= 0
        return HStack(spacing: 7) {
            HStack(spacing: 4) {
                RTIcon([up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"], size: 10,
                       stroke: up ? RT.green : RT.terra, lineWidth: 3)
                Text("\(abs(d))분").font(.sans(11.5, 700)).foregroundColor(up ? RT.green : RT.terra)
            }
            .padding(EdgeInsets(top: 4, leading: 10, bottom: 4, trailing: 10))
            .background(Capsule().fill(up ? RT.greenTint : RT.amberTint))
            Text("vs 지난주").font(.mono(10.5, 500)).foregroundColor(RT.faint)
        }
    }

    var chartCard: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topLeading) {
                bars.padding(.top, 82)
                if live == nil || week[sel].v > 0 { popover }
            }
        }
        .padding(EdgeInsets(top: 16, leading: 15, bottom: 12, trailing: 15))
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(RT.hair, lineWidth: 1))
        .shadow(color: Color(hex: 0x16140F, alpha: 0.03), radius: 1, x: 0, y: 1)
    }

    var popover: some View {
        GeometryReader { geo in
            // app.js weekPopover: left=(sel+.5)/7, 카드만 차트 안으로 클램프(커넥터는 바 중심 유지)
            let w = week[sel]
            let flow = Int((Double(w.v) * 0.68).rounded())
            let center = (CGFloat(sel) + 0.5) / 7 * geo.size.width
            // 데모 min-width 150 의 절반 = 75. 라이브는 실제 제목 폭(≤155)까지 카드가 넓어져 120 로 클램프
            let half: CGFloat = live == nil ? 75 : 120
            let shift = max(0, half - center) - max(0, center + half - geo.size.width)
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(w.date) \(w.d) · \(w.v)분").font(.mono(9.5, 600)).tracking(9.5 * 0.06)
                        .foregroundColor(Color(hex: 0x8F897B))
                    if let live {
                        ForEach(Array(live.popRows.enumerated()), id: \.offset) { i, r in
                            tipRow(dot: r.dot, name: r.name, min: "\(max(1, r.min))분")
                                .padding(.top, i == 0 ? 8 : 5)
                        }
                    } else {
                        tipRow(dot: Color(hex: 0xD8C184), name: "몰입", min: "\(flow)분").padding(.top, 8)
                        tipRow(dot: Color(hex: 0x3D5575), name: "돈의 심리학", min: "\(w.v - flow)분").padding(.top, 5)
                    }
                }
                .padding(EdgeInsets(top: 9, leading: 12, bottom: 9, trailing: 12))
                .frame(minWidth: 150, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 13).fill(RT.ink))
                .shadow(color: Color(hex: 0x16140F, alpha: 0.55), radius: 13, x: 0, y: 12)
                .offset(x: shift)
                Rectangle().fill(RT.ink).frame(width: 2, height: 10)
            }
            .fixedSize()
            .rtTipPop()
            .position(x: center, y: 41) // 팁 전체 h≈82 의 중심
        }
    }

    func tipRow(dot: Color, name: String, min: String) -> some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2).fill(dot).frame(width: 7, height: 7)
            Text(name).font(.sans(11, 600)).foregroundColor(RT.ctaText)
                .lineLimit(1)
                .frame(maxWidth: 155, alignment: .leading)   // 긴 실제 제목이 분 값을 밀어내지 않게
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 14)
            Text(min).font(.mono(11, 600)).foregroundColor(RT.faint)
        }
    }

    var bars: some View {
        HStack(alignment: .bottom, spacing: 8) {
            ForEach(Array(week.enumerated()), id: \.offset) { i, d in
                VStack(spacing: 5) {
                    Spacer(minLength: 0)
                    Text("\(d.v)").font(.mono(9, d.today ? 700 : 500))
                        .foregroundColor(d.today ? RT.green : RT.ghost)
                    Group {
                        if d.today {
                            RoundedRectangle(cornerRadius: 7)
                                .fill(LinearGradient.css(180, size: CGSize(width: 26, height: d.h),
                                                         [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)]))
                                .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color(hex: 0x2C4A3C, alpha: 0.22), lineWidth: 2.5).padding(-2.5))
                        } else {
                            RoundedRectangle(cornerRadius: 7).fill(Color(hex: 0xD6CBA9))
                        }
                    }
                    .frame(maxWidth: 26)
                    .frame(height: d.h)
                    .rtStack(delay: Double(i) * 0.06)
                    Text(d.d).font(.mono(9.5, d.today ? 700 : 500))
                        .foregroundColor(d.today ? RT.ink : (d.sun ? RT.terra : RT.faint))
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .onTapGesture { model?.selectWeek(i) }
            }
        }
        .frame(height: 118)
    }

    var millie: some View {
        HStack(spacing: 11) {
            ZStack(alignment: .topTrailing) {
                RoundedRectangle(cornerRadius: 9).fill(RT.amberTint)
                    .frame(width: 30, height: 30)
                    .overlay(
                        ZStack {
                            RoundedRectangle(cornerRadius: 2 * 15 / 24)
                                .stroke(RT.amberDeep, lineWidth: 1.8 * 15 / 24)
                                .frame(width: 18 * 15 / 24, height: 12 * 15 / 24)
                                .offset(y: -15 / 24)
                            RTIcon(["M8 21h8M12 17v4"], size: 15, stroke: RT.amberDeep, lineWidth: 1.8)
                        }
                    )
                Circle().fill(RT.surface)
                    .frame(width: 13, height: 13)
                    .overlay(
                        RTIcon(["M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"], size: 11, stroke: RT.amberDeep, lineWidth: 2.4)
                            .rtSpin(duration: 5)
                    )
                    .offset(x: 4, y: -4)
            }
            HStack(spacing: 8) {
                Text("밀리의서재").font(.sans(13, 800)).foregroundColor(RT.ink)
                Text("오늘 07:00 동기화").font(.mono(10, 500)).foregroundColor(RT.faint)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text("PC 1:12 · 모바일 0:26").font(.mono(11, 600)).foregroundColor(RT.muted)
        }
        .padding(EdgeInsets(top: 12, leading: 15, bottom: 12, trailing: 15))
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
    }

    var duo: some View {
        HStack(spacing: 11) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text("\(live?.streak ?? 12)").font(.mono(21, 700)).tracking(21 * -0.03).foregroundColor(RT.terra)
                    Text("일 연속").font(.sans(11.5, 600)).foregroundColor(RT.muted)
                }
                HStack(spacing: 4) {
                    if let live {
                        ForEach(Array(live.streakDays.dropLast().enumerated()), id: \.offset) { _, has in
                            Circle().fill(has ? RT.terra : Color(hex: 0xEEE7D4)).frame(width: 7, height: 7)
                        }
                        Circle().fill(live.streakDays.last == true ? RT.terra : Color(hex: 0xEEE7D4))
                            .frame(width: 7, height: 7)
                            .overlay(Circle().stroke(Color(hex: 0xC2553A, alpha: 0.25), lineWidth: 2.5).padding(-2.5))
                    } else {
                        ForEach(Array(["EEE7D4", "EEE7D4", "DD9C8B", "DD9C8B", "D67D63", "D67D63", "D67D63", "CD6647", "CD6647", "CD6647", "C2553A", "C2553A", "C2553A"].enumerated()), id: \.offset) { _, hexs in
                            Circle().fill(Color(hex: UInt32(hexs, radix: 16)!)).frame(width: 7, height: 7)
                        }
                        Circle().fill(RT.terra).frame(width: 7, height: 7)
                            .overlay(Circle().stroke(Color(hex: 0xC2553A, alpha: 0.25), lineWidth: 2.5).padding(-2.5))
                    }
                }
                .padding(.top, 10)
            }
            .padding(EdgeInsets(top: 13, leading: 14, bottom: 13, trailing: 14))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RT.surface)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
            VStack(alignment: .leading, spacing: 0) {
                Text(live.map { $0.peak?.label ?? "기록 부족" } ?? "주로 밤 9–11시")
                    .font(.sans(13, 800)).foregroundColor(RT.ink)
                GeometryReader { geo in
                    ZStack(alignment: .topLeading) {
                        Capsule().fill(Color(hex: 0xECE5D2))
                        if let live {
                            if let p = live.peak {
                                Capsule().fill(LinearGradient.css(90, size: CGSize(width: geo.size.width * p.width, height: 8),
                                                                  [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)]))
                                    .frame(width: geo.size.width * p.width)
                                    .offset(x: geo.size.width * min(p.frac, 1 - p.width))
                            }
                        } else {
                            Capsule().fill(Color(hex: 0xC8B98F).opacity(0.55))
                                .frame(width: geo.size.width * 0.18)
                                .offset(x: geo.size.width * 0.56)
                            Capsule().fill(LinearGradient.css(90, size: CGSize(width: geo.size.width * 0.15, height: 8),
                                                              [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)]))
                                .frame(width: geo.size.width * 0.15)
                                .offset(x: geo.size.width * 0.79)
                        }
                    }
                }
                .frame(height: 8)
                .padding(.top, 11)
                HStack {
                    Text("06").font(.mono(9, 400)).foregroundColor(RT.ghost)
                    Spacer()
                    Text("12").font(.mono(9, 400)).foregroundColor(RT.ghost)
                    Spacer()
                    Text("18").font(.mono(9, 400)).foregroundColor(RT.ghost)
                    Spacer()
                    Text("24").font(.mono(9, 400)).foregroundColor(RT.ghost)
                }
                .padding(.top, 7)
            }
            .padding(EdgeInsets(top: 13, leading: 14, bottom: 13, trailing: 14))
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RT.surface)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
        }
    }

    var rankFlow: some View {
        ZStack(alignment: .topLeading) {
            RT.kraftGrad(CGSize(width: 30, height: 43))
            Rectangle().fill(Color.black.opacity(0.16)).frame(width: 2)
            Text("몰입").font(.sans(8, 900)).foregroundColor(Color(hex: 0x241C0D))
                .frame(maxWidth: .infinity).padding(.top, 13)
        }
    }
    var rankMoney: some View {
        ZStack(alignment: .top) {
            Color(hex: 0x1F2D45)
            Circle().fill(RadialGradient(colors: [Color(hex: 0xECD28C), Color(hex: 0xBD8F33)],
                                         center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 5.5))
                .frame(width: 8, height: 8).padding(.top, 8)
        }
    }
    var rankFocus: some View {
        ZStack(alignment: .top) {
            Color(hex: 0xE4572E)
            Ellipse().stroke(Color.white, lineWidth: 2)
                .frame(width: 13, height: 13).rotationEffect(.degrees(-8)).padding(.top, 9)
        }
    }

    func rankRow(cover: AnyView, title: String, tag: String?, fill: CGFloat, color: Color, value: String) -> some View {
        HStack(spacing: 12) {
            cover
                .frame(width: 30, height: 43)
                .clipShape(RoundedRectangle(cornerRadius: 3))
                .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.3), radius: 3.5, x: 0, y: 3)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 4) {
                    Text(title).font(.sans(13, 700)).foregroundColor(RT.ink)
                    if let tag { Text(tag).font(.mono(9, 400)).foregroundColor(RT.faint) }
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color(hex: 0xECE5D2))
                        Capsule().fill(color).frame(width: geo.size.width * fill)
                    }
                }
                .frame(height: 5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(value).font(.mono(12.5, 700)).foregroundColor(RT.ink)
        }
        .padding(EdgeInsets(top: 6, leading: 2, bottom: 6, trailing: 2))
    }
}

// 기록 헤더 (10·11 공용): back + "기록" | [주|월]
struct StatsHeader: View {
    enum Active { case week, month }
    let active: Active
    var model: RTAppModel? = nil

    var body: some View {
        HStack {
            HStack(spacing: 4) {
                RTIcon(RTIconPath.back, size: 17, viewBox: 20, stroke: RT.body, lineWidth: 2.2)
                    .frame(width: 38, height: 38)
                    .contentShape(Rectangle())
                    .onTapGesture { model?.nav(.home) }
                if model?.statsSubject == .partner, let m = model {
                    // 파트너 통계 — 아바타 26pt + "{이름}의 기록"
                    Circle().fill(RT.segBg).frame(width: 26, height: 26)
                        .overlay(RTAvatarFill(initial: m.partnerInitial, photo: m.partnerAvatar,
                                              size: 26, fontSize: 11, initialColor: RT.body))
                        .padding(.trailing, 3)
                    Text("\(m.partnerName)의 기록").font(.sans(17, 800)).foregroundColor(RT.ink)
                } else {
                    Text("기록").font(.sans(17, 800)).foregroundColor(RT.ink)
                }
            }
            Spacer()
            HStack(spacing: 0) {
                seg("주", on: active == .week) { model?.nav(.statsWeek) }
                seg("월", on: active == .month) { model?.nav(.statsMonth) }
            }
            .padding(3)
            .background(Capsule().fill(RT.segBg))
            .padding(.trailing, 4)
        }
        .padding(EdgeInsets(top: 52, leading: 18, bottom: 0, trailing: 18))
    }

    func seg(_ t: String, on: Bool, action: @escaping () -> Void) -> some View {
        Text(t).font(.sans(11.5, on ? 700 : 600))
            .foregroundColor(on ? Color(hex: 0xF6F3EA) : RT.muted)
            .padding(EdgeInsets(top: 5, leading: 14, bottom: 5, trailing: 14))
            .background(Capsule().fill(on ? RT.ink : Color.clear))
            .contentShape(Capsule())
            .onTapGesture { action() }
    }
}

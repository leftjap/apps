import SwiftUI
import GymCore

// 통계 화면 — mocks/stats.html 이식. 3탭(캘린더/종목/부위) GymAppModel 실집계 구동.
public struct StatsScreenView: View {
    public enum Tab: String { case cal, exercise, body }
    @ObservedObject var model: GymAppModel
    @State private var tab: Tab
    @State private var year: Int
    @State private var month: Int
    @State private var detailISO: String? = nil            // 날짜 상세 시트 (§9-1)
    @State private var detailStep: DayDetailSheet.Step = .summary
    var onHome: () -> Void
    var onAdmin: () -> Void
    var embedScroll: Bool   // gymshot(ImageRenderer)는 ScrollView 내부 미렌더 → 스냅샷은 false

    public init(model: GymAppModel, initialTab: Tab = .cal, embedScroll: Bool = true,
                initialDetailISO: String? = nil, initialDetailConfirm: Bool = false,
                onHome: @escaping () -> Void = {}, onAdmin: @escaping () -> Void = {}) {
        self.model = model; _tab = State(initialValue: initialTab); self.embedScroll = embedScroll
        let cal = GymAppModel.kst
        _year = State(initialValue: cal.component(.year, from: model.referenceToday))
        _month = State(initialValue: cal.component(.month, from: model.referenceToday))
        _detailISO = State(initialValue: initialDetailISO)
        _detailStep = State(initialValue: initialDetailConfirm ? .confirm : .summary)
        self.onHome = onHome; self.onAdmin = onAdmin
    }
    // 데모/스냅샷 편의 init.
    public init(initialTab: Tab = .cal, onHome: @escaping () -> Void = {}) {
        self.init(model: GymAppModel(), initialTab: initialTab, onHome: onHome)
    }

    static let vf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()
    static func fmt(_ n: Double) -> String { vf.string(from: NSNumber(value: n)) ?? "\(Int(n))" }

    // 캘린더 셀 — mocks/stats.html `aspect-ratio:1`. 폭 하드코딩 금지: 비율 제약으로 화면 폭 추종.
    // 히트맵 색 — PWA stats.js rgba(193,99,63,a) 리터럴 정합 (crail-base 토큰과 다름, CalendarHeat 주석 참조).
    static func heat(_ alpha: Double) -> Color { Color(hex: 0xC1633F, alpha: alpha) }

    // 색 규율 (stats.js §종목·§부위) — 1위만 크레일, 나머지는 중립 회색. 부위색 팔레트 미사용.
    static let rankGray: [Color] = [Color(hex: 0xC2BBAC), Color(hex: 0xD0CABD),
                                    Color(hex: 0xDDD8CD), Color(hex: 0xE9E5DC)]
    static func rankColor(_ i: Int) -> Color {
        i == 0 ? GY.crailBase : rankGray[min(i - 1, rankGray.count - 1)]
    }
    // 8주 추이 팔레트 (stats.js applyWeeklyTrend — 리터럴)
    static let trendCurrent = Color(hex: 0xC1633F)
    static let trendPast = Color(hex: 0xDFD9CD)
    static let trendZero = Color(hex: 0xE9E5DC)
    static let trendLine = Color(hex: 0xB3AC9E)
    static let trendDot = Color(hex: 0xC4BCAE)

    // --shadow-float (paper.css) 근사 — 3중 레이어.
    func shadowFloat<V: View>(_ v: V) -> some View {
        v.shadow(color: Color(hex: 0x14120E).opacity(0.02), radius: 0, y: 1)
            .shadow(color: Color(hex: 0x14120E).opacity(0.08), radius: 7, y: 6)
            .shadow(color: Color(hex: 0x14120E).opacity(0.18), radius: 24, y: 24)
    }

    public var body: some View {
        VStack(spacing: 0) {
            header
            tabBar
            if embedScroll {
                ScrollView { paneContent }
            } else {
                paneContent   // 스냅샷: ScrollView 우회 (ImageRenderer 미렌더 회피)
            }
        }
        .frame(maxWidth: .infinity).frame(maxHeight: .infinity, alignment: .top).background(GY.shell)
        // 날짜 탭 → 상세 바텀시트, 꾹누르기 → 삭제 확인 (spec §9-1). 슬라이드업 (mock 200ms ease)
        .overlay {
            ZStack(alignment: .bottom) {
                if let iso = detailISO {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle())
                        .onTapGesture { detailISO = nil }
                        .transition(.opacity)
                    DayDetailSheet(iso: iso, entry: model.dayEntry(iso), step: detailStep,
                                   onDelete: { model.deleteSessions(on: iso); detailISO = nil },
                                   onCancel: { detailISO = nil })
                        .transition(.move(edge: .bottom))
                }
            }
            .animation(.easeOut(duration: 0.2), value: detailISO != nil)
        }
    }

    @ViewBuilder var paneContent: some View {
        switch tab {
        case .cal: calendarPane
        case .exercise: exercisePane
        case .body: bodyPane
        }
    }

    var header: some View {
        HStack {
            Text("통계").font(.sans(24, 700)).tracking(-0.48).foregroundStyle(GY.ink1)
            Spacer()
            HStack(spacing: 4) {
                Button(action: onHome) {
                    Text("홈").font(.sans(14, 400)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain).accessibilityIdentifier("stats-home")
                Button(action: onAdmin) {
                    Text("관리").font(.sans(14, 400)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 24).padding(.top, 8)
    }

    var tabBar: some View {
        HStack(spacing: 24) {   // stats.html:75 gap:24px, margin-top:20px, border-bottom --line
            tabItem("캘린더", .cal); tabItem("종목", .exercise); tabItem("부위", .body); Spacer()
        }
        .padding(.horizontal, 24).padding(.top, 20)
        .overlay(alignment: .bottom) { Rectangle().fill(GY.line).frame(height: 1) }
    }
    func tabItem(_ label: String, _ t: Tab) -> some View {
        let on = tab == t
        return Button { tab = t } label: {
            Text(label).font(.sans(15, on ? 600 : 500)).foregroundStyle(on ? GY.ink1 : GY.ink4)
                .padding(.top, 8).padding(.bottom, 12)
                .overlay(alignment: .bottom) { if on { Rectangle().fill(GY.crailBase).frame(height: 2).cornerRadius(1) } }
        }.buttonStyle(.plain).accessibilityIdentifier("stats-tab-\(label)")
    }

    func shiftMonth(_ d: Int) {
        var m = month + d, y = year
        if m < 1 { m = 12; y -= 1 }; if m > 12 { m = 1; y += 1 }
        month = m; year = y
    }

    // 캘린더 pane — 실 월 그리드 + 이번주 볼륨/8주 추이.
    var calendarPane: some View {
        let cal = GymAppModel.kst
        var comps = DateComponents(); comps.year = year; comps.month = month; comps.day = 1
        let first = cal.date(from: comps) ?? Date()
        let weekday = cal.component(.weekday, from: first)   // 1=Sun..7=Sat
        let leadMon = (weekday + 5) % 7                       // Mon=0 기준 선행 빈칸
        let daysInMonth = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        // 볼륨 히트맵 — stats.js applyWorkedToCalendar 정합 (완료 세션만, 0kg 운동일도 worked).
        let vols = GymCalendarHeat.dayVolumes(sessions: model.history, year: year, month: month)
        let heatMax = vols.values.max() ?? 0
        let todayStr = GymAppModel.dayFmt.string(from: model.referenceToday)
        let cells = Array(repeating: 0, count: leadMon) + Array(1...daysInMonth)
        let rows = stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<min($0 + 7, cells.count)]) }

        let trend = model.weeklyVolumes(weeks: 8, from: model.referenceToday)
        let thisVol = trend.last ?? 0
        let lastVol = trend.count >= 2 ? trend[trend.count - 2] : 0
        let delta = lastVol > 0 ? Int(((thisVol - lastVol) / lastVol * 100).rounded()) : 0

        return VStack(spacing: 0) {
            HStack {
                Button { shiftMonth(-1) } label: {
                    Image(systemName: "chevron.left").font(.system(size: 13, weight: .medium)).foregroundStyle(GY.ink3).frame(width: 32, height: 32)
                }.buttonStyle(.plain).accessibilityIdentifier("stats-month-prev")
                Spacer()
                Text("\(String(year)) · \(month)월").font(.mono(15, 600)).tracking(0.3).foregroundStyle(GY.ink1)
                Spacer()
                Button { shiftMonth(1) } label: {
                    Image(systemName: "chevron.right").font(.system(size: 13, weight: .medium)).foregroundStyle(GY.ink3).frame(width: 32, height: 32)
                }.buttonStyle(.plain).accessibilityIdentifier("stats-month-next")
            }
            .padding(.horizontal, 24).padding(.top, 18)

            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    ForEach(["월", "화", "수", "목", "금", "토", "일"], id: \.self) { d in
                        Text(d).font(.sans(11, 500)).foregroundStyle(GY.ink4).frame(maxWidth: .infinity)
                    }
                }.padding(.bottom, 2)
                ForEach(rows.indices, id: \.self) { r in
                    HStack(spacing: 4) {
                        ForEach(rows[r].indices, id: \.self) { c in
                            let day = rows[r][c]
                            let dayStr = String(format: "%04d-%02d-%02d", year, month, day)
                            let isToday = dayStr == todayStr
                            let dayVol = vols[day]
                            let a = dayVol.map { GymCalendarHeat.alpha(dayVol: $0, maxVol: heatMax) }
                            ZStack {
                                if day > 0 {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(a.map { Self.heat($0) } ?? Color.clear)
                                        .overlay(isToday ? RoundedRectangle(cornerRadius: 8).strokeBorder(GY.crailDeep, lineWidth: 1.5) : nil)
                                    Text("\(day)")
                                        .font(.mono(13, a.map { GymCalendarHeat.numberIsBold(alpha: $0) } == true ? 600 : 500))
                                        .foregroundStyle(a.map { GymCalendarHeat.numberIsWhite(alpha: $0) } == true
                                                         ? Color.white : (a != nil ? GY.crailDeep : GY.ink4))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .aspectRatio(1, contentMode: .fit)   // aspect-ratio:1
                            .contentShape(Rectangle())
                            .onTapGesture {
                                guard day > 0 else { return }
                                detailStep = .summary; detailISO = dayStr   // §9-1 날짜 탭 → 상세
                            }
                            .onLongPressGesture(minimumDuration: 0.5) {
                                guard day > 0, vols[day] != nil else { return }
                                detailStep = .confirm; detailISO = dayStr   // §9-1 꾹누르기 → 삭제
                            }
                        }
                        if rows[r].count < 7 {
                            ForEach(0..<(7 - rows[r].count), id: \.self) { _ in
                                Color.clear.frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fit)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 18).padding(.top, 14)

            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("이번 주 볼륨").font(.sans(12, 400)).tracking(0.24).foregroundStyle(GY.ink3)
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            (Text(Self.fmt(thisVol)).font(.mono(26, 600)).tracking(-0.52).foregroundStyle(GY.ink1)
                             + Text("kg").font(.sans(13, 400)).foregroundStyle(GY.ink4))
                            if delta != 0 {
                                // stats.js:115 — 증가/신규 = crail-deep, 감소 = ink-3.
                                Text("\(delta > 0 ? "+" : "")\(delta)%").font(.sans(13, 600))
                                    .foregroundStyle(delta > 0 ? GY.crailDeep : GY.ink3)
                            }
                        }
                    }
                    Spacer()
                    Text("지난 주 \(Self.fmt(lastVol))kg").font(.sans(12, 400)).foregroundStyle(GY.ink4)
                }
                WeeklyTrendChart(trend: trend)
            }
            .padding(.horizontal, 20).padding(.top, 18).padding(.bottom, 22)
            .background(shadowFloat(RoundedRectangle(cornerRadius: GY.rLg).fill(GY.card)))
            .overlay(RoundedRectangle(cornerRadius: GY.rLg).strokeBorder(GY.line, lineWidth: 1))
            .padding(.horizontal, 22).padding(.top, 24).padding(.bottom, 28)
        }
    }

    // 종목 pane — 최근 60일 종목별 세트 빈도.
    var exercisePane: some View {
        let items = model.exerciseFrequency(days: 60, from: model.referenceToday, top: 5)
        let distinct = Set(model.exerciseFrequency(days: 60, from: model.referenceToday, top: 999).map(\.exId)).count
        let maxSets = max(1, items.map(\.sets).max() ?? 1)
        return VStack(alignment: .leading, spacing: 0) {
            Text("자주 한 운동 · 최근 60일").font(.sans(12, 400)).tracking(0.24).foregroundStyle(GY.ink3).padding(.top, 22)
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text("\(distinct)").font(.mono(34, 600)).tracking(-1.02).foregroundStyle(GY.ink1)
                Text("종목").font(.sans(14, 400)).foregroundStyle(GY.ink4)
            }.padding(.top, 6).padding(.bottom, 10)
            if items.isEmpty {
                Text("최근 60일 기록 없음").font(.sans(13, 400)).foregroundStyle(GY.ink4).padding(.vertical, 20)
            }
            ForEach(items.indices, id: \.self) { i in
                let it = items[i]
                // 색 규율 (stats.js:855) — 1위만 crail, 나머지 dot=ink-3 / fill=ink-4.
                let isTop = i == 0
                VStack(spacing: 6) {
                    HStack(spacing: 10) {
                        Circle().fill(isTop ? GY.crailBase : GY.ink3).frame(width: 8, height: 8)
                        Text(model.exerciseName(it.exId)).font(.sans(15, 500))
                            .foregroundStyle(isTop ? GY.crailDeep : GY.ink1).lineLimit(1)
                        Spacer()
                        (Text("\(it.sets)").font(.mono(13, 500)).foregroundStyle(GY.ink3)
                         + Text("세트").font(.sans(11, 400)).foregroundStyle(GY.ink4))
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3).fill(GY.sunken)
                            RoundedRectangle(cornerRadius: 3).fill(isTop ? GY.crailBase : GY.ink4)
                                .frame(width: g.size.width * CGFloat(Double(it.sets) / Double(maxSets)))
                        }
                    }.frame(height: 6)
                }
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) { if i < items.count - 1 { Rectangle().fill(GY.lineSoft).frame(height: 1) } }
            }
        }
        .padding(.horizontal, 24)
    }

    // 부위 pane — 최근 60일 부위 분포 도넛 + 범례.
    var bodyPane: some View {
        let dist = model.partDistribution(days: 60, from: model.referenceToday)
        let total = max(1, dist.reduce(0) { $0 + $1.sets })
        let sessions = model.sessionCount(days: 60, from: model.referenceToday)
        // 색 규율 (stats.js partRankColor) — 1위 crail, 나머지 회색 ramp.
        let parts = dist.enumerated().map { i, d in
            (name: GymExercises.partName(d.part), color: Self.rankColor(i),
             sets: d.sets, pct: Int((Double(d.sets) / Double(total) * 100).rounded()))
        }
        return VStack(spacing: 0) {
            Text("최근 60일 부위 분포").font(.sans(12, 400)).tracking(0.24).foregroundStyle(GY.ink3)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 22)
            ZStack {
                // conic-gradient 는 12시부터 시계방향 — AngularGradient 는 3시 시작이라 -90° 회전.
                Circle().fill(AngularGradient(gradient: Gradient(stops: donutStops(parts.map { ($0.color, $0.sets) }, total: total)), center: .center))
                    .rotationEffect(.degrees(-90))
                Circle().fill(GY.shell).frame(width: 168 - 52, height: 168 - 52)
                VStack(spacing: 1) {
                    Text("\(sessions)").font(.mono(30, 600)).tracking(-0.9).foregroundStyle(GY.ink1)
                    Text("회 운동").font(.sans(11, 500)).foregroundStyle(GY.ink4)
                }
            }
            .frame(width: 168, height: 168).padding(.top, 22).padding(.bottom, 6)
            // 비율 막대 (얇은 stacked, stats.html:151) — margin:14px 4px 0, h8, radius4, bg sunken
            if !parts.isEmpty {
                GeometryReader { g in
                    HStack(spacing: 0) {
                        ForEach(parts.indices, id: \.self) { i in
                            Rectangle().fill(parts[i].color)
                                .frame(width: g.size.width * CGFloat(Double(parts[i].sets) / Double(total)))
                        }
                    }
                }
                .frame(height: 8)
                .background(GY.sunken)
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .padding(.horizontal, 4).padding(.top, 14)
            }
            VStack(spacing: 0) {
                ForEach(parts.indices, id: \.self) { i in
                    let p = parts[i]
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 3).fill(p.color).frame(width: 10, height: 10)
                        Text(p.name).font(.sans(15, 500)).foregroundStyle(GY.ink1)
                        Spacer()
                        (Text("\(p.sets)").font(.mono(13, 500)) + Text("세트").font(.sans(11, 400))).foregroundStyle(GY.ink3)
                        Text("\(p.pct)%").font(.mono(13, 600)).foregroundStyle(GY.ink1)
                            .frame(minWidth: 38, alignment: .trailing)   // .lrow .pc min-width:38px
                    }
                    .padding(.vertical, 11)
                    .overlay(alignment: .top) { if i > 0 { Rectangle().fill(GY.lineSoft).frame(height: 1) } }
                }
            }
            .padding(.top, 14)   // body-list margin-top:14px
        }
        .padding(.horizontal, 24)
    }

    // 8주 추이 — stats.js renderWeeklyTrendChart 이식 (막대 + 선 overlay + 점 + x축 라벨).
    // 기하는 GymTrendChart(viewBox 320×160 + xMidYMid meet 레터박스). 유닛 6.
    struct WeeklyTrendChart: View {
        let trend: [Double]
        var n: Int { max(1, trend.count) }
        var maxV: Double { trend.max() ?? 0 }

        var body: some View {
            VStack(spacing: 8) {
                GeometryReader { g in
                    let f = GymTrendChart.fit(width: g.size.width, height: g.size.height)
                    ZStack(alignment: .topLeading) {
                        ForEach(trend.indices, id: \.self) { i in
                            let r = GymTrendChart.bar(index: i, count: n, value: trend[i], maxValue: maxV)
                            RoundedRectangle(cornerRadius: f.len(3))
                                .fill(trend[i] <= 0 ? StatsScreenView.trendZero
                                      : (i == n - 1 ? StatsScreenView.trendCurrent : StatsScreenView.trendPast))
                                .frame(width: f.len(r.width), height: f.len(r.height))
                                .offset(x: f.x(r.minX), y: f.y(r.minY))
                        }
                        if maxV > 0 {
                            Path { p in
                                for i in 0..<n {
                                    let pt = GymTrendChart.point(index: i, count: n, value: trend[i], maxValue: maxV)
                                    let m = CGPoint(x: f.x(pt.x), y: f.y(pt.y))
                                    i == 0 ? p.move(to: m) : p.addLine(to: m)
                                }
                            }
                            .stroke(StatsScreenView.trendLine,
                                    style: StrokeStyle(lineWidth: f.len(1.6), lineCap: .round, lineJoin: .round))
                            ForEach(trend.indices, id: \.self) { i in
                                let cur = i == n - 1
                                let rad = f.len(cur ? 4 : 2.5)
                                let pt = GymTrendChart.point(index: i, count: n, value: trend[i], maxValue: maxV)
                                Circle().fill(cur ? StatsScreenView.trendCurrent : StatsScreenView.trendDot)
                                    .overlay(cur ? Circle().strokeBorder(Color(hex: 0xFFFDF8), lineWidth: f.len(2)) : nil)
                                    .frame(width: rad * 2, height: rad * 2)
                                    .offset(x: f.x(pt.x) - rad, y: f.y(pt.y) - rad)
                            }
                        }
                    }
                }
                .frame(height: 150)   // stats.html:118 svg height:150px (라벨은 margin-top 8 아래)
                HStack(spacing: 0) {   // x축 라벨 — 첫 칸·이번주 + 짝수 주만 (stats.js:780)
                    ForEach(trend.indices, id: \.self) { i in
                        let ago = n - 1 - i
                        let label = i == n - 1 ? "이번" : (i == 0 ? "\(n - 1)주전" : (ago % 2 == 0 ? "\(ago)주전" : ""))
                        Text(label).font(.mono(10, 400)).foregroundStyle(GY.ink4)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    func donutStops(_ parts: [(Color, Int)], total: Int) -> [Gradient.Stop] {
        var stops: [Gradient.Stop] = []
        var acc = 0.0
        for (color, sets) in parts {
            let frac = Double(sets) / Double(total)
            stops.append(.init(color: color, location: acc))
            acc += frac
            stops.append(.init(color: color, location: min(1, acc)))
        }
        if acc < 1 { stops.append(.init(color: GY.sunken, location: 1)) }
        return stops
    }
}

import SwiftUI
import GymCore

// 통계 화면 — mocks/stats.html 이식. 3탭(캘린더/종목/부위) GymAppModel 실집계 구동.
public struct StatsScreenView: View {
    public enum Tab: String { case cal, exercise, body }
    @ObservedObject var model: GymAppModel
    @State private var tab: Tab
    @State private var year: Int
    @State private var month: Int
    var onHome: () -> Void
    var onAdmin: () -> Void
    var embedScroll: Bool   // gymshot(ImageRenderer)는 ScrollView 내부 미렌더 → 스냅샷은 false

    public init(model: GymAppModel, initialTab: Tab = .cal, embedScroll: Bool = true,
                onHome: @escaping () -> Void = {}, onAdmin: @escaping () -> Void = {}) {
        self.model = model; _tab = State(initialValue: initialTab); self.embedScroll = embedScroll
        let cal = GymAppModel.kst
        _year = State(initialValue: cal.component(.year, from: model.referenceToday))
        _month = State(initialValue: cal.component(.month, from: model.referenceToday))
        self.onHome = onHome; self.onAdmin = onAdmin
    }
    // 데모/스냅샷 편의 init.
    public init(initialTab: Tab = .cal, onHome: @escaping () -> Void = {}) {
        self.init(model: GymAppModel(), initialTab: initialTab, onHome: onHome)
    }

    static let vf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()
    static func fmt(_ n: Double) -> String { vf.string(from: NSNumber(value: n)) ?? "\(Int(n))" }

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
        .frame(width: 390).frame(maxHeight: .infinity, alignment: .top).background(GY.shell)
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
                    Text("홈").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain).accessibilityIdentifier("stats-home")
                Button(action: onAdmin) {
                    Text("관리").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 24).padding(.top, 8)
    }

    var tabBar: some View {
        HStack(spacing: 22) {
            tabItem("캘린더", .cal); tabItem("종목", .exercise); tabItem("부위", .body); Spacer()
        }
        .padding(.horizontal, 24).padding(.top, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
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
        let worked = model.workedDays(year: year, month: month)
        let todayStr = GymAppModel.dayFmt.string(from: model.referenceToday)
        let cells = Array(repeating: 0, count: leadMon) + Array(1...daysInMonth)
        let rows = stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<min($0 + 7, cells.count)]) }

        let trend = model.weeklyVolumes(weeks: 8, from: model.referenceToday)
        let thisVol = trend.last ?? 0
        let lastVol = trend.count >= 2 ? trend[trend.count - 2] : 0
        let delta = lastVol > 0 ? Int(((thisVol - lastVol) / lastVol * 100).rounded()) : 0
        let maxVol = max(1, trend.max() ?? 1)

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
                            ZStack {
                                if day > 0 {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(worked.contains(day) ? GY.crailTint : Color.clear)
                                        .overlay(isToday ? RoundedRectangle(cornerRadius: 8).strokeBorder(GY.crailBase, lineWidth: 1.5) : nil)
                                    Text("\(day)").font(.mono(13, 500))
                                        .foregroundStyle(worked.contains(day) ? GY.crailDeep : GY.ink3)
                                }
                            }
                            .frame(maxWidth: .infinity).frame(height: 40)
                        }
                        if rows[r].count < 7 { ForEach(0..<(7 - rows[r].count), id: \.self) { _ in Color.clear.frame(maxWidth: .infinity) } }
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
                                Text("\(delta > 0 ? "+" : "")\(delta)%").font(.sans(13, 600))
                                    .foregroundStyle(delta >= 0 ? GY.crailDeep : GY.ink4)
                            }
                        }
                    }
                    Spacer()
                    Text("지난 주 \(Self.fmt(lastVol))kg").font(.sans(12, 400)).foregroundStyle(GY.ink4)
                }
                HStack(alignment: .bottom, spacing: 8) {
                    ForEach(trend.indices, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(i == trend.count - 1 ? GY.crailBase : GY.neutralBar)
                            .frame(maxWidth: .infinity).frame(height: max(3, 90 * trend[i] / maxVol))
                    }
                }.frame(height: 90)
            }
            .padding(.horizontal, 20).padding(.vertical, 18)
            .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
            .overlay(RoundedRectangle(cornerRadius: GY.rLg).strokeBorder(GY.line, lineWidth: 1))
            .padding(.horizontal, 22).padding(.vertical, 24)
        }
    }

    static let palette: [Color] = [GY.crailBase, GY.cloudyBase, GY.sage, GY.recordBase, GY.ink3]

    // 종목 pane — 최근 60일 종목별 세트 빈도.
    var exercisePane: some View {
        let items = model.exerciseFrequency(days: 60, from: model.referenceToday, top: 5)
        let distinct = Set(model.exerciseFrequency(days: 60, from: model.referenceToday, top: 999).map(\.exId)).count
        let maxSets = max(1, items.map(\.sets).max() ?? 1)
        return VStack(alignment: .leading, spacing: 0) {
            Text("자주 한 운동 · 최근 60일").font(.sans(12, 400)).tracking(0.24).foregroundStyle(GY.ink3).padding(.top, 18)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("\(distinct)").font(.mono(34, 600)).tracking(-1.02).foregroundStyle(GY.ink1)
                Text("종목").font(.sans(14, 400)).foregroundStyle(GY.ink4)
            }.padding(.top, 4).padding(.bottom, 10)
            if items.isEmpty {
                Text("최근 60일 기록 없음").font(.sans(13, 400)).foregroundStyle(GY.ink4).padding(.vertical, 20)
            }
            ForEach(items.indices, id: \.self) { i in
                let it = items[i]; let color = Self.palette[i % Self.palette.count]
                VStack(spacing: 6) {
                    HStack(spacing: 10) {
                        Circle().fill(color).frame(width: 8, height: 8)
                        Text(model.exerciseName(it.exId)).font(.sans(15, 500)).foregroundStyle(GY.ink1).lineLimit(1)
                        Spacer()
                        (Text("\(it.sets)").font(.mono(13, 500)).foregroundStyle(GY.ink3)
                         + Text("세트").font(.sans(11, 400)).foregroundStyle(GY.ink4))
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3).fill(GY.sunken)
                            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: g.size.width * CGFloat(Double(it.sets) / Double(maxSets)))
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
        let parts = dist.enumerated().map { i, d in
            (name: GymExercises.partName(d.part), color: Self.palette[i % Self.palette.count],
             sets: d.sets, pct: Int((Double(d.sets) / Double(total) * 100).rounded()))
        }
        return VStack(spacing: 0) {
            Text("최근 60일 부위 분포").font(.sans(12, 400)).tracking(0.24).foregroundStyle(GY.ink3)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 18)
            ZStack {
                Circle().fill(AngularGradient(gradient: Gradient(stops: donutStops(parts.map { ($0.color, $0.sets) }, total: total)), center: .center))
                Circle().fill(GY.shell).frame(width: 168 - 52, height: 168 - 52)
                VStack(spacing: 1) {
                    Text("\(sessions)").font(.mono(30, 600)).tracking(-0.9).foregroundStyle(GY.ink1)
                    Text("회 운동").font(.sans(11, 500)).foregroundStyle(GY.ink4)
                }
            }
            .frame(width: 168, height: 168).padding(.vertical, 22)
            VStack(spacing: 0) {
                ForEach(parts.indices, id: \.self) { i in
                    let p = parts[i]
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 3).fill(p.color).frame(width: 10, height: 10)
                        Text(p.name).font(.sans(15, 500)).foregroundStyle(GY.ink1)
                        Spacer()
                        (Text("\(p.sets)").font(.mono(13, 500)) + Text("세트").font(.sans(11, 400))).foregroundStyle(GY.ink3)
                        Text("\(p.pct)%").font(.mono(13, 600)).foregroundStyle(GY.ink1).frame(width: 42, alignment: .trailing)
                    }
                    .padding(.vertical, 11)
                    .overlay(alignment: .top) { if i > 0 { Rectangle().fill(GY.lineSoft).frame(height: 1) } }
                }
            }
        }
        .padding(.horizontal, 24)
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

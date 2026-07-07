import SwiftUI

// 통계 화면 — mocks/stats.html 이식. 3탭(캘린더/종목/부위) 실제 전환. 정적 데모 데이터.
public struct StatsScreenView: View {
    enum Tab { case cal, exercise, body }
    @State private var tab: Tab = .cal
    var onHome: () -> Void
    public init(onHome: @escaping () -> Void = {}) { self.onHome = onHome }

    public var body: some View {
        VStack(spacing: 0) {
            header
            tabBar
            ScrollView {
                switch tab {
                case .cal: calendarPane
                case .exercise: exercisePane
                case .body: bodyPane
                }
            }
        }
        .frame(width: 390)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(GY.shell)
    }

    var header: some View {
        HStack {
            Text("통계").font(.sans(24, 700)).tracking(-0.48).foregroundStyle(GY.ink1)
            Spacer()
            HStack(spacing: 4) {
                Button(action: onHome) {
                    Text("홈").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain).accessibilityIdentifier("stats-home")
                Text("관리").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
            }
        }
        .padding(.horizontal, 24).padding(.top, 8)
    }

    var tabBar: some View {
        HStack(spacing: 22) {
            tabItem("캘린더", .cal)
            tabItem("종목", .exercise)
            tabItem("부위", .body)
            Spacer()
        }
        .padding(.horizontal, 24).padding(.top, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
    }

    func tabItem(_ label: String, _ t: Tab) -> some View {
        let on = tab == t
        return Button { tab = t } label: {
            VStack(spacing: 0) {
                Text(label).font(.sans(15, on ? 600 : 500)).foregroundStyle(on ? GY.ink1 : GY.ink4)
                    .padding(.top, 8).padding(.bottom, 12)
            }
            .overlay(alignment: .bottom) {
                if on { Rectangle().fill(GY.crailBase).frame(height: 2).cornerRadius(1) }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("stats-tab-\(label)")
    }

    // 캘린더 pane
    var calendarPane: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "chevron.left").font(.system(size: 13, weight: .medium)).foregroundStyle(GY.ink3).frame(width: 32, height: 32)
                Spacer()
                Text("2026 · 5월").font(.mono(15, 600)).tracking(0.3).foregroundStyle(GY.ink1)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 13, weight: .medium)).foregroundStyle(GY.ink3).frame(width: 32, height: 32)
            }
            .padding(.horizontal, 24).padding(.top, 18)

            VStack(spacing: 4) {
                HStack(spacing: 4) {
                    ForEach(["월", "화", "수", "목", "금", "토", "일"], id: \.self) { d in
                        Text(d).font(.sans(11, 500)).foregroundStyle(GY.ink4).frame(maxWidth: .infinity)
                    }
                }.padding(.bottom, 2)
                // 데모 그리드: 5월(1일 목요일=인덱스3), 31일. worked = 몇 일 강조.
                let worked: Set<Int> = [2, 5, 6, 9, 12, 13, 16, 19, 20, 23, 26, 27, 30]
                let cells = Array(repeating: 0, count: 3) + Array(1...31)
                let rows = stride(from: 0, to: cells.count, by: 7).map { Array(cells[$0..<min($0 + 7, cells.count)]) }
                ForEach(rows.indices, id: \.self) { r in
                    HStack(spacing: 4) {
                        ForEach(rows[r].indices, id: \.self) { c in
                            let day = rows[r][c]
                            ZStack {
                                if day > 0 {
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(worked.contains(day) ? GY.crailTint : Color.clear)
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

            // 이번 주 볼륨 카드 (+ 8주 추이 — 막대 미니차트)
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("이번 주 볼륨").font(.sans(12, 400)).tracking(0.24).foregroundStyle(GY.ink3)
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            (Text("12,480").font(.mono(26, 600)).tracking(-0.52).foregroundStyle(GY.ink1)
                             + Text("kg").font(.sans(13, 400)).foregroundStyle(GY.ink4))
                            Text("+14%").font(.sans(13, 600)).foregroundStyle(GY.crailDeep)
                        }
                    }
                    Spacer()
                    Text("지난 주 10,940kg").font(.sans(12, 400)).foregroundStyle(GY.ink4)
                }
                // 8주 막대 미니차트 (선 overlay 는 후속)
                let trend: [Double] = [0.5, 0.62, 0.48, 0.7, 0.55, 0.8, 0.66, 0.92]
                HStack(alignment: .bottom, spacing: 8) {
                    ForEach(trend.indices, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(i == trend.count - 1 ? GY.crailBase : GY.neutralBar)
                            .frame(maxWidth: .infinity).frame(height: 90 * trend[i])
                    }
                }.frame(height: 90)
            }
            .padding(.horizontal, 20).padding(.vertical, 18)
            .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
            .overlay(RoundedRectangle(cornerRadius: GY.rLg).strokeBorder(GY.line, lineWidth: 1))
            .padding(.horizontal, 22).padding(.vertical, 24)
        }
    }

    // 종목 pane — 자주 한 운동 빈도 list
    var exercisePane: some View {
        let items: [(String, Int, Color, Double)] = [
            ("벤치프레스", 24, GY.crailBase, 1.0), ("스쿼트", 21, GY.cloudyBase, 0.88),
            ("데드리프트", 18, GY.sage, 0.75), ("오버헤드 프레스", 14, GY.recordBase, 0.58),
            ("바벨 로우", 11, GY.ink3, 0.46),
        ]
        return VStack(alignment: .leading, spacing: 0) {
            Text("자주 한 운동 · 최근 60일").font(.sans(12, 400)).tracking(0.24).foregroundStyle(GY.ink3)
                .padding(.top, 18)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("14").font(.mono(34, 600)).tracking(-1.02).foregroundStyle(GY.ink1)
                Text("종목").font(.sans(14, 400)).foregroundStyle(GY.ink4)
            }.padding(.top, 4).padding(.bottom, 10)
            ForEach(items.indices, id: \.self) { i in
                let it = items[i]
                VStack(spacing: 6) {
                    HStack(spacing: 10) {
                        Circle().fill(it.2).frame(width: 8, height: 8)
                        Text(it.0).font(.sans(15, 500)).foregroundStyle(GY.ink1).lineLimit(1)
                        Spacer()
                        (Text("\(it.1)").font(.mono(13, 500)).foregroundStyle(GY.ink3)
                         + Text("세트").font(.sans(11, 400)).foregroundStyle(GY.ink4))
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3).fill(GY.sunken)
                            RoundedRectangle(cornerRadius: 3).fill(it.2).frame(width: g.size.width * it.3)
                        }
                    }.frame(height: 6)
                }
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) { if i < items.count - 1 { Rectangle().fill(GY.lineSoft).frame(height: 1) } }
            }
        }
        .padding(.horizontal, 24)
    }

    // 부위 pane — work-order 도넛 + 범례
    var bodyPane: some View {
        let parts: [(String, Color, Int, Int)] = [
            ("가슴", GY.crailBase, 32, 32), ("등", Color(hex: 0xC2BBAC), 26, 26),
            ("하체", Color(hex: 0xD0CABD), 18, 18), ("어깨", Color(hex: 0xDDD8CD), 14, 14),
            ("팔", Color(hex: 0xE9E5DC), 10, 10),
        ]
        return VStack(spacing: 0) {
            Text("최근 60일 부위 분포").font(.sans(12, 400)).tracking(0.24).foregroundStyle(GY.ink3)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 18)
            // 도넛 (conic → AngularGradient 근사)
            ZStack {
                Circle().fill(AngularGradient(
                    gradient: Gradient(stops: donutStops(parts)), center: .center))
                Circle().fill(GY.shell).frame(width: 168 - 52, height: 168 - 52)
                VStack(spacing: 1) {
                    Text("100").font(.mono(30, 600)).tracking(-0.9).foregroundStyle(GY.ink1)
                    Text("회 운동").font(.sans(11, 500)).foregroundStyle(GY.ink4)
                }
            }
            .frame(width: 168, height: 168).padding(.vertical, 22)
            // 범례
            VStack(spacing: 0) {
                ForEach(parts.indices, id: \.self) { i in
                    let p = parts[i]
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 3).fill(p.1).frame(width: 10, height: 10)
                        Text(p.0).font(.sans(15, 500)).foregroundStyle(GY.ink1)
                        Spacer()
                        (Text("\(p.2)").font(.mono(13, 500)) + Text("회").font(.sans(11, 400)))
                            .foregroundStyle(GY.ink3)
                        Text("\(p.3)%").font(.mono(13, 600)).foregroundStyle(GY.ink1).frame(width: 38, alignment: .trailing)
                    }
                    .padding(.vertical, 11)
                    .overlay(alignment: .top) { if i > 0 { Rectangle().fill(GY.lineSoft).frame(height: 1) } }
                }
            }
        }
        .padding(.horizontal, 24)
    }

    func donutStops(_ parts: [(String, Color, Int, Int)]) -> [Gradient.Stop] {
        var stops: [Gradient.Stop] = []
        var acc = 0.0
        for p in parts {
            let frac = Double(p.3) / 100
            stops.append(.init(color: p.1, location: acc))
            acc += frac
            stops.append(.init(color: p.1, location: acc))
        }
        return stops
    }
}

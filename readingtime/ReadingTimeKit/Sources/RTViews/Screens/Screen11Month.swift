import SwiftUI

// v8 11 기록 · 월간 — 스펙: frames/11.html + 라이브 시안 DOM 추출 셀 데이터
// userData 주입 시 현재 월 실데이터 (init 스냅샷)
public struct Screen11Month: View {
    struct LiveCell {
        let d: Int
        let coverUrl: String?
        let dot: Bool
        let today: Bool
        let future: Bool
    }
    struct Live {
        let title: String
        let totalHM: String
        let readDays: Int
        let elapsedDays: Int
        let cells: [LiveCell?]
    }

    var model: RTAppModel?
    private let live: Live?

    public init(model: RTAppModel? = nil) {
        self.model = model
        if let m = model, let data = m.userData {
            let cal = Calendar(identifier: .gregorian)
            let now = m.now()
            let year = cal.component(.year, from: now)
            let month = cal.component(.month, from: now)
            let todayDay = cal.component(.day, from: now)
            let daysInMonth = cal.range(of: .day, in: .month, for: now)?.count ?? 30
            let first = cal.date(from: DateComponents(year: year, month: month, day: 1))!
            let monOffset = (cal.component(.weekday, from: first) + 5) % 7   // 월=0
            let covers = Dictionary(uniqueKeysWithValues: data.books.map { ($0.isbn, $0.coverUrl) })
            var monthTotal = 0
            var readDaySet = Set<Int>()
            var perDayTop: [Int: (isbn: String, sec: Int)] = [:]
            for s in data.sessions {
                guard cal.component(.month, from: s.endedAt) == month,
                      cal.component(.year, from: s.endedAt) == year else { continue }
                let d = cal.component(.day, from: s.endedAt)
                monthTotal += s.seconds
                readDaySet.insert(d)
                if let isbn = s.isbn, s.seconds > (perDayTop[d]?.sec ?? -1) {
                    perDayTop[d] = (isbn, s.seconds)
                }
            }
            var finishDays = Set<Int>()
            for b in data.books {
                if let f = b.finishedAt, cal.component(.month, from: f) == month,
                   cal.component(.year, from: f) == year {
                    finishDays.insert(cal.component(.day, from: f))
                }
            }
            var cells: [LiveCell?] = Array(repeating: nil, count: monOffset)
            for d in 1...daysInMonth {
                cells.append(LiveCell(
                    d: d,
                    coverUrl: readDaySet.contains(d) ? perDayTop[d].flatMap { covers[$0.isbn] } : nil,
                    dot: finishDays.contains(d),
                    today: d == todayDay,
                    future: d > todayDay))
            }
            self.live = Live(title: "\(year)년 \(month)월",
                             totalHM: RTAppModel.hmString(monthTotal),
                             readDays: readDaySet.count,
                             elapsedDays: todayDay,
                             cells: cells)
        } else {
            self.live = nil
        }
    }

    struct Cell {
        let d: Int
        let cover: UInt32?   // 표지 bg (라이브 시안 추출값)
        let dot: Bool
        let today: Bool
        let future: Bool
    }

    static let cells: [Cell?] = {
        func coverFor(_ d: Int) -> UInt32? {
            if d <= 6 { return 0xE3E4DA }          // 작별하지 않는다
            if d == 8 { return 0x1F2D45 }          // 돈의 심리학
            if (10...14).contains(d) || (17...21).contains(d) { return 0xE5D5A8 } // 몰입
            if d == 15 || d == 16 { return 0xE4572E } // 도둑맞은 집중력
            return nil
        }
        var out: [Cell?] = Array(repeating: nil, count: 4)
        for d in 1...31 {
            out.append(Cell(d: d, cover: coverFor(d), dot: d == 6, today: d == 21, future: d >= 22))
        }
        return out
    }()

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .bottom) {
                    Text(live?.title ?? "2026년 5월").font(.sans(26, 900)).tracking(26 * -0.04).foregroundColor(RT.ink)
                    Spacer()
                    HStack(spacing: 8) {
                        navBtn(back: true)
                        navBtn(back: false)
                    }
                }
                summary.padding(.top, 10)
                Rectangle().fill(RT.hair3).frame(height: 1).padding(.top, 14)
                dowHeader.padding(EdgeInsets(top: 14, leading: 0, bottom: 8, trailing: 0))
                grid
                HStack(spacing: 6) {
                    Circle().fill(RT.green).frame(width: 5, height: 5)
                    Text("완독").font(.sans(11, 500)).foregroundColor(RT.faint)
                }
                .padding(.top, 12)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 22)
            .padding(.top, 106)
            StatsHeader(active: .month, model: model)
        }
        .frame(width: 390, height: 844)
    }

    func navBtn(back: Bool) -> some View {
        RoundedRectangle(cornerRadius: 9).fill(RT.segBg)
            .frame(width: 30, height: 30)
            .overlay(RTIcon([back ? "M12 4 6 10l6 6" : "M8 4l6 6-6 6"], size: 13, viewBox: 20,
                            stroke: RT.muted, lineWidth: 2.2))
    }

    var summary: some View {
        HStack(spacing: 10) {
            HStack(spacing: 10) {
                Text(live?.totalHM ?? "21:08").font(.mono(17, 700)).tracking(17 * -0.02).foregroundColor(RT.ink)
                Text("총 시간").font(.sans(12, 500)).foregroundColor(RT.muted)
            }
            Circle().fill(Color(hex: 0xD5CDB8)).frame(width: 3, height: 3)
            HStack(spacing: 0) {
                Text(live.map { "\($0.readDays)" } ?? "17").font(.mono(12, 700)).foregroundColor(RT.green)
                Text(" / \(live?.elapsedDays ?? 21)일 읽음").font(.sans(12, 500)).foregroundColor(RT.muted)
            }
            if live == nil {
                Circle().fill(Color(hex: 0xD5CDB8)).frame(width: 3, height: 3)
                Text("밀리 포함").font(.sans(12, 500)).foregroundColor(RT.muted)
            }
        }
    }

    var dowHeader: some View {
        HStack(spacing: 0) {
            ForEach(Array(["월", "화", "수", "목", "금", "토", "일"].enumerated()), id: \.offset) { i, d in
                Text(d).font(.mono(10, 500))
                    .foregroundColor(i == 6 ? RT.terra : RT.faint)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    var grid: some View {
        Group {
            if let live {
                let padded = live.cells + Array(repeating: LiveCell?.none,
                                                count: (7 - live.cells.count % 7) % 7)
                let rows: [[LiveCell?]] = stride(from: 0, to: padded.count, by: 7).map {
                    Array(padded[$0..<min($0 + 7, padded.count)])
                }
                VStack(spacing: 9) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        HStack(alignment: .top, spacing: 4) {
                            ForEach(Array(row.enumerated()), id: \.offset) { i, cell in
                                liveCellView(cell, sunday: i == 6)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                }
            } else {
                let rows: [[Cell?]] = stride(from: 0, to: Self.cells.count, by: 7).map {
                    Array(Self.cells[$0..<min($0 + 7, Self.cells.count)])
                }
                VStack(spacing: 9) {
                    ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                        HStack(alignment: .top, spacing: 4) {
                            ForEach(Array(row.enumerated()), id: \.offset) { i, cell in
                                cellView(cell, sunday: i == 6)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    func liveCellView(_ cell: LiveCell?, sunday: Bool) -> some View {
        VStack(spacing: 3) {
            if let c = cell {
                Text("\(c.d)").font(.mono(10, c.today ? 700 : 500))
                    .foregroundColor(
                        c.today ? RT.terra :
                        c.future ? (sunday ? Color(hex: 0xE2BBAC) : Color(hex: 0xCFC7B1)) :
                        sunday ? RT.terra : RT.muted
                    )
                if let url = c.coverUrl {
                    RTRemoteCover(url: url, size: .init(width: 28, height: 40), radius: 3)
                        .overlay(
                            RoundedRectangle(cornerRadius: 3)
                                .stroke(c.today ? RT.terra : Color.clear, lineWidth: 2)
                        )
                        .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.25), radius: 2, x: 0, y: 2)
                }
                if c.dot {
                    Circle().fill(RT.green).frame(width: 5, height: 5)
                }
            }
        }
        .frame(minHeight: 60, alignment: .top)
    }

    @ViewBuilder
    func cellView(_ cell: Cell?, sunday: Bool) -> some View {
        VStack(spacing: 3) {
            if let c = cell {
                Text("\(c.d)").font(.mono(10, c.today ? 700 : 500))
                    .foregroundColor(
                        c.today ? RT.terra :
                        c.future ? (sunday ? Color(hex: 0xE2BBAC) : Color(hex: 0xCFC7B1)) :
                        sunday ? RT.terra : RT.muted
                    )
                if let bg = c.cover {
                    ZStack(alignment: .topLeading) {
                        Color(hex: bg)
                        Rectangle().fill(Color.black.opacity(0.15)).frame(width: 2)
                    }
                    .frame(width: 28, height: 40)
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                    .overlay(
                        RoundedRectangle(cornerRadius: 3)
                            .stroke(c.today ? RT.terra : Color.clear, lineWidth: 2)
                    )
                    .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.25), radius: 2, x: 0, y: 2)
                }
                if c.dot {
                    Circle().fill(RT.green).frame(width: 5, height: 5)
                }
            }
        }
        .frame(minHeight: 60, alignment: .top)
    }
}

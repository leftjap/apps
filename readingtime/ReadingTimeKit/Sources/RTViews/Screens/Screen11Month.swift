import SwiftUI

// 11 기록 · 월간 — 정본: 작업지시서 §4 + 목업 CSS 실측 좌표.
// 데모(model 없음/userData nil) = 시안 §12 데이터로 1:1 재현. userData 주입 시 현재 월 실데이터.
public struct Screen11Month: View {
    struct LiveCell {
        let d: Int
        let coverUrl: String?
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
    let live: Live?

    public init(model: RTAppModel? = nil) {
        self.model = model
        let partner = model?.statsSubject == .partner
        if partner, let m = model, let pd = m.partnerData {
            self.live = Self.buildLive(data: pd, now: m.now())
        } else if !partner, let m = model, let data = m.userData {
            self.live = Self.buildLive(data: data, now: m.now(),
                ebookSec: { m.ebookSeconds(on: $0) },
                ebookCover: { date in (m.ebookBreakdown(on: date).first?.title).flatMap { m.ebookCovers[$0] } })
        } else {
            self.live = nil
        }
    }

    /// 월간 집계 — 주체별 데이터 소스는 init 이 결정. ebook 클로저로 밀리 주입.
    static func buildLive(data: RTUserData, now: Date,
                          ebookSec: (Date) -> Int = { _ in 0 },
                          ebookCover: (Date) -> String? = { _ in nil }) -> Live {
        let cal = Calendar(identifier: .gregorian)
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
        var ebookDayCover: [Int: String] = [:]
        for d in 1...daysInMonth {
            if let date = cal.date(from: DateComponents(year: year, month: month, day: d)) {
                let sec = ebookSec(date)
                if sec > 0 {
                    monthTotal += sec
                    readDaySet.insert(d)
                    if perDayTop[d] == nil, let c = ebookCover(date) { ebookDayCover[d] = c }
                }
            }
        }
        var cells: [LiveCell?] = Array(repeating: nil, count: monOffset)
        for d in 1...daysInMonth {
            cells.append(LiveCell(
                d: d,
                coverUrl: readDaySet.contains(d) ? (perDayTop[d].flatMap { covers[$0.isbn] } ?? ebookDayCover[d]) : nil,
                today: d == todayDay,
                future: d > todayDay))
        }
        return Live(title: "\(year)년 \(month)월",
                    totalHM: RTAppModel.hmString(monthTotal),
                    readDays: readDaySet.count,
                    elapsedDays: todayDay,
                    cells: cells)
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            // CSS: position:absolute; top:102; bottom:0; overflow-y:auto; padding:0 22px 28px
            RTScrollArea {
                content
            }
            StatsHeader(active: .month, model: model)
        }
        .frame(width: 390, height: 844)
    }

    var content: some View {
        VStack(alignment: .leading, spacing: 0) {
                headerRow
                summary.padding(.top, 7)
                dowHeader.padding(.top, 11)
                calendar.padding(.top, 5)
                heading("이달 요약", top: 13, bottom: 8)
                summaryCards
                heading("주차별 시간", top: 16, bottom: 8)
                weekBarsCard
                heading("이달 많이 읽은 책", top: 15, bottom: 6)
                ranksView
                RTDuoRow(streak: RTRecordDemo.streak, dots: streakDots,
                         peakLabel: peakLabel, dim: peakDim, peak: peakSeg, centered: true)
                    .padding(EdgeInsets(top: 14, leading: 2, bottom: 6, trailing: 2))
        }
    }

    func heading(_ t: String, top: CGFloat, bottom: CGFloat) -> some View {
        Text(t).font(.sans(14, 800)).foregroundColor(RT.ink).rtLB(RTLB.n14)
            .padding(EdgeInsets(top: top, leading: 2, bottom: bottom, trailing: 2))
    }

    // 1. 헤더 행 — h1 + 좌우 화살표 (align-items:flex-end)
    var headerRow: some View {
        HStack(alignment: .bottom) {
            Text(live?.title ?? RTRecordDemo.monthTitle)
                .font(.sans(26, 900)).tracking(26 * -0.04).foregroundColor(RT.ink)
                .rtLB(RTLB.n26n)
            Spacer()
            HStack(spacing: 8) {
                navBtn(back: true)
                navBtn(back: false)
            }
        }
    }

    func navBtn(back: Bool) -> some View {
        RoundedRectangle(cornerRadius: 9).fill(RT.segBg)
            .frame(width: 30, height: 30)
            .overlay(RTIcon([back ? "M12 4 6 10l6 6" : "M8 4l6 6-6 6"], size: 13, viewBox: 20,
                            stroke: RT.muted, lineWidth: 2.2))
    }

    // 2. 요약 라인 — "21:08 총 시간 · 17 / 21일 읽음" + 하단 구분선
    var summary: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Text(live?.totalHM ?? RTRecordDemo.monthTotalHM)
                    .font(.mono(17, 700)).tracking(17 * -0.02).foregroundColor(RT.ink)
                Text("총 시간").font(.sans(12, 500)).foregroundColor(RT.muted)
                Circle().fill(Color(hex: 0xD5CDB8)).frame(width: 3, height: 3)
                HStack(spacing: 0) {
                    Text("\(live?.readDays ?? RTRecordDemo.monthReadDays)")
                        .font(.mono(12, 700)).foregroundColor(RT.green)
                    Text(" / \(live?.elapsedDays ?? RTRecordDemo.monthElapsedDays)일 읽음")
                        .font(.sans(12, 500)).foregroundColor(RT.muted)
                }
                Spacer(minLength: 0)
            }
            .frame(height: RTLB.m17)
            .padding(.bottom, 9)
            Rectangle().fill(RT.hair3).frame(height: 1)
        }
    }

    // 3. 요일 헤더
    var dowHeader: some View {
        HStack(spacing: 0) {
            ForEach(Array(["월", "화", "수", "목", "금", "토", "일"].enumerated()), id: \.offset) { i, d in
                Text(d).font(.mono(10, 500))
                    .foregroundColor(i == 6 ? RT.terra : RT.faint)
                    .frame(maxWidth: .infinity)
            }
        }
        .frame(height: RTLB.m10)
    }

    // 4. 캘린더 그리드 — 7col, gap 4×4, 셀 min-height 46 (밀도 지침)
    var calendar: some View {
        let rows: [[Int]] = {
            let n = live?.cells.count ?? RTRecord.calendarCells().count
            let padded = n + (7 - n % 7) % 7
            return stride(from: 0, to: padded, by: 7).map { Array($0..<($0 + 7)) }
        }()
        return VStack(spacing: 4) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(alignment: .top, spacing: 4) {
                    ForEach(row, id: \.self) { i in
                        cellView(i)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .rtEntrance(delay: 0.1, duration: 0.6)
    }

    @ViewBuilder
    func cellView(_ i: Int) -> some View {
        VStack(spacing: 2) {
            if let live {
                if i < live.cells.count, let c = live.cells[i] {
                    Text("\(c.d)").font(.mono(10, c.today ? 700 : 500))
                        .foregroundColor(numColor(today: c.today, future: c.future,
                                                  sunday: i % 7 == 6))
                        .rtLB(RTLB.calNum)
                    if let url = c.coverUrl {
                        RTRemoteCover(url: url, size: .init(width: 25, height: 35), radius: 3)
                            .rtRing(3, c.today ? RT.terra : Color.clear, width: 2)
                    }
                }
            } else {
                let cells = RTRecord.calendarCells()
                if i < cells.count, let d = cells[i].day {
                    let c = cells[i]
                    Text("\(d)").font(.mono(10, c.today ? 700 : 500))
                        .foregroundColor(numColor(today: c.today, future: c.future, sunday: c.sunday))
                        .rtLB(RTLB.calNum)
                    if let cover = c.cover {
                        RTFillCover(fill: cover, tc: 0, title: nil,
                                    size: CGSize(width: 25, height: 35), radius: 3,
                                    spine: 2, spineAlpha: 0.15)
                            .rtRing(3, c.today ? RT.terra : Color.clear, width: 2)
                    }
                }
            }
        }
        .frame(minHeight: 46, alignment: .top)
    }

    // 오늘 → terra / 미래 → #d3cbb6 / 일요일 → terra / 그 외 → #b5ad97 (분기 순서 준수)
    func numColor(today: Bool, future: Bool, sunday: Bool) -> Color {
        if today { return RT.terra }
        if future { return Color(hex: 0xD3CBB6) }
        if sunday { return RT.terra }
        return RT.faint
    }

    // 5. 이달 요약 — 3카드 (최고의 날 / 하루 평균 / 완독)
    var summaryCards: some View {
        HStack(spacing: 9) {
            sumCard(label: "최고의 날", sub: "5.17 일") {
                statNum("118", "분", color: RT.ink)
            }
            sumCard(label: "하루 평균", sub: "읽은 날 기준") {
                statNum("1:00", nil, color: RT.ink)
            }
            sumCard(label: "완독", sub: "이번 달") {
                statNum("2", "권", color: RT.green)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    func statNum(_ v: String, _ unit: String?, color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(v).font(.mono(16, 700)).foregroundColor(color)
            if let unit { Text(unit).font(.sans(11, 600)).foregroundColor(RT.muted) }
        }
        .frame(height: RTLB.m16)
    }

    func sumCard<V: View>(label: String, sub: String, @ViewBuilder value: () -> V) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(.sans(10.5, 500)).foregroundColor(RT.faint).rtLB(RTLB.n10_5)
            value().padding(.top, 5)
            Text(sub).font(.mono(9.5, 400)).foregroundColor(RT.ghost).rtLB(RTLB.m9_5)
                .padding(.top, 2)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .rtRecCard(16, EdgeInsets(top: 12, leading: 12, bottom: 11, trailing: 12))
    }

    // 6. 주차별 시간 — 5막대, 현재 주(4주) 강조
    var weekBarsCard: some View {
        HStack(alignment: .bottom, spacing: 10) {
            ForEach(Array(RTRecord.monthWeeks().enumerated()), id: \.offset) { i, w in
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Text(w.val).font(.mono(9, w.current ? 700 : 500))
                        .foregroundColor(w.current ? RT.green : RT.ghost)
                        .rtLB(RTLB.m9)
                    Group {
                        if w.current {
                            RoundedRectangle(cornerRadius: 6)
                                .fill(LinearGradient.css(180, size: CGSize(width: 30, height: w.h),
                                                         [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)]))
                        } else {
                            RoundedRectangle(cornerRadius: 6).fill(Color(hex: 0xD6CBA9))
                        }
                    }
                    .frame(maxWidth: 30)
                    .frame(height: w.h)
                    .rtStack(delay: Double(i) * 0.06)
                    .padding(.top, 6)
                    Text(w.lbl).font(.mono(9.5, w.current ? 700 : 500))
                        .foregroundColor(w.current ? RT.ink : RT.faint)
                        .rtLB(RTLB.m9_5)
                        .padding(.top, 6)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 88)
        .rtRecCard(18, EdgeInsets(top: 13, leading: 16, bottom: 10, trailing: 16), shadow: true)
    }

    // 7. 이달 많이 읽은 책 (상위 4)
    var ranksView: some View {
        ForEach(Array(RTRecord.monthRanks().enumerated()), id: \.offset) { _, r in
            RTRankRow(cover: AnyView(
                RTFillCover(fill: r.fill, tc: r.tc, title: r.title,
                            size: CGSize(width: 30, height: 43), radius: 3,
                            spine: 2, spineAlpha: 0.16, fontSize: 7.5, lineHeight: 7.875,
                            pad: 2, topOffset: 14, wrap: true)),
                      title: r.title, tag: r.tag,
                      pct: CGFloat(r.pct) / 100, barColor: Color(hex: r.dot), total: r.total)
        }
    }

    // 8. 연속 / 시간대 (주간과 동일 데이터)
    var streakDots: [(color: Color, last: Bool)] {
        RTRecord.streakDots().map { (Color(hex: $0.color), $0.isLast) }
    }
    var peakLabel: String { RTRecordDemo.peakLabel }
    var peakDim: (left: Double, width: Double)? { (0.56, 0.18) }
    var peakSeg: (left: Double, width: Double)? { (0.79, 0.15) }
}

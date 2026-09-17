import SwiftUI
import GymCore

// 세션 근력 종목 히스토리 카드 — 이 종목을 최근 2주 중 어느 날 했는지 (작업지시서 2026-09-17).
// 구 `ExerciseWeekStrip`(1주 · 원 안 볼륨 k) 을 대체한다. 원 안은 날짜뿐이고 볼륨을 넣지 않는다:
// 세션 화면엔 이미 볼륨이 두 곳(헤더 세션 볼륨 · 종목 볼륨 링) 있어 세 번째가 되면 읽히지 않는다.
//
// 색은 홈 캘린더의 규율을 따른다 — crail 은 날짜·기록 행위를 뜻한다. 훈련량 계열(teal/pine)과
// 유산소 teal 링(홈 재설계 §5 의 두 번째 신호)은 넣지 않는다. 이 카드는 이 종목 하나만 말한다.
struct SessionLiftHistoryCard: View {
    let days: [LiftHistoryDay]        // 14칸 — 앞 7 = 지난주, 뒤 7 = 이번 주
    let weekdayLabels: [String]       // 월…일
    let todayIndex: Int?              // 요일 헤더에서 오늘만 crail-deep
    let prevDayCount: Int
    let thisDayCount: Int
    let exName: String                // 접근성 라벨 — "9월 14일, 랫 풀다운 기록"
    var onTapDay: (String) -> Void = { _ in }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // 두 열의 행 높이가 정확히 대응한다 (§3-2 — 상단 오프셋 11 / 29 / 54).
    private static let hHead: CGFloat = 13, hPrev: CGFloat = 20, hThis: CGFloat = 24
    private static let gap: CGFloat = 5
    // 구분선 높이. 스택에 맡기면 Rectangle 이 세로로 탐욕스러워 카드 높이가 흔들린다 —
    // 이 저장소의 다른 구분선(cardioCard 12 · PrevRecordBars 44)과 같이 값을 준다.
    private static let colH: CGFloat = hHead + gap + hPrev + gap + hThis   // 67
    static let cardHeight: CGFloat = 11 + colH + 10                        // 88

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            labelColumn
            Rectangle().fill(GY.line).frame(width: 1, height: Self.colH)
            calendarColumn
        }
        .padding(.init(top: 11, leading: 18, bottom: 10, trailing: 18))
        .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
        // 셸(#FDFDFD) 위 카드(#FFF) — 홈 두 카드와 같은 조건이라 테두리 없이 그림자만.
        // paper.css 의 3층 그림자는 SwiftUI 에 음수 spread 가 없어 단일 근사로 옮긴다 (2026-07-18 실기기 보정).
        .shadow(color: Color(hex: 0x14120E).opacity(0.10), radius: 12, y: 6)
    }

    // MARK: - 라벨 열 (width 64)

    private var labelColumn: some View {
        VStack(alignment: .leading, spacing: Self.gap) {
            Text("최근 2주").font(.sans(11, 600)).tracking(0.44).foregroundStyle(GY.ink4)
                .lineLimit(1).frame(height: Self.hHead, alignment: .leading)
            countRow(title: "지난주", titleFont: .sans(11, 500), titleColor: GY.ink4,
                     n: prevDayCount, numFont: .mono(12.5, 600), numColor: GY.ink3,
                     unitFont: .sans(10, 500), h: Self.hPrev)
            countRow(title: "이번 주", titleFont: .sans(11.5, 600), titleColor: GY.ink2,
                     n: thisDayCount, numFont: .mono(14, 700), numColor: GY.ink1,
                     unitFont: .sans(10.5, 500), h: Self.hThis)
        }
        .frame(width: 64)
        // 세 줄을 한 덩어리로 읽는다. children: .ignore 라 이 뷰 자체가 트리의 말단이 되므로
        // 식별자도 여기에 둔다 — 안쪽 Text 에 주면 .ignore 가 그걸 지운다
        // (컨테이너 식별자가 자식을 덮는 함정: lessons/swiftui-accessibility-identifier-container.md).
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("최근 2주, 지난주 \(prevDayCount)일, 이번 주 \(thisDayCount)일")
        .accessibilityIdentifier("lift-card-title")
    }

    private func countRow(title: String, titleFont: Font, titleColor: Color,
                          n: Int, numFont: Font, numColor: Color,
                          unitFont: Font, h: CGFloat) -> some View {
        HStack(spacing: 0) {
            Text(title).font(titleFont).foregroundStyle(titleColor).lineLimit(1)
            Spacer(minLength: 2)
            HStack(alignment: .firstTextBaseline, spacing: 1) {
                Text("\(n)").font(numFont).foregroundStyle(numColor)
                Text("일").font(unitFont).foregroundStyle(GY.ink4)
            }.lineLimit(1)
        }
        .frame(height: h)
    }

    // MARK: - 캘린더 열

    private var calendarColumn: some View {
        VStack(spacing: Self.gap) {
            HStack(spacing: 0) {   // 요일 헤더 — 두 행이 공유 (홈 weekCalendar 와 같은 값)
                ForEach(Array(weekdayLabels.enumerated()), id: \.offset) { i, wd in
                    Text(wd).font(.sans(11, 600)).tracking(0.44)
                        .foregroundStyle(i == todayIndex ? GY.crailDeep : GY.ink4)
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: Self.hHead)
            row(range: 0..<7, dia: 20, numSize: 11.5, h: Self.hPrev)
            row(range: 7..<14, dia: 24, numSize: 13, h: Self.hThis)
        }
        .frame(maxWidth: .infinity)
    }

    private func row(range: Range<Int>, dia: CGFloat, numSize: CGFloat, h: CGFloat) -> some View {
        HStack(spacing: 0) {
            ForEach(range, id: \.self) { i in cell(days[i], dia: dia, numSize: numSize) }
        }
        .frame(height: h)
    }

    @ViewBuilder
    private func cell(_ d: LiftHistoryDay, dia: CGFloat, numSize: CGFloat) -> some View {
        let base = ZStack {
            Circle().fill(d.mark.fill).frame(width: dia, height: dia)
            Circle().strokeBorder(d.mark.ringColor, lineWidth: d.mark.ringWidth)
                .frame(width: dia, height: dia)
            Text("\(d.num)").font(.mono(numSize, d.mark.ran ? 600 : 500))
                .foregroundStyle(d.mark.numberColor)
        }
        // 첫 세트 커밋 — 오늘 원이 링에서 채움으로. 헤더 GymRing 이 같은 커밋에 거는 커브와 맞춘다.
        .animation(reduceMotion ? nil : .linear(duration: 0.2), value: d.mark)
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { if d.tappable { onTapDay(d.iso) } }

        if d.isFuture {
            // 숨긴 요소엔 식별자를 비운다 — 바깥에서 덧붙이면 XCUITest 트리에 StaticText 로 되살아난다.
            base.accessibilityHidden(true)
        } else {
            base
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(d.dateLabel), \(d.mark.ran ? "\(exName) 기록" : "기록 없음")")
                .accessibilityIdentifier("lift-day-\(d.iso)")
        }
    }
}

// 카드 한 칸. 날짜는 홈 캘린더(`weekCells`)에서, 기록 유무는 `liftMetricWeek` 에서 온다.
struct LiftHistoryDay: Equatable {
    let iso: String          // yyyy-MM-dd — 셀 식별자·시트 인자
    let num: Int             // 날짜 숫자 (원 안)
    let mark: Mark
    let tappable: Bool       // 기록 있는 날만
    let isFuture: Bool

    /// `LiftDay.Style` 네 케이스가 세 가지 그림으로 접힌다 (§4). `.ring` 과 `.ringFaint` 는 같은 그림이다.
    enum Mark: Equatable {
        case ranPast      // 기록 있음 — crail-tint 채움
        case ranToday     // 오늘 기록 — crail-base 채움 + 흰 숫자
        case todayEmpty   // 오늘 미기록 — ink-4 링
        case empty        // 미기록 · 미래

        var ran: Bool { self == .ranPast || self == .ranToday }
        var fill: Color {
            switch self { case .ranPast: GY.crailTint; case .ranToday: GY.crailBase; default: .clear }
        }
        var ringColor: Color { self == .todayEmpty ? GY.ink4 : .clear }
        var ringWidth: CGFloat { self == .todayEmpty ? 1.5 : 0 }
        var numberColor: Color {
            switch self {
            case .ranPast:    GY.crailDeep
            case .ranToday:   .white
            case .todayEmpty: GY.ink1
            case .empty:      GY.ink4
            }
        }
    }

    /// "9월 14일" — `GymDayDetailLogic.dayLabel` 은 요일까지 붙여 셀 라벨로는 길다.
    var dateLabel: String {
        let p = iso.split(separator: "-")
        guard p.count == 3, let m = Int(p[1]), let d = Int(p[2]) else { return iso }
        return "\(m)월 \(d)일"
    }
}

extension SessionLiftHistoryCard {
    /// 두 원천을 합쳐 14칸을 만든다. 새 조회·새 계산은 없다 (§5).
    ///  · 날짜 숫자·오늘 판정 → `GymAppModel.weekCells` (홈 캘린더와 같은 원천)
    ///  · 이 종목 기록 유무 → `liftMetricWeek` 의 `days[i].style` / `prevWeekRan[i]`
    static func days(week: GymSessionLogic.LiftMetricWeek,
                     thisCells: [GymAppModel.HomeWeekCell],
                     prevCells: [GymAppModel.HomeWeekCell],
                     refToday: Date) -> [LiftHistoryDay] {
        let cal = GymAppModel.kst
        guard thisCells.count == 7, prevCells.count == 7, week.days.count == 7,
              week.prevWeekRan.count == 7,
              let monday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear],
                                                             from: refToday))
        else { return [] }
        func iso(_ off: Int) -> String {
            GymAppModel.dayFmt.string(from: cal.date(byAdding: .day, value: off, to: monday) ?? monday)
        }
        let todayIdx = thisCells.firstIndex(where: \.isToday) ?? 6
        var out: [LiftHistoryDay] = []
        for i in 0..<7 {   // 지난주 — 전부 과거라 미래 칸이 없다
            let ran = week.prevWeekRan[i]
            out.append(LiftHistoryDay(iso: iso(i - 7), num: prevCells[i].num,
                                      mark: ran ? .ranPast : .empty, tappable: ran, isFuture: false))
        }
        for i in 0..<7 {
            let filled = week.days[i].style == .filled
            let mark: LiftHistoryDay.Mark = i > todayIdx ? .empty
                : (i == todayIdx ? (filled ? .ranToday : .todayEmpty) : (filled ? .ranPast : .empty))
            out.append(LiftHistoryDay(iso: iso(i), num: thisCells[i].num, mark: mark,
                                      tappable: mark.ran, isFuture: i > todayIdx))
        }
        return out
    }
}

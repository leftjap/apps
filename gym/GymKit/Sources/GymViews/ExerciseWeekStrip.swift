import SwiftUI
import GymCore

// 세션 근력 종목 주간 스트립 — 이 종목을 이번 주 언제·얼마나 했는지 (시안 2026-09-17).
// 유산소 카드(`CardioPanel.weekModule`)와 같은 형태를 쓴다: 같은 화면에서 종목만 바뀌는데
// 원의 언어가 달라지면 안 되기 때문이다. 색만 홈 캘린더의 규율을 따라 crail(근력)로 바꾼다
// — 홈은 근력을 crail 채움, 유산소를 teal 링으로 구분한다 (홈 재설계 §1·§5).
//
// 집계는 GymCore `GymSessionLogic.liftMetricWeek` (원 안 숫자 = 볼륨kg / 맨몸은 횟수).
public struct ExerciseWeekStrip: View {
    let week: GymSessionLogic.LiftMetricWeek
    var variant: Variant = .full
    /// 아래 세트바의 막대 높이 범례를 이 블록이 겸한다 — 세트바 헤더 줄을 스트립이 대신했기 때문.
    /// 세트바 쪽에 오버레이로 띄웠더니 '▲최고' 슬롯이 없는 종목(PR 미기록)에서 막대가 블록
    /// 최상단까지 올라와 글자와 겹쳤다 (시뮬 실앱 2026-09-17. gymshot 데모는 PR 이 있어 안 보였다).
    var barLegend: Bool = false

    init(week: GymSessionLogic.LiftMetricWeek, variant: Variant = .full, barLegend: Bool = false) {
        self.week = week; self.variant = variant; self.barLegend = barLegend
    }

    // 세로 예산이 화면마다 달라 세 규격을 두고 렌더로 고른다.
    //   full    유산소 카드와 같은 규격 (원 37 · 하단 합계 줄)
    //   compact 원 30 · 합계를 같은 줄 오른쪽으로 (세트바의 '▲최고' 와 같은 배치)
    //   tight   원 26 · 요일 라벨 없음 (오늘만 점으로)
    public enum Variant { case full, compact, tight, hidden }

    private var diameter: CGFloat {
        switch variant { case .full: 37; case .compact: 28; default: 26 }
    }
    private var numberSize: CGFloat {
        switch variant { case .full: 13.5; case .compact: 11; default: 10.5 }
    }

    public var body: some View {
        switch variant {
        case .full:
            VStack(spacing: 0) {
                circles
                HStack(spacing: 8) {
                    Spacer(minLength: 0)
                    dayCompare
                }
                .padding(.top, 10)
            }
        default:
            HStack(alignment: .center, spacing: 9) {
                circles
                Rectangle().fill(GY.line).frame(width: 1, height: diameter + 6)
                dayCompare
            }
        }
    }

    private var circles: some View {
        HStack(spacing: 0) {
            ForEach(Array(week.days.enumerated()), id: \.offset) { i, d in
                if i > 0 { Spacer(minLength: 0) }
                dayCircle(d)
            }
        }
    }

    private func dayCircle(_ d: GymSessionLogic.LiftDay) -> some View {
        VStack(spacing: variant == .full ? 7 : 5) {
            ZStack {
                switch d.style {
                case .filled:    Circle().fill(GY.crailBase)
                case .todayRef:  Circle().strokeBorder(GY.crailSoft, lineWidth: 2.4)
                case .ring:      Circle().strokeBorder(GY.line, lineWidth: 1.5)
                case .ringFaint: Circle().strokeBorder(GY.lineSoft, lineWidth: 1.5)
                }
                if let t = d.text {
                    Text(t).font(.mono(numberSize, 600)).tracking(-0.03 * numberSize)
                        .foregroundStyle(numberColor(d))
                        .minimumScaleFactor(0.8).lineLimit(1)
                        .padding(.horizontal, 2)
                        // 식별자는 말단 Text 에 준다 — 감싸는 뷰에 주면 자식 것을 덮어
                        // XCUITest 에서 영영 못 찾는다 (lessons/swiftui-accessibility-identifier-container.md).
                        .accessibilityIdentifier("lift-day-\(d.label)")
                }
            }
            .frame(width: diameter, height: diameter)
            if variant == .tight {
                // 요일 라벨을 지운 규격 — 오늘 위치만 점으로 남긴다.
                Circle().fill(d.isToday ? GY.crailDeep : .clear).frame(width: 3, height: 3)
            } else {
                Text(d.label)
                    .font(.sans(variant == .full ? 11.5 : 9.5,
                                d.isToday ? 700 : (d.style == .filled ? 600 : 500)))
                    .foregroundStyle(labelColor(d))
                    .accessibilityIdentifier("lift-wd-\(d.label)")
            }
        }
        .frame(width: diameter)
    }

    private func numberColor(_ d: GymSessionLogic.LiftDay) -> Color {
        switch d.style {
        case .filled:    .white
        case .todayRef:  GY.crailBase
        case .ring:      GY.ink4
        case .ringFaint: .clear
        }
    }
    private func labelColor(_ d: GymSessionLogic.LiftDay) -> Color {
        if d.isToday { return GY.crailDeep }
        if d.style == .filled { return GY.ink3 }
        return Color(oklch: d.style == .ringFaint ? 0.82 : 0.78, 0.006, 60)
    }

    // 우측 블록 — 볼륨 합계가 아니라 일수 비교다. 세션 화면엔 이미 볼륨이 두 곳(헤더 세션 볼륨·
    // 종목 볼륨 링) 있어 여기까지 kg 를 쓰면 같은 단위 숫자가 세 번 나온다. 스트립만의 고유
    // 정보는 '이 종목을 이번 주 며칠 했나' 이고, 지난주와 나란히 둘 때 비로소 판단이 된다.
    private var dayCompare: some View {
        VStack(alignment: .trailing, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(week.dayCount)").font(.mono(variant == .full ? 16 : 14, 700)).tracking(-0.42)
                    .foregroundStyle(GY.ink1)
                Text("일").font(.sans(variant == .full ? 11 : 10, 600)).foregroundStyle(GY.ink3)
            }
            Text("지난주 \(week.prevDayCount)")
                .font(.sans(variant == .full ? 10.5 : 9.5, 500)).foregroundStyle(GY.ink4)
            if barLegend {
                Text("높이 = 볼륨").font(.sans(9, 500)).tracking(0.18).foregroundStyle(GY.ink4)
                    .padding(.top, 1)
            }
        }
        .fixedSize()
    }
}

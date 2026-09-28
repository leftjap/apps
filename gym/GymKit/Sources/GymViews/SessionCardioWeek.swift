import SwiftUI
import GymCore

// 세션 트레드밀 화면의 이번 주 원 모듈 (작업지시서 2026-09-28, 확정 시안 6b).
// 2주 카드 아래에 홈 유산소 카드와 같은 요일 원 7개 + 이번 주 합계 · 갱신 칩을 둔다.
// 값은 SessionScreen 이 저장(done) 세트만으로 한 번 계산해 2주 카드와 같은 인스턴스를 넘긴다 (§5).
// 색은 홈 유산소 카드와 같다 — teal/pine = 훈련량, warn = 미달. crail 은 쓰지 않는다 (§1).
struct SessionCardioWeek: View {
    let week: GymSessionLogic.CardioMetricWeek
    let refToday: Date      // model.sessionDay — 칸 날짜(접근성 식별자·라벨)의 기준
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header.frame(height: 18)
            // space-between — 홈 cardioCard 와 같다
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    if i > 0 { Spacer(minLength: 0) }
                    dayCell(i)
                }
            }
        }
    }

    // MARK: - 머리줄 — 이번 주 합계 · 일수 + 갱신 칩

    private var header: some View {
        // 지난주 = 이 종목의 지난주 합계. 홈은 유산소 전 종목 합산이라 숫자가 다를 수 있다 (의도된 것).
        let chip = GymHomeLogic.cardioRenewChip(thisTotal: week.totalValue, prevTotal: week.prevTotalValue)
        let numAnim: Animation? = reduceMotion ? nil : .linear(duration: 0.2)
        return HStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("이번 주").font(.sans(11, 600)).tracking(0.44).foregroundStyle(GY.ink4)
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(week.total).font(.mono(16, 600)).tracking(-0.48).foregroundStyle(GY.ink2)
                        .contentTransition(.numericText())
                        .animation(numAnim, value: week.total)
                    Text(week.unit).font(.sans(11, 600)).foregroundStyle(GY.ink4)
                }
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text("\(week.dayCount)").font(.mono(13, 600)).foregroundStyle(GY.ink3)
                        .contentTransition(.numericText())
                        .animation(numAnim, value: week.dayCount)
                    Text("일").font(.sans(11, 500)).foregroundStyle(GY.ink4)
                }
            }
            // 세 묶음을 한 문장으로 읽는다. children: .ignore 라 식별자도 이 말단에 둔다.
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("이번 주 \(week.total)\(week.unit), \(week.dayCount)일")
            .accessibilityIdentifier("cardio-week-title")
            Spacer(minLength: 8)
            if let chip {   // 홈 cardioCard 의 칩과 같은 그림
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    if let v = chip.value {
                        Text(v).font(.mono(11.5, 700))
                            .contentTransition(.numericText())
                            .animation(numAnim, value: v)
                    }
                    Text(chip.label).font(.sans(10.5, 600))
                }
                .foregroundStyle(chip.isWarn ? GY.warnDeep : GY.pine)
                .padding(.horizontal, 9).padding(.vertical, 3)
                .background(chip.isWarn ? GY.warnTint : GY.ghostTint, in: Capsule())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(chip.value.map { "\($0) \(chip.label)" } ?? chip.label)
                .accessibilityIdentifier("cardio-week-chip")
            }
        }
    }

    // MARK: - 원 한 칸

    @ViewBuilder
    private func dayCell(_ i: Int) -> some View {
        let d = week.days[i]
        // 저장 순간 오늘 칸이 링 → 채움으로 바뀐다. 2주 카드 셀과 같은 커브.
        let circle = CardioDayCircle(label: d.label, text: d.text, ran: d.style == .filled, isToday: d.isToday)
            .animation(reduceMotion ? nil : .linear(duration: 0.2), value: d)
        if d.style == .ringFaint {
            // 숨긴 요소엔 식별자를 비운다 — 덧붙이면 XCUITest 트리에 다시 노출된다.
            circle.accessibilityHidden(true)
        } else {
            let date = day(i)
            circle
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(date.label), \(Self.stateLabel(d, isFuture: i > todayIndex))")
                .accessibilityIdentifier("cardio-week-day-\(date.iso)")
        }
    }

    private var todayIndex: Int { week.days.firstIndex(where: \.isToday) ?? 6 }

    /// 칸 날짜 — refToday 가 속한 주의 월요일 + i (`SessionLiftHistoryCard.days` 와 같은 식).
    private func day(_ i: Int) -> (iso: String, label: String) {
        let cal = GymAppModel.kst
        let monday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: refToday)) ?? refToday
        let date = cal.date(byAdding: .day, value: i, to: monday) ?? monday
        let md = cal.dateComponents([.month, .day], from: date)
        return (GymAppModel.dayFmt.string(from: date), "\(md.month ?? 0)월 \(md.day ?? 0)일")
    }

    /// 칸 상태 문구 (§4-5). 숫자 "—" 는 뛰었지만 거리를 안 적은 날이다.
    static func stateLabel(_ d: GymSessionLogic.CardioDay, isFuture: Bool) -> String {
        let km = d.text.flatMap { $0 == "—" ? nil : "\($0)km" }
        switch d.style {
        case .filled:
            return km ?? "거리 없음"
        case .todayRef:
            return km.map { "직전 기록 \($0)" } ?? "기록 없음"
        case .ring, .ringFaint:
            guard isFuture, d.text != nil else { return "기록 없음" }
            return km.map { "지난주 \($0)" } ?? "지난주 거리 없음"
        }
    }
}

/// 유산소 요일 원 한 칸 — 홈 유산소 카드(§8)에서 옮겨 와 세션 이번 주 모듈과 함께 쓴다.
/// 네 경우 모두 원 30×30 · 숫자 13 고정. 크기로 구분하지 않는다 (홈 §8). 탭 동작 없음.
/// 원 안 숫자는 km — "—" 는 뛰었지만 거리를 안 적은 날이다. `ran` 이 아니면 채우지 않고
/// 회색 숫자만 둔다(오늘 = 직전 기록, 남은 날 = 지난주 같은 요일 참조).
struct CardioDayCircle: View {
    let label: String
    let text: String?      // 원 안 숫자. nil = 표시 없음
    let ran: Bool          // teal 채움 여부
    let isToday: Bool

    var body: some View {
        VStack(spacing: 5) {
            ZStack {
                if ran {
                    Circle().fill(GY.teal).frame(width: 30, height: 30)
                } else {
                    Circle().strokeBorder(GY.ring, lineWidth: 1.5).frame(width: 30, height: 30)
                }
                if let text {
                    Text(text).font(.mono(13, isToday ? 700 : 600))
                        .foregroundStyle(ran ? .white : GY.ink3)
                }
            }
            .frame(width: 30, height: 30)
            // 오늘 + 뛴 날 — 흰 링 1.5 + pine 링 1 (실질 지름 35 < 원 간격 43.5, 홈 §14)
            .overlay {
                if isToday && ran {
                    ZStack {
                        Circle().stroke(.white, lineWidth: 1.5).frame(width: 31.5, height: 31.5)
                        Circle().stroke(GY.pine, lineWidth: 1).frame(width: 34, height: 34)
                    }
                }
            }
            Text(label)
                .font(.sans(10.5, isToday && ran ? 700 : 500))
                .foregroundStyle(isToday && ran ? GY.pine : GY.ink4)
                .frame(height: 10.5)     // line-height: 1
        }
        .frame(width: 30)
    }
}

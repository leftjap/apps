import Foundation

// 세션 무게·맨몸 종목 주간 스트립 — 유산소 카드(`CardioMetricWeek.swift`)의 주간 모듈을 근력 쪽으로
// 옮긴 것. 원 형태 규칙(과거는 기록 유무, 오늘은 참조, 미래는 지난주 같은 요일)과 합계 범위는 같고,
// 값만 바뀐다: 무게 종목 = 그날 done 세트 볼륨 합(kg), 맨몸 = 횟수 합(회).
//
// **중량이 아니라 볼륨인 이유** (실기기 2026-09-17 실측, 완료 84세션 2026-05-16~09-16):
// 최대 중량은 거의 고정이다 — wrist_curl 8주 내내 20kg, shoulder_press 7월 말 이후 25kg,
// lat_pulldown 은 40↔45 왕복뿐. 원마다 같은 숫자가 반복돼 주간 리듬을 전혀 못 읽는다.
// 같은 기간 볼륨은 480~780 / 1,665~2,590 으로 매번 달라지고, 앱의 진척 지표(헤더 세션 볼륨·
// 종목 볼륨 링·홈 히트맵)가 모두 볼륨이라 단위도 이어진다.
//
// 세 집계 함수가 혼동되기 쉬워 정리해 둔다:
//   GymHomeLogic.cardioWeek        홈  · 유산소 전 종목 합산 · 분
//   GymSessionLogic.cardioMetricWeek  세션 · 유산소 한 종목 · 시간/거리/칼로리
//   GymSessionLogic.liftMetricWeek    세션 · 근력 한 종목 · 볼륨 또는 횟수  ← 이 파일
extension GymSessionLogic {

    /// 요일 원 한 칸. 형태는 `CardioDay.Style` 과 같은 네 가지를 쓴다 — 같은 화면에서 종목만
    /// 바뀌는데 원의 언어가 달라지면 안 되기 때문이다.
    public struct LiftDay: Equatable, Sendable {
        public enum Style: Equatable, Sendable {
            case filled       // 기록 있음 — 채움 + 흰 숫자
            case todayRef     // 오늘 미입력 — 테두리 + 참조 숫자(직전 기록)
            case ring         // 과거 미기록(숫자 없음) / 미래 지난주 참조(회색 숫자)
            case ringFaint    // 미래 · 지난주에도 기록 없음
        }
        public let label: String     // 월…일
        public let text: String?     // 원 안 숫자. nil = 표시 없음
        public let style: Style
        public let isToday: Bool
    }

    public struct LiftMetricWeek: Equatable, Sendable {
        public let days: [LiftDay]   // 7칸, 월~일
        public let total: String     // 이번 주 합계 (자리가 넉넉해 축약하지 않는다)
        public let unit: String      // kg / 회
        public let dayCount: Int     // 이번 주 오늘까지 이 종목을 한 날 수
        public let prevDayCount: Int // 지난주 같은 종목을 한 날 수 (한 주 전체)
        public let prevWeekRan: [Bool]   // 지난주 월~일, 이 종목 기록 유무 (7)
    }

    static let liftTotalFmt: NumberFormatter = {
        let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f
    }()

    /// 원 안 숫자 — 4자리는 37pt 원에 안 들어가므로 1,000 부터 k 로 줄인다.
    /// 반올림해서 10k 이상이면 소수점을 버린다 ("10.0k" 는 5자라 3자리보다 넓다).
    public static func liftVolumeText(_ v: Double) -> String {
        let r = v.rounded()
        guard r >= 1000 else { return String(Int(r)) }
        let k = r / 1000
        if ((k * 10).rounded() / 10) >= 10 { return "\(Int(k.rounded()))k" }
        return String(format: "%.1fk", k)
    }

    /// 날짜(ISO) → 그날 이 종목 done 세트의 볼륨·횟수 합. done 세트가 하나도 없는 날은 키가 없다
    /// (유산소와 달리 '값 없는 기록'이 없어 술어가 단순하다 — 볼륨 0 인 맨몸도 횟수로 잡힌다).
    public static func liftDayTotals(history: [GymSession], exerciseId: String,
                                     from: String, to: String) -> [String: (volume: Double, reps: Int)] {
        var out: [String: (volume: Double, reps: Int)] = [:]
        for s in history where s.status == .completed && s.date >= from && s.date <= to {
            for b in s.blocks where b.exerciseId == exerciseId {
                for set in b.sets where set.done {
                    let cur = out[s.date] ?? (0, 0)
                    out[s.date] = (cur.volume + set.volume, cur.reps + (set.reps ?? 0))
                }
            }
        }
        return out
    }

    /// 진행 중 세트들(오늘)의 done 합 — 하나도 없으면 nil.
    static func liftTodayValue(_ sets: [GymSet], kind: GymCardKind) -> Double? {
        let done = sets.filter(\.done)
        guard !done.isEmpty else { return nil }
        return kind == .bodyweight
            ? done.reduce(0.0) { $0 + Double($1.reps ?? 0) }
            : done.reduce(0.0) { $0 + $1.volume }
    }

    /// 주간 스트립. `todaySets` 는 진행 중 블록의 세트들(오늘 값의 출처), 과거·미래는 `history`.
    /// 미래 요일은 지난주 같은 요일 값을 회색 참조로 보여준다 (유산소 §5 와 같은 규칙).
    public static func liftMetricWeek(history: [GymSession], todaySets: [GymSet],
                                      exerciseId: String, kind: GymCardKind,
                                      now: Date) -> LiftMetricWeek {
        let cal = GymWeightLogic.kst, fmt = GymWeightLogic.isoFmt
        let todayIdx = GymHomeLogic.mondayIndex(cal.component(.weekday, from: now))
        let monday = cal.date(byAdding: .day, value: -todayIdx, to: now) ?? now
        func iso(_ off: Int) -> String {
            fmt.string(from: cal.date(byAdding: .day, value: off, to: monday) ?? monday)
        }
        let isReps = kind == .bodyweight
        func pick(_ t: (volume: Double, reps: Int)) -> Double { isReps ? Double(t.reps) : t.volume }
        func text(_ v: Double) -> String { isReps ? String(Int(v.rounded())) : liftVolumeText(v) }

        let thisWeek = liftDayTotals(history: history, exerciseId: exerciseId, from: iso(0), to: iso(6))
        let lastWeek = liftDayTotals(history: history, exerciseId: exerciseId, from: iso(-7), to: iso(-1))

        // 오늘 미입력 시 참조값 — 이 종목의 가장 최근 완료 기록 (세트바 preview 와 같은 원천).
        let prevValue: Double? = {
            for s in history.sorted(by: { ($0.date, $0.startTime ?? 0) > ($1.date, $1.startTime ?? 0) })
            where s.status == .completed && s.date < iso(todayIdx) {
                var acc = (volume: 0.0, reps: 0)
                for b in s.blocks where b.exerciseId == exerciseId {
                    for set in b.sets where set.done { acc = (acc.volume + set.volume, acc.reps + (set.reps ?? 0)) }
                }
                if acc.volume > 0 || acc.reps > 0 { return pick(acc) }
            }
            return nil
        }()

        // 오늘 값 = 오늘 이미 완료된 기록 + 진행 중 세트. 오늘 한 번 마치고 새 세션을 켠 경우를
        // 위해 둘을 더한다 (유산소 실기기 2026-08-19 과 같은 사유). 진행 세션은 status active 라
        // liftDayTotals 에 안 들어와 이중 계상되지 않는다.
        let todayISO = iso(todayIdx)
        let todayDone = thisWeek[todayISO].map(pick)
        let todayLive = liftTodayValue(todaySets, kind: kind)
        let todayHasRecord = todayDone != nil || todayLive != nil
        let todayOwn: Double? = todayHasRecord ? (todayDone ?? 0) + (todayLive ?? 0) : nil

        var days: [LiftDay] = []
        for i in 0..<7 {
            let ranThis = thisWeek[iso(i)] != nil
            let ranLast = lastWeek[iso(i - 7)] != nil
            let style: LiftDay.Style
            var value: Double? = nil
            if i == todayIdx {
                style = todayHasRecord ? .filled : .todayRef
                value = todayOwn ?? prevValue         // 미입력이면 직전 기록을 참조로
            } else if i < todayIdx {
                style = ranThis ? .filled : .ring
                value = thisWeek[iso(i)].map(pick)
            } else {
                style = ranLast ? .ring : .ringFaint
                value = lastWeek[iso(i - 7)].map(pick)
            }
            days.append(LiftDay(label: cardioWeekdays[i], text: value.map(text),
                                style: style, isToday: i == todayIdx))
        }

        // 합계·일수 — 오늘까지의 이번 주 기록만 (참조·미래 제외).
        var sum = 0.0, count = 0
        for i in 0...todayIdx {
            let v: Double? = i == todayIdx ? todayOwn : thisWeek[iso(i)].map(pick)
            guard let v else { continue }
            sum += v; count += 1
        }
        // 지난주 행(히스토리 카드) — 이미 구한 lastWeek 을 요일로 편다. 새 조회는 하지 않는다.
        let prevRan = (0..<7).map { lastWeek[iso($0 - 7)] != nil }
        return LiftMetricWeek(days: days,
                              total: liftTotalFmt.string(from: NSNumber(value: sum)) ?? "0",
                              unit: isReps ? "회" : "kg", dayCount: count,
                              prevDayCount: lastWeek.count, prevWeekRan: prevRan)
    }
}

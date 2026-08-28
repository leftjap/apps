import Foundation

// 세션 유산소 카드 — 지표 로테이션 + 주간 집계 (작업지시서 2026-08-18 §4·§5, 확정 시안 7a).
//
// 홈의 `GymHomeLogic.cardioWeek` 와 혼동 금지:
//   홈  = 유산소 **전 종목** 합산, 분 하나만        → 홈 유산소 카드
//   여기 = **종목 하나**(트레드밀 등), 3지표        → 세션 화면 유산소 카드
// 같은 주 경계(월~일 KST)를 쓰지만 집계 범위가 달라 수치가 서로 다를 수 있다 — 의도된 것이다(§5).

/// 카드가 보여주는 세 지표. 스와이프로 이 순서를 돈다 (순환 없음).
public enum GymCardioMetric: String, CaseIterable, Sendable {
    case duration, distance, calories

    public var label: String {
        switch self { case .duration: "시간"; case .distance: "거리"; case .calories: "칼로리" }
    }
    public var unit: String {
        switch self { case .duration: "분"; case .distance: "km"; case .calories: "kcal" }
    }
    /// 빈 공간 탭 증분 (§4).
    /// 칼로리는 10 → **1** (사용자 2026-08-28): 트레드밀 콘솔이 46·88 처럼 1 단위로 표시해
    /// 10 단위로는 실제 값에 맞출 수가 없었다. 큰 폭 조정은 키패드가 담당한다.
    public var step: Double {
        switch self { case .duration: 1; case .distance: 0.1; case .calories: 1 }
    }
    /// 키패드·저장 경로는 기존 필드를 그대로 쓴다 (§5-1 applyCardio 경유).
    public var field: GymSessionLogic.GymCardioField {
        switch self { case .duration: .duration; case .distance: .distance; case .calories: .calories }
    }
    public var next: GymCardioMetric? {
        let a = Self.allCases
        let i = a.firstIndex(of: self)!
        return i + 1 < a.count ? a[i + 1] : nil
    }
    public var prev: GymCardioMetric? {
        let a = Self.allCases
        let i = a.firstIndex(of: self)!
        return i > 0 ? a[i - 1] : nil
    }
    /// 증감 후 값 — 하한 0. 거리만 0.1 단위 반올림, 나머지는 정수 (§5-1).
    public func stepped(from base: Double, dir: Int) -> Double {
        let v = Swift.max(0, base + Double(dir) * step)
        return self == .distance ? (v * 10).rounded() / 10 : v.rounded()
    }
    /// 화면 표기 — 거리는 1자리 고정("3.4"), 시간·칼로리는 정수.
    public func format(_ v: Double) -> String {
        self == .distance ? String(format: "%.1f", (v * 10).rounded() / 10) : String(Int(v.rounded()))
    }
    /// 세트에서 이 지표의 화면 단위 값 (시간은 초 → 분).
    public func value(in s: GymSet) -> Double? {
        switch self {
        case .duration: return s.duration.map { ($0 / 60).rounded() }
        case .distance: return s.distance
        case .calories: return s.calories
        }
    }
}

extension GymSessionLogic {

    /// 요일 원 한 칸. **원의 형태(style)는 지표와 무관하게 항상 시간 기준**이고 스와이프 시 숫자만
    /// 바뀐다 — 주간 리듬이라는 고정 좌표를 유지하기 위한 규칙 (§5).
    public struct CardioDay: Equatable, Sendable {
        public enum Style: Equatable, Sendable {
            case filled       // 기록 있음 — teal 채움 + 흰 숫자
            case todayRef     // 오늘 미입력 — 투명 + teal-soft 2.4px 테두리·숫자 (참조)
            case ring         // 과거 미기록(숫자 없음) / 미래 지난주 참조(회색 숫자)
            case ringFaint    // 미래 · 지난주에도 기록 없음
        }
        public let label: String     // 월…일
        public let text: String?     // 원 안 숫자. nil = 표시 없음
        public let style: Style
        public let isToday: Bool
    }

    public struct CardioMetricWeek: Equatable, Sendable {
        public let days: [CardioDay]   // 7칸, 월~일
        public let total: String
        public let unit: String
        public let dayCount: Int
    }

    static let cardioWeekdays = ["월", "화", "수", "목", "금", "토", "일"]

    /// 날짜(ISO) → 그날 해당 종목 done 세트의 지표별 합. 값이 하나도 없는 지표는 nil 로 남겨
    /// "—"(기록 없음)과 0 을 구분한다. 세트가 2개 이상인 구데이터도 합산으로 흡수한다 (§5-1).
    public static func cardioDayTotals(history: [GymSession], exerciseId: String,
                                       from: String, to: String) -> [String: [GymCardioMetric: Double]] {
        var out: [String: [GymCardioMetric: Double]] = [:]
        for s in history where s.status == .completed && s.date >= from && s.date <= to {
            for b in s.blocks where b.exerciseId == exerciseId {
                for set in b.sets where set.done {
                    // done 세트가 있으면 지표 값이 하나도 없어도 **날짜 키는 남긴다** — 그날이
                    // "뛴 날"이라는 사실 자체가 원의 채움을 정하고, 값 없는 지표만 "—" 가 된다.
                    // 홈(cardioDayMinutes)이 duration nil 을 0 으로 세는 것과 일수를 맞추기 위함
                    // (실기기 2026-08-19: 홈 6일 vs 카드 4일).
                    if out[s.date] == nil { out[s.date] = [:] }
                    for m in GymCardioMetric.allCases {
                        guard let v = m.value(in: set) else { continue }
                        out[s.date, default: [:]][m, default: 0] += v
                    }
                }
            }
        }
        return out
    }

    /// 진행 중 세트들(오늘) 의 지표 합 — 하나도 없으면 nil.
    static func cardioTodayValue(_ sets: [GymSet], _ m: GymCardioMetric) -> Double? {
        let vs = sets.compactMap { m.value(in: $0) }
        return vs.isEmpty ? nil : vs.reduce(0, +)
    }

    /// 카드 주간 모듈. `todaySets` 는 진행 중 블록의 세트들(오늘 값의 출처),
    /// 과거·미래는 `history` 에서 읽는다. 미래 요일은 지난주 같은 요일 값을 회색 참조로 보여준다.
    public static func cardioMetricWeek(history: [GymSession], todaySets: [GymSet],
                                        exerciseId: String, metric: GymCardioMetric,
                                        now: Date) -> CardioMetricWeek {
        let cal = GymWeightLogic.kst, fmt = GymWeightLogic.isoFmt
        let todayIdx = GymHomeLogic.mondayIndex(cal.component(.weekday, from: now))
        let monday = cal.date(byAdding: .day, value: -todayIdx, to: now) ?? now
        func iso(_ off: Int) -> String {
            fmt.string(from: cal.date(byAdding: .day, value: off, to: monday) ?? monday)
        }
        let thisWeek = cardioDayTotals(history: history, exerciseId: exerciseId,
                                       from: iso(0), to: iso(6))
        let lastWeek = cardioDayTotals(history: history, exerciseId: exerciseId,
                                       from: iso(-7), to: iso(-1))
        // 오늘 미입력 시 참조로 쓸 직전 러닝 — 히어로 고스트와 같은 원천이어야 한다 (§5·§8-2).
        let prevRun = recentCardioRuns(history: history, exerciseId: exerciseId, limit: 1).last
        func prevValue(_ m: GymCardioMetric) -> Double? {
            guard let p = prevRun else { return nil }
            switch m {
            case .duration: return (p.durationSec / 60).rounded()
            case .distance: return p.distanceKm
            case .calories: return p.kcal
            }
        }
        // 오늘 값 = **오늘 이미 완료된 기록 + 진행 중 세트**. 진행 중 세트만 보면 오늘 한 번 마치고
        // 새 세션을 켰을 때 오늘이 "미입력" 으로 떨어진다 (실기기 2026-08-19).
        // 진행 중 세션은 status active 라 cardioDayTotals 에 안 들어와 이중 계상되지 않는다.
        let todayISO = iso(todayIdx)
        let todayDone = thisWeek[todayISO]?[metric]
        let todayLive = cardioTodayValue(todaySets, metric)
        let todayHasRecord = thisWeek[todayISO] != nil || todayLive != nil
        let todayOwn: Double? = (todayDone == nil && todayLive == nil)
            ? nil : (todayDone ?? 0) + (todayLive ?? 0)

        var days: [CardioDay] = []
        for i in 0..<7 {
            let label = cardioWeekdays[i]
            // ① 원 형태는 시간 기준으로 먼저 정한다 (지표와 무관).
            // 기록 유무는 '그날 done 세트가 있었는가' — 0분·값없음도 뛴 날이다 (홈과 같은 술어).
            let ranThis = thisWeek[iso(i)] != nil
            let ranLast = lastWeek[iso(i - 7)] != nil
            let style: CardioDay.Style
            var hasSlot: Bool          // 숫자를 쓸 자리가 있는가 (빈 원이면 지표와 무관하게 계속 빈 원)
            if i == todayIdx {
                // 오늘만 예외 — **활성 지표** 기준이다. 시간을 넣었어도 칼로리가 비었으면 칼로리
                // 화면에서 오늘 원은 참조 스타일이 된다 (시안 7a 두 스크린샷이 이 차이를 보여준다).
                style = todayHasRecord ? .filled : .todayRef
                hasSlot = true
            } else if i < todayIdx {
                style = ranThis ? .filled : .ring
                hasSlot = ranThis
            } else {
                style = ranLast ? .ring : .ringFaint
                hasSlot = ranLast
            }
            // ② 숫자만 활성 지표로 갈아 끼운다.
            var text: String? = nil
            if hasSlot {
                if i == todayIdx {
                    // 기록이 있으면 그 값(그 지표만 비었으면 "—"), 없으면 직전 러닝(히어로 고스트와 동일 원천)
                    if todayHasRecord {
                        text = todayOwn.map { metric.format($0) } ?? "—"
                    } else {
                        text = prevValue(metric).map { metric.format($0) }
                    }
                } else {
                    let v = (i < todayIdx ? thisWeek[iso(i)] : lastWeek[iso(i - 7)])?[metric]
                    text = v.map { metric.format($0) } ?? "—"
                }
            }
            days.append(CardioDay(label: label, text: text, style: style, isToday: i == todayIdx))
        }

        // ③ 합계·일수 — 오늘은 입력값만(참조 제외), 과거는 이번 주 기록, 미래는 제외. 값 > 0 만 (§5).
        var sum = 0.0, count = 0
        for i in 0...todayIdx {
            let ran = i == todayIdx ? todayHasRecord : (thisWeek[iso(i)] != nil)
            guard ran else { continue }
            sum += (i == todayIdx ? todayOwn : thisWeek[iso(i)]?[metric]) ?? 0
            count += 1
        }
        return CardioMetricWeek(days: days, total: metric.format(sum),
                                unit: metric.unit, dayCount: count)
    }
}

// MARK: - 제스처·치수 (§4 · §6-1) — 뷰에서 분리해 테스트 가능하게 둔다

public enum GymCardioGesture {
    /// 끝단 저항 — 첫 지표에서 오른쪽, 마지막에서 왼쪽으로 밀면 0.28배. 순환(wrap) 없음 (§4).
    public static let edgeResistance = 0.28

    public static func translate(_ dx: Double, from m: GymCardioMetric) -> Double {
        let atStart = m.prev == nil && dx > 0
        let atEnd = m.next == nil && dx < 0
        return (atStart || atEnd) ? dx * edgeResistance : dx
    }

    /// 드래그 종료 — 이동량 임계 이상이면 다음/이전 지표, 미달이면 원위치(같은 지표).
    /// 화면 위치는 항상 커밋된 지표에서 계산한다 — 중간 값으로 얼어붙을 여지를 없앤다.
    public static func commit(_ dx: Double, from m: GymCardioMetric, threshold: Double) -> GymCardioMetric {
        if dx <= -threshold, let n = m.next { return n }
        if dx >= threshold, let p = m.prev { return p }
        return m
    }
}

/// 치수는 기기 폭에서 유도한다 — 리터럴로 박으면 320~430pt 기기에서 하나씩 어긋난다 (§6-1).
/// 괄호 안은 시안 목업(카드 폭 360) 기준 결과값.
public struct GymCardioLayout: Equatable, Sendable {
    public let contentWidth: CGFloat     // W = 카드 폭 − 좌우 패딩 22×2   (316)
    public let tapZone: CGFloat          // 양변 각 W×0.33, 하한 44        (105)
    public let swipeThreshold: CGFloat   // W×0.18                        (56)
    public let circleDiameter: CGFloat   // 37 고정, 간격 4 미만이면 32

    public static let horizontalPadding: CGFloat = 22
    /// 탭·드래그 분기 8px 는 기기 무관 고정 (§6-1).
    public static let dragSlop: CGFloat = 8

    public init(cardWidth: CGFloat) {
        let w = Swift.max(0, cardWidth - Self.horizontalPadding * 2)
        contentWidth = w
        tapZone = Swift.max(44, w * 0.33)
        swipeThreshold = w * 0.18
        circleDiameter = (w - 37 * 7) / 6 >= 4 ? 37 : 32
    }
    /// 트랙 스냅 오프셋 — 셀 폭 = W, 오프셋 = −index×W.
    public func trackOffset(index: Int) -> CGFloat { -CGFloat(index) * contentWidth }
}

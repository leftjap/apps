import Foundation

// 체중 관리 로직 — PWA src/features/weights.js 1:1 포팅 (spec §10-2).
public enum GymWeightLogic {

    // 7일 이동평균 — 각 인덱스 i 에 대해 [max(0,i-6)...i] 평균. 결과 길이 = 입력 길이.
    public static func sma7(_ rows: [(date: String, kg: Double)]) -> [(date: String, sma: Double)] {
        rows.indices.map { i in
            let s = max(0, i - 6)
            let slice = rows[s...i]
            return (date: rows[i].date, sma: slice.reduce(0) { $0 + $1.kg } / Double(slice.count))
        }
    }

    // 체중 신기록(최저점) — 이전 기록 최저보다 낮을 때만 (동률 아님·첫 입력 아님, §10-2 PR 팝).
    public static func isWeightPR(_ newKg: Double, prev: [Double]) -> Bool {
        guard let minPrev = prev.min() else { return false }
        return newKg < minPrev
    }

    // 남은 감량량 — 음수면 0 (0.1 반올림).
    public static func remainingLoss(current: Double, goal: Double) -> Double {
        let diff = current - goal
        return diff > 0 ? (diff * 10).rounded() / 10 : 0
    }

    // MARK: - 홈 체중 카드 스파크라인 (홈 재설계 2026-08-17 §9 — 선 1개, 7일 이동평균만)

    /// 최근 `days` 일 이동평균 시리즈. **전체 이력에 sma7 을 먼저 적용한 뒤 창을 절단한다** —
    /// 창 안에서만 평균 내면 첫 점이 이동평균이 아니라 그날 실측값이 되어 선 앞머리가 튄다.
    /// `rows` 는 날짜 오름차순.
    public static func recentSma(rows: [(date: String, kg: Double)], days: Int = 30,
                                 now: Date) -> [Double] {
        guard !rows.isEmpty else { return [] }
        let smas = sma7(rows)
        guard let from = kst.date(byAdding: .day, value: -(days - 1), to: kst.startOfDay(for: now))
        else { return smas.map(\.sma) }
        let fromStr = isoFmt.string(from: from)
        return smas.filter { $0.date >= fromStr }.map(\.sma)
    }

    /// 스파크라인 좌표 — x 균등 분할, y 는 시리즈 min~max 를 상하 `pad` 안쪽에 매핑(위 = 무거움).
    /// 격자·축 없음. 점이 2개 미만이면 선을 못 그리므로 빈 배열(뷰가 숨김).
    public static func sparklinePoints(values: [Double], width: CGFloat, height: CGFloat,
                                       pad: CGFloat = 3) -> [CGPoint] {
        guard values.count >= 2 else { return [] }
        let mn = values.min()!, mx = values.max()!
        let top = pad, bottom = height - pad
        let span = mx - mn
        return values.indices.map { i in
            let x = CGFloat(i) / CGFloat(values.count - 1) * width
            let y = span == 0 ? height / 2 : bottom - CGFloat((values[i] - mn) / span) * (bottom - top)
            return CGPoint(x: x, y: y)
        }
    }

    static let kst: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c
    }()
    static let isoFmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = kst; f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    // 예상 달성 시기 — 월 monthlyLossKg 페이스 ISO 날짜 (1개월 = 30.44일). 이미 달성 → 오늘.
    public static func estimateGoalDate(current: Double, goal: Double,
                                        monthlyLossKg: Double = 1.5, now: Date = Date()) -> String? {
        guard monthlyLossKg > 0 else { return nil }
        let remaining = current - goal
        if remaining <= 0 { return isoFmt.string(from: now) }
        let days = Int((remaining / monthlyLossKg * 30.44).rounded(.up))
        guard let target = kst.date(byAdding: .day, value: days, to: now) else { return nil }
        return isoFmt.string(from: target)
    }

    // 목표까지 남은 주 수 (ceil) — "약 N주" 표기.
    public static func weeksUntil(_ isoDate: String, now: Date = Date()) -> Int? {
        guard let target = isoFmt.date(from: isoDate) else { return nil }
        let days = target.timeIntervalSince(kst.startOfDay(for: now)) / 86_400
        return Int((days / 7).rounded(.up))
    }

    // 추이 차트 좌표 — weights.js projectChart 정합. y 상하 10px 패딩, 위 = 무거움.
    public struct ChartProjection {
        public let weightPts: [CGPoint]
        public let smaPts: [CGPoint]
        public let goalY: CGFloat
    }
    public static func chartPoints(weights: [Double], goal: Double,
                                   width: CGFloat, height: CGFloat) -> ChartProjection {
        let top: CGFloat = 10, bottom = height - 10
        let smas = weights.indices.map { i -> Double in
            let s = max(0, i - 6)
            return weights[s...i].reduce(0, +) / Double(i - s + 1)
        }
        let all = weights + smas + [goal]
        let mn = all.min() ?? 0, mx = all.max() ?? 1
        let span = (mx - mn) == 0 ? 1 : (mx - mn)
        func yOf(_ v: Double) -> CGFloat { bottom - CGFloat((v - mn) / span) * (bottom - top) }
        func xOf(_ i: Int, _ n: Int) -> CGFloat { n <= 1 ? 0 : CGFloat(i) / CGFloat(n - 1) * width }
        return ChartProjection(
            weightPts: weights.indices.map { CGPoint(x: xOf($0, weights.count), y: yOf(weights[$0])) },
            smaPts: smas.indices.map { CGPoint(x: xOf($0, smas.count), y: yOf(smas[$0])) },
            goalY: yOf(goal))
    }
}

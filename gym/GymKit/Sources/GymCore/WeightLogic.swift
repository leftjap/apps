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

    /// 스파크라인 한 점 — `dayOffset` 은 창 시작(오늘 − (days−1))부터 센 경과 일수.
    public struct WeightSparkSample: Equatable, Sendable {
        public let dayOffset: Int
        public let sma: Double
        public init(dayOffset: Int, sma: Double) { self.dayOffset = dayOffset; self.sma = sma }
    }

    /// 최근 `days` 일 이동평균 시리즈. 두 가지를 **날짜 기준**으로 센다:
    ///  · 이동평균 창 = 그날부터 거슬러 7일치 기록(기록 7개가 아니다). 기록이 뜸한 구간에서
    ///    개수로 세면 몇 주 전 체중이 오늘 평균에 섞인다.
    ///  · `dayOffset` = 창 시작으로부터 경과 일수. 가로 위치를 기록 순번이 아니라 날짜로 잡는다.
    /// 창 절단은 평균을 낸 다음이다 — 먼저 자르면 창 첫 점이 이동평균이 아니라 그날 실측값이 된다.
    /// `rows` 는 날짜 오름차순.
    public static func recentSma(rows: [(date: String, kg: Double)], days: Int = 30,
                                 now: Date) -> [WeightSparkSample] {
        guard !rows.isEmpty, days >= 1 else { return [] }
        let today = kst.startOfDay(for: now)
        guard let from = kst.date(byAdding: .day, value: -(days - 1), to: today) else { return [] }
        let dated = rows.compactMap { r in isoFmt.date(from: r.date).map { (day: $0, kg: r.kg) } }
        return dated.compactMap { r in
            guard r.day >= from,
                  let lo = kst.date(byAdding: .day, value: -6, to: r.day),
                  let off = kst.dateComponents([.day], from: from, to: r.day).day
            else { return nil }
            let win = dated.filter { $0.day >= lo && $0.day <= r.day }
            guard !win.isEmpty else { return nil }
            return WeightSparkSample(dayOffset: off,
                                     sma: win.reduce(0) { $0 + $1.kg } / Double(win.count))
        }
    }

    /// 스파크라인 좌표 — x 는 창 전체(`windowDays`)에 대한 날짜 비례, y 는 시리즈 min~max 를
    /// 상하 `pad` 안쪽에 매핑(위 = 무거움). 격자·축 없음.
    /// 점이 2개 미만이면 선을 못 그리므로 빈 배열(뷰가 숨김).
    public static func sparklinePoints(samples: [WeightSparkSample], windowDays: Int = 30,
                                       width: CGFloat, height: CGFloat,
                                       pad: CGFloat = 3) -> [CGPoint] {
        guard samples.count >= 2, windowDays >= 2 else { return [] }
        let values = samples.map(\.sma)
        let mn = values.min()!, mx = values.max()!
        let top = pad, bottom = height - pad
        let span = mx - mn
        return samples.map { s in
            let x = CGFloat(s.dayOffset) / CGFloat(windowDays - 1) * width
            let y = span == 0 ? height / 2 : bottom - CGFloat((s.sma - mn) / span) * (bottom - top)
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

    // MARK: - 추이 차트 재설계 (작업지시서 2026-09-19 §2) — 주 변동폭 + 실측 점 + 지수평활

    /// 세로 축 범위. 기록 min/max 에 위아래 `pad` 를 균등하게 주되, 범위가 `minSpan` 미만이면
    /// 중앙 기준으로 벌린다. 목표(69)에 도달해 68.8~69.4 를 오가면 범위가 1.6kg 으로 좁아져
    /// 1kg 이 159pt 가 되고 0.2kg 흔들림이 32pt 로 튄다 — 최소 3.0kg 이 그것을 막는다.
    public static func axisRange(values: [Double], pad: Double = 0.5,
                                 minSpan: Double = 3.0) -> (lo: Double, hi: Double) {
        guard let mn = values.min(), let mx = values.max() else { return (0, minSpan) }
        let lo = mn - pad, hi = mx + pad
        guard hi - lo < minSpan else { return (lo, hi) }
        let center = (mn + mx) / 2
        return (center - minSpan / 2, center + minSpan / 2)
    }

    /// 눈금 위치. step 은 범위 ≤5kg → 1, ≤10kg → 2, 그 위 → 5.
    /// 범위 양 끝(lo, hi)은 포함하지 않는다 — 그 자리 격자선은 축 라벨에 반쯤 걸쳐 잘려 보인다.
    public static func axisTicks(lo: Double, hi: Double) -> (ticks: [Double], step: Double) {
        let span = hi - lo
        let step: Double = span <= 5 ? 1 : (span <= 10 ? 2 : 5)
        var t = (lo / step).rounded(.down) * step
        var out: [Double] = []
        while t < hi {
            if t > lo { out.append(t) }
            t += step
        }
        return (out, step)
    }

    /// 지수평활 — e[0] = values[0], e[i] = a·values[i] + (1−a)·e[i−1].
    /// alpha 0.12 는 SMA7·0.25·0.12 를 같은 데이터로 나란히 렌더해 고른 값이다. 0.25 는 아직
    /// 출렁이고 SMA7 은 꺾임이 남는다. 기본값으로 박고 UI 에 노출하지 않는다.
    public static func ema(_ values: [Double], alpha: Double = 0.12) -> [Double] {
        var out: [Double] = []
        out.reserveCapacity(values.count)
        for v in values {
            out.append(out.isEmpty ? v : alpha * v + (1 - alpha) * out[out.count - 1])
        }
        return out
    }

    public struct WeekBucket: Equatable, Sendable {
        public let start: Date          // 그 주 월요일 00:00 KST
        public let values: [Double]     // 날짜 오름차순
        public var min: Double { values.min() ?? 0 }
        public var max: Double { values.max() ?? 0 }
    }

    /// 첫 기록이 속한 주부터 오늘이 속한 주까지. 기록이 없는 주도 빈 버킷으로 채운다 —
    /// 건너뛰면 가로축이 다시 기록 순번이 된다. 마지막 버킷은 **오늘이 속한 주**이므로
    /// 오늘 미입력이면 그 주 값이 적어 박스가 짧아진다. 그게 사실이다.
    /// `rows` 는 순서 무관(내부에서 날짜 오름차순 정렬).
    public static func weekBuckets(rows: [(date: String, kg: Double)], now: Date) -> [WeekBucket] {
        let dated = rows.compactMap { r in isoFmt.date(from: r.date).map { (day: $0, kg: r.kg) } }
            .sorted { $0.day < $1.day }
        guard let first = dated.first else { return [] }
        let lastWeek = monday(of: now)
        var out: [WeekBucket] = []
        var wk = monday(of: first.day)
        while wk <= lastWeek {
            let next = kst.date(byAdding: .day, value: 7, to: wk) ?? wk.addingTimeInterval(604_800)
            out.append(WeekBucket(start: wk,
                                  values: dated.filter { $0.day >= wk && $0.day < next }.map(\.kg)))
            wk = next
        }
        return out
    }

    /// 그 날짜가 속한 주의 월요일 00:00 KST. `kst` 는 firstWeekday 미설정(일요일 시작)이라
    /// weekOfYear 대신 weekday 성분으로 offset 을 직접 센다 — HomeLogic 과 같은 규칙이다.
    /// 공유 Calendar 에 firstWeekday 를 넣으면 그쪽 전제가 조용히 깨진다.
    static func monday(of d: Date) -> Date {
        let day = kst.startOfDay(for: d)
        let off = (kst.component(.weekday, from: day) + 5) % 7
        return kst.date(byAdding: .day, value: -off, to: day) ?? day
    }

    /// 주 칸 기하 — 칸 폭에서 박스 폭·여백과 밀도 판정을 함께 낸다. 여백을 칸 폭에 비례시키면
    /// 기록이 쌓일수록 박스가 저절로 가늘어져 별도의 "심지 모드"가 필요 없다 (§5).
    public struct WeekCellMetrics: Equatable, Sendable {
        public let cellWidth: CGFloat
        public let inset: CGFloat
        public var boxWidth: CGFloat { cellWidth - 2 * inset }
        /// 박스 폭 3pt 미만이면 잉크가 안 보인다 — 추세선만 남긴다.
        public var showsBox: Bool { boxWidth >= 3 }
        /// 한 칸 `count` 개 점의 반지름. 간격 4pt 이상 1.9 · 2.5pt 이상 1.4 · 그 미만 생략(nil).
        public func dotRadius(count: Int) -> CGFloat? {
            guard count > 0 else { return nil }
            let gap = boxWidth * 0.64 / CGFloat(count)
            return gap >= 4 ? 1.9 : (gap >= 2.5 ? 1.4 : nil)
        }
        /// 점 x — 칸 안쪽 64% 폭에 균등 배치. 이 여백이 없으면 첫 점과 끝 점이 박스 좌우
        /// 모서리 밖으로 반쯤 나간다.
        public func dotXs(cellX: CGFloat, count: Int) -> [CGFloat] {
            guard count > 0 else { return [] }
            let boxX = cellX + inset, w = boxWidth
            return (0..<count).map {
                boxX + w * 0.18 + w * 0.64 * (CGFloat($0) + 0.5) / CGFloat(count)
            }
        }
    }
    public static func cellMetrics(plotWidth: CGFloat, weeks: Int) -> WeekCellMetrics {
        let cw = weeks > 0 ? plotWidth / CGFloat(weeks) : plotWidth
        return WeekCellMetrics(cellWidth: cw, inset: Swift.min(4.5, cw * 0.14))
    }
}

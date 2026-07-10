import Foundation

// 홈 부위 밸런스 — PWA home.js summarizeWeeklyBalance 1:1 포팅.
// 롤링 7일 창([today-6, today] vs [today-13, today-7]) · 고정 부위순서 · 유산소 별도 행 · core 흡수.
public enum GymHomeLogic {

    public struct BalancePart: Equatable, Sendable {
        public let key: String
        public let name: String
        public let sets: Int
        public let prevSets: Int
    }
    public struct WeeklyBalance: Equatable, Sendable {
        public let parts: [BalancePart]     // 하체·어깨·등·가슴·팔·코어 고정 순서
        public let cardioMin: Int
        public let cardioCount: Int
        public let cardioDeltaMin: Int
        public let focusKey: String?        // 이번 주 최소 부위 (전부 0 이면 nil)
        public let max: Int                 // 막대 스케일 (최소 1)
    }

    public static let balanceParts: [(key: String, name: String)] = [
        ("legs", "하체"), ("shoulder", "어깨"), ("back", "등"),
        ("chest", "가슴"), ("arms", "팔"), ("core", "코어"),
    ]

    // 밸런스 분류 — equipment cardio → 'cardio'(별도 행), part core|cardio → 'core' (구데이터 흡수).
    public static func categorize(_ exId: String, custom: [GymCustomExercise]) -> String? {
        guard let def = GymExercises.def(exId, custom: custom) else { return nil }
        if def.equipment == "cardio" { return "cardio" }
        if def.part == "core" || def.part == "cardio" { return "core" }
        return def.part
    }

    public static func weeklyBalance(sessions: [GymSession], custom: [GymCustomExercise],
                                     now: Date) -> WeeklyBalance {
        let cal = GymWeightLogic.kst
        let fmt = GymWeightLogic.isoFmt
        func shift(_ n: Int) -> String { fmt.string(from: cal.date(byAdding: .day, value: n, to: now) ?? now) }
        let todayISO = fmt.string(from: now)
        let thisFrom = shift(-6), prevTo = shift(-7), prevFrom = shift(-13)

        var thisSets: [String: Int] = [:], prevSets: [String: Int] = [:]
        var cardioMin = 0.0, prevCardioMin = 0.0
        var cardioCount = 0

        func accumulate(_ s: GymSession, isThisWeek: Bool) {
            for b in s.blocks where b.type == "single" {
                guard let cat = categorize(b.exerciseId, custom: custom) else { continue }
                let done = b.sets.filter(\.done)
                guard !done.isEmpty else { continue }
                if cat == "cardio" {
                    if isThisWeek {
                        cardioCount += done.count
                        for st in done { cardioMin += (st.duration ?? 0) / 60 }
                    } else {
                        for st in done { prevCardioMin += (st.duration ?? 0) / 60 }
                    }
                    continue
                }
                if isThisWeek { thisSets[cat, default: 0] += done.count }
                else { prevSets[cat, default: 0] += done.count }
            }
        }
        for s in sessions {
            if s.date >= thisFrom && s.date <= todayISO { accumulate(s, isThisWeek: true) }
            else if s.date >= prevFrom && s.date <= prevTo { accumulate(s, isThisWeek: false) }
        }

        let parts = balanceParts.map {
            BalancePart(key: $0.key, name: $0.name,
                        sets: thisSets[$0.key] ?? 0, prevSets: prevSets[$0.key] ?? 0)
        }
        var focusKey: String? = nil
        if parts.contains(where: { $0.sets > 0 }) {
            var minSets = Int.max
            for p in parts where p.sets < minSets { minSets = p.sets; focusKey = p.key }
        }
        let maxBar = Swift.max(1, parts.map { Swift.max($0.sets, $0.prevSets) }.max() ?? 1)
        return WeeklyBalance(parts: parts,
                             cardioMin: Int(cardioMin.rounded()),
                             cardioCount: cardioCount,
                             cardioDeltaMin: Int(cardioMin.rounded()) - Int(prevCardioMin.rounded()),
                             focusKey: focusKey, max: maxBar)
    }
}

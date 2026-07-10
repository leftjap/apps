import Foundation

// HomeC "다음" 미리보기 항목 — home.js formatBlockPreview 반환 shape.
public struct GymNextBlockPreview: Equatable, Sendable {
    public let name: String
    public let summary: String
    public init(name: String, summary: String) { self.name = name; self.summary = summary }
}

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

    // MARK: - 유산소 행 문구 (home.js applyBalanceToDom — 행은 항상 표시)

    /// "84분 · 3회" / "2회"(분 0) / "기록 없음"(회 0).
    public static func cardioSubText(min: Int, count: Int) -> String {
        guard count > 0 else { return "기록 없음" }
        return min > 0 ? "\(min)분 · \(count)회" : "\(count)회"
    }

    /// "▲12분" / "▼5분". 유산소가 없거나 증감이 없으면 nil (표시 안 함).
    public static func cardioDeltaText(count: Int, deltaMin: Int) -> String? {
        guard count > 0, deltaMin != 0 else { return nil }
        return "\(deltaMin > 0 ? "▲" : "▼")\(abs(deltaMin))분"
    }

    // MARK: - HomeC "다음" 미리보기 (home.js summarizeNextBlocks + formatBlockPreview 정합)

    // 미완료 판정 — home.js isSingleBlockIncomplete: single + finishedAt 없음 + (빈 세트 or 일부 미완료).
    static func isSingleBlockIncomplete(_ b: GymBlock) -> Bool {
        guard b.type == "single", b.finishedAt == nil else { return false }
        if b.sets.isEmpty { return true }
        return b.sets.contains { !$0.done }
    }

    static func blockPreview(_ b: GymBlock, custom: [GymCustomExercise]) -> GymNextBlockPreview {
        let name = GymExercises.resolveName(b.exerciseId, custom: custom)
        let equipment = GymExercises.def(b.exerciseId, custom: custom)?.equipment
        let first = b.sets.first
        func g(_ v: Double) -> String { String(format: "%g", v) }
        switch equipment {
        case "cardio":
            let mins = Int(((first?.duration ?? 0) / 60).rounded())
            let dist = first?.distance ?? 0
            return GymNextBlockPreview(name: name,
                                       summary: dist > 0 ? "\(mins)분 · \(g(dist))km" : "\(mins)분")
        case "bodyweight":
            return GymNextBlockPreview(name: name,
                                       summary: "맨몸 \(first?.reps ?? 0)회 · \(b.sets.count)세트")
        default:
            return GymNextBlockPreview(name: name,
                                       summary: "\(g(first?.weight ?? 0))×\(first?.reps ?? 0) · \(b.sets.count)세트")
        }
    }

    // 현재 진행 블록(첫 미완료) 이후의 미완료 블록 미리보기 — active 세션만, 최대 limit 개.
    public static func nextBlockPreviews(session: GymSession, custom: [GymCustomExercise],
                                         limit: Int = 2) -> [GymNextBlockPreview] {
        guard session.status == .active,
              let curIdx = session.blocks.firstIndex(where: { isSingleBlockIncomplete($0) }) else { return [] }
        var out: [GymNextBlockPreview] = []
        for b in session.blocks.dropFirst(curIdx + 1) where isSingleBlockIncomplete(b) {
            out.append(blockPreview(b, custom: custom))
            if out.count >= limit { break }
        }
        return out
    }
}

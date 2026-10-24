import Foundation

/// Logging convention, not measured machine force or mechanical work.
/// Raw `weight` remains the machine's assistance label. No platform offset is assumed.
public enum GymAssistedLoad {
    public static let confirmedBodyWeightKg = 73.0
    public static let confirmedOn = "2026-10-24"

    public static func isAssistedName(_ name: String) -> Bool {
        let key = name.lowercased().filter { $0.isLetter || $0.isNumber }
        return ["어시스티드친", "어시스티드친업", "어시스트친", "어시스트친업",
                "어시스티드풀업", "어시스트풀업", "assistedchin", "assistedchinup", "assistedpullup"].contains(key)
    }

    public static func isAssisted(_ block: GymBlock, custom: [GymCustomExercise] = []) -> Bool {
        block.sets.contains { $0.weightMode == "assistance" }
            || GymExercises.def(block.exerciseId, custom: custom)?.equipment == "assisted"
    }

    public static func effectiveLoad(_ set: GymSet) -> Double? {
        guard set.weightMode == "assistance", let body = set.bodyWeightKg,
              body.isFinite, body > 0, let assistance = set.weight,
              assistance.isFinite, assistance >= 0 else { return nil }
        return max(0, body - assistance)
    }

    public static func estimatedVolume(_ set: GymSet) -> Double? {
        guard let load = effectiveLoad(set), let reps = set.reps, reps >= 0 else { return nil }
        return load * Double(reps)
    }

    public static func estimatedTotal(_ sets: [GymSet]) -> Double? {
        guard !sets.isEmpty else { return nil }
        let values = sets.compactMap(estimatedVolume)
        guard values.count == sets.count else { return nil }
        return values.reduce(0, +)
    }

    /// Only a value confirmed now or an actual subsequent weigh-in can be used for a new set.
    /// This does not add anything to weight history, and is never applied to completed old sets.
    public static func currentBodyWeight(weights: [GymWeight], today: String) -> Double? {
        guard today >= confirmedOn else { return nil }
        return weights.filter { $0.date >= confirmedOn && $0.date <= today && $0.kg.isFinite && $0.kg > 0 }
            .max { $0.date < $1.date }?.kg ?? confirmedBodyWeightKg
    }

    public static func snapshot(_ set: GymSet, bodyWeightKg: Double?) -> GymSet {
        var out = set
        out.weightMode = "assistance"
        if out.bodyWeightKg == nil, let bodyWeightKg, bodyWeightKg.isFinite, bodyWeightKg > 0 {
            out.bodyWeightKg = bodyWeightKg
        }
        out.pr = false
        return out
    }

    /// A copy for calculations/UI; the caller's saved history and raw assistance are untouched.
    public static func projected(_ block: GymBlock, custom: [GymCustomExercise] = [],
                                 previewBodyWeightKg: Double? = nil) -> GymBlock {
        guard isAssisted(block, custom: custom) else { return block }
        var out = block
        out.sets = block.sets.map { set in
            snapshot(set, bodyWeightKg: set.done ? nil : previewBodyWeightKg)
        }
        return out
    }

    public static func projected(_ session: GymSession, custom: [GymCustomExercise] = [],
                                 previewBodyWeightKg: Double? = nil) -> GymSession {
        var out = session
        out.blocks = session.blocks.map { projected($0, custom: custom, previewBodyWeightKg: previewBodyWeightKg) }
        // Old persisted totals can include assistance × reps. Correct only the derived copy.
        if session.blocks.contains(where: { isAssisted($0, custom: custom) }) {
            out.totalVolume = out.blocks.reduce(0) { $0 + $1.sets.filter(\.done).reduce(0) { $0 + $1.externalVolume } }
        }
        return out
    }

    public static func assistanceReduction(current: GymSet, previous: [GymSet]) -> Double? {
        guard let weight = current.weight, let reps = current.reps, reps > 0,
              let previousMinimum = previous.filter({ $0.reps == reps }).compactMap(\.weight).min(),
              weight < previousMinimum else { return nil }
        return previousMinimum - weight
    }
}

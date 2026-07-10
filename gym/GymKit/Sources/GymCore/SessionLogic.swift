import Foundation

// 세션 상태머신 순수 로직 — PWA src/features/session.js 1:1 포팅.
// (buildPresetSets / addExerciseToActiveSession / handleLeftSwipe / resolveDotDisplay+formatSetSegment / pace)

// 카드 종류 — equipment 기반 분기 (spec §6-3·§6-4).
public enum GymCardKind: Equatable, Sendable {
    case weight, bodyweight, cardio
    public static func from(equipment: String) -> GymCardKind {
        equipment == "cardio" ? .cardio : equipment == "bodyweight" ? .bodyweight : .weight
    }
}

// 세트바 슬롯 표시 값 (formatSetSegment 정합 — top 굵게 / bottom 작게).
public struct GymDotDisplay: Equatable, Sendable {
    public let top: String
    public let bottom: String
    public let isPreview: Bool   // 미입력 preview(회색 톤) 여부
    public init(top: String, bottom: String, isPreview: Bool) {
        self.top = top; self.bottom = bottom; self.isPreview = isPreview
    }
}

public enum GymSessionLogic {

    // 소수 없는 값은 정수 표기 ("62.5"·"60") — JS 템플릿 문자열 정합.
    static func num(_ v: Double) -> String { String(format: "%g", v) }

    // MARK: - 프리셋 생성 (spec §6-3-3)

    // ③ 운동 기본값 prefill — defaultSets 개수만큼 preset:true. cardio 는 단일 세트(§6-4).
    public static func buildPresetSets(_ def: GymExerciseDef?) -> [GymSet] {
        guard let def else { return [] }
        let isCardio = def.equipment == "cardio"
        let isBodyweight = def.equipment == "bodyweight"
        let count = isCardio ? 1 : max(1, def.defaultSets)
        return (0..<count).map { _ in
            GymSet(weight: isCardio || isBodyweight ? nil : def.defaultWeight,
                   reps: isCardio ? nil : def.defaultReps,
                   preset: true)
        }
    }

    // ① 직전 세션 세트 카피 — weight/reps + cardio duration/distance 보존.
    public static func presetSets(fromPrev prevSets: [GymSet]) -> [GymSet] {
        prevSets.map {
            GymSet(weight: $0.weight, reps: $0.reps, preset: true,
                   duration: $0.duration, distance: $0.distance)
        }
    }

    // MARK: - 운동 추가/제거 (spec §6-1·§6-2)

    // 첫 종목 선택 순간 = startTime. 중복 exerciseId 거부. tags 에 part 누적.
    public static func addExercise(to session: GymSession, exerciseId: String, part: String,
                                   presetSets: [GymSet], now: Int64) -> (session: GymSession, added: Bool) {
        var s = session
        if s.blocks.contains(where: { $0.type == "single" && $0.exerciseId == exerciseId }) {
            return (s, false)
        }
        if s.startTime == nil { s.startTime = now }
        s.blocks.append(GymBlock(exerciseId: exerciseId, sets: presetSets))
        if !part.isEmpty && !s.tags.contains(part) { s.tags.append(part) }
        return (s, true)
    }

    // 블록 제거 — 해당 part 의 다른 블록이 없으면 tags 에서도 제거.
    public static func removeExercise(from session: GymSession, exerciseId: String,
                                      partResolver: (String) -> String) -> (session: GymSession, removed: Bool) {
        var s = session
        guard let idx = s.blocks.firstIndex(where: { $0.type == "single" && $0.exerciseId == exerciseId }) else {
            return (s, false)
        }
        let part = partResolver(exerciseId)
        s.blocks.remove(at: idx)
        if !part.isEmpty, !s.blocks.contains(where: { partResolver($0.exerciseId) == part }) {
            s.tags.removeAll { $0 == part }
        }
        return (s, true)
    }

    // MARK: - 좌 스와이프 커밋 (spec §6-3-1 handleLeftSwipe)

    // cur 세트 done 커밋. 마지막 세트면 preset 카피 추가. cur == -1(전부 완료)이면 추가만.
    // 다음 세트 상속(②)은 미수정 preset + 직전 세션 같은 세트번호 기록(reps>0) 없을 때만 (① 보존).
    public static func completeSet(sets: [GymSet], cur: Int,
                                   prevSessionSets: [GymSet]?) -> (sets: [GymSet], committed: Int?) {
        var out = sets
        if cur == -1 {
            let last = out.last
            out.append(GymSet(weight: last?.weight, reps: last?.reps, preset: true,
                              duration: last?.duration, distance: last?.distance))
            return (out, nil)
        }
        guard out.indices.contains(cur) else { return (out, nil) }
        out[cur].done = true
        out[cur].preset = false
        let committed = out[cur]
        if cur == out.count - 1 {
            out.append(GymSet(weight: committed.weight, reps: committed.reps, preset: true,
                              duration: committed.duration, distance: committed.distance))
        } else if out[cur + 1].preset {
            let ps: GymSet? = prevSessionSets.flatMap { $0.indices.contains(cur + 1) ? $0[cur + 1] : nil }
            let hasPrevSame = (ps?.reps ?? 0) > 0
            if !hasPrevSame {
                out[cur + 1].weight = committed.weight
                out[cur + 1].reps = committed.reps
            }
        }
        return (out, cur)
    }

    // PR 평가 대상 — 유의미한 중량 세트만 (0·nil·맨몸 제외, session.js (g) 가드 정합).
    public static func isPRCandidate(_ set: GymSet) -> Bool {
        (set.weight ?? 0) > 0 && (set.reps ?? 0) > 0
    }

    // MARK: - 블록 완료·잠금 (spec §6-8·§6-9)

    // 명시적 "완료" 액션 — done 세트만 보존(빈 세트 폐기) + finishedAt 스탬프.
    public static func finishBlock(_ block: GymBlock, now: Double) -> GymBlock {
        var b = block
        b.sets = b.sets.filter(\.done)
        b.finishedAt = now
        return b
    }

    // 잠금(read-only) = 명시적 완료만. 세트 전부 done 은 잠금 아님 (push/revert 보존).
    public static func isBlockLocked(_ block: GymBlock) -> Bool { block.finishedAt != nil }

    // 푸터 pill done 판정 = finishedAt 또는 세트 전부 done.
    public static func isBlockDone(_ block: GymBlock) -> Bool {
        block.finishedAt != nil || block.sets.allSatisfy(\.done)
    }

    // 완료 후 현재 종목 = 첫 미완료 블록 (전부 완료면 nil — 마지막 카드 read-only 유지).
    public static func firstUnfinishedBlockIdx(_ session: GymSession) -> Int? {
        session.blocks.firstIndex { $0.type == "single" && !isBlockDone($0) }
    }

    // MARK: - 세트바 표시 (resolveDotDisplay + formatSetSegment)

    // done/current 는 실값, 미입력 preview 는 ① 직전 세션 같은 세트번호 → (직전 세션 없을 때만)
    // ② 이번 세션 직전 세트 → ③ sets[i] 자체 preset → '—'.
    public static func dotDisplay(sets: [GymSet], i: Int, cur: Int,
                                  prevSessionSets: [GymSet]?, kind: GymCardKind) -> GymDotDisplay {
        let bw = kind == .bodyweight
        func hasVal(_ s: GymSet?) -> Bool {
            guard let s else { return false }
            return s.reps != nil && (bw || s.weight != nil)
        }
        func meaningful(_ s: GymSet?) -> Bool { hasVal(s) && (s?.reps ?? 0) > 0 }
        func seg(_ s: GymSet, preview: Bool) -> GymDotDisplay {
            bw ? GymDotDisplay(top: "\(s.reps ?? 0)", bottom: "회", isPreview: preview)
               : GymDotDisplay(top: num(s.weight ?? 0), bottom: "×\(s.reps ?? 0)", isPreview: preview)
        }
        func dash(_ preview: Bool) -> GymDotDisplay { GymDotDisplay(top: "—", bottom: "", isPreview: preview) }

        let set: GymSet? = sets.indices.contains(i) ? sets[i] : nil
        if i == cur {
            if let set, hasVal(set) { return seg(set, preview: false) }
            return dash(false)
        }
        if let set, set.done, hasVal(set) { return seg(set, preview: false) }
        // ① 직전 세션 같은 세트번호 — 직전 세션이 존재하면 그 값만 (없는 세트번호는 '—').
        if let prev = prevSessionSets, !prev.isEmpty {
            if prev.indices.contains(i), hasVal(prev[i]) { return seg(prev[i], preview: true) }
            return dash(true)
        }
        // ② 이번 세션 직전 세트 (done 또는 현재 세트 값) — 첫 운동일 때만.
        var j = i - 1
        while j >= 0 {
            let s = sets[j]
            if meaningful(s), s.done || j == cur { return seg(s, preview: true) }
            j -= 1
        }
        // ③ sets[i] 자체 preset
        if let set, hasVal(set) { return seg(set, preview: true) }
        return dash(true)
    }

    // MARK: - 유산소 페이스 (spec §6-4) — "9:23/km". 시간·거리 둘 다 있어야 표시.

    public static func paceText(durationSec: Double?, distanceKm: Double?) -> String? {
        guard let d = durationSec, d > 0, let km = distanceKm, km > 0 else { return nil }
        let pace = d / km
        let mm = Int(pace / 60)
        let ss = Int((pace.truncatingRemainder(dividingBy: 60)).rounded())
        return String(format: "%d:%02d/km", mm, ss)
    }
}

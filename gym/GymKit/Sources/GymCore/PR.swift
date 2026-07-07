import Foundation

// PR 감지 — Epley e1RM 공식 + 판정 (PWA src/services/pr.js 1:1 포팅, spec §6-11·§12).
// 순수 함수만 (저장 무관). LocalStore 의 prs CRUD 와 결합해 사용.
public enum GymPRLogic {
    // Epley 1RM 추정. weight·reps 양수 아니면 0 (prevBest 초과 못함 보장).
    public static func epley(_ weight: Double, _ reps: Int) -> Double {
        guard weight > 0, reps > 0 else { return 0 }
        return weight * (1 + Double(reps) / 30)
    }

    // 0.1 단위 반올림 (비교는 정확, 표시는 반올림). e1rm ≥ 0 이라 JS Math.round 와 동치.
    public static func roundE1RM(_ e: Double) -> Double { (e * 10).rounded() / 10 }

    // 운동의 이전 최고 e1RM PR (type=e1rm). 없으면 nil.
    public static func findBestE1RM(_ prs: [GymPR], exerciseId: String) -> GymPR? {
        prs.filter { $0.exerciseId == exerciseId && $0.type == .e1rm }
            .max { $0.e1rm < $1.e1rm }
    }

    public struct SetPRResult: Sendable {
        public let isPR: Bool
        public let e1rm: Double
        public let prevBest: GymPR?
    }

    // 세트 PR 판정 — 새 e1rm 이 이전 최고보다 엄격 초과 시 isPR (동률 false, evaluateSetPR 정합).
    public static func evaluateSetPR(weight: Double, reps: Int, prs: [GymPR], exerciseId: String) -> SetPRResult {
        let e = roundE1RM(epley(weight, reps))
        if e <= 0 { return SetPRResult(isPR: false, e1rm: 0, prevBest: nil) }
        let prev = findBestE1RM(prs, exerciseId: exerciseId)
        let prevE = prev.map { roundE1RM($0.e1rm) }
        let isPR = prevE == nil ? true : e > prevE!
        return SetPRResult(isPR: isPR, e1rm: e, prevBest: prev)
    }

    // PR 객체 생성 (upsert 전달용, buildPR 정합).
    public static func buildPR(exerciseId: String, weight: Double, reps: Int,
                               date: String, sessionId: String?, type: GymPRType = .e1rm) -> GymPR {
        GymPR(exerciseId: exerciseId, type: type, weight: weight, reps: reps,
              e1rm: roundE1RM(epley(weight, reps)), date: date, sessionId: sessionId)
    }

    // 세션 1건의 운동별 최고 e1RM 세트 (세트 삭제/수정 시 재계산용, findBestSetsInSession 정합).
    public struct BestSet: Sendable, Equatable { public let weight: Double; public let reps: Int; public let e1rm: Double }
    public static func findBestSetsInSession(_ session: GymSession) -> [String: BestSet] {
        var out: [String: BestSet] = [:]
        for block in session.blocks {
            let exId = block.exerciseId
            for s in block.sets where s.done {
                let w = s.weight ?? 0, r = s.reps ?? 0
                let e = roundE1RM(epley(w, r))
                if e <= 0 { continue }
                if let prev = out[exId], e <= prev.e1rm { continue }
                out[exId] = BestSet(weight: w, reps: r, e1rm: e)
            }
        }
        return out
    }
}

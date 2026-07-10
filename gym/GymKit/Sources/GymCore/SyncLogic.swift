import Foundation

// 동기화 병합 로직 — PWA src/db/sync.js 충돌 해결·안전장치 1:1 포팅 (spec §4).
public enum GymSyncLogic {

    // 세션 충돌 — completed 는 active 로 회귀하지 않음. 같은 status 면 endTime(없으면 startTime)
    // 늦은 쪽, 동률이면 server (resolveSessionConflict 정합).
    public static func resolveSession(local: GymSession?, server: GymSession?) -> GymSession {
        guard let local else { return server! }
        guard let server else { return local }
        let lc = local.status == .completed, sc = server.status == .completed
        if lc != sc { return lc ? local : server }
        let lt = local.endTime ?? local.startTime ?? 0
        let st = server.endTime ?? server.startTime ?? 0
        return st >= lt ? server : local
    }

    // PR 충돌 — e1rm 큰 쪽 (동률 server, resolveConflict 정합).
    public static func resolvePR(local: GymPR?, server: GymPR?) -> GymPR {
        guard let local else { return server! }
        guard let server else { return local }
        return local.e1rm > server.e1rm ? local : server
    }

    // 설정 충돌 — updatedAt LWW. 로컬 최신(미push 변경)만 로컬 보존, 그 외 서버 우선.
    public static func resolveSettings(local: GymUserSettings?, server: GymUserSettings?) -> GymUserSettings {
        guard let local else { return server! }
        guard let server else { return local }
        return local.updatedAt > server.updatedAt ? local : server
    }

    // 50% 급감 차단 — 전체 push 한정. localCount/serverCount < 0.5 면 업로드 차단 (spec §4).
    public static func isShrinkBlocked(localCount: Int, serverCount: Int?) -> Bool {
        guard let sc = serverCount, sc > 0 else { return false }
        return Double(localCount) / Double(sc) < 0.5
    }

    // 세션 리스트 병합 — id union + 충돌 해결. 로컬 전용/서버 전용 모두 보존.
    public static func mergeSessions(local: [GymSession], server: [GymSession]) -> [GymSession] {
        var byId: [String: GymSession] = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
        for s in server {
            byId[s.id] = resolveSession(local: byId[s.id], server: s)
        }
        return byId.values.sorted { ($0.startTime ?? 0) > ($1.startTime ?? 0) }
    }

    // PR 리스트 병합 — id(exerciseId_type) union + e1rm 큰 쪽.
    public static func mergePRs(local: [GymPR], server: [GymPR]) -> [GymPR] {
        var byId: [String: GymPR] = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
        for p in server {
            byId[p.id] = resolvePR(local: byId[p.id], server: p)
        }
        return Array(byId.values)
    }

    // 체중 병합 — date PK, 서버 우선 bulkPut 정합 (로컬 전용 date 는 보존).
    public static func mergeWeights(local: [GymWeight], server: [GymWeight]) -> [GymWeight] {
        var byDate: [String: GymWeight] = Dictionary(uniqueKeysWithValues: local.map { ($0.date, $0) })
        for w in server { byDate[w.date] = w }
        return byDate.values.sorted { $0.date > $1.date }
    }

    // 커스텀 운동 병합 — id PK, 서버 우선 (로컬 전용 보존).
    public static func mergeCustom(local: [GymCustomExercise], server: [GymCustomExercise]) -> [GymCustomExercise] {
        var byId: [String: GymCustomExercise] = Dictionary(uniqueKeysWithValues: local.map { ($0.id, $0) })
        for c in server { byId[c.id] = c }
        return Array(byId.values)
    }
}

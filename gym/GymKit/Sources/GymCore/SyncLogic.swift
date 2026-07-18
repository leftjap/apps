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

    /// 서버로 올릴 세션 목록 (history + 진행 중 세션).
    ///
    /// 같은 id 가 두 번 들어가면 Postgres 가 upsert 를 통째로 거부한다 —
    /// 21000 "ON CONFLICT DO UPDATE command cannot affect row a second time".
    /// 운동을 끝내면 세션 슬롯에 '완료' 세션이 남고 같은 세션이 history 에도 들어가므로,
    /// 슬롯을 그대로 붙이면 매번 중복이 되어 그 뒤 모든 동기화가 실패한다
    /// (2026-07-14: 백업이 4일간 멈춘 진짜 원인. 빈 catch 가 에러를 삼켜 보이지 않았다).
    /// → 진행 중(active) 이고 history 에 없는 세션만 추가하고, 최종적으로 id 중복을 제거한다.
    public static func sessionsToPush(history: [GymSession], current: GymSession) -> [GymSession] {
        var out = history
        let alreadyInHistory = history.contains { $0.id == current.id }
        if current.status == .active, !current.blocks.isEmpty, !alreadyInHistory {
            out.append(current)
        }
        var seen = Set<String>()
        return out.filter { seen.insert($0.id).inserted }
    }

    /// 서버에 쌓인 orphan active 세션 id — 서버 정리(삭제) 대상.
    ///
    /// discard/sweep 로 로컬에선 이미 버려졌지만 서버 복사본(먼저 push된 active)이 남은 세션을 골라낸다.
    /// pull 은 completed 만 병합(GymAppModel syncNow)하므로 서버 active 는 영영 정리되지 않아 무한 누적된다
    /// (2026-07-18 실측: 서버에 active 3개 — discardSession/sweep 잔존). 앱이 이미 로컬에서 버린 결정을
    /// 서버에 전파하는 것이라 신규 데이터 손실이 없다.
    ///
    /// 안전장치: **done 세트가 하나라도 있는 active 는 제외**(커밋된 작업 보존) + **현재 세션(keepId) 제외**.
    /// 즉 삭제 대상 = active && id ≠ keepId && 세트 전부 미완료(0 done).
    public static func abandonedActiveSessionIds(server: [GymSession], keepId: String) -> [String] {
        server.filter { s in
            s.status == .active
                && s.id != keepId
                && !s.blocks.contains { $0.sets.contains(where: \.done) }
        }.map(\.id)
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

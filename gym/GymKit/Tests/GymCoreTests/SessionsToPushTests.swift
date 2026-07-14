import Foundation
import Testing
@testable import GymCore

// 서버로 올릴 세션 목록 — 같은 id 가 두 번 들어가면 Postgres 가 upsert 전체를 거부한다.
//   21000: "ON CONFLICT DO UPDATE command cannot affect row a second time"
// 2026-07-14 실측(기기 syncState.lastError): 운동을 끝내면 세션 슬롯에 '완료' 세션이 남고
// 같은 세션이 history 에도 들어간다. syncNow 가 history + 슬롯을 그대로 합쳐 올려 중복 id 가
// 되고, 그 뒤 모든 동기화가 실패해 백업이 4일간 멈췄다(에러는 빈 catch 가 삼켰다).
@Suite struct SessionsToPushTests {

    func mk(_ id: String, _ status: GymSessionStatus, blocks: Int = 1) -> GymSession {
        GymSession(id: id, date: "2026-07-14",
                   blocks: (0..<blocks).map { _ in
                       GymBlock(exerciseId: "squat", sets: [GymSet(weight: 100, reps: 5, done: true)])
                   },
                   status: status)
    }

    // 핵심 회귀: 완료 세션이 슬롯에 남아 있고 history 에도 있으면 중복으로 붙이면 안 된다.
    @Test func completedSlotSessionIsNotDuplicated() {
        let done = mk("A", .completed)
        let history = [done, mk("B", .completed)]
        let push = GymSyncLogic.sessionsToPush(history: history, current: done)
        #expect(push.count == 2)
        #expect(push.filter { $0.id == "A" }.count == 1, "같은 id 가 두 번 들어가면 21000 으로 업로드 전체 실패")
    }

    // 진행 중 세션은 history 에 없으므로 백업 대상으로 추가한다.
    @Test func activeSessionIsAppendedForBackup() {
        let history = [mk("B", .completed)]
        let active = mk("A", .active)
        let push = GymSyncLogic.sessionsToPush(history: history, current: active)
        #expect(push.map(\.id) == ["B", "A"])
    }

    // 빈 진행 세션(운동 시작 전)은 올릴 게 없다.
    @Test func emptyActiveSessionIsNotPushed() {
        let history = [mk("B", .completed)]
        let empty = mk("A", .active, blocks: 0)
        #expect(GymSyncLogic.sessionsToPush(history: history, current: empty).map(\.id) == ["B"])
    }

    // history 자체에 중복이 섞여 있어도 방어한다 (upsert 가 통째로 실패하지 않게).
    @Test func dedupesDuplicateIdsInHistory() {
        let history = [mk("A", .completed), mk("A", .completed), mk("B", .completed)]
        let push = GymSyncLogic.sessionsToPush(history: history, current: mk("C", .active, blocks: 0))
        #expect(push.map(\.id) == ["A", "B"])
    }
}

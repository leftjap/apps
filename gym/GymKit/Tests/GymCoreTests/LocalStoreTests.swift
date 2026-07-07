import Testing
import Foundation
@testable import GymCore

// 로컬 영속 — save/load/clear 왕복.
@Suite struct LocalStoreTests {
    @Test func sessionRoundTrip() {
        LocalStore.clearSession()
        #expect(LocalStore.loadSession() == nil)
        let s = GymSession(id: "p1", date: "2026-07-07",
            blocks: [GymBlock(exerciseId: "bench", sets: [GymSet(weight: 70, reps: 8, done: true)])],
            status: .active)
        LocalStore.saveSession(s)
        let back = LocalStore.loadSession()
        #expect(back?.id == "p1")
        #expect(back?.blocks.first?.sets.first?.weight == 70)
        #expect(back?.blocks.first?.sets.first?.done == true)
        LocalStore.clearSession()
        #expect(LocalStore.loadSession() == nil)
    }
}

import Testing
import Foundation
@testable import GymCore

// GymCore 모델 — PWA Dexie/Supabase 구조 정합 최소 보증 (Swift Testing, CLT ./test.sh).
@Suite struct ModelsTests {
    @Test func sessionRoundTrip() throws {
        let s = GymSession(
            id: "s1", date: "2026-07-07", startTime: 1_700_000_000_000,
            blocks: [GymBlock(exerciseId: "bench", sets: [GymSet(weight: 60, reps: 10, done: true)])],
            tags: ["chest"], totalVolume: 600, status: .active)
        let data = try JSONEncoder().encode(s)
        let back = try JSONDecoder().decode(GymSession.self, from: data)
        #expect(back.id == "s1")
        #expect(back.blocks.first?.exerciseId == "bench")
        #expect(back.blocks.first?.sets.first?.weight == 60)
        #expect(back.blocks.first?.sets.first?.done == true)
        #expect(back.status == .active)
    }

    @Test func cardioSetNilFields() throws {
        let set = GymSet(weight: nil, reps: nil, done: false)
        let data = try JSONEncoder().encode(set)
        let back = try JSONDecoder().decode(GymSet.self, from: data)
        #expect(back.weight == nil)
        #expect(back.reps == nil)
    }
}

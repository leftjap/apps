import Foundation
import Testing
@testable import GymCore

// 실서버(gym_sessions.blocks jsonb) 원형 디코딩 — PWA 저장분은 블록·세트에 id 가 없다
// (2026-07-10 프로덕션 35세션 200블록 전수 스캔: block keys = type/exerciseId/sets/finishedAt).
// 네이티브 GymBlock 이 이 shape 을 못 읽으면 로그인해도 실데이터 반영이 조용히 실패한다.
@Suite struct RealServerDecodeTests {

    // 프로덕션 2026-07-09 세션 blocks 축약 원형 (키 구성 그대로 — id 없음, cardio 세트 포함)
    let realBlocksJSON = """
    [{"type":"single","exerciseId":"pullover_machine","finishedAt":1783585000000,
      "sets":[{"pr":false,"done":true,"reps":20,"preset":false,"weight":15},
              {"pr":false,"done":true,"reps":15,"preset":false,"weight":25}]},
     {"type":"single","exerciseId":"treadmill",
      "sets":[{"pr":false,"done":true,"preset":false,"duration":1500,"distance":3.2}]}]
    """

    @Test func decodesRealServerBlocksWithoutIds() throws {
        let blocks = try JSONDecoder().decode([GymBlock].self, from: Data(realBlocksJSON.utf8))
        #expect(blocks.count == 2)
        #expect(blocks[0].type == "single" && blocks[0].exerciseId == "pullover_machine")
        #expect(blocks[0].sets.count == 2 && blocks[0].sets[0].weight == 15 && blocks[0].sets[0].done)
        #expect(blocks[0].finishedAt == 1_783_585_000_000)
        #expect(blocks[1].finishedAt == nil)
        #expect(blocks[1].sets[0].duration == 1500 && blocks[1].sets[0].distance == 3.2)
    }

    // 네이티브 인코딩(id 포함) 왕복은 기존대로 보존돼야 한다.
    @Test func nativeRoundTripKeepsIds() throws {
        let b = GymBlock(exerciseId: "bench_press", sets: [GymSet(weight: 60, reps: 10, done: true)])
        let data = try JSONEncoder().encode([b])
        let back = try JSONDecoder().decode([GymBlock].self, from: data)
        #expect(back[0].id == b.id && back[0].sets[0].id == b.sets[0].id)
    }
}

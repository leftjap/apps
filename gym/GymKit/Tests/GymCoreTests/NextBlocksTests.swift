import Foundation
import Testing
@testable import GymCore

// 홈 HomeC "다음" 미리보기 — PWA home.js summarizeNextBlocks + formatBlockPreview 정합.
@Suite struct NextBlocksTests {

    func session(_ blocks: [GymBlock], status: GymSessionStatus = .active) -> GymSession {
        GymSession(id: "s", date: "2026-05-06", blocks: blocks, status: status)
    }
    func sets(_ n: Int, w: Double = 60, r: Int = 10, done: Bool = false) -> [GymSet] {
        (0..<n).map { _ in GymSet(weight: w, reps: r, done: done) }
    }

    @Test func currentBlockExcludedAndFollowingListed() {
        // 벤치(진행 중) → 스쿼트·플라이 미착수 → 미리보기 = [스쿼트, 플라이]
        let s = session([
            GymBlock(exerciseId: "bench_press", sets: sets(2, done: true) + sets(2)),
            GymBlock(exerciseId: "squat", sets: sets(4, w: 72)),
            GymBlock(exerciseId: "dumbbell_fly", sets: sets(3, w: 18, r: 12)),
        ])
        let out = GymHomeLogic.nextBlockPreviews(session: s, custom: [])
        #expect(out.count == 2)
        #expect(out[0] == GymNextBlockPreview(name: "스쿼트", summary: "72×10 · 4세트"))
        #expect(out[1] == GymNextBlockPreview(name: "덤벨 플라이", summary: "18×12 · 3세트"))
    }

    @Test func limitAndCompletedSkipped() {
        // finishedAt 잠금·전세트 done 블록은 스킵, limit 2 로 절단
        let s = session([
            GymBlock(exerciseId: "bench_press", sets: sets(2)),                          // current
            GymBlock(exerciseId: "incline_bench", sets: sets(3, done: true)),            // 전부 done → 스킵
            GymBlock(exerciseId: "squat", sets: sets(2, w: 70), finishedAt: 1),          // 잠금 → 스킵
            GymBlock(exerciseId: "leg_press", sets: sets(3, w: 110)),
            GymBlock(exerciseId: "leg_curl", sets: sets(3, w: 32, r: 12)),
            GymBlock(exerciseId: "deadlift", sets: sets(2, w: 90, r: 8)),
        ])
        let out = GymHomeLogic.nextBlockPreviews(session: s, custom: [])
        #expect(out.map(\.name) == ["레그 프레스", "레그 컬"])   // limit 2
    }

    @Test func cardioAndBodyweightSummaries() {
        let s = session([
            GymBlock(exerciseId: "bench_press", sets: sets(2)),   // current
            GymBlock(exerciseId: "treadmill", sets: [GymSet(duration: 1500, distance: 3.0)]),
            GymBlock(exerciseId: "pull_up", sets: [GymSet(reps: 8), GymSet(reps: 8), GymSet(reps: 8)]),
        ])
        let out = GymHomeLogic.nextBlockPreviews(session: s, custom: [], limit: 3)
        #expect(out[0] == GymNextBlockPreview(name: "트레드밀", summary: "25분 · 3km"))
        #expect(out[1] == GymNextBlockPreview(name: "풀업", summary: "맨몸 8회 · 3세트"))
        // 거리 없는 유산소 → "N분"
        let s2 = session([
            GymBlock(exerciseId: "bench_press", sets: sets(2)),
            GymBlock(exerciseId: "treadmill", sets: [GymSet(duration: 1800)]),
        ])
        #expect(GymHomeLogic.nextBlockPreviews(session: s2, custom: [])[0].summary == "30분")
    }

    @Test func emptyWhenNoCurrentOrInactive() {
        // 전 블록 완료 → current 없음 → []
        let allDone = session([GymBlock(exerciseId: "bench_press", sets: sets(2, done: true))])
        #expect(GymHomeLogic.nextBlockPreviews(session: allDone, custom: []).isEmpty)
        // active 아님 → []
        let completed = session([GymBlock(exerciseId: "bench_press", sets: sets(2))], status: .completed)
        #expect(GymHomeLogic.nextBlockPreviews(session: completed, custom: []).isEmpty)
        // 다음 블록 없음 (current 가 마지막) → []
        let single = session([GymBlock(exerciseId: "bench_press", sets: sets(2))])
        #expect(GymHomeLogic.nextBlockPreviews(session: single, custom: []).isEmpty)
    }

    @Test func customExerciseNameResolvedAndEmptySetsIncomplete() {
        // 커스텀 운동 이름 resolve + 빈 세트 블록 = 미완료 (home.js isSingleBlockIncomplete 정합)
        let cust = [GymCustomExercise(id: "cust_ab12", name: "체스트 프레스 머신", part: "chest")]
        let s = session([
            GymBlock(exerciseId: "bench_press", sets: sets(1)),
            GymBlock(exerciseId: "cust_ab12", sets: []),
        ])
        let out = GymHomeLogic.nextBlockPreviews(session: s, custom: cust)
        #expect(out.count == 1)
        #expect(out[0].name == "체스트 프레스 머신")
        #expect(out[0].summary == "0×0 · 0세트")   // 빈 세트 — home.js Number()||0 폴백 정합
    }
}

import Foundation
import Testing
@testable import GymCore

// 세션 상태머신 순수 로직 — session.js 정합 (buildPresetSets/addExercise/handleLeftSwipe/resolveDotDisplay/pace).
@Suite struct SessionLogicTests {

    // MARK: - GymSet 신규 필드 (preset·duration·distance) 관용 디코딩

    @Test func setDecodesLegacyJSONWithoutNewKeys() throws {
        let legacy = #"{"weight":60,"reps":10,"done":true}"#.data(using: .utf8)!
        let s = try JSONDecoder().decode(GymSet.self, from: legacy)
        #expect(s.preset == false)
        #expect(s.duration == nil)
        #expect(s.distance == nil)
    }

    @Test func setRoundtripsCardioFields() throws {
        let s = GymSet(done: true, preset: true, duration: 1800, distance: 3.2)
        let back = try JSONDecoder().decode(GymSet.self, from: JSONEncoder().encode(s))
        #expect(back.duration == 1800)
        #expect(back.distance == 3.2)
        #expect(back.preset == true)
    }

    // MARK: - 프리셋 생성 (§6-3-3 ③ 기본값 / ① 직전 세션 카피)

    @Test func buildPresetSetsFromDefaults() {
        let def = GymExerciseDef(id: "bench_press", name: "벤치프레스", part: "chest",
                                 equipment: "barbell", defaultSets: 5, defaultReps: 10,
                                 defaultWeight: 60, met: 5)
        let sets = GymSessionLogic.buildPresetSets(def)
        #expect(sets.count == 5)
        #expect(sets.allSatisfy { $0.preset && !$0.done && $0.weight == 60 && $0.reps == 10 })
    }

    @Test func buildPresetSetsCardioIsSingleNilSet() {
        let def = GymExerciseDef(id: "treadmill", name: "트레드밀", part: "cardio",
                                 equipment: "cardio", defaultSets: 5, defaultReps: 10,
                                 defaultWeight: 0, met: 8)
        let sets = GymSessionLogic.buildPresetSets(def)
        #expect(sets.count == 1)   // 1운동 = 1기록 (spec §6-4)
        #expect(sets[0].weight == nil && sets[0].reps == nil)
        #expect(sets[0].preset == true)
    }

    @Test func buildPresetSetsBodyweightHasNilWeight() {
        let def = GymExerciseDef(id: "pull_up", name: "턱걸이", part: "back",
                                 equipment: "bodyweight", defaultSets: 4, defaultReps: 10,
                                 defaultWeight: 0, met: 8)
        let sets = GymSessionLogic.buildPresetSets(def)
        #expect(sets.count == 4)
        #expect(sets.allSatisfy { $0.weight == nil && $0.reps == 10 })
    }

    @Test func presetSetsFromPrevCopiesValuesIncludingCardio() {
        let prev = [GymSet(weight: 60, reps: 10, done: true, pr: true),
                    GymSet(done: true, duration: 1800, distance: 3.2)]
        let sets = GymSessionLogic.presetSets(fromPrev: prev)
        #expect(sets.count == 2)
        #expect(sets[0].weight == 60 && sets[0].reps == 10)
        #expect(sets[0].done == false && sets[0].preset == true && sets[0].pr == false)
        #expect(sets[1].duration == 1800 && sets[1].distance == 3.2)
    }

    // MARK: - 운동 추가/제거 (§6-1·§6-2)

    @Test func addExerciseSetsStartTimeAndTags() {
        let s = GymSession(id: "s", date: "2026-07-10")
        let preset = [GymSet(weight: 60, reps: 10, preset: true)]
        let r = GymSessionLogic.addExercise(to: s, exerciseId: "bench_press", part: "chest",
                                            presetSets: preset, now: 1_000)
        #expect(r.added == true)
        #expect(r.session.startTime == 1_000)   // 첫 종목 선택 순간 = startTime
        #expect(r.session.blocks.count == 1)
        #expect(r.session.blocks[0].exerciseId == "bench_press")
        #expect(r.session.tags == ["chest"])
    }

    @Test func addExerciseDuplicateRejectedAndStartTimePreserved() {
        var s = GymSession(id: "s", date: "2026-07-10", startTime: 500,
                           blocks: [GymBlock(exerciseId: "bench_press", sets: [])], tags: ["chest"])
        let r = GymSessionLogic.addExercise(to: s, exerciseId: "bench_press", part: "chest",
                                            presetSets: [], now: 1_000)
        #expect(r.added == false)
        #expect(r.session.blocks.count == 1)
        // 같은 part 추가 시 tags 중복 없음
        s.blocks = []
        let r2 = GymSessionLogic.addExercise(to: s, exerciseId: "incline_bench", part: "chest",
                                             presetSets: [], now: 1_000)
        #expect(r2.session.startTime == 500)
        #expect(r2.session.tags == ["chest"])
    }

    @Test func removeExerciseDropsTagOnlyWhenLastOfPart() {
        let s = GymSession(id: "s", date: "2026-07-10", blocks: [
            GymBlock(exerciseId: "bench_press", sets: []),
            GymBlock(exerciseId: "incline_bench", sets: []),
            GymBlock(exerciseId: "squat", sets: []),
        ], tags: ["chest", "legs"])
        let part: (String) -> String = { id in id == "squat" ? "legs" : "chest" }
        let r1 = GymSessionLogic.removeExercise(from: s, exerciseId: "bench_press", partResolver: part)
        #expect(r1.removed == true)
        #expect(r1.session.blocks.count == 2)
        #expect(r1.session.tags == ["chest", "legs"])   // incline_bench 가 남아 chest 유지
        let r2 = GymSessionLogic.removeExercise(from: r1.session, exerciseId: "squat", partResolver: part)
        #expect(r2.session.tags == ["chest"])            // legs 마지막 → 제거
    }

    // MARK: - 좌 스와이프 커밋 (§6-3-1 handleLeftSwipe 정합)

    @Test func completeSetCommitsAndInheritsToNextPreset() {
        let sets = [GymSet(weight: 60, reps: 10, preset: true),
                    GymSet(weight: 65, reps: 10, preset: true),
                    GymSet(weight: 70, reps: 8, preset: true)]
        let r = GymSessionLogic.completeSet(sets: sets, cur: 0, prevSessionSets: nil)
        #expect(r.committed == 0)
        #expect(r.sets[0].done == true && r.sets[0].preset == false)
        // 직전 세션 기록 없음 → 직전 세트 상속(②)
        #expect(r.sets[1].weight == 60 && r.sets[1].reps == 10)
        #expect(r.sets.count == 3)   // 마지막 아님 → 추가 없음
    }

    @Test func completeSetPreservesPrevSessionTarget() {
        let sets = [GymSet(weight: 60, reps: 10, preset: true),
                    GymSet(weight: 65, reps: 10, preset: true)]
        let prev = [GymSet(weight: 60, reps: 10, done: true),
                    GymSet(weight: 62, reps: 10, done: true)]   // 같은 세트번호 기록 있음
        let r = GymSessionLogic.completeSet(sets: sets, cur: 0, prevSessionSets: prev)
        #expect(r.sets[1].weight == 65 && r.sets[1].reps == 10)   // ① 보존 — 상속으로 안 덮음
    }

    @Test func completeSetDoesNotInheritToUserEditedNext() {
        let sets = [GymSet(weight: 60, reps: 10, preset: true),
                    GymSet(weight: 80, reps: 5, preset: false)]   // 사용자 수정
        let r = GymSessionLogic.completeSet(sets: sets, cur: 0, prevSessionSets: nil)
        #expect(r.sets[1].weight == 80 && r.sets[1].reps == 5)
    }

    @Test func completeLastSetAppendsPresetCopy() {
        let sets = [GymSet(weight: 60, reps: 10, preset: true)]
        let r = GymSessionLogic.completeSet(sets: sets, cur: 0, prevSessionSets: nil)
        #expect(r.sets.count == 2)
        #expect(r.sets[0].done == true)
        #expect(r.sets[1].done == false && r.sets[1].preset == true)
        #expect(r.sets[1].weight == 60 && r.sets[1].reps == 10)
    }

    @Test func completeSetCurMinusOneAppendsOnly() {
        let sets = [GymSet(weight: 60, reps: 10, done: true)]
        let r = GymSessionLogic.completeSet(sets: sets, cur: -1, prevSessionSets: nil)
        #expect(r.committed == nil)
        #expect(r.sets.count == 2)
        #expect(r.sets[1].preset == true && r.sets[1].weight == 60)
    }

    @Test func completeSetPreservesCardioFields() {
        let sets = [GymSet(preset: true, duration: 1800, distance: 3.2)]
        let r = GymSessionLogic.completeSet(sets: sets, cur: 0, prevSessionSets: nil)
        #expect(r.sets[0].done == true)
        #expect(r.sets[0].duration == 1800 && r.sets[0].distance == 3.2)   // 2026-06-10 유실 회귀 방지
        #expect(r.sets[1].duration == 1800 && r.sets[1].distance == 3.2)
    }

    @Test func prCandidateRequiresPositiveWeightAndReps() {
        #expect(GymSessionLogic.isPRCandidate(GymSet(weight: 60, reps: 10)) == true)
        #expect(GymSessionLogic.isPRCandidate(GymSet(weight: 0, reps: 10)) == false)
        #expect(GymSessionLogic.isPRCandidate(GymSet(weight: 60, reps: 0)) == false)
        #expect(GymSessionLogic.isPRCandidate(GymSet(reps: 15)) == false)   // 맨몸 — PR 대상 아님
    }

    // MARK: - 블록 완료·잠금 (§6-8·§6-9)

    @Test func finishBlockPrunesNotDoneAndStampsFinishedAt() {
        let b = GymBlock(exerciseId: "bench_press", sets: [
            GymSet(weight: 60, reps: 10, done: true),
            GymSet(weight: 65, reps: 10, done: true),
            GymSet(weight: 70, reps: 8, preset: true)])
        let f = GymSessionLogic.finishBlock(b, now: 1_746_500_000_000)
        #expect(f.sets.count == 2)
        #expect(f.finishedAt == 1_746_500_000_000)
        #expect(GymSessionLogic.isBlockLocked(f) == true)
        #expect(GymSessionLogic.isBlockLocked(b) == false)
    }

    @Test func blockDoneByFinishedAtOrAllSetsDone() {
        let all = GymBlock(exerciseId: "a", sets: [GymSet(weight: 1, reps: 1, done: true)])
        let partial = GymBlock(exerciseId: "b", sets: [GymSet(weight: 1, reps: 1, done: false)])
        let marked = GymBlock(exerciseId: "c", sets: [GymSet(weight: 1, reps: 1, done: false)], finishedAt: 5)
        #expect(GymSessionLogic.isBlockDone(all) == true)
        #expect(GymSessionLogic.isBlockDone(partial) == false)
        #expect(GymSessionLogic.isBlockDone(marked) == true)
        let s = GymSession(id: "s", date: "d", blocks: [marked, partial, all])
        #expect(GymSessionLogic.firstUnfinishedBlockIdx(s) == 1)
    }

    // MARK: - 세트바 표시 (§6-3-3 resolveDotDisplay·formatSetSegment 정합)

    @Test func dotDisplayCurrentShowsActualOrDash() {
        let sets = [GymSet(weight: 60, reps: 10, preset: true), GymSet()]
        let d0 = GymSessionLogic.dotDisplay(sets: sets, i: 0, cur: 0, prevSessionSets: nil, kind: .weight)
        #expect(d0.top == "60" && d0.bottom == "×10" && d0.isPreview == false)
        let d1 = GymSessionLogic.dotDisplay(sets: [GymSet()], i: 0, cur: 0, prevSessionSets: nil, kind: .weight)
        #expect(d1.top == "—")
    }

    @Test func dotDisplayPrefersPrevSessionSameIndex() {
        let sets = [GymSet(weight: 60, reps: 10, done: true), GymSet(weight: 65, reps: 10, preset: true)]
        let prev = [GymSet(weight: 58, reps: 10, done: true), GymSet(weight: 62, reps: 9, done: true)]
        let d = GymSessionLogic.dotDisplay(sets: sets, i: 1, cur: 0, prevSessionSets: prev, kind: .weight)
        #expect(d.top == "62" && d.bottom == "×9" && d.isPreview == true)
    }

    @Test func dotDisplayDashWhenPrevSessionLacksIndex() {
        let sets = [GymSet(weight: 60, reps: 10, done: true), GymSet(weight: 65, reps: 10, preset: true)]
        let prev = [GymSet(weight: 58, reps: 10, done: true)]   // 직전은 1세트뿐
        let d = GymSessionLogic.dotDisplay(sets: sets, i: 1, cur: 0, prevSessionSets: prev, kind: .weight)
        #expect(d.top == "—" && d.isPreview == true)
    }

    @Test func dotDisplayInheritsWhenNoPrevSession() {
        let sets = [GymSet(weight: 60, reps: 10, preset: true),
                    GymSet(weight: 65, reps: 10, preset: true),
                    GymSet()]
        // ② 현재 세트(cur=0) 값 전파
        let d = GymSessionLogic.dotDisplay(sets: sets, i: 2, cur: 0, prevSessionSets: nil, kind: .weight)
        #expect(d.top == "60" && d.bottom == "×10" && d.isPreview == true)
        // ③ sets[i] 자체 preset
        let d2 = GymSessionLogic.dotDisplay(sets: [GymSet(), GymSet(weight: 50, reps: 10, preset: true)],
                                            i: 1, cur: 0, prevSessionSets: nil, kind: .weight)
        #expect(d2.top == "50" && d2.bottom == "×10")
    }

    @Test func dotDisplayBodyweightShowsRepsOnly() {
        let sets = [GymSet(reps: 15, done: true)]
        let d = GymSessionLogic.dotDisplay(sets: sets, i: 0, cur: -1, prevSessionSets: nil, kind: .bodyweight)
        #expect(d.top == "15" && d.bottom == "회" && d.isPreview == false)
    }

    // MARK: - 세션 마감 (finalizeActiveSession 정합 — §7-1·§8)

    @Test func finalizePrunesAndComputes() {
        let s = GymSession(id: "f1", date: "2026-07-09", startTime: 1_000_000, blocks: [
            GymBlock(exerciseId: "bench_press", sets: [
                GymSet(weight: 60, reps: 10, done: true),
                GymSet(weight: 65, reps: 10, preset: true)]),      // 미완료 세트 폐기
            GymBlock(exerciseId: "dumbbell_fly", sets: [
                GymSet(weight: 18, reps: 12, preset: true)]),       // done 0 → 블록 통째 제거
        ], tags: ["chest"], status: .active)
        let f = GymSessionLogic.finalize(s, endTime: 1_000_000 + 52 * 60_000)
        #expect(f.status == .completed)
        #expect(f.blocks.count == 1)
        #expect(f.blocks[0].sets.count == 1)
        #expect(f.totalVolume == 600)
        #expect(f.durationMin == 52)
        #expect(f.date == "2026-07-09")   // 세션 생성일 유지 (PWA 정합)
        // durationMin 최소 1
        let quick = GymSessionLogic.finalize(s, endTime: 1_000_001)
        #expect(quick.durationMin == 1)
    }

    @Test func staleSessionEndTimeUsesLastActivity() {
        // 마지막 활동 = 블록 finishedAt 최대 (없으면 startTime) — duration 과대계산 방지 (§8 sweep)
        let s = GymSession(id: "f2", date: "2026-07-09", startTime: 1_000, blocks: [
            GymBlock(exerciseId: "a", sets: [GymSet(weight: 1, reps: 1, done: true)], finishedAt: 5_000),
            GymBlock(exerciseId: "b", sets: [GymSet(weight: 1, reps: 1, done: true)], finishedAt: 9_000),
        ], status: .active)
        #expect(GymSessionLogic.lastActivityMillis(s) == 9_000)
        let none = GymSession(id: "f3", date: "2026-07-09", startTime: 1_000, blocks: [
            GymBlock(exerciseId: "a", sets: [GymSet(weight: 1, reps: 1, done: true)])], status: .active)
        #expect(GymSessionLogic.lastActivityMillis(none) == 1_000)
    }

    // MARK: - 유산소 페이스 (§6-4)

    @Test func paceTextFromDurationAndDistance() {
        #expect(GymSessionLogic.paceText(durationSec: 1800, distanceKm: 3.2) == "9:23/km")
        #expect(GymSessionLogic.paceText(durationSec: 600, distanceKm: 1.0) == "10:00/km")
        #expect(GymSessionLogic.paceText(durationSec: nil, distanceKm: 3.2) == nil)
        #expect(GymSessionLogic.paceText(durationSec: 1800, distanceKm: nil) == nil)
        #expect(GymSessionLogic.paceText(durationSec: 1800, distanceKm: 0) == nil)
    }
}

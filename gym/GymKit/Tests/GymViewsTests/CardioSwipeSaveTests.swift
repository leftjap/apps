import Foundation
import Testing
import GymCore
@testable import GymViews

// 트레드밀 좌 스와이프 저장 — 모델 배선 (사용자 2026-09-26: 거리만, 좌로 밀면 저장).
@MainActor @Suite struct CardioSwipeSaveTests {

    func model(history: [GymSession], set: GymSet = GymSet(preset: true)) -> GymAppModel {
        let s = GymSession(id: "live", date: "2026-09-26", startTime: 1_000,
                           blocks: [GymBlock(exerciseId: "treadmill", sets: [set])], status: .active)
        let m = GymAppModel(snapshotSession: s)
        m.history = history
        return m
    }
    let prev = GymSession(id: "p", date: "2026-09-25", startTime: 0,
                          blocks: [GymBlock(exerciseId: "treadmill",
                                            sets: [GymSet(done: true, duration: 1080, distance: 2.1)])],
                          status: .completed)

    @Test func swipeWithoutInputSavesPreviousDistanceAndSurvivesEnd() {
        let m = model(history: [prev])
        #expect(m.commitCardio())
        #expect(m.session.blocks[0].sets[0].distance == 2.1)
        #expect(m.session.blocks[0].sets[0].done)
        m.endSession()
        #expect(m.history.first { $0.id == "live" }?.blocks[0].sets[0].distance == 2.1)
    }

    @Test func swipeSavesEnteredDistance() {
        var typed = GymSet(preset: false); typed.distance = 2.2
        let m = model(history: [prev], set: typed)
        #expect(m.commitCardio())
        #expect(m.session.blocks[0].sets[0].distance == 2.2)
    }

    @Test func nothingToSaveDoesNothing() {
        let m = model(history: [])
        #expect(m.commitCardio() == false)
        #expect(m.session.blocks[0].sets[0].done == false)
    }

    // 우 스와이프 = 되돌리기 (근력과 같은 revertToPreviousSet).
    @Test func rightSwipeUndoesSave() {
        let m = model(history: [prev])
        m.commitCardio()
        m.revertToPreviousSet()
        #expect(m.session.blocks[0].sets[0].done == false)
    }
}

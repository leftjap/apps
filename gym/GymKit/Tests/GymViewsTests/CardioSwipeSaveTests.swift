import Foundation
import Testing
import GymCore
@testable import GymViews

// 트레드밀·좌식 자전거·천국의계단 — 동일한 거리 전용 모델 배선.
@MainActor @Suite struct CardioSwipeSaveTests {

    func model(exerciseId: String, history: [GymSession], set: GymSet = GymSet(preset: true)) -> GymAppModel {
        let s = GymSession(id: "live", date: "2026-09-26", startTime: 1_000,
                           blocks: [GymBlock(exerciseId: exerciseId, sets: [set])], status: .active)
        let m = GymAppModel(snapshotSession: s)
        m.history = history
        return m
    }
    func previous(_ exerciseId: String, distance: Double = 2.1) -> GymSession {
        GymSession(id: "p-\(exerciseId)", date: "2026-09-25", startTime: 0,
                          blocks: [GymBlock(exerciseId: exerciseId,
                                            sets: [GymSet(done: true, duration: 1080, distance: distance)])],
                          status: .completed)
    }

    @Test(arguments: ["treadmill", "recumbent_bike", "stair_climber"])
    func swipeWithoutInputSavesPreviousDistanceAndSurvivesEnd(exerciseId: String) {
        let m = model(exerciseId: exerciseId, history: [previous(exerciseId)])
        #expect(m.commitCardio())
        #expect(m.session.blocks[0].sets[0].distance == 2.1)
        #expect(m.session.blocks[0].sets[0].done)
        #expect(m.session.blocks[0].sets[0].duration == nil)
        m.endSession()
        #expect(m.history.first { $0.id == "live" }?.blocks[0].sets[0].distance == 2.1)
    }

    @Test(arguments: ["treadmill", "recumbent_bike", "stair_climber"])
    func swipeSavesEnteredDistance(exerciseId: String) {
        var typed = GymSet(preset: false); typed.distance = 2.2
        let m = model(exerciseId: exerciseId, history: [previous(exerciseId)], set: typed)
        #expect(m.commitCardio())
        #expect(m.session.blocks[0].sets[0].distance == 2.2)
        m.endSession()
        #expect(m.history.first { $0.id == "live" }?.blocks[0].sets[0].distance == 2.2)
    }

    @Test(arguments: ["treadmill", "recumbent_bike", "stair_climber"])
    func nothingToSaveDoesNothing(exerciseId: String) {
        let m = model(exerciseId: exerciseId, history: [])
        #expect(m.commitCardio() == false)
        #expect(m.session.blocks[0].sets[0].done == false)
    }

    // 우 스와이프 = 되돌리기 (근력과 같은 revertToPreviousSet).
    @Test(arguments: ["treadmill", "recumbent_bike", "stair_climber"])
    func rightSwipeUndoesSave(exerciseId: String) {
        let m = model(exerciseId: exerciseId, history: [previous(exerciseId)])
        m.commitCardio()
        m.revertToPreviousSet()
        #expect(m.session.blocks[0].sets[0].done == false)
    }

    @Test(arguments: ["recumbent_bike", "stair_climber"])
    func newCardioDoesNotReuseOtherCardioDistances(exerciseId: String) {
        let otherId = exerciseId == "recumbent_bike" ? "stair_climber" : "recumbent_bike"
        let m = model(exerciseId: exerciseId, history: [previous("cycle"), previous("treadmill"), previous(otherId)])
        #expect(m.commitCardio() == false)
        #expect(m.session.blocks[0].sets[0].distance == nil)
        #expect(m.session.blocks[0].sets[0].done == false)
    }

    @Test(arguments: ["recumbent_bike", "stair_climber"])
    func newCardioUsesOnlyItsOwnPreviousDistance(exerciseId: String) {
        let m = model(exerciseId: exerciseId, history: [
            previous("cycle", distance: 8), previous("treadmill", distance: 2.2),
            previous(exerciseId, distance: 4.5),
        ])
        #expect(m.commitCardio())
        #expect(m.session.blocks[0].sets[0].distance == 4.5)
        #expect(m.session.blocks[0].sets[0].duration == nil)
    }

    @Test(arguments: ["recumbent_bike", "stair_climber"])
    func newCardioCanBeAddedFromCardioPicker(exerciseId: String) throws {
        let m = GymAppModel(snapshotSession: GymSession(id: "new", date: "2026-10-14"))
        m.history = []
        m.custom = []
        m.settings = GymUserSettings(hiddenExercises: ["cycle"])
        let def = try #require(m.selectableExercises(part: "cardio").first { $0.id == exerciseId })
        #expect(AddExerciseSheet.meta(def) == "거리 (km)")
        m.addExercise(def.id)
        #expect(m.currentExerciseId == def.id)
        #expect(m.currentCardKind == .cardio)
        #expect(m.session.blocks.count == 1)
        #expect(m.session.blocks[0].sets.count == 1)
        m.applyKeypad(.distance, value: 3.2)
        #expect(m.commitCardio())
        #expect(m.session.blocks[0].sets[0].distance == 3.2)
        #expect(m.session.blocks[0].sets[0].duration == nil)
    }
}

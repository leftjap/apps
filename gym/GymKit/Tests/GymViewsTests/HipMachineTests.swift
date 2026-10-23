import Testing
import GymCore
@testable import GymViews

@MainActor @Suite struct HipMachineTests {
    func model(_ exerciseId: String) -> GymAppModel {
        let m = GymAppModel(snapshotSession: GymSession(id: "hip", date: "2026-10-14"))
        m.history = []
        m.custom = []
        m.prs = []
        m.settings = GymUserSettings(exerciseOrder: ["legs": ["squat", "leg_press"]])
        m.addExercise(exerciseId)
        return m
    }

    @Test(arguments: ["hip_adduction", "hip_abduction"])
    func selectableAndStepsMatchMachineLabels(exerciseId: String) {
        let m = model(exerciseId)
        #expect(m.selectableExercises(part: "legs").contains { $0.id == exerciseId })
        #expect(m.currentExerciseId == exerciseId && m.currentCardKind == .weight)
        m.applyKeypad(.weight, value: 25)
        m.adjustWeight(1)
        #expect(m.session.blocks[0].sets[0].weight == 32)
        m.adjustWeight(1)
        #expect(m.session.blocks[0].sets[0].weight == 40)
        m.adjustWeight(-1)
        #expect(m.session.blocks[0].sets[0].weight == 32)
        m.adjustWeight(-1)
        #expect(m.session.blocks[0].sets[0].weight == 25)
        m.completeCurrentSet()
        m.endSession()
        #expect(m.history.first { $0.id == "hip" }?.blocks[0].sets[0].weight == 25)
    }

    @Test(arguments: ["hip_adduction", "hip_abduction"])
    func manualEntryAndEndpointsArePreserved(exerciseId: String) {
        let m = model(exerciseId)
        m.applyKeypad(.weight, value: 27.4)
        #expect(m.session.blocks[0].sets[0].weight == 27.4)
        m.adjustWeight(1)
        #expect(m.session.blocks[0].sets[0].weight == 32)
        m.applyKeypad(.weight, value: 27.4)
        m.adjustWeight(-1)
        #expect(m.session.blocks[0].sets[0].weight == 25)
        m.applyKeypad(.weight, value: 5)
        m.adjustWeight(-1)
        #expect(m.session.blocks[0].sets[0].weight == 5)
        m.applyKeypad(.weight, value: 100)
        m.adjustWeight(1)
        #expect(m.session.blocks[0].sets[0].weight == 100)
        m.session.blocks[0].finishedAt = 1
        m.adjustWeight(-1)
        #expect(m.session.blocks[0].sets[0].weight == 100)
    }

    @Test func adductionAndAbductionKeepSeparateWeights() {
        let m = model("hip_adduction")
        m.applyKeypad(.weight, value: 32)
        m.addExercise("hip_abduction")
        m.selectBlock(1)
        #expect(m.session.blocks[1].sets[0].weight == 20)
        m.adjustWeight(1)
        #expect(m.session.blocks[1].sets[0].weight == 25)
        #expect(m.session.blocks[0].sets[0].weight == 32)
    }
}

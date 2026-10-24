import Foundation
import Testing
@testable import GymCore
@testable import GymViews

@MainActor @Suite struct AssistedSessionTests {
    func model() -> GymAppModel {
        let m = GymAppModel(snapshotSession: GymSession(id: "assisted-new", date: "2026-10-24"))
        m.referenceToday = GymWeightLogic.isoFmt.date(from: "2026-10-24")!
        m.custom = [GymCustomExercise(id: "cust-assisted", name: "어시스티드 친", part: "back", defaultSets: 1, defaultReps: 10, defaultWeight: 40)]
        m.weights = []; m.history = []; m.prs = []
        m.addExercise("cust-assisted")
        return m
    }

    @Test func savesAssistanceSnapshotAndEstimatedVolumeSeparatelyFromExternalVolume() throws {
        let m = model()
        #expect(m.currentBlock?.sets[0].volume == 330)
        #expect(m.session.blocks[0].sets[0].bodyWeightKg == nil, "Preview must not write a bodyweight to stored history")
        m.completeCurrentSet()
        let set = m.session.blocks[0].sets[0]
        #expect(set.weight == 40 && set.bodyWeightKg == 73 && set.weightMode == "assistance")
        #expect(set.volume == 330 && m.sessionDoneVolume == 0)
        #expect(!set.pr && m.prs.isEmpty && m.weights.isEmpty)
        m.endSession()
        let saved = try #require(m.history.first { $0.id == "assisted-new" })
        #expect(saved.totalVolume == 0 && saved.blocks[0].sets[0].volume == 330)
        let summary = SummaryScreenView(session: saved, custom: m.custom)
        #expect(summary.rows[0].vol == "추정 330kg")
        #expect(summary.assistedVolume == 330 && summary.prCount == 0)
    }

    @Test func futureWeighInsDoNotRewriteRecordsOrCarryOldSnapshotsIntoPresets() {
        let m = model()
        m.completeCurrentSet(); m.endSession()
        let old = m.history.first { $0.id == "assisted-new" }!
        m.referenceToday = GymWeightLogic.isoFmt.date(from: "2026-10-25")!
        m.weights = [GymWeight(date: "2026-10-25", kg: 80)]
        m.startSession(); m.addExercise("cust-assisted")
        #expect(m.session.blocks[0].sets[0].bodyWeightKg == nil)
        #expect(m.currentBlock?.sets[0].volume == 400)
        m.completeCurrentSet()
        #expect(m.session.blocks[0].sets[0].bodyWeightKg == 80)
        #expect(old.blocks[0].sets[0].bodyWeightKg == 73 && old.blocks[0].sets[0].volume == 330)
    }

    @Test func legacyHistoryRemainsRawAndCannotCreateFalseExternalWeightPRs() throws {
        let m = model()
        let legacy = GymSession(id: "assisted-legacy", date: "2026-10-23", blocks: [
            GymBlock(exerciseId: "cust-assisted", sets: [GymSet(weight: 40, reps: 10, done: true, pr: true)])
        ], totalVolume: 400, status: .completed)
        m.history = [legacy]
        let display = try #require(m.metricHistory.first)
        #expect(display.totalVolume == 0 && display.blocks[0].sets[0].bodyWeightKg == nil)
        #expect(!display.blocks[0].sets[0].pr)
        #expect(m.history[0].blocks == legacy.blocks && m.history[0].totalVolume == 400)
        let detail = GymDayDetailLogic.entry(for: legacy, custom: m.custom)
        #expect(detail.vol == 0 && detail.pr == 0)
        #expect(detail.ex[0].s.contains("당시 체중 없음"))
        #expect(GymPRLogic.findBestSetsInSession(legacy, custom: m.custom).isEmpty)
        #expect(GymAssistedLoad.assistanceReduction(current: GymSet(weight: 35, reps: 10), previous: legacy.blocks[0].sets) == 5)
        #expect(GymAssistedLoad.assistanceReduction(current: GymSet(weight: 45, reps: 10), previous: legacy.blocks[0].sets) == nil)
    }

    @Test func editingAnOldDoneSetDoesNotInventItsHistoricalBodyWeight() {
        let m = model()
        m.session.blocks[0].sets[0] = GymSet(weight: 40, reps: 10, done: true)
        m.applyKeypad(.weight, value: 35, setIdx: 0)
        #expect(m.session.blocks[0].sets[0].bodyWeightKg == nil)
    }
}

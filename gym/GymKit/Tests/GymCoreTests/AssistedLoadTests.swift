import Foundation
import Testing
@testable import GymCore

@Suite struct AssistedLoadTests {
    func decoded(assistance: Double, body: Double? = 73) throws -> GymSet {
        var row: [String: Any] = ["weight": assistance, "reps": 10, "done": true,
                                 "weightMode": "assistance"]
        if let body { row["bodyWeightKg"] = body }
        return try JSONDecoder().decode(GymSet.self, from: JSONSerialization.data(withJSONObject: row))
    }

    @Test func assistanceUsesEstimatedEffectiveLoadAndKeepsEnteredValue() throws {
        let set = try decoded(assistance: 40)
        #expect(set.weight == 40)
        #expect(set.volume == 330)
        #expect(!GymSessionLogic.isPRCandidate(set))
        let row = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(set)) as? [String: Any])
        #expect(row["bodyWeightKg"] as? Double == 73)
        #expect(row["weightMode"] as? String == "assistance")
    }

    @Test func assistanceBoundsAndUnknownHistoricalBodyWeight() throws {
        #expect(try decoded(assistance: 0).volume == 730)
        #expect(try decoded(assistance: 100).volume == 0)
        #expect(try decoded(assistance: 40, body: nil).volume == 0)
        #expect(try decoded(assistance: 40, body: -1).volume == 0)
        #expect(GymSet(weight: 40, reps: 10, done: true).volume == 400)
    }

    @Test func existingCustomAssistedChinIsResolvedWithoutChangingRawDefinition() throws {
        let custom = GymCustomExercise(id: "cust-existing", name: "어시스티드 친", part: "back")
        let def = try #require(GymExercises.def(custom.id, custom: [custom]))
        #expect(def.equipment == "assisted")
        #expect(custom.equipment == "barbell")
        #expect(GymExercises.builtin("chin_up")?.equipment == "bodyweight")
    }
}

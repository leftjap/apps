import Testing
import Foundation
@testable import GymCore

// 트레드밀은 거리 하나만 입력하고 왼쪽 스와이프로 저장한다 (사용자 2026-09-26).
// 시간이 없는 기록이 생기므로, 시간이 있다고 가정하던 표기(요약 "0kg"·날짜 상세 "—"·
// 미리보기 "2.2km · 0분")가 거리만으로 성립해야 한다.
@Suite struct CardioDistanceOnlyTests {

    @Test func summaryTextUsesWhateverIsRecorded() {
        #expect(GymSessionLogic.cardioSummary(distanceKm: 2.2, durationSec: nil) == "2.2km")
        #expect(GymSessionLogic.cardioSummary(distanceKm: 3, durationSec: 1500) == "3km · 25분")
        #expect(GymSessionLogic.cardioSummary(distanceKm: nil, durationSec: 1800) == "30분")
        #expect(GymSessionLogic.cardioSummary(distanceKm: 0, durationSec: 0) == "—")
        #expect(GymSessionLogic.cardioSummary(distanceKm: nil, durationSec: nil) == "—")
    }

    @Test func dayDetailShowsDistanceOnlyRun() {
        let s = GymSession(id: "d", date: "2026-09-26", blocks: [
            GymBlock(exerciseId: "treadmill", sets: [GymSet(done: true, distance: 2.2)])],
                           status: .completed)
        #expect(GymDayDetailLogic.entry(for: s, custom: []).ex[0].s == "2.2km")
    }

    // 같은 날 두 세션을 합칠 때도 거리만 있는 기록은 "0분" 없이, 거리 먼저로.
    @Test func dayDetailMergeOfDistanceOnlyRuns() {
        func run(_ id: String, _ km: Double) -> GymDayEntry {
            GymDayDetailLogic.entry(for: GymSession(id: id, date: "2026-09-26", blocks: [
                GymBlock(exerciseId: "treadmill", sets: [GymSet(done: true, distance: km)])],
                                                    status: .completed), custom: [])
        }
        #expect(GymDayDetailLogic.merged([run("a", 2.2), run("b", 1.0)]).ex[0].s == "3.2km")
    }

    @Test func nextPreviewShowsDistanceOnlyOrDash() {
        let s = GymSession(id: "p", date: "2026-09-26", blocks: [
            GymBlock(exerciseId: "treadmill", sets: [GymSet(distance: 2.2)])], status: .active)
        #expect(GymHomeLogic.blockPreview(s.blocks[0], custom: []).summary == "2.2km")
        let empty = GymBlock(exerciseId: "treadmill", sets: [GymSet(preset: true)])
        #expect(GymHomeLogic.blockPreview(empty, custom: []).summary == "—")
    }

    // 저장 = 화면에 보이는 거리를 확정. 입력이 없으면 직전 기록 거리(근력 스와이프가 미리 채운
    // 무게·횟수를 그대로 확정하는 것과 같은 규칙). 둘 다 없으면 저장하지 않는다.
    @Test func commitSavesEnteredOrPreviousDistance() {
        var typed = GymSet(preset: false); typed.distance = 2.2
        let a = GymSessionLogic.commitCardio(typed, refDistance: 2.1)
        #expect(a?.distance == 2.2 && a?.done == true && a?.preset == false)

        let b = GymSessionLogic.commitCardio(GymSet(preset: true), refDistance: 2.1)
        #expect(b?.distance == 2.1 && b?.done == true && b?.preset == false)

        #expect(GymSessionLogic.commitCardio(GymSet(preset: true), refDistance: nil) == nil)
    }
}

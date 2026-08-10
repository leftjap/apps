import Testing
import Foundation
@testable import GymCore

// 트레드밀 기록 재설계 (specs/2026-08-10-treadmill-record-design.md) — 확정 술어·5필드·칼로리 병합.
@Suite struct CardioRecordTests {

    // §1 확정 술어 교정 회귀 — 2026-08-06 유령 기록: completeSet 이 duration·distance 를 복사한
    // 프리셋을 덧붙였고, "값>0 = 입력됨" 술어가 그 프리셋까지 done 확정해 이중 기록을 만들었다.
    // 교정: preset 아님 = 입력됨. 손 안 댄 프리셋은 값이 있어도 버린다.
    @Test func finishBlockCardioDropsUntouchedPreset() {
        let entered = GymSet(preset: false, duration: 900, distance: 1.5)
        let inherited = GymSet(preset: true, duration: 900, distance: 1.5)   // completeSet 복사분
        let block = GymBlock(exerciseId: "treadmill", sets: [entered, inherited])
        let out = GymSessionLogic.finishBlock(block, now: 1000, isCardio: true)
        #expect(out.sets.count == 1)
        #expect(out.sets.first?.done == true)
        #expect(out.sets.first?.preset == false)
    }

    // 손 댄 세트(preset false)는 값이 부분적이어도 보존 — 2026-08-02 소실 방지 불변.
    @Test func finishBlockCardioKeepsTouchedSet() {
        let entered = GymSet(preset: false, duration: 1500, distance: nil)
        let block = GymBlock(exerciseId: "treadmill", sets: [entered])
        let out = GymSessionLogic.finishBlock(block, now: 1000, isCardio: true)
        #expect(out.sets.count == 1)
        #expect(out.sets.first?.done == true)
    }

    // §4 모델 — 신 필드 관용 디코딩 (구 데이터 키 없음) + 라운드트립.
    @Test func setDecodeToleratesMissingNewKeys() throws {
        let old = #"{"weight":null,"reps":null,"done":true,"duration":900,"distance":1.5}"#
        let back = try JSONDecoder().decode(GymSet.self, from: Data(old.utf8))
        #expect(back.speed == nil && back.incline == nil && back.calories == nil)
        #expect(back.duration == 900)
    }
    @Test func setRoundTripNewFields() throws {
        let s = GymSet(done: true, duration: 901, distance: 1.5, speed: 6.0, incline: 3.4, calories: 81)
        let back = try JSONDecoder().decode(GymSet.self, from: JSONEncoder().encode(s))
        #expect(back.speed == 6.0 && back.incline == 3.4 && back.calories == 81)
    }

    // §1 입력 = 터치 표시 — 단위 변환(분→초·1dp) + preset 플립. done 은 즉시 세우지 않는다
    // (블록 완료 판정 → 히어로 자동 이동으로 입력 흐름 끊김). 보존은 아래 확정 경로가 보장.
    @Test func applyCardioConvertsAndMarksTouched() {
        var s = GymSet(preset: true)
        s = GymSessionLogic.applyCardio(s, field: .duration, value: 20)
        #expect(s.duration == 1200)
        #expect(s.done == false && s.preset == false)
        s = GymSessionLogic.applyCardio(s, field: .incline, value: 3.44)
        #expect(s.incline == 3.4)
        s = GymSessionLogic.applyCardio(s, field: .calories, value: 81.4)
        #expect(s.calories == 81)
        s = GymSessionLogic.applyCardio(s, field: .speed, value: 6.04)
        #expect(s.speed == 6.0)
    }

    // 입력 → 종료 확정 체인 — applyCardio 만 거친 세트는 finishBlock 이 done 으로 보존한다.
    @Test func applyThenFinishPreservesRecord() {
        var s = GymSet(preset: true)
        s = GymSessionLogic.applyCardio(s, field: .duration, value: 15)
        s = GymSessionLogic.applyCardio(s, field: .incline, value: 3.4)
        #expect(GymSessionLogic.cardioEntered(s))
        let out = GymSessionLogic.finishBlock(GymBlock(exerciseId: "treadmill", sets: [s]),
                                              now: 1000, isCardio: true)
        #expect(out.sets.count == 1 && out.sets.first?.done == true)
        #expect(out.sets.first?.incline == 3.4)
    }

    // §3 칼로리 병합 — 입력 kcal 우선, 없으면 MET fallback. 근력 배분 불변.
    @Test func estimateCaloriesEnteredKcalWins() {
        // 유산소 15분 입력 kcal 81 + 근력 1블록(2세트) 45분, 체중 70kg
        let cardio = GymSessionLogic.GymCalorieEntry(met: 7.0, doneSets: 0, cardioSeconds: 900,
                                                     enteredKcal: 81)
        let strength = GymSessionLogic.GymCalorieEntry(met: 5.0, doneSets: 2, cardioSeconds: 0)
        let got = GymSessionLogic.estimateCalories(entries: [cardio, strength], bodyKg: 70,
                                                   elapsedMin: 60)
        // 근력 = 5.0 × 70 × 0.75h × 1.05 = 275.625 → 총 81 + 275.625 = 356.625 → 357
        #expect(got == 357)
    }
    @Test func estimateCaloriesFallbackWithoutEnteredKcal() {
        let cardio = GymSessionLogic.GymCalorieEntry(met: 7.0, doneSets: 0, cardioSeconds: 900)
        let got = GymSessionLogic.estimateCalories(entries: [cardio], bodyKg: 70, elapsedMin: 15)
        // MET 경로 = 7.0 × 70 × 0.25 × 1.05 = 128.625 → 129
        #expect(got == 129)
    }

    // §4 클라우드 전파 — SessionRow(blocks jsonb)가 신 필드를 그대로 싣는다 (마이그레이션 없음).
    @Test func sessionRowCarriesNewFields() throws {
        let s = GymSession(id: "s", date: "2026-08-10",
                           blocks: [GymBlock(exerciseId: "treadmill", sets: [
                               GymSet(done: true, duration: 900, distance: 1.5, speed: 6.0,
                                      incline: 3.4, calories: 81)])],
                           status: .completed)
        let row = SessionRow(from: s, owner: UUID())
        let json = String(data: try JSONEncoder().encode(row), encoding: .utf8)!
        #expect(json.contains("\"incline\":3.4"))
        #expect(json.contains("\"speed\":6"))
        #expect(json.contains("\"calories\":81"))
        let back = try JSONDecoder().decode(SessionRow.self, from: Data(json.utf8)).toModel()
        #expect(back.blocks.first?.sets.first?.incline == 3.4)
    }

    // §2 최근 러닝 추출 — completed 만·날짜순·마지막 limit 개·하루 복수 회 유지.
    @Test func recentCardioRunsExtracts() {
        func session(_ id: String, _ date: String, _ sets: [GymSet], status: GymSessionStatus = .completed) -> GymSession {
            GymSession(id: id, date: date,
                       blocks: [GymBlock(exerciseId: "treadmill", sets: sets)], status: status)
        }
        let run: (Double, Double) -> GymSet = { GymSet(done: true, duration: $0, distance: $1) }
        let history = [
            session("c", "2026-08-06", [run(900, 1.5), run(600, 1.0)]),      // 하루 2회
            session("a", "2026-08-03", [run(600, 1.0)]),
            session("d", "2026-08-10", [run(900, 1.5)]),
            session("x", "2026-08-09", [run(999, 9)], status: .active),      // 미완료 제외
            session("b", "2026-08-04", [GymSet(done: false, duration: 500)]) // done 아님 제외
        ]
        let runs = GymSessionLogic.recentCardioRuns(history: history, exerciseId: "treadmill", limit: 3)
        #expect(runs.map(\.date) == ["2026-08-06", "2026-08-06", "2026-08-10"])
        #expect(runs.last?.durationSec == 900)
        let all = GymSessionLogic.recentCardioRuns(history: history, exerciseId: "treadmill", limit: 8)
        #expect(all.map(\.date) == ["2026-08-03", "2026-08-06", "2026-08-06", "2026-08-10"])
    }
}

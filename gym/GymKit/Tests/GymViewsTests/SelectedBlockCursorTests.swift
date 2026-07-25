import Foundation
import Testing
import GymCore
@testable import GymViews

// 선택 커서(selectedBlockIdx)는 정수 인덱스라, 그보다 앞의 블록이 삭제되면 인덱스가 밀려
// 사용자 조작 없이 다른 종목이 '현재'가 된다 (2026-07-24 감사 확정 #6·#13).
// 삭제 시 커서를 재매핑해 보고 있던 종목을 계속 가리키게 해야 한다.
@MainActor @Suite struct SelectedBlockCursorTests {

    func model(_ ids: [String]) -> GymAppModel {
        var s = GymSession(id: "s", date: "2026-07-24", status: .active)
        s.blocks = ids.map { GymBlock(exerciseId: $0, sets: [GymSet(weight: 50, reps: 10)]) }
        let m = GymAppModel(snapshotSession: s)
        return m
    }

    // [a,b,c] 에서 b 를 보던 중 a 를 삭제 → 여전히 b 를 봐야 한다 (커서 1→0 재매핑).
    @Test func deletingBlockBeforeCursorKeepsSameExercise() {
        let m = model(["bench_press", "squat", "deadlift"])
        m.selectBlock(1)
        #expect(m.currentExerciseId == "squat")
        m.removeExercise("bench_press")
        #expect(m.currentExerciseId == "squat", "앞 종목을 지웠는데 현재 종목이 바뀌면 안 된다")
    }

    // 보고 있던 블록 자체를 삭제하면 커서를 놓아 기본 규칙(첫 미완료)으로 되돌린다.
    @Test func deletingSelectedBlockClearsCursor() {
        let m = model(["bench_press", "squat", "deadlift"])
        m.selectBlock(1)
        m.removeExercise("squat")
        #expect(m.selectedBlockIdx == nil)
        #expect(m.currentExerciseId == "bench_press")
    }

    // 커서 뒤의 블록 삭제는 커서에 영향 없음.
    @Test func deletingBlockAfterCursorLeavesCursorAlone() {
        let m = model(["bench_press", "squat", "deadlift"])
        m.selectBlock(1)
        m.removeExercise("deadlift")
        #expect(m.selectedBlockIdx == 1)
        #expect(m.currentExerciseId == "squat")
    }
}

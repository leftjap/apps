import Foundation
import Testing
import GymCore
@testable import GymViews

// 홈 주간 캘린더 셀 — 2주 표시(지난주·이번주)를 위해 '주 앵커'와 '기준일(오늘)'을 분리한다
// (사용자 2026-07-25: 새 주가 시작되면 1주만 보여선 흐름·이력 확인이 불편).
// 지난주 행도 오늘 기준의 isToday 판정을 써야 오늘 표시가 한 곳에만 찍힌다.
@MainActor @Suite struct WeekCellsTests {

    // 2026-07-25 = 토요일. 그 주 월요일 = 07-20, 지난주 월요일 = 07-13.
    let ref = GymAppModel.dayFmt.date(from: "2026-07-25")!

    func model(worked: [String]) -> GymAppModel {
        let m = GymAppModel(snapshotSession: GymSession(id: "x", date: "2026-07-25"))
        m.history = worked.map {
            GymSession(id: "h-\($0)", date: $0,
                       blocks: [GymBlock(exerciseId: "squat",
                                         sets: [GymSet(weight: 100, reps: 5, done: true)])],
                       status: .completed)
        }
        return m
    }

    @Test func currentWeekStartsMondayAndMarksToday() {
        let m = model(worked: [])
        let cells = m.weekCells(around: ref)
        #expect(cells.count == 7)
        #expect(cells.map(\.num) == [20, 21, 22, 23, 24, 25, 26])
        #expect(cells.map(\.label) == ["월", "화", "수", "목", "금", "토", "일"])
        #expect(cells.filter(\.isToday).map(\.num) == [25])
    }

    // 지난주 행 — weekOffset -1. 날짜는 07-13~19, 오늘은 없다.
    @Test func previousWeekRowHasNoTodayAndShiftsSevenDays() {
        let m = model(worked: [])
        let cells = m.weekCells(around: ref, weekOffset: -1)
        #expect(cells.count == 7)
        #expect(cells.map(\.num) == [13, 14, 15, 16, 17, 18, 19])
        #expect(cells.allSatisfy { !$0.isToday })
    }

    // 운동한 날 표시는 각 주가 자기 주의 기록만 채운다 — 2주 표시에서 주 경계가 새면
    // 지난주 행에 이번 주 기록이 나타나거나 그 반대가 된다.
    @Test func workedDaysBelongToTheirOwnWeekRow() {
        let m = model(worked: ["2026-07-15", "2026-07-22"])   // 지난주 수 · 이번주 수
        let this = m.weekCells(around: ref)
        let prev = m.weekCells(around: ref, weekOffset: -1)
        #expect(prev.filter(\.worked).map(\.num) == [15], "지난주 행은 15일만")
        #expect(this.filter(\.worked).map(\.num) == [22], "이번주 행은 22일만")
        // '오늘' 은 2주를 통틀어 한 곳 (25일, 이번주 토)
        #expect((prev + this).filter(\.isToday).map(\.num) == [25])
    }

    // 기본값 유지 — weekOffset 생략 시 기존 동작(이번 주)과 동일해야 한다.
    @Test func defaultOffsetIsCurrentWeek() {
        let m = model(worked: ["2026-07-22"])
        #expect(m.weekCells(around: ref).map(\.num) == m.weekCells(around: ref, weekOffset: 0).map(\.num))
    }
}

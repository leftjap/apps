import Foundation
import Testing
@testable import GymCore

// 홈 부위 밸런스 — 캘린더 주(월~일) 비교·고정 부위순서·유산소 별도·focus 규칙.
@Suite struct HomeLogicTests {

    func mk(_ date: String, _ exId: String, doneSets: Int, duration: Double? = nil) -> GymSession {
        let sets = (0..<doneSets).map { _ in
            GymSet(weight: duration == nil ? 50 : nil, reps: duration == nil ? 10 : nil,
                   done: true, duration: duration)
        }
        return GymSession(id: "\(date)-\(exId)", date: date,
                          blocks: [GymBlock(exerciseId: exId, sets: sets)], status: .completed)
    }
    // 2026-05-06(수) 기준 — 이번 주: [5/4(월), 5/10(일)], 지난 주: [4/27(월), 5/3(일)]
    let now = GymWeightLogic.isoFmt.date(from: "2026-05-06")!

    // 범례가 "지난주 / 이번 주" 이므로 창도 캘린더 주(월~일)여야 한다.
    // 구결함: 롤링 7일([today-6, today]) 이라 5/3(지난주 일)·4/26(2주 전) 이 이번주/지난주로 잘못 들어갔다.
    @Test func calendarWeekWindows() {
        let sessions = [
            mk("2026-05-04", "squat", doneSets: 4),      // 이번 주 월 (경계)
            mk("2026-05-03", "squat", doneSets: 3),      // 지난 주 일 (경계) — 롤링이면 이번주로 오분류
            mk("2026-04-27", "bench_press", doneSets: 2),// 지난 주 월 (경계)
            mk("2026-04-26", "bench_press", doneSets: 9),// 2주 전 일 — 창 밖
        ]
        let b = GymHomeLogic.weeklyBalance(sessions: sessions, custom: [], now: now)
        let legs = b.parts.first { $0.key == "legs" }!
        let chest = b.parts.first { $0.key == "chest" }!
        #expect(legs.sets == 4 && legs.prevSets == 3)
        #expect(chest.sets == 0 && chest.prevSets == 2)
    }

    // 주 시작은 월요일 — 일요일(주의 마지막)에도 그 주 월요일부터가 "이번 주".
    @Test func weekStartsMondayEvenOnSunday() {
        let sunday = GymWeightLogic.isoFmt.date(from: "2026-05-10")!   // 일
        let b = GymHomeLogic.weeklyBalance(
            sessions: [mk("2026-05-04", "squat", doneSets: 6),     // 같은 주 월 → 이번 주
                       mk("2026-05-03", "squat", doneSets: 2)],    // 전 주 일 → 지난 주
            custom: [], now: sunday)
        let legs = b.parts.first { $0.key == "legs" }!
        #expect(legs.sets == 6 && legs.prevSets == 2)
    }

    @Test func fixedOrderAndFocusRule() {
        let b = GymHomeLogic.weeklyBalance(sessions: [mk("2026-05-05", "squat", doneSets: 10)],
                                           custom: [], now: now)
        #expect(b.parts.map(\.key) == ["legs", "shoulder", "back", "chest", "arms", "core"])
        #expect(b.focusKey == "shoulder")   // 최소(0) 동률 → 고정순서 첫 번째
        // 전부 0 → focus 없음
        let empty = GymHomeLogic.weeklyBalance(sessions: [], custom: [], now: now)
        #expect(empty.focusKey == nil)
        #expect(empty.max == 1)
    }

    @Test func cardioSeparateRowAndCoreMapping() {
        let sessions = [
            mk("2026-05-05", "treadmill", doneSets: 1, duration: 1800),   // 30분 → 유산소 행
            mk("2026-05-04", "hanging_leg_raise", doneSets: 5),           // core 부위
            mk("2026-04-28", "treadmill", doneSets: 1, duration: 600),    // prev 10분
        ]
        let b = GymHomeLogic.weeklyBalance(sessions: sessions, custom: [], now: now)
        #expect(b.cardioMin == 30 && b.cardioCount == 1)
        #expect(b.cardioDeltaMin == 20)
        let core = b.parts.first { $0.key == "core" }!
        #expect(core.sets == 5)
        // cardio 는 부위 막대에 미포함
        #expect(b.parts.allSatisfy { $0.key != "cardio" })
    }
}

// 유산소 행 문구 — home.js applyBalanceToDom 정합 (행은 항상 표시, 0회 시 "기록 없음"·델타 숨김).
@Suite struct CardioRowTextTests {
    @Test func subTextShowsMinutesAndCount() {
        #expect(GymHomeLogic.cardioSubText(min: 84, count: 3) == "84분 · 3회")
    }
    @Test func subTextOmitsMinutesWhenZero() {
        #expect(GymHomeLogic.cardioSubText(min: 0, count: 2) == "2회")
    }
    @Test func subTextIsEmptyLabelWhenNoCardio() {
        #expect(GymHomeLogic.cardioSubText(min: 0, count: 0) == "기록 없음")
        #expect(GymHomeLogic.cardioSubText(min: 30, count: 0) == "기록 없음")
    }
    @Test func deltaTextHiddenWhenNoCardioOrNoChange() {
        #expect(GymHomeLogic.cardioDeltaText(count: 0, deltaMin: 12) == nil)
        #expect(GymHomeLogic.cardioDeltaText(count: 3, deltaMin: 0) == nil)
    }
    @Test func deltaTextArrowsMatchSign() {
        #expect(GymHomeLogic.cardioDeltaText(count: 3, deltaMin: 12) == "▲12분")
        #expect(GymHomeLogic.cardioDeltaText(count: 3, deltaMin: -5) == "▼5분")
    }
}

// 운동 중 홈 이어하기 카드 요약 — 전 종목 완료·세트 0개 종목에서 카드가 깨지던 것 (감사 #11·#12).
@Suite struct ResumeSummaryTests {
    func blk(_ ex: String, sets: [GymSet], finishedAt: Double? = nil) -> GymBlock {
        GymBlock(exerciseId: ex, sets: sets, finishedAt: finishedAt)
    }
    func sess(_ blocks: [GymBlock]) -> GymSession {
        GymSession(id: "s", date: "2026-07-24", blocks: blocks, status: .active)
    }

    @Test func inProgressShowsCursorSet() {
        let s = sess([blk("bench_press", sets: [
            GymSet(weight: 60, reps: 10, done: true),
            GymSet(weight: 65, reps: 10),
            GymSet(weight: 70, reps: 8)])])
        let r = GymHomeLogic.resumeSummary(session: s)
        #expect(r.blockIdx == 0)
        #expect(r.setLine == "SET 2/3")
        #expect(r.allDone == false)
    }

    // 전 종목 완료 — 마지막 블록을 보여주고 allDone 을 표시한다 (이름 공백·"SET 1/0" 금지).
    @Test func allDoneFallsBackToLastBlockAndFlagsDone() {
        let done = [GymSet(weight: 60, reps: 10, done: true)]
        let s = sess([blk("bench_press", sets: done, finishedAt: 10),
                      blk("squat", sets: done, finishedAt: 20)])
        let r = GymHomeLogic.resumeSummary(session: s)
        #expect(r.blockIdx == 1, "마지막 블록으로 폴백해야 한다")
        #expect(r.setLine == "SET 1/1")
        #expect(r.allDone == true)
    }

    // 세트 0개로 건너뛴(완료 처리된) 종목 — 세트 줄을 숨긴다 ("SET 1/0" 금지).
    @Test func zeroSetBlockHasNoSetLine() {
        let s = sess([blk("bench_press", sets: [], finishedAt: 5)])
        let r = GymHomeLogic.resumeSummary(session: s)
        #expect(r.setLine == nil)
        #expect(r.allDone == true)
    }
}

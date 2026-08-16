import Foundation
import Testing
@testable import GymCore

// 유산소 카드 (홈 재설계 2026-08-17 §8·§11) — 밸런스 차트 유산소 행을 대체한 독립 카드.
// 캘린더 유산소 링과 카드의 채운 원이 어긋나면 안 되므로(§14) 날짜 집합은 cardioDayMinutes 하나에서 나온다.
@Suite struct CardioDayMinutesTests {

    func cardioSession(_ date: String, _ durations: [Double?], done: Bool = true) -> GymSession {
        GymSession(id: "c-\(date)-\(durations.count)", date: date,
                   blocks: [GymBlock(exerciseId: "treadmill",
                                     sets: durations.map { GymSet(done: done, duration: $0) })],
                   status: .completed)
    }
    func liftSession(_ date: String) -> GymSession {
        GymSession(id: "l-\(date)", date: date,
                   blocks: [GymBlock(exerciseId: "squat",
                                     sets: [GymSet(weight: 100, reps: 5, done: true)])],
                   status: .completed)
    }

    // 같은 날 여러 유산소 세트는 합산. 근력만 한 날은 키 자체가 없다(= 링 없음).
    @Test func sumsDoneCardioMinutesPerDate() {
        let m = GymHomeLogic.cardioDayMinutes(
            sessions: [cardioSession("2026-05-04", [1200, 600]), liftSession("2026-05-05")],
            custom: [])
        #expect(m["2026-05-04"] == 30)          // 20분 + 10분
        #expect(m["2026-05-05"] == nil)         // 근력만 → 유산소 아님
    }

    // 미완료 세트는 집계 제외 — 진행 중 세션이 캘린더 링을 미리 켜면 안 된다.
    @Test func ignoresUndoneSets() {
        let m = GymHomeLogic.cardioDayMinutes(sessions: [cardioSession("2026-05-04", [1800], done: false)],
                                              custom: [])
        #expect(m["2026-05-04"] == nil)
    }

    // duration 미입력 유산소(구버그 데이터) — 날짜 키는 남고 값 0. "뛴 날" 판정은 done 세트 유무 하나로
    // 통일해야 캘린더 링 == 카드 채운 원이 성립한다 (사용자 확정 2026-08-17: 0 그대로 표시).
    @Test func keepsZeroMinuteCardioDay() {
        let m = GymHomeLogic.cardioDayMinutes(sessions: [cardioSession("2026-05-04", [nil])], custom: [])
        #expect(m["2026-05-04"] == 0)
    }

    // 분은 날짜별로 반올림 — 카드 총합(57)은 원 안 숫자(30+27)의 합과 같아야 한다.
    @Test func roundsPerDayNotGlobally() {
        let m = GymHomeLogic.cardioDayMinutes(sessions: [cardioSession("2026-05-04", [1770])], custom: [])
        #expect(m["2026-05-04"] == 30)   // 29.5분 → 30
    }

    // 근력일과 유산소일은 분리 — 유산소만 한 날은 캘린더에서 crail 채움이 아니라 teal 링만 (§5).
    @Test func liftDaysExcludeCardioOnlyDays() {
        let days = GymHomeLogic.liftDays(
            sessions: [cardioSession("2026-05-04", [1800]), liftSession("2026-05-05")], custom: [])
        #expect(days == ["2026-05-05"])
    }

    // 같은 날 근력 + 유산소 → 두 집합 모두에 들어간다 (채움 + 링).
    @Test func mixedDayIsBothLiftAndCardio() {
        let sessions = [cardioSession("2026-05-04", [1800]), liftSession("2026-05-04")]
        #expect(GymHomeLogic.liftDays(sessions: sessions, custom: []) == ["2026-05-04"])
        #expect(GymHomeLogic.cardioDayMinutes(sessions: sessions, custom: [])["2026-05-04"] == 30)
    }

    // 미완료 근력 세트만 있는 날은 근력일이 아니다.
    @Test func liftDaysIgnoreUndoneSets() {
        let undone = GymSession(id: "u", date: "2026-05-04",
                                blocks: [GymBlock(exerciseId: "squat",
                                                  sets: [GymSet(weight: 100, reps: 5)])],
                                status: .completed)
        #expect(GymHomeLogic.liftDays(sessions: [undone], custom: []).isEmpty)
    }
}

// 유산소 카드 7칸 — 월~일 고정, 이번 주 채움 / 지난주 같은 요일 회색 숫자 (§8).
@Suite struct CardioWeekTests {

    func run(_ date: String, min: Double) -> GymSession {
        GymSession(id: "c-\(date)", date: date,
                   blocks: [GymBlock(exerciseId: "treadmill",
                                     sets: [GymSet(done: true, duration: min * 60)])],
                   status: .completed)
    }
    // 지시서 §8 예시 — 오늘 = 화(2026-05-05). 이번 주 월 30·화 27, 지난주 수 25·금 28·토 22.
    let today = GymWeightLogic.isoFmt.date(from: "2026-05-05")!

    @Test func mapsMondayFirstWithPrevWeekSameWeekday() {
        let w = GymHomeLogic.cardioWeek(
            sessions: [run("2026-05-04", min: 30), run("2026-05-05", min: 27),
                       run("2026-04-29", min: 25), run("2026-05-01", min: 28),
                       run("2026-05-02", min: 22)],
            custom: [], now: today)
        #expect(w.thisMin == [30, 27, nil, nil, nil, nil, nil])
        #expect(w.prevMin == [nil, nil, 25, nil, 28, 22, nil])
        #expect(w.thisTotal == 57 && w.thisDays == 2)
        #expect(w.prevTotal == 75 && w.prevDays == 3)
        #expect(w.todayIndex == 1)   // 화
    }

    // 일요일도 그 주 월요일부터가 이번 주 (§11 주 시작 = 월요일 고정).
    @Test func sundayStillBelongsToItsOwnWeek() {
        let sunday = GymWeightLogic.isoFmt.date(from: "2026-05-10")!
        let w = GymHomeLogic.cardioWeek(sessions: [run("2026-05-04", min: 20),   // 같은 주 월
                                                   run("2026-05-03", min: 40)],  // 전 주 일
                                        custom: [], now: sunday)
        #expect(w.thisMin[0] == 20 && w.thisTotal == 20)
        #expect(w.prevMin[6] == 40 && w.prevTotal == 40)
        #expect(w.todayIndex == 6)
    }

    // 창 밖(2주 전)은 어느 행에도 안 들어간다.
    @Test func ignoresOlderThanPrevWeek() {
        let w = GymHomeLogic.cardioWeek(sessions: [run("2026-04-26", min: 99)], custom: [], now: today)
        #expect(w.thisTotal == 0 && w.prevTotal == 0)
        #expect(w.thisMin.allSatisfy { $0 == nil } && w.prevMin.allSatisfy { $0 == nil })
    }

    // 0분 유산소도 '뛴 날' — 일수에 포함되고 원은 채워진다(값 0).
    @Test func zeroMinuteDayStillCounts() {
        let w = GymHomeLogic.cardioWeek(sessions: [run("2026-05-04", min: 0)], custom: [], now: today)
        #expect(w.thisMin[0] == 0)
        #expect(w.thisDays == 1 && w.thisTotal == 0)
    }
}

// 갱신 칩 3갈래 (사용자 2026-08-17 — 동률은 갱신이 아니다).
@Suite struct CardioRenewChipTests {
    @Test func shortfallShowsWarnChip() {
        let c = GymHomeLogic.cardioRenewChip(thisTotal: 57, prevTotal: 75)
        #expect(c?.value == "18분")
        #expect(c?.label == "더 하면 갱신")
        #expect(c?.isWarn == true)
    }
    @Test func tieIsNotARenewal() {
        let c = GymHomeLogic.cardioRenewChip(thisTotal: 75, prevTotal: 75)
        #expect(c?.value == nil)
        #expect(c?.label == "지난주와 동률")
        #expect(c?.isWarn == false)
    }
    @Test func surplusShowsPineChip() {
        let c = GymHomeLogic.cardioRenewChip(thisTotal: 87, prevTotal: 75)
        #expect(c?.value == "+12분")
        #expect(c?.label == "갱신")
        #expect(c?.isWarn == false)
    }
    // 유산소를 한 번도 안 한 사용자 — 칩 숨김 (§14 마지막 항목).
    @Test func hiddenWhenNeverRan() {
        #expect(GymHomeLogic.cardioRenewChip(thisTotal: 0, prevTotal: 0) == nil)
    }
    // 지난주 0 · 이번 주 있음 → 동률이 아니라 갱신.
    @Test func firstEverWeekIsARenewal() {
        let c = GymHomeLogic.cardioRenewChip(thisTotal: 20, prevTotal: 0)
        #expect(c?.value == "+20분" && c?.isWarn == false)
    }
}

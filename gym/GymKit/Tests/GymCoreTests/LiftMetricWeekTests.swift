import Foundation
import Testing
@testable import GymCore

// 세션 무게·맨몸 종목 주간 스트립 집계 (시안 2026-09-17).
// 유산소의 `cardioMetricWeek` 와 규칙(원 형태·오늘 참조·합계 범위)은 같고 값만 다르다:
//   무게 종목 = 그날 이 종목 done 세트 볼륨 합(kg),  맨몸 = 횟수 합(회).
// 중량을 쓰지 않는 이유는 실기기 데이터에 있다 (2026-09-17 실측 84세션):
// wrist_curl 은 8주 내내 20kg, shoulder_press 는 25kg 고정이라 원마다 같은 숫자만 반복된다.
// 볼륨·횟수는 같은 기간 480~780 / 1,665~2,590 으로 매번 달라져 주간 리듬이 읽힌다.
@Suite struct LiftMetricWeekTests {

    // 2026-09-16(수) 기준. 이번 주 월 09-14 ~ 일 09-20, 지난주 월 09-07 ~ 일 09-13.
    let today = GymWeightLogic.isoFmt.date(from: "2026-09-16")!

    func lift(_ date: String, _ ex: String, _ sets: [(Double, Int)]) -> GymSession {
        GymSession(id: "\(date)-\(ex)", date: date,
                   blocks: [GymBlock(exerciseId: ex,
                                     sets: sets.map { GymSet(weight: $0.0, reps: $0.1, done: true) })],
                   status: .completed)
    }
    func body(_ date: String, _ ex: String, _ reps: [Int]) -> GymSession {
        GymSession(id: "\(date)-\(ex)", date: date,
                   blocks: [GymBlock(exerciseId: ex,
                                     sets: reps.map { GymSet(reps: $0, done: true) })],
                   status: .completed)
    }

    // 실기기 leg_extension 실데이터 — 이번 주 월 1,795 / 지난주 화 1,895 · 금 1,825.
    var history: [GymSession] {
        [lift("2026-09-14", "leg_extension", [(45, 12), (45, 11), (45, 10), (45, 9), (45, 10)]),   // 2,340
         lift("2026-09-08", "leg_extension", [(45, 11), (45, 11), (45, 11)]),                      // 1,485
         lift("2026-09-11", "leg_extension", [(45, 10), (45, 10)])]                                // 900
    }
    // 오늘 진행 중 — 45kg×10 두 세트 완료(900), 미완료 한 세트.
    var todaySets: [GymSet] {
        [GymSet(weight: 45, reps: 10, done: true),
         GymSet(weight: 45, reps: 10, done: true),
         GymSet(weight: 45, reps: 10)]
    }

    func week(kind: GymCardKind = .weight, ts: [GymSet]? = nil, hist: [GymSession]? = nil,
              ex: String = "leg_extension") -> GymSessionLogic.LiftMetricWeek {
        GymSessionLogic.liftMetricWeek(history: hist ?? history, todaySets: ts ?? todaySets,
                                       exerciseId: ex, kind: kind, now: today)
    }

    // MARK: - 값

    @Test func weightMetricSumsDoneVolumePerDay() {
        let w = week()
        // 월 2,340 · 화~ 없음 · 오늘(수) 진행 900 · 목 없음 · 금 지난주 900 참조 · 토일 없음
        #expect(w.days.map(\.text) == ["2.3k", nil, "900", nil, "900", nil, nil])
        #expect(w.unit == "kg")
    }

    // 맨몸은 볼륨이 항상 0 이라(중량 nil) 횟수로 바꾼다 — 실데이터 decline_situp 전량이 0kg.
    @Test func bodyweightMetricSumsReps() {
        let hist = [body("2026-09-14", "decline_situp", [12, 11, 10]),
                    body("2026-09-08", "decline_situp", [13, 12])]
        let w = week(kind: .bodyweight, ts: [GymSet(reps: 14, done: true), GymSet(reps: 13)],
                     hist: hist, ex: "decline_situp")
        #expect(w.days.map(\.text) == ["33", nil, "14", nil, nil, nil, nil])
        #expect(w.unit == "회")
    }

    // 1,000 이상은 원 안에 4자리가 안 들어간다 — 소수 1자리 k 축약 (10,000 이상은 정수 k).
    @Test func volumeAbbreviatesAtThousand() {
        #expect(GymSessionLogic.liftVolumeText(0) == "0")
        #expect(GymSessionLogic.liftVolumeText(999) == "999")
        #expect(GymSessionLogic.liftVolumeText(1000) == "1.0k")
        #expect(GymSessionLogic.liftVolumeText(2540) == "2.5k")
        #expect(GymSessionLogic.liftVolumeText(9950) == "10k")
        #expect(GymSessionLogic.liftVolumeText(12400) == "12k")
    }

    // MARK: - 원 형태 (유산소 §5 와 같은 규칙)

    @Test func styleFollowsRecordPresence() {
        let w = week()
        #expect(w.days.map(\.style) == [.filled, .ring, .filled, .ringFaint, .ring, .ringFaint, .ringFaint])
        #expect(w.days.map(\.isToday) == [false, false, true, false, false, false, false])
        #expect(w.days.map(\.label) == ["월", "화", "수", "목", "금", "토", "일"])
    }

    // 오늘 아직 완료 세트가 없으면 참조 스타일 + 직전 기록 값 (합계에서 제외).
    @Test func todayWithoutRecordShowsReference() {
        let w = week(ts: [GymSet(weight: 45, reps: 10)])
        #expect(w.days[2].style == .todayRef)
        #expect(w.days[2].text == "2.3k")        // 직전 이 종목 기록 = 월요일 2,340
        #expect(w.dayCount == 1 && w.total == "2,340")
    }

    // 이력이 아예 없으면 오늘 원은 참조값도 없이 빈 채로 남는다.
    @Test func todayWithoutAnyHistoryHasNoReference() {
        let w = week(ts: [GymSet(weight: 45, reps: 10)], hist: [])
        #expect(w.days[2].style == .todayRef && w.days[2].text == nil)
        #expect(w.dayCount == 0 && w.total == "0")
    }

    // MARK: - 합계

    @Test func totalCountsThisWeekUpToToday() {
        let w = week()
        // 월 2,340 + 오늘 900 = 3,240 / 2일. 금요일의 지난주 참조(900)는 들어가지 않는다.
        #expect(w.total == "3,240" && w.dayCount == 2)
    }

    // 오늘 이미 마친 세션이 있고 새 세션을 또 켠 경우 — 오늘 값은 둘의 합 (유산소 실기기 2026-08-19 정합).
    @Test func todayMergesCompletedAndLiveSets() {
        var hist = history
        hist.append(lift("2026-09-16", "leg_extension", [(45, 10), (45, 10)]))   // 오늘 이미 900 완료
        let w = week(hist: hist)
        #expect(w.days[2].text == "1.8k")      // 900 + 진행 중 900
        #expect(w.days[2].style == .filled)
    }

    // 다른 종목 기록은 섞이지 않는다.
    @Test func ignoresOtherExercises() {
        var hist = history
        hist.append(lift("2026-09-15", "bench_press", [(60, 10), (60, 10)]))
        let w = week(hist: hist)
        #expect(w.days[1].text == nil && w.days[1].style == .ring)
    }

    // 미완료(done=false) 세트만 있는 날은 운동한 날이 아니다.
    @Test func ignoresUnfinishedSets() {
        let hist = [GymSession(id: "x", date: "2026-09-15",
                               blocks: [GymBlock(exerciseId: "leg_extension",
                                                 sets: [GymSet(weight: 45, reps: 10)])],
                               status: .completed)]
        let w = week(ts: [], hist: hist)
        #expect(w.days[1].style == .ring && w.days[1].text == nil)
    }

    // MARK: - 지난주 비교 (합계 자리에 볼륨 대신 들어가는 값)

    // 세션 화면엔 이미 볼륨이 두 곳(헤더 세션 볼륨·종목 볼륨 링) 있어 주간 합계까지 kg 로 두면
    // 같은 단위 숫자가 세 번 나온다. 스트립만의 고유 정보는 '며칠 했나' 라 일수를 비교로 보여준다.
    @Test func prevWeekDayCountComparesSameSpan() {
        let w = week()
        // 이번 주(월·오늘 수) 2일 / 지난주 화·금 2일
        #expect(w.dayCount == 2 && w.prevDayCount == 2)
    }

    @Test func prevWeekDayCountCountsWholeLastWeek() {
        var hist = history
        hist.append(lift("2026-09-13", "leg_extension", [(45, 10)]))   // 지난주 일요일
        let w = week(hist: hist)
        #expect(w.prevDayCount == 3)
    }
}

import Foundation
import Testing
@testable import GymCore

// 세션 유산소 카드 주간 집계 (작업지시서 §5 · 확정 시안 7a, 2026-08-18).
// 홈의 GymHomeLogic.cardioWeek 와 다른 함수다 — 이쪽은 **종목 단위**(트레드밀만) 3지표 집계이고,
// 홈은 유산소 전 종목 분 합산이다. 값이 달라지는 건 의도된 것 (§5 집계 범위).
@Suite struct CardioMetricWeekTests {

    // 2026-08-21(금) 기준. 이번 주 월 08-17 ~ 일 08-23, 지난주 월 08-10 ~ 일 08-16.
    let today = GymWeightLogic.isoFmt.date(from: "2026-08-21")!

    func run(_ date: String, _ ex: String, min: Double?, km: Double? = nil, kcal: Double? = nil) -> GymSession {
        GymSession(id: "\(date)-\(ex)", date: date,
                   blocks: [GymBlock(exerciseId: ex, sets: [
                       GymSet(done: true, duration: min.map { $0 * 60 }, distance: km, calories: kcal)])],
                   status: .completed)
    }
    // 확정 시안 7a 의 화면 데이터 — 시간: 15·20·15·오늘32 = 82분 4일 / 칼로리: 96·128·85·오늘미입력 = 309kcal 3일
    var history: [GymSession] {
        [run("2026-08-17", "treadmill", min: 15, km: 1.5, kcal: 96),
         run("2026-08-19", "treadmill", min: 20, km: 2.0, kcal: 128),
         run("2026-08-20", "treadmill", min: 15, km: 1.4, kcal: 85),
         run("2026-08-15", "treadmill", min: 20, km: 2.2, kcal: 122)]   // 지난주 토
    }
    // 오늘 입력 중인 세트 — 32분 3.4km, 칼로리 미입력
    let todaySet = GymSet(duration: 1920, distance: 3.4)

    func week(_ m: GymCardioMetric, ts: [GymSet]? = nil, hist: [GymSession]? = nil)
        -> GymSessionLogic.CardioMetricWeek {
        GymSessionLogic.cardioMetricWeek(history: hist ?? history, todaySets: ts ?? [todaySet],
                                         exerciseId: "treadmill", metric: m, now: today)
    }

    @Test func timeMetricMatchesMock() {
        let w = week(.duration)
        #expect(w.days.map(\.text) == ["15", nil, "20", "15", "32", "20", nil])
        #expect(w.total == "82" && w.unit == "분" && w.dayCount == 4)
        #expect(w.days.map(\.style) == [.filled, .ring, .filled, .filled, .filled, .ring, .ringFaint])
        #expect(w.days.map(\.isToday) == [false, false, false, false, true, false, false])
    }

    @Test func caloriesMetricMatchesMock() {
        let w = week(.calories)
        // 오늘(금)은 미입력 → 직전 러닝(목 85)을 참조 스타일로 표시하고 합계에서 제외
        #expect(w.days.map(\.text) == ["96", nil, "128", "85", "85", "122", nil])
        #expect(w.days[4].style == .todayRef)
        #expect(w.total == "309" && w.unit == "kcal" && w.dayCount == 3)
    }

    @Test func distanceMetricIsOneDecimal() {
        let w = week(.distance)
        #expect(w.days.map(\.text) == ["1.5", nil, "2.0", "1.4", "3.4", "2.2", nil])
        #expect(w.total == "8.3" && w.unit == "km" && w.dayCount == 4)
    }

    // 지난·미래 요일의 원 형태는 지표와 무관 — 항상 시간 기준 (§5 "주간 리듬 고정 좌표").
    // 오늘 칸만 예외: 활성 지표가 비었으면 참조 스타일로 바뀐다 (시안 7a 시간/칼로리 두 화면 차이).
    @Test func pastAndFutureCircleStyleIgnoresMetric() {
        let styles = GymCardioMetric.allCases.map { m in
            week(m).days.enumerated().filter { !$0.element.isToday }.map { $0.element.style }
        }
        #expect(Set(styles).count == 1, "지표를 바꿔도 오늘 외 원 스타일은 같아야 한다")
    }

    // 시간 기록은 있는데 그 지표 기록이 없는 과거 요일 → "—" (0 이나 역산값이 아니다).
    @Test func pastDayWithoutThatMetricShowsDash() {
        let h = [run("2026-08-17", "treadmill", min: 15)]        // 거리·칼로리 없음
        let w = week(.calories, hist: h)
        #expect(w.days[0].text == "—")
        #expect(w.days[0].style == .filled, "시간 기록이 있으니 원은 채움 유지")
        // 일수는 **뛴 날 수** — 그 지표를 적은 날 수가 아니다 (실기기 2026-08-19 불일치의 한 축).
        // 오늘 칸만 지표 기준으로 남는다 — 확정 시안 7a 가 "시간 4일 / 칼로리 3일" 로 못 박았다.
        #expect(w.total == "0" && w.dayCount == 1)
    }

    // 다른 유산소 종목은 섞이지 않는다 (§5 집계 범위 · §8 체크리스트).
    @Test func otherCardioExercisesAreExcluded() {
        let h = history + [run("2026-08-18", "cycle", min: 40, kcal: 300),
                           run("2026-08-19", "elliptical", min: 30, kcal: 200)]
        let w = week(.duration, hist: h)
        #expect(w.days[1].text == nil, "화요일 사이클은 트레드밀 카드에 안 뜬다")
        #expect(w.total == "82" && w.dayCount == 4)
    }

    // 오늘 입력됨 → teal 채움 + 합계 포함.
    @Test func todayEnteredIsFilledAndCounted() {
        let w = week(.calories, ts: [GymSet(duration: 1920, calories: 200)])
        #expect(w.days[4].style == .filled && w.days[4].text == "200")
        #expect(w.total == "509" && w.dayCount == 4)
    }

    // 구데이터(세트 2개 이상) — 오늘 원은 그 날 세트의 합.
    @Test func multipleSetsTodaySumUp() {
        let w = week(.duration, ts: [GymSet(duration: 600), GymSet(duration: 900)])
        #expect(w.days[4].text == "25")
    }

    // 기록이 하나도 없으면 전부 빈 원, 합계 0.
    @Test func emptyHistoryYieldsAllEmpty() {
        let w = week(.duration, ts: [], hist: [])
        #expect(w.days.allSatisfy { $0.text == nil })
        #expect(w.total == "0" && w.dayCount == 0)
    }
}

// 지표 메타 — 라벨·단위·증분 (§4 증분 시간 1분 / 거리 0.1km / 칼로리 1kcal).
// 칼로리는 10 → 1 (사용자 2026-08-28 — 콘솔 값이 46·88 처럼 1 단위라 10 단위로는 맞출 수 없다).
@Suite struct CardioMetricTests {
    @Test func labelsUnitsSteps() {
        #expect(GymCardioMetric.allCases.map(\.label) == ["시간", "거리", "칼로리"])
        #expect(GymCardioMetric.allCases.map(\.unit) == ["분", "km", "kcal"])
        #expect(GymCardioMetric.allCases.map(\.step) == [1, 0.1, 1])
    }
    // 로테이션 — 순환 없음 (§4 끝단에서 더 못 간다).
    @Test func rotationDoesNotWrap() {
        #expect(GymCardioMetric.duration.next == .distance)
        #expect(GymCardioMetric.calories.next == nil)
        #expect(GymCardioMetric.duration.prev == nil)
        #expect(GymCardioMetric.calories.prev == .distance)
    }
    // 빈 공간 탭 증감 — 현재값(없으면 직전값) ± step, 하한 0 (§5-1).
    @Test func stepValueClampsAtZero() {
        #expect(GymCardioMetric.duration.stepped(from: 32, dir: 1) == 33)
        #expect(GymCardioMetric.distance.stepped(from: 3.4, dir: -1) == 3.3)
        #expect(GymCardioMetric.calories.stepped(from: 46, dir: -1) == 45)
        #expect(GymCardioMetric.calories.stepped(from: 0, dir: -1) == 0)   // 하한 0
        #expect(GymCardioMetric.distance.stepped(from: 0, dir: -1) == 0)
    }
}

// 제스처 — 끝단 저항 0.28 · 순환 없음 · 임계 커밋 (§4).
@Suite struct CardioGestureTests {
    @Test func edgeResistanceOnlyAtEnds() {
        #expect(abs(GymCardioGesture.translate(100, from: .duration) - 28) < 1e-9)   // 첫 지표에서 오른쪽
        #expect(GymCardioGesture.translate(-100, from: .duration) == -100)  // 안쪽은 그대로
        #expect(abs(GymCardioGesture.translate(-100, from: .calories) + 28) < 1e-9)  // 마지막에서 왼쪽
        #expect(GymCardioGesture.translate(100, from: .calories) == 100)
        #expect(GymCardioGesture.translate(100, from: .distance) == 100)    // 가운데는 양쪽 다 자유
        #expect(GymCardioGesture.translate(-100, from: .distance) == -100)
    }
    @Test func commitCrossesThresholdOnly() {
        #expect(GymCardioGesture.commit(-56, from: .duration, threshold: 56) == .distance)
        #expect(GymCardioGesture.commit(-55, from: .duration, threshold: 56) == .duration)
        #expect(GymCardioGesture.commit(56, from: .distance, threshold: 56) == .duration)
        #expect(GymCardioGesture.commit(55, from: .distance, threshold: 56) == .distance)
    }
    @Test func commitNeverWraps() {
        #expect(GymCardioGesture.commit(999, from: .duration, threshold: 56) == .duration)
        #expect(GymCardioGesture.commit(-999, from: .calories, threshold: 56) == .calories)
    }
}

// 치수 — 시안 목업(360) 결과값 재현 + 기기 폭 유도 (§6-1).
@Suite struct CardioLayoutTests {
    @Test func mockWidthReproducesSpecNumbers() {
        let l = GymCardioLayout(cardWidth: 360)
        #expect(l.contentWidth == 316)
        #expect(abs(l.tapZone - 104.28) < 0.01)      // W×0.33 (시안 표기 105)
        #expect(abs(l.swipeThreshold - 56.88) < 0.01) // W×0.18 (시안 표기 56)
        #expect(l.circleDiameter == 37)
        #expect(l.trackOffset(index: 0) == 0)
        #expect(l.trackOffset(index: 1) == -316)
        #expect(l.trackOffset(index: 2) == -632)
    }
    // 스냅 오프셋을 316 으로 고정하면 다른 폭에서 하나씩 어긋난다 — 폭에서 유도돼야 한다.
    @Test func offsetsDeriveFromDeviceWidth() {
        #expect(GymCardioLayout(cardWidth: 375).trackOffset(index: 1) == -331)
        #expect(GymCardioLayout(cardWidth: 430).trackOffset(index: 1) == -386)
    }
    // 탭 영역 하한 44 — 아주 좁은 기기에서 W×0.33 이 44 미만이 되어도 44 를 지킨다.
    @Test func tapZoneHasFloor() {
        #expect(GymCardioLayout(cardWidth: 160).tapZone == 44)
    }
    // 원 지름은 간격이 4 미만이 되는 좁은 폭에서만 32 로 줄인다.
    @Test func circleShrinksOnlyWhenGapTooTight() {
        #expect(GymCardioLayout(cardWidth: 375).circleDiameter == 37)   // W=331, 간격 12
        #expect(GymCardioLayout(cardWidth: 430).circleDiameter == 37)   // W=386, 간격 21
        #expect(GymCardioLayout(cardWidth: 320).circleDiameter == 32)   // W=276, 간격 2.8 → 축소
    }
}

// 실기기 보고 2026-08-19 — 홈 "32분 6일" vs 세션 "24분 4일". 같은 기록인데 두 화면이 다르다.
// 원인 둘: ① 세션이 **오늘 이미 완료된 기록**을 무시(진행 중 세트만 봄) ② 0분/무기록 날 판정 불일치.
@Suite struct CardioWeekHomeParityTests {
    let today = GymWeightLogic.isoFmt.date(from: "2026-08-19")!   // 수요일

    func run(_ date: String, min: Double?, ex: String = "treadmill") -> GymSession {
        GymSession(id: "r-\(date)-\(ex)", date: date,
                   blocks: [GymBlock(exerciseId: ex, sets: [
                       GymSet(done: true, duration: min.map { $0 * 60 })])],
                   status: .completed)
    }

    // ① 오늘 8분을 이미 마치고 새 세션을 시작 → 세션 카드도 오늘을 기록으로 봐야 한다.
    @Test func todayAlreadyCompletedCountsInSessionCard() {
        let w = GymSessionLogic.cardioMetricWeek(
            history: [run("2026-08-19", min: 8)],
            todaySets: [GymSet(duration: nil)],          // 방금 시작한 빈 세트
            exerciseId: "treadmill", metric: .duration, now: today)
        #expect(w.days[2].style == .filled, "오늘 완료분이 있으면 참조가 아니라 기록")
        #expect(w.days[2].text == "8")
        #expect(w.total == "8" && w.dayCount == 1)
    }

    // 오늘 완료분 + 진행 중 입력은 그날 합계로 (홈 cardioDayMinutes 와 같은 셈).
    @Test func todayCompletedPlusLiveSetSums() {
        let w = GymSessionLogic.cardioMetricWeek(
            history: [run("2026-08-19", min: 8)],
            todaySets: [GymSet(duration: 300)],          // 진행 중 5분
            exerciseId: "treadmill", metric: .duration, now: today)
        #expect(w.days[2].text == "13")
        #expect(w.total == "13" && w.dayCount == 1)
    }

    // ② 0분 유산소도 '뛴 날' — 홈과 같게 일수에 든다 (사용자 확정 2026-08-17).
    @Test func zeroMinuteDayIsARecordedDay() {
        let w = GymSessionLogic.cardioMetricWeek(
            history: [run("2026-08-17", min: 0)], todaySets: [],
            exerciseId: "treadmill", metric: .duration, now: today)
        #expect(w.days[0].style == .filled)
        #expect(w.dayCount == 1)
    }

    // duration 자체가 없는 done 세트(구버그 데이터)도 날은 잡히고 숫자만 "—".
    @Test func doneSetWithoutDurationIsStillARecordedDay() {
        let w = GymSessionLogic.cardioMetricWeek(
            history: [run("2026-08-17", min: nil)], todaySets: [],
            exerciseId: "treadmill", metric: .duration, now: today)
        #expect(w.days[0].style == .filled)
        #expect(w.days[0].text == "—")
        #expect(w.dayCount == 1)
    }

    // 실기기 보고 재현 — 유산소가 전부 트레드밀이면 홈 일수와 세션 일수가 같아야 한다.
    @Test func homeAndSessionAgreeWhenAllCardioIsOneExercise() {
        let sessions = [
            run("2026-08-17", min: 8), run("2026-08-18", min: 3), run("2026-08-19", min: 6),
            run("2026-08-21", min: 0),                              // 0분 (금)
            run("2026-08-22", min: 7), run("2026-08-23", min: 8),
        ]
        let sunday = GymWeightLogic.isoFmt.date(from: "2026-08-23")!
        let home = GymHomeLogic.cardioWeek(sessions: sessions, custom: [], now: sunday)
        let card = GymSessionLogic.cardioMetricWeek(history: sessions, todaySets: [],
                                                    exerciseId: "treadmill",
                                                    metric: .duration, now: sunday)
        #expect(home.thisDays == card.dayCount, "홈 \(home.thisDays)일 vs 카드 \(card.dayCount)일")
        #expect(String(home.thisTotal) == card.total, "홈 \(home.thisTotal)분 vs 카드 \(card.total)분")
    }
}

import Foundation
import Testing
@testable import GymCore

// 유산소 주 지표를 시간 → 거리로 (사용자 2026-09-17).
// 세 지표(시간·거리·칼로리)는 그대로 두고 **거리를 앞으로** 뺀다: 세션 카드는 거리로 진입하고,
// 홈 카드는 분 대신 km 를 센다. 시간은 두 번째 지표로 남고 칼로리 추정의 입력으로도 계속 쓰인다.
//
// 실기기 실측(2026-09-17): 유산소 done 세트 24건 전부 트레드밀, 거리 입력 21건(87.5%).
// 홈 카드 집계(km·날짜 집합·갱신 칩)는 CardioCardTests 가 정본이고, 여기서는 지표 순서와
// 거리 우선 표기만 본다.
@Suite struct CardioDistanceFirstTests {

    func run(_ date: String, min: Double?, km: Double?, kcal: Double? = nil) -> GymSession {
        GymSession(id: "c-\(date)", date: date,
                   blocks: [GymBlock(exerciseId: "treadmill", sets: [
                       GymSet(done: true, duration: min.map { $0 * 60 }, distance: km, calories: kcal)])],
                   status: .completed)
    }








    // MARK: - 거리 우선 표기 (홈 '다음' 미리보기 · 날짜 상세)

    @Test func nextPreviewPutsDistanceFirst() {
        var s = GymSession(id: "a", date: "2026-05-06", status: .active)
        s.blocks = [GymBlock(exerciseId: "bench_press", sets: [GymSet(weight: 60, reps: 10)]),
                    GymBlock(exerciseId: "treadmill",
                             sets: [GymSet(duration: 900, distance: 1.5)])]
        let p = GymHomeLogic.nextBlockPreviews(session: s, custom: [])
        #expect(p.first?.summary == "1.5km · 15분")
    }

    // 거리가 없으면 시간만 — km 0 을 지어내지 않는다.
    @Test func nextPreviewFallsBackToMinutes() {
        var s = GymSession(id: "a", date: "2026-05-06", status: .active)
        s.blocks = [GymBlock(exerciseId: "bench_press", sets: [GymSet(weight: 60, reps: 10)]),
                    GymBlock(exerciseId: "treadmill", sets: [GymSet(duration: 900)])]
        #expect(GymHomeLogic.nextBlockPreviews(session: s, custom: []).first?.summary == "15분")
    }

    @Test func dayDetailPutsDistanceFirst() {
        let e = GymDayDetailLogic.entry(for: run("2026-05-06", min: 15, km: 1.5), custom: [])
        #expect(e.ex.first?.s == "1.5km · 15분")
    }

    @Test func dayDetailWithoutDistanceKeepsMinutes() {
        let e = GymDayDetailLogic.entry(for: run("2026-05-06", min: 15, km: nil), custom: [])
        #expect(e.ex.first?.s == "15분")
    }

    // MARK: - 거리 미기록 날 표기

    // 뛰었는데 거리가 0km 일 수는 없으므로 0 은 "안 적은 날"이다. 세션 트레드밀 카드가 같은
    // 상황을 "—" 로 쓰므로(§5 "그 지표 기록이 없는 과거 요일") 홈도 같게 읽혀야 한다.
    // 실기기 실측: 최근 6주 중 3주에 거리 0 인 날이 한 건씩 있었다 (2026-09-17).
    @Test func homeCardShowsDashWhenDistanceMissing() {
        #expect(GymHomeLogic.cardioCellText(nil) == nil)      // 안 뛴 날 — 빈 원
        #expect(GymHomeLogic.cardioCellText(0) == "—")        // 뛰었지만 거리 미기록
        #expect(GymHomeLogic.cardioCellText(1.5) == "1.5")
        #expect(GymHomeLogic.cardioCellText(0.3) == "0.3")
    }

    // 일수·합계는 그대로 — 거리를 안 적었어도 '뛴 날'이다 (§14 링 == 채운 원).
    @Test func missingDistanceStillCountsAsADay() {
        let now = GymWeightLogic.isoFmt.date(from: "2026-05-06")!
        let w = GymHomeLogic.cardioWeek(
            sessions: [run("2026-05-04", min: 14, km: nil), run("2026-05-05", min: 15, km: 1.5)],
            custom: [], now: now)
        #expect(w.thisKm[0] == 0 && w.thisDays == 2 && w.thisTotalKm == 1.5)
    }

    // MARK: - 직전 기록 고스트 (거리 우선으로 바꾸며 드러난 기존 결함)

    // GymCardioRun.durationSec 은 비옵셔널이라 시간 미입력이 0 으로 들어온다 (distanceKm·kcal 은 nil).
    // 그 0 을 그대로 참조값으로 쓰면 "직전 기록 0분" 이 떠서, 설계가 막으려던 바로 그 오인
    // (2026-09-10 "값을 넣지 않고 넘어가 시간이 0분으로 남은 사고")이 재현된다.
    // 값이 0 인 지표는 직전 기록이 없는 것으로 본다.
    @Test func zeroDurationIsNotAGhostReference() {
        let hist = [run("2026-05-04", min: nil, km: 1.5)]        // 거리만 적은 직전 세션
        let now = GymWeightLogic.isoFmt.date(from: "2026-05-06")!
        let w = GymSessionLogic.cardioMetricWeek(history: hist, todaySets: [],
                                                 exerciseId: "treadmill", metric: .duration, now: now)
        #expect(w.days[2].style == .todayRef)
        #expect(w.days[2].text == nil, "직전에 시간을 안 적었으면 0 을 고스트로 내밀지 않는다")
    }

    // 거리는 적혀 있으므로 거리 화면에서는 정상적으로 고스트가 뜬다 (대조군).
    @Test func recordedMetricStillGhosts() {
        let hist = [run("2026-05-04", min: nil, km: 1.5)]
        let now = GymWeightLogic.isoFmt.date(from: "2026-05-06")!
        let w = GymSessionLogic.cardioMetricWeek(history: hist, todaySets: [],
                                                 exerciseId: "treadmill", metric: .distance, now: now)
        #expect(w.days[2].text == "1.5")
    }
}

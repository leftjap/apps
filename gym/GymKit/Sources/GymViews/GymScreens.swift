import SwiftUI
import GymCore

// gymshot 스냅샷 모드 — ImageRenderer 는 ScrollView 내부 미렌더 → 시트류가 평면 스택으로 우회.
public enum GymSnapshot {
    @MainActor public static var isActive = false
}

// gymshot 이 렌더할 화면/컴포넌트 스냅샷 카탈로그.
public enum GymScreens {
    // 요약 스냅샷용 완료 세션 (실 ID + PR 플래그 + 소요/칼로리).
    static func demoCompletedSession() -> GymSession {
        var s = GymSession(id: "sum-demo", date: "2026-05-06",
            startTime: 1_746_500_000_000, endTime: 1_746_500_000_000 + 52 * 60000, blocks: [
                GymBlock(exerciseId: "bench_press", sets: [
                    GymSet(weight: 60, reps: 10, done: true), GymSet(weight: 65, reps: 10, done: true),
                    GymSet(weight: 70, reps: 8, done: true, pr: true), GymSet(weight: 72, reps: 6, done: true),
                    GymSet(weight: 72, reps: 5, done: true)]),
                GymBlock(exerciseId: "incline_bench", sets: [
                    GymSet(weight: 45, reps: 10, done: true), GymSet(weight: 45, reps: 10, done: true),
                    GymSet(weight: 45, reps: 9, done: true), GymSet(weight: 45, reps: 8, done: true)]),
                GymBlock(exerciseId: "dumbbell_fly", sets: [
                    GymSet(weight: 18, reps: 12, done: true), GymSet(weight: 18, reps: 12, done: true),
                    GymSet(weight: 18, reps: 10, done: true)]),
            ], tags: ["chest"], status: .completed)
        s.durationMin = 52; s.totalCalories = 423
        return s
    }

    // 데모 모델 — 기준일을 시드 주(2026-05-06)로 고정해 홈/통계가 채워지게.
    @MainActor static func demoModel() -> GymAppModel {
        let m = GymAppModel()
        if let d = GymAppModel.dayFmt.date(from: "2026-05-06") { m.referenceToday = d }
        healthySync(m); return m
    }

    // 스냅샷은 백업 정상 상태로 고정 — 빈 syncState 로 두면 위험 배너가 모든 데모에 뜬다.
    @MainActor static func healthySync(_ m: GymAppModel) {
        m.syncState = GymSyncState(signedIn: true, userEmail: "leftjap@gmail.com",
                                   lastSuccessAt: Int64(m.referenceToday.timeIntervalSince1970 * 1000))
    }

    // 유산소 데모 — 5필드 패널 (설계 2026-08-10): 시간만 입력(잉크 20분), 나머지는 직전 러닝
    // 고스트. 이력 6회(10→15분 스텝업)로 차트·직전 줄까지 한 렌더에서 검증.
    @MainActor static func demoCardioModel() -> GymAppModel {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let s = GymSession(id: "cardio-demo", date: "2026-05-06", startTime: now - 18 * 60 * 1000, blocks: [
            GymBlock(exerciseId: "bench_press", sets: [
                GymSet(weight: 60, reps: 10, done: true), GymSet(weight: 65, reps: 10, done: true)],
                     finishedAt: 1),
            GymBlock(exerciseId: "treadmill", sets: [
                GymSet(preset: false, duration: 1200)]),
        ], tags: ["chest", "cardio"], status: .active)
        let m = GymAppModel(snapshotSession: s)
        func run(_ id: String, _ date: String, _ min: Double, _ km: Double,
                 incline: Double?, kcal: Double?) -> GymSession {
            GymSession(id: id, date: date,
                       blocks: [GymBlock(exerciseId: "treadmill", sets: [
                           GymSet(done: true, duration: min * 60, distance: km, speed: 6.0,
                                  incline: incline, calories: kcal)])],
                       tags: ["cardio"], status: .completed)
        }
        m.history = [run("cr1", "2026-04-24", 10, 1.0, incline: nil, kcal: nil),
                     run("cr2", "2026-04-26", 10, 1.0, incline: nil, kcal: nil),
                     run("cr3", "2026-04-28", 12, 1.2, incline: 2.0, kcal: 60),
                     run("cr4", "2026-04-30", 15, 1.5, incline: 3.0, kcal: 75),
                     run("cr5", "2026-05-02", 15, 1.5, incline: 3.0, kcal: 76),
                     run("cr6", "2026-05-04", 15, 1.5, incline: 3.4, kcal: 81)]
        return m
    }

    // 빈 세션 데모 (§6-1 — NEW SESSION + 인라인 운동추가 시트).
    // 맨몸(bodyweight) 히어로 검증용 — 중량이 없어 횟수를 히어로로 그린다 (2026-07-19).
    @MainActor static func demoBodyweightModel() -> GymAppModel {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let s = GymSession(id: "bw-demo", date: "2026-05-06", startTime: now - 18 * 60 * 1000, blocks: [
            GymBlock(exerciseId: "bench_press", sets: [
                GymSet(weight: 60, reps: 10, done: true)], finishedAt: 1),
            GymBlock(exerciseId: "decline_situp", sets: [
                GymSet(reps: 10, done: true), GymSet(reps: 10, preset: true), GymSet(reps: 9, preset: true)]),
        ], tags: ["chest", "core"], status: .active)
        return GymAppModel(snapshotSession: s)
    }

    @MainActor static func demoEmptyModel() -> GymAppModel {
        GymAppModel(snapshotSession: GymSession(id: "empty-demo", date: "2026-05-06", status: .active))
    }

    // 세션 신기록 데모 — 오늘 누적 > 직전 총볼륨 (§5.4 헤더 취소선·신기록 태그·링 펄스 정적).
    @MainActor static func demoRecordModel() -> GymAppModel {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let done = (0..<7).map { _ in GymSet(weight: 100, reps: 10, done: true) }
        let s = GymSession(id: "record-demo", date: "2026-05-06", startTime: now - 40 * 60 * 1000,
                           blocks: [GymBlock(exerciseId: "bench_press",
                                             sets: done + [GymSet(weight: 100, reps: 10, preset: true)])],
                           tags: ["chest"], status: .active)
        return GymAppModel(snapshotSession: s)
    }

    // 홈 idle 데모 — 진행 중 세션 없음 (HomeA 분기).
    @MainActor static func demoIdleModel() -> GymAppModel {
        let m = demoEmptyModel()
        if let d = GymAppModel.dayFmt.date(from: "2026-05-06") { m.referenceToday = d }
        healthySync(m); return m
    }

    // 홈 회귀 시나리오 — "어제(월 7/13) 앱만 열어 빈 활성 세션이 생기고, 오늘(화 7/14) 01:00 에 운동".
    // 세션 date 는 어제인 채로 운동이 진행되므로, finalize 가 실제 운동 시각으로 재귀속해야
    // 캘린더 도트·직전 운동이 '오늘' 로 찍힌다 (구결함: 어제에 찍힘).
    @MainActor static func demoStaleDayModel() -> GymAppModel {
        let stale = GymSession(id: "stale-empty", date: "2026-07-13", status: .active)  // 어제 생긴 빈 세션
        let m = GymAppModel(snapshotSession: stale)
        if let d = GymAppModel.dayFmt.date(from: "2026-07-14") { m.referenceToday = d }
        let midnight = GymAppModel.dayFmt.date(from: "2026-07-14")!.timeIntervalSince1970
        let start = Int64((midnight + 3600) * 1000)      // 오늘 01:00 에 첫 종목 추가
        let todays = GymSession(id: "todays", date: "2026-07-13", startTime: start, blocks: [
            GymBlock(exerciseId: "squat",
                     sets: (0..<5).map { _ in GymSet(weight: 100, reps: 5, done: true) }),
            GymBlock(exerciseId: "shoulder_press",
                     sets: (0..<4).map { _ in GymSet(weight: 40, reps: 10, done: true) }),
        ], tags: ["legs", "shoulder"], status: .active)
        let lastWeek = GymSession(id: "lw", date: "2026-07-08", blocks: [
            GymBlock(exerciseId: "bench_press",
                     sets: (0..<6).map { _ in GymSet(weight: 60, reps: 10, done: true) }),
        ], tags: ["chest"], status: .completed)
        m.history = [GymSessionLogic.finalize(todays, endTime: start + 40 * 60_000), lastWeek]
        healthySync(m); return m
    }

    // 확정 시안 7a 픽셀 대조용 세션 유산소 카드 (작업지시서 2026-08-18).
    // 오늘 = 2026-08-21(금). 이번 주 월15·수20·목15분, 지난주 토20분, 오늘 32분·3.4km·칼로리 미입력.
    //   시간   → 원 15/·/20/15/32/20(회색)/· · 합계 82분 4일
    //   칼로리 → 96/·/128/85/85(참조)/122(회색)/· · 합계 309kcal 3일
    // 세션 볼륨 4,800 / 8,940kg (54%) 는 전 페이지 공통 요소라 반드시 유지된다 (§2).
    @MainActor static func demoCardio7aModel() -> GymAppModel {
        func run(_ d: String, _ min: Double, _ km: Double, _ kcal: Double) -> GymSession {
            GymSession(id: "c\(d)", date: d,
                       blocks: [GymBlock(exerciseId: "treadmill", sets: [
                           GymSet(done: true, duration: min * 60, distance: km, calories: kcal)])],
                       tags: ["cardio"], status: .completed)
        }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let bench = (0..<8).map { _ in GymSet(weight: 60, reps: 10, done: true) }   // 4,800kg
        let s = GymSession(id: "cardio-7a", date: "2026-08-21", startTime: now - 18 * 60 * 1000,
                           blocks: [GymBlock(exerciseId: "bench_press", sets: bench, finishedAt: 1),
                                    GymBlock(exerciseId: "treadmill",
                                             sets: [GymSet(preset: false, duration: 1920, distance: 3.4)])],
                           tags: ["chest", "cardio"], status: .active)
        let m = GymAppModel(snapshotSession: s)
        if let d = GymAppModel.dayFmt.date(from: "2026-08-21") { m.referenceToday = d }
        var prev = GymSession(id: "prev", date: "2026-08-14", blocks: [], tags: ["chest"], status: .completed)
        prev.totalVolume = 8940                                   // 세션 볼륨 분모
        // prevSession = history.first(completed) → 세션 볼륨 분모(8,940kg)가 되려면 맨 앞
        m.history = [prev, run("2026-08-20", 15, 1.4, 85), run("2026-08-19", 20, 2.0, 128),
                     run("2026-08-17", 15, 1.5, 96), run("2026-08-15", 20, 2.2, 122)]
        healthySync(m); return m
    }

    // 시안 20a 픽셀 대조용 홈 — `specs/2026-08-17-home-redesign-20a.md` 의 예시 데이터를 그대로 재현한다.
    // 오늘 = 2026-08-11(화). 그 주 월요일이 10일이라 캘린더가 시안(1주차 3~9 / 2주차 10~16)과 일치.
    //   근력 3·5·7·8·10·11, 유산소 5·7·8·10·11 (§5 샘플)
    //   밸런스 이번주 하체8 어깨5 등6 가슴7 팔4 코어2 = 32, 지난주 6·4·5·5·3·4 = 27 → +5 (§7 표)
    //   유산소 이번주 월30 화27 = 57분 2일, 지난주 수25 금28 토22 = 75분 3일 → "18분 더 하면 갱신" (§8)
    //   체중 72.4 (직전 72.6 → −0.2), 목표 69 → 3.4kg 남음 (§9)
    @MainActor static func demo20aModel() -> GymAppModel {
        func done(_ w: Double, _ r: Int) -> GymSet { GymSet(weight: w, reps: r, done: true) }
        // 부위별 세트 수 → 블록. 부위당 대표 종목 1개면 밸런스 집계엔 충분하다.
        func lift(_ id: String, _ date: String, _ tags: [String], _ spec: [(String, Int)]) -> GymSession {
            GymSession(id: id, date: date, startTime: 1_754_870_000_000,
                       blocks: spec.map { ex, n in
                           GymBlock(exerciseId: ex, sets: (0..<n).map { _ in done(50, 10) })
                       }, tags: tags, status: .completed)
        }
        func run(_ id: String, _ date: String, _ min: Double) -> GymSession {
            GymSession(id: id, date: date,
                       blocks: [GymBlock(exerciseId: "treadmill",
                                         sets: [GymSet(done: true, duration: min * 60)])],
                       status: .completed)
        }
        let m = demoEmptyModel()
        if let d = GymAppModel.dayFmt.date(from: "2026-08-11") { m.referenceToday = d }
        m.history = [
            // 이번 주 — history.first 가 직전 운동 행의 소스라 오늘(8/11) 세션이 맨 앞.
            lift("t-0811", "2026-08-11", ["chest", "arms"],
                 [("bench_press", 7), ("bicep_curl", 4), ("hanging_leg_raise", 2)]),
            lift("t-0810", "2026-08-10", ["legs", "shoulder", "back"],
                 [("squat", 8), ("shoulder_press", 5), ("barbell_row", 6)]),
            // 지난 주
            lift("p-0808", "2026-08-08", ["legs", "core"], [("squat", 6), ("hanging_leg_raise", 4)]),
            lift("p-0807", "2026-08-07", ["back", "arms"], [("barbell_row", 5), ("bicep_curl", 3)]),
            lift("p-0805", "2026-08-05", ["chest"], [("bench_press", 5)]),
            lift("p-0803", "2026-08-03", ["shoulder"], [("shoulder_press", 4)]),
            run("r-0811", "2026-08-11", 27), run("r-0810", "2026-08-10", 30),
            run("r-0808", "2026-08-08", 22), run("r-0807", "2026-08-07", 28),
            run("r-0805", "2026-08-05", 25),
        ]
        // 30일 스파크라인 — 완만한 감소 + 실제 체중계처럼 흔들림. 오늘 72.4 / 직전 72.6 (§9 예시 −0.2).
        m.weights = (0..<30).map { i in
            GymWeight(date: GymAppModel.dayFmt.string(
                from: GymAppModel.kst.date(byAdding: .day, value: -i, to: m.referenceToday)!),
                      kg: ((72.4 + Double(i) * 0.055 + 0.15 * sin(Double(i))) * 10).rounded() / 10,
                      height: 173)
        }
        m.settings = GymUserSettings(weeklyGoal: 4, height: 173, birthYear: 1976, goalWeight: 69)
        healthySync(m); return m
    }

    // 유산소를 한 번도 안 한 사용자 (§14 마지막 항목) — 원 7개 전부 빈 원, 하단 칩 숨김.
    @MainActor static func demoNoCardioModel() -> GymAppModel {
        let m = demo20aModel()
        m.history = m.history.filter { !$0.id.hasPrefix("r-") }
        return m
    }

    // 백업 위험 홈 — 미로그인 상태에서 상단 경고 배너 노출 (2026-07-14 사고 안전장치 검증용).
    @MainActor static func demoAtRiskModel() -> GymAppModel {
        let m = demoIdleModel()
        m.syncState = GymSyncState(signedIn: false, lastSuccessAt: nil)
        return m
    }

    @MainActor
    public static func snapshotView(id: String) -> AnyView? {
        GymSnapshot.isActive = true
        switch id {
        case "rail":         return AnyView(RailDemo(single: false))
        case "rail-single":  return AnyView(RailDemo(single: true))
        case "session-top":  return AnyView(SessionTopBlock())
        case "session":      return AnyView(SessionScreenView().frame(width: 390, height: 844))
        case "session-keypad": return AnyView(SessionScreenView(initialKeypadField: .weight).frame(width: 390, height: 844))
        case "session-pr":   return AnyView(SessionScreenView(initialPRPop: true).frame(width: 390, height: 844))
        case "session-addex": return AnyView(SessionScreenView(initialAddex: true).frame(width: 390, height: 844))
        case "session-action": return AnyView(SessionScreenView(initialAction: true).frame(width: 390, height: 844))
        case "session-drag":  return AnyView(SessionScreenView(initialDragX: -70).frame(width: 390, height: 844))
        case "session-record": return AnyView(SessionScreenView(model: demoRecordModel()).frame(width: 390, height: 844))
        case "session-empty": return AnyView(SessionScreenView(model: demoEmptyModel()).frame(width: 390, height: 844))
        case "session-cardio": return AnyView(SessionScreenView(model: demoCardioModel()).frame(width: 390, height: 844))
        case "cardio-7a":    return AnyView(SessionScreenView(model: demoCardio7aModel()).frame(width: 375, height: 812))
        case "cardio-7a-max": return AnyView(SessionScreenView(model: demoCardio7aModel()).frame(width: 430, height: 932))
        case "cardio-7a-kcal": return AnyView(SessionScreenView(model: demoCardio7aModel(), initialCardioMetric: .calories).frame(width: 375, height: 812))
        case "session-bodyweight": return AnyView(SessionScreenView(model: demoBodyweightModel()).frame(width: 390, height: 844))
        case "summary":      return AnyView(SummaryScreenView(session: demoCompletedSession(), sessionNo: 42, totalCount: 42).frame(width: 390, height: 844))
        case "stats":        return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false).frame(width: 390, height: 844))
        case "stats-day":    return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false, initialDetailISO: "2026-05-05").frame(width: 390, height: 844))
        case "stats-day-confirm": return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false, initialDetailISO: "2026-05-05", initialDetailConfirm: true).frame(width: 390, height: 844))
        case "stats-ex":     return AnyView(StatsScreenView(model: demoModel(), initialTab: .exercise, embedScroll: false).frame(width: 390, height: 844))
        case "stats-body":   return AnyView(StatsScreenView(model: demoModel(), initialTab: .body, embedScroll: false).frame(width: 390, height: 844))
        case "login":        return AnyView(GymLoginView().frame(width: 390, height: 844))
        case "home":         return AnyView(HomeScreenView(model: demoIdleModel()).frame(width: 390, height: 844))
        // 시안 20a 정본 대조 — 기준 기기 375×812 (11 Pro). 세로 여유 0 이라 폭·높이를 시안에 맞춘다.
        case "home-20a":     return AnyView(HomeScreenView(model: demo20aModel()).frame(width: 375, height: 812))
        case "home-nocardio": return AnyView(HomeScreenView(model: demoNoCardioModel()).frame(width: 375, height: 812))
        // §12 작은 화면(SE 375×667) 컴팩트 레이아웃 — 스크롤 콘텐츠의 자연 높이를 그대로 렌더한다
        // (ImageRenderer 가 ScrollView 내부를 못 잡으므로 스택을 직접 렌더). 뷰포트 647 과 비교용.
        case "home-se":      return AnyView(HomeScreenView(model: demo20aModel())
                                                .homeAStack(compact: true)
                                                .frame(width: 375).background(GY.shell))
        case "home-stale":   return AnyView(HomeScreenView(model: demoStaleDayModel()).frame(width: 390, height: 844))
        case "home-atrisk":  return AnyView(HomeScreenView(model: demoAtRiskModel()).frame(width: 390, height: 844))
        case "home-active":  return AnyView(HomeScreenView(model: demoModel()).frame(width: 390, height: 844))
        case "admin":        return AnyView(AdminScreenView(model: demoModel(), initialTab: .ex, embedScroll: false).frame(width: 390, height: 844))
        case "admin-weight": return AnyView(AdminScreenView(model: demoModel(), initialTab: .weight, embedScroll: false).frame(width: 390, height: 844))
        case "admin-profile":return AnyView(AdminScreenView(model: demoModel(), initialTab: .profile, embedScroll: false).frame(width: 390, height: 844))
        case "admin-profile-atrisk": return AnyView(AdminScreenView(model: demoAtRiskModel(), initialTab: .profile, embedScroll: false).frame(width: 390, height: 844))
        case "admin-profile-edit": return AnyView(AdminScreenView(model: demoModel(), initialTab: .profile, embedScroll: false, initialProfileField: "birthdate").frame(width: 390, height: 844))
        case "root":         return AnyView(GymRootView(model: demoModel()).frame(width: 390, height: 844))
        case "tokens":       return AnyView(TokenSwatch())
        default:             return nil
        }
    }
}

// 레일 데모 — 시안 #15a(4종목) / 단일 종목.
struct RailDemo: View {
    let single: Bool
    var body: some View {
        VStack {
            Spacer()
            GymFooterRail(items: single
                ? [.init(name: "인클라인 벤치", state: .current)]
                : [.init(name: "체스트 프레스", state: .done, blockIdx: 0),
                   .init(name: "벤치프레스", state: .current, blockIdx: 1),
                   .init(name: "인클라인 덤벨 프레스", state: .upcoming, blockIdx: 2),
                   .init(name: "케이블 플라이", state: .upcoming, blockIdx: 3)])
        }
        .frame(width: single ? 390 : 660, height: 300)
        .background(GY.shell)
    }
}

// 토큰 스와치 — oklch 변환 렌더 검증.
struct TokenSwatch: View {
    let swatches: [(String, Color)] = [
        ("ink1", GY.ink1), ("ink3", GY.ink3), ("crailBase", GY.crailBase),
        ("crailDeep", GY.crailDeep), ("cloudyBase", GY.cloudyBase), ("sage", GY.sage),
        ("recordBase", GY.recordBase), ("line", GY.line), ("sunken", GY.sunken),
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(swatches, id: \.0) { s in
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 6).fill(s.1).frame(width: 44, height: 28)
                    Text(s.0).font(.system(size: 13)).foregroundStyle(GY.ink2)
                }
            }
        }
        .padding(20)
        .frame(width: 300, height: 340, alignment: .topLeading)
        .background(GY.card)
    }
}

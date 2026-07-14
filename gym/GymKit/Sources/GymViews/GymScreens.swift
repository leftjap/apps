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

    // 유산소 데모 — 트레드밀 진행 중 (시간 30분·거리 3.2km → 페이스 9:23/km).
    @MainActor static func demoCardioModel() -> GymAppModel {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let s = GymSession(id: "cardio-demo", date: "2026-05-06", startTime: now - 18 * 60 * 1000, blocks: [
            GymBlock(exerciseId: "bench_press", sets: [
                GymSet(weight: 60, reps: 10, done: true), GymSet(weight: 65, reps: 10, done: true)],
                     finishedAt: 1),
            GymBlock(exerciseId: "treadmill", sets: [
                GymSet(preset: true, duration: 1800, distance: 3.2)]),
        ], tags: ["chest", "cardio"], status: .active)
        return GymAppModel(snapshotSession: s)
    }

    // 빈 세션 데모 (§6-1 — NEW SESSION + 인라인 운동추가 시트).
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
        case "summary":      return AnyView(SummaryScreenView(session: demoCompletedSession(), sessionNo: 42, totalCount: 42).frame(width: 390, height: 844))
        case "stats":        return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false).frame(width: 390, height: 844))
        case "stats-day":    return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false, initialDetailISO: "2026-05-05").frame(width: 390, height: 844))
        case "stats-day-confirm": return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false, initialDetailISO: "2026-05-05", initialDetailConfirm: true).frame(width: 390, height: 844))
        case "stats-ex":     return AnyView(StatsScreenView(model: demoModel(), initialTab: .exercise, embedScroll: false).frame(width: 390, height: 844))
        case "stats-body":   return AnyView(StatsScreenView(model: demoModel(), initialTab: .body, embedScroll: false).frame(width: 390, height: 844))
        case "home":         return AnyView(HomeScreenView(model: demoIdleModel()).frame(width: 390, height: 844))
        case "home-stale":   return AnyView(HomeScreenView(model: demoStaleDayModel()).frame(width: 390, height: 844))
        case "home-atrisk":  return AnyView(HomeScreenView(model: demoAtRiskModel()).frame(width: 390, height: 844))
        case "home-active":  return AnyView(HomeScreenView(model: demoModel()).frame(width: 390, height: 844))
        case "admin":        return AnyView(AdminScreenView(model: demoModel(), initialTab: .ex, embedScroll: false).frame(width: 390, height: 844))
        case "admin-weight": return AnyView(AdminScreenView(model: demoModel(), initialTab: .weight, embedScroll: false).frame(width: 390, height: 844))
        case "admin-profile":return AnyView(AdminScreenView(model: demoModel(), initialTab: .profile, embedScroll: false).frame(width: 390, height: 844))
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
                : [.init(name: "체스트 프레스", state: .done),
                   .init(name: "벤치프레스", state: .current),
                   .init(name: "인클라인 덤벨 프레스", state: .upcoming),
                   .init(name: "케이블 플라이", state: .upcoming)])
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

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
        return m
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

    // 홈 idle 데모 — 진행 중 세션 없음 (HomeA 분기).
    @MainActor static func demoIdleModel() -> GymAppModel {
        let m = demoEmptyModel()
        if let d = GymAppModel.dayFmt.date(from: "2026-05-06") { m.referenceToday = d }
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
        case "session-empty": return AnyView(SessionScreenView(model: demoEmptyModel()).frame(width: 390, height: 844))
        case "session-cardio": return AnyView(SessionScreenView(model: demoCardioModel()).frame(width: 390, height: 844))
        case "summary":      return AnyView(SummaryScreenView(session: demoCompletedSession(), sessionNo: 42, totalCount: 42).frame(width: 390, height: 844))
        case "stats":        return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false).frame(width: 390, height: 844))
        case "stats-day":    return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false, initialDetailISO: "2026-05-05").frame(width: 390, height: 844))
        case "stats-day-confirm": return AnyView(StatsScreenView(model: demoModel(), initialTab: .cal, embedScroll: false, initialDetailISO: "2026-05-05", initialDetailConfirm: true).frame(width: 390, height: 844))
        case "stats-ex":     return AnyView(StatsScreenView(model: demoModel(), initialTab: .exercise, embedScroll: false).frame(width: 390, height: 844))
        case "stats-body":   return AnyView(StatsScreenView(model: demoModel(), initialTab: .body, embedScroll: false).frame(width: 390, height: 844))
        case "home":         return AnyView(HomeScreenView(model: demoIdleModel()).frame(width: 390, height: 844))
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

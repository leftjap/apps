import SwiftUI
import GymCore
#if canImport(UIKit)
import UIKit
#endif

// 앱 상태 — 라우팅 + 세션 상태머신 (PWA app.js·session.js 이식). 화면이 이 모델을 구동한다.
public enum GymRoute: Equatable { case home, session, stats, summary, admin }

@MainActor
public final class GymAppModel: ObservableObject {
    @Published public var route: GymRoute = .home
    @Published public var session: GymSession { didSet { LocalStore.saveSession(session) } }
    @Published public var history: [GymSession]      // 완료 세션 이력 (홈·통계·직전기록·프리셋)
    @Published public var prs: [GymPR]               // 개인 기록 (PR 감지)
    @Published public var prMoment: Int = 0          // PR 팝 트리거 (증가 시 뷰가 팝)
    public var custom: [GymCustomExercise]           // 커스텀 운동 (이름·부위 resolve)
    public var weights: [GymWeight]                  // 체중 로그
    public var settings: GymUserSettings             // 사용자 설정
    public var referenceToday: Date = Date()         // 홈/통계 "오늘" 기준 (스냅샷은 고정 주입)
    public var statsInitialTab: StatsScreenView.Tab = .cal   // 검증 훅용 초기 탭
    public var adminInitialTab: AdminScreenView.Tab = .ex    // 검증 훅용 초기 탭
    public let cloud = CloudStore()   // 클라우드 sync (local-first — 로그인은 선택)

    public init() {
        // 첫 실행 시 데모 이력·PR·체중 시드 (빈 상태일 때만) → 홈·통계·직전기록이 실데이터 구동.
        GymAppModel.seedIfEmpty()
        // 로컬 영속 우선 로드 (init 할당은 didSet 미발화 → 저장 안 함).
        if let loaded = LocalStore.loadSession() {
            session = loaded
        } else {
            // 데모: 진행 중처럼 보이도록 시작 시각을 18분 전으로 (라이브 타이머 현실값).
            var demo = GymAppModel.demoSession()
            demo.startTime = Int64(Date().timeIntervalSince1970 * 1000) - 18 * 60 * 1000
            session = demo
        }
        history = LocalStore.loadSessions()
        prs = LocalStore.loadPRs()
        custom = LocalStore.loadCustomExercises()
        weights = LocalStore.loadWeights()
        settings = LocalStore.loadSettings()
    }

    // MARK: - 운동 카탈로그 헬퍼 (Exercises.swift resolve)

    public var currentExerciseId: String { currentBlock?.exerciseId ?? "" }
    public func exerciseName(_ id: String) -> String { GymExercises.resolveName(id, custom: custom) }
    public var currentExerciseName: String { exerciseName(currentExerciseId) }
    public var currentPartId: String { GymExercises.resolvePart(currentExerciseId, custom: custom) }
    public var currentPartName: String { GymExercises.partName(currentPartId) }
    public func increment(for exId: String) -> Double { GymExercises.increment(forExercise: exId, custom: custom) }
    public var currentIsCardio: Bool { GymExercises.def(currentExerciseId, custom: custom)?.isCardio ?? false }

    // MARK: - 직전 세션 조회 (프리셋·직전기록 바·프로그레스바 분모)

    // 이 종목을 포함한 가장 최근 완료 세션의 블록 (현재 세션 제외). history 는 startTime desc.
    public func prevBlock(forExercise exId: String) -> GymBlock? {
        for s in history where s.id != session.id && s.status == .completed {
            if let b = s.blocks.first(where: { $0.exerciseId == exId }) { return b }
        }
        return nil
    }
    // 직전 이 종목 총 볼륨 (프로그레스바 고정 분모, spec §6-7). 없으면 0.
    public func prevExerciseVolume(forExercise exId: String) -> Double {
        prevBlock(forExercise: exId)?.sets.reduce(0) { $0 + $1.volume } ?? 0
    }
    // 가장 최근 완료 세션 (우상단 세션 볼륨 분모용).
    public var prevSession: GymSession? {
        history.first { $0.id != session.id && $0.status == .completed }
    }

    // MARK: - 홈/통계 집계 (KST 기준)

    static let kst: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        c.firstWeekday = 2   // 월요일 시작
        return c
    }()
    static let dayFmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = kst; f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    // 완료 이력 + (활성 세션에 done 세트 있으면) 진행 중 세션.
    public func allWorkedSessions() -> [GymSession] {
        var xs = history.filter { $0.status == .completed }
        if session.blocks.contains(where: { $0.sets.contains { $0.done } }) { xs.append(session) }
        return xs
    }
    // 특정 날짜에 운동한 세션들.
    public func sessionsOn(_ dayStr: String) -> [GymSession] {
        allWorkedSessions().filter { $0.date == dayStr }
    }
    // 가장 최근 완료 세션 (직전 운동 카드).
    public func lastCompletedSession() -> GymSession? { history.first { $0.status == .completed } }

    // dayStr 이 ref 기준 며칠 전인지 (오늘=0, 어제=1).
    public func daysAgo(_ dayStr: String, from ref: Date) -> Int {
        guard let d = Self.dayFmt.date(from: dayStr) else { return 0 }
        return Self.kst.dateComponents([.day], from: Self.kst.startOfDay(for: d),
                                       to: Self.kst.startOfDay(for: ref)).day ?? 0
    }

    public struct HomeWeekCell: Identifiable {
        public let id = UUID()
        public let label: String; public let num: Int
        public let worked: Bool; public let partName: String?
        public let isToday: Bool; public let isLast: Bool
    }
    // 주간(월~일) 캘린더 셀 — ref 가 속한 주.
    public func weekCells(around ref: Date) -> [HomeWeekCell] {
        let cal = Self.kst
        guard let monday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: ref)) else { return [] }
        let refDay = Self.dayFmt.string(from: ref)
        let labels = ["월", "화", "수", "목", "금", "토", "일"]
        let worked = Set(allWorkedSessions().map(\.date))
        let lastWorked = worked.filter { $0 <= refDay }.max()
        return (0..<7).compactMap { i in
            guard let d = cal.date(byAdding: .day, value: i, to: monday) else { return nil }
            let ds = Self.dayFmt.string(from: d)
            let part = sessionsOn(ds).first?.tags.first.map { GymExercises.partName($0) }
            return HomeWeekCell(label: labels[i], num: cal.component(.day, from: d),
                                worked: worked.contains(ds), partName: part,
                                isToday: ds == refDay, isLast: ds == lastWorked)
        }
    }
    // 이번 주/지난 주 부위별 완료 세트 수 (부위 밸런스). offset 0=이번주, -1=지난주.
    public func partDoneSets(weekOffset: Int, from ref: Date) -> [String: Int] {
        let cal = Self.kst
        guard let thisMon = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: ref)),
              let monday = cal.date(byAdding: .day, value: 7 * weekOffset, to: thisMon),
              let sunday = cal.date(byAdding: .day, value: 6, to: monday) else { return [:] }
        let lo = Self.dayFmt.string(from: monday), hi = Self.dayFmt.string(from: sunday)
        var counts: [String: Int] = [:]
        for s in allWorkedSessions() where s.date >= lo && s.date <= hi {
            for b in s.blocks {
                let part = GymExercises.resolvePart(b.exerciseId, custom: custom)
                guard !part.isEmpty else { continue }
                counts[part, default: 0] += b.sets.filter(\.done).count
            }
        }
        return counts
    }
    // 이번 주 운동 횟수 (주간 목표 대비).
    public func sessionsThisWeek(from ref: Date) -> Int {
        let cal = Self.kst
        guard let monday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: ref)),
              let sunday = cal.date(byAdding: .day, value: 6, to: monday) else { return 0 }
        let lo = Self.dayFmt.string(from: monday), hi = Self.dayFmt.string(from: sunday)
        return Set(allWorkedSessions().filter { $0.date >= lo && $0.date <= hi }.map(\.date)).count
    }

    // MARK: - 클라우드 (선택적 sync)

    public func restoreCloud() async { await cloud.restore() }
    public func login() async { try? await cloud.signInWithGoogle(); await syncNow() }
    public func logout() async { await cloud.signOut() }
    public func syncNow() async {
        guard cloud.signedIn else { return }
        try? await cloud.upsertSession(session)
    }

    // 세션 종료 = 완료 처리 + 이력 저장 + 요약 + (로그인 시) 클라우드 upsert.
    public func endSession() {
        session.status = .completed
        session.endTime = nowMillis()
        session.totalVolume = sessionDoneVolume
        session.durationMin = elapsedMinutes()
        session.tags = sessionParts()
        session.totalCalories = estimatedCalories()
        LocalStore.upsertSessionHistory(session)
        history = LocalStore.loadSessions()
        route = .summary
        Task { await syncNow() }
    }

    // 검증/새 세션용 — 영속 초기화 + 데모 재시드.
    public func resetSession() {
        LocalStore.clearSession()
        session = GymAppModel.demoSession()
    }

    public static func statsTab(_ s: String) -> StatsScreenView.Tab? { StatsScreenView.Tab(rawValue: s) }
    public static func adminTab(_ s: String) -> AdminScreenView.Tab? { AdminScreenView.Tab(rawValue: s) }

    public func startSession() { route = .session }
    public func goHome() { route = .home }
    public func openStats() { route = .stats }
    public func openAdmin() { route = .admin }

    // MARK: - 세션 상태머신 (session.js 이식)

    public var currentBlockIdx: Int {
        for (i, blk) in session.blocks.enumerated() {
            if blk.sets.contains(where: { !$0.done }) { return i }
        }
        return max(0, session.blocks.count - 1)
    }
    public var currentBlock: GymBlock? {
        session.blocks.indices.contains(currentBlockIdx) ? session.blocks[currentBlockIdx] : nil
    }
    public var currentSetIdx: Int {
        currentBlock?.sets.firstIndex { !$0.done } ?? 0
    }
    public var currentSet: GymSet? {
        guard let b = currentBlock, b.sets.indices.contains(currentSetIdx) else { return nil }
        return b.sets[currentSetIdx]
    }

    // 세션 볼륨 = 전 블록 완료/계획 세트 볼륨 합.
    public var sessionDoneVolume: Double { blockVols { $0.done } }
    public var sessionTotalVolume: Double { blockVols { _ in true } }
    public var sessionPct: Int {
        // 우상단 세션 볼륨 = 오늘 done / 직전 세션 총볼륨 (spec §6-7). 직전 없으면 오늘 계획 대비.
        let denom = (prevSession?.totalVolume ?? 0) > 0 ? prevSession!.totalVolume : sessionTotalVolume
        return denom > 0 ? Int((sessionDoneVolume / denom * 100).rounded()) : 0
    }
    private func blockVols(_ pred: (GymSet) -> Bool) -> Double {
        var total = 0.0
        for b in session.blocks {
            for s in b.sets where pred(s) { total += s.volume }
        }
        return total
    }

    // 세트 완료 = PR 판정 → done → PR 저장/팝 + 햅틱 (spec §6-11).
    public func completeCurrentSet() {
        let bi = currentBlockIdx, si = currentSetIdx
        guard session.blocks.indices.contains(bi), session.blocks[bi].sets.indices.contains(si) else { return }
        let exId = session.blocks[bi].exerciseId
        let set = session.blocks[bi].sets[si]
        let w = set.weight ?? 0, r = set.reps ?? 0
        let res = GymPRLogic.evaluateSetPR(weight: w, reps: r, prs: prs, exerciseId: exId)
        session.blocks[bi].sets[si].done = true
        if res.isPR {
            session.blocks[bi].sets[si].pr = true
            LocalStore.upsertPR(GymPRLogic.buildPR(exerciseId: exId, weight: w, reps: r,
                                                   date: session.date, sessionId: session.id))
            prs = LocalStore.loadPRs()
            prMoment += 1
            impact(.heavy)
        } else {
            impact(.medium)
        }
    }
    // 이전 세트로 되돌리기 (우 스와이프 — 마지막 완료 세트를 미완료로, spec §6-3-1).
    public func revertToPreviousSet() {
        let bi = currentBlockIdx
        guard session.blocks.indices.contains(bi) else { return }
        let sets = session.blocks[bi].sets
        guard let lastDone = sets.lastIndex(where: { $0.done }) else { return }
        session.blocks[bi].sets[lastDone].done = false
        session.blocks[bi].sets[lastDone].pr = false
        impact(.light)
    }

    // 현재 세트 중량 증감 — 장비별 증분 (spec §6-3). dir = ±1. 맨몸·유산소는 미동작.
    public func adjustWeight(_ dir: Int) {
        let inc = increment(for: currentExerciseId)
        guard inc > 0 else { return }
        let bi = currentBlockIdx, si = currentSetIdx
        guard session.blocks.indices.contains(bi), session.blocks[bi].sets.indices.contains(si) else { return }
        let cur = session.blocks[bi].sets[si].weight ?? 0
        session.blocks[bi].sets[si].weight = max(0, cur + Double(dir) * inc)
        impact(.light)
    }
    // 현재 세트 횟수 증감 (±1).
    public func adjustReps(_ dir: Int) {
        let bi = currentBlockIdx, si = currentSetIdx
        guard session.blocks.indices.contains(bi), session.blocks[bi].sets.indices.contains(si) else { return }
        let cur = session.blocks[bi].sets[si].reps ?? 0
        session.blocks[bi].sets[si].reps = max(0, cur + dir)
        impact(.light)
    }

    // MARK: - 세션 파생값 (요약·칼로리)

    private func sessionParts() -> [String] {
        var seen: [String] = []
        for b in session.blocks {
            let p = GymExercises.resolvePart(b.exerciseId, custom: custom)
            if !p.isEmpty && !seen.contains(p) { seen.append(p) }
        }
        return seen
    }
    public func elapsedMinutes() -> Int {
        guard let st = session.startTime, st > 0 else { return 0 }
        let end = session.endTime ?? nowMillis()
        return max(0, Int((end - st) / 60000))
    }
    // 칼로리 = Σ(MET × 체중 × 시간(시) × 1.05), 종목별 시간 균등 배분 (spec §7-3).
    public func estimatedCalories() -> Int {
        let mins = elapsedMinutes()
        guard mins > 0, !session.blocks.isEmpty else { return 0 }
        let bodyKg = weights.first?.kg ?? 70
        let perBlockHr = (Double(mins) / 60.0) / Double(session.blocks.count)
        var kcal = 0.0
        for b in session.blocks {
            let met = GymExercises.def(b.exerciseId, custom: custom)?.met ?? 4.0
            kcal += met * bodyKg * perBlockHr * 1.05
        }
        return Int(kcal.rounded())
    }

    private func nowMillis() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }

    #if canImport(UIKit)
    private func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
    #else
    private enum Dummy { case light, medium, heavy }
    private func impact(_ style: Dummy) {}
    #endif

    // MARK: - 시드 (실 데이터 배선 전 데모 — 실 snake_case ID)

    // 진행 중 세션 (오늘, 가슴). session.js 시연값 정합.
    static func demoSession() -> GymSession {
        GymSession(id: "demo", date: "2026-05-06", startTime: 1_746_500_000_000, blocks: [
            GymBlock(exerciseId: "incline_bench", sets: [
                GymSet(weight: 50, reps: 10, done: true), GymSet(weight: 50, reps: 10, done: true),
                GymSet(weight: 50, reps: 8, done: true)], finishedAt: 1),
            GymBlock(exerciseId: "bench_press", sets: [
                GymSet(weight: 60, reps: 10, done: true), GymSet(weight: 65, reps: 10, done: true),
                GymSet(weight: 70, reps: 8, done: false), GymSet(weight: 72, reps: 8, done: false),
                GymSet(weight: 75, reps: 6, done: false)]),
            GymBlock(exerciseId: "dumbbell_fly", sets: [
                GymSet(weight: 20, reps: 10, done: false), GymSet(weight: 20, reps: 10, done: false)]),
            GymBlock(exerciseId: "cable_crossover", sets: [
                GymSet(weight: 20, reps: 12, done: false), GymSet(weight: 20, reps: 12, done: false)]),
        ], tags: ["chest"], status: .active)
    }

    // 완료 세션 이력 (홈 캘린더·통계·직전기록·프리셋 구동). 총볼륨은 done 세트 합산.
    static func seedHistory() -> [GymSession] {
        func mk(_ id: String, _ date: String, _ start: Int64, _ dur: Int, _ tags: [String],
                _ blocks: [GymBlock]) -> GymSession {
            let vol = blocks.reduce(0.0) { $0 + $1.sets.filter(\.done).reduce(0) { $0 + $1.volume } }
            return GymSession(id: id, date: date, startTime: start, endTime: start + Int64(dur) * 60000,
                              blocks: blocks, tags: tags, totalVolume: vol, durationMin: dur, status: .completed)
        }
        func done(_ w: Double, _ r: Int) -> GymSet { GymSet(weight: w, reps: r, done: true) }
        return [
            // 이번 주 하체 (5/5) — 홈 주간 캘린더·부위밸런스 이번주 소스.
            mk("h_0505", "2026-05-05", 1_746_410_000_000, 57, ["legs"], [
                GymBlock(exerciseId: "squat", sets: [done(72, 10), done(76, 8), done(80, 6), done(80, 6)]),
                GymBlock(exerciseId: "leg_press", sets: [done(110, 10), done(120, 10), done(130, 8)]),
                GymBlock(exerciseId: "leg_curl", sets: [done(32, 12), done(32, 12), done(36, 10)]),
            ]),
            // 직전 가슴 (5/3) — bench_press 4세트 = 직전기록 바 소스.
            mk("h_0503", "2026-05-03", 1_746_240_000_000, 54, ["chest"], [
                GymBlock(exerciseId: "incline_bench", sets: [done(45, 10), done(45, 10), done(45, 9), done(45, 8)]),
                GymBlock(exerciseId: "bench_press", sets: [done(60, 10), done(62, 10), done(64, 8), done(64, 7)]),
                GymBlock(exerciseId: "dumbbell_fly", sets: [done(18, 12), done(18, 12), done(18, 10)]),
            ]),
            // 등 (5/1)
            mk("h_0501", "2026-05-01", 1_746_070_000_000, 58, ["back"], [
                GymBlock(exerciseId: "deadlift", sets: [done(90, 8), done(90, 8), done(95, 6), done(95, 5)]),
                GymBlock(exerciseId: "barbell_row", sets: [done(55, 10), done(55, 10), done(57, 8)]),
                GymBlock(exerciseId: "lat_pulldown", sets: [done(50, 10), done(50, 10), done(55, 8)]),
            ]),
            // 하체 (4/29)
            mk("h_0429", "2026-04-29", 1_745_900_000_000, 61, ["legs"], [
                GymBlock(exerciseId: "squat", sets: [done(70, 10), done(75, 8), done(80, 6), done(80, 6)]),
                GymBlock(exerciseId: "leg_press", sets: [done(100, 10), done(110, 10), done(120, 8)]),
                GymBlock(exerciseId: "leg_curl", sets: [done(30, 12), done(30, 12), done(35, 10)]),
            ]),
        ]
    }

    // 체중 로그 (관리·홈·칼로리 body 기준).
    static func seedWeights() -> [GymWeight] {
        [GymWeight(date: "2026-05-06", kg: 72.4, height: 173),
         GymWeight(date: "2026-05-04", kg: 72.6, height: 173),
         GymWeight(date: "2026-05-02", kg: 72.5, height: 173),
         GymWeight(date: "2026-04-29", kg: 72.8, height: 173)]
    }

    // 빈 상태일 때만 시드 (이력·체중 저장 + 이력에서 PR 유도).
    static func seedIfEmpty() {
        guard LocalStore.loadSessions().isEmpty, LocalStore.loadWeights().isEmpty else { return }
        let hist = seedHistory()
        LocalStore.saveSessions(hist)
        LocalStore.saveWeights(seedWeights())
        var best: [String: GymPR] = [:]
        for s in hist {
            for (exId, bs) in GymPRLogic.findBestSetsInSession(s) {
                if best[exId] == nil || bs.e1rm > best[exId]!.e1rm {
                    best[exId] = GymPRLogic.buildPR(exerciseId: exId, weight: bs.weight, reps: bs.reps,
                                                    date: s.date, sessionId: s.id)
                }
            }
        }
        LocalStore.savePRs(Array(best.values))
    }
}

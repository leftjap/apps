import SwiftUI
import GymCore
#if canImport(UIKit)
import UIKit
#endif

// 앱 상태 — 라우팅 + 세션 상태머신 (PWA app.js·session.js 이식). 화면이 이 모델을 구동한다.
public enum GymRoute: Equatable { case login, home, session, stats, summary, admin }

@MainActor
public final class GymAppModel: ObservableObject {
    // 로그인 게이트 — 형제 앱(readingtime·PWA) 정합. 미로그인은 .login 에서 막힌다.
    // restoreCloud(부트) 가 기존 세션 복원 성공 시 .home 으로 전환한다.
    @Published public var route: GymRoute = .login

    /// 인증 상태 → 진입 라우트 (로그인됨=홈, 아니면 게이트).
    public static func routeAfterAuth(signedIn: Bool) -> GymRoute { signedIn ? .home : .login }
    @Published public var session: GymSession { didSet { LocalStore.saveSession(session) } }
    @Published public var history: [GymSession]      // 완료 세션 이력 (홈·통계·직전기록·프리셋)
    @Published public var prs: [GymPR]               // 개인 기록 (PR 감지)
    @Published public var prMoment: Int = 0          // PR 팝 트리거 (증가 시 뷰가 팝)
    @Published public var custom: [GymCustomExercise]    // 커스텀 운동 (이름·부위 resolve)
    @Published public var weights: [GymWeight]           // 체중 로그
    @Published public var settings: GymUserSettings      // 사용자 설정 (관리 편집 → 반응형)
    // 동기화 상태 — 실패를 화면에 드러내고, 기기 진단(컨테이너 덤프)으로도 읽을 수 있게 영속한다.
    @Published public var syncState: GymSyncState { didSet { LocalStore.saveSyncState(syncState) } }
    public var referenceToday: Date = Date()             // 홈/통계 "오늘" 기준 (스냅샷은 고정 주입)
    public var statsInitialTab: StatsScreenView.Tab = .cal   // 검증 훅용 초기 탭
    public var adminInitialTab: AdminScreenView.Tab = .ex    // 검증 훅용 초기 탭
    public let cloud = CloudStore()   // 클라우드 sync (local-first — 로그인은 선택)

    public init(snapshotSession: GymSession? = nil) {
        // 첫 실행 시 데모 이력·PR·체중 시드 (빈 상태일 때만) → 홈·통계·직전기록이 실데이터 구동.
        GymAppModel.seedIfEmpty()
        // 로컬 영속 우선 로드 (init 할당은 didSet 미발화 → 저장 안 함).
        if let snapshotSession {
            session = snapshotSession   // 스냅샷 검증용 — 영속 오염 없음
        } else if let loaded = LocalStore.loadSession() {
            session = loaded
        } else if GymSnapshot.isActive {
            // 데모 활성 세션 = gymshot 스냅샷 전용 스캐폴딩. 진행 중처럼 보이도록 시작 시각 18분 전.
            var demo = GymAppModel.demoSession()
            demo.startTime = Int64(Date().timeIntervalSince1970 * 1000) - 18 * 60 * 1000
            session = demo
        } else {
            // 실앱 첫 실행 — 빈 활성 세션 → 홈 idle (PWA 정합: 데모 활성 세션 없음.
            // 구 동작은 date 2026-05-06 데모가 스윕 제외라 영구 생존 → 경과 수십만 분 표기 결함)
            session = GymSession(id: UUID().uuidString, date: Self.dayFmt.string(from: Date()), status: .active)
        }
        history = LocalStore.loadSessions()
        prs = LocalStore.loadPRs()
        custom = LocalStore.loadCustomExercises()
        weights = LocalStore.loadWeights()
        settings = LocalStore.loadSettings()
        syncState = LocalStore.loadSyncState()
        // 지난 날짜 방치 세션 자동 마감 (§8). 데모/스냅샷 세션은 스캐폴딩 보존 위해 제외.
        if snapshotSession == nil, session.id != "demo" {
            sweepStaleSessionIfNeeded()
        }
        // 레거시 시드 퍼지 — 시드 격리(2026-07-10) 이전 컨테이너에 남은 스캐폴딩이 로그인 sync 로
        // 서버 실데이터를 오염시킨 사고 복구. 스냅샷 컨텍스트는 시드가 픽스처라 제외.
        if !GymSnapshot.isActive { purgeLegacySeedData() }
    }

    // MARK: - 레거시 시드 퍼지 (실앱 전용 — 서버 재오염 차단)

    static let legacySeedSessionIds: Set<String> = ["demo", "h_0505", "h_0503", "h_0501", "h_0429"]
    static let legacySeedWeightDates: Set<String> = ["2026-05-06", "2026-05-04", "2026-05-02", "2026-04-29"]
    func purgeLegacySeedData() {
        let h2 = history.filter { !Self.legacySeedSessionIds.contains($0.id) }
        if h2.count != history.count { LocalStore.saveSessions(h2); history = h2 }
        let p2 = prs.filter { pr in pr.sessionId.map { !Self.legacySeedSessionIds.contains($0) } ?? true }
        if p2.count != prs.count { LocalStore.savePRs(p2); prs = p2 }
        // 체중은 날짜+시드 값 범위(72.3~72.9) 동시 일치만 — 실기록 오삭 방지
        let w2 = weights.filter { !(Self.legacySeedWeightDates.contains($0.date) && (72.3...72.9).contains($0.kg)) }
        if w2.count != weights.count { LocalStore.saveWeights(w2); weights = w2 }
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

    public static let kst: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        c.firstWeekday = 2   // 월요일 시작
        return c
    }()
    public static let dayFmt: DateFormatter = {
        let f = DateFormatter()
        f.calendar = kst; f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    // 완료 이력 + (활성 세션에 done 세트 있으면) 진행 중 세션.
    // status 가드 필수 — 종료 직후(요약 화면) 완료 세션이 이력과 이중 계상되던 버그 (플로우 하네스 검출).
    public func allWorkedSessions() -> [GymSession] {
        var xs = history.filter { $0.status == .completed }
        if session.status == .active, session.blocks.contains(where: { $0.sets.contains { $0.done } }) {
            xs.append(session)
        }
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
    // 세션의 완료 세트 볼륨 (active/completed 공통).
    public func doneVolume(_ s: GymSession) -> Double {
        s.blocks.reduce(0.0) { $0 + $1.sets.filter(\.done).reduce(0.0) { $0 + $1.volume } }
    }
    // 날짜 상세 entry (§9-1·§5-2 바텀시트) — 같은 날 다중 세션 병합. 기록 없으면 nil.
    public func dayEntry(_ iso: String) -> GymDayEntry? {
        let xs = sessionsOn(iso)
        guard !xs.isEmpty else { return nil }
        return GymDayDetailLogic.merged(xs.map { GymDayDetailLogic.entry(for: $0, custom: custom) })
    }
    // 해당 날짜 완료 세션 삭제 (§9-1 꾹누르기 → 삭제 확인).
    public func deleteSessions(on iso: String) {
        LocalStore.saveSessions(LocalStore.loadSessions().filter { $0.date != iso })
        history = LocalStore.loadSessions()
    }
    // 특정 연-월의 운동한 일자 집합 (통계 월 캘린더).
    public func workedDays(year: Int, month: Int) -> Set<Int> {
        let prefix = String(format: "%04d-%02d-", year, month)
        return Set(allWorkedSessions().filter { $0.date.hasPrefix(prefix) }.compactMap { Int($0.date.suffix(2)) })
    }
    // 최근 N주 주간 총볼륨 (오래된→최신, 8주 추이).
    public func weeklyVolumes(weeks: Int, from ref: Date) -> [Double] {
        let cal = Self.kst
        guard let thisMon = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: ref)) else { return [] }
        return stride(from: weeks - 1, through: 0, by: -1).map { i in
            guard let mon = cal.date(byAdding: .day, value: -7 * i, to: thisMon),
                  let sun = cal.date(byAdding: .day, value: 6, to: mon) else { return 0 }
            let lo = Self.dayFmt.string(from: mon), hi = Self.dayFmt.string(from: sun)
            return allWorkedSessions().filter { $0.date >= lo && $0.date <= hi }.reduce(0.0) { $0 + doneVolume($1) }
        }
    }
    // 최근 days 일 종목별 완료 세트 수 (내림차순 top).
    public func exerciseFrequency(days: Int, from ref: Date, top: Int) -> [(exId: String, sets: Int)] {
        guard let lo = Self.kst.date(byAdding: .day, value: -days, to: ref) else { return [] }
        let loStr = Self.dayFmt.string(from: lo)
        var counts: [String: Int] = [:]
        for s in allWorkedSessions() where s.date >= loStr {
            for b in s.blocks {
                let done = b.sets.filter(\.done).count
                if done > 0 { counts[b.exerciseId, default: 0] += done }   // 0-set 종목 제외
            }
        }
        return counts.sorted { $0.value > $1.value }.prefix(top).map { (exId: $0.key, sets: $0.value) }
    }
    // 최근 days 일 부위별 완료 세트 수 (내림차순).
    public func partDistribution(days: Int, from ref: Date) -> [(part: String, sets: Int)] {
        guard let lo = Self.kst.date(byAdding: .day, value: -days, to: ref) else { return [] }
        let loStr = Self.dayFmt.string(from: lo)
        var counts: [String: Int] = [:]
        for s in allWorkedSessions() where s.date >= loStr {
            for b in s.blocks {
                let part = GymExercises.resolvePart(b.exerciseId, custom: custom)
                let done = b.sets.filter(\.done).count
                guard !part.isEmpty, part != "cardio", done > 0 else { continue }
                counts[part, default: 0] += done
            }
        }
        return counts.sorted { $0.value > $1.value }.map { (part: $0.key, sets: $0.value) }
    }
    // 최근 days 일 총 운동 횟수 (부위 도넛 중앙).
    public func sessionCount(days: Int, from ref: Date) -> Int {
        guard let lo = Self.kst.date(byAdding: .day, value: -days, to: ref) else { return 0 }
        let loStr = Self.dayFmt.string(from: lo)
        return allWorkedSessions().filter { $0.date >= loStr }.count
    }

    // 이번 주 운동 횟수 (주간 목표 대비).
    public func sessionsThisWeek(from ref: Date) -> Int {
        let cal = Self.kst
        guard let monday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: ref)),
              let sunday = cal.date(byAdding: .day, value: 6, to: monday) else { return 0 }
        let lo = Self.dayFmt.string(from: monday), hi = Self.dayFmt.string(from: sunday)
        return Set(allWorkedSessions().filter { $0.date >= lo && $0.date <= hi }.map(\.date)).count
    }

    // MARK: - 관리 (운동 목록·숨김·체중·설정)

    // 부위별 관리 목록 (빌트인 삭제 제외 + 커스텀 + 부위 변경 재할당 + 관리 순서 반영). 숨김도 포함.
    // exercisePartOverride 는 queries.js getExercisesByPart 정합 — 원 부위에서 빼고 대상 부위에 넣음.
    public func exercisesForPart(_ part: String) -> [GymExerciseDef] {
        let override = settings.exercisePartOverride
        let deleted = settings.deletedExercises
        func effectivePart(_ def: GymExerciseDef) -> String { override[def.id] ?? def.part }
        let builtinAll = GymExercises.partOrder.flatMap { GymExercises.listByPart($0) }
        let customDefs = custom.map {
            GymExerciseDef(id: $0.id, name: $0.name, part: $0.part, equipment: $0.equipment,
                           defaultSets: $0.defaultSets, defaultReps: $0.defaultReps,
                           defaultWeight: $0.defaultWeight, met: $0.met)
        }
        let all = (builtinAll + customDefs).filter { !deleted.contains($0.id) && effectivePart($0) == part }
        guard let order = settings.exerciseOrder[part], !order.isEmpty else { return all }
        return all.enumerated()
            .sorted { a, b in
                let ia = order.firstIndex(of: a.element.id) ?? (order.count + a.offset)
                let ib = order.firstIndex(of: b.element.id) ?? (order.count + b.offset)
                return ia < ib
            }
            .map(\.element)
    }
    // 커스텀 운동 추가 (§10-1) — 활성 부위, 장비는 cardio 탭이면 cardio (exercises-admin.js 정합).
    public func createCustomExercise(name: String, part: String) {
        let id = "cust_" + String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(8)).lowercased()
        LocalStore.upsertCustomExercise(GymCustomExercise(
            id: id, name: name, part: part, equipment: part == "cardio" ? "cardio" : "barbell",
            defaultSets: 3, defaultReps: 10, defaultWeight: 0, met: 4.0))
        custom = LocalStore.loadCustomExercises()
    }
    // 운동 영구 삭제 (§10-1 꾹누르기) — 커스텀은 행 삭제, 빌트인은 deletedExercises 기록.
    public func deleteExercise(_ exId: String) {
        if custom.contains(where: { $0.id == exId }) {
            LocalStore.saveCustomExercises(custom.filter { $0.id != exId })
            custom = LocalStore.loadCustomExercises()
        } else {
            updateSettings { if !$0.deletedExercises.contains(exId) { $0.deletedExercises.append(exId) } }
        }
    }
    // 부위 내 순서 영속 (§10-1 드래그 정렬).
    public func setExerciseOrder(part: String, ids: [String]) {
        updateSettings { $0.exerciseOrder[part] = ids }
    }
    // 오늘 체중 저장 — 최저 신기록 여부 반환 (§10-2 PR 팝).
    @discardableResult
    public func saveWeight(_ kg: Double) -> Bool {
        let today = Self.dayFmt.string(from: Date())
        let isPR = GymWeightLogic.isWeightPR(kg, prev: weights.filter { $0.date != today }.map(\.kg))
        LocalStore.upsertWeight(GymWeight(date: today, kg: kg, height: settings.height))
        weights = LocalStore.loadWeights()
        return isPR
    }
    public func isHidden(_ exId: String) -> Bool { settings.hiddenExercises.contains(exId) }
    public func toggleHidden(_ exId: String) {
        updateSettings { s in
            if let i = s.hiddenExercises.firstIndex(of: exId) { s.hiddenExercises.remove(at: i) }
            else { s.hiddenExercises.append(exId) }
        }
    }
    // 체중 기록 + 직전 대비 증감 (관리 체중 탭).
    public func weightEntries() -> [(w: GymWeight, delta: Double?)] {
        weights.enumerated().map { i, w in
            (w: w, delta: i + 1 < weights.count ? w.kg - weights[i + 1].kg : nil)
        }
    }
    public func updateSettings(_ mutate: (inout GymUserSettings) -> Void) {
        mutate(&settings)
        settings.updatedAt = Double(nowMillis())   // LWW 클럭 (sync.js 정합 — push/pull 동행)
        LocalStore.saveSettings(settings)
    }

    // MARK: - 클라우드 (선택적 sync — spec §4 양방향 병합·안전장치)

    public var pendingAuthTokens: (access: String, refresh: String)? = nil   // 검증 훅 (--auth-tokens)

    public func restoreCloud() async {
        if let t = pendingAuthTokens {
            pendingAuthTokens = nil
            await cloud.setSession(accessToken: t.access, refreshToken: t.refresh)
        } else {
            await cloud.restore()
        }
        syncState.signedIn = cloud.signedIn
        syncState.userEmail = cloud.userEmail
        if cloud.signedIn {
            if route == .login { route = .home }   // 기존 세션 복원 → 게이트 통과
            await syncNow()
        }
        // 미로그인은 '조용한 정상' 이 아니라 '백업 중단' 이다 — .login 게이트에서 막고 상태도 남긴다.
    }
    public func login() async {
        try? await cloud.signInWithGoogle()
        if cloud.signedIn { route = .home }        // 로그인 성공 → 게이트 통과
        await syncNow()
    }
    public func logout() async { await cloud.signOut() }

    // 전체 동기화: pull → 충돌 병합(서버 규칙) → 로컬 저장 → push (50% 급감 차단).
    // 부분 실패 시 로컬 보존 (sync.js pullAll/pushAll 정합). 실 왕복은 실기기 검증 필요.
    public func syncNow() async {
        syncState.signedIn = cloud.signedIn
        syncState.userEmail = cloud.userEmail
        guard cloud.signedIn else { return }   // 미로그인은 restoreCloud 가 이미 위험으로 표시
        syncState.lastAttemptAt = nowMillis()
        do {
            // 1. pull
            let serverSessions = try await cloud.fetchSessions()
            let serverPRs = try await cloud.fetchPRs()
            let serverWeights = try await cloud.fetchWeights()
            let serverCustom = try await cloud.fetchCustomExercises()
            let serverSettings = try await cloud.fetchSettings()
            // 2. 병합 — completed 만 이력으로 (진행 세션은 로컬 정본 유지)
            let serverCompleted = serverSessions.filter { $0.status == .completed }
            history = GymSyncLogic.mergeSessions(local: history, server: serverCompleted)
            LocalStore.saveSessions(history)
            prs = GymSyncLogic.mergePRs(local: prs, server: serverPRs)
            LocalStore.savePRs(prs)
            weights = GymSyncLogic.mergeWeights(local: weights, server: serverWeights)
            LocalStore.saveWeights(weights)
            custom = GymSyncLogic.mergeCustom(local: custom, server: serverCustom)
            LocalStore.saveCustomExercises(custom)
            if let ss = serverSettings {
                settings = GymSyncLogic.resolveSettings(local: settings, server: ss)
                LocalStore.saveSettings(settings)
            }
            // 3. push — 전체 push 한정 50% 급감 차단 (병합 후라 통상 통과, 방어적 유지)
            if !GymSyncLogic.isShrinkBlocked(localCount: history.count, serverCount: serverCompleted.count) {
                var toPush = history
                if !session.blocks.isEmpty { toPush.append(session) }   // 진행 세션 백업
                try await cloud.upsertSessions(toPush)
            }
            try await cloud.upsertPRs(prs)
            try await cloud.upsertWeights(weights)
            try await cloud.upsertCustomExercises(custom)
            try await cloud.upsertSettings(settings)
            syncState.lastSuccessAt = nowMillis()
            syncState.lastError = nil
        } catch {
            // 일시 실패 — 로컬 보존, 다음 sync 시 재시도 (재시도 5/15/45s 는 CloudStore withRetry).
            // 에러를 삼키지 않고 기록 → 프로필 카드·홈 배너가 드러낸다 (2026-07-14 사고 재발 차단).
            syncState.lastError = String(describing: error)
        }
    }

    // 세션 종료 (§7-1) — done 세트만 보존·빈 블록 제거(finalize) + 칼로리(MET) + 이력 저장 + 요약.
    public func endSession() {
        session.totalCalories = estimatedCalories()   // finalize 전 — 블록 수 기반 균등 배분
        session.tags = sessionParts()
        session = GymSessionLogic.finalize(session, endTime: nowMillis())
        LocalStore.upsertSessionHistory(session)
        history = LocalStore.loadSessions()
        selectedBlockIdx = nil
        route = .summary
        Task { await syncNow() }
    }

    // 지난 날짜 방치 active 세션 자동 마감 (§8 — sweepStaleSessions 정합, 앱 부트 시 호출).
    // done 세트 있으면 마지막 활동 시각으로 finalize 해 이력 보존, 없으면 폐기 → 오늘 날짜 빈 세션으로 교체.
    // 빈(blocks 없는) 세션도 교체 대상이다 — 어제 앱만 열어 생긴 빈 활성 세션을 startSession 이
    // 그대로 재사용해(active 면 새로 안 만듦) 오늘 운동이 어제 날짜로 기록되던 결함.
    func sweepStaleSessionIfNeeded(now: Date = Date()) {
        let today = Self.dayFmt.string(from: now)
        guard session.status == .active, session.date < today else { return }
        let hasDone = session.blocks.contains { $0.sets.contains(where: \.done) }
        if hasDone {
            let last = GymSessionLogic.lastActivityMillis(session)
            let endTime = last > 0 ? last : Int64(now.timeIntervalSince1970 * 1000)
            var stale = session
            stale.totalCalories = estimatedCalories()
            stale = GymSessionLogic.finalize(stale, endTime: endTime)
            LocalStore.upsertSessionHistory(stale)
            history = LocalStore.loadSessions()
        }
        LocalStore.clearSession()
        session = GymSession(id: UUID().uuidString, date: today, status: .active)
        selectedBlockIdx = nil
    }

    // 검증용(--reset) — 완전 히메틱 초기화: 로그아웃 + 로컬 전체 클리어 + 데모 세션.
    // 이력/로그인 잔존 시 상속·prevBlock 이 컨테이너 상태에 따라 달라져 UI 테스트가 비결정적이 됨
    // (2026-07-10 실측: 무이력=커밋값 상속 70, 이력존재=프리셋 보존 72 — 둘 다 정본 동작).
    // startTime 조정 필수 — demoSession() 고정 epoch(1_746_500_000_000)는 2025-05-06 이라
    // 그대로 쓰면 경과 타이머가 "10324:01:47"(430일) 로 표기됨 (시뮬 프레임 캡처 실측).
    public func resetSession() {
        // 파괴적 초기화(로그아웃 + 로컬 전면 삭제)는 시뮬레이터에서만 허용한다.
        // 실기기에서 --reset 이 들어오면(자동 배포·오조작) 로그인 세션과 실데이터가 날아가
        // 백업 없는 앱에서 영구 소실로 이어진다 (2026-07-14 데이터 소실 사고 재발 차단).
        #if !targetEnvironment(simulator)
        assertionFailure("resetSession()은 실기기에서 금지 — 데이터/로그인 소실 위험")
        return
        #else
        LocalStore.clearSession()
        LocalStore.saveSessions([]); history = []
        LocalStore.savePRs([]); prs = []
        LocalStore.saveWeights([]); weights = []
        LocalStore.saveCustomExercises([]); custom = []
        LocalStore.saveSettings(GymUserSettings()); settings = GymUserSettings()
        Task { await cloud.signOut() }   // sync 간섭 차단 (키체인 세션은 앱 삭제에도 생존)
        var demo = GymAppModel.demoSession()
        demo.startTime = Int64(Date().timeIntervalSince1970 * 1000) - 18 * 60 * 1000
        session = demo
        selectedBlockIdx = nil
        route = .home   // 검증용 리셋은 로그인 게이트를 건너뛰고 홈부터 (UI 테스트 --reset 정합)
        #endif
    }

    public static func statsTab(_ s: String) -> StatsScreenView.Tab? { StatsScreenView.Tab(rawValue: s) }
    public static func adminTab(_ s: String) -> AdminScreenView.Tab? { AdminScreenView.Tab(rawValue: s) }

    // 운동 시작 (§6-1) — 활성 세션 없으면 빈 세션 생성 (첫 종목 선택 순간이 startTime).
    public func startSession() {
        if session.status != .active {
            LocalStore.clearSession()
            session = GymSession(id: UUID().uuidString, date: Self.dayFmt.string(from: Date()), status: .active)
            selectedBlockIdx = nil
        }
        route = .session
    }
    public func goHome() { route = .home }
    public func openStats() { route = .stats }
    public func openAdmin() { route = .admin }

    // MARK: - 세션 상태머신 (session.js 이식)

    // 명시적 블록 커서 (푸터 pill 탭 = 이동, §6-8). nil 이면 첫 미완료 블록.
    @Published public var selectedBlockIdx: Int? = nil

    // 히어로 표시용 — 전부 완료여도 read-only 카드 유지 (탭한 블록 → 첫 미완료 → 마지막).
    public var currentBlockIdx: Int {
        GymSessionLogic.heroBlockIdx(session: session, selected: selectedBlockIdx) ?? 0
    }
    // 레일·액션시트용 — 전부 완료면 nil (완료된 종목이 current 흰 카드로 남지 않게).
    public var activeBlockIdx: Int? {
        GymSessionLogic.activeBlockIdx(session: session, selected: selectedBlockIdx)
    }
    public var currentBlock: GymBlock? {
        session.blocks.indices.contains(currentBlockIdx) ? session.blocks[currentBlockIdx] : nil
    }
    // 커서 — 첫 미완료 세트, 전부 done 이면 -1 (session.js cur 정합).
    public var currentSetCursor: Int {
        currentBlock.map { $0.sets.firstIndex { !$0.done } ?? -1 } ?? -1
    }
    public var currentSetIdx: Int { max(0, currentSetCursor) }
    public var currentSet: GymSet? {
        guard let b = currentBlock, currentSetCursor >= 0 else { return nil }
        return b.sets[currentSetCursor]
    }
    // 현재 카드 종류 (weight/bodyweight/cardio — §6-3·§6-4 분기).
    public var currentCardKind: GymCardKind {
        GymCardKind.from(equipment: GymExercises.def(currentExerciseId, custom: custom)?.equipment ?? "barbell")
    }
    // 현재 블록 잠금 (명시적 완료 read-only, §6-9).
    public var currentBlockLocked: Bool { currentBlock.map { GymSessionLogic.isBlockLocked($0) } ?? false }

    // 푸터 pill 탭 = 해당 블록으로 이동 (완료 아님, §6-8).
    public func selectBlock(_ bi: Int) {
        guard session.blocks.indices.contains(bi) else { return }
        selectedBlockIdx = bi
    }
    // 운동 추가 (§6-2) — 프리셋 ① 직전 세션 카피 → ③ 기본값. 첫 종목 = startTime.
    public func addExercise(_ exId: String) {
        let part = GymExercises.resolvePart(exId, custom: custom)
        let sets: [GymSet]
        if let prev = prevBlock(forExercise: exId)?.sets, !prev.isEmpty {
            sets = GymSessionLogic.presetSets(fromPrev: prev)
        } else {
            sets = GymSessionLogic.buildPresetSets(GymExercises.def(exId, custom: custom))
        }
        let r = GymSessionLogic.addExercise(to: session, exerciseId: exId, part: part,
                                            presetSets: sets, now: nowMillis())
        guard r.added else { return }
        session = r.session
        impact(.light)
    }
    // 운동 제거 (§6-2 토글 OFF·§6-9 삭제).
    public func removeExercise(_ exId: String) {
        let r = GymSessionLogic.removeExercise(from: session, exerciseId: exId) {
            GymExercises.resolvePart($0, custom: custom)
        }
        guard r.removed else { return }
        session = r.session
        if let sel = selectedBlockIdx, !session.blocks.indices.contains(sel) { selectedBlockIdx = nil }
    }
    // 세션 내 종목 포함 여부 (운동추가 시트 토글 상태).
    public func hasExercise(_ exId: String) -> Bool {
        session.blocks.contains { $0.type == "single" && $0.exerciseId == exId }
    }
    // 운동 선택 목록 (§6-2) — 숨김·삭제 제외 (순서는 exercisesForPart 가 반영).
    public func selectableExercises(part: String) -> [GymExerciseDef] {
        exercisesForPart(part).filter { !isHidden($0.id) }
    }
    // 세트 삭제 (§6-9 세트 행 꾹누르기).
    public func removeSet(blockIdx: Int, setIdx: Int) {
        guard session.blocks.indices.contains(blockIdx),
              session.blocks[blockIdx].sets.indices.contains(setIdx),
              !GymSessionLogic.isBlockLocked(session.blocks[blockIdx]) else { return }
        session.blocks[blockIdx].sets.remove(at: setIdx)
    }
    // 세션 삭제 (§6-9 종료 꾹누르기 → 삭제) — 빈 활성 세션으로 교체 + 홈.
    public func discardSession() {
        LocalStore.clearSession()
        session = GymSession(id: UUID().uuidString, date: Self.dayFmt.string(from: Date()), status: .active)
        selectedBlockIdx = nil
        route = .home
    }
    // 블록 명시적 완료 (§6-9 꾹누르기 "완료") — 빈 세트 폐기 + finishedAt + 첫 미완료로 이동.
    public func finishBlock(at bi: Int) {
        guard session.blocks.indices.contains(bi) else { return }
        session.blocks[bi] = GymSessionLogic.finishBlock(session.blocks[bi], now: Double(nowMillis()))
        selectedBlockIdx = GymSessionLogic.firstUnfinishedBlockIdx(session)
        impact(.heavy)
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

    // 세트 완료 (좌 스와이프, §6-3-1) — 커밋/자동 세트 추가/상속은 GymSessionLogic.completeSet.
    // PR 판정은 유의미 중량 세트만 (isPRCandidate — 0·맨몸 오발화 방지), spec §6-11.
    // 햅틱: 커밋 heavy · PR heavy 더블펄스(PWA vibrate [12,28,12] 정합) — 사용자 강화 요청 2026-07-10.
    public func completeCurrentSet() {
        let bi = currentBlockIdx
        guard session.blocks.indices.contains(bi),
              !GymSessionLogic.isBlockLocked(session.blocks[bi]) else { return }
        let exId = session.blocks[bi].exerciseId
        let r = GymSessionLogic.completeSet(sets: session.blocks[bi].sets, cur: currentSetCursor,
                                            prevSessionSets: prevBlock(forExercise: exId)?.sets)
        session.blocks[bi].sets = r.sets
        guard let ci = r.committed else { impact(.light); return }
        let committed = r.sets[ci]
        if GymSessionLogic.isPRCandidate(committed) {
            let w = committed.weight ?? 0, reps = committed.reps ?? 0
            let res = GymPRLogic.evaluateSetPR(weight: w, reps: reps, prs: prs, exerciseId: exId)
            if res.isPR {
                session.blocks[bi].sets[ci].pr = true
                LocalStore.upsertPR(GymPRLogic.buildPR(exerciseId: exId, weight: w, reps: reps,
                                                       date: session.date, sessionId: session.id))
                prs = LocalStore.loadPRs()
                prMoment += 1
                impactPRDouble()
                return
            }
        }
        impact(.heavy)
    }
    // 이전 세트로 되돌리기 (우 스와이프 — 마지막 완료 세트를 미완료로, spec §6-3-1).
    public func revertToPreviousSet() {
        let bi = currentBlockIdx
        guard session.blocks.indices.contains(bi),
              !GymSessionLogic.isBlockLocked(session.blocks[bi]) else { return }
        let sets = session.blocks[bi].sets
        guard let lastDone = sets.lastIndex(where: { $0.done }) else { return }
        session.blocks[bi].sets[lastDone].done = false   // pr 플래그는 유지 (handleRightSwipe 정합)
        impact(.medium)
    }

    // 현재 세트 중량 증감 — 장비별 증분 (spec §6-3). dir = ±1. 맨몸·유산소는 미동작.
    public func adjustWeight(_ dir: Int) {
        let inc = increment(for: currentExerciseId)
        guard inc > 0, !currentBlockLocked else { return }
        let bi = currentBlockIdx, si = currentSetIdx
        guard session.blocks.indices.contains(bi), session.blocks[bi].sets.indices.contains(si) else { return }
        let cur = session.blocks[bi].sets[si].weight ?? 0
        session.blocks[bi].sets[si].weight = max(0, cur + Double(dir) * inc)
        session.blocks[bi].sets[si].preset = false   // 사용자 입력 → placeholder 해제 (§6-3-3)
        impact(.light)
    }
    // 현재 세트 횟수 증감 (±1).
    public func adjustReps(_ dir: Int) {
        guard !currentBlockLocked else { return }
        let bi = currentBlockIdx, si = currentSetIdx
        guard session.blocks.indices.contains(bi), session.blocks[bi].sets.indices.contains(si) else { return }
        let cur = session.blocks[bi].sets[si].reps ?? 0
        session.blocks[bi].sets[si].reps = max(0, cur + dir)
        session.blocks[bi].sets[si].preset = false
        impact(.light)
    }

    // 키패드 값 적용 (§6-3-2) — duration 은 분 입력 → 초 저장 (§6-4).
    public enum KeypadField: String { case weight, reps, duration, distance }
    public func applyKeypad(_ field: KeypadField, value: Double, setIdx: Int? = nil) {
        let bi = currentBlockIdx
        guard session.blocks.indices.contains(bi),
              !GymSessionLogic.isBlockLocked(session.blocks[bi]) else { return }
        let si = setIdx ?? currentSetIdx
        guard session.blocks[bi].sets.indices.contains(si) else { return }
        switch field {
        case .weight:   session.blocks[bi].sets[si].weight = max(0, (value * 10).rounded() / 10)
        case .reps:     session.blocks[bi].sets[si].reps = max(0, Int(value))
        case .duration: session.blocks[bi].sets[si].duration = max(0, (value * 60).rounded())
        case .distance: session.blocks[bi].sets[si].distance = max(0, (value * 10).rounded() / 10)
        }
        session.blocks[bi].sets[si].preset = false
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
        UIImpactFeedbackGenerator(style: style).impactOccurred(intensity: 1.0)
    }
    // PR 더블 펄스 — PWA navigator.vibrate([12,28,12]) 정합 (두 번 진동, 사용자 강화 요청).
    private func impactPRDouble() {
        let g = UIImpactFeedbackGenerator(style: .heavy)
        g.impactOccurred(intensity: 1.0)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { g.impactOccurred(intensity: 1.0) }
    }
    #else
    private enum Dummy { case light, medium, heavy }
    private func impact(_ style: Dummy) {}
    private func impactPRDouble() {}
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
                GymSet(weight: 70, reps: 8, preset: true), GymSet(weight: 72, reps: 8, preset: true),
                GymSet(weight: 75, reps: 6, preset: true)]),
            GymBlock(exerciseId: "dumbbell_fly", sets: [
                GymSet(weight: 20, reps: 10, preset: true), GymSet(weight: 20, reps: 10, preset: true)]),
            GymBlock(exerciseId: "cable_crossover", sets: [
                GymSet(weight: 20, reps: 12, preset: true), GymSet(weight: 20, reps: 12, preset: true)]),
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
    // 스냅샷(gymshot) 전용 — 실앱에 주입하면 가짜 이력이 첫 로그인 sync 때 서버 실데이터에 push 되어 오염된다.
    static func seedIfEmpty() {
        guard GymSnapshot.isActive else { return }
        guard LocalStore.loadSessions().isEmpty, LocalStore.loadWeights().isEmpty else { return }
        let hist = seedHistory()
        LocalStore.saveSessions(hist)
        LocalStore.saveWeights(seedWeights())
        LocalStore.saveSettings(GymUserSettings(weeklyGoal: 4, height: 173, birthYear: 1976, goalWeight: 69))
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

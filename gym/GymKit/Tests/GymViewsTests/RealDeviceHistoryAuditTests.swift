import Foundation
import Testing
import GymCore
@testable import GymViews

// 실기기 이력 전수 조사 — 폰에서 꺼낸 `gym.sessions.v1` 전체를 카드에 통과시킨다.
//
// 데이터는 개인 기록이라 저장소에 넣지 않는다. 환경변수로 경로를 주면 돌고, 없으면 건너뛴다:
//   xcrun devicectl device copy from --device <UDID> --domain-type appDataContainer \
//     --domain-identifier com.leftjap.gym --source Library --destination <dir>
//   (plist 의 gym.sessions.v1 / gym.customExercises.v1 을 각각 .json 으로 뽑는다)
//   GYM_REAL_SESSIONS=<sessions.json> GYM_REAL_CUSTOM=<custom.json> swift test --filter RealDeviceHistoryAudit
//
// 보는 것: 모든 종목 × 모든 날짜에 대해, 카드가 칠한 칸이 **그날 그 종목 done 세트가 있었던 날**과
// 정확히 같은가. 판정은 카드와 무관하게 원본 JSON 에서 따로 계산한다.
//
// 2026-09-17 회수분의 무결성 (같은 데이터로 다시 돌릴 때 대조용):
//   완료 84세션 · 2026-05-16~09-16(124일) · id 중복 0 · 같은 날 두 세션 7건
//   done 세트가 하나도 없는 세션 2건(2026-07-23, 2026-05-16) — 이 날들은 어느 카드도 채우지 않아야 한다
//   기록 있는 종목 30 = 근력 29 + 유산소 1(treadmill) · 커스텀 12 · 정의 못 찾은 id 0
//   syncState lastSuccessAt 2026-09-17 20:11:44 KST — 서버와 맞춰진 직후 상태
@MainActor @Suite struct RealDeviceHistoryAuditTests {

    struct Env {
        let sessions: [GymSession]
        let custom: [GymCustomExercise]
    }
    static func load() -> Env? {
        let e = ProcessInfo.processInfo.environment
        guard let sp = e["GYM_REAL_SESSIONS"],
              let sd = FileManager.default.contents(atPath: sp),
              let sessions = try? JSONDecoder().decode([GymSession].self, from: sd)
        else { return nil }
        var custom: [GymCustomExercise] = []
        if let cp = e["GYM_REAL_CUSTOM"], let cd = FileManager.default.contents(atPath: cp) {
            custom = (try? JSONDecoder().decode([GymCustomExercise].self, from: cd)) ?? []
        }
        return Env(sessions: sessions, custom: custom)
    }

    /// 카드와 무관한 정답표 — 그날 그 종목 done 세트가 하나라도 있었나.
    static func truth(_ sessions: [GymSession]) -> [String: Set<String>] {   // exerciseId → 날짜들
        var out: [String: Set<String>] = [:]
        for s in sessions where s.status == .completed {
            for b in s.blocks where b.sets.contains(where: \.done) {
                out[b.exerciseId, default: []].insert(s.date)
            }
        }
        return out
    }

    @Test func everyExerciseOnEveryDayMatchesTheRecords() throws {
        guard let env = Self.load() else {
            print("GYM_REAL_SESSIONS 미지정 — 건너뜀"); return
        }
        let truth = Self.truth(env.sessions)
        let cal = GymAppModel.kst
        let dates = env.sessions.map(\.date).sorted()
        guard let first = GymAppModel.dayFmt.date(from: dates.first!),
              let last = GymAppModel.dayFmt.date(from: dates.last!) else { return }

        let m = GymAppModel(snapshotSession: GymSession(id: "audit", date: dates.last!))
        m.custom = env.custom
        m.history = env.sessions

        var checked = 0, filledSeen = 0
        var auditedEx = Set<String>(), skippedCardio = Set<String>()
        // 기준일을 하루씩 옮기며 모든 근력 종목의 카드를 본다.
        // 유산소는 카드가 뜨지 않으므로 여기서 빼고, 별도 테스트가 자기 주간 모듈을 본다.
        var ref = first
        while ref <= last {
            m.referenceToday = ref
            let thisCells = m.weekCells(around: ref)
            let prevCells = m.weekCells(around: ref, weekOffset: -1)
            for ex in truth.keys.sorted() {
                let kind = GymCardKind.from(
                    equipment: GymExercises.def(ex, custom: env.custom)?.equipment ?? "barbell")
                if kind == .cardio { skippedCardio.insert(ex); continue }   // 카드가 안 뜬다
                auditedEx.insert(ex)
                let week = GymSessionLogic.liftMetricWeek(
                    history: env.sessions, todaySets: [], exerciseId: ex, kind: kind, now: ref)
                let days = SessionLiftHistoryCard.days(week: week, thisCells: thisCells,
                                                       prevCells: prevCells, refToday: ref)
                #expect(days.count == 14)
                for d in days {
                    // 원 안 숫자가 그 칸의 날짜와 같아야 한다.
                    #expect(d.num == Int(d.iso.split(separator: "-")[2])!,
                            "\(ex) \(d.iso): 숫자 \(d.num)")
                    // 미래 칸은 비워 둔다. 그 외는 정답표와 일치해야 한다.
                    let want = d.isFuture ? false : (truth[ex]?.contains(d.iso) ?? false)
                    let refStr = GymAppModel.dayFmt.string(from: ref)
                    #expect(d.mark.ran == want,
                            "\(ex) 기준일 \(refStr) 칸 \(d.iso): 카드 \(d.mark.ran) / 기록 \(want)")
                    checked += 1
                    if d.mark.ran { filledSeen += 1 }
                }
            }
            ref = cal.date(byAdding: .day, value: 1, to: ref)!
        }
        print("실기기 근력 전수 조사: 세션 \(env.sessions.count) · 기록 있는 종목 \(truth.count) 중 "
              + "근력 \(auditedEx.count) 검사 / 유산소 \(skippedCardio.count) 제외(\(skippedCardio.sorted().joined(separator: ","))) "
              + "· 칸 \(checked), 채운 칸 \(filledSeen)")
        #expect(checked > 0 && filledSeen > 0)
    }

    /// 월요일 기준 인덱스 (0=월) — GymHomeLogic.mondayIndex 와 같은 식.
    static func mondayIdx(_ d: Date) -> Int { (GymAppModel.kst.component(.weekday, from: d) + 5) % 7 }

    // 유산소도 같은 2주 카드를 쓴다 (사용자 2026-09-17). 색만 teal 이고 판정 규칙은 같다 —
    // 집계 원천만 `cardioMetricWeek` 이다. 근력과 같은 방식으로 모든 날짜를 대조한다.
    @Test func cardioExercisesUseTheSameCardAndMatchRecords() throws {
        guard let env = Self.load() else {
            print("GYM_REAL_SESSIONS 미지정 — 건너뜀"); return
        }
        let truth = Self.truth(env.sessions)
        let cardioIds = truth.keys.filter {
            GymCardKind.from(equipment: GymExercises.def($0, custom: env.custom)?.equipment ?? "barbell") == .cardio
        }.sorted()
        #expect(!cardioIds.isEmpty, "유산소 기록이 하나도 없다 — 조사 대상이 없는 셈이라 확인 필요")

        let cal = GymAppModel.kst
        let dates = env.sessions.map(\.date).sorted()
        guard let first = GymAppModel.dayFmt.date(from: dates.first!),
              let last = GymAppModel.dayFmt.date(from: dates.last!) else { return }

        var checked = 0, filledSeen = 0
        let m = GymAppModel(snapshotSession: GymSession(id: "audit", date: dates.last!))
        m.custom = env.custom
        m.history = env.sessions

        for ex in cardioIds {
            let kind = GymCardKind.from(equipment: GymExercises.def(ex, custom: env.custom)?.equipment ?? "barbell")
            #expect(kind == .cardio, "\(ex) 가 유산소로 안 잡힌다")

            var ref = first
            while ref <= last {
                let ti = Self.mondayIdx(ref)
                let monday = cal.date(byAdding: .day, value: -ti, to: ref)!
                func iso(_ off: Int) -> String {
                    GymAppModel.dayFmt.string(from: cal.date(byAdding: .day, value: off, to: monday)!)
                }
                let w = GymSessionLogic.cardioMetricWeek(
                    history: env.sessions, todaySets: [], exerciseId: ex, metric: .distance, now: ref)
                #expect(w.days.count == 7)
                for i in 0..<7 {
                    let ran = truth[ex]?.contains(iso(i)) ?? false
                    // 오늘까지는 '그날 뛰었나' 가 채움을 정한다. 미래 칸은 채우지 않는다.
                    let want = i <= ti ? ran : false
                    let refStr = GymAppModel.dayFmt.string(from: ref)
                    #expect((w.days[i].style == .filled) == want,
                            "\(ex) 기준일 \(refStr) \(iso(i)): 패널 \(w.days[i].style) / 기록 \(ran)")
                    checked += 1
                    if w.days[i].style == .filled { filledSeen += 1 }
                }
                // ② 카드 14칸 — 근력과 같은 판정. 원 안 숫자가 그 칸 날짜와 같은지도 본다.
                m.referenceToday = ref
                let card = SessionLiftHistoryCard.days(
                    cardioWeek: w, thisCells: m.weekCells(around: ref),
                    prevCells: m.weekCells(around: ref, weekOffset: -1), refToday: ref)
                #expect(card.count == 14)
                for d in card {
                    #expect(d.num == Int(d.iso.split(separator: "-")[2])!, "\(ex) \(d.iso) 숫자")
                    let want = d.isFuture ? false : (truth[ex]?.contains(d.iso) ?? false)
                    #expect(d.mark.ran == want, "\(ex) 카드 \(d.iso): \(d.mark.ran) / 기록 \(want)")
                    checked += 1
                    if d.mark.ran { filledSeen += 1 }
                }
                ref = cal.date(byAdding: .day, value: 1, to: ref)!
            }
        }
        print("유산소 전수 조사: 종목 \(cardioIds.count)(\(cardioIds.joined(separator: ","))) · 칸 \(checked) 검사, 채운 칸 \(filledSeen)")
        #expect(checked > 0 && filledSeen > 0)
    }

    // 유산소만 한 날에 근력 카드가 차면 안 된다 — 오염 여부를 날짜 수로 직접 센다.
    @Test func cardioOnlyDaysNeverFillALiftCard() throws {
        guard let env = Self.load() else {
            print("GYM_REAL_SESSIONS 미지정 — 건너뜀"); return
        }
        let truth = Self.truth(env.sessions)
        let cardioIds = Set(truth.keys.filter {
            GymCardKind.from(equipment: GymExercises.def($0, custom: env.custom)?.equipment ?? "barbell") == .cardio
        })
        let cardioDays = Set(cardioIds.flatMap { truth[$0] ?? [] })
        let m = GymAppModel(snapshotSession: GymSession(id: "audit", date: "2026-09-17"))
        m.custom = env.custom
        m.history = env.sessions

        var pairs = 0
        for ex in truth.keys.sorted() where !cardioIds.contains(ex) {
            let kind = GymCardKind.from(equipment: GymExercises.def(ex, custom: env.custom)?.equipment ?? "barbell")
            // 그 종목을 하지 않은 유산소 날들
            let onlyCardio = cardioDays.subtracting(truth[ex] ?? [])
            for day in onlyCardio.sorted() {
                guard let ref = GymAppModel.dayFmt.date(from: day) else { continue }
                m.referenceToday = ref
                let week = GymSessionLogic.liftMetricWeek(
                    history: env.sessions, todaySets: [], exerciseId: ex, kind: kind, now: ref)
                let days = SessionLiftHistoryCard.days(
                    week: week, thisCells: m.weekCells(around: ref),
                    prevCells: m.weekCells(around: ref, weekOffset: -1), refToday: ref)
                let cellOnThatDay = days.first { $0.iso == day }
                #expect(cellOnThatDay?.mark.ran == false,
                        "\(ex): 유산소만 한 \(day) 에 근력 카드가 찼다")
                pairs += 1
            }
        }
        print("유산소만 한 날 × 근력 종목 조합 \(pairs)건 검사 — 오염 없음")
        #expect(pairs > 0)
    }
}

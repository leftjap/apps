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
        // 기준일을 하루씩 옮기며 모든 종목의 카드를 본다.
        var ref = first
        while ref <= last {
            m.referenceToday = ref
            let thisCells = m.weekCells(around: ref)
            let prevCells = m.weekCells(around: ref, weekOffset: -1)
            for ex in truth.keys.sorted() {
                let kind = GymCardKind.from(
                    equipment: GymExercises.def(ex, custom: env.custom)?.equipment ?? "barbell")
                if kind == .cardio { continue }        // 유산소는 카드가 안 뜬다
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
        print("실기기 전수 조사: 세션 \(env.sessions.count) · 종목 \(truth.count) · 칸 \(checked) 검사, 채운 칸 \(filledSeen)")
        #expect(checked > 0 && filledSeen > 0)
    }
}

import Testing
import Foundation
@testable import GymCore

// CloudStore row 매핑 — Supabase snake_case ↔ 모델 (네트워크 없이 인코딩·왕복 검증).
@Suite struct CloudStoreTests {
    @Test func sessionRowRoundTrip() throws {
        let s = GymSession(
            id: "s1", date: "2026-07-07", startTime: 1_700_000_000_000, endTime: 1_700_003_600_000,
            blocks: [GymBlock(exerciseId: "bench", sets: [GymSet(weight: 60, reps: 10, done: true)])],
            tags: ["chest"], totalVolume: 600, totalCalories: 12, durationMin: 52, status: .completed)
        let owner = UUID()
        let row = SessionRow(from: s, owner: owner)
        #expect(row.user_id == owner.uuidString)
        #expect(row.total_volume == 600)
        #expect(row.duration_min == 52)
        // JSON 인코딩 (Supabase 전송 형태) → 디코딩 왕복
        let data = try JSONEncoder().encode(row)
        let back = try JSONDecoder().decode(SessionRow.self, from: data)
        let model = back.toModel()
        #expect(model.id == "s1")
        #expect(model.status == .completed)
        #expect(model.blocks.first?.sets.first?.weight == 60)
        #expect(model.totalCalories == 12)
    }

    @Test func prRowRoundTrip() throws {
        let pr = GymPR(exerciseId: "bench_press", weight: 70, reps: 8, e1rm: 88.7,
                       date: "2026-07-07", sessionId: "s1")
        let owner = UUID()
        let row = PRRow(from: pr, owner: owner)
        #expect(row.id == "bench_press_e1rm")   // 합성 PK (sync.js toSupabasePR 정합)
        #expect(row.exercise_id == "bench_press")
        let back = try JSONDecoder().decode(PRRow.self, from: JSONEncoder().encode(row))
        let model = back.toModel()
        #expect(model.e1rm == 88.7)
        #expect(model.sessionId == "s1")
    }

    @Test func weightRowMatchesSchema() throws {
        // 0002 마이그레이션 실 컬럼: user_id/date/weight/height (구 owner_id/day/kg 아님)
        let row = WeightRow(from: GymWeight(date: "2026-07-07", kg: 72.4, height: 173), owner: UUID())
        let json = String(data: try JSONEncoder().encode(row), encoding: .utf8)!
        #expect(json.contains("\"date\""))
        #expect(json.contains("\"weight\""))
        #expect(json.contains("\"height\""))
        #expect(!json.contains("\"day\"") && !json.contains("\"kg\""))
        #expect(row.toModel().kg == 72.4)
    }

    @Test func customExerciseRowRoundTrip() throws {
        let c = GymCustomExercise(id: "cust_ab12cd34", name: "체스트 프레스 머신", part: "chest",
                                  equipment: "machine", defaultSets: 3, defaultReps: 12,
                                  defaultWeight: 40, met: 5)
        let row = CustomExerciseRow(from: c, owner: UUID())
        let back = try JSONDecoder().decode(CustomExerciseRow.self, from: JSONEncoder().encode(row))
        let model = back.toModel()
        #expect(model.id == "cust_ab12cd34")
        #expect(model.equipment == "machine")
        #expect(model.defaultReps == 12)
    }

    @Test func settingsRowJSONBRoundTrip() throws {
        var s = GymUserSettings(weeklyGoal: 5, height: 173, goalWeight: 68.5,
                                hiddenExercises: ["dips"])
        s.updatedAt = 1_700_000_000_000
        let row = SettingsRow(from: s, owner: UUID())
        let back = try JSONDecoder().decode(SettingsRow.self, from: JSONEncoder().encode(row))
        #expect(back.settings.weeklyGoal == 5)
        #expect(back.settings.hiddenExercises == ["dips"])
        #expect(back.settings.updatedAt == 1_700_000_000_000)   // LWW 타임스탬프 jsonb 동행
    }

    @Test func emailWhitelist() {
        // spec §3 — 허용 이메일 외 로그인 거부 (대소문자·공백 관용)
        #expect(CloudStore.isAllowedEmail("leftjap@gmail.com") == true)
        #expect(CloudStore.isAllowedEmail("soyoun312@gmail.com") == true)
        #expect(CloudStore.isAllowedEmail(" LeftJap@Gmail.com ") == true)
        #expect(CloudStore.isAllowedEmail("stranger@gmail.com") == false)
        #expect(CloudStore.isAllowedEmail(nil) == false)
    }

    @Test func kstDayFormat() {
        // KST 자정 경계 (UTC 15:00 = KST 다음날 00:00)
        let d = Date(timeIntervalSince1970: 1_700_000_000)  // 고정 시각
        let day = CloudStore.dayFmt.string(from: d)
        #expect(day.count == 10)  // yyyy-MM-dd
        #expect(CloudStore.dayFmt.timeZone.identifier == "Asia/Seoul")
    }
}

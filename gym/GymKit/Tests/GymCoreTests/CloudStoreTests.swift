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

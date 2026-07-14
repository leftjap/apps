import Foundation
import Testing
@testable import GymCore

// 동기화 건강 상태 — 실패가 조용히 묻히지 않게 하는 판정 로직.
// 배경(2026-07-14): 로그인이 끊긴 채 4일간 백업이 멈췄는데 앱은 계속 "동기화 정상" 을 표시했고,
// syncNow 의 빈 catch 가 에러를 삼켜 사용자가 알 방법이 없었다. 기기 로컬이 유일본이 되어
// 세션 1건이 영구 소실될 뻔했다.
@Suite struct SyncHealthTests {

    let now = GymWeightLogic.isoFmt.date(from: "2026-07-14")!
    func ms(_ iso: String) -> Int64 {
        Int64(GymWeightLogic.isoFmt.date(from: iso)!.timeIntervalSince1970 * 1000)
    }

    @Test func signedOutIsAtRiskAndSaysBackupStopped() {
        let s = GymSyncState(signedIn: false, lastSuccessAt: ms("2026-07-10"))
        #expect(GymSyncHealth.isAtRisk(s, now: now))
        #expect(GymSyncHealth.statusText(s, now: now) == "로그인 필요 · 백업 안 됨")
    }

    @Test func neverSyncedIsAtRisk() {
        let s = GymSyncState(signedIn: true, lastSuccessAt: nil)
        #expect(GymSyncHealth.isAtRisk(s, now: now))
        #expect(GymSyncHealth.statusText(s, now: now) == "아직 백업된 적 없음")
    }

    @Test func staleSuccessIsAtRisk() {
        // 07-10 마지막 성공 → 07-14 기준 4일 경과 (임계 2일)
        let s = GymSyncState(signedIn: true, lastSuccessAt: ms("2026-07-10"))
        #expect(GymSyncHealth.daysSinceSuccess(s, now: now) == 4)
        #expect(GymSyncHealth.isAtRisk(s, now: now))
        #expect(GymSyncHealth.statusText(s, now: now) == "백업 4일 전 · 확인 필요")
    }

    @Test func freshSuccessIsHealthy() {
        let s = GymSyncState(signedIn: true, lastSuccessAt: ms("2026-07-14"))
        #expect(GymSyncHealth.daysSinceSuccess(s, now: now) == 0)
        #expect(!GymSyncHealth.isAtRisk(s, now: now))
        #expect(GymSyncHealth.statusText(s, now: now) == "백업 완료 · 오늘")
    }

    @Test func yesterdaySuccessIsHealthy() {
        let s = GymSyncState(signedIn: true, lastSuccessAt: ms("2026-07-13"))
        #expect(!GymSyncHealth.isAtRisk(s, now: now))   // 1일은 임계(2일) 미만
        #expect(GymSyncHealth.statusText(s, now: now) == "백업 완료 · 1일 전")
    }

    // 최근 시도가 실패했으면, 과거 성공이 최신이어도 사유를 드러낸다.
    @Test func lastErrorIsSurfaced() {
        let s = GymSyncState(signedIn: true, lastSuccessAt: ms("2026-07-14"),
                             lastError: "The Internet connection appears to be offline.")
        #expect(GymSyncHealth.statusText(s, now: now) == "동기화 실패 · 마지막 백업 오늘")
        #expect(GymSyncHealth.isAtRisk(s, now: now))
    }

    @Test func roundTripsThroughCodable() throws {
        let s = GymSyncState(signedIn: true, userEmail: "a@b.com", lastAttemptAt: 1, lastSuccessAt: 2,
                             lastError: "boom")
        let back = try JSONDecoder().decode(GymSyncState.self, from: JSONEncoder().encode(s))
        #expect(back == s)
    }
}

import Foundation
import Testing
import GymCore
@testable import GymViews

// "오늘" 기준값은 읽을 때마다 현재 시각이어야 한다.
// 구결함: 모델 생성 시점의 Date() 를 저장해 두고 다시 갱신하지 않았다. iOS 는 앱을 종료하지 않고
// 백그라운드에 보관하므로, 금요일에 띄운 앱을 토요일에 다시 열면 세션 화면·홈이 금요일을 오늘로
// 그렸다 (실기기 2026-09-26: 세션은 09-26 로 저장됐는데 히스토리 카드의 오늘 원이 25).
@MainActor @Suite struct ReferenceTodayTests {

    @Test func liveModelReadsCurrentTimeNotInitTime() async throws {
        let m = GymAppModel(snapshotSession: GymSession(id: "s", date: "2026-09-25", status: .active))
        try await Task.sleep(nanoseconds: 1_200_000_000)
        // 생성 시각에 고정돼 있으면 1.2초 전 값이 나온다.
        #expect(abs(m.referenceToday.timeIntervalSinceNow) < 0.5)
    }

    // 스냅샷·테스트의 고정 주입은 그대로 유지돼야 한다.
    @Test func pinnedValueStaysPinned() async throws {
        let m = GymAppModel(snapshotSession: GymSession(id: "s", date: "2026-09-25", status: .active))
        let pinned = GymAppModel.dayFmt.date(from: "2026-09-25")!
        m.referenceToday = pinned
        try await Task.sleep(nanoseconds: 300_000_000)
        #expect(m.referenceToday == pinned)
    }
}

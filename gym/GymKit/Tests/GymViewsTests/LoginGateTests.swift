import Foundation
import Testing
import GymCore
@testable import GymViews

// 로그인 게이트 — gym 도 형제 앱(readingtime·PWA)처럼 로그인을 요구해야 한다.
// 2026-07-14 사고: gym 네이티브 포팅이 로그인 게이트를 누락(route 를 .home 으로 시작)해,
// 로그아웃 상태로도 앱이 열리고 데이터가 클라우드에 백업되지 않은 채 로컬에만 쌓였다.
@MainActor @Suite struct LoginGateTests {

    @Test func startsAtLoginGate() {
        // 기본 진입 = 로그인 게이트 (스냅샷 세션 주입도 route 는 건드리지 않음)
        #expect(GymAppModel(snapshotSession: GymSession(id: "x", date: "2026-07-14")).route == .login)
    }

    // 로그인 화면 깜빡임 방지 — 스냅샷/테스트 init 은 인증 확정 상태(authResolved=true)로 시작해
    // 로그인 폼을 즉시 그린다(스냅샷 렌더·게이트 테스트 무영향). 실앱 부트만 스플래시(false)로 시작.
    @Test func snapshotInitIsAuthResolved() {
        #expect(GymAppModel(snapshotSession: GymSession(id: "x", date: "2026-07-14")).authResolved == true)
    }

    // 운동 추가 시트 기본 부위 — 처음엔 등, 이후엔 마지막으로 종목을 고른 부위 (사용자 2026-07-19).
    @Test func addexDefaultPartIsBackThenRemembersLastPicked() {
        LocalStore.clearLastAddexPart()
        let m = GymAppModel(snapshotSession: GymSession(id: "t", date: "2026-07-19"))
        #expect(m.lastAddexPart == "back")          // 기본 = 등
        m.addExercise("squat")                       // 하체 종목 추가 → 부위 기억
        #expect(m.lastAddexPart == "legs")
        m.addExercise("bench_press")                 // 가슴 추가 → 갱신
        #expect(m.lastAddexPart == "chest")
        LocalStore.clearLastAddexPart()
    }

    @Test func loginRouteExists() {
        // GymRoute 에 .login 케이스가 있어야 GymRootView 가 게이트를 그린다
        let r: GymRoute = .login
        #expect(r == .login)
    }

    // 로그인 성공 시 홈으로, 미로그인이면 게이트 유지 (순수 라우팅 규칙).
    @Test func routeForAuthState() {
        #expect(GymAppModel.routeAfterAuth(signedIn: true) == .home)
        #expect(GymAppModel.routeAfterAuth(signedIn: false) == .login)
    }

    // 로그아웃 → 로그인 게이트로 복귀 + 상태 반영 (관리화면에 잔류하던 결함).
    @Test func logoutReturnsToGate() async {
        let m = GymAppModel(snapshotSession: GymSession(id: "x", date: "2026-07-14"))
        m.route = .admin
        m.syncState = GymSyncState(signedIn: true, userEmail: "leftjap@gmail.com")
        await m.logout()
        #expect(m.route == .login)
        #expect(m.syncState.signedIn == false)
        #expect(m.syncState.userEmail == nil)
    }
}

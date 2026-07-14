import Foundation
import Testing
@testable import GymCore

// 구글 로그인 URL — 실제 OAuth 창을 띄우지 않고, 로그인 시 만들어질 URL 을 그대로 검증.
// 2026-07-14: Safari 의 기존 구글 세션을 그대로 써서 계정 선택 없이 통과(허용 계정 2개인데
// 어느 쪽으로 로그인되는지 못 고름) → prompt=select_account 추가. 그 회귀를 막는다.
@MainActor @Suite struct OAuthURLTests {

    @Test func signInURLForcesAccountPicker() throws {
        let url = try CloudStore().googleSignInURL()
        let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let prompt = q.first { $0.name == "prompt" }?.value
        #expect(prompt == "select_account", "구글 계정 선택 화면이 뜨도록 prompt=select_account 를 보내야 한다")
    }

    @Test func signInURLRedirectsBackToGymApp() throws {
        let url = try CloudStore().googleSignInURL()
        let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let redirect = q.first { $0.name == "redirect_to" }?.value
        // gym:// 스킴으로 돌아와야 한다 (허용목록 누락 시 today 웹앱으로 폴백하던 사고)
        #expect(redirect == "gym://auth-callback")
        #expect(url.absoluteString.contains("provider=google"))
    }
}

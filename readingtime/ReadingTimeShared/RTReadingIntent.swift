#if canImport(ActivityKit) && os(iOS)
import AppIntents

/// 잠금 화면 Live Activity 의 탭 모드 일시정지·재개 버튼 (2026-11-08 검토 — 탭 모드는 엎기와 달리 잠금 화면에서
/// 멈출 방법이 없었다). LiveActivityIntent 는 위젯이 아니라 앱 프로세스에서 실행된다: 앱이 백그라운드에 있으면
/// 그대로, 꺼져 있으면 시스템이 띄운 뒤 perform 을 부른다. 동작은 앱이 RTLiveActivityBridge.toggle 에 배선한다.
/// 무료 개발 팀 서명으로도 쓸 수 있다 — App Intents 는 별도 권한 항목(entitlement)이 필요 없다.
public struct RTToggleReadingIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "읽기 일시정지·재개"
    public static var openAppWhenRun = false

    public init() {}

    public func perform() async throws -> some IntentResult {
        await MainActor.run { RTLiveActivityBridge.toggle?() }
        return .result()
    }
}

@MainActor public enum RTLiveActivityBridge {
    /// 앱이 시작할 때 채운다 — 세션 일시정지·재개 + Live Activity 갱신
    public static var toggle: (() -> Void)?
}
#endif

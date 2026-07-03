import UIKit
import CoreHaptics
import UserNotifications
import os.log

// 엎기/들기 신호 — 사용자가 화면을 못 보는 상황에서 상태 전환을 확실히 알린다.
// · 포그라운드: CoreHaptics 최대 강도 버즈 (UIFeedbackGenerator 의 "띡"보다 훨씬 강함)
// · 백그라운드/잠금: 로컬 알림 — iOS 는 서드파티 백그라운드 햅틱을 차단하므로
//   알림의 시스템 진동 + 화면 웨이크 + 상태 텍스트로 대체 (잠금 화면에서 타이머 현황 확인)
@MainActor
final class RTFlipSignals {
    private var engine: CHHapticEngine?
    private var authRequested = false

    /// 03 진입 시 1회 — 햅틱 엔진 기동 + 알림 권한(잠금 중 신호용)
    func prepare() {
        if !authRequested {
            authRequested = true
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }
        if engine == nil, CHHapticEngine.capabilitiesForHardware().supportsHaptics {
            engine = try? CHHapticEngine()
            engine?.resetHandler = { [weak self] in
                Task { @MainActor in try? self?.engine?.start() }
            }
        }
        try? engine?.start()
    }

    /// 기록 시작/재개: 강한 이중 버즈 (부르르-부르르)
    func signalStart(elapsed: Int) {
        signal(buzz: [(0.00, 0.30), (0.42, 0.30)],
               title: "기록 중 · \(Self.hms(elapsed))",
               body: "리딩타임이 기록하고 있어요")
    }

    /// 들어올려 일시정지: 길고 묵직한 단일 버즈
    func signalPause(elapsed: Int) {
        signal(buzz: [(0.00, 0.65)],
               title: "일시정지됨 · \(Self.hms(elapsed))",
               body: "다시 엎으면 이어서 기록됩니다")
    }

    private func signal(buzz: [(TimeInterval, TimeInterval)], title: String, body: String) {
        if UIApplication.shared.applicationState == .active {
            playHaptic(buzz)
        } else {
            postNotification(title: title, body: body)
        }
    }

    private func playHaptic(_ segments: [(TimeInterval, TimeInterval)]) {
        guard let engine, CHHapticEngine.capabilitiesForHardware().supportsHaptics else {
            Self.log.info("haptic 폴백(UIFeedback) — CoreHaptics 미지원 하드웨어")
            UINotificationFeedbackGenerator().notificationOccurred(.success)   // 구형 폴백
            return
        }
        do {
            try engine.start()
            let events = segments.map { start, duration in
                CHHapticEvent(eventType: .hapticContinuous,
                              parameters: [
                                  CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
                                  CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6),
                              ],
                              relativeTime: start, duration: duration)
            }
            let player = try engine.makePlayer(with: CHHapticPattern(events: events, parameters: []))
            try player.start(atTime: 0)
            Self.log.info("haptic 재생 성공 (\(segments.count, privacy: .public)버즈)")
        } catch {
            Self.log.error("haptic 재생 실패: \(String(describing: error), privacy: .public)")
        }
    }

    private func postNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(identifier: "rt.flip.signal", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                Self.log.error("잠금 알림 게시 실패: \(String(describing: error), privacy: .public)")
            } else {
                Self.log.info("잠금 알림 게시 성공: \(title, privacy: .public)")
            }
        }
    }

    private static let log = Logger(subsystem: "com.leftjap.readingtime", category: "signals")

    static func hms(_ sec: Int) -> String {
        sec >= 3600 ? String(format: "%d시간 %d분", sec / 3600, sec / 60 % 60)
                    : String(format: "%d분 %02d초", sec / 60, sec % 60)
    }
}

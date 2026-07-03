import UIKit
import CoreHaptics
import UserNotifications
import os.log

// 엎기/들기 신호 — 사용자가 화면을 못 보는 상황에서 상태 전환을 확실히 알린다.
// · 포그라운드: CoreHaptics 최대 강도 버즈 (UIFeedbackGenerator 의 "띡"보다 훨씬 강함)
// · 백그라운드/잠금: 로컬 알림 — iOS 는 서드파티 백그라운드 햅틱을 차단하므로
//   알림의 시스템 진동 + 화면 웨이크 + 상태 텍스트로 대체 (잠금 화면에서 타이머 현황 확인)
//   즉시 게시하면 폰이 아직 뒤집힌/움직이는 순간에 도착해 iOS 가 화면 웨이크·진동을
//   억제한다(2026-07-03 실기기 실측: 검은 화면 유지) → 폰이 손에 들려 안정된 뒤
//   도착하도록 지연 트리거 + Time Sensitive(웨이크 우선순위·집중모드 관통)로 게시.
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

    /// 기록 시작/재개: 강한 이중 버즈 (부르르-부르르). 잠금 시 알림은 엎기 모션이
    /// 가라앉은 뒤 도착하도록 소지연 (폰이 엎혀 있어 웨이크는 불가 — 진동이 목적)
    func signalStart(elapsed: Int) {
        signal(buzz: [(0.00, 0.30), (0.42, 0.30)],
               title: "기록 중 · \(Self.hms(elapsed))",
               body: "리딩타임이 기록하고 있어요",
               notifyDelay: 0.8)
    }

    /// 들어올려 일시정지: 길고 묵직한 단일 버즈. 잠금 시 알림은 폰이 손에 들려
    /// 세워진 뒤 도착하도록 지연 (face-down/모션 중 웨이크 억제 창 회피)
    func signalPause(elapsed: Int) {
        signal(buzz: [(0.00, 0.65)],
               title: "일시정지됨 · \(Self.hms(elapsed))",
               body: "다시 엎으면 이어서 기록됩니다",
               notifyDelay: 1.0)
    }

    /// 포그라운드 복귀 시 — 아직 발화 전인 지연 알림은 불필요 (이미 화면을 보고 있음)
    func cancelPending() {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [Self.notificationID])
    }

    private func signal(buzz: [(TimeInterval, TimeInterval)], title: String, body: String,
                        notifyDelay: TimeInterval) {
        if UIApplication.shared.applicationState == .active {
            playHaptic(buzz)
        } else {
            postNotification(title: title, body: body, delay: notifyDelay)
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

    private static let notificationID = "rt.flip.signal"

    private func postNotification(title: String, body: String, delay: TimeInterval) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        // 무료 Personal 팀은 Time Sensitive capability 미지원(2026-07-04 빌드 실측) —
        // 자격 없으면 시스템이 일반(active)로 강등하나, 지연 도착 + 사운드만으로 웨이크·진동은 성립
        content.interruptionLevel = .timeSensitive
        // 같은 identifier 재사용 → 1s 내 lift↔re-flip 연타 시 pending 이 최신 신호로 대체됨
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        let request = UNNotificationRequest(identifier: Self.notificationID, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                Self.log.error("잠금 알림 게시 실패: \(String(describing: error), privacy: .public)")
            } else {
                Self.log.info("잠금 알림 예약(+\(delay, privacy: .public)s): \(title, privacy: .public)")
            }
        }
    }

    private static let log = Logger(subsystem: "com.leftjap.readingtime", category: "signals")

    static func hms(_ sec: Int) -> String {
        sec >= 3600 ? String(format: "%d시간 %d분", sec / 3600, sec / 60 % 60)
                    : String(format: "%d분 %02d초", sec / 60, sec % 60)
    }
}

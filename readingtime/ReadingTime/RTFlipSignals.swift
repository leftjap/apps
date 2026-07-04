import UIKit
import CoreHaptics
import AudioToolbox
import os.log

// 엎기/들기 신호 — 사용자가 화면을 못 보는 상황에서 상태 전환을 확실히 알린다.
// · 포그라운드: CoreHaptics 최대 강도 버즈 (UIFeedbackGenerator 의 "띡"보다 훨씬 강함)
// · 백그라운드/잠금: AudioServices 시스템 진동 — keep-alive 로 살아있는 프로세스에서
//   즉시 발화 (실기기 실증 2026-07-04). 로컬 알림은 제거 — 화면 웨이크 효과가 없고
//   (실기기 실측 2회) 잠금 화면 현황은 Live Activity 가 전담하므로 중복이었다.
//   화면 웨이크 자체는 iOS "들어서 깨우기"(설정>디스플레이) 영역 — 앱 권한 밖.
@MainActor
final class RTFlipSignals {
    private var engine: CHHapticEngine?

    /// 03 진입 시 1회 — 햅틱 엔진 기동
    func prepare() {
        if engine == nil, CHHapticEngine.capabilitiesForHardware().supportsHaptics {
            engine = try? CHHapticEngine()
            engine?.resetHandler = { [weak self] in
                Task { @MainActor in try? self?.engine?.start() }
            }
        }
        try? engine?.start()
    }

    /// 기록 시작/재개: 강한 이중 버즈 (부르르-부르르) / 잠금 시 진동 2회
    func signalStart() {
        signal(buzz: [(0.00, 0.30), (0.42, 0.30)], vibrations: 2)
    }

    /// 들어올려 일시정지: 길고 묵직한 단일 버즈 / 잠금 시 진동 1회
    func signalPause() {
        signal(buzz: [(0.00, 0.65)], vibrations: 1)
    }

    private func signal(buzz: [(TimeInterval, TimeInterval)], vibrations: Int) {
        if UIApplication.shared.applicationState == .active {
            playHaptic(buzz)
        } else {
            vibrate(times: vibrations)
        }
    }

    /// 백그라운드/잠금 진동 — 전환 순간 즉시. 2회면 0.5s 간격 (시작=2·정지=1 구분감)
    private func vibrate(times: Int) {
        Self.log.info("잠금 진동 신호 x\(times, privacy: .public)")
        for i in 0..<times {
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(i) * 0.5) {
                AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            }
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

    private static let log = Logger(subsystem: "com.leftjap.readingtime", category: "signals")
}

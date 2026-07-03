import Foundation
import CoreMotion
import RTViews

// 엎기(face-down) 감지 → RTAppModel 브리지. 구 ReadingTimer.swift 대체.
// v8 UX: 폰을 엎으면 기록 시작/재개, 들면 '일시정지'(종료 아님 — 종료는 04 CTA "여기까지 읽기").
// 경과는 센서 콜백 수가 아니라 wall-clock(Date) 누적 — 백그라운드 경과를 syncModel 로 보정.
@MainActor
final class FlipEngine: ObservableObject {
    @Published private(set) var gravityZ: Double = 0   // 실기기 임계 캘리브레이션용

    private let model: RTAppModel
    private let motion = CMMotionManager()
    private let queue = OperationQueue()

    // 튜닝 파라미터 — 실기기에서 조정 (구 스캐폴딩 값 유지)
    private let startThreshold = 0.85   // face-down: gravity.z 가 이보다 크면 후보
    private let stopThreshold = 0.60    // 이보다 작아지면 해제 (히스테리시스)
    private let debounce: TimeInterval = 0.7

    private var candidateSince: Date?
    private var segmentStart: Date?          // 현재 recording 구간 시작 (wall-clock)
    private var accumulated: TimeInterval = 0

    init(model: RTAppModel) {
        self.model = model
    }

    func startMonitoring() {
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 0.1
        startUpdates()
    }

    func stopMonitoring() {
        motion.stopDeviceMotionUpdates()
        candidateSince = nil
        segmentStart = nil
        accumulated = 0
    }

    // iOS 11+ 백그라운드 전환 시 모션 스트림이 멈추는 버그 대응: stop→start 재시작
    // (커뮤니티 기법, Apple 미보장 — §6-④ 실기기 검증 대상)
    func handleScenePhaseChange() {
        guard motion.isDeviceMotionActive else { return }
        motion.stopDeviceMotionUpdates()
        startUpdates()
    }

    /// wall-clock 기준 경과를 모델 UI 에 반영 (백그라운드 복귀 시 호출)
    func syncModel() {
        guard let s = model.session, s.mode == .flip else { return }
        let live = (s.status == .recording ? segmentStart.map { Date().timeIntervalSince($0) } : nil) ?? 0
        model.syncElapsed(Int(accumulated + live))
    }

    private func startUpdates() {
        motion.startDeviceMotionUpdates(to: queue) { [weak self] data, _ in
            guard let z = data?.gravity.z else { return }
            Task { @MainActor in self?.process(z: z) }
        }
    }

    private func process(z: Double) {
        gravityZ = z
        switch model.route {
        case .flipWait:
            // 03: 엎기 확정(디바운스) → 기록 시작
            if debouncedFaceDown(z) {
                accumulated = 0
                segmentStart = Date()
                model.simFlip()
            }
        case .flipTimer:
            guard let s = model.session, s.mode == .flip else { return }
            if s.status == .recording, z < stopThreshold {
                // 들어올림 → 일시정지 + 구간 누적 확정
                if let start = segmentStart { accumulated += Date().timeIntervalSince(start) }
                segmentStart = nil
                candidateSince = nil
                model.togglePause()
                model.syncElapsed(Int(accumulated))
            } else if s.status == .paused, debouncedFaceDown(z) {
                // 다시 엎으면 이어서
                segmentStart = Date()
                model.togglePause()
            }
        default:
            candidateSince = nil
        }
    }

    private func debouncedFaceDown(_ z: Double) -> Bool {
        guard z > startThreshold else {
            candidateSince = nil
            return false
        }
        guard let since = candidateSince else {
            candidateSince = Date()
            return false
        }
        if Date().timeIntervalSince(since) >= debounce {
            candidateSince = nil
            return true
        }
        return false
    }
}

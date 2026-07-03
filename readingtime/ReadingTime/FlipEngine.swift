import Foundation
import CoreMotion
import RTViews

// 엎기(face-down) 감지 → RTAppModel 브리지.
// 감지·누적 로직은 순수 코어(FlipDetector·WallClockSession — RTViews, 유닛 테스트됨)로 분리,
// 여기는 CMMotionManager 어댑터 + 모델 액션 매핑만.
// v8 UX: 엎으면 기록 시작/재개, 들면 '일시정지'(종료는 04 CTA "여기까지 읽기").
//
// 시뮬레이터 검증: CoreMotion 미지원이라 `--sim-motion "1:0.95,8:0.2,12:0.95"`(t초:z, 이후 유지)
// 런치 인자로 합성 z 를 같은 경로에 주입해 flip 전체 흐름을 재현한다.
@MainActor
final class FlipEngine: ObservableObject {
    // 주의: @Published 금지 — 0.1s 마다 갱신되면 앱 body 재평가로 RTRootView 의
    // 초시계가 매번 재생성돼 타이머가 영원히 발화하지 않는다 (시뮬 합성모션 검증에서 발견)
    private(set) var gravityZ: Double = 0   // 실기기 임계 캘리브레이션용

    private let model: RTAppModel
    private let motion = CMMotionManager()
    private let queue = OperationQueue()
    private var detector = FlipDetector()
    private var session = WallClockSession()

    // 합성 모션 스크립트 (시뮬레이터/검증 전용)
    private let script: [(t: TimeInterval, z: Double)]
    private var scriptTimer: Timer?
    private var scriptStart: Date?

    init(model: RTAppModel, motionScript: String? = nil) {
        self.model = model
        self.script = motionScript.map(Self.parseScript) ?? []
    }

    func startMonitoring() {
        if !script.isEmpty {
            startScript()
            return
        }
        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        motion.deviceMotionUpdateInterval = 0.1
        startUpdates()
    }

    func stopMonitoring() {
        motion.stopDeviceMotionUpdates()
        scriptTimer?.invalidate()
        scriptTimer = nil
        scriptStart = nil
        detector.reset()
    }

    // iOS 11+ 백그라운드 전환 시 모션 스트림이 멈추는 버그 대응: stop→start 재시작
    // (커뮤니티 기법, Apple 미보장 — 실기기 잠금 검증 대상)
    func handleScenePhaseChange() {
        guard motion.isDeviceMotionActive else { return }
        motion.stopDeviceMotionUpdates()
        startUpdates()
    }

    /// wall-clock 기준 경과를 모델 UI 에 반영 (백그라운드 복귀 시 호출)
    func syncModel() {
        guard let s = model.session, s.mode == .flip else { return }
        model.syncElapsed(session.elapsed(at: Date()))
    }

    private func startUpdates() {
        motion.startDeviceMotionUpdates(to: queue) { [weak self] data, _ in
            guard let z = data?.gravity.z else { return }
            Task { @MainActor in self?.process(z: z) }
        }
    }

    private func process(z: Double) {
        gravityZ = z
        let now = Date()
        guard let transition = detector.process(z: z, at: now) else { return }
        switch transition {
        case .down:
            if model.route == .flipWait {
                session.start(at: now)
                model.simFlip()
            } else if model.route == .flipTimer, model.session?.mode == .flip,
                      model.session?.status == .paused {
                session.resume(at: now)
                model.togglePause()   // 다시 엎으면 이어서
            }
        case .up:
            if model.route == .flipTimer, model.session?.mode == .flip,
               model.session?.status == .recording {
                session.pause(at: now)
                model.togglePause()   // 들어올림 → 일시정지
                model.syncElapsed(session.elapsed(at: now))
            }
        }
    }

    // ── 합성 모션 (시뮬레이터 검증) ──
    static func parseScript(_ s: String) -> [(t: TimeInterval, z: Double)] {
        s.split(separator: ",").compactMap { pair in
            let kv = pair.split(separator: ":")
            guard kv.count == 2, let t = TimeInterval(kv[0]), let z = Double(kv[1]) else { return nil }
            return (t, z)
        }
        .sorted { $0.t < $1.t }
    }

    private func startScript() {
        guard scriptTimer == nil else { return }
        scriptStart = Date()
        scriptTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let start = self.scriptStart else { return }
                let t = Date().timeIntervalSince(start)
                let z = self.script.last(where: { $0.t <= t })?.z ?? 0
                self.process(z: z)
            }
        }
    }
}

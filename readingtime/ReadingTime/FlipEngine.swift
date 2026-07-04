import Foundation
import CoreMotion
import UIKit
import RTViews
import os.log

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
    private let signals = RTFlipSignals()

    // 합성 모션 스크립트 (시뮬레이터/검증 전용)
    private let script: [(t: TimeInterval, z: Double)]
    private var scriptTimer: Timer?
    private var scriptStart: Date?

    // 기기 잠금 추적 — "직접 잠근 폰의 엎힘"(독서 의도, 기록 계속)과 "앱 밖(홈·타앱)
    // 엎힘"(무관한 동작, 무시)을 구분한다 (실기기 피드백 2026-07-04).
    // 패스코드 기기에서 잠금 시 protected data 가 무효화되는 신호를 사용.
    // 주의: 이 신호는 잠금 후 ~10초 지연 발화(파일 보호 유예) — 잠그자마자 엎는 자연스러운
    // 동작이 "비잠금"으로 오판되는 회귀가 있었음 → 애매한 엎힘은 보류 후 재판정한다.
    private var deviceLocked = false
    private var pendingDown: Date?

    init(model: RTAppModel, motionScript: String? = nil) {
        self.model = model
        self.script = motionScript.map(Self.parseScript) ?? []
        deviceLocked = !UIApplication.shared.isProtectedDataAvailable
        // 1차 신호: Darwin lockstate — 잠금 "순간" 발화 (개인 사이드로드 앱이라 사용 무방).
        // protected data 신호(~10초 지연, Apple 문서)만 쓰면 잠그자마자 엎었을 때
        // 진동이 수 초 늦는다 (8차 실기기 피드백 "3초 딜레이") → 즉시 신호로 해소.
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            Unmanaged.passUnretained(self).toOpaque(),
            { _, observer, _, _, _ in
                guard let observer else { return }
                let engine = Unmanaged<FlipEngine>.fromOpaque(observer).takeUnretainedValue()
                Task { @MainActor in engine.handleLockStateChange() }
            },
            "com.apple.springboard.lockstate" as CFString,
            nil, .deliverImmediately)
        // 2차(백업) 신호: protected data — 방향이 명확해 상태 보정용으로 유지
        NotificationCenter.default.addObserver(
            forName: UIApplication.protectedDataWillBecomeUnavailableNotification,
            object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.markLocked() }
        }
        NotificationCenter.default.addObserver(
            forName: UIApplication.protectedDataDidBecomeAvailableNotification,
            object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.deviceLocked = false }
        }
    }

    /// Darwin lockstate 는 페이로드 없이 잠금/해제/화면 이벤트에서 "여러 번" 발화할 수 있다
    /// (9차 실기기 회귀: 토글 추론이 두 번째 발화에 뒤집혀 잠금 오판 → 엎기 무시).
    /// → 여기서는 "잠금 설정"만 한다 (멱등). 해제는 방향이 명확한 신호 2개로만:
    ///   protectedDataDidBecomeAvailable / 앱 포그라운드 복귀(setUnlockedOnActive).
    /// 해제 중 lockstate 오발화로 잠깐 true 가 되어도, 그 순간의 엎기 = 손에 든 폰을
    /// 엎는 독서 의도라 무해하며 곧 available 신호가 보정한다.
    private func handleLockStateChange() {
        guard !deviceLocked, UIApplication.shared.applicationState != .active else { return }
        Self.log.info("잠금 신호 수신 (lockstate)")
        markLocked()
    }

    /// 포그라운드 복귀 = 확실한 비잠금 (ReadingTimeApp scenePhase 배선)
    func setUnlockedOnActive() {
        deviceLocked = false
    }

    private func markLocked() {
        deviceLocked = true
        // 잠금 확정 — 보류 중이던 엎힘이 있으면 그 시점으로 소급 적용.
        // 15초 초과 스테일 보류는 미적용 (서스펜드로 폐기 타이머가 못 돈 경우 안전망)
        if let at = pendingDown {
            pendingDown = nil
            if Date().timeIntervalSince(at) < 15 {
                Self.log.info("잠금 확인 — 보류 엎힘 소급 적용")
                performDown(at: at)
            } else {
                Self.log.info("스테일 보류 엎힘 폐기")
            }
        }
    }

    func startMonitoring() {
        signals.prepare()
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
            // 앱이 보이지도 잠기지도 않은 상태(홈·타앱)의 엎힘은 오기록 후보 — 단 잠금
            // 신호가 ~10초 지연되므로 즉시 버리지 않고 보류: 잠금이 확인되면 소급 적용
            // (엎은 시점부터 wall-clock 정산), 12초 내 확인 안 되면 앱 밖 동작으로 폐기.
            if UIApplication.shared.applicationState == .background && !deviceLocked {
                let at = now
                pendingDown = at
                Self.log.info("배경 엎힘 보류 — 잠금 여부 재판정 대기")
                DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
                    guard let self, self.pendingDown == at else { return }
                    self.pendingDown = nil
                    Self.log.info("앱 밖 엎힘 무시 (비잠금 백그라운드)")
                }
                return
            }
            performDown(at: now)
        case .up:
            pendingDown = nil   // 판정 전 들어올림 → 보류 취소
            if model.route == .flipTimer, model.session?.mode == .flip,
               model.session?.status == .recording {
                session.pause(at: now)
                model.togglePause()   // 들어올림 → 일시정지
                model.syncElapsed(session.elapsed(at: now))
                signals.signalPause()
            }
        }
    }

    private func performDown(at now: Date) {
        if model.route == .flipWait {
            session.start(at: now)
            model.simFlip()
            signals.signalStart()   // 화면이 안 보이는 상태의 "기록 시작" 신호
        } else if model.route == .flipTimer, model.session?.mode == .flip,
                  model.session?.status == .paused {
            session.resume(at: now)
            model.togglePause()   // 다시 엎으면 이어서
            model.syncElapsed(session.elapsed(at: now))
            signals.signalStart()
        }
    }

    private static let log = Logger(subsystem: "com.leftjap.readingtime", category: "flip")

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

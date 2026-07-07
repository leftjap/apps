import Foundation
import CoreMotion
import UIKit
import RTViews
import os.log

// 실기기 진단용 이중 싱크 — devicectl --console 은 os.log 미표시(stdout 만)인데,
// 무선 콘솔은 잠금 대기 중 Wi-Fi 이탈로 끊기고 호스트 종료 시 앱까지 죽는다(SIGTERM 포워딩).
// → stdout(라이브 가능 시) + Documents/rtdbg.log 파일(사후 회수 정본) 병행.
// 회수: devicectl device copy from --source Documents/rtdbg.log
//       --domain-type appDataContainer --domain-identifier com.leftjap.readingtime
enum RTDbg {
    private static let f: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f
    }()
    private static let fileURL = FileManager.default
        .urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("rtdbg.log")
    static func p(_ s: String) {
        let line = "[\(f.string(from: Date()))] \(s)"
        print(line)
        guard let data = (line + "\n").data(using: .utf8) else { return }
        if let size = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize,
           size > 512 * 1024 {
            try? FileManager.default.removeItem(at: fileURL)   // 512KB 초과 시 리셋
        }
        if let h = try? FileHandle(forWritingTo: fileURL) {
            defer { try? h.close() }
            _ = try? h.seekToEnd()
            try? h.write(contentsOf: data)
        } else {
            try? data.write(to: fileURL)   // 최초 생성 (기본 보호 클래스 — 잠금 중 기록 가능)
        }
    }
}

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
    //
    // 무장(armed) 모델 (15차): 잠금 신호만으론 "독서 잠금 엎기"와 "홈 이탈 엎기"를 구분할
    // 수 없다 — 엎어놓기만 해도 face-down 감지 → 화면 오프 → 수 초 내 자동 잠금 신호가
    // 발생해 12초 폐기가 실기기에서 사실상 도달 불가(보류가 소급돼 오기록). 그래서 배경
    // 엎힘은 "앱에서 잠금으로 이탈한 컨텍스트"(armed)에서만 유효:
    //   무장 = 포그라운드(전환 중 포함) 잠금 or 배경 진입 ±1.5초 내 잠금
    //   해제 = 비잠금 배경 진입(홈 이탈) / 해제 후 15초 무재잠금(타앱 실사용) / 앱 활성 복귀
    private var deviceLocked = false
    private var armed = false
    private var backgroundedAt: Date?
    private var lastAvailableAt: Date?
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
            Task { @MainActor in
                RTDbg.p("flip: protected data 잠금 신호")
                self?.markLocked()
            }
        }
        NotificationCenter.default.addObserver(
            forName: UIApplication.protectedDataDidBecomeAvailableNotification,
            object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in
                guard let self else { return }
                RTDbg.p("flip: protected data 해제 신호")
                self.deviceLocked = false
                // 글랜스(잠금 화면 탭)는 수 초 내 재잠금이 따라온다 (12·14차 실측 2~5초).
                // 재잠금 없이 15초가 지나면 실사용 해제(홈·타앱) — 배경 엎힘 무장 해제 (15차).
                // 잔여: 해제 후 15초 내 앱 미복귀 엎기는 글랜스와 구분 불가한 회색지대.
                let at = Date()
                self.lastAvailableAt = at
                DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
                    guard let self, self.lastAvailableAt == at, !self.deviceLocked, self.armed,
                          UIApplication.shared.applicationState == .background else { return }
                    self.armed = false
                    RTDbg.p("flip: 무장 해제 (해제 후 15초 무재잠금)")
                }
            }
        }
    }

    /// Darwin lockstate 는 페이로드 없이 잠금/해제/화면 이벤트에서 "여러 번" 발화할 수 있다
    /// (9차 실기기 회귀: 토글 추론이 두 번째 발화에 뒤집혀 잠금 오판 → 엎기 무시).
    /// → 여기서는 "잠금 설정"만 한다 (멱등). 해제는 protectedDataDidBecomeAvailable /
    ///   앱 포그라운드 복귀(setUnlockedOnActive)로만.
    /// 12차 계측 (2026-07-04, 6/6 사이클): 잠금 순간 발화는 항상 배경 상태(state=2)로
    /// 도착 — resign 처리가 신호 전달보다 빠르다 (10차의 ".active 경합" 가설·0.5초
    /// 재판정은 반증돼 제거). 해제 직후 잔여 발화가 잠금을 잠깐 재래치하는 것도 실측
    /// 확인 — 활성 복귀가 보정하는 수용 잔여.
    private func handleLockStateChange() {
        let state = UIApplication.shared.applicationState
        RTDbg.p("flip: lockstate 발화 (locked=\(deviceLocked), state=\(state.rawValue))")
        guard !deviceLocked, state != .active else { return }
        // 키백이 열려 있으면 실제 잠금이 아니라 해제 직후 잔여/화면 이벤트 발화(stray) —
        // stray 가 deviceLocked 를 재래치하면 홈에서 폰 사용 중 엎기가 잠금 직행 경로로
        // 오기록된다 (15차 트레이스). 실제 잠금은 protected data 신호가 같은 순간 도착해
        // markLocked 를 보장한다 (12·14차 실측: 두 신호 동시각 도착).
        guard !UIApplication.shared.isProtectedDataAvailable else {
            RTDbg.p("flip: lockstate 무시 (키백 열림 — stray)")
            return
        }
        Self.log.info("잠금 신호 수신 (lockstate)")
        RTDbg.p("flip: 잠금 확정 (lockstate)")
        markLocked()
    }

    /// 포그라운드 복귀 = 확실한 비잠금 (ReadingTimeApp scenePhase 배선)
    func setUnlockedOnActive() {
        RTDbg.p("flip: 활성 복귀 — 잠금 해제")
        deviceLocked = false
        armed = false        // 다음 무장은 다음 잠금 이탈에서
        backgroundedAt = nil
        // 앱 복귀 = 배경 엎힘 컨텍스트 종료 — 보류가 남으면 이후 잠금에 과거 시각으로
        // 소급돼 시간 부풀림 (stopMonitoring 과 동일 선례). 복귀했으니 무효화.
        pendingDown = nil
    }

    /// 배경 진입 (ReadingTimeApp scenePhase 배선) — 비잠금 배경 진입 = 홈/타앱 이탈.
    /// 측면 잠금 이탈은 잠금 신호가 ±1.5초 내 따라와 markLocked 에서 재무장된다.
    func noteBackgrounded() {
        backgroundedAt = Date()
        if !deviceLocked, armed {
            armed = false
            RTDbg.p("flip: 무장 해제 (비잠금 배경 진입)")
        }
    }

    private func markLocked() {
        deviceLocked = true
        // 무장 판정: 포그라운드(전환 중 포함) 잠금 or 배경 진입 직후(1.5초 내) 잠금 =
        // "앱에서 잠금으로 이탈". 홈 이탈 후 한참 뒤 잠금(엎기가 유발한 자동 잠금 포함)은
        // 무장하지 않는다 — 15차: 홈 이탈 엎기의 face-down 자동 잠금이 소급 오기록을 만듦.
        // backgroundedAt == nil 도 무장: 잠금 신호가 scenePhase .background 처리보다 먼저
        // 도착한 "같은 전환"이라는 뜻 (마지막 활성 이후 배경 진입 기록 없음 = 방금까지
        // 포그라운드) — 도착 순서 경합에서 A 플로우 무장이 누락되는 회귀 차단 (리뷰 확정).
        if UIApplication.shared.applicationState != .background
            || backgroundedAt == nil
            || backgroundedAt.map({ Date().timeIntervalSince($0) < 1.5 }) ?? false {
            if !armed { RTDbg.p("flip: 무장 (잠금 이탈)") }
            armed = true
        }
        // 잠금 확정 — 보류 중이던 엎힘이 있으면 그 시점으로 소급 적용.
        // 15초 초과 스테일 보류는 미적용 (서스펜드로 폐기 타이머가 못 돈 경우 안전망)
        if let at = pendingDown {
            pendingDown = nil
            if Date().timeIntervalSince(at) < 15 {
                Self.log.info("잠금 확인 — 보류 엎힘 소급 적용")
                RTDbg.p("flip: 보류 엎힘 소급 적용 (\(String(format: "%.1f", Date().timeIntervalSince(at)))초 전 엎힘)")
                performDown(at: at, signal: false)   // 보류 시점에 낙관 진동 완료 — 중복 억제
            } else {
                Self.log.info("스테일 보류 엎힘 폐기")
                RTDbg.p("flip: 스테일 보류 폐기")
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
        // 세션 경계 넘는 소급 방지 — 이전 세션의 보류 엎힘이 새 세션 시작 후
        // 잠금 신호에 소급 적용되면 세션이 과거 시점으로 오기록된다
        pendingDown = nil
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
            RTDbg.p("flip: 엎힘 감지 (locked=\(deviceLocked), armed=\(armed), state=\(UIApplication.shared.applicationState.rawValue))")
            if UIApplication.shared.applicationState == .background {
                // 비무장 배경 = 홈/타앱 이탈 컨텍스트 — 엎힘 완전 무시 (기록도 진동도 없음).
                // 잠금 신호로는 구분 불가 (엎기 자체가 수 초 내 자동 잠금을 유발) — 15차.
                guard armed else {
                    Self.log.info("배경 엎힘 무시 (비무장 — 홈/타앱 이탈)")
                    RTDbg.p("flip: 배경 엎힘 무시 (비무장)")
                    return
                }
                // 무장 상태의 비잠금 엎힘 = 글랜스로 키백만 풀린 잠금 화면 엎기 — 보류:
                // 재잠금 신호에서 소급 적용(엎은 시점부터 wall-clock 정산), 12초 내
                // 미확인 시 폐기. 진동은 지금 낙관 발화 (12차: 재잠금까지 2~5초 지연 해소,
                // 소급 시 중복 억제).
                if !deviceLocked {
                    let at = now
                    pendingDown = at
                    Self.log.info("배경 엎힘 보류 — 잠금 여부 재판정 대기")
                    RTDbg.p("flip: 배경 엎힘 보류 (12초 재판정 대기) — 낙관 진동")
                    signals.signalStart()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
                        guard let self, self.pendingDown == at else { return }
                        self.pendingDown = nil
                        Self.log.info("앱 밖 엎힘 무시 (비잠금 백그라운드)")
                        RTDbg.p("flip: 보류 폐기 — 비잠금 배경")
                    }
                    return
                }
            }
            performDown(at: now)
        case .up:
            RTDbg.p("flip: 들어올림 감지")
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

    private func performDown(at now: Date, signal: Bool = true) {
        if model.route == .home, model.currentBook != nil {
            // 읽기 뎁스 제거(§4-1): 홈(책 있음, 포그라운드)에서 엎으면 대기 화면 없이 즉시 기록.
            // 빈 홈(책 없음)은 기록 대상이 없으므로 시작하지 않는다 (수용기준#1 — 빈 홈은 책 추가 유도).
            session.start(at: now)
            model.simFlip()
            if signal { signals.signalStart() }   // 화면이 안 보이는 상태의 "기록 시작" 신호
        } else if model.route == .flipTimer, model.session?.mode == .flip,
                  model.session?.status == .paused {
            session.resume(at: now)
            model.togglePause()   // 다시 엎으면 이어서
            model.syncElapsed(session.elapsed(at: now))
            if signal { signals.signalStart() }
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

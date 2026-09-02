import Foundation

// FlipEngine 의 순수 코어 — CoreMotion 없이 유닛 테스트·시뮬레이터 주입 가능하게 분리.
// (시뮬레이터는 CoreMotion 미지원이라 이 코어에 합성 z 를 주입해 flip 흐름을 재현한다)

/// 엎기(face-down) 감지: gravity.z 히스테리시스(0.85/0.60) + 디바운스(0.7s)
public struct FlipDetector {
    public enum Transition: Equatable { case down, up }

    public private(set) var isFaceDown = false

    // 튜닝 파라미터 — 실기기에서 조정
    public var startThreshold = 0.85
    public var stopThreshold = 0.60
    public var debounce: TimeInterval = 0.7

    private var candidateSince: Date?

    public init() {}

    public mutating func process(z: Double, at now: Date) -> Transition? {
        if isFaceDown {
            if z < stopThreshold {
                isFaceDown = false
                candidateSince = nil
                return .up
            }
            return nil
        }
        guard z > startThreshold else {
            candidateSince = nil
            return nil
        }
        guard let since = candidateSince else {
            candidateSince = now
            return nil
        }
        if now.timeIntervalSince(since) >= debounce {
            isFaceDown = true
            candidateSince = nil
            return .down
        }
        return nil
    }

    public mutating func reset() {
        isFaceDown = false
        candidateSince = nil
    }
}

/// 탭 세션 wall-clock 추적 — UI 틱 유실(잠금·서스펜드)과 무관하게 실제 경과를 보전.
/// flip 모드는 FlipEngine(WallClockSession + 모션 전환)이 담당 — 여기는 tap 전용으로
/// 세션 상태 전이($session 발행)만 보고 시계를 굴린다.
public struct RTTapSessionClock {
    private var clock = WallClockSession()
    private var lastStatus: RTSessionStatus?
    public private(set) var isTracking = false

    public init() {}

    public mutating func track(_ session: RTSession?, at now: Date) {
        guard let s = session, s.mode == .tap else {
            isTracking = false
            lastStatus = nil
            return
        }
        if !isTracking {
            isTracking = true
            clock.start(at: now, base: TimeInterval(s.elapsed))   // 복원 세션: 저장된 경과부터 잇는다
            if s.status == .paused { clock.pause(at: now) }
            lastStatus = s.status
            return
        }
        if lastStatus == .recording, s.status == .paused {
            clock.pause(at: now)
        } else if lastStatus == .paused, s.status == .recording {
            clock.resume(at: now)
        }
        lastStatus = s.status
    }

    public func elapsed(at now: Date) -> Int { clock.elapsed(at: now) }
}

/// wall-clock 세션 누적 — 백그라운드에서도 경과가 정확하도록 Date 기준
public struct WallClockSession {
    private var segmentStart: Date?
    private var accumulated: TimeInterval = 0

    public init() {}

    /// base: 복원된 세션의 누적 경과(초) — 앱 종료 후 되살린 세션은 0 이 아니라 여기서부터 잇는다
    public mutating func start(at now: Date, base: TimeInterval = 0) {
        accumulated = base
        segmentStart = now
    }
    /// 한 번이라도 start 됐는지 — 복원된 세션은 엔진 시계가 아직 안 돌았을 수 있어 재개 전에 시드가 필요하다
    public var hasStarted: Bool { segmentStart != nil || accumulated > 0 }

    public mutating func pause(at now: Date) {
        guard let s = segmentStart else { return }
        accumulated += now.timeIntervalSince(s)
        segmentStart = nil
    }

    public mutating func resume(at now: Date) {
        guard segmentStart == nil else { return }
        segmentStart = now
    }

    public func elapsed(at now: Date) -> Int {
        let live = segmentStart.map { now.timeIntervalSince($0) } ?? 0
        return Int(accumulated + live)
    }
}

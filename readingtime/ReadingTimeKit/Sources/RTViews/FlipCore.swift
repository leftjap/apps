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

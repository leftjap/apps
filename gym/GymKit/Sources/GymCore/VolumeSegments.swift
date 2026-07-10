import Foundation

// 종목 볼륨 세그먼트 링 기하 — session.js computeVolSegments/computeOverflowArc 포팅 (작업지시서 §5.1·§6.3).
public enum VolSegState: String, Sendable { case done, active, upcoming }

public struct VolSegment: Sendable, Equatable {
    public let arc: Double   // 가시 호 길이 (of 100.53)
    public let rot: Double   // 시작각(deg), -90=12시
    public let state: VolSegState
}

public enum VolumeRing {
    public static let ringC = 100.53   // 2π·16 (세그먼트 링 r=16)
    public static let segGap = 2.2     // 세그먼트 사이 갭 (시안 #6b/#7b 역산)
    public static let arcC = 131.95    // 2π·21 (초과 아크 r=21)

    // 세트별 볼륨 세그먼트. cur = 현재(미완료) 세트 인덱스.
    public static func segments(_ sets: [GymSet], cur: Int) -> (segs: [VolSegment], planned: Double) {
        let vols = sets.map { (Double($0.weight ?? 0)) * Double($0.reps ?? 0) }
        let planned = vols.reduce(0, +)
        var segs: [VolSegment] = []
        var cumVol = 0.0
        for i in vols.indices {
            let slot = planned > 0 ? (vols[i] / planned) * ringC : 0
            let arc = max(0, slot - segGap)
            let rot = -90 + (planned > 0 ? (cumVol / planned) * 360 : 0)
            let done = sets[i].done
            let active = (i == cur && !done)
            segs.append(VolSegment(arc: (arc * 100).rounded() / 100,
                                   rot: (rot * 100).rounded() / 100,
                                   state: active ? .active : (done ? .done : .upcoming)))
            cumVol += vols[i]
        }
        return (segs, planned)
    }

    public struct Overflow: Sendable, Equatable {
        public let isOver: Bool, arcDash: Double, tipX: Double, tipY: Double, tipOpacity: Double, overAmt: Int
    }
    // 초과 아크(r=21) + 팁 도트.
    public static func overflow(exDoneVol: Double, prevExVol: Double) -> Overflow {
        guard prevExVol > 0, exDoneVol > prevExVol else {
            return Overflow(isOver: false, arcDash: 0, tipX: 20, tipY: -1, tipOpacity: 0, overAmt: 0)
        }
        let overRatio = exDoneVol / prevExVol - 1
        let arc = min(arcC, overRatio * arcC)
        let theta = (-90 + (arc / arcC) * 360) * .pi / 180
        return Overflow(isOver: true, arcDash: (arc * 100).rounded() / 100,
                        tipX: ((20 + 21 * cos(theta)) * 100).rounded() / 100,
                        tipY: ((20 + 21 * sin(theta)) * 100).rounded() / 100,
                        tipOpacity: arc > 1.2 ? 1 : 0, overAmt: Int((exDoneVol - prevExVol).rounded()))
    }
}

// 기록 돌파 "순간" 판정 — 커밋 1회성 팝 트리거 (session.js exRecordBurst/topRecordPulse 조건 정합).
public enum GymRecordMoments {
    // 종목 직전기록 100% 돌파: before < prev && after >= prev (도달 포함).
    public static func exRecordCrossed(before: Double, after: Double, prevExVol: Double) -> Bool {
        prevExVol > 0 && before < prevExVol && after >= prevExVol
    }
    // 세션 총볼륨 신기록: before <= prev && after > prev (엄격 초과).
    public static func topRecordCrossed(before: Double, after: Double, prevSessionVol: Double) -> Bool {
        prevSessionVol > 0 && before <= prevSessionVol && after > prevSessionVol
    }
}

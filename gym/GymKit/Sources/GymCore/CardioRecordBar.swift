import Foundation

// 유산소 직전 기록 줄 (사용자 2026-09-26) — 근력 세트바(`PrevRecordBars`)와 같은 자리·같은 모양.
// 9/17 에 세션 유산소 카드의 요일 원이 날짜만 보이는 2주 카드로 바뀐 뒤, 트레드밀 화면에는
// 지난 기록 수치가 하나도 남지 않았다. 근력은 칸 = 세트지만 유산소는 세션당 한 번이라 칸 = 세션이다.
// 거리가 주 지표(2026-09-17)라 위 줄 = 거리, 아래 줄 = 시간.
extension GymSessionLogic {

    public struct CardioRecordSlot: Equatable, Sendable {
        public let top: String         // 거리 "2.1" — 미기록 "—" (0 이 아니다)
        public let bottom: String      // 시간 "18분" — 미기록 ""
        public let distanceKm: Double  // 막대 높이 (미기록 0)
        public init(top: String, bottom: String, distanceKm: Double) {
            self.top = top; self.bottom = bottom; self.distanceKm = distanceKm
        }
    }

    public struct CardioRecordBar: Equatable, Sendable {
        public let past: [CardioRecordSlot]   // 최근 완료 러닝, 과거 → 최신
        public let today: CardioRecordSlot    // 진행 중 세트
        public let best: CardioRecordSlot?    // 전체 기록 + 오늘 중 최장 거리
    }

    static func cardioSlot(distanceKm: Double?, durationSec: Double?) -> CardioRecordSlot {
        let km = (distanceKm ?? 0) > 0 ? distanceKm : nil
        let min = (durationSec ?? 0) > 0 ? Int((durationSec! / 60).rounded()) : nil
        return CardioRecordSlot(top: km.map { GymCardioMetric.distance.format($0) } ?? "—",
                                bottom: min.map { "\($0)분" } ?? "",
                                distanceKm: km ?? 0)
    }

    /// 과거 칸은 `recentCardioRuns`(완료 세션·이 종목·done) 에서, 오늘 칸은 진행 중 세트에서 읽는다.
    public static func cardioRecordBar(history: [GymSession], exerciseId: String,
                                       todaySet: GymSet?, pastLimit: Int = 4) -> CardioRecordBar {
        let runs = recentCardioRuns(history: history, exerciseId: exerciseId, limit: .max)
            .map { cardioSlot(distanceKm: $0.distanceKm, durationSec: $0.durationSec) }
        let today = cardioSlot(distanceKm: todaySet?.distance, durationSec: todaySet?.duration)
        // 같은 거리면 최근 것이 최고 칸에 선다 (과거 → 최신 순회 + >=).
        var best: CardioRecordSlot? = nil
        for s in runs + [today] where s.distanceKm > 0 && s.distanceKm >= (best?.distanceKm ?? 0) {
            best = s
        }
        return CardioRecordBar(past: Array(runs.suffix(pastLimit)), today: today, best: best)
    }
}

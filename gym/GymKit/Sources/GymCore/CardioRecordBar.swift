import Foundation

// 유산소 직전 기록 줄 (사용자 2026-09-26) — 근력 세트바(`PrevRecordBars`)와 같은 자리·같은 모양.
// 9/17 에 세션 유산소 카드의 요일별 수치 원이 날짜만 보이는 2주 카드로 바뀐 뒤, 트레드밀 화면의
// 지난 수치는 입력 전 히어로 고스트와 키패드 "직전" 줄뿐이었다. 근력은 칸 = 세트, 유산소는 칸 = 세션이다.
// 위 줄 = 거리, 아래 줄 = 날짜 (트레드밀은 거리만 받는다 — 사용자 2026-09-26, 시간은 더 기록되지 않는다).
extension GymSessionLogic {

    public struct CardioRecordSlot: Equatable, Sendable {
        public let top: String         // 거리 "2.1" — 미기록 "—" (0 이 아니다)
        public let bottom: String      // 날짜 "9/25" — 오늘은 "오늘"
        public let distanceKm: Double  // 막대 높이 (미기록 0)
        public init(top: String, bottom: String, distanceKm: Double) {
            self.top = top; self.bottom = bottom; self.distanceKm = distanceKm
        }
    }

    public struct CardioRecordBar: Equatable, Sendable {
        public let past: [CardioRecordSlot]   // 최근 완료 러닝, 과거 → 최신
        public let today: CardioRecordSlot    // 진행 중 세트
        public let todaySaved: Bool           // 오늘 칸 저장(좌 스와이프) 여부 — 근력 세트바의 완료/진행 구분
        public let best: CardioRecordSlot?    // 전체 기록 + 오늘 중 최장 거리
    }

    static func cardioSlot(distanceKm: Double?, day: String) -> CardioRecordSlot {
        let km = (distanceKm ?? 0) > 0 ? distanceKm : nil
        return CardioRecordSlot(top: km.map { GymCardioMetric.distance.format($0) } ?? "—",
                                bottom: day, distanceKm: km ?? 0)
    }
    /// "2026-09-25" → "9/25".
    static func shortDay(_ iso: String) -> String {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        return p.count == 3 ? "\(p[1])/\(p[2])" : iso
    }

    /// 과거 칸은 `recentCardioRuns`(완료 세션·이 종목·done) 에서, 오늘 칸은 진행 중 세트에서 읽는다.
    public static func cardioRecordBar(history: [GymSession], exerciseId: String,
                                       todaySet: GymSet?, pastLimit: Int = 4) -> CardioRecordBar {
        let runs = recentCardioRuns(history: history, exerciseId: exerciseId, limit: .max)
            .map { cardioSlot(distanceKm: $0.distanceKm, day: shortDay($0.date)) }
        let today = cardioSlot(distanceKm: todaySet?.distance, day: "오늘")
        // 같은 거리면 최근 것이 최고 칸에 선다 (과거 → 최신 순회 + >=).
        var best: CardioRecordSlot? = nil
        for s in runs + [today] where s.distanceKm > 0 && s.distanceKm >= (best?.distanceKm ?? 0) {
            best = s
        }
        return CardioRecordBar(past: Array(runs.suffix(pastLimit)), today: today,
                               todaySaved: todaySet?.done == true, best: best)
    }
}

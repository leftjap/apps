import Foundation

// 통계 월 캘린더 볼륨 히트맵 — PWA stats.js applyWorkedToCalendar 1:1 포팅.
//
//   alpha = 0.14 + 0.82 × (일볼륨 / 월최대볼륨)     // 0kg 운동일(유산소 단독 등)도 최소 농도 0.14
//   숫자색 = alpha > 0.52 ? 흰색 : crail-deep
//   숫자굵기 = alpha > 0.4 ? 600 : 500
//
// 칠하는 색은 PWA 가 rgba(193,99,63,a) 리터럴을 쓴다(#C1633F — CSS var 에 알파를 못 실던 시절의
// crail 값). 토큰 --crail-base oklch(67% .12 50) = rgb(208,126,78) 와 다르므로, 화면 일치를
// 위해 리터럴 쪽을 정본으로 삼는다.
public enum GymCalendarHeat {
    public static let heatRGB: (r: Double, g: Double, b: Double) = (193.0 / 255, 99.0 / 255, 63.0 / 255)
    public static let minAlpha = 0.14
    public static let alphaSpan = 0.82

    /// 표시 중 월의 일자별 총 볼륨 (완료 세션의 done 세트 weight×reps). 운동일이면 0 이라도 키가 존재.
    public static func dayVolumes(sessions: [GymSession], year: Int, month: Int) -> [Int: Double] {
        let prefix = String(format: "%04d-%02d-", year, month)
        var out: [Int: Double] = [:]
        for s in sessions where s.status == .completed && s.date.hasPrefix(prefix) {
            guard let day = Int(s.date.suffix(2)) else { continue }
            let vol = s.blocks
                .filter { $0.type == "single" }
                .reduce(0.0) { $0 + $1.sets.filter(\.done).reduce(0.0) { $0 + $1.volume } }
            out[day, default: 0] += vol
        }
        return out
    }

    public static func alpha(dayVol: Double, maxVol: Double) -> Double {
        guard maxVol > 0 else { return minAlpha }
        return minAlpha + alphaSpan * (dayVol / maxVol)
    }

    public static func numberIsWhite(alpha: Double) -> Bool { alpha > 0.52 }
    public static func numberIsBold(alpha: Double) -> Bool { alpha > 0.4 }
}

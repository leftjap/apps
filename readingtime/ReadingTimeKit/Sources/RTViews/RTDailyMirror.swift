import Foundation

/// readingtime_daily(날짜·방식별 종이책 초) 를 앱 기록에서 계산한다. Cue 앱이 이 표를 읽는다.
/// 2026-11-08 검토: 예전엔 저장할 때마다 '저장한 날' 에 초를 더하기만 해서, 직접 추가·고치기·지우기와
/// 밤에 멈추고 다음 날 저장한 기록이 반영되지 않았다. 이제 기록 전체에서 합을 다시 계산해 서버 값과 다른 행만 올린다.
public enum RTDailyMirror {
    public struct Key: Hashable, Sendable {
        public let day: String      // yyyy-MM-dd (KST — 표의 기존 규약)
        public let source: String   // flip | tap | manual
        public init(day: String, source: String) { self.day = day; self.source = source }
    }

    public static func rows(_ data: RTUserData) -> [Key: Int] {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "Asia/Seoul")
        f.dateFormat = "yyyy-MM-dd"
        var out: [Key: Int] = [:]
        for s in data.sessions where s.seconds > 0 {
            out[Key(day: f.string(from: s.endedAt), source: s.mode), default: 0] += s.seconds
        }
        return out
    }

    /// 서버에 올릴 행 — 값이 다른 행, 그리고 서버에만 있는 행은 0 으로 (지운 기록).
    public static func changes(want: [Key: Int], server: [Key: Int]) -> [Key: Int] {
        var out = want.filter { server[$0.key] != $0.value }
        for (k, v) in server where want[k] == nil && v != 0 { out[k] = 0 }
        return out
    }
}

import Foundation

// 프로필 필드 검증·포맷 — PWA profile.js FIELD_DEFS 1:1 포팅 (spec §10-3).
// 입력은 네이티브 키패드 버퍼(문자열) 기준. 잘못된 입력은 nil (호출부 no-op).
public enum GymProfileFields {

    // 키 — 100~250cm, 반올림 정수 (profile.js height.parse).
    public static func parseHeight(_ s: String) -> Int? {
        guard let n = Double(s.trimmingCharacters(in: .whitespaces)),
              n.isFinite, n >= 100, n <= 250 else { return nil }
        return Int(n.rounded())
    }

    // 목표 체중 — 0 초과 ~300kg, 0.1 반올림. 콤마 소수점 허용 (profile.js goal-weight.parse).
    public static func parseGoalWeight(_ s: String) -> Double? {
        let t = s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        guard let n = Double(t), n.isFinite, n > 0, n <= 300 else { return nil }
        return (n * 10).rounded() / 10
    }

    // 주간 목표 — 1~7회 정수 (profile.js weekly-goal.parse).
    public static func parseWeeklyGoal(_ s: String) -> Int? {
        guard let n = Double(s.trimmingCharacters(in: .whitespaces)),
              n.isFinite, n >= 1, n <= 7 else { return nil }
        return Int(n.rounded())
    }

    // 생년월일 — 키패드 8자리 YYYYMMDD → "YYYY-MM-DD".
    // 범위 검증은 profile.js birthdate.parse 정합 (y 1900~2100, mo 1~12, d 1~31).
    public static func parseBirthdateDigits(_ digits: String) -> String? {
        guard digits.count == 8, digits.allSatisfy(\.isNumber),
              let y = Int(digits.prefix(4)),
              let mo = Int(digits.dropFirst(4).prefix(2)),
              let d = Int(digits.suffix(2)),
              y >= 1900, y <= 2100, mo >= 1, mo <= 12, d >= 1, d <= 31 else { return nil }
        return String(format: "%04d-%02d-%02d", y, mo, d)
    }

    // 저장값 → 표시 "YYYY.MM.DD", 미입력은 "입력" placeholder (profile.js format).
    public static func birthdateDisplay(_ iso: String?) -> String {
        guard let iso else { return "입력" }
        let parts = iso.split(separator: "-")
        guard parts.count == 3 else { return iso }
        return parts.joined(separator: ".")
    }

    // 키패드 입력 진행 중 버퍼 → "1976.05.12" 점진 표시 (빈 버퍼는 키패드 기본 "0").
    public static func birthdateBufferDisplay(_ digits: String) -> String {
        guard !digits.isEmpty else { return "0" }
        var out = ""
        for (i, ch) in digits.enumerated() {
            if i == 4 || i == 6 { out.append(".") }
            out.append(ch)
        }
        return out
    }
}

import SwiftUI

// 잠금 화면 Live Activity 프레젠테이션 (순수 SwiftUI) — 위젯 익스텐션이 래핑, rtshot 이 헤드리스 렌더.
// ActivityKit 비의존 → macOS 로 픽셀 검증 가능. 익스텐션엔 커스텀 폰트 없어 시스템 폰트 사용.

public struct RTLiveActivityLockView: View {
    let bookTitle: String
    let paused: Bool
    let startedAt: Date       // 기록 기준 시각(now − elapsed) — 시스템 자동 타이머
    let pausedElapsed: Int    // 일시정지 시 고정 표시
    let staticElapsed: Int?   // rtshot 헤드리스 렌더 전용: 자동 타이머 대신 고정 초 표시

    public init(bookTitle: String, paused: Bool, startedAt: Date, pausedElapsed: Int, staticElapsed: Int? = nil) {
        self.bookTitle = bookTitle
        self.paused = paused
        self.startedAt = startedAt
        self.pausedElapsed = pausedElapsed
        self.staticElapsed = staticElapsed
    }

    static let gold = Color(red: 0.886, green: 0.812, blue: 0.62)
    static let amber = Color(red: 0.91, green: 0.745, blue: 0.47)
    static let bg = Color(red: 0.075, green: 0.11, blue: 0.09)
    static let timerColor = Color(red: 0.949, green: 0.933, blue: 0.867)

    public var body: some View {
        HStack(spacing: 14) {
            RoundedRectangle(cornerRadius: 3)
                .fill(LinearGradient(colors: [Color(red: 0.933, green: 0.882, blue: 0.737),
                                              Color(red: 0.89, green: 0.816, blue: 0.62)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 26, height: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(bookTitle)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.white)
                HStack(spacing: 5) {
                    Circle().fill(paused ? Self.amber : Self.gold).frame(width: 6, height: 6)
                    Text(paused ? "일시정지됨 · 다시 엎으면 이어서" : "기록 중")
                        .font(.caption)
                        .foregroundStyle(paused ? Self.amber : Self.gold)
                }
            }
            Spacer()
            timerText
                .font(.title2.weight(.semibold).monospacedDigit())
                .foregroundStyle(Self.timerColor)
                .frame(maxWidth: 110, alignment: .trailing)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    @ViewBuilder var timerText: some View {
        if let staticElapsed {
            Text(Self.hms(staticElapsed))   // 헤드리스 렌더: 고정 표시
        } else if paused {
            Text(Self.hms(pausedElapsed))
        } else {
            Text(timerInterval: startedAt...startedAt.addingTimeInterval(86_400), countsDown: false)
        }
    }

    public static func hms(_ sec: Int) -> String {
        String(format: "%d:%02d:%02d", sec / 3600, sec / 60 % 60, sec % 60)
    }
}

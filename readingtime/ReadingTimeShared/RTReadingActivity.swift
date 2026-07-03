#if canImport(ActivityKit)
import ActivityKit
import Foundation

// 잠금 화면 Live Activity 어트리뷰트 — 앱(시작/갱신/종료)과 위젯(렌더)이 공유.
// 기록 중엔 startedAt 기준 시스템 자동 타이머(Text(timerInterval:))가 잠금 화면에서 초를 굴린다.
public struct RTReadingActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public var paused: Bool
        /// 기록 기준 시각 = now − elapsed (자동 타이머 표시용)
        public var startedAt: Date
        /// 일시정지 시 고정 표시할 경과(초)
        public var pausedElapsed: Int

        public init(paused: Bool, startedAt: Date, pausedElapsed: Int) {
            self.paused = paused
            self.startedAt = startedAt
            self.pausedElapsed = pausedElapsed
        }
    }

    public var bookTitle: String

    public init(bookTitle: String) {
        self.bookTitle = bookTitle
    }
}
#endif

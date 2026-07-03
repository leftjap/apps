import Foundation
import ActivityKit
import RTViews
import os.log

// 잠금 화면 Live Activity 수명 관리 — 엎기 세션과 동기화.
// 기록 중엔 startedAt(=now−elapsed) 기준으로 시스템이 잠금 화면에서 초를 자동으로 굴리고,
// 일시정지/재개/종료는 앱 프로세스(keep-alive 로 백그라운드 생존)가 update/end 로 반영한다.
@MainActor
final class LiveActivityController {
    private var activity: Activity<RTReadingActivityAttributes>?
    private var lastKey: String?

    /// 세션 상태 변화에 맞춰 시작/갱신/종료 (elapsed 초 단위 틱은 무시 — 상태 전환만 반영)
    func sync(session: RTSession?, now: Date = Date()) {
        guard let s = session, s.mode == .flip else {
            end()
            return
        }
        let key = s.status == .paused ? "paused" : "recording"
        guard key != lastKey else { return }
        lastKey = key

        let state = RTReadingActivityAttributes.ContentState(
            paused: s.status == .paused,
            startedAt: now.addingTimeInterval(-TimeInterval(s.elapsed)),
            pausedElapsed: s.elapsed
        )
        if let activity {
            Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
        } else {
            do {
                let a = try Activity.request(
                    attributes: RTReadingActivityAttributes(bookTitle: "몰입"),
                    content: ActivityContent(state: state, staleDate: nil)
                )
                activity = a
                Self.log.info("live activity 등록 성공 id=\(a.id, privacy: .public) enabled=\(ActivityAuthorizationInfo().areActivitiesEnabled, privacy: .public)")
            } catch {
                Self.log.error("live activity 등록 실패: \(String(describing: error), privacy: .public)")
            }
        }
    }

    private static let log = Logger(subsystem: "com.leftjap.readingtime", category: "liveactivity")

    func end() {
        lastKey = nil
        guard let activity else { return }
        self.activity = nil
        Task { await activity.end(nil, dismissalPolicy: .immediate) }
    }
}

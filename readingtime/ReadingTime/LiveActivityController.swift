import Foundation
import ActivityKit
import RTViews
import os.log

// 잠금 화면 Live Activity 수명 관리 — 엎기 세션과 동기화.
// 기록 중엔 startedAt(=now−elapsed) 기준으로 시스템이 잠금 화면에서 초를 자동으로 굴리고,
// 일시정지/재개/종료는 앱 프로세스(keep-alive 로 백그라운드 생존)가 update/end 로 반영한다.
// 갱신은 무음(alertConfiguration 미사용) — 실기기 실측상 웨이크 효과 없이 사운드만 냈음.
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
            // alertConfiguration 제거 — 실기기 실측(2026-07-04): 화면 웨이크 효과는 없고
            // 사운드만 냄(사용자 불만). 상태 갱신은 무음으로 충분.
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
        let mine = activity
        activity = nil
        Task {
            if let mine { await mine.end(nil, dismissalPolicy: .immediate) }
            // 크래시/강제종료 후 잔존하는 좀비 Live Activity 일괄 정리
            for a in Activity<RTReadingActivityAttributes>.activities where a.id != mine?.id {
                Self.log.info("좀비 live activity 정리 id=\(a.id, privacy: .public)")
                await a.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}

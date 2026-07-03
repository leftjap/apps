import Foundation
import ActivityKit
import UIKit
import RTViews
import os.log

// 잠금 화면 Live Activity 수명 관리 — 엎기 세션과 동기화.
// 기록 중엔 startedAt(=now−elapsed) 기준으로 시스템이 잠금 화면에서 초를 자동으로 굴리고,
// 일시정지/재개/종료는 앱 프로세스(keep-alive 로 백그라운드 생존)가 update/end 로 반영한다.
// 잠금 중 상태 전환은 alertConfiguration 으로 갱신 — 잠금 화면에서 주의를 끌도록
// (화면 웨이크·사운드) 설계된 경로. 로컬 알림(RTFlipSignals)과 이중 채널.
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
            // 화면을 못 보는 상태(잠금·백그라운드)에서만 alert — 포그라운드에선 무음 갱신
            let alert: AlertConfiguration? = UIApplication.shared.applicationState == .active ? nil
                : AlertConfiguration(
                    title: "\(s.status == .paused ? "일시정지됨" : "기록 중")",
                    body: "\(s.status == .paused ? "다시 엎으면 이어서 기록됩니다" : "리딩타임이 기록하고 있어요")",
                    sound: .default)
            Task { await activity.update(ActivityContent(state: state, staleDate: nil),
                                         alertConfiguration: alert) }
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
                await a.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}

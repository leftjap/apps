import WidgetKit
import SwiftUI
import ActivityKit
import RTViews

// 잠금 화면 Live Activity — "잠긴 후에도 타이머가 돌고 있다"를 보여주는 배너.
// 프레젠테이션은 RTLiveActivityLockView(RTViews·순수 SwiftUI, rtshot 으로 픽셀 검증)에 위임.

@main
struct ReadingTimeWidgets: WidgetBundle {
    var body: some Widget {
        ReadingLiveActivity()
    }
}

struct ReadingLiveActivity: Widget {
    var gold: Color { Color(red: 0.886, green: 0.812, blue: 0.62) }

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RTReadingActivityAttributes.self) { context in
            RTLiveActivityLockView(
                bookTitle: context.attributes.bookTitle,
                paused: context.state.paused,
                startedAt: context.state.startedAt,
                pausedElapsed: context.state.pausedElapsed,
                tapMode: context.state.tapMode == true,
                trailing: context.state.tapMode == true ? AnyView(toggleButton(paused: context.state.paused)) : nil
            )
            .activityBackgroundTint(Color(red: 0.075, green: 0.11, blue: 0.09))
            .activitySystemActionForegroundColor(gold)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.bookTitle)
                        .font(.callout.weight(.semibold)).foregroundStyle(.white)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    timerText(context).font(.callout.monospacedDigit()).foregroundStyle(gold)
                }
            } compactLeading: {
                Image(systemName: context.state.paused ? "pause.fill" : "book.fill").foregroundStyle(gold)
            } compactTrailing: {
                timerText(context).font(.caption2.monospacedDigit()).foregroundStyle(gold).frame(maxWidth: 60)
            } minimal: {
                Image(systemName: "book.fill").foregroundStyle(gold)
            }
        }
    }

    /// 탭 모드 일시정지·재개 — RTToggleReadingIntent 가 앱 프로세스에서 세션을 바꾼다
    func toggleButton(paused: Bool) -> some View {
        Button(intent: RTToggleReadingIntent()) {
            Image(systemName: paused ? "play.fill" : "pause.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color(red: 0.075, green: 0.11, blue: 0.09))
                .frame(width: 38, height: 38)
                .background(Circle().fill(gold))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(paused ? "이어 읽기" : "일시정지")
    }

    @ViewBuilder
    func timerText(_ context: ActivityViewContext<RTReadingActivityAttributes>) -> some View {
        if context.state.paused {
            Text(RTLiveActivityLockView.hms(context.state.pausedElapsed))
        } else {
            Text(timerInterval: context.state.startedAt...context.state.startedAt.addingTimeInterval(86_400),
                 countsDown: false)
        }
    }
}

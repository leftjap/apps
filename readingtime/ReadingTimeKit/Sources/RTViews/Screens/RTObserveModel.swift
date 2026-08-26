import SwiftUI

// model 을 @ObservedObject 로 실제 구독하는 얇은 래퍼.
// Screen02Home 은 model 을 일반 var 로 들어(init 스냅샷 패턴) @Published 변경이 전파되지 않는다.
// 홈 캐러셀 도입 후 homeCardIndex 가 바뀌어도 하단 CTA 가 갱신되지 않는 버그가 생겨,
// 갱신이 필요한 구간만 이 래퍼로 감싼다. (데모/model nil 은 recordable=true 로 기존 렌더 유지)
struct RTObserveModel<Content: View>: View {
    let model: RTAppModel?
    @ViewBuilder let content: (Bool) -> Content

    var body: some View {
        if let model {
            Observing(model: model, content: content)
        } else {
            content(true)
        }
    }

    private struct Observing<C: View>: View {
        @ObservedObject var model: RTAppModel
        @ViewBuilder let content: (Bool) -> C
        var body: some View { content(model.selectedCardRecordable) }
    }
}

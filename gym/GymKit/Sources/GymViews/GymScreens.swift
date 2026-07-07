import SwiftUI

// gymshot 이 렌더할 화면/컴포넌트 스냅샷 카탈로그.
public enum GymScreens {
    @MainActor
    public static func snapshotView(id: String) -> AnyView? {
        switch id {
        case "rail":         return AnyView(RailDemo(single: false))
        case "rail-single":  return AnyView(RailDemo(single: true))
        case "session-top":  return AnyView(SessionTopBlock())
        case "session":      return AnyView(SessionScreenView())
        case "tokens":       return AnyView(TokenSwatch())
        default:             return nil
        }
    }
}

// 레일 데모 — 시안 #15a(4종목) / 단일 종목.
struct RailDemo: View {
    let single: Bool
    var body: some View {
        VStack {
            Spacer()
            GymFooterRail(items: single
                ? [.init(name: "인클라인 벤치", state: .current)]
                : [.init(name: "체스트 프레스", state: .done),
                   .init(name: "벤치프레스", state: .current),
                   .init(name: "인클라인 덤벨 프레스", state: .upcoming),
                   .init(name: "케이블 플라이", state: .upcoming)])
        }
        .frame(width: single ? 390 : 660, height: 300)
        .background(GY.shell)
    }
}

// 토큰 스와치 — oklch 변환 렌더 검증.
struct TokenSwatch: View {
    let swatches: [(String, Color)] = [
        ("ink1", GY.ink1), ("ink3", GY.ink3), ("crailBase", GY.crailBase),
        ("crailDeep", GY.crailDeep), ("cloudyBase", GY.cloudyBase), ("sage", GY.sage),
        ("recordBase", GY.recordBase), ("line", GY.line), ("sunken", GY.sunken),
    ]
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(swatches, id: \.0) { s in
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 6).fill(s.1).frame(width: 44, height: 28)
                    Text(s.0).font(.system(size: 13)).foregroundStyle(GY.ink2)
                }
            }
        }
        .padding(20)
        .frame(width: 300, height: 340, alignment: .topLeading)
        .background(GY.card)
    }
}

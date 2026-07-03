import SwiftUI

// 화면 레지스트리 — rtshot·앱이 공유. id = 시안 화면 번호("01"~"14").
public enum RTScreens {
    @MainActor
    public static func view(id: String) -> AnyView? {
        switch id {
        case "probe": return AnyView(ProbeScreen())
        case "01": return AnyView(Screen01Login())
        case "02": return AnyView(Screen02Home())
        case "14": return AnyView(Screen14EmptyHome())
        default: return nil
        }
    }

    // rtshot 대조용: 다크 크롬을 쓰는 화면
    public static let darkScreens: Set<String> = ["03", "04", "05"]

    @MainActor
    public static func snapshotView(id: String) -> AnyView? {
        guard let v = view(id: id) else { return nil }
        return AnyView(ZStack { v; RTChrome(dark: darkScreens.contains(id)) })
    }
}

// 파이프라인 검증용 — 토큰 색 스와치 + 폰트 페이스 라인
struct ProbeScreen: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 0) {
                RT.paper; RT.surface; RT.ink; RT.green; RT.terra; RT.amber; RT.gold; RT.segBg
            }
            .frame(height: 40)
            Rectangle().fill(RT.ctaGrad(CGSize(width: 358, height: 40))).frame(height: 40)
            Rectangle().fill(RT.darkGrad(CGSize(width: 358, height: 40))).frame(height: 40)
            Text("리딩타임 Noto 400").font(.sans(20, 400))
            Text("리딩타임 Noto 900").font(.sans(20, 900))
            Text("00:26:14 Plex 600").font(.mono(20, 600))
            Text("9:41 Poppins 600").font(.poppins600(20))
            Spacer()
        }
        .padding(16)
        .frame(width: 390, height: 844)
        .background(Color.white)
    }
}

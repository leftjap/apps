import SwiftUI

// 화면 레지스트리 — rtshot·앱이 공유. id = 시안 화면 번호("01"~"14").
public enum RTScreens {
    @MainActor
    public static func view(id: String) -> AnyView? {
        switch id {
        case "probe": return AnyView(ProbeScreen())
        case "01": return AnyView(Screen01Login())
        case "02": return AnyView(Screen02Home())
        case "03": return AnyView(Screen03FlipWait())
        case "04": return AnyView(Screen04FlipPaused())
        case "05": return AnyView(Screen05TapRecording())
        case "06": return AnyView(Screen06Done())
        case "07": return AnyView(SheetSnapshot(base: Screen02Home(), dim: Color(hex: 0x17120C), dimOpacity: 0.4, sheet: Sheet07AddTime()))
        case "08": return AnyView(Screen08Detail())
        case "09": return AnyView(SheetSnapshot(base: Screen08Detail(), dim: Color(hex: 0x191510), dimOpacity: 0.42, sheet: Sheet09Finish()))
        case "10": return AnyView(Screen10Stats())
        case "11": return AnyView(Screen11Month())
        case "12": return AnyView(Screen12Library())
        case "13": return AnyView(SheetSnapshot(base: Screen12Library(), dim: Color(hex: 0x17120C), dimOpacity: 0.4, sheet: Sheet13AddBook()))
        case "14": return AnyView(Screen14EmptyHome())
        case "15": return AnyView(Screen15Map())
        default: return nil
        }
    }

    // rtshot 대조용: 다크 크롬을 쓰는 화면
    public static let darkScreens: Set<String> = ["03", "04", "05"]

    // rtshot 경로는 rtHeadless — ImageRenderer 가 ScrollView 를 못 그리므로 스크롤 영역을 상단 클립으로.
    @MainActor
    public static func snapshotView(id: String) -> AnyView? {
        guard let v = view(id: id) else { return nil }
        return AnyView(ZStack { v; RTChrome(dark: darkScreens.contains(id)) }.rtHeadless())
    }

    // 액션 경로 오라클: 시드된 모델로 RTRootView 를 렌더 — 정적 snapshotView 와 픽셀 일치해야 함
    @MainActor
    public static func appSnapshotView(id: String) -> AnyView? {
        guard let m = RTAppModel.seeded(id) else { return nil }
        return AnyView(ZStack { RTRootView(model: m); RTChrome(dark: darkScreens.contains(id)) }.rtHeadless())
    }

    // 상태 파라미터 렌더: 임의 액션 시퀀스 적용 후 렌더 (비캐노니컬 상태 검증용)
    @MainActor
    public static func seqSnapshotView(actions: [String]) -> AnyView {
        let m = RTAppModel()
        actions.forEach { m.apply($0) }
        return AnyView(ZStack { RTRootView(model: m); RTChrome(dark: darkScreens.contains(m.route.rawValue)) }
            .rtHeadless())
    }

    // 앱 아이콘 (1024×1024) — 로그인 로고와 동일 문법: ctaGrad + 북 글리프 (마스킹은 iOS 가)
    @MainActor
    public static func appIconView() -> AnyView {
        AnyView(
            ZStack {
                Rectangle().fill(RT.ctaGrad(CGSize(width: 1024, height: 1024)))
                RTIcon([
                    "M12 5.8C9.6 4.2 6.5 3.8 3.6 4.5v14.2c2.9-.7 6-.3 8.4 1.3 2.4-1.6 5.5-2 8.4-1.3V4.5c-2.9-.7-6-.3-8.4 1.3z",
                    "M12 5.8v14.2",
                ], size: 620, stroke: RT.ctaText, lineWidth: 1.6, cap: .butt, join: .round)
            }
            .frame(width: 1024, height: 1024)
        )
    }

    // 잠금 화면 Live Activity 배너 렌더 (위젯이 쓰는 그 뷰) — la-rec / la-paused.
    // startedAt 은 고정 기준시각(rtshot 은 Date.now 불가) → 기록중은 26:14 경과로 표시.
    @MainActor
    public static func liveActivityView(paused: Bool) -> AnyView {
        let ref = Date(timeIntervalSinceReferenceDate: 800_000_000) // 고정
        return AnyView(
            RTLiveActivityLockView(
                bookTitle: "몰입",
                paused: paused,
                startedAt: ref,
                pausedElapsed: RTAppModel.demoElapsed,
                staticElapsed: RTAppModel.demoElapsed   // 헤드리스: 26:14 고정 표시
            )
            .frame(width: 390, height: 96)
            .background(Color(red: 0.075, green: 0.11, blue: 0.09))
        )
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

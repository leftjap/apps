import SwiftUI

// 앱 루트 — 라우트 스위치 + 시트 레이어 + 1초 틱. 인터랙션 정본 prototype/app.js 의
// render()/renderSheet() 대응. 화면 뷰는 model 을 주입받아 렌더만 한다 (nil = 정적 데모).
public struct RTRootView: View {
    @ObservedObject var model: RTAppModel
    // static 필수: 인스턴스 프로퍼티면 부모 재평가로 struct 재생성 시마다 새 타이머가 만들어져
    // 1초를 채우지 못하고 리셋된다 (시뮬 합성모션 검증에서 발견)
    private static let sharedTicker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let ticker = RTRootView.sharedTicker

    // 스와이프 뒤로가기 (today 제스처 질감 포팅 — RTSwipeBack)
    @State private var swipeX: CGFloat = 0
    @State private var swipeDecision: RTSwipeBack.Decision?

    public init(model: RTAppModel) {
        self.model = model
    }

    /// 좌→우 스와이프의 뒤로가기 목적지 (헤더 back 버튼과 동일 매핑). nil = 스와이프 없음.
    private var backRoute: RTRoute? {
        guard model.sheet == nil, model.statsSheet == nil, !model.mapFullscreen else { return nil }
        switch model.route {
        case .detail: return model.detailOrigin
        case .library, .stats: return .home
        default: return nil
        }
    }

    public var body: some View {
        ZStack {
            if let back = backRoute, swipeX > 0 {
                // 뒤 화면: iOS 내비 팝 질감 — 30% 시차 + 걷히는 딤
                screenView(back)
                    .offset(x: (swipeX - 390) * 0.3)
                Color.black.opacity(0.10 * Double(1 - swipeX / 390))
                    .allowsHitTesting(false)
            }
            screen
                .offset(x: swipeX)
                .shadow(color: Color.black.opacity(swipeX > 0 ? 0.18 : 0), radius: 14, x: -5, y: 0)
            if let sheet = model.sheet {
                sheetDim(sheet)
                    .contentShape(Rectangle())
                    .onTapGesture { model.closeSheet() }
                sheetView(sheet)
                    .rtSheetUp()
            }
            // 기록 원페이지 — 전체 화면 지도(원페이지 위) + 바텀시트(지도 위에도 겹침)
            if model.route == .stats && model.mapFullscreen {
                RTMapFullscreen(model: model)
            }
            if model.route == .stats, let data = model.statsSheetData {
                Color(hex: 0x17120C, alpha: 0.42)
                    .contentShape(Rectangle())
                    .onTapGesture { model.statsCloseSheet() }
                RTStatsSheetView(sheet: data, ds: model.statsDataset, model: model)
                    .frame(maxHeight: .infinity, alignment: .bottom)
            }
        }
        .frame(width: 390, height: 844)
        .simultaneousGesture(backRoute == nil ? nil : swipeBack)
        .onReceive(ticker) { _ in
            // app.js startTick: 04·05 에서 recording 일 때만
            if model.route == .flipTimer || model.route == .tapTimer { model.tick() }
        }
    }

    private var swipeBack: some Gesture {
        DragGesture(minimumDistance: RTSwipeBack.decidePt)
            .onChanged { v in
                if swipeDecision == nil {
                    swipeDecision = RTSwipeBack.classify(dx: v.translation.width, dy: v.translation.height)
                }
                if swipeDecision == .active {
                    swipeX = max(0, v.translation.width)   // 손가락 1:1 추적
                }
            }
            .onEnded { v in
                let decided = swipeDecision
                swipeDecision = nil
                guard decided == .active, let back = backRoute else {
                    if swipeX != 0 { withAnimation(Self.swipeCurve) { swipeX = 0 } }
                    return
                }
                // 관성: predictedEnd 로 릴리즈 속도 근사 (pt/s)
                let velocity = (v.predictedEndTranslation.width - v.translation.width) * 4
                if RTSwipeBack.shouldPop(dx: swipeX, width: 390, velocity: velocity) {
                    withAnimation(Self.swipeCurve) { swipeX = 390 }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
                        model.nav(back)
                        swipeX = 0
                    }
                } else {
                    withAnimation(Self.swipeCurve) { swipeX = 0 }
                }
            }
    }

    private static let swipeCurve = Animation.timingCurve(
        RTSwipeBack.curve.0, RTSwipeBack.curve.1, RTSwipeBack.curve.2, RTSwipeBack.curve.3,
        duration: 0.26)

    @ViewBuilder private var screen: some View {
        screenView(model.route)
    }

    @ViewBuilder private func screenView(_ route: RTRoute) -> some View {
        switch route {
        case .login: Screen01Login(model: model)
        case .home:
            // 종이책이 없어도 최근 밀리 카드가 있으면 홈 캐러셀을 보여준다.
            // 실앱에서 종이+밀리 카드가 모두 없을 때만 빈 홈(14), 데모 경로는 항상 02.
            if model.userData != nil, model.homeCards.isEmpty {
                Screen14EmptyHome(model: model)
            } else {
                Screen02Home(model: model)
            }
        case .flipWait: Screen03FlipWait(model: model)
        case .flipTimer: Screen04FlipPaused(model: model)
        case .tapTimer: Screen05TapRecording(model: model)
        case .done: Screen06Done(model: model)
        case .detail: Screen08Detail(model: model)
        case .stats: ScreenStats(model: model)
        case .library: Screen12Library(model: model)
        case .emptyHome: Screen14EmptyHome(model: model)
        }
    }

    // app.js renderSheet: finish 만 #191510/.42, 나머지 #17120C/.4
    private func sheetDim(_ sheet: RTSheet) -> Color {
        sheet == .finish ? Color(hex: 0x191510, alpha: 0.42)
                         : Color(hex: 0x17120C, alpha: 0.4)
    }

    @ViewBuilder private func sheetView(_ sheet: RTSheet) -> some View {
        switch sheet {
        case .addtime: Sheet07AddTime(model: model)
        case .finish: Sheet09Finish(model: model)
        case .addbook: Sheet13AddBook(model: model)
        case .settings: SheetSettings(model: model)
        case .sort: SheetSort(model: model)
        case .bookmenu: SheetBookMenu(model: model)
        }
    }
}

// 캐노니컬 14화면 시드 — 정적 레지스트리와 액션 경로가 같은 렌더를 내야 한다는 오라클.
// rtshot --app <NN> 은 이 시드로 RTRootView 를 렌더 → 정적 RTScreens.view(id:) 와 픽셀 대조.
public extension RTAppModel {
    @MainActor
    static func seeded(_ id: String, tapScheduler: RTTapScheduler = RTDispatchTapScheduler()) -> RTAppModel? {
        let m = RTAppModel(tapScheduler: tapScheduler)
        switch id {
        case "01": break
        case "02": m.login()
        case "03": m.login(); m.start()
        case "04": m.login(); m.simFlip(); m.togglePause()
        case "05": m.login(); m.setMode(.tap); m.start()
        case "06": m.login(); m.simFlip(); m.endSession()
        case "07", "09", "13": m.login(); m.navScreenID(id)
        case "08": m.login(); m.nav(.detail)
        case "10": m.login(); m.nav(.stats)
        case "12": m.login(); m.nav(.library)
        case "14": m.login(); m.nav(.emptyHome)
        default: return nil
        }
        return m
    }
}

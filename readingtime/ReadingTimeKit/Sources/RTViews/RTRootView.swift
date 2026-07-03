import SwiftUI

// 앱 루트 — 라우트 스위치 + 시트 레이어 + 1초 틱. 인터랙션 정본 prototype/app.js 의
// render()/renderSheet() 대응. 화면 뷰는 model 을 주입받아 렌더만 한다 (nil = 정적 데모).
public struct RTRootView: View {
    @ObservedObject var model: RTAppModel
    // static 필수: 인스턴스 프로퍼티면 부모 재평가로 struct 재생성 시마다 새 타이머가 만들어져
    // 1초를 채우지 못하고 리셋된다 (시뮬 합성모션 검증에서 발견)
    private static let sharedTicker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private let ticker = RTRootView.sharedTicker

    public init(model: RTAppModel) {
        self.model = model
    }

    public var body: some View {
        ZStack {
            screen
            if let sheet = model.sheet {
                sheetDim(sheet)
                    .contentShape(Rectangle())
                    .onTapGesture { model.closeSheet() }
                sheetView(sheet)
                    .rtSheetUp()
            }
        }
        .frame(width: 390, height: 844)
        .onReceive(ticker) { _ in
            // app.js startTick: 04·05 에서 recording 일 때만
            if model.route == .flipTimer || model.route == .tapTimer { model.tick() }
        }
    }

    @ViewBuilder private var screen: some View {
        switch model.route {
        case .login: Screen01Login(model: model)
        case .home: Screen02Home(model: model)
        case .flipWait: Screen03FlipWait(model: model)
        case .flipTimer: Screen04FlipPaused(model: model)
        case .tapTimer: Screen05TapRecording(model: model)
        case .done: Screen06Done(model: model)
        case .detail: Screen08Detail(model: model)
        case .statsWeek: Screen10Stats(model: model)
        case .statsMonth: Screen11Month(model: model)
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
        case "10": m.login(); m.nav(.statsWeek)
        case "11": m.login(); m.nav(.statsMonth)
        case "12": m.login(); m.nav(.library)
        case "14": m.login(); m.nav(.emptyHome)
        default: return nil
        }
        return m
    }
}

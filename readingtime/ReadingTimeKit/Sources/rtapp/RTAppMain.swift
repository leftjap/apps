import SwiftUI
import RTViews
import ReadingTimeKit

// 데모 셸 배선 — 인터랙션은 전부 RTAppModel(정본 prototype/app.js), 여기선 실서비스 연결만.
@MainActor
enum RTAppWiring {
    static func makeModel(cloud: CloudStore) -> RTAppModel {
        let model = RTAppModel()
        let aladin = AladinClient()

        // 시트 13 라이브 검색 — 배포 프록시 (Origin 게이트는 AladinClient 가 처리)
        model.searchProvider = { query in
            try await aladin.search(query: query, maxResults: 10).map {
                RTBookHit(title: $0.title, author: Aladin.cleanAuthor($0.author),
                          publisher: $0.publisher, isbn: $0.isbn, coverUrl: $0.coverUrl)
            }
        }

        // 밀리 편입 직후 알라딘 ISBN 매칭 (iOS 앱과 동일 배선 — 실패 시 밀리 키로 운영)
        model.onMillieAdopted = { [weak model] key in
            Task { @MainActor in await model?.matchAdoptedMillieBook(key) }
        }

        // 저장하기 → readingtime_daily 오늘치 upsert (로그인돼 있을 때만 실쓰기)
        model.onSessionSaved = { mode, seconds in
            Task {
                try? await cloud.addPaperSeconds(seconds, source: mode == .flip ? .flip : .tap, on: Date())
            }
        }
        return model
    }
}

struct RTAppMain: App {
    @StateObject private var model: RTAppModel
    private let cloud: CloudStore

    init() {
        let regErrors = RTFonts.register()
        if !regErrors.isEmpty {
            FileHandle.standardError.write(("폰트 등록 실패: " + regErrors.joined(separator: "; ") + "\n").data(using: .utf8)!)
        }
        let cloud = CloudStore()
        self.cloud = cloud
        let model = RTAppWiring.makeModel(cloud: cloud)
        // --seq "login,simFlip": 지정 상태로 시작 (데모·검증용)
        let args = CommandLine.arguments
        if let i = args.firstIndex(of: "--seq"), args.count > i + 1 {
            args[i + 1].split(separator: ",").forEach { model.apply(String($0)) }
        }
        _model = StateObject(wrappedValue: model)
    }

    var body: some Scene {
        WindowGroup("리딩타임") {
            RTRootView(model: model)
                .rtMotion(true)
                .frame(width: 390, height: 844)
                .task { await cloud.restore() }
        }
        .windowResizability(.contentSize)
    }
}

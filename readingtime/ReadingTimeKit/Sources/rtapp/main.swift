import Foundation
import RTViews
import ReadingTimeKit

// rtapp — macOS 데모 셸.
// 사용: rtapp                     → 390×844 창 실행 (모션 on, 알라딘 라이브 검색)
//       rtapp --verify-search 몰입 → 헤드리스: 모델 배선 경유 라이브 검색 검증 후 종료

let arguments = CommandLine.arguments

if let i = arguments.firstIndex(of: "--verify-search") {
    let query = arguments.count > i + 1 ? arguments[i + 1] : "몰입"
    Task { @MainActor in
        let model = RTAppWiring.makeModel(cloud: CloudStore())
        await model.search(query)
        guard let hits = model.searchResults, !hits.isEmpty else {
            FileHandle.standardError.write("검색 결과 없음 — 배선 실패\n".data(using: .utf8)!)
            exit(1)
        }
        for h in hits {
            print("\(h.isbn) | \(h.title) | \(h.author) | \(h.publisher) | \(h.coverUrl)")
        }
        exit(0)
    }
    RunLoop.main.run()
} else {
    RTAppMain.main()
}

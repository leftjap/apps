import Foundation
import RTViews
import ReadingTimeKit

// rtapp — macOS 데모 셸.
// 사용: rtapp                       → 390×844 창 실행 (모션 on, 알라딘 라이브 검색)
//       rtapp --seq "login,simFlip" → 지정 상태로 시작 (rtshot --seq 와 동일 액션 문법)
//       rtapp --verify-search 몰입  → 헤드리스: 모델 배선 경유 라이브 검색 검증 후 종료

let arguments = CommandLine.arguments

// 밀리 서재 편입 → 실 알라딘 ISBN 매칭 파이프라인 검증 (2026-09-01) — 헤드리스로
// 편입 전/후 키를 출력하고, 실 ISBN 으로 올라가면 0, 밀리 키로 남으면 2 를 반환한다.
if let i = arguments.firstIndex(of: "--verify-millie-match") {
    let title = arguments.count > i + 1 ? arguments[i + 1] : "삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"
    Task { @MainActor in
        let model = RTAppWiring.makeModel(cloud: CloudStore())
        model.apply("login")
        model.apply("demoCards")
        model.finishEbook(title)
        guard let before = model.userData?.books.first(where: { $0.millieBookId != nil && $0.title == title }) else {
            FileHandle.standardError.write("편입 실패\n".data(using: .utf8)!)
            exit(1)
        }
        print("편입:   \(before.isbn) | \(before.author) | \(before.publisher)")
        await model.matchAdoptedMillieBook(before.isbn)
        let after = model.userData?.books.first { $0.millieBookId != nil && $0.title == title }
        print("매칭후: \(after?.isbn ?? "-") | \(after?.author ?? "-") | \(after?.publisher ?? "-")")
        exit(after?.isbn.hasPrefix("millie:") == false ? 0 : 2)
    }
    RunLoop.main.run()
}

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

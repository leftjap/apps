import Testing
import Foundation
@testable import RTViews

// 밀리 숨김(홈에서 지움)·완독 표시를 서버 스냅샷에도 싣는다 (2026-11-08 검토).
// 예전엔 UserDefaults(rt.hiddenEbooks·rt.finishedEbooks)에만 있어, 기기를 바꾸고 서버에서 복원하면
// 지운 밀리 카드와 완독한 밀리 카드가 홈에 다시 떴다. readingtime_userdata.data 는 JSON 이라 SQL 변경은 없다.
@MainActor
@Suite struct RTEbookMarksSyncTests {
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func model() -> RTAppModel {
        let m = RTAppModel()
        m.now = { self.t0 }
        m.userData = RTUserData()
        return m
    }

    @Test func deleteIsSavedInSnapshot() {
        let m = model()
        var uploaded: RTUserData?
        m.onUserDataChange = { uploaded = $0 }
        m.deleteEbook("사피엔스")
        #expect(m.userData?.hiddenEbooks == ["사피엔스"])
        #expect(uploaded?.hiddenEbooks == ["사피엔스"], "스냅샷 변경이 업로드 훅을 거쳐야 서버에 간다")
    }

    @Test func finishAndRereadAreSavedInSnapshot() {
        let m = model()
        m.finishEbook("독학이라는 세계")
        #expect(m.userData?.finishedEbooks == ["독학이라는 세계": t0])
        m.selectedISBN = m.userData?.books.first?.isbn   // 완독 처리로 서재에 편입된 그 책
        m.rereadBook()
        #expect(m.userData?.finishedEbooks == nil, "다시 읽기로 지운 완독 표시가 스냅샷에 남으면 다른 기기에서 되살아난다")
    }

    @Test func restoreBringsMarksBack() async throws {
        let m = model()
        m.needsUserDataRestore = true
        var savedHidden: Set<String>?
        var savedFinished: [String: Date]?
        m.onHiddenEbooksChange = { savedHidden = $0 }
        m.onFinishedEbooksChange = { savedFinished = $0 }
        var server = RTUserData()
        server.hiddenEbooks = ["사피엔스"]
        server.finishedEbooks = ["독학이라는 세계": t0]
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        let json = String(decoding: try enc.encode(server), as: UTF8.self)
        try await m.restoreUserDataIfNeeded { json }
        #expect(m.hiddenEbooks == ["사피엔스"])
        #expect(m.finishedEbooks == ["독학이라는 세계": t0])
        #expect(savedHidden == ["사피엔스"] && savedFinished == ["독학이라는 세계": t0], "새 기기의 로컬에도 남긴다")
    }

    @Test func launchMergeCopiesLocalMarksIntoSnapshot() {
        // 업데이트 직후 첫 실행 — 표시가 UserDefaults 에만 있다
        let m = model()
        m.hiddenEbooks = ["사피엔스"]
        m.finishedEbooks = ["독학이라는 세계": t0]
        m.mergeEbookMarks()
        #expect(m.userData?.hiddenEbooks == ["사피엔스"])
        #expect(m.userData?.finishedEbooks == ["독학이라는 세계": t0])
    }

    @Test func launchMergeKeepsNewerFinishTime() {
        let m = model()
        m.finishedEbooks = ["독학이라는 세계": t0]
        m.userData?.finishedEbooks = ["독학이라는 세계": t0.addingTimeInterval(60)]
        m.mergeEbookMarks()
        #expect(m.finishedEbooks["독학이라는 세계"] == t0.addingTimeInterval(60))
    }

    @Test func oldSnapshotWithoutMarksStillDecodes() throws {
        let json = #"{"books":[],"sessions":[]}"#
        let d = try JSONDecoder().decode(RTUserData.self, from: Data(json.utf8))
        #expect(d.hiddenEbooks == nil && d.finishedEbooks == nil)
        let out = String(decoding: try JSONEncoder().encode(RTUserData()), as: UTF8.self)
        #expect(!out.contains("hiddenEbooks") && !out.contains("finishedEbooks"), "표시가 없으면 스냅샷 모양은 예전 그대로")
    }
}

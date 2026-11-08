import Testing
import Foundation
@testable import RTViews

// 스냅샷 업로드 — 2026-11-08 검토: 변경마다 Task { try? upload } 를 따로 띄워 (1) 실패가 화면에 안 보였고
// (2) 늦게 끝난 옛 스냅샷이 새 스냅샷을 서버에서 덮을 수 있었다. 업로더는 한 번에 하나만 올리고, 기다리는 동안
// 들어온 것 중 마지막 것만 이어서 올린다.
@MainActor
@Suite struct RTSnapshotUploaderTests {
    final class Recorder {
        var sent: [String] = []
        var results: [Bool] = []
        var gate: CheckedContinuation<Void, Never>?
        var failNext = false
    }

    @Test func latestSnapshotWinsWhileUploading() async {
        let r = Recorder()
        let up = RTSnapshotUploader(upload: { json in
            r.sent.append(json)
            if json == "1" { await withCheckedContinuation { r.gate = $0 } }   // 첫 업로드가 오래 걸린다
        }, onResult: { r.results.append($0) })
        up.submit("1")
        await Task.yield()
        up.submit("2")
        up.submit("3")
        while r.gate == nil { await Task.yield() }
        r.gate?.resume()
        await up.idle()
        #expect(r.sent == ["1", "3"], "기다리는 동안 들어온 2 는 3 에 덮였다 — 서버 순서도 1 → 3")
        #expect(r.results == [true, true])
    }

    @Test func failureIsReported() async {
        let r = Recorder()
        let up = RTSnapshotUploader(upload: { _ in throw URLError(.notConnectedToInternet) },
                                    onResult: { r.results.append($0) })
        up.submit("1")
        await up.idle()
        #expect(r.results == [false])
    }

    @Test func modelKeepsFirstFailureTimeUntilSuccess() {
        let m = RTAppModel()
        let t0 = Date(timeIntervalSince1970: 1000)
        m.now = { t0 }
        m.noteSyncResult(false)
        m.now = { t0.addingTimeInterval(600) }
        m.noteSyncResult(false)
        #expect(m.syncFailedAt == t0, "언제부터 못 올렸는지가 보여야 한다")
        m.noteSyncResult(true)
        #expect(m.syncFailedAt == nil)
    }
}

import Foundation

/// 내 RTUserData 스냅샷 업로드를 한 줄로 세운다 — 한 번에 하나만 올리고, 올리는 동안 들어온 것 중 마지막 것만 이어서 올린다.
/// 2026-11-08 검토: 변경마다 `Task { try? upload }` 를 따로 띄워 실패가 화면에 안 보였고, 늦게 끝난 옛 스냅샷이
/// 새 스냅샷을 서버에서 덮을 수 있었다(서버 행은 사용자당 하나라 마지막 쓰기가 남는다).
@MainActor
public final class RTSnapshotUploader {
    private let upload: @MainActor (String) async throws -> Void
    private let onResult: @MainActor (Bool) -> Void
    private var pending: String?
    private var worker: Task<Void, Never>?

    public init(upload: @escaping @MainActor (String) async throws -> Void,
                onResult: @escaping @MainActor (Bool) -> Void) {
        self.upload = upload
        self.onResult = onResult
    }

    public func submit(_ json: String) {
        pending = json
        guard worker == nil else { return }
        worker = Task { @MainActor in
            while let json = self.pending {
                self.pending = nil
                do { try await self.upload(json); self.onResult(true) } catch { self.onResult(false) }
            }
            self.worker = nil
        }
    }

    /// 진행 중·대기 중 업로드가 모두 끝날 때까지 기다린다 (검증용)
    func idle() async { while let w = worker { await w.value } }
}

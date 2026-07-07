import SwiftUI
import GymCore
#if canImport(UIKit)
import UIKit
#endif

// 앱 상태 — 라우팅 + 세션 상태머신 (PWA app.js·session.js 이식). 화면이 이 모델을 구동한다.
public enum GymRoute: Equatable { case home, session, stats, summary, admin }

@MainActor
public final class GymAppModel: ObservableObject {
    @Published public var route: GymRoute = .home
    @Published public var session: GymSession = GymAppModel.demoSession()
    public var statsInitialTab: StatsScreenView.Tab = .cal   // 검증 훅용 초기 탭

    public init() {}

    public static func statsTab(_ s: String) -> StatsScreenView.Tab? { StatsScreenView.Tab(rawValue: s) }

    public func startSession() { route = .session }
    public func goHome() { route = .home }
    public func openStats() { route = .stats }
    public func openAdmin() { route = .admin }

    // MARK: - 세션 상태머신 (session.js 이식)

    // 현재 블록 = 미완료(세트 중 하나라도 미완료) 첫 블록.
    public var currentBlockIdx: Int {
        session.blocks.firstIndex { blk in blk.sets.contains { !$0.done } } ?? max(0, session.blocks.count - 1)
    }
    public var currentBlock: GymBlock? {
        session.blocks.indices.contains(currentBlockIdx) ? session.blocks[currentBlockIdx] : nil
    }
    // 현재 세트 = 현재 블록의 첫 미완료 세트.
    public var currentSetIdx: Int {
        currentBlock?.sets.firstIndex { !$0.done } ?? 0
    }
    public var currentSet: GymSet? {
        guard let b = currentBlock, b.sets.indices.contains(currentSetIdx) else { return nil }
        return b.sets[currentSetIdx]
    }

    // 세션 볼륨 = 전 블록 완료 세트 볼륨 합 / 계획 볼륨 합.
    public var sessionDoneVolume: Double { blockVols { $0.done } }
    public var sessionTotalVolume: Double { blockVols { _ in true } }
    public var sessionPct: Int {
        sessionTotalVolume > 0 ? Int((sessionDoneVolume / sessionTotalVolume * 100).rounded()) : 0
    }
    private func blockVols(_ pred: (GymSet) -> Bool) -> Double {
        session.blocks.reduce(0) { acc, b in
            acc + b.sets.filter(pred).reduce(0) { $0 + Double($1.weight ?? 0) * Double($1.reps ?? 0) }
        }
    }

    // 세트 완료 = 현재 세트 done → 다음 세트/블록 진행 + 햅틱.
    public func completeCurrentSet() {
        let bi = currentBlockIdx, si = currentSetIdx
        guard session.blocks.indices.contains(bi), session.blocks[bi].sets.indices.contains(si) else { return }
        session.blocks[bi].sets[si].done = true
        impact(.medium)
    }
    // 현재 세트 중량 증감 (탭 델타).
    public func adjustCurrentWeight(_ delta: Double) {
        let bi = currentBlockIdx, si = currentSetIdx
        guard session.blocks.indices.contains(bi), session.blocks[bi].sets.indices.contains(si) else { return }
        let cur = session.blocks[bi].sets[si].weight ?? 0
        session.blocks[bi].sets[si].weight = max(0, cur + delta)
        impact(.light)
    }

    #if canImport(UIKit)
    private func impact(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
    #else
    private enum Dummy { case light, medium }
    private func impact(_ style: Dummy) {}
    #endif

    // 데모 진행 중 세션 (실 데이터 배선 전 시드 — session.js 시연값 정합).
    static func demoSession() -> GymSession {
        GymSession(id: "demo", date: "2026-05-06", startTime: 0, blocks: [
            GymBlock(exerciseId: "체스트 프레스", sets: [
                GymSet(weight: 50, reps: 10, done: true), GymSet(weight: 50, reps: 10, done: true),
                GymSet(weight: 50, reps: 8, done: true)], finishedAt: 1),
            GymBlock(exerciseId: "벤치프레스", sets: [
                GymSet(weight: 60, reps: 10, done: true), GymSet(weight: 65, reps: 10, done: true),
                GymSet(weight: 70, reps: 8, done: false), GymSet(weight: 72, reps: 8, done: false),
                GymSet(weight: 75, reps: 6, done: false)]),
            GymBlock(exerciseId: "인클라인 덤벨 프레스", sets: [
                GymSet(weight: 22, reps: 10, done: false), GymSet(weight: 22, reps: 10, done: false)]),
            GymBlock(exerciseId: "케이블 플라이", sets: [
                GymSet(weight: 20, reps: 12, done: false), GymSet(weight: 20, reps: 12, done: false)]),
        ], tags: ["chest"], status: .active)
    }
}

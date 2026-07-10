import Foundation
import Testing
@testable import GymCore

// 꾹누르기 액션시트 항목 + 현재 블록 판정 — PWA session.js getActionMenuFor / currentBlock 정합.
@Suite struct BlockActionTests {

    func blk(_ ex: String, done: Bool, finishedAt: Double? = nil) -> GymBlock {
        GymBlock(exerciseId: ex, sets: [GymSet(weight: 50, reps: 10, done: done)], finishedAt: finishedAt)
    }
    func sess(_ blocks: [GymBlock]) -> GymSession {
        GymSession(id: "s", date: "2026-07-10", blocks: blocks, status: .active)
    }

    // MARK: 액션시트 (session.js:1943 — '이동' 은 제거됨, hold+drag 로 대체)

    @Test func activeBlockOffersFinishAndDelete() {
        #expect(GymSessionLogic.blockActions(state: .current) == [.finish, .delete])
    }
    @Test func completedBlockOffersEditAndDelete() {
        #expect(GymSessionLogic.blockActions(state: .done) == [.edit, .delete])
    }
    @Test func upcomingBlockOffersDeleteOnly() {
        #expect(GymSessionLogic.blockActions(state: .upcoming) == [.delete])
    }
    @Test func noStateEverOffersMove() {
        for s in [GymSessionLogic.GymRailState.current, .done, .upcoming] {
            #expect(!GymSessionLogic.blockActions(state: s).contains { $0.rawValue == "move" })
        }
    }

    // MARK: 현재 블록 (전부 완료면 nil — 마지막 블록으로 되돌아가지 않는다)

    @Test func activeIdxIsFirstUnfinished() {
        let s = sess([blk("a", done: true, finishedAt: 1), blk("b", done: false)])
        #expect(GymSessionLogic.activeBlockIdx(session: s, selected: nil) == 1)
    }
    @Test func activeIdxIsNilWhenEveryBlockDone() {
        let s = sess([blk("a", done: true, finishedAt: 1), blk("b", done: true, finishedAt: 2)])
        #expect(GymSessionLogic.activeBlockIdx(session: s, selected: nil) == nil)
    }
    @Test func explicitSelectionWins() {
        let s = sess([blk("a", done: true, finishedAt: 1), blk("b", done: false)])
        #expect(GymSessionLogic.activeBlockIdx(session: s, selected: 0) == 0)
    }
    @Test func outOfRangeSelectionFallsBack() {
        let s = sess([blk("a", done: false)])
        #expect(GymSessionLogic.activeBlockIdx(session: s, selected: 9) == 0)
    }

    // MARK: 레일 — 전부 완료면 current 칩 없음 (전부 체크)

    @Test func railShowsAllDoneWhenSessionComplete() {
        let s = sess([blk("a", done: true, finishedAt: 1), blk("b", done: true, finishedAt: 2)])
        let idx = GymSessionLogic.activeBlockIdx(session: s, selected: nil)
        let items = GymSessionLogic.footerOrder(blocks: s.blocks, currentIdx: idx ?? -1)
        #expect(items.map(\.state) == [.done, .done])
        #expect(!items.contains { $0.state == .current })
    }
}

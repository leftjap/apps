import Foundation
import Testing
@testable import GymCore

// 하단 운동종목 레일 순서 — PWA session.js computeFooterOrder 정합.
// [완료(finishedAt 오름차순) · 현재 · 예정(원래순)] · single 블록만 · 원본 인덱스 보존.
@Suite struct FooterOrderTests {

    func blk(_ ex: String, done: Bool, finishedAt: Double? = nil, type: String = "single") -> GymBlock {
        GymBlock(type: type, exerciseId: ex,
                 sets: [GymSet(weight: 50, reps: 10, done: done)], finishedAt: finishedAt)
    }

    @Test func doneChipsMoveLeftInFinishOrderAndPendingRight() {
        let blocks = [
            blk("a", done: false),                  // 0 pending
            blk("b", done: true, finishedAt: 200),  // 1 done (나중)
            blk("c", done: false),                  // 2 current
            blk("d", done: true, finishedAt: 100),  // 3 done (먼저)
            blk("e", done: false),                  // 4 pending
        ]
        let out = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 2)
        #expect(out.map(\.index) == [3, 1, 2, 0, 4])
        #expect(out.map(\.state) == [.done, .done, .current, .upcoming, .upcoming])
    }

    @Test func currentBeatsDoneEvenIfAllSetsComplete() {
        let blocks = [blk("a", done: true, finishedAt: 10), blk("b", done: true, finishedAt: 20)]
        let out = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 1)
        #expect(out.map(\.index) == [0, 1])
        #expect(out.map(\.state) == [.done, .current])
    }

    @Test func partiallyDoneBlockIsUpcomingNotDone() {
        // PWA 'hold' — 시안·PWA 모두 예정(평면 아웃라인)과 같은 룩.
        var b = blk("a", done: false)
        b.sets = [GymSet(weight: 50, reps: 10, done: true), GymSet(weight: 50, reps: 10, done: false)]
        let out = GymSessionLogic.footerOrder(blocks: [b, blk("cur", done: false)], currentIdx: 1)
        #expect(out.map(\.index) == [1, 0])          // current 먼저, hold 는 pending 쪽
        #expect(out.map(\.state) == [.current, .upcoming])
    }

    @Test func nonSingleBlocksExcluded() {
        let out = GymSessionLogic.footerOrder(
            blocks: [blk("a", done: false), blk("x", done: false, type: "circuit")], currentIdx: 0)
        #expect(out.map(\.index) == [0])
    }

    @Test func noCurrentStillOrdersDoneBeforePending() {
        let blocks = [blk("a", done: false), blk("b", done: true, finishedAt: 5)]
        let out = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: -1)
        #expect(out.map(\.index) == [1, 0])
        #expect(out.map(\.state) == [.done, .upcoming])
    }
}

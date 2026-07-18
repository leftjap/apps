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

// 레일 스크롤 정렬 — 시안 #15a/#14a 렌더 + 레일 작업지시서 §7 "완료 종목이 왼쪽에 잘리지 않고 전부 보인다".
// PWA .fp-rail 은 재렌더마다 scrollLeft 가 0 으로 리셋되지만 SwiftUI ScrollView 는 오프셋을 유지한다
// → current 가 사라지는 순간(전 종목 완료) 선두로 되돌리지 않으면 완료 칩이 좌측으로 잘린다.
@Suite struct RailScrollTests {

    @Test func noCurrentScrollsToLeadingSoDoneChipsStayVisible() {
        let states: [GymSessionLogic.GymRailState] = [.done, .done, .done, .done]
        #expect(GymSessionLogic.railScrollTarget(states: states, currentChipMinX: 0,
                                                 currentChipMaxX: 0, viewportWidth: 300) == .leading)
    }

    // 완료 칩을 다 보여주는 건 하단 공간 낭비 — 우측 끝 16px 만 남겨 '완료가 있다' 신호만 주고
    // 남는 우측 공간을 예정 종목 노출에 쓴다. 현재 칩은 중앙이 아니라 좌측 railLeftInset 에 놓인다.
    @Test func doneChipsCollapseToRightSliverLeavingCurrentLeftBiased() {
        let states: [GymSessionLogic.GymRailState] = [.done, .done, .current, .upcoming]
        // 현재 칩 minX 200 · maxX 342 (폭 142) · 뷰포트 300
        let t = GymSessionLogic.railScrollTarget(states: states, currentChipMinX: 200,
                                                 currentChipMaxX: 342, viewportWidth: 300)
        // anchorX = 26 / (300 - 142) = 0.16455…
        #expect(t == .anchored(idx: 2, anchorX: 26.0 / 158.0))
    }

    // anchorX 수학 검증 — scrollTo(anchor:) 는 '아이템의 anchor 지점'과 '뷰포트의 같은 비율 지점'을 맞춘다.
    // scrollLeft = minX + a·w − a·vpW 이므로 minX − scrollLeft(= 좌측 여백)가 railLeftInset 이어야 한다.
    @Test func anchorMathPlacesCurrentChipAtLeftInset() {
        let minX = 200.0, w = 142.0, vpW = 300.0
        let target = GymSessionLogic.railScrollTarget(
            states: [.done, .current], currentChipMinX: minX,
            currentChipMaxX: minX + w, viewportWidth: vpW)
        guard case .anchored(_, let a) = target else {
            Issue.record("anchored 아님: \(String(describing: target))"); return
        }
        let scrollLeft = minX + a * w - a * vpW
        #expect(abs((minX - scrollLeft) - GymSessionLogic.railLeftInset) < 0.001)
    }

    // 완료 칩이 없으면 가릴 게 없다 — 선두 고정 (PWA clamp 0 정합).
    @Test func currentWithNoDoneChipsStaysLeading() {
        let states: [GymSessionLogic.GymRailState] = [.current, .upcoming, .upcoming]
        #expect(GymSessionLogic.railScrollTarget(states: states, currentChipMinX: 4,
                                                 currentChipMaxX: 146, viewportWidth: 300) == .leading)
    }

    // 폭 미측정(preference 전) — 중앙으로 튀었다가 되돌아오지 않게 좌측 밀착으로 두고,
    // 측정이 오면 onChange 가 inset 위치로 재정렬한다.
    @Test func unmeasuredChipFallsBackToFlushLeadingNotCenter() {
        let states: [GymSessionLogic.GymRailState] = [.done, .current]
        #expect(GymSessionLogic.railScrollTarget(states: states, currentChipMinX: 0,
                                                 currentChipMaxX: 0, viewportWidth: 300) == .anchored(idx: 1, anchorX: 0))
    }

    @Test func emptyRailHasNoTarget() {
        #expect(GymSessionLogic.railScrollTarget(states: [], currentChipMinX: 0,
                                                 currentChipMaxX: 0, viewportWidth: 300) == nil)
    }
}

// 종목 볼륨 링 중앙 % 글꼴 — 시안 #6b 는 상태별 두 값을 쓴다.
//   676행 미돌파: 숫자 15px/700 · '%' 10px/600
//   693행 돌파  : 숫자 13.5px/700 · '%' 9.5px/600  (3자리 대비 축소)
// letter-spacing 은 -0.02em 이므로 tracking = -0.02 × 숫자 크기.
@Suite struct ExRingPctFontTests {
    @Test func underTargetUsesLargeFont() {
        let f = GymSessionLogic.exRingPctFont(isOver: false)
        #expect(f.num == 15.0)
        #expect(f.unit == 10.0)
    }
    @Test func overTargetShrinksForThreeDigits() {
        let f = GymSessionLogic.exRingPctFont(isOver: true)
        #expect(f.num == 13.5)
        #expect(f.unit == 9.5)
    }
}

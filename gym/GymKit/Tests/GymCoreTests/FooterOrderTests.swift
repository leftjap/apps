import Foundation
import Testing
@testable import GymCore

// 하단 운동종목 레일 순서 — **완료는 좌측(완료순), 미완료·현재는 삽입 순서 유지** (사용자 2026-07-24).
// 두 규칙은 분리된다:
//  - 완료 처리는 '정리됨'을 위치로 표현 → 좌측으로 보낸다 (1,2,3 중 2 완료 → 2,1,3).
//  - 종목 전환(로테이션)은 자리를 바꾸지 않는다 → 재정렬·스크롤·승격 동시 발생의 혼란 방지.
// 구 동작(PWA computeFooterOrder)은 current 까지 pending 앞으로 당겨 로테이션에서 순서가 흔들렸다.
// 현재 칩의 좌측 쏠림은 railScrollTarget(스크롤)이 담당. single 블록만 · 원본 인덱스 보존.
@Suite struct FooterOrderTests {

    func blk(_ ex: String, done: Bool, finishedAt: Double? = nil, type: String = "single") -> GymBlock {
        GymBlock(type: type, exerciseId: ex,
                 sets: [GymSet(weight: 50, reps: 10, done: done)], finishedAt: finishedAt)
    }

    // 사용자 정본 예시(2026-07-24): 1,2,3 중 2 를 완료하면 2,1,3 — 완료만 좌측으로 이동하고
    // 남은 1,3 은 삽입 순서를 지킨다. a80de3f(삽입 순서 전면 고정)가 이 동작을 죽인 회귀 재현.
    @Test func finishedBlockMovesLeftWhileUnfinishedKeepOrder() {
        let blocks = [
            blk("a", done: false),                  // 0 pending (완료 후 current)
            blk("b", done: true, finishedAt: 100),  // 1 done → 좌측
            blk("c", done: false),                  // 2 pending
        ]
        let out = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 0)
        #expect(out.map(\.index) == [1, 0, 2])
        #expect(out.map(\.state) == [.done, .current, .upcoming])
    }

    @Test func doneChipsGoLeftInFinishOrderAndTheRestKeepInsertionOrder() {
        let blocks = [
            blk("a", done: false),                  // 0 pending
            blk("b", done: true, finishedAt: 200),  // 1 done (나중)
            blk("c", done: false),                  // 2 current
            blk("d", done: true, finishedAt: 100),  // 3 done (먼저)
            blk("e", done: false),                  // 4 pending
        ]
        let out = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 2)
        // 완료 둘은 완료순으로 좌측(3→1), 나머지는 삽입 순서(0,2,4) — current 를 pending 앞으로
        // 당기지 않는 게 구 동작([3,1,2,0,4])과의 차이 (로테이션 순서 보존).
        #expect(out.map(\.index) == [3, 1, 0, 2, 4])
        #expect(out.map(\.state) == [.done, .done, .upcoming, .current, .upcoming])
    }

    @Test func currentBeatsDoneEvenIfAllSetsComplete() {
        let blocks = [blk("a", done: true, finishedAt: 10), blk("b", done: true, finishedAt: 20)]
        let out = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 1)
        #expect(out.map(\.index) == [0, 1])
        #expect(out.map(\.state) == [.done, .current])
    }

    @Test func partiallyDoneBlockIsUpcomingNotDoneAndStaysPut() {
        // PWA 'hold' — 예정(평면 아웃라인)과 같은 룩. 자리도 그대로.
        var b = blk("a", done: false)
        b.sets = [GymSet(weight: 50, reps: 10, done: true), GymSet(weight: 50, reps: 10, done: false)]
        let out = GymSessionLogic.footerOrder(blocks: [b, blk("cur", done: false)], currentIdx: 1)
        #expect(out.map(\.index) == [0, 1])
        #expect(out.map(\.state) == [.upcoming, .current])
    }

    @Test func nonSingleBlocksExcluded() {
        let out = GymSessionLogic.footerOrder(
            blocks: [blk("a", done: false), blk("x", done: false, type: "circuit")], currentIdx: 0)
        #expect(out.map(\.index) == [0])
    }

    // 완료 칩을 탭해 열람하는 것만으로 순서가 흔들리면 안 된다 (감사 확정 #1).
    // 위치 그룹핑은 isBlockDone 만 보고, current 여부는 상태에만 반영한다.
    @Test func tappingDoneChipDoesNotReorderRail() {
        let blocks = [
            blk("bench", done: false),                  // 0
            blk("squat", done: true, finishedAt: 100),  // 1 완료
            blk("dead", done: false),                   // 2
        ]
        let base = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 0)
        #expect(base.map(\.index) == [1, 0, 2])   // 완료 좌측
        // 완료 칩(1) 을 탭해 선택 → 자리는 그대로, 상태만 current
        let tapped = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 1)
        #expect(tapped.map(\.index) == [1, 0, 2])
        #expect(tapped.map(\.state) == [.current, .upcoming, .upcoming])
        // 다른 미완료(2) 를 탭해도 순서 동일
        #expect(GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 2).map(\.index) == [1, 0, 2])
    }

    // finishedAt 없는 '암묵 완료'(전 세트 done)가 `?? 0` 때문에 완료군 맨 왼쪽으로 튀면 안 된다 (감사 확정 #15).
    // 명시 완료(스탬프 있음)보다 나중으로 두고, 암묵 완료끼리는 삽입 순서를 지킨다.
    @Test func implicitlyDoneBlockSortsAfterStampedOnes() {
        let blocks = [
            blk("implicit", done: true),                 // 0 완료(스탬프 없음)
            blk("stamped", done: true, finishedAt: 500), // 1 명시 완료
            blk("cur", done: false),                     // 2 current
        ]
        let out = GymSessionLogic.footerOrder(blocks: blocks, currentIdx: 2)
        #expect(out.map(\.index) == [1, 0, 2])
        #expect(out.map(\.state) == [.done, .done, .current])
    }

    @Test func noCurrentStillSendsDoneLeft() {
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

    // 현재 칩이 선두면 가릴 게 없다 — 선두 고정.
    @Test func currentAtFrontStaysLeading() {
        let states: [GymSessionLogic.GymRailState] = [.current, .upcoming, .upcoming]
        #expect(GymSessionLogic.railScrollTarget(states: states, currentChipMinX: 4,
                                                 currentChipMaxX: 146, viewportWidth: 300) == .leading)
    }

    // 삽입 순서 고정(2026-07-24) — 미완료 칩을 건너뛰고 뒤 종목을 현재로 잡아도(로테이션)
    // 현재 칩은 좌측 inset 에 앵커, 앞의 미완료 칩은 완료 칩과 똑같이 좌측으로 접힌다.
    @Test func currentBehindUnfinishedChipsStillAnchorsLeft() {
        let states: [GymSessionLogic.GymRailState] = [.upcoming, .current, .upcoming]
        let t = GymSessionLogic.railScrollTarget(states: states, currentChipMinX: 140,
                                                 currentChipMaxX: 282, viewportWidth: 300)
        #expect(t == .anchored(idx: 1, anchorX: 26.0 / 158.0))
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

// 트레일링 스페이서 — scrollTo 는 콘텐츠 끝을 넘어 스크롤하지 못한다(클램프). 세션 후반처럼
// 현재 칩 뒤에 예정 종목이 얼마 없으면 요청한 좌측 inset 까지 못 가고 완료 칩이 도로 드러난다.
// 시뮬 실측(iPhone 11 Pro, 375pt): 마지막 종목일 때 현재 칩 minX 161.7(기대 38) · 완료 칩 2개 노출.
// → 현재 칩 우측에 (뷰포트폭 − railLeftInset) 만큼의 콘텐츠가 늘 있도록 부족분만 채운다.
@Suite struct RailTrailingSpacerTests {

    // 예정 종목이 충분하면 스크롤 여유가 있다 — 스페이서 0 (기존 동작 불변).
    @Test func enoughUpcomingNeedsNoSpacer() {
        // 현재 칩 minX 200, 칩영역 폭 700 → 우측 잔여 500 ≥ 307 − 26
        #expect(GymSessionLogic.railTrailingSpacer(
            hasCurrent: true, currentChipMinX: 200, chipsMaxX: 700, viewportWidth: 307) == 0)
    }

    // 마지막 종목 — 우측 잔여가 현재 칩 폭뿐이라 부족분을 채워야 좌측 inset 정렬이 가능하다.
    @Test func lastBlockGetsSpacerSoCurrentCanReachLeftInset() {
        // 현재 칩 minX 767.7 · 칩영역 폭 913 → 우측 잔여 145.3, 필요 281 → 부족 135.7
        let s = GymSessionLogic.railTrailingSpacer(
            hasCurrent: true, currentChipMinX: 767.7, chipsMaxX: 913, viewportWidth: 307)
        #expect(abs(s - 135.7) < 0.01)
    }

    // 현재 칩이 없으면(전 종목 완료) 선두로 되돌리므로 여유가 필요 없다.
    @Test func noCurrentNeedsNoSpacer() {
        #expect(GymSessionLogic.railTrailingSpacer(
            hasCurrent: false, currentChipMinX: 0, chipsMaxX: 913, viewportWidth: 307) == 0)
    }

    // 미측정(스냅샷·첫 패스) — 뷰포트/칩폭이 0이면 스페이서도 0이라 레이아웃이 흔들리지 않는다.
    @Test func unmeasuredLayoutNeedsNoSpacer() {
        #expect(GymSessionLogic.railTrailingSpacer(
            hasCurrent: true, currentChipMinX: 0, chipsMaxX: 0, viewportWidth: 0) == 0)
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

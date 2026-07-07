import Testing
@testable import GymCore

// 세그먼트 기하 — session.js computeVolSegments 문서 예시(§5.1) 정합.
@Suite struct VolumeSegmentsTests {
    @Test func firstSegmentMatchesJSExample() {
        // 720/3020 → slot 23.97, arc 21.77, rot -90 (JS 주석 정본)
        let sets = [
            GymSet(weight: 72, reps: 10, done: true),   // 720
            GymSet(weight: 230, reps: 10, done: false),  // 2300 → planned 3020
        ]
        let (segs, planned) = VolumeRing.segments(sets, cur: 1)
        #expect(planned == 3020)
        #expect(segs[0].arc == 21.77)
        #expect(segs[0].rot == -90)
        #expect(segs[0].state == .done)
        #expect(segs[1].state == .active)
    }

    @Test func overflowArcWhenExceedingPrev() {
        let o = VolumeRing.overflow(exDoneVol: 1100, prevExVol: 1000)  // +10%
        #expect(o.isOver == true)
        #expect(o.overAmt == 100)
        #expect(o.arcDash > 0)
    }

    @Test func noOverflowUnderPrev() {
        let o = VolumeRing.overflow(exDoneVol: 800, prevExVol: 1000)
        #expect(o.isOver == false)
        #expect(o.arcDash == 0)
    }
}

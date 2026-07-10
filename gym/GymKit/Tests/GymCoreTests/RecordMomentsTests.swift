import Foundation
import Testing
@testable import GymCore

// 기록 돌파 "순간" 판정 — PWA session.js 1회성 트리거 조건 정합.
// ex: prevExNum < prevExVol && exDoneVol >= prevExVol / top: topBefore <= prev && after > prev.
@Suite struct RecordMomentsTests {

    @Test func exRecordCrossingBoundaries() {
        // 직전기록 100% 돌파 — after 는 이상(>=), before 는 미만(<)
        #expect(GymRecordMoments.exRecordCrossed(before: 1900, after: 2000, prevExVol: 2000))   // 정확히 도달
        #expect(GymRecordMoments.exRecordCrossed(before: 1900, after: 2100, prevExVol: 2000))
        #expect(!GymRecordMoments.exRecordCrossed(before: 2000, after: 2100, prevExVol: 2000))  // 이미 도달 상태
        #expect(!GymRecordMoments.exRecordCrossed(before: 1800, after: 1999, prevExVol: 2000))  // 미달
        #expect(!GymRecordMoments.exRecordCrossed(before: 1900, after: 2100, prevExVol: 0))     // 직전 없음
    }

    @Test func topRecordCrossingBoundaries() {
        // 세션 총볼륨 신기록 — after 는 초과(>), before 는 이하(<=)
        #expect(GymRecordMoments.topRecordCrossed(before: 6756, after: 6800, prevSessionVol: 6756))  // 동률에서 초과로
        #expect(!GymRecordMoments.topRecordCrossed(before: 6756, after: 6756, prevSessionVol: 6756)) // 동률 유지 = 미발화
        #expect(!GymRecordMoments.topRecordCrossed(before: 6800, after: 6900, prevSessionVol: 6756)) // 이미 초과 상태
        #expect(!GymRecordMoments.topRecordCrossed(before: 6000, after: 6900, prevSessionVol: 0))    // 직전 없음
    }
}

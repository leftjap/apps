import Foundation
import Testing
@testable import GymCore

// 8주 추이 차트 기하 — PWA `<svg viewBox="0 0 320 160" style="width:100%;height:150px">` 정합.
// SVG 기본 preserveAspectRatio="xMidYMid meet" = 균일 축소 + 좌우 레터박스.
// 이 매핑이 없으면 마지막 점(cx=320, r=4)이 컨테이너 우측에서 절반 잘린다 (실기기 2026-07-10 실측).
@Suite struct TrendChartGeometryTests {

    @Test func meetScaleLetterboxesHorizontally() {
        let m = GymTrendChart.fit(width: 312, height: 150)
        #expect(abs(m.scale - 0.9375) < 1e-9)     // min(312/320, 150/160)
        #expect(abs(m.offsetX - 6.0) < 1e-9)      // (312 - 320×0.9375) / 2
        #expect(abs(m.offsetY - 0.0) < 1e-9)
    }

    @Test func lastDotStaysInsideContainer() {
        let m = GymTrendChart.fit(width: 312, height: 150)
        let cx = m.x(320)                          // 마지막 점 (n=8 → i=7 → x = 7×(320/7))
        let r = m.len(4)
        #expect(cx + r <= 312.0)                   // 잘리지 않는다
        #expect(abs(cx - 306.0) < 1e-9)
        #expect(abs(r - 3.75) < 1e-9)
    }

    @Test func barGeometryMatchesPWA() {
        // n=8 → slot 40, barW 22, chartH 132
        let g = GymTrendChart.bar(index: 7, count: 8, value: 100, maxValue: 100)
        #expect(abs(g.width - 22.0) < 1e-9)
        #expect(abs(g.minX - (7 * 40 + (40 - 22) / 2)) < 1e-9)
        #expect(abs(g.height - 132.0) < 1e-9)      // ratio 1 → chartH
        #expect(abs(g.minY - 14.0) < 1e-9)         // padTop
    }

    @Test func zeroWeekGetsVisiblePlaceholderBar() {
        let g = GymTrendChart.bar(index: 0, count: 8, value: 0, maxValue: 5000)
        #expect(abs(g.height - 10.56) < 1e-9)      // max(8, 132×0.08)
    }

    @Test func nonZeroTinyBarHasFloorOfFour() {
        let g = GymTrendChart.bar(index: 0, count: 8, value: 1, maxValue: 100_000)
        #expect(abs(g.height - 4.0) < 1e-9)        // max(4, ratio×chartH)
    }

    @Test func linePointsSpanFullViewBoxWidth() {
        #expect(abs(GymTrendChart.point(index: 0, count: 8, value: 0, maxValue: 100).x - 0) < 1e-9)
        #expect(abs(GymTrendChart.point(index: 7, count: 8, value: 0, maxValue: 100).x - 320) < 1e-9)
        // 값 100/100 → y = padTop
        #expect(abs(GymTrendChart.point(index: 7, count: 8, value: 100, maxValue: 100).y - 14) < 1e-9)
    }
}

import Testing
@testable import RTViews

// rtCubicBezier — CSS cubic-bezier(x1,y1,x2,y2) 와 동일 정의(P0=(0,0), P3=(1,1))의 y(진행값) 평가.
// RTBookDropIn 의 고정-시간(rtshot --at) 검증 프레임이 실제 라이브 커브(오버슈트 포함)와
// 일치하도록 도입 — 기존 linear 근사는 y1=1.05 오버슈트를 재현하지 못했음.
@Suite struct RTMotionMathTests {
    @Test func endpointsAreExact() {
        #expect(rtCubicBezier(0.2, 1.05, 0.3, 1, at: 0) == 0)
        #expect(abs(rtCubicBezier(0.2, 1.05, 0.3, 1, at: 1) - 1) < 1e-6)
    }

    @Test func overshootsPastOneForBounceCurve() {
        // y1=1.05 오버슈트 커브 — 진행 중 y > 1 구간이 존재해야 함(스펙의 scale .9→1.02→1 바운스)
        let samples = stride(from: 0.0, through: 1.0, by: 0.02).map { rtCubicBezier(0.2, 1.05, 0.3, 1, at: $0) }
        #expect(samples.max()! > 1.0)
    }

    @Test func monotonicClampAtBounds() {
        // 범위 밖 progress 는 clamp
        #expect(rtCubicBezier(0.2, 1.05, 0.3, 1, at: -1) == 0)
        #expect(abs(rtCubicBezier(0.2, 1.05, 0.3, 1, at: 2) - 1) < 1e-6)
    }

    @Test func linearControlPointsProduceIdentity() {
        // x1=y1, x2=y2 인 대각선 컨트롤포인트 = 항등(y≈t)
        for t in stride(from: 0.0, through: 1.0, by: 0.1) {
            #expect(abs(rtCubicBezier(0.25, 0.25, 0.75, 0.75, at: t) - t) < 1e-4)
        }
    }
}

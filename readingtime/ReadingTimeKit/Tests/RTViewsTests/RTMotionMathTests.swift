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

    // rtBookFloatY — 책 부유 위상. RTBook3D 부유와 접지 그림자 동기가 같은 공식을 쓰도록
    // 단일 소스로 추출(이전엔 두 파일에 복제 → desync 위험, 리뷰 지적).
    @Test func floatYZeroAtOrigin() {
        #expect(rtBookFloatY(0) == 0)
    }
    @Test func floatYReachesAmplitude() {
        let peak = rtBookFloatY(Double.pi / 2 / 0.7)   // sin(π/2)=1 → +3.5
        #expect(abs(peak - 3.5) < 1e-6)
        let trough = rtBookFloatY(3 * Double.pi / 2 / 0.7)   // sin(3π/2)=-1 → -3.5
        #expect(abs(trough + 3.5) < 1e-6)
    }

    // rtCountUpValue — "오늘 읽음" 카운트업 값. RTMotionFrame 이 라이브에서 등장-후-경과초를
    // 넘기도록 고친 뒤, 이 순수 함수가 진행률→값을 담당(라이브 즉시-스냅 회귀 방지).
    @Test func countUpStartsAtZeroEndsAtTarget() {
        #expect(rtCountUpValue(32, elapsed: 0) == 0)
        #expect(rtCountUpValue(32, elapsed: 1.0) == 32)
        #expect(rtCountUpValue(32, elapsed: 5.0) == 32)   // 이후에도 목표 유지
    }
    @Test func countUpMidpointEaseOut() {
        // ease-out cubic: elapsed .5 → 32·(1-(.5)^3)=28
        #expect(rtCountUpValue(32, elapsed: 0.5) == 28)
    }
    @Test func countUpClampsNegative() {
        #expect(rtCountUpValue(32, elapsed: -1) == 0)
    }
}

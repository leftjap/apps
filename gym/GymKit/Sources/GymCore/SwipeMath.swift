import Foundation

// 히어로 스와이프 드래그 추종 수식 — PWA session.js wireSwipeHandlers 1:1 포팅 (작업지시서 §4 / FIG 2).
// 뷰 제스처 핸들러가 이 수식을 그대로 사용한다 (임계값 검증 가능하도록 분리).
public enum GymSwipeMath {

    // 드래그 engage — 수평 우세 + 8px 초과. 그 전엔 수직 스크롤(pan-y) 양보.
    public static func engaged(dx: Double, dy: Double) -> Bool {
        abs(dx) > 8 && abs(dx) > abs(dy)
    }

    // 히어로 추종 이동 — 우드래그 저항 ×0.25, 좌 -150 클램프.
    public static func heroTranslate(_ dx: Double) -> Double {
        var tx = dx
        if tx > 0 { tx *= 0.25 }
        return max(tx, -150)
    }

    // "완료" 칩 비례 노출 진행도 — p = min(1, max(0, -dx/90)).
    public static func revealProgress(_ dx: Double) -> Double {
        min(1, max(0, -dx / 90))
    }

    // 드래그 종료 판정 (spec §6-3-1) — 좌 -60 커밋 / 우 +60(수평 우세) 이전 수정 /
    // 미세 떨림(<10px) 탭 폴백 / 그 외 스프링백.
    public enum EndAction: Equatable, Sendable { case commit, revert, tap, springBack }
    public static func endAction(dx: Double, dy: Double) -> EndAction {
        if dx <= -60 { return .commit }
        if dx >= 60 && abs(dx) > abs(dy) { return .revert }
        if abs(dx) < 10 && abs(dy) < 10 { return .tap }
        return .springBack
    }
}

// MARK: - 히어로 탭 존 (§6-3 — 여백 탭 = 증감, 숫자 탭 = 키패드)

public extension GymSwipeMath {
    /// 중앙(키패드) 존 폭 — **숫자 폭에 맞춘다.**
    ///
    /// 종전엔 행 폭의 40% 고정이었다. 행 323pt 에서 129pt 인데, 횟수 숫자는 ~61pt 라 두 배로
    /// 넓어 여백을 눌러도 키패드가 열렸고(실기기 2026-08-23), 중량 숫자는 ~145pt 라 오히려
    /// 좁아 숫자 끝을 눌러도 증감이 됐다. 숫자에 맞추면 양쪽 다 해결된다.
    ///
    /// - 하한 44pt (한 자리 수에서도 누를 수 있게)
    /// - 상한 rowWidth − 좌우 증감 영역(각 44pt) — 여백 탭이 사라지지 않게
    static func heroCenterZone(numberWidth: Double, rowWidth: Double,
                               pad: Double = 8, minSide: Double = 44) -> Double {
        let wanted = numberWidth + pad * 2
        return Swift.min(Swift.max(wanted, 44), Swift.max(44, rowWidth - minSide * 2))
    }

    /// 좌/우 증감 존 폭 — 남는 폭을 반씩 나눠 중앙이 가운데에 놓인다.
    static func heroSideZone(center: Double, rowWidth: Double) -> Double {
        Swift.max(0, (rowWidth - center) / 2)
    }
}

import SwiftUI

// 폰트 헬퍼 — PostScript 이름은 gymshot --list-fonts 실측(2026-07-07).
// sans=Pretendard(정적 5종), mono=Space Grotesk(가변 named instance).
// paper.css --font-sans=Pretendard / --font-mono="Space Grotesk".
public extension Font {
    // Pretendard: Regular/Medium/SemiBold/Bold/ExtraBold (800). heavy(900) 미수급 → ExtraBold 사용.
    static func sans(_ size: CGFloat, _ weight: Int) -> Font {
        let name: String
        switch weight {
        case ..<450: name = "Pretendard-Regular"
        case ..<550: name = "Pretendard-Medium"
        case ..<650: name = "Pretendard-SemiBold"
        case ..<750: name = "Pretendard-Bold"
        default:     name = "Pretendard-ExtraBold"  // 800(현재카드)·900
        }
        return .custom(name, fixedSize: size)
    }

    // Space Grotesk 가변 — wght 축 정확 지정 + tabular_nums (GymMonoFont).
    // named instance 근사(600→700)·프로포셔널 숫자 폭 문제를 피한다. 시안 tabular-nums 정합.
    static func mono(_ size: CGFloat, _ weight: Int) -> Font {
        GymMonoFont.font(size: size, weight: weight)
    }
}

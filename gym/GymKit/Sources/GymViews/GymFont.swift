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

    // Space Grotesk 가변: 실측 인스턴스 Light(300)/Light_Regular(400)/Light_Medium(500)/Light_Bold(700).
    // 600 → Bold(700) 근사 (600 named instance 미노출).
    static func mono(_ size: CGFloat, _ weight: Int) -> Font {
        let name: String
        switch weight {
        case ..<350: name = "SpaceGrotesk-Light"
        case ..<450: name = "SpaceGrotesk-Light_Regular"
        case ..<550: name = "SpaceGrotesk-Light_Medium"
        default:     name = "SpaceGrotesk-Light_Bold"  // 600·700
        }
        return .custom(name, fixedSize: size)
    }
}

import SwiftUI

// 폰트 헬퍼 — PostScript 이름은 rtshot --list-fonts 실측(2026-07-02):
// 가변 NotoSansKR 의 named instance 가 "NotoSansKR-Thin_<Instance>" 로 등록됨.
public extension Font {
    static func sans(_ size: CGFloat, _ weight: Int) -> Font {
        let name: String
        switch weight {
        case ..<450: name = "NotoSansKR-Thin_Regular"
        case ..<550: name = "NotoSansKR-Thin_Medium"
        case ..<650: name = "NotoSansKR-Thin_SemiBold"
        case ..<750: name = "NotoSansKR-Thin_Bold"
        case ..<850: name = "NotoSansKR-Thin_ExtraBold"
        default: name = "NotoSansKR-Thin_Black"
        }
        return .custom(name, fixedSize: size)
    }

    static func mono(_ size: CGFloat, _ weight: Int) -> Font {
        let name: String
        switch weight {
        case ..<450: name = "IBMPlexMono-Regular"
        case ..<550: name = "IBMPlexMono-Medium"
        case ..<650: name = "IBMPlexMono-SemiBold"
        default: name = "IBMPlexMono-Bold"
        }
        return .custom(name, fixedSize: size)
    }

    static func poppins600(_ size: CGFloat) -> Font {
        .custom("Poppins-SemiBold", fixedSize: size)
    }
}

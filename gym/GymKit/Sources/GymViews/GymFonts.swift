import Foundation
import CoreText

// 번들 폰트 등록 (Pretendard sans + Space Grotesk mono). PostScript 이름은 gymshot --list-fonts 실측 확정.
public enum GymFonts {
    public private(set) static var registered = false

    @discardableResult
    public static func register() -> [String] {
        guard !registered else { return [] }
        var errors: [String] = []
        guard let dir = Bundle.module.resourceURL?.appendingPathComponent("Fonts"),
              let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return ["Fonts 리소스 없음 — fetch-fonts.sh 실행 필요"]
        }
        for url in files where ["ttf", "otf"].contains(url.pathExtension.lowercased()) {
            var err: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &err) {
                errors.append("\(url.lastPathComponent): \(err?.takeRetainedValue().localizedDescription ?? "?")")
            }
        }
        registered = errors.isEmpty
        return errors
    }

    // 등록된 face PostScript 이름 나열 (검증용).
    public static func faces(matching families: [String]) -> [String] {
        let collection = CTFontCollectionCreateFromAvailableFonts(nil)
        guard let descs = CTFontCollectionCreateMatchingFontDescriptors(collection) as? [CTFontDescriptor] else { return [] }
        var out: [String] = []
        for d in descs {
            let fam = CTFontDescriptorCopyAttribute(d, kCTFontFamilyNameAttribute) as? String ?? ""
            let ps = CTFontDescriptorCopyAttribute(d, kCTFontNameAttribute) as? String ?? ""
            if families.contains(where: { fam.localizedCaseInsensitiveContains($0) }) {
                out.append("\(fam) | \(ps)")
            }
        }
        return Array(Set(out)).sorted()
    }
}

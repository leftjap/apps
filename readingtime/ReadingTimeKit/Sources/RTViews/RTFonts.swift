import Foundation
import CoreText
import SwiftUI

// 시안 웹폰트 등록 (Noto Sans KR 가변 + IBM Plex Mono 스태틱 + Poppins).
// PostScript 이름은 rtshot --list-fonts 실측으로 확정한다 — 추측 금지.
public enum RTFonts {
    public private(set) static var registered = false

    @discardableResult
    public static func register() -> [String] {
        guard !registered else { return [] }
        var errors: [String] = []
        let dir = Bundle.module.resourceURL?.appendingPathComponent("Fonts")
        guard let dir, let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else {
            return ["Fonts 리소스 없음 — fetch-fonts.sh 실행 필요"]
        }
        for url in files where url.pathExtension == "ttf" {
            var err: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &err) {
                errors.append("\(url.lastPathComponent): \(err?.takeRetainedValue().localizedDescription ?? "?")")
            }
        }
        registered = errors.isEmpty
        return errors
    }

    // 등록된 패밀리의 face PostScript 이름 나열 (검증용)
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
        return out.sorted()
    }
}

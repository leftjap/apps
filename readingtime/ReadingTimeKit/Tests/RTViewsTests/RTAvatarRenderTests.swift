import Testing
import Foundation
import SwiftUI
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
@testable import RTViews

// 아바타 사진이 실제로 그려지는지 픽셀로 확인 — 사진이 쓰이는 세 자리 전부.
// (홈 메뉴 40pt 는 menuOpen 이 @State 라 시뮬 --seq 로 못 열어서 여기서만 검증 가능)
// 오라클: 원본에 없는 순수 마젠타 사진을 넣고, 렌더 결과에 마젠타 픽셀이 있으면 사진이 그려진 것.

private let fontsRegistered: Bool = {
    _ = RTFonts.register()
    return true
}()

/// 단색 마젠타 PNG → prepareAvatar 를 거친 CGImage (앱이 싣는 것과 같은 경로)
@MainActor private func magentaAvatar() -> CGImage {
    let n = 64
    let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setFillColor(CGColor(red: 1, green: 0, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: n, height: n))
    let out = NSMutableData()
    let dest = CGImageDestinationCreateWithData(out, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
    return RTAppModel.prepareAvatar(out as Data)!.image
}

/// 뷰를 390×844 로 렌더해 마젠타 픽셀이 하나라도 있는지.
/// 렌더 실패는 false 가 아니라 nil — "사진 없음"과 구분해야 오라클이 조용히 무력화되지 않는다.
@MainActor private func rendersMagenta(_ view: some View) -> Bool? {
    _ = fontsRegistered
    let renderer = ImageRenderer(content: AnyView(view).frame(width: 390, height: 844))
    renderer.scale = 1
    renderer.proposedSize = ProposedViewSize(width: 390, height: 844)
    guard let cg = renderer.cgImage else { return nil }
    let w = cg.width, h = cg.height
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    let found: Bool? = buf.withUnsafeMutableBytes { raw in
        guard let ctx = CGContext(data: raw.baseAddress, width: w, height: h,
                                  bitsPerComponent: 8, bytesPerRow: w * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
                                      | CGBitmapInfo.byteOrder32Big.rawValue)
        else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        let px = raw.bindMemory(to: UInt8.self)
        // 순수 마젠타(255,0,255)는 sRGB 로 변환되며 G 가 64 까지 올라간다 (실측) → G 임계 100.
        // 시안 팔레트엔 R·B 가 동시에 200 을 넘는 색이 없어 오검출 없음.
        for i in stride(from: 0, to: px.count, by: 4) where px[i] > 200 && px[i + 1] < 100 && px[i + 2] > 200 {
            return true
        }
        return false
    }
    return found
}

@MainActor
@Suite struct RTAvatarRenderTests {
    /// 빈 홈 헤더 아바타 (34pt)
    @Test func emptyHomeShowsPhoto() {
        let m = RTAppModel()
        #expect(rendersMagenta(Screen14EmptyHome(model: m)) == false)
        m.avatarImage = magentaAvatar()
        #expect(rendersMagenta(Screen14EmptyHome(model: m)) == true)
    }

    /// 홈 설정 메뉴 프로필 헤더 (40pt) — 시뮬로는 열 수 없는 자리
    @Test func homeMenuProfileShowsPhoto() {
        let m = RTAppModel()
        #expect(rendersMagenta(Screen02Home(model: m, menuOpen: true)) == false)
        m.avatarImage = magentaAvatar()
        #expect(rendersMagenta(Screen02Home(model: m, menuOpen: true)) == true)
    }

    /// 설정 시트 사진 행 미리보기 (28pt)
    @Test func settingsSheetPreviewShowsPhoto() {
        let m = RTAppModel()
        #expect(rendersMagenta(SheetSettings(model: m)) == false)
        m.avatarImage = magentaAvatar()
        #expect(rendersMagenta(SheetSettings(model: m)) == true)
    }

    /// 홈 헤더 우상단 (34pt) — 기어 아이콘 자리를 아바타가 대신한다 (SCREENS.md §02 "아바타(이니셜 34)")
    @Test func homeHeaderShowsPhoto() {
        let m = RTAppModel()
        #expect(rendersMagenta(Screen02Home(model: m, menuOpen: false)) == false)
        m.avatarImage = magentaAvatar()
        #expect(rendersMagenta(Screen02Home(model: m, menuOpen: false)) == true)
    }
}

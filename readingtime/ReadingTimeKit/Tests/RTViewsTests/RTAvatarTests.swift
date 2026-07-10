import Testing
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
@testable import RTViews

// 아바타 사진 — 설정 시트에서 고른 사진을 256px 로 줄여 모델에 싣고 앱 셸이 파일로 영속.
// 사진이 없으면(데모·rtshot) avatarImage == nil → 이니셜 폴백. 이 불변식이 픽셀 오라클을 지킨다.

/// 지정 크기의 단색 PNG 생성 (테스트 입력)
private func makePNG(width: Int, height: Int) -> Data {
    let ctx = CGContext(data: nil, width: width, height: height,
                        bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.setFillColor(CGColor(red: 0.2, green: 0.6, blue: 0.4, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
    let out = NSMutableData()
    let dest = CGImageDestinationCreateWithData(out, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
    return out as Data
}

@Suite struct RTPrepareAvatarTests {
    @Test func downscalesLongEdgeTo256() {
        let p = RTAppModel.prepareAvatar(makePNG(width: 512, height: 512))
        #expect(p?.image.width == 256)
        #expect(p?.image.height == 256)
    }

    @Test func preservesAspectRatio() {
        let p = RTAppModel.prepareAvatar(makePNG(width: 512, height: 256))
        #expect(p?.image.width == 256)
        #expect(p?.image.height == 128)
    }

    @Test func doesNotUpscaleSmallImage() {
        let p = RTAppModel.prepareAvatar(makePNG(width: 64, height: 64))
        #expect(p?.image.width == 64)
        #expect(p?.image.height == 64)
    }

    /// 재인코딩된 data 는 다시 디코딩 가능해야 한다 (앱 셸 영속 → 콜드스타트 로드 경로)
    @Test func reencodedDataRoundTrips() throws {
        let p = try #require(RTAppModel.prepareAvatar(makePNG(width: 512, height: 512)))
        let again = try #require(RTAppModel.prepareAvatar(p.data))
        #expect(again.image.width == 256)
    }

    @Test func rejectsNonImageData() {
        #expect(RTAppModel.prepareAvatar(Data("not an image".utf8)) == nil)
    }
}

@MainActor
@Suite struct RTAvatarModelTests {
    /// 데모·rtshot 정본: 사진 없음 → 이니셜 경로 (픽셀 오라클 불변식)
    @Test func defaultsToNoPhoto() {
        #expect(RTAppModel().avatarImage == nil)
    }

    @Test func setAvatarStoresImageAndFiresHook() throws {
        let m = RTAppModel()
        var saved: Data?
        m.onAvatarChange = { saved = $0 }
        m.setAvatar(makePNG(width: 512, height: 512))
        #expect(m.avatarImage?.width == 256)
        let data = try #require(saved)
        #expect(RTAppModel.prepareAvatar(data) != nil)   // 셸이 그대로 파일로 쓸 수 있는 데이터
    }

    /// 손상된 데이터로 기존 아바타를 날리거나 파일을 덮어쓰지 않는다
    @Test func setAvatarIgnoresNonImageData() {
        let m = RTAppModel()
        m.setAvatar(makePNG(width: 128, height: 128))
        var fired = false
        m.onAvatarChange = { _ in fired = true }
        m.setAvatar(Data("not an image".utf8))
        #expect(m.avatarImage?.width == 128)   // 기존 유지
        #expect(fired == false)
    }
}

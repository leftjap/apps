import Foundation
import SwiftUI
import GymViews

// gymshot — 헤드리스 화면 렌더 CLI (macOS, ImageRenderer). rtshot 미러.
// 사용: gymshot <screenID> <out.png>   (예: gymshot rail out.png)
let args = CommandLine.arguments
guard args.count >= 3 else {
    print("usage: gymshot <screenID> <out.png>   ids: rail | rail-single | tokens")
    exit(1)
}
let screenID = args[1]
let outPath = args[2]

Task { @MainActor in
    guard let view = GymScreens.snapshotView(id: screenID) else {
        FileHandle.standardError.write("unknown screen: \(screenID)\n".data(using: .utf8)!)
        exit(1)
    }
    let renderer = ImageRenderer(content: view)
    renderer.scale = 2
    guard let cg = renderer.cgImage else {
        FileHandle.standardError.write("render 실패\n".data(using: .utf8)!)
        exit(3)
    }
    let rep = NSBitmapImageRep(cgImage: cg)
    guard let png = rep.representation(using: .png, properties: [:]) else { exit(3) }
    try! png.write(to: URL(fileURLWithPath: outPath))
    print("written \(outPath) \(cg.width)x\(cg.height)")
    exit(0)
}
RunLoop.main.run()

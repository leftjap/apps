import Foundation
import SwiftUI
import RTViews

// rtshot — 헤드리스 화면 렌더 CLI (macOS, ImageRenderer).
// 사용: rtshot --list-fonts | rtshot <screenID> <out.png>

let args = CommandLine.arguments

let regErrors = RTFonts.register()
if !regErrors.isEmpty {
    FileHandle.standardError.write(("폰트 등록 실패: " + regErrors.joined(separator: "; ") + "\n").data(using: .utf8)!)
    exit(2)
}

if args.contains("--list-fonts") {
    for line in RTFonts.faces(matching: ["Noto Sans KR", "IBM Plex Mono", "Poppins"]) {
        print(line)
    }
    exit(0)
}

guard args.count >= 3 else {
    print("usage: rtshot --list-fonts | rtshot <screenID> <out.png> | rtshot --app <screenID> <out.png>")
    exit(1)
}

// --app: 시드 모델 + RTRootView 경로 (라우팅 오라클 — 정적 렌더와 픽셀 일치해야 함)
let appMode = args[1] == "--app"
let screenID = appMode ? args[2] : args[1]
let outPath = appMode ? args[3] : args[2]

if appMode && args.count < 4 {
    print("usage: rtshot --app <screenID> <out.png>")
    exit(1)
}

Task { @MainActor in
    guard let view = appMode ? RTScreens.appSnapshotView(id: screenID)
                             : RTScreens.snapshotView(id: screenID) else {
        FileHandle.standardError.write("unknown screen: \(screenID)\n".data(using: .utf8)!)
        exit(1)
    }
    let renderer = ImageRenderer(content: view)
    renderer.scale = 2
    renderer.proposedSize = ProposedViewSize(width: 390, height: 844)
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

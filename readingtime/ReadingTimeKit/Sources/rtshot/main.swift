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
    print("""
    usage: rtshot --list-fonts
           rtshot <screenID> <out.png>            # 정적 캐노니컬 렌더
           rtshot --app <screenID> <out.png>      # 시드 모델 경유 (라우팅 오라클)
           rtshot --seq <a1,a2,...> <out.png>     # 임의 액션 시퀀스 상태 렌더
    """)
    exit(1)
}

// --app: 시드 모델 + RTRootView 경로 (라우팅 오라클 — 정적 렌더와 픽셀 일치해야 함)
// --seq: 임의 액션 시퀀스 (예: "login,simFlip" = 04 기록 중 상태)
let mode = args[1].hasPrefix("--") ? args[1] : ""
let target = mode.isEmpty ? args[1] : args[2]
let outPath = mode.isEmpty ? args[2] : (args.count > 3 ? args[3] : "")

if !mode.isEmpty && outPath.isEmpty {
    print("usage: rtshot \(mode) <arg> <out.png>")
    exit(1)
}

Task { @MainActor in
    let view: AnyView?
    switch mode {
    case "--app": view = RTScreens.appSnapshotView(id: target)
    case "--seq": view = RTScreens.seqSnapshotView(actions: target.split(separator: ",").map(String.init))
    default: view = RTScreens.snapshotView(id: target)
    }
    guard let view else {
        FileHandle.standardError.write("unknown screen: \(target)\n".data(using: .utf8)!)
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

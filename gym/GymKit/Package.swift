// swift-tools-version: 5.9
// GymKit — Gym 앱 네이티브 이식 로직/뷰 레이어 (ReadingTimeKit 구조 미러).
// 이 환경(Xcode 없음, CommandLineTools)에서 macOS 타깃으로 컴파일·렌더·테스트 검증.
// iOS 앱 타깃(Gym.xcodeproj)은 RTViews 처럼 GymViews 를 링크한다.
import PackageDescription

let package = Package(
    name: "GymKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "GymCore", targets: ["GymCore"]),
        .library(name: "GymViews", targets: ["GymViews"]),
    ],
    targets: [
        // 순수 로직·모델 (UI 없음). Supabase 배선(CloudStore)은 다음 증분에서 supabase-swift 의존 추가.
        .target(name: "GymCore"),
        // SwiftUI 화면 라이브러리 — iOS 앱 타깃과 gymshot 이 공유.
        .target(name: "GymViews", dependencies: ["GymCore"]),
        // 헤드리스 렌더 CLI (macOS, ImageRenderer) — mocks/*.html 픽셀 정본 대조용.
        .executableTarget(name: "gymshot", dependencies: ["GymViews"]),
        .testTarget(name: "GymCoreTests", dependencies: ["GymCore"]),
    ]
)

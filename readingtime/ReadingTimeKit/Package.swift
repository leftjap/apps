// swift-tools-version: 5.9
// ReadingTimeKit — 리딩타임 로직 레이어 (UI 없음).
// 이 환경(Xcode 없음, CommandLineTools)에서 macOS 타깃으로 컴파일·테스트 검증 가능하도록 분리.
import PackageDescription

let package = Package(
    name: "ReadingTimeKit",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "ReadingTimeKit", targets: ["ReadingTimeKit"]),
    ],
    dependencies: [
        // 핸드오프 §3-② 확정 의존성 (이전 세션 CloudStore 스캐폴딩이 채택)
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.0.0"),
    ],
    targets: [
        .target(
            name: "ReadingTimeKit",
            dependencies: [.product(name: "Supabase", package: "supabase-swift")]
        ),
        // SwiftUI 화면 라이브러리 (iOS 앱 타깃과 rtshot 이 공유). 폰트는 fetch-fonts.sh 로 수급.
        .target(
            name: "RTViews",
            resources: [.copy("Fonts")]
        ),
        // 헤드리스 렌더 CLI (macOS) — ImageRenderer 로 화면 PNG 출력, 프로토타입 대조용
        .executableTarget(
            name: "rtshot",
            dependencies: ["RTViews"]
        ),
        .testTarget(
            name: "ReadingTimeKitTests",
            dependencies: ["ReadingTimeKit"],
            resources: [.copy("Resources")]
        ),
    ]
)

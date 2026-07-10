import CoreGraphics

// 세트 완료 좌스와이프 히어로 스왑 수치 — 시안 #7b gHeroSwapW/R 정본 (760ms).
//   OUT(고스트, 옛 값): 0→dxOut, scale 0.86, skew -6, 페이드 (0~24%)
//   IN(라이브, 새 값): dxIn 대기 → 착지 landOvershoot·landScale (38~55%) → 정착 0·1 (100%)
//   횟수 행만 delay 55ms (gHeroSwapR ... 55ms).
public struct HeroSwapSpec: Sendable {
    public let dxIn: CGFloat          // IN 진입 시작 x (88 / 82)
    public let dxOut: CGFloat         // OUT 퇴장 x (-96 / -88)
    public let landOvershoot: CGFloat // 착지 오버슈트 x (중량 -8 / 횟수 -6)
    public let landScale: CGFloat     // 착지 스케일 (1.08 / 1.09)
    public let delay: Double          // 행 지연 (0 / 0.055)

    public static let weight = HeroSwapSpec(dxIn: 88, dxOut: -96, landOvershoot: -8, landScale: 1.08, delay: 0)
    public static let reps   = HeroSwapSpec(dxIn: 82, dxOut: -88, landOvershoot: -6, landScale: 1.09, delay: 0.055)
}

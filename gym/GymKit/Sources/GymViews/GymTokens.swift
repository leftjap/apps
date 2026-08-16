import SwiftUI

// 디자인 토큰 — src/styles/paper.css :root 1:1 이식. oklch 는 Color(oklch:_:_:) 로 정확 변환.
public enum GY {
    // Surfaces
    public static let tone255 = Color(hex: 0xFFFFFF)
    public static let tone253 = Color(hex: 0xFDFDFD)
    public static let tone243 = Color(hex: 0xF3F3F3)
    public static let shell = tone253
    public static let card = tone255
    public static let hoverBg = tone243
    public static let sunken = Color(oklch: 0.976, 0.006, 60)
    public static let line = Color(oklch: 0.920, 0.006, 60)
    public static let lineSoft = Color(oklch: 0.945, 0.006, 60)
    public static let neutralBar = Color(oklch: 0.85, 0.006, 60)
    public static let ring = Color(oklch: 0.88, 0.006, 60)      // 유산소 빈 원 테두리
    public static let axis = Color(oklch: 0.88, 0.008, 60)      // 차트 기준선
    public static let sparkFill = Color(oklch: 0.965, 0.006, 60) // 체중 스파크라인 면

    // Ink — 4단 + 순검정
    public static let ink1 = Color(oklch: 0.22, 0.008, 60)
    public static let ink2 = Color(oklch: 0.38, 0.008, 60)
    public static let ink3 = Color(oklch: 0.56, 0.008, 60)
    public static let ink4 = Color(oklch: 0.72, 0.006, 60)
    public static let black = Color(hex: 0x000000)

    // Accents — Crail(주황) 메인 + Cloudy(보조)
    public static let crailSoft = Color(oklch: 0.85, 0.05, 50)
    public static let crailBase = Color(oklch: 0.67, 0.12, 50)
    public static let crailDeep = Color(oklch: 0.48, 0.14, 50)
    public static let crailTint = Color(oklch: 0.95, 0.02, 50)
    public static let cloudySoft = Color(oklch: 0.88, 0.04, 240)
    public static let cloudyBase = Color(oklch: 0.65, 0.08, 240)
    public static let cloudyDeep = Color(oklch: 0.42, 0.12, 240)
    public static let sage = Color(oklch: 0.66, 0.055, 150)
    public static let sageDeep = Color(oklch: 0.46, 0.075, 150)

    // Record surplus(에메랄드)
    public static let recordBase = Color(oklch: 0.62, 0.18, 152)
    public static let recordDeep = Color(oklch: 0.44, 0.16, 152)
    public static let recordTint = Color(oklch: 0.93, 0.06, 152)

    // 홈 재설계 2026-08-17 §1 — 색의 의미: crail = 날짜·기록 행위, teal/pine = 훈련량,
    // ghost = 지난주, warn = 미달. crail 을 미달에 쓰지 말 것.
    public static let teal = Color(hex: 0x2F807A)        // 이번 주 실적 — 밸런스 잉크 막대·유산소 채운 원
    public static let pine = Color(hex: 0x215D5B)        // 오늘 링·오늘 요일·+칩 텍스트·CTA 배경
    public static let ghost = Color(hex: 0xCDDEDC)       // 지난주 실적 — 밸런스 고스트 막대
    public static let ghostTint = Color(hex: 0xE7EFEE)   // + 칩 배경
    public static let warnTint = Color(oklch: 0.95, 0.035, 80)   // 갱신 칩 배경(미달)
    public static let warnDeep = Color(hex: 0xA06D2C)            // 갱신 칩 텍스트(미달)

    public static let warning = Color(hex: 0xC98A3F)
    public static let danger = Color(hex: 0xC5544A)

    // Spacing / radii
    public static let sp1: CGFloat = 4, sp2: CGFloat = 8, sp3: CGFloat = 12, sp4: CGFloat = 16
    public static let sp5: CGFloat = 24, sp6: CGFloat = 32, sp7: CGFloat = 48, sp8: CGFloat = 64
    public static let rSm: CGFloat = 8, rMd: CGFloat = 12, rLg: CGFloat = 18, rXl: CGFloat = 24

    // 폰트 패밀리 (실앱: 번들 Pretendard/Space Grotesk. 스캐폴딩 단계는 시스템 폴백)
    public static let sansName = "Pretendard"
    public static let monoName = "Space Grotesk"
}

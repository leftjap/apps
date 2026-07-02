import SwiftUI

// v8 01 로그인 — 스펙: design-ref/v3/mockups/frames/01.html (인라인 px 그대로)
public struct Screen01Login: View {
    public var onLogin: () -> Void

    public init(onLogin: @escaping () -> Void = {}) {
        self.onLogin = onLogin
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            logo
            Text("리딩타임")
                .font(.sans(40, 900)).tracking(40 * -0.045)
                .foregroundColor(RT.ink)
                .padding(.top, 34)
            RoundedRectangle(cornerRadius: 2)
                .fill(RT.green)
                .frame(width: 44, height: 3)
                .padding(.top, 16)
            Text("당신의 리딩타임을 기록해 보세요.\n독서 습관이 바뀌면 책 읽기가 더 즐거워집니다.")
                .font(.sans(15, 500)).tracking(15 * -0.005)
                .foregroundColor(RT.muted)
                .lineSpacing(15 * 1.66 - 22.5) // line-height 1.66 근사 (Noto 기본 행높이 ≈ 1.5em)
                .padding(.top, 20)
            Spacer()
            googleButton
            Text("계속하면 이용약관과 개인정보 처리방침에 동의합니다")
                .font(.sans(11.5, 400)).tracking(11.5 * -0.005)
                .foregroundColor(Color(hex: 0xB3AB97))
                .frame(maxWidth: .infinity)
                .padding(.top, 14)
        }
        .padding(EdgeInsets(top: 0, leading: 32, bottom: 40, trailing: 32))
        .frame(width: 390, height: 844)
        .background(RT.paper)
    }

    var logo: some View {
        RoundedRectangle(cornerRadius: 19)
            .fill(RT.ctaGrad(CGSize(width: 68, height: 68)))
            .frame(width: 68, height: 68)
            // 0 18px 32px -10px rgba(38,65,58,.5) — spread 미지원 근사(blur/2, spread 만큼 radius 축소 반영)
            .shadow(color: Color(hex: 0x26413A, alpha: 0.5), radius: 11, x: 0, y: 18)
            .overlay(
                RTIcon([
                    "M12 5.8C9.6 4.2 6.5 3.8 3.6 4.5v14.2c2.9-.7 6-.3 8.4 1.3 2.4-1.6 5.5-2 8.4-1.3V4.5c-2.9-.7-6-.3-8.4 1.3z",
                    "M12 5.8v14.2",
                ], size: 46, stroke: RT.ctaText, lineWidth: 1.6, cap: .butt, join: .round)
            )
    }

    var googleButton: some View {
        Button(action: onLogin) {
            HStack(spacing: 11) {
                googleG
                Text("Google로 계속하기")
                    .font(.sans(16, 700)).tracking(16 * -0.005)
                    .foregroundColor(RT.body)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(Color(hex: 0xFFFDF6))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: 0xE5DFCD), lineWidth: 1))
            .shadow(color: Color(hex: 0x16140F, alpha: 0.04), radius: 2, x: 0, y: 2)
            .shadow(color: Color(hex: 0x16140F, alpha: 0.16), radius: 6, x: 0, y: 10) // 0 14 26 -14 근사
        }
        .buttonStyle(.plain)
    }

    var googleG: some View {
        let sc = CGAffineTransform(scaleX: 20.0 / 48.0, y: 20.0 / 48.0)
        let parts: [(String, UInt32)] = [
            ("M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z", 0x4285F4),
            ("M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.4v5.7C8 41.1 15.4 46 24 46z", 0x34A853),
            ("M11.8 28.3c-.5-1.4-.7-2.8-.7-4.3s.3-3 .7-4.3v-5.7H4.4C2.9 17 2 20.4 2 24s.9 7 2.4 10l7.4-5.7z", 0xFBBC05),
            ("M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8 6.9 4.4 14l7.4 5.7c1.7-5.2 6.5-9 12.2-9z", 0xEA4335),
        ]
        return ZStack {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, part in
                Path { $0.addPath(RTSVG.path(part.0).applying(sc)) }
                    .fill(Color(hex: part.1))
            }
        }
        .frame(width: 20, height: 20)
    }
}

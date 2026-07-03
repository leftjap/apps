import SwiftUI

// 12 완독 그리드(86×124) · 13 검색(46×64) 표지 — 시안 CSS 디자인 재현

public enum GridCover {
    // 돈의 심리학 (navy + 코인)
    public static var money: some View {
        ZStack(alignment: .topLeading) {
            Color(hex: 0x1F2D45)
            Rectangle().fill(Color.black.opacity(0.24)).frame(width: 4)
            VStack(spacing: 0) {
                Circle().fill(RadialGradient(colors: [Color(hex: 0xECD28C), Color(hex: 0xBD8F33)],
                                             center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 15))
                    .frame(width: 22, height: 22)
                    .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 2))
                Text("돈의 심리학").font(.sans(12.5, 800)).foregroundColor(.white).padding(.top, 9)
                Text("THE PSYCHOLOGY OF MONEY").font(.mono(4.5, 400)).tracking(4.5 * 0.16)
                    .foregroundColor(Color(hex: 0xD3B46A)).padding(.top, 4)
                Spacer(minLength: 0)
                Text("모건 하우절").font(.sans(6.5, 600)).foregroundColor(Color(hex: 0x92A3BD))
            }
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: 12, leading: 8, bottom: 9, trailing: 8))
        }
    }

    // 작별하지 않는다 (밝은 회녹 + 사선 밴드)
    public static var farewell: some View {
        ZStack(alignment: .topLeading) {
            Color(hex: 0xE9EAE2)
                .overlay(alignment: .topLeading) {
                    // 사선 밴드 — 레이아웃 비관여(overlay)로 두어 ZStack 확장 방지
                    LinearGradient.css(90, size: CGSize(width: 129, height: 22), [
                        (Color(hex: 0x38564E, alpha: 0), 0), (Color(hex: 0x38564E, alpha: 0.7), 0.4),
                        (Color(hex: 0x38564E, alpha: 0.45), 0.7), (Color(hex: 0x38564E, alpha: 0), 1),
                    ])
                    .frame(width: 129, height: 22)
                    .rotationEffect(.degrees(-13))
                    .blur(radius: 1)
                    .offset(x: -17, y: 124 * 0.44)
                }
            Rectangle().fill(Color.black.opacity(0.12)).frame(width: 4)
            VStack(alignment: .leading, spacing: 0) {
                Text("작별하지\n않는다").font(.sans(12.5, 800)).foregroundColor(Color(hex: 0x263832))
                    .lineSpacing(12.5 * 1.35 - 18)
                Spacer(minLength: 0)
                Text("한강 장편소설").font(.sans(7, 600)).foregroundColor(Color(hex: 0x58685F))
            }
            .padding(EdgeInsets(top: 13, leading: 10, bottom: 13, trailing: 10))
        }
    }

    // 트렌드 코리아 2026 (red)
    public static var trend: some View {
        ZStack(alignment: .topLeading) {
            Color(hex: 0xC13A2C)
            Rectangle().fill(Color.black.opacity(0.2)).frame(width: 4)
            VStack(spacing: 0) {
                Text("TREND\nKOREA").font(.mono(8, 700)).tracking(8 * 0.08)
                    .foregroundColor(Color(hex: 0xF6E9DE)).multilineTextAlignment(.center)
                    .lineSpacing(8 * 1.3 - 10.4)
                Text("2026").font(.mono(19, 700)).tracking(19 * -0.02)
                    .foregroundColor(.white).padding(.top, 7)
                Spacer(minLength: 0)
                Text("김난도 외").font(.sans(6.5, 600)).foregroundColor(Color(hex: 0xF2CDC2))
            }
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: 12, leading: 8, bottom: 9, trailing: 8))
        }
    }

    // 우리가 빛의 속도로 갈 수 없다면 (보라 + 별)
    public static var light: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient.css(165, size: CGSize(width: 86, height: 124), [
                (Color(hex: 0x463A75), 0), (Color(hex: 0x191238), 0.7),
            ])
            Rectangle().fill(Color.black.opacity(0.28)).frame(width: 4)
            ForEach(Array([(14, 16, 2.0), (42, 25, 1.5), (68, 48, 2.0), (26, 64, 1.5), (56, 78, 2.0), (76, 94, 1.5), (34, 106, 2.0)].enumerated()), id: \.offset) { _, s in
                Circle().fill(Color(hex: 0xD8D3F0))
                    .frame(width: s.2, height: s.2)
                    .offset(x: CGFloat(s.0), y: CGFloat(s.1))
            }
            VStack(alignment: .leading, spacing: 0) {
                Text("우리가 빛의\n속도로 갈 수\n없다면").font(.sans(9.5, 700))
                    .foregroundColor(Color(hex: 0xEFEAFF))
                    .lineSpacing(9.5 * 1.45 - 14)
                Spacer(minLength: 0)
                Text("김초엽 소설").font(.sans(6.5, 600)).foregroundColor(Color(hex: 0xA99FD6))
            }
            .padding(EdgeInsets(top: 14, leading: 10, bottom: 13, trailing: 10))
        }
    }

    // 불변의 법칙 (다크 네이비 + 금테)
    public static var same: some View {
        ZStack(alignment: .topLeading) {
            Color(hex: 0x232E3A)
            Rectangle().fill(Color.black.opacity(0.26)).frame(width: 4)
            Rectangle().stroke(Color(hex: 0xD6B25E, alpha: 0.5), lineWidth: 1).padding(7)
            VStack(spacing: 0) {
                Text("SAME AS EVER").font(.mono(4.5, 400)).tracking(4.5 * 0.3)
                    .foregroundColor(Color(hex: 0x8FA0B5))
                Text("불변의 법칙").font(.sans(13, 800)).foregroundColor(Color(hex: 0xE7CA82))
                    .padding(.top, 12)
                Spacer(minLength: 0)
                Text("모건 하우절").font(.sans(6.5, 600)).foregroundColor(Color(hex: 0x8FA0B5))
            }
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: 16, leading: 8, bottom: 12, trailing: 8))
        }
    }

    // 도둑맞은 집중력 (오렌지 + 흰 타원)
    public static var focus: some View {
        ZStack(alignment: .top) {
            Color(hex: 0xE4572E)
            HStack { Rectangle().fill(Color.black.opacity(0.2)).frame(width: 4); Spacer() }
            Ellipse().stroke(Color.white, lineWidth: 3)
                .frame(width: 56, height: 56)
                .rotationEffect(.degrees(-8))
                .padding(.top, 14)
            VStack(spacing: 0) {
                Text("도둑맞은\n집중력").font(.sans(11, 900)).foregroundColor(Color(hex: 0x1C140E))
                    .multilineTextAlignment(.center)
                    .lineSpacing(11 * 1.3 - 15)
                Spacer(minLength: 0)
                Text("요한 하리").font(.sans(6.5, 600)).foregroundColor(Color(hex: 0xF6D9CB))
            }
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: 26, leading: 8, bottom: 10, trailing: 8))
        }
    }
}

// 13 검색 결과 표지 (46×64)
public enum SearchCover {
    public static var flow: some View {
        ZStack(alignment: .topLeading) {
            RT.kraftGrad(CGSize(width: 46, height: 64))
            Rectangle().fill(Color.black.opacity(0.16)).frame(width: 2.5)
            Rectangle().stroke(Color(hex: 0x7A602C, alpha: 0.35), lineWidth: 1).padding(4)
            VStack(spacing: 2) {
                Text("몰입").font(.sans(11, 900)).tracking(11 * 0.06).foregroundColor(Color(hex: 0x241C0D))
                Text("FLOW").font(.mono(4, 700)).tracking(4 * 0.38).foregroundColor(Color(hex: 0xB3494B))
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 17)
        }
    }
    public static var farewell: some View {
        ZStack(alignment: .topLeading) {
            Color(hex: 0xE9EAE2)
                .overlay(alignment: .topLeading) {
                    LinearGradient.css(90, size: CGSize(width: 69, height: 13), [
                        (Color(hex: 0x38564E, alpha: 0), 0), (Color(hex: 0x38564E, alpha: 0.65), 0.4),
                        (Color(hex: 0x38564E, alpha: 0.4), 0.7), (Color(hex: 0x38564E, alpha: 0), 1),
                    ])
                    .frame(width: 69, height: 13)
                    .rotationEffect(.degrees(-13))
                    .offset(x: -9, y: 64 * 0.46)
                }
            Rectangle().fill(Color.black.opacity(0.12)).frame(width: 2.5)
            Text("작별하지\n않는다").font(.sans(8, 800)).foregroundColor(Color(hex: 0x263832))
                .lineSpacing(8 * 1.35 - 11)
                .padding(EdgeInsets(top: 8, leading: 6, bottom: 0, trailing: 6))
        }
    }
    public static var money: some View {
        ZStack(alignment: .topLeading) {
            Color(hex: 0x1F2D45)
            Rectangle().fill(Color.black.opacity(0.24)).frame(width: 2.5)
            VStack(spacing: 5) {
                Circle().fill(RadialGradient(colors: [Color(hex: 0xECD28C), Color(hex: 0xBD8F33)],
                                             center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 9))
                    .frame(width: 13, height: 13)
                Text("돈의 심리학").font(.sans(7.5, 800)).foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
        }
    }
    public static var light: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient.css(165, size: CGSize(width: 46, height: 64), [
                (Color(hex: 0x463A75), 0), (Color(hex: 0x191238), 0.7),
            ])
            Rectangle().fill(Color.black.opacity(0.26)).frame(width: 2.5)
            ForEach(Array([(8, 9, 1.5), (24, 15, 1.5), (38, 27, 1.5), (16, 37, 1.5), (32, 47, 1.5)].enumerated()), id: \.offset) { _, s in
                Circle().fill(Color(hex: 0xD8D3F0)).frame(width: s.2, height: s.2)
                    .offset(x: CGFloat(s.0), y: CGFloat(s.1))
            }
            Text("우리가 빛의\n속도로 갈 수\n없다면").font(.sans(7, 700)).foregroundColor(Color(hex: 0xEFEAFF))
                .lineSpacing(7 * 1.45 - 10)
                .padding(EdgeInsets(top: 8, leading: 6, bottom: 0, trailing: 6))
        }
    }
    public static var trend: some View {
        ZStack(alignment: .topLeading) {
            Color(hex: 0xC13A2C)
            Rectangle().fill(Color.black.opacity(0.2)).frame(width: 2.5)
            VStack(spacing: 4) {
                Text("TREND\nKOREA").font(.mono(5.5, 700)).tracking(5.5 * 0.08)
                    .foregroundColor(Color(hex: 0xF6E9DE)).multilineTextAlignment(.center)
                    .lineSpacing(5.5 * 1.3 - 7.2)
                Text("2026").font(.mono(12, 700)).foregroundColor(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 9)
        }
    }
}

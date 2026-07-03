import SwiftUI

// 시안 CSS 자리표시 표지 재현 (실서비스는 API 표지 이미지로 대체)

// 몰입 kraft 표지 — 02 히어로(94×137)·08(104×152)·12(54×79) 등 크기 파라미터화
public struct FlowCover: View {
    public struct Config {
        let width: CGFloat
        let height: CGFloat
        let radius: CGFloat
        let spine: CGFloat
        let frameInset: CGFloat
        let padTop: CGFloat
        let padBottom: CGFloat
        let authorEN: CGFloat?   // nil = 미표시
        let titleSize: CGFloat
        let titleTop: CGFloat
        let flowSize: CGFloat
        let flowTop: CGFloat
        let ruleWidth: CGFloat?  // nil = 미표시
        let authorKR: CGFloat?   // nil = 미표시
        public init(width: CGFloat, height: CGFloat, radius: CGFloat = 4, spine: CGFloat = 4,
                    frameInset: CGFloat = 6, padTop: CGFloat = 13, padBottom: CGFloat = 10,
                    authorEN: CGFloat? = 4.5, titleSize: CGFloat = 26, titleTop: CGFloat = 15,
                    flowSize: CGFloat = 6, flowTop: CGFloat = 5,
                    ruleWidth: CGFloat? = 22, authorKR: CGFloat? = 6) {
            self.width = width
            self.height = height
            self.radius = radius
            self.spine = spine
            self.frameInset = frameInset
            self.padTop = padTop
            self.padBottom = padBottom
            self.authorEN = authorEN
            self.titleSize = titleSize
            self.titleTop = titleTop
            self.flowSize = flowSize
            self.flowTop = flowTop
            self.ruleWidth = ruleWidth
            self.authorKR = authorKR
        }
    }

    let c: Config
    public init(_ c: Config) { self.c = c }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            RT.kraftGrad(CGSize(width: c.width, height: c.height))
            LinearGradient.css(90, size: CGSize(width: c.spine, height: c.height),
                               [(Color.black.opacity(0.2), 0), (Color.black.opacity(0), 1)])
                .frame(width: c.spine)
            RoundedRectangle(cornerRadius: 0)
                .stroke(Color(hex: 0x7A602C, alpha: 0.4), lineWidth: 1)
                .padding(c.frameInset)
            VStack(spacing: 0) {
                if let en = c.authorEN {
                    Text("MIHALY CSIKSZENTMIHALYI")
                        .font(.mono(en, 600)).tracking(en * 0.24)
                        .foregroundColor(Color(hex: 0x9A7C40))
                        .lineLimit(1).fixedSize()
                }
                Text("몰입").font(.sans(c.titleSize, 900)).tracking(c.titleSize * 0.08)
                    .foregroundColor(Color(hex: 0x241C0D))
                    .padding(.top, c.titleTop)
                Text("FLOW").font(.mono(c.flowSize, 700)).tracking(c.flowSize * 0.42)
                    .foregroundColor(Color(hex: 0xB3494B))
                    .padding(.top, c.flowTop)
                Spacer(minLength: 0)
                if let rw = c.ruleWidth {
                    Rectangle().fill(Color(hex: 0x9A7C40).opacity(0.6))
                        .frame(width: rw, height: 1.5)
                }
                if let kr = c.authorKR {
                    Text("미하이 칙센트미하이").font(.sans(kr, 600))
                        .foregroundColor(Color(hex: 0x7C6A42))
                        .padding(.top, 5)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: c.padTop, leading: 8, bottom: c.padBottom, trailing: 8))
        }
        .frame(width: c.width, height: c.height)
        .clipShape(RoundedRectangle(cornerRadius: c.radius))
    }
}

// 02 서재 카드 부채꼴 미니 표지 3종 (35×50)
public struct FanCovers: View {
    public init() {}
    public var body: some View {
        HStack(alignment: .bottom, spacing: -13) {
            // 몰입 kraft
            ZStack(alignment: .topLeading) {
                RT.kraftGrad(CGSize(width: 35, height: 50))
                Rectangle().fill(Color.black.opacity(0.14)).frame(width: 2)
                Text("몰입").font(.sans(9, 900)).foregroundColor(Color(hex: 0x241C0D))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 15)
            }
            .frame(width: 35, height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.35), radius: 4, x: 0, y: 4)
            .rotationEffect(.degrees(-7))
            .zIndex(3)
            // 돈의 심리학 navy + 코인
            ZStack(alignment: .top) {
                Color(hex: 0x1F2D45)
                Circle().fill(
                    RadialGradient(colors: [Color(hex: 0xECD28C), Color(hex: 0xBD8F33)],
                                   center: UnitPoint(x: 0.35, y: 0.3), startRadius: 0, endRadius: 6)
                )
                .frame(width: 9, height: 9)
                .padding(.top, 9)
            }
            .frame(width: 35, height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.35), radius: 4, x: 0, y: 4)
            .rotationEffect(.degrees(2))
            .zIndex(2)
            // 도둑맞은 집중력 orange + 타원
            ZStack(alignment: .top) {
                Color(hex: 0xE4572E)
                Ellipse().stroke(Color.white, lineWidth: 2)
                    .frame(width: 16, height: 16)
                    .rotationEffect(.degrees(-8))
                    .padding(.top, 12)
            }
            .frame(width: 35, height: 50)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.35), radius: 4, x: 0, y: 4)
            .rotationEffect(.degrees(10))
            .zIndex(1)
        }
    }
}

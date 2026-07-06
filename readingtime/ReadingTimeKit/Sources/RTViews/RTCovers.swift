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
        let centered: Bool       // 09: 내용 수직 중앙
        public init(width: CGFloat, height: CGFloat, radius: CGFloat = 4, spine: CGFloat = 4,
                    frameInset: CGFloat = 6, padTop: CGFloat = 13, padBottom: CGFloat = 10,
                    authorEN: CGFloat? = 4.5, titleSize: CGFloat = 26, titleTop: CGFloat = 15,
                    flowSize: CGFloat = 6, flowTop: CGFloat = 5,
                    ruleWidth: CGFloat? = 22, authorKR: CGFloat? = 6, centered: Bool = false) {
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
            self.centered = centered
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
                if c.centered { Spacer(minLength: 0) }
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
                if c.centered { Spacer(minLength: 0) }
            }
            .frame(maxWidth: .infinity)
            .padding(EdgeInsets(top: c.padTop, leading: 8, bottom: c.padBottom, trailing: 8))
        }
        .frame(width: c.width, height: c.height)
        .clipShape(RoundedRectangle(cornerRadius: c.radius))
    }
}

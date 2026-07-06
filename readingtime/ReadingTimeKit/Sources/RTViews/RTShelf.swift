import SwiftUI

// 홈 배경 서가 (크래프트) — 시안 TURN 7 (#7b/#7a). 내 서재의 추상화.
// 6단, 선반널, 책등 그라디언트, 면출 미니표지 2권, 읽던 책 자리의 빈 슬롯+기댄 책.
// 전체 blur 11 · saturate .93 + 세로 스크림 + 가장자리 비네트 + 34초 빛 흐름.
// inset -30 블리드 후 화면(390×844)으로 클립 — CSS 구조 그대로.
//
// 데모/라이브 공용 고정 크래프트 배경(rtshot 픽셀 오라클 결정성 유지). blur 11 하에서
// 책등 인셋 그림자는 시각 기여 0 이라 생략(최소 코드).

// 책등 팔레트 (linear-gradient(90deg, C1 0, C2 40%, C3 100%))
private enum Spine {
    static let tan:   (UInt32, UInt32, UInt32) = (0xCBB47C, 0xE0CC99, 0xD2BD85)
    static let green: (UInt32, UInt32, UInt32) = (0x33513F, 0x3D604E, 0x365343)
    static let brown: (UInt32, UInt32, UInt32) = (0x7A4E32, 0x93613F, 0x815336)
    static let cream: (UInt32, UInt32, UInt32) = (0xE2D6B6, 0xF2EAD4, 0xE7DCBF)
    static let navy:  (UInt32, UInt32, UInt32) = (0x192539, 0x24344F, 0x1E2B41)
    static let sage:  (UInt32, UInt32, UInt32) = (0x71806F, 0x82917F, 0x76856F)
    static let terra: (UInt32, UInt32, UInt32) = (0xB04C33, 0xC95C40, 0xB85138)
    static let olive: (UInt32, UInt32, UInt32) = (0xBDA66E, 0xCBB583, 0xC0AB74)
    static let burg:  (UInt32, UInt32, UInt32) = (0xA03F41, 0xB84E50, 0xA84547)
    static let amber: (UInt32, UInt32, UInt32) = (0xB8862E, 0xD09F42, 0xBF8E33)
}

// 한 권의 책등 — (폭, 높이, 팔레트, 기울기°)
private struct ShelfItem {
    let w: CGFloat
    let h: CGFloat
    let p: (UInt32, UInt32, UInt32)
    let rot: Double
    let anchor: UnitPoint
    init(_ w: CGFloat, _ h: CGFloat, _ p: (UInt32, UInt32, UInt32), rot: Double = 0,
         anchor: UnitPoint = .bottomTrailing) {
        self.w = w; self.h = h; self.p = p; self.rot = rot; self.anchor = anchor
    }
}

private func spineView(_ it: ShelfItem) -> some View {
    RoundedRectangle(cornerRadius: 2.5)
        .fill(LinearGradient.css(90, size: CGSize(width: it.w, height: it.h),
                                 [(Color(hex: it.p.0), 0), (Color(hex: it.p.1), 0.4), (Color(hex: it.p.2), 1)]))
        .frame(width: it.w, height: it.h)
        .rotationEffect(.degrees(it.rot), anchor: it.anchor)
}

public struct RTBookshelf: View {
    let showSlot: Bool
    let pickup: Bool     // 7a: 진입 시 sharp→blur 랙 포커스 + 옆 책 기댐
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var defocused = false   // true = 최종(blur 11)
    @State private var leaned = false      // true = 최종(-6.5°)
    public init(showSlot: Bool = true, pickup: Bool = false) {
        self.showSlot = showSlot
        self.pickup = pickup
    }

    private var active: Bool { pickup && enabled && !reduceMotion }
    private var blurRadius: CGFloat { (active && !defocused) ? 0 : 11 }
    private var scrimOpacity: Double { (active && !defocused) ? 0.42 : 1 }
    private var leanAngle: Double { (active && !leaned) ? 0 : -6.5 }

    // 7b 서가 6단 (시안 라인 213~298 그대로)
    private var row1: [ShelfItem] { [
        .init(22,118,Spine.tan), .init(17,96,Spine.green), .init(26,126,Spine.brown),
        .init(16,88,Spine.cream), .init(24,120,Spine.navy), .init(19,104,Spine.sage),
        .init(18,98,Spine.terra, rot: 5.5), .init(28,124,Spine.olive), .init(20,102,Spine.burg),
        .init(23,112,Spine.amber), .init(18,94,Spine.green), .init(24,116,Spine.sage),
        .init(19,100,Spine.brown),
    ] }
    private var row3: [ShelfItem] { [
        .init(25,120,Spine.cream), .init(18,96,Spine.brown),
        .init(22,114,Spine.navy), .init(16,90,Spine.amber), .init(27,126,Spine.olive),
        .init(20,104,Spine.sage), .init(24,118,Spine.burg), .init(17,92,Spine.tan),
        .init(21,110,Spine.green), .init(19,100,Spine.terra, rot: 6),
    ] }
    private var row4: [ShelfItem] { [
        .init(20,108,Spine.amber), .init(26,124,Spine.navy), .init(17,94,Spine.sage),
        .init(23,116,Spine.tan), .init(28,128,Spine.brown), .init(16,88,Spine.cream),
        .init(22,112,Spine.terra), .init(19,100,Spine.sage), .init(25,122,Spine.tan),
        .init(18,96,Spine.green), .init(21,106,Spine.navy),
    ] }
    private var row5: [ShelfItem] { [
        .init(24,118,Spine.sage), .init(17,94,Spine.amber), .init(21,108,Spine.terra),
        .init(19,102,Spine.olive), .init(26,126,Spine.green), .init(16,90,Spine.amber),
        .init(23,114,Spine.brown), .init(20,104,Spine.cream), .init(18,98,Spine.navy),
        .init(22,110,Spine.tan),
    ] }
    private var row6: [ShelfItem] { [
        .init(22,112,Spine.navy), .init(19,100,Spine.amber), .init(27,124,Spine.tan),
        .init(17,92,Spine.sage), .init(24,120,Spine.olive), .init(21,106,Spine.brown),
        .init(16,88,Spine.terra), .init(25,118,Spine.cream), .init(20,102,Spine.amber),
        .init(23,114,Spine.green),
    ] }

    // 단순 책등 행
    private func rowView(_ items: [ShelfItem]) -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, it in spineView(it) }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(width: 450, height: 140, alignment: .bottomLeading)
    }

    // 2단(빈 슬롯 + 기댄 책) — 읽던 책 자리
    private func row2View() -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            spineView(.init(24,112,Spine.sage)); spineView(.init(18,98,Spine.navy))
            spineView(.init(28,126,Spine.tan)); spineView(.init(16,90,Spine.cream))
            spineView(.init(22,118,Spine.terra)); spineView(.init(26,124,Spine.green))
            spineView(.init(20,102,Spine.olive)); spineView(.init(17,96,Spine.burg))
            if showSlot {
                RoundedRectangle(cornerRadius: 3)
                    .fill(Color(hex: 0x3A2C1C, alpha: 0.24))
                    .overlay(RoundedRectangle(cornerRadius: 3).stroke(Color(hex: 0x3A2C1C, alpha: 0.22), lineWidth: 3).blur(radius: 3))
                    .frame(width: 64, height: 94)
                spineView(.init(20,124,Spine.tan, rot: leanAngle, anchor: .bottomLeading))
                    .padding(.leading, -2)
            } else {
                spineView(.init(24,120,Spine.olive)); spineView(.init(20,124,Spine.tan))
            }
            spineView(.init(24,110,Spine.navy)); spineView(.init(22,102,Spine.cream))
            spineView(.init(26,114,Spine.brown))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(width: 450, height: 140, alignment: .bottomLeading)
    }

    // 면출 미니 표지 (58×86) — 165deg 그라디언트 + 좌측 음영단
    private func faceOut(_ c1: UInt32, _ c2: UInt32) -> some View {
        RoundedRectangle(cornerRadius: 2.5)
            .fill(LinearGradient.css(165, size: CGSize(width: 58, height: 86),
                                     [(Color(hex: c1), 0), (Color(hex: c2), 1)]))
            .frame(width: 58, height: 86)
            .overlay(alignment: .leading) {
                LinearGradient.css(90, size: CGSize(width: 4, height: 86),
                                   [(Color.black.opacity(0.17), 0), (Color.black.opacity(0), 1)])
                    .frame(width: 4)
            }
            .clipShape(RoundedRectangle(cornerRadius: 2.5))
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.28), radius: 2, x: 0, y: 2)
    }

    // 3단(면출 e8dbb4/d9c692) — 인덱스 2 자리에 면출
    private func row3View() -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            spineView(.init(25,120,Spine.cream)); spineView(.init(18,96,Spine.brown))
            faceOut(0xE8DBB4, 0xD9C692)
            spineView(.init(22,114,Spine.navy)); spineView(.init(16,90,Spine.amber))
            spineView(.init(27,126,Spine.olive)); spineView(.init(20,104,Spine.sage))
            spineView(.init(24,118,Spine.burg)); spineView(.init(17,92,Spine.tan))
            spineView(.init(21,110,Spine.green)); spineView(.init(19,100,Spine.terra, rot: 6))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(width: 450, height: 140, alignment: .bottomLeading)
    }

    // 5단(면출 8fa08d/76887a) — 인덱스 3 자리에 면출
    private func row5View() -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            spineView(.init(24,118,Spine.sage)); spineView(.init(17,94,Spine.amber))
            spineView(.init(21,108,Spine.terra))
            faceOut(0x8FA08D, 0x76887A)
            spineView(.init(19,102,Spine.olive)); spineView(.init(26,126,Spine.green))
            spineView(.init(16,90,Spine.amber)); spineView(.init(23,114,Spine.brown))
            spineView(.init(20,104,Spine.cream)); spineView(.init(18,98,Spine.navy))
            spineView(.init(22,110,Spine.tan))
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .frame(width: 450, height: 140, alignment: .bottomLeading)
    }

    private var board: some View {
        Rectangle()
            .fill(LinearGradient.css(180, size: CGSize(width: 450, height: 10),
                                     [(Color(hex: 0xEEE3C6), 0), (Color(hex: 0xEEE3C6), 0.45),
                                      (Color(hex: 0xD9CCA6), 0.46), (Color(hex: 0xCFC096), 1)]))
            .frame(width: 450, height: 10)
    }

    private func boardShadow(_ y: CGFloat) -> some View {
        board
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.38), radius: 9, x: 0, y: 6)
            .offset(y: y)
    }

    // rows+boards (450×904, topLeading) — inset:0 of the -30 container
    private var shelfLayer: some View {
        ZStack(alignment: .topLeading) {
            rowView(row1).offset(y: 8)
            row2View().offset(y: 150)
            row3View().offset(y: 292)
            rowView(row4).offset(y: 434)
            row5View().offset(y: 576)
            rowView(row6).offset(y: 718)
            boardShadow(148); boardShadow(290); boardShadow(432)
            boardShadow(574); boardShadow(716)
            board.offset(y: 858)   // 마지막 널: 그림자 없음
        }
        .frame(width: 450, height: 904, alignment: .topLeading)
    }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            shelfLayer
                .blur(radius: blurRadius)
                .saturation(0.93)
            // 비네트 (블러 밖)
            Rectangle().fill(
                RadialGradient(gradient: Gradient(stops: [
                    .init(color: .clear, location: 0.55),
                    .init(color: Color(hex: 0x3A2C1C, alpha: 0.15), location: 1)]),
                    center: UnitPoint(x: 0.5, y: 0.26), startRadius: 0, endRadius: 450 * 1.0))
                .frame(width: 450, height: 904)
            // 세로 스크림 (가독성) — 7a 진입 시 .42→1 랙 포커스
            LinearGradient(stops: [
                .init(color: Color(hex: 0xF6F3EA, alpha: 0.94), location: 0),
                .init(color: Color(hex: 0xF6F3EA, alpha: 0.87), location: 0.18),
                .init(color: Color(hex: 0xF6F3EA, alpha: 0.46), location: 0.42),
                .init(color: Color(hex: 0xF6F3EA, alpha: 0.50), location: 0.66),
                .init(color: Color(hex: 0xF6F3EA, alpha: 0.82), location: 1)],
                startPoint: .top, endPoint: .bottom)
                .frame(width: 450, height: 904)
                .opacity(scrimOpacity)
            RTLightSweep().frame(width: 450, height: 904)
        }
        .frame(width: 450, height: 904, alignment: .topLeading)
        .offset(x: -30, y: -30)
        .frame(width: 390, height: 844, alignment: .topLeading)
        .clipped()
        .onAppear {
            guard active else { return }
            withAnimation(.easeInOut(duration: 1.15).delay(0.12)) { defocused = true }
            withAnimation(.timingCurve(0.25, 0.6, 0.25, 1, duration: 1.1).delay(0.55)) { leaned = true }
        }
    }
}

// 홈 히어로 표지 (150×219) — 시안 7b 라인 322~328. 데모 경로 표지(라이브는 RTRemoteCover).
// 천 질감 크래프트 + 좌측 책등 음영 + 우측 책배(종이단) + 내부 프레임 + 제목/저자.
public struct HomeBookCover: View {
    public init() {}
    public var body: some View {
        ZStack {
            RT.kraftGrad(CGSize(width: 150, height: 219))
            // 종이결 (수평 그레인 3px 주기)
            Canvas { ctx, size in
                var y: CGFloat = 0
                while y < size.height {
                    ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: 1)),
                             with: .color(Color(hex: 0x7A602C, alpha: 0.045)))
                    y += 3
                }
            }
            // 좌측 책등 음영 (5px)
            HStack(spacing: 0) {
                LinearGradient.css(90, size: CGSize(width: 5, height: 219),
                                   [(Color.black.opacity(0.2), 0), (Color.black.opacity(0), 1)])
                    .frame(width: 5)
                Spacer(minLength: 0)
            }
            // 우측 책배 (종이단 3px)
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                Rectangle().fill(Color(hex: 0xEDE1C2))
                    .frame(width: 3).padding(.vertical, 3)
            }
            // 내부 프레임 (inset 7)
            Rectangle().stroke(Color(hex: 0x7A602C, alpha: 0.4), lineWidth: 1).padding(7)
            // 내용
            VStack(spacing: 0) {
                Text("MIHALY CSIKSZENTMIHALYI").font(.mono(6.5, 600)).tracking(6.5 * 0.24)
                    .foregroundColor(Color(hex: 0x9A7C40)).lineLimit(1).fixedSize()
                Text("몰입").font(.sans(40, 900)).tracking(40 * 0.08)
                    .foregroundColor(Color(hex: 0x241C0D)).padding(.top, 30)
                Text("FLOW").font(.mono(9, 700)).tracking(9 * 0.42)
                    .foregroundColor(Color(hex: 0xB3494B)).padding(.top, 8)
                Spacer(minLength: 0)
                Rectangle().fill(Color(hex: 0x9A7C40).opacity(0.6)).frame(width: 32, height: 2)
                Text("미하이 칙센트미하이").font(.sans(9.5, 600))
                    .foregroundColor(Color(hex: 0x7C6A42)).padding(.top, 8)
            }
            .padding(EdgeInsets(top: 20, leading: 11, bottom: 15, trailing: 11))
        }
        .frame(width: 150, height: 219)
        .clipShape(RoundedRectangle(cornerRadius: 4.5))
    }
}

// 34초 주기 사선 빛 (soft-light, ±3.5%) — 모션 off 시 고정(rtshot 결정성)
struct RTLightSweep: View {
    @Environment(\.rtMotionEnabled) private var enabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shift: CGFloat = -0.035
    var body: some View {
        let active = enabled && !reduceMotion
        LinearGradient.css(100, size: CGSize(width: 450 * 1.24, height: 904),
                           [(Color.clear, 0.32),
                            (Color(hex: 0xFFF3CD, alpha: 0.4), 0.46),
                            (Color.clear, 0.62)])
            .frame(width: 450 * 1.24, height: 904)
            .offset(x: (active ? shift : 0) * 450)
            .blendMode(.softLight)
            .onAppear {
                guard active else { return }
                withAnimation(.easeInOut(duration: 34).repeatForever(autoreverses: true)) {
                    shift = 0.035
                }
            }
    }
}

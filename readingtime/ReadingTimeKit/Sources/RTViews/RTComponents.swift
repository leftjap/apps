import SwiftUI

// 홈 계열 공용 컴포넌트 (02·14)

// 헤더: 미니 로고 + 워드마크 | 우측 액션들 — padding 58px 22px 0
public struct RTHomeHeader<Actions: View>: View {
    @ViewBuilder var actions: () -> Actions

    public init(@ViewBuilder actions: @escaping () -> Actions) {
        self.actions = actions
    }

    public var body: some View {
        HStack {
            HStack(spacing: 9) {
                RoundedRectangle(cornerRadius: 8)
                    .fill(RT.ctaGrad(CGSize(width: 26, height: 26)))
                    .frame(width: 26, height: 26)
                    .overlay(
                        RTIcon([
                            "M12 5.8C9.6 4.2 6.5 3.8 3.6 4.5v14.2c2.9-.7 6-.3 8.4 1.3 2.4-1.6 5.5-2 8.4-1.3V4.5c-2.9-.7-6-.3-8.4 1.3z",
                            "M12 5.8v14.2",
                        ], size: 19, stroke: RT.ctaText, lineWidth: 2, cap: .butt, join: .round)
                    )
                Text("리딩타임").font(.sans(17, 900)).tracking(17 * -0.03).foregroundColor(RT.ink)
            }
            Spacer()
            HStack(spacing: 9, content: actions)
        }
        .padding(EdgeInsets(top: 58, leading: 22, bottom: 0, trailing: 22))
    }
}

// 아바타 34 (segBg, 이니셜 13.5/800)
public struct RTAvatar: View {
    let initial: String
    public init(_ initial: String) { self.initial = initial }
    public var body: some View {
        Circle().fill(RT.segBg)
            .frame(width: 34, height: 34)
            .overlay(Text(initial).font(.sans(13.5, 800)).foregroundColor(RT.body))
    }
}

// 헤더 + 버튼 (그린 원 34)
public struct RTHeaderPlus: View {
    public init() {}
    public var body: some View {
        Circle().fill(RT.ctaGrad(CGSize(width: 34, height: 34)))
            .frame(width: 34, height: 34)
            .overlay(RTIcon(["M12 5v14M5 12h14"], size: 17, stroke: RT.ctaText, lineWidth: 2.4))
            .shadow(color: Color(hex: 0x26413A, alpha: 0.42), radius: 4, x: 0, y: 4) // 0 5 11 -4 근사
    }
}

// 그린 CTA (h54, 링 오버레이 포함) — 링은 v5RippleBtn 의 정지 상태(스냅샷)
public struct RTCTA: View {
    let label: String
    let fontSize: CGFloat
    let radius: CGFloat
    let gap: CGFloat
    let icon: AnyView?
    let tracking: CGFloat

    public init(_ label: String, fontSize: CGFloat = 16, radius: CGFloat = 15, gap: CGFloat = 10,
                tracking: CGFloat = 0, icon: AnyView? = nil) {
        self.label = label
        self.fontSize = fontSize
        self.radius = radius
        self.gap = gap
        self.icon = icon
        self.tracking = tracking
    }

    public var body: some View {
        GeometryReader { geo in
            HStack(spacing: gap) {
                if let icon { icon }
                Text(label).font(.sans(fontSize, 800)).tracking(tracking).foregroundColor(RT.ctaText)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(RT.ctaGrad(geo.size))
            .clipShape(RoundedRectangle(cornerRadius: radius))
            // 0 16px 28px -12px rgba(38,65,58,.55) — 음수 spread 반영 근사(radius·alpha 축소, inset 생략)
            .shadow(color: Color(hex: 0x26413A, alpha: 0.38), radius: 9, x: 0, y: 12)
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .stroke(Color(hex: 0x3A5C4B, alpha: 0.4), lineWidth: 2)
                    .rtRippleBtn()
            )
        }
        .frame(height: 54)
    }
}

// 스탯 스트립 (오늘 | 이번 주 | 연속) — 14 는 ghost 모드
public struct RTStatsStrip: View {
    public struct Item {
        let value: String
        let unit: String?
        let valueColor: Color
        public init(_ value: String, unit: String? = nil, valueColor: Color = RT.ink) {
            self.value = value
            self.unit = unit
            self.valueColor = valueColor
        }
    }
    let items: [(Item, String)]
    let ghost: Bool

    public init(items: [(Item, String)], ghost: Bool = false) {
        self.items = items
        self.ghost = ghost
    }

    public var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, pair in
                VStack(spacing: 2) {
                    HStack(alignment: .firstTextBaseline, spacing: 0) {
                        Text(pair.0.value).font(.mono(16, 700))
                            .foregroundColor(ghost ? RT.ghost : pair.0.valueColor)
                        if let unit = pair.0.unit {
                            Text(unit).font(.sans(11, 600))
                                .foregroundColor(ghost ? RT.ghost : RT.muted)
                        }
                    }
                    Text(pair.1).font(.sans(10.5, 500))
                        .foregroundColor(ghost ? RT.ghost : RT.faint)
                }
                .frame(maxWidth: .infinity)
                if i < items.count - 1 {
                    Rectangle().fill(RT.hair).frame(width: 1, height: 24)
                }
            }
        }
        .padding(EdgeInsets(top: 12, leading: 8, bottom: 12, trailing: 8))
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
        .opacity(ghost ? 0.75 : 1)
    }
}

// 카드 배경 공통 (surface + hair 보더 + 카드 그림자)
public struct RTCardBackground: ViewModifier {
    let radius: CGFloat
    let hero: Bool
    public func body(content: Content) -> some View {
        content
            .background(RT.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(RT.hair, lineWidth: 1))
            .shadow(color: Color(hex: 0x16140F, alpha: 0.03), radius: 1, x: 0, y: 1)
            .shadow(color: Color(hex: 0x16140F, alpha: hero ? 0.16 : 0), radius: 6, x: 0, y: 8) // 0 16 34 -24 근사
    }
}

public extension View {
    func rtCard(radius: CGFloat, hero: Bool = false) -> some View {
        modifier(RTCardBackground(radius: radius, hero: hero))
    }
}

// 위만 라운드·아래 열린 대시 보더 (14 선반 실루엣)
public struct TopRoundedOpenRect: Shape {
    let radius: CGFloat
    public init(radius: CGFloat) { self.radius = radius }
    public func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        p.addLine(to: CGPoint(x: rect.minX, y: rect.minY + radius))
        p.addQuadCurve(to: CGPoint(x: rect.minX + radius, y: rect.minY),
                       control: CGPoint(x: rect.minX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX - radius, y: rect.minY))
        p.addQuadCurve(to: CGPoint(x: rect.maxX, y: rect.minY + radius),
                       control: CGPoint(x: rect.maxX, y: rect.minY))
        p.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        return p
    }
}

// 원격 표지 이미지 (실데이터 책 — 알라딘 coverUrl). 로딩/실패 시 베이지 플레이스홀더.
public struct RTRemoteCover: View {
    let url: String
    let size: CGSize
    let radius: CGFloat

    public init(url: String, size: CGSize, radius: CGFloat = 6) {
        self.url = url
        self.size = size
        self.radius = radius
    }

    public var body: some View {
        AsyncImage(url: URL(string: url)) { phase in
            if case .success(let img) = phase {
                img.resizable().aspectRatio(contentMode: .fill)
            } else {
                Rectangle().fill(Color(hex: 0xE8E2D2))
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: radius))
    }
}

import SwiftUI

// 기록 화면(주·월·지도) 공용 컴포넌트 — 정본: 작업지시서 §2·§3·§4·§11 + 목업 CSS 실측.

// ── CSS line-box 실측표 ──
// Chrome 에서 mockups/RTRecord.dc.html 을 렌더해 getBoundingClientRect() 로 뽑은 값.
// SwiftUI Text 의 기본 행높이는 CSS `line-height:normal` 과 달라(Noto ≈1.45em vs SwiftUI 더 큼)
// 그대로 쌓으면 블록이 2~4px 씩 밀린다 → 텍스트를 이 높이의 박스에 넣어 레이아웃 흐름을 일치시킨다.
enum RTLB {
    // Noto Sans KR (normal)
    static let n10: CGFloat = 14.5
    static let n10_5: CGFloat = 15
    static let n11: CGFloat = 16
    static let n11_5: CGFloat = 17
    static let n12: CGFloat = 17.5
    static let n13: CGFloat = 18.5
    static let n14: CGFloat = 20
    static let n20: CGFloat = 29
    static let n26: CGFloat = 32.7      // 주간 타이틀 (line-height:1.2 + mono 스팬 영향)
    static let n26n: CGFloat = 37.5     // 월간 h1 (line-height:normal)
    // IBM Plex Mono (normal)
    static let m6_5: CGFloat = 8.5
    static let m9: CGFloat = 11.5
    static let m9_5: CGFloat = 12.5
    static let m10: CGFloat = 13
    /// 캘린더 날짜 숫자 — flex 아이템이라 블록 line box(13) 가 아닌 콘텐츠 높이(12.5)
    static let calNum: CGFloat = 12.5
    static let m10_5: CGFloat = 14
    static let m11: CGFloat = 15
    static let m12: CGFloat = 16
    static let m12_5: CGFloat = 16.5
    static let m13: CGFloat = 17
    static let m16: CGFloat = 21
    static let m17: CGFloat = 22
    static let m21: CGFloat = 27.5
}

public extension View {
    /// CSS line-box 재현 — 글리프 박스를 지정 행높이에 세로 중앙 배치
    func rtLB(_ h: CGFloat) -> some View { frame(height: h) }

    /// CSS box-shadow (x y blur spread color).
    /// ① SwiftUI 엔 spread 가 없어 그림자 도형을 직접 그린다 (음수 spread = 축소).
    /// ② CSS 외부 그림자는 border-box **안쪽엔 칠해지지 않는다** — 반투명 배경(지도 칩·줌 버튼)에서
    ///    SwiftUI 기본 .shadow 는 그림자가 비쳐 배경이 탁해진다 → 도형 내부를 destinationOut 으로 도려낸다.
    func rtBoxShadow<S: Shape>(_ shape: S, color: Color, blur: CGFloat,
                               x: CGFloat = 0, y: CGFloat, spread: CGFloat = 0) -> some View {
        background(
            ZStack {
                shape.fill(color)
                    .padding(-spread)
                    .offset(x: x, y: y)
                    .blur(radius: blur / 2)
                shape.fill(Color.black).blendMode(.destinationOut)
            }
            .compositingGroup()
        )
    }

    /// CSS box-shadow spread 링 (0 0 0 Npx color) — 박스 바깥으로만 N 두께
    func rtRing(_ radius: CGFloat, _ color: Color, width: CGFloat) -> some View {
        overlay(
            RoundedRectangle(cornerRadius: radius + width / 2)
                .stroke(color, lineWidth: width)
                .padding(-width / 2)
        )
    }
    func rtRingCircle(_ color: Color, width: CGFloat) -> some View {
        overlay(Circle().stroke(color, lineWidth: width).padding(-width / 2))
    }
}

// ── 헤드리스 렌더 플래그 ──
// ImageRenderer(rtshot) 는 ScrollView 의 콘텐츠를 그리지 못한다(백지). 픽셀 오라클 경로에서는
// 스크롤 오프셋 0 과 동일한 "상단 클립" 으로 렌더하고, 실기기/데모 셸은 진짜 ScrollView 를 쓴다.
private struct RTHeadlessKey: EnvironmentKey { static let defaultValue = false }
public extension EnvironmentValues {
    var rtHeadless: Bool {
        get { self[RTHeadlessKey.self] }
        set { self[RTHeadlessKey.self] = newValue }
    }
}
public extension View {
    func rtHeadless(_ on: Bool = true) -> some View { environment(\.rtHeadless, on) }
}

// ── 스크롤 영역 (주·월 공통) ──
// CSS: position:absolute; top:102px; left:0; right:0; bottom:0; overflow-y:auto; padding:0 22px 28px
struct RTScrollArea<Content: View>: View {
    @Environment(\.rtHeadless) private var headless
    @ViewBuilder let content: () -> Content

    static var viewportH: CGFloat { 844 - 102 }

    private var inner: some View {
        content()
            .frame(width: 346, alignment: .leading)
            .padding(EdgeInsets(top: 0, leading: 22, bottom: 28, trailing: 22))
    }

    var body: some View {
        Group {
            if headless {
                // fixedSize 필수 — 뷰포트보다 큰 콘텐츠를 SwiftUI 가 압축하지 않게(CSS 오버플로와 동일)
                inner
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(width: 390, height: Self.viewportH, alignment: .top)
                    .clipped()
            } else {
                ScrollView(.vertical, showsIndicators: false) { inner }
                    .frame(width: 390, height: Self.viewportH)
            }
        }
        .padding(.top, 102)
    }
}

// 높이 상한이 있는 스크롤 박스 (장소 시트 표지 그리드 max-height:300)
struct RTCappedScroll<Content: View>: View {
    @Environment(\.rtHeadless) private var headless
    let height: CGFloat
    @ViewBuilder let content: () -> Content

    var body: some View {
        if headless {
            content()
                .fixedSize(horizontal: false, vertical: true)
                .frame(height: height, alignment: .top)
                .clipped()
        } else {
            ScrollView(.vertical, showsIndicators: false) { content() }
                .frame(height: height)
        }
    }
}

// ── 카드 (border 1px + box-sizing:border-box) ──
// CSS 는 border 가 박스 **안쪽**(border-box)에 그려진다 →
//  ① 콘텐츠 여백 = 1 + padding (stroke 오버레이는 레이아웃을 먹지 않으므로 padding 에 1 을 더한다)
//  ② 선은 `strokeBorder`(안쪽) 로 그린다. 기본 `stroke` 는 경계에 중앙 정렬돼 절반이 밖으로 나가고,
//     그만큼 배경과 섞여 보더가 옅게 렌더된다(실측: #e5dfcd 가 (238,235,223) 로 희석).
struct RTRecCard: ViewModifier {
    let radius: CGFloat
    let pad: EdgeInsets
    var shadow: Bool = false
    func body(content: Content) -> some View {
        content
            .padding(EdgeInsets(top: pad.top + 1, leading: pad.leading + 1,
                                bottom: pad.bottom + 1, trailing: pad.trailing + 1))
            .background(RT.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(RT.hair, lineWidth: 1))
            .shadow(color: Color(hex: 0x16140F, alpha: shadow ? 0.03 : 0), radius: 1, x: 0, y: 1)
    }
}
extension View {
    func rtRecCard(_ radius: CGFloat, _ pad: EdgeInsets, shadow: Bool = false) -> some View {
        modifier(RTRecCard(radius: radius, pad: pad, shadow: shadow))
    }
}

// ── 표지 (fill + 좌 spine + 선택적 제목) ──
public struct RTFillCover: View {
    let fill: RTFill
    let tc: UInt32
    let title: String?
    let size: CGSize
    let radius: CGFloat
    let spine: CGFloat
    let spineAlpha: Double
    let fontSize: CGFloat
    let lineHeight: CGFloat      // CSS line-height (px)
    let pad: CGFloat
    let topOffset: CGFloat?      // nil = 수직 중앙(inset 0 flex center), 값 = margin-top
    let wrap: Bool               // true = 전체 제목 자동 줄바꿈, false = short 의 "\n" 만

    public init(fill: RTFill, tc: UInt32, title: String? = nil, size: CGSize, radius: CGFloat,
                spine: CGFloat = 2, spineAlpha: Double = 0.18,
                fontSize: CGFloat = 8, lineHeight: CGFloat = 8.4, pad: CGFloat = 2,
                topOffset: CGFloat? = nil, wrap: Bool = false) {
        self.fill = fill; self.tc = tc; self.title = title; self.size = size; self.radius = radius
        self.spine = spine; self.spineAlpha = spineAlpha
        self.fontSize = fontSize; self.lineHeight = lineHeight; self.pad = pad
        self.topOffset = topOffset; self.wrap = wrap
    }

    @ViewBuilder private func label(_ t: String) -> some View {
        if wrap {
            RTWrapLines(t, size: fontSize, weight: 900, color: Color(hex: tc),
                        lineHeight: lineHeight, width: size.width - pad * 2)
        } else {
            RTTightLines(t, size: fontSize, color: Color(hex: tc), lineHeight: lineHeight)
        }
    }

    public var body: some View {
        ZStack(alignment: .topLeading) {
            Rectangle().fill(fill.paint(size))
            Rectangle().fill(Color.black.opacity(spineAlpha)).frame(width: spine)
            if let title {
                if let top = topOffset {
                    label(title)
                        .frame(width: size.width, alignment: .center)
                        .padding(.top, top)
                } else {
                    label(title)
                        .frame(width: size.width, height: size.height, alignment: .center)
                }
            }
        }
        .frame(width: size.width, height: size.height)
        .clipShape(RoundedRectangle(cornerRadius: radius))
    }
}

// 명시 개행("\n") 제목 — 각 줄을 CSS line-height 박스에 넣어 재현 (핀 short 제목)
struct RTTightLines: View {
    let text: String
    let size: CGFloat
    let color: Color
    let lineHeight: CGFloat

    init(_ text: String, size: CGFloat, color: Color, lineHeight: CGFloat) {
        self.text = text; self.size = size; self.color = color; self.lineHeight = lineHeight
    }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(text.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(.sans(size, 900))
                    .foregroundColor(color)
                    .lineLimit(1)
                    .fixedSize()
                    .frame(height: lineHeight)
            }
        }
    }
}

// 자동 줄바꿈 제목 (랭킹·시트·상세).
// 목업 폰 프레임은 `word-break:keep-all` → 한국어도 **공백에서만** 줄바꿈하고, 한 단어가 폭을
// 넘으면 넘친 채로 한 줄 유지한다 (예: "사피엔스"=1줄, "돈의 심리학"="돈의"/"심리학").
// 각 줄을 CSS line-height 박스에 넣는다 (SwiftUI 는 음수 lineSpacing 이 불가해 Text 자동
// 줄바꿈만으로는 line-height 1.05~1.2 를 재현할 수 없음).
struct RTWrapLines: View {
    let text: String
    let size: CGFloat
    let weight: Int
    let mono: Bool
    let color: Color
    let lineHeight: CGFloat
    let width: CGFloat
    var alignment: HorizontalAlignment = .center

    init(_ t: String, size: CGFloat, weight: Int = 900, mono: Bool = false, color: Color,
         lineHeight: CGFloat, width: CGFloat, alignment: HorizontalAlignment = .center) {
        self.text = t; self.size = size; self.weight = weight; self.mono = mono
        self.color = color; self.lineHeight = lineHeight; self.width = width; self.alignment = alignment
    }

    // 글자 폭 근사 — mono 0.6em 고정, sans 는 한글·CJK 1em / 그 외 0.58em
    static func advance(_ s: Substring, _ size: CGFloat, _ mono: Bool) -> CGFloat {
        if mono { return CGFloat(s.count) * size * 0.6 }
        return s.reduce(0) { acc, c in
            let u = c.unicodeScalars.first!.value
            let cjk = (0xAC00...0xD7A3).contains(u) || (0x3000...0x9FFF).contains(u)
            return acc + size * (cjk ? 1.0 : 0.58)
        }
    }

    var lines: [String] {
        var out: [String] = []
        let space = size * (mono ? 0.6 : 0.3)
        for para in text.components(separatedBy: "\n") {
            var cur: [Substring] = []
            var w: CGFloat = 0
            for word in para.split(separator: " ", omittingEmptySubsequences: true) {
                let aw = Self.advance(word, size, mono)
                let need = cur.isEmpty ? aw : w + space + aw
                if need > width && !cur.isEmpty {
                    out.append(cur.joined(separator: " "))
                    cur = [word]; w = aw
                } else {
                    cur.append(word); w = need
                }
            }
            if !cur.isEmpty { out.append(cur.joined(separator: " ")) }
        }
        return out
    }

    var body: some View {
        VStack(alignment: alignment, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(mono ? .mono(size, weight) : .sans(size, weight))
                    .foregroundColor(color)
                    .lineLimit(1)
                    .fixedSize()
                    .frame(height: lineHeight)
            }
        }
    }
}

// ── 기록 헤더 (10·11·15 공용): back + "기록" | [주 | 월 | 지도] ──
struct StatsHeader: View {
    enum Active { case week, month, map }
    let active: Active
    var model: RTAppModel? = nil

    var body: some View {
        HStack {
            HStack(spacing: 4) {
                RTIcon(RTIconPath.back, size: 17, viewBox: 20, stroke: RT.body, lineWidth: 2.2)
                    .frame(width: 38, height: 38)
                    .contentShape(Rectangle())
                    .onTapGesture { model?.nav(.home) }
                if model?.statsSubject == .partner, let m = model {
                    Circle().fill(RT.segBg).frame(width: 26, height: 26)
                        .overlay(RTAvatarFill(initial: m.partnerInitial, photo: m.partnerAvatar,
                                              size: 26, fontSize: 11, initialColor: RT.body))
                        .padding(.trailing, 3)
                    Text("\(m.partnerName)의 기록").font(.sans(17, 800)).foregroundColor(RT.ink)
                } else {
                    Text("기록").font(.sans(17, 800)).foregroundColor(RT.ink)
                }
            }
            Spacer()
            HStack(spacing: 0) {
                seg("주", on: active == .week) { model?.nav(.statsWeek) }
                seg("월", on: active == .month) { model?.nav(.statsMonth) }
                seg("지도", on: active == .map) { model?.nav(.statsMap) }
            }
            .padding(3)
            .background(Capsule().fill(RT.segBg))
            .padding(.trailing, 4)
        }
        .padding(EdgeInsets(top: 52, leading: 18, bottom: 0, trailing: 18))
    }

    func seg(_ t: String, on: Bool, action: @escaping () -> Void) -> some View {
        Text(t).font(.sans(11.5, on ? 700 : 600))
            .foregroundColor(on ? Color(hex: 0xF6F3EA) : RT.muted)
            .rtLB(RTLB.n11_5)
            .padding(EdgeInsets(top: 5, leading: 13, bottom: 5, trailing: 13))
            .background(Capsule().fill(on ? RT.ink : Color.clear))
            .contentShape(Capsule())
            .onTapGesture { action() }
    }
}

// ── 연속 카드 (§3-5) — 폭 180 (도트 14×7 + 13×4 = 150 + 좌우 15) ──
struct RTStreakCard: View {
    let streak: Int
    let dots: [(color: Color, last: Bool)]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text("\(streak)").font(.mono(21, 700)).tracking(21 * -0.03).foregroundColor(RT.terra)
                Text("일 연속").font(.sans(11.5, 600)).foregroundColor(RT.muted)
            }
            .frame(height: RTLB.m21)
            HStack(spacing: 4) {
                ForEach(Array(dots.enumerated()), id: \.offset) { _, d in
                    if d.last {
                        Circle().fill(d.color).frame(width: 7, height: 7)
                            .rtRingCircle(Color(hex: 0xC2553A, alpha: 0.25), width: 2.5)
                            .rtBlink(duration: 2)
                    } else {
                        Circle().fill(d.color).frame(width: 7, height: 7)
                    }
                }
            }
            .padding(.top, 10)
            Spacer(minLength: 0)
        }
        .rtRecCard(18, EdgeInsets(top: 13, leading: 14, bottom: 13, trailing: 14))
    }
}

// ── 시간대 카드 (§3-5) ──
struct RTPeakCard: View {
    let label: String
    let dim: (left: Double, width: Double)?
    let peak: (left: Double, width: Double)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label).font(.sans(13, 800)).foregroundColor(RT.ink).rtLB(RTLB.n13)
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    Capsule().fill(Color(hex: 0xECE5D2))
                    if let d = dim {
                        Capsule().fill(Color(hex: 0xC8B98F).opacity(0.55))
                            .frame(width: geo.size.width * d.width)
                            .offset(x: geo.size.width * d.left)
                    }
                    if let p = peak {
                        Capsule().fill(LinearGradient.css(90, size: CGSize(width: geo.size.width * p.width, height: 8),
                                                          [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)]))
                            .frame(width: geo.size.width * p.width)
                            .offset(x: geo.size.width * p.left)
                            .rtBreath(duration: 3)
                    }
                }
            }
            .frame(height: 8)
            .clipShape(Capsule())
            .padding(.top, 11)
            HStack(spacing: 0) {
                Text("06").font(.mono(9, 400)).foregroundColor(RT.ghost)
                Spacer(minLength: 0)
                Text("12").font(.mono(9, 400)).foregroundColor(RT.ghost)
                Spacer(minLength: 0)
                Text("18").font(.mono(9, 400)).foregroundColor(RT.ghost)
                Spacer(minLength: 0)
                Text("24").font(.mono(9, 400)).foregroundColor(RT.ghost)
            }
            .frame(height: RTLB.m9)
            .padding(.top, 7)
        }
        .rtRecCard(18, EdgeInsets(top: 13, leading: 14, bottom: 13, trailing: 14))
    }
}

// 연속 + 시간대 행 — CSS flex: 연속은 도트 min-content(180) 고정, 시간대가 나머지.
// 주간(§3-5)은 align-items 기본(stretch) → 연속 카드도 84 로 늘어남.
// 월간(§4-8)은 align-items:center → 연속 카드는 제 높이(72.5) 유지 + 세로 중앙.
struct RTDuoRow: View {
    let streak: Int
    let dots: [(color: Color, last: Bool)]
    let peakLabel: String
    let dim: (left: Double, width: Double)?
    let peak: (left: Double, width: Double)?
    var centered = false        // 월간 = true

    var body: some View {
        HStack(spacing: 11) {
            if centered {
                RTStreakCard(streak: streak, dots: dots)
                    .fixedSize(horizontal: true, vertical: true)
            } else {
                RTStreakCard(streak: streak, dots: dots)
                    .fixedSize(horizontal: true, vertical: false)
                    .frame(maxHeight: .infinity)
            }
            RTPeakCard(label: peakLabel, dim: dim, peak: peak)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}

// ── 랭킹 행 (§3-6 / §4-7 동일) ──
struct RTRankRow: View {
    let cover: AnyView
    let title: String
    let tag: String?
    let pct: CGFloat        // 0…1
    let barColor: Color
    let total: String
    var onTap: (() -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            cover
                .frame(width: 30, height: 43)
                .rtBoxShadow(RoundedRectangle(cornerRadius: 3), color: Color(hex: 0x3A2C1C, alpha: 0.3),
                             blur: 7, y: 3, spread: -2)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Text(title).font(.sans(13, 700)).foregroundColor(RT.ink).lineLimit(1)
                    if let tag, !tag.isEmpty {
                        Text(tag).font(.mono(9, 400)).foregroundColor(RT.faint)
                    }
                }
                .frame(height: RTLB.n13)
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color(hex: 0xECE5D2))
                        Capsule().fill(barColor)
                            .frame(width: geo.size.width * pct)
                            .rtSweep()
                    }
                }
                .frame(height: 5)
                .padding(.top, 5)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Text(total).font(.mono(12.5, 700)).foregroundColor(RT.ink).rtLB(RTLB.m12_5)
        }
        .padding(EdgeInsets(top: 6, leading: 2, bottom: 6, trailing: 2))
        .contentShape(Rectangle())
        .onTapGesture { onTap?() }
    }
}

// ── 아이콘 ──
public enum RTMapIcon {
    public static let pin = ["M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"]
    public static let close = ["M6 6l12 12M18 6L6 18"]
    public static let plus = ["M12 5v14M5 12h14"]
    public static let minus = ["M5 12h14"]
}

// 핀 = path + circle(12,10,r3)
public struct RTPinIcon: View {
    let size: CGFloat
    let color: Color
    let lineWidth: CGFloat
    public init(size: CGFloat, color: Color, lineWidth: CGFloat = 2) {
        self.size = size; self.color = color; self.lineWidth = lineWidth
    }
    public var body: some View {
        let sc = size / 24
        ZStack {
            RTIcon(RTMapIcon.pin, size: size, stroke: color, lineWidth: lineWidth)
            Circle().stroke(color, lineWidth: lineWidth * sc)
                .frame(width: 6 * sc, height: 6 * sc)
                .position(x: 12 * sc, y: 10 * sc)
        }
        .frame(width: size, height: size)
    }
}

// 리셋(컴퍼스) = circle r9 + 십자
public struct RTResetIcon: View {
    let size: CGFloat
    let color: Color
    public init(size: CGFloat, color: Color) { self.size = size; self.color = color }
    public var body: some View {
        let sc = size / 24
        ZStack {
            Circle().stroke(color, lineWidth: 2.2 * sc)
                .frame(width: 18 * sc, height: 18 * sc)
            RTIcon(["M12 3v3M12 18v3M3 12h3M18 12h3"], size: size, stroke: color, lineWidth: 2.2)
        }
        .frame(width: size, height: size)
    }
}

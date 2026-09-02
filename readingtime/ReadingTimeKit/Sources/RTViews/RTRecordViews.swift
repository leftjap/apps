import SwiftUI

// 기록 화면 공용 컴포넌트 — 정본: design_handoff_record_onepage (구 주·월·지도 지시서 §2·§11 실측 계승).

// ── CSS line-box 실측표 ──
// Chrome 에서 기록 목업(구 RTRecord.dc.html · 현 RTRecordOnePage.dc.html)을 렌더해 getBoundingClientRect() 로 뽑은 값.
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
    /// 홈 히어로 제목 — 시안이 `21px/26.25px` 로 line-height 를 명시한다(normal 이면 30.5).
    static let n21: CGFloat = 26.25
    static let n26: CGFloat = 32.7      // 주간 타이틀 (line-height:1.2 + mono 스팬 영향)
    /// 기록 원페이지 월 헤더 "8월" — line-height 1.2 = 31.2 (목업 실측 h31). n26(32.7)은 구 주간 타이틀 값이라
    /// 그대로 쓰면 서머리 이하 전체가 1.5px 내려간다 (렌더 대조 2026-09-02).
    static let n26h: CGFloat = 31.2
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
    /// 홈 2주 캘린더 날짜 숫자. `calNum`(12.5)은 **mono 10** 기준이라 재사용하면 토큰이 거짓말을 한다.
    static let m11_5: CGFloat = 15
    static let m12: CGFloat = 16
    static let m12_5: CGFloat = 16.5
    static let m13: CGFloat = 17
    /// 홈 히어로 누적 시간
    static let m14: CGFloat = 18.5
    static let m16: CGFloat = 21
    static let m17: CGFloat = 22
    static let m21: CGFloat = 27.5
    /// 홈 '오늘 읽음' 숫자 — 시안이 `27px/27px`(line-height 1)로 명시한다(normal 이면 35).
    static let m27: CGFloat = 27
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

// ── 히트맵 캘린더 칸 — 홈 2주 캘린더(02)와 기록 월 캘린더(원페이지)가 같은 문법을 쓴다 ──
// (기록 작업지시서 §3 "Screen02Home.calCell / calFG / calBG / todayHalo 문법 그대로")
/// 분기 순서를 반드시 지킬 것: ① 오늘 그리고 분>0 → ② 미래 → ③ 미기록 과거 → ④ 읽은 과거.
/// weight 700 은 "오늘"의 표식이지 읽었는지의 표식이 아니다 → 오늘 미기록도 700 유지.
struct RTHeatCell: View {
    let c: HomeCalCell
    /// 기록 화면만: 읽은 과거·오늘 탭 → day 시트. 히트 영역 39 = 셀 33 + 상하 gap 절반(3+3).
    /// 홈은 nil — 수식어가 하나도 붙지 않아 렌더가 홈 오라클과 바이트 동일하다.
    var onTap: (() -> Void)? = nil

    var body: some View {
        let filledToday = c.isToday && c.minutes > 0
        let base = Text("\(c.day)")
            .font(.mono(11.5, c.isToday ? 700 : 500))
            .tracking(11.5 * 0.01)
            .foregroundColor(fg(filledToday: filledToday))
            .rtLB(RTLB.m11_5)
            .frame(maxWidth: .infinity)
            .frame(height: 33)
            .background(RoundedRectangle(cornerRadius: 10).fill(bg(filledToday: filledToday)))
            .overlay {
                // 읽은 과거만 안쪽 1pt — 색면 경계를 살짝 잡아준다
                if !filledToday && !c.isFuture && c.minutes > 0 {
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color(hex: 0x7A3C28, alpha: 0.05), lineWidth: 1)
                }
                // 오늘인데 아직 안 읽은 칸 — 색면은 '읽음'의 표식이라 줄 수 없다(주면 읽은 것으로 오독).
                // 굵기 700 만으로는 실기기에서 주변 미기록 칸과 구별되지 않았다(2026-08-28 실기기 피드백).
                if c.isToday && c.minutes == 0 {
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(RT.terra, lineWidth: 1.5)
                }
            }
        let shaped = Group {
            if c.isToday {
                todayHalo(base)
            } else {
                base
            }
        }
        let tappable = Group {
            if let onTap {
                shaped
                    .padding(.vertical, 3)
                    .contentShape(Rectangle())
                    .padding(.vertical, -3)
                    .onTapGesture { onTap() }
            } else {
                shaped
            }
        }
        // 미래 칸은 읽을 정보가 없다 — 요소를 만들지 않고 통째로 숨긴다.
        // 요소를 만든 뒤(.accessibilityElement + label/value) .accessibilityHidden 을 덧붙이면
        // 실기기에서 트리에 그대로 남는다 (시뮬레이터 실측 2026-08-28: 8/29·8/30 이 "기록 없음"으로 낭독됨).
        if c.isFuture {
            tappable.accessibilityHidden(true)
        } else {
            // 색만으로 분량을 전달하므로 VoiceOver 대체 텍스트가 필수 (§8-3, AC #15c)
            tappable
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(Calendar(identifier: .gregorian).component(.month, from: c.date))월 \(c.day)일")
                .accessibilityValue(c.minutes > 0 ? "\(c.minutes)분" : "기록 없음")
                .accessibilityAddTraits(c.isToday ? .isSelected : [])
        }
    }

    /// 오늘 칸 헤일로 — 삭제된 13도트 체인의 '오늘 도트' 맥박 문법을 그대로 이식한다(2.6s·terra).
    /// **정적 렌더(모션 off)는 기존 3pt @13% 그대로** — 데모 픽셀 오라클이 흔들리지 않는다.
    private func todayHalo<V: View>(_ v: V) -> some View {
        RTMotionFrame {
            v.rtRing(10, RT.terra.opacity(0.13), width: 3)
        } anim: { t in
            let ph = (sin(t * 2 * .pi / 2.6 - .pi / 2) + 1) / 2
            return v.rtRing(10, RT.terra.opacity(0.22 - 0.14 * ph), width: 3 + 2 * ph)
        }
    }

    /// 색면이 깔린 칸(읽은 과거)에는 "일요일은 항상 terra" 규칙을 적용하지 않는다 —
    /// 색면 위 terra 숫자는 대비가 2.1:1 까지 떨어진다.
    private func fg(filledToday: Bool) -> Color {
        if filledToday { return .white }
        if c.isFuture { return Color(hex: 0xD3CBB6) }
        // 오늘 미기록은 테두리와 같은 terra 로 — 굵기 700 만으로는 안 잡힌다(실기기 피드백)
        if c.minutes == 0 { return (c.isToday || c.isSunday) ? RT.terra : RT.faint }
        return Color(hex: 0x2E1C15)
    }
    private func bg(filledToday: Bool) -> Color {
        if filledToday { return RT.terra }
        if c.isFuture || c.minutes == 0 { return .clear }
        return RT.terra.opacity(RTHomeCal.alpha(c.minutes))
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

// ── 기록 헤더 (원페이지): back + "기록" — 세그먼트([주|월|지도])는 원페이지 통합으로 삭제 ──
struct StatsHeader: View {
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
        }
        .padding(EdgeInsets(top: 52, leading: 18, bottom: 0, trailing: 18))
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

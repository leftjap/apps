import SwiftUI

// v8 02 홈 (허브) — 스펙: frames/02.html. model 주입 시 인터랙션 활성 (nil = 정적 데모).
public struct Screen02Home: View {
    var model: RTAppModel?
    private let mode: RTMode   // 저장 스냅샷 — 참조만 들면 SwiftUI 가 갱신을 스킵 (§ScreensDark 주석)

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.mode = model?.mode ?? .flip
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            RTHomeHeader {
                RTHeaderPlus()
                    .contentShape(Rectangle())
                    .onTapGesture { model?.openSheet(.addbook) }
                RTAvatar("지")
                    .contentShape(Rectangle())
                    .onTapGesture { model?.openSheet(.settings) }
            }
            VStack(spacing: 0) {
                hero.rtEntrance(duration: 0.45)
                RTStatsStrip(items: [
                    (.init("32", unit: "분"), "오늘"),
                    (.init("7:26"), "이번 주"),
                    (.init("12", unit: "일", valueColor: RT.terra), "연속"),
                ])
                .padding(.top, 11)
                .rtEntrance(delay: 0.08, duration: 0.45)
                entryCards.padding(.top, 11)
                recentHead.padding(EdgeInsets(top: 16, leading: 4, bottom: 8, trailing: 4))
                    .rtEntrance(delay: 0.16, duration: 0.45)
                recentRow(tint: RT.greenTint,
                          icon: AnyView(FlipIcon(size: 14, color: RT.green, lineWidth: 2)),
                          min: "26분", label: "몰입 · 엎기", when: "오늘 14:14", divider: true)
                recentRow(tint: RT.amberTint,
                          icon: AnyView(monitorIcon(14, RT.amberDeep, 1.8)),
                          min: "48분", label: "도둑맞은 집중력 · 밀리 PC", when: "오늘", divider: false)
            }
            .padding(.horizontal, 20)
            .padding(.top, 106)
        }
        .frame(width: 390, height: 844)
    }

    // 히어로 카드
    var hero: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: 15) {
                FlowCover(.init(width: 94, height: 137))
                    .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.45), radius: 12, x: 0, y: 14)
                    .rtFloat(duration: 8)
                VStack(alignment: .leading, spacing: 0) {
                    liveChip
                    Text("몰입").font(.sans(21, 900)).tracking(21 * -0.03)
                        .foregroundColor(RT.ink).padding(.top, 10)
                    Text("미하이 칙센트미하이").font(.sans(12.5, 500))
                        .foregroundColor(RT.muted).padding(.top, 3)
                    Spacer(minLength: 0)
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text("4:12").font(.mono(19, 700)).tracking(19 * -0.02).foregroundColor(RT.ink)
                        Text("누적 · 8회").font(.sans(11, 500)).foregroundColor(RT.faint)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 137)
            segment.padding(.top, 14)
            RTCTA("읽기 시작", fontSize: 16, radius: 15, gap: 10, tracking: 16 * -0.01,
                  icon: AnyView(RTIcon(RTIconPath.play, size: 17, fill: RT.ctaText)))
                .contentShape(Rectangle())
                .onTapGesture { model?.start() }
                .padding(.top, 10)
        }
        .padding(EdgeInsets(top: 16, leading: 16, bottom: 14, trailing: 16))
        .rtCard(radius: 22, hero: true)
    }

    var liveChip: some View {
        HStack(spacing: 6) {
            Circle().fill(RT.green).frame(width: 6, height: 6)
                .rtBlink(duration: 2.2)
            Text("읽는 중").font(.sans(11, 700)).foregroundColor(RT.green)
        }
        .padding(EdgeInsets(top: 4, leading: 11, bottom: 4, trailing: 11))
        .background(Capsule().fill(RT.greenTint))
    }

    var segment: some View {
        HStack(spacing: 3) {
            segItem(.flip, label: "엎기",
                    icon: { c in AnyView(FlipIcon(size: 13, color: c, lineWidth: 2)) })
            segItem(.tap, label: "탭",
                    icon: { c in AnyView(TapIcon(size: 13, color: c)) })
        }
        .padding(3)
        .background(RoundedRectangle(cornerRadius: 13).fill(RT.segBg))
    }

    func segItem(_ m: RTMode, label: String, icon: (Color) -> AnyView) -> some View {
        let on = mode == m
        return HStack(spacing: 6) {
            icon(on ? Color(hex: 0xF6F3EA) : RT.muted)
            Text(label).font(.sans(12.5, on ? 700 : 600))
                .foregroundColor(on ? Color(hex: 0xF6F3EA) : RT.muted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(on ? AnyView(RoundedRectangle(cornerRadius: 10).fill(RT.ink)) : AnyView(Color.clear))
        .shadow(color: on ? Color(hex: 0x16140F, alpha: 0.2) : .clear, radius: 2.5, x: 0, y: 2)
        .contentShape(Rectangle())
        .onTapGesture { model?.setMode(m) }
    }

    var entryCards: some View {
        HStack(spacing: 11) {
            // 서재
            ZStack(alignment: .bottomTrailing) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("서재").font(.sans(14, 800)).foregroundColor(RT.ink)
                        Spacer()
                        Text("14").font(.mono(11, 600)).foregroundColor(RT.faint)
                    }
                    HStack(alignment: .bottom, spacing: 0) {
                        FanCovers().padding(.leading, 6)
                        Spacer(minLength: 0)
                    }
                    .frame(height: 54, alignment: .bottom)
                    .padding(.top, 12)
                }
                .padding(EdgeInsets(top: 14, leading: 14, bottom: 12, trailing: 14))
                chevronBadge.padding(EdgeInsets(top: 0, leading: 0, bottom: 12, trailing: 12))
            }
            .frame(maxWidth: .infinity)
            .rtCard(radius: 18)
            .contentShape(Rectangle())
            .onTapGesture { model?.nav(.library) }
            // 기록
            ZStack(alignment: .bottomTrailing) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text("기록").font(.sans(14, 800)).foregroundColor(RT.ink)
                        Spacer()
                        Text("5월").font(.mono(11, 600)).foregroundColor(RT.faint)
                    }
                    miniBars.padding(.top, 12)
                    Text("이번 주 7:26").font(.mono(11, 600)).foregroundColor(RT.muted)
                        .padding(.top, 9)
                }
                .padding(EdgeInsets(top: 14, leading: 14, bottom: 12, trailing: 14))
                chevronBadge.padding(EdgeInsets(top: 0, leading: 0, bottom: 12, trailing: 12))
            }
            .frame(maxWidth: .infinity)
            .rtCard(radius: 18)
            .contentShape(Rectangle())
            .onTapGesture { model?.nav(.statsWeek) }
        }
    }

    var chevronBadge: some View {
        Circle().fill(RT.segBg).frame(width: 26, height: 26)
            .overlay(ChevronRight(color: RT.muted))
    }

    var miniBars: some View {
        GeometryReader { geo in
            HStack(alignment: .bottom, spacing: 4) {
                ForEach(Array([38, 52, 30, 70, 44, 20, 55].enumerated()), id: \.offset) { i, pct in
                    RoundedRectangle(cornerRadius: 2.5)
                        .fill(i == 3 ? Color(hex: 0x3A5C4B) : Color(hex: 0xDDD5BD))
                        .frame(height: geo.size.height * CGFloat(pct) / 100)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .padding(.horizontal, 2)
        }
        .frame(height: 38)
    }

    var recentHead: some View {
        HStack {
            Text("최근 기록").font(.sans(13.5, 800)).foregroundColor(RT.ink)
            Spacer()
            Text("전체 보기").font(.sans(11.5, 500)).foregroundColor(RT.faint)
                .contentShape(Rectangle())
                .onTapGesture { model?.nav(.statsWeek) }
        }
    }

    func monitorIcon(_ size: CGFloat, _ color: Color, _ lw: CGFloat) -> some View {
        let sc = size / 24
        return ZStack {
            RoundedRectangle(cornerRadius: 2 * sc)
                .stroke(color, lineWidth: lw * sc)
                .frame(width: 18 * sc, height: 12 * sc)
                .position(x: 12 * sc, y: 11 * sc)
            RTIcon(["M8 21h8M12 17v4"], size: size, stroke: color, lineWidth: lw)
        }
        .frame(width: size, height: size)
    }

    func recentRow(tint: Color, icon: AnyView, min: String, label: String, when: String, divider: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 9).fill(tint)
                    .frame(width: 30, height: 30)
                    .overlay(icon)
                HStack(spacing: 8) {
                    Text(min).font(.mono(14, 700)).foregroundColor(RT.ink)
                    Text(label).font(.sans(12.5, 500)).foregroundColor(RT.muted)
                }
                Spacer()
                Text(when).font(.mono(11, 500)).foregroundColor(RT.faint)
            }
            .padding(EdgeInsets(top: 9, leading: 4, bottom: 9, trailing: 4))
            if divider {
                Rectangle().fill(RT.hair2).frame(height: 1)
            }
        }
    }
}

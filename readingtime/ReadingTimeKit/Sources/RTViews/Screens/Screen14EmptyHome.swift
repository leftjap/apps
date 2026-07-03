import SwiftUI

// v8 14 홈 · 빈 상태 — 스펙: frames/14.html
// userData 주입 시 통계는 실기록 (읽는 중 책이 없어도 세션 기록은 있을 수 있음)
public struct Screen14EmptyHome: View {
    var model: RTAppModel?
    private let stats: (today: Int, week: String, streak: Int)?   // init 스냅샷

    public init(model: RTAppModel? = nil) {
        self.model = model
        if let m = model, m.userData != nil {
            self.stats = (m.todaySeconds / 60, RTAppModel.hmString(m.weekSeconds), m.streakDays)
        } else {
            self.stats = nil
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            RTHomeHeader {
                RTAvatar("지")
                    .contentShape(Rectangle())
                    .onTapGesture { model?.openSheet(.settings) }
            }
            VStack(spacing: 0) {
                hero
                RTStatsStrip(items: [
                    (.init("\(stats?.today ?? 0)", unit: "분"), "오늘"),
                    (.init(stats?.week ?? "0:00"), "이번 주"),
                    (stats.map { $0.streak > 0 ? .init("\($0.streak)", unit: "일") : .init("—") } ?? .init("—"), "연속"),
                ], ghost: true)
                .padding(.top, 13)
                shelf.padding(.top, 38)
            }
            .padding(.horizontal, 24)
            .padding(.top, 128)
        }
        .frame(width: 390, height: 844)
    }

    var hero: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 18) {
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(Color(hex: 0xCFC7B0), style: StrokeStyle(lineWidth: 1.5, dash: [4.5, 4.5]))
                    .frame(width: 88, height: 128)
                    .overlay(RTIcon(["M12 5v14M5 12h14"], size: 26, stroke: Color(hex: 0xCFC7B0), lineWidth: 1.8))
                    .rtFloat(duration: 6)
                Text("무슨 책부터\n시작해 볼까요?")
                    .font(.sans(20, 900)).tracking(20 * -0.03)
                    .foregroundColor(RT.ink)
                    .lineSpacing(20 * 1.35 - 29) // line-height 1.35 근사
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            RTCTA("첫 책 추가하기", fontSize: 15.5, radius: 16, gap: 9,
                  icon: AnyView(RTIcon(["M12 5v14M5 12h14"], size: 17, stroke: RT.ctaText, lineWidth: 2.6)))
                .contentShape(Rectangle())
                .onTapGesture { model?.openSheet(.addbook) }
                .padding(.top, 20)
        }
        .padding(EdgeInsets(top: 26, leading: 22, bottom: 26, trailing: 22))
        .rtCard(radius: 22, hero: true)
    }

    var shelf: some View {
        VStack(spacing: 0) {
            HStack(alignment: .bottom, spacing: 12) {
                ForEach([64, 76, 68], id: \.self) { h in
                    TopRoundedOpenRect(radius: 3)
                        .stroke(Color(hex: 0xD5CDB8), style: StrokeStyle(lineWidth: 1.5, dash: [4.5, 4.5]))
                        .frame(width: 46, height: CGFloat(h))
                }
            }
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: 0xDED6C0))
                .frame(width: 210, height: 3)
                .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.25), radius: 2.5, x: 0, y: 3)
        }
    }
}

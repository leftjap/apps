import SwiftUI

// v8 14 홈 · 빈 상태 — 스펙: frames/14.html
// userData 주입 시 통계는 실기록 (읽는 중 책이 없어도 세션 기록은 있을 수 있음)
public struct Screen14EmptyHome: View {
    var model: RTAppModel?
    private let stats: (today: Int, week: String, streak: Int)?   // init 스냅샷
    private let avatar: CGImage?                                  // init 스냅샷 (사진 선택 즉시 반영용)
    /// 읽는 책은 없어도 기록은 있다(전부 완독 등) — 그땐 값이 실제 기록이라 흐리게 그리지 않고 통계로 가는 길을 둔다.
    /// 흐린 띠와 통계 버튼 부재로 기록이 없는 것처럼 보였다(2026-11-08 검토). 데모(시안)는 흐린 띠 그대로.
    private let hasRecords: Bool
    let nextBook: Bool   // 서재에 책 존재(전부 완독) = "다음 책" 문맥, 없으면 온보딩 카피
    @State private var menuOpen = false

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.avatar = model?.avatarImage
        self.nextBook = model?.userData?.books.isEmpty == false
        if let m = model, m.userData != nil {
            self.stats = (m.todaySeconds / 60, RTAppModel.hmString(m.weekSeconds), m.streakDays)
            self.hasRecords = m.userData?.sessions.isEmpty == false || m.countedEbookTotalSeconds > 0
        } else {
            self.stats = nil
            self.hasRecords = false
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            RTHomeHeader {
                RTAvatar(model?.displayInitial ?? "지", photo: avatar)
                    .contentShape(Rectangle())
                    // 02와 동일 메뉴 — 설정 시트 직행이면 서재 진입 경로가 없음 (실기기 보고 2026-07-13)
                    .onTapGesture { menuOpen = true }
                    .accessibilityLabel("메뉴")
                    .accessibilityAddTraits(.isButton)
                    .accessibilityIdentifier("home.avatar")
                    .accessibilityValue(avatar == nil ? "initial" : "photo")
            }
            VStack(spacing: 0) {
                hero
                RTStatsStrip(items: [
                    (.init("\(stats?.today ?? 0)", unit: "분"), "오늘"),
                    (.init(stats?.week ?? "0:00"), "이번 주"),
                    (stats.map { $0.streak > 0 ? .init("\($0.streak)", unit: "일") : .init("—") } ?? .init("—"), "연속"),
                ], ghost: !hasRecords)
                .padding(.top, 13)
                if hasRecords { statsButton.padding(.top, 12) }
            }
            .padding(.horizontal, 24)
            .padding(.top, 128)
            if menuOpen { RTHomeMenu(model: model, avatar: avatar) { menuOpen = false } }
        }
        .frame(width: 390, height: 844)
    }

    /// 홈(02) '전체 통계' 캡슐과 같은 모양 — 아바타 메뉴를 거치지 않고 기록 화면으로
    var statsButton: some View {
        HStack(spacing: 6) {
            RTIcon(["M5 20V11M12 20V4M19 20v-6"], size: 13, stroke: RT.green, lineWidth: 1.9)
            Text("전체 통계").font(.sans(11.5, 700)).foregroundColor(RT.green)
        }
        .padding(EdgeInsets(top: 5, leading: 9, bottom: 5, trailing: 11))
        .background(Capsule().fill(RT.greenTint))
        .rtHitArea(top: 8, bottom: 8)
        .onTapGesture { model?.openMyStats() }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("emptyHome.statsButton")
    }

    var hero: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 18) {
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(Color(hex: 0xCFC7B0), style: StrokeStyle(lineWidth: 1.5, dash: [4.5, 4.5]))
                    .frame(width: 88, height: 128)
                    .overlay(RTIcon(["M12 5v14M5 12h14"], size: 26, stroke: Color(hex: 0xCFC7B0), lineWidth: 1.8))
                    .rtFloat(duration: 6)
                Text(nextBook ? "다음 책은\n뭘 읽어볼까요?" : "무슨 책부터\n시작해 볼까요?")
                    .font(.sans(20, 900)).tracking(20 * -0.03)
                    .foregroundColor(RT.ink)
                    .lineSpacing(20 * 1.35 - 29) // line-height 1.35 근사
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            RTCTA(nextBook ? "다음 책 추가하기" : "첫 책 추가하기", fontSize: 15.5, radius: 16, gap: 9,
                  icon: AnyView(RTIcon(["M12 5v14M5 12h14"], size: 17, stroke: RT.ctaText, lineWidth: 2.6)))
                .contentShape(Rectangle())
                .onTapGesture { model?.openSheet(.addbook) }
                .padding(.top, 20)
        }
        .padding(EdgeInsets(top: 26, leading: 22, bottom: 26, trailing: 22))
        .rtCard(radius: 22, hero: true)
    }
}

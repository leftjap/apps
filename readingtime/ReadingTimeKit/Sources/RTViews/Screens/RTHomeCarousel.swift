import SwiftUI

// 홈 히어로 치수 (작업지시서 v3 §3.1) — RTBook3D 는 한 줄도 수정하지 않고 뷰 전체를 등비 축소한다.
// static let W/H/D 만 줄이면 책등 세로쓰기 9pt·종이결 3px 주기·내부 프레임 inset 8·책배 3px·
// 책등 음영 6px·선 두께 1.2·부유 진폭 3.5 가 비례하지 않고 남아 개별 보정할 곳이 10곳을 넘는다.
enum RTHomeHero {
    /// 표지 172 → 122
    static let scale: CGFloat = 122.0 / 172.0     // 0.70930
    /// RTBook3D 컨테이너 198×268 × scale — scaleEffect 는 레이아웃 크기를 바꾸지 않으므로 뒤에 온다
    static let frameW: CGFloat = 140
    static let frameH: CGFloat = 190
}

// 히어로 공통 레이아웃 — 데모 스테이지(Screen02Home.demoStage)와 라이브 캐러셀 카드가
// **반드시** 같은 레이아웃이어야 한다. 한쪽만 고치면 실기기와 rtshot 스크린샷이 갈린다(v3 §5-2).
//
//   [표지 122×179]  → 3D, scaleEffect 등비 축소
//   [접지 그림자]    padding(top: 2)
//   [제목]          padding(top: 15)
//   [상태 배지 · 누적] padding(top: 8)
//
// 인디케이터 점은 경로마다 달라(데모 3개 고정 / 라이브는 카드 2장 이상일 때만) 바깥에 둔다.
struct RTHomeHeroBody<Cover: View, Trailing: View>: View {
    let title: String
    let badgeText: String
    let amber: Bool                     // 밀리 카드 = amber 분기
    var titleID: String? = nil          // 캐러셀 UI 테스트 오라클
    @ViewBuilder let cover: () -> Cover
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        VStack(spacing: 0) {
            cover()
                .scaleEffect(RTHomeHero.scale, anchor: .center)
                .frame(width: RTHomeHero.frameW, height: RTHomeHero.frameH)
                .rtBookDropIn()
            RTHomeFloorShadow().padding(.top, 2)
            Text(title)
                .font(.sans(21, 900)).tracking(21 * -0.03)
                .foregroundColor(RT.ink)
                .lineLimit(1).minimumScaleFactor(0.6)
                // 세로 고정 필수 — rtLB(26.25 = 시안 line-height)가 SwiftUI 자연 행높이(30.5)보다
                // 낮아, 없으면 minimumScaleFactor 가 **높이**에 반응해 제목이 14% 작게 렌더된다
                // (실측: 글리프 16.5 vs 시안 19.0). 가로는 열어 둬야 긴 제목이 축소된다.
                .fixedSize(horizontal: false, vertical: true)
                .rtLB(RTLB.n21)
                .padding(.top, 15)
                .accessibilityIdentifier(titleID ?? "")
                .rtRiseIn(delay: 0.18)
            HStack(spacing: 9) {
                HStack(spacing: 6) {
                    Circle().fill(amber ? RT.amber : RT.green)
                        .frame(width: 5, height: 5).rtBlink(duration: 2.2)
                    Text(badgeText).font(.sans(11, 700))
                        .foregroundColor(amber ? RT.amber : RT.green)
                        .rtLB(RTLB.n11)
                }
                .padding(EdgeInsets(top: 3, leading: 8, bottom: 3, trailing: 9))
                .background(Capsule().fill(amber ? RT.amberTint : RT.greenTint))
                trailing()
            }
            .padding(.top, 8)
            .rtRiseIn(dy: 10, duration: 0.5, delay: 0.04)
        }
        // 히어로 자식은 세로로 눌리면 안 된다 (v3 §2 주의)
        .fixedSize(horizontal: false, vertical: true)
    }
}

// 접지 그림자 — RTBook3D 의 형제 뷰라 표지의 scaleEffect 가 닿지 않는다. 시안 실측값으로 직접 축소
// (176×26 → 134×18, endRadius 88 → 67, blur 8 → 6). 부유 위상은 rtBookFloatY 단일 소스 공유.
// 책이 가라앉을수록(floatY>0) 옅고 좁게 — support.js 실측 공식 그대로.
struct RTHomeFloorShadow: View {
    var body: some View {
        RTMotionFrame {
            shape(scaleX: 1, alpha: 0.5)
        } anim: { t in
            let floatY = Double(rtBookFloatY(t))
            return shape(scaleX: 1 - floatY * 0.01, alpha: 0.5 - floatY * 0.008)
        }
    }
    // alpha 는 그라디언트에 직접 bake — .opacity() 배수(>1 clamp)로는 방향을 표현 불가
    private func shape(scaleX: CGFloat, alpha: Double) -> some View {
        Ellipse().fill(RadialGradient(gradient: Gradient(stops: [
            .init(color: Color(hex: 0x3A2C1C, alpha: alpha), location: 0),
            .init(color: Color(hex: 0x3A2C1C, alpha: 0), location: 0.7)]),
            center: .center, startRadius: 0, endRadius: 67))
            .frame(width: 134, height: 18).blur(radius: 6)
            .scaleEffect(x: scaleX, y: 1)
    }
}

/// 히어로 누적 시간 — "4:12 누적". 종이책 카드 전용(밀리는 이 자리에 완독 버튼).
struct RTHomeAccum: View {
    let text: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(text).font(.mono(14, 700)).foregroundColor(RT.ink).rtLB(RTLB.m14)
            Text("누적").font(.sans(11, 500)).foregroundColor(RT.muted).rtLB(RTLB.n11)
        }
    }
}

// 홈 표지 캐러셀 (사용자 결정 2026-08-25) — 히어로 1권 고정을 좌우 슬라이딩으로 교체.
// 카드 = 읽는 중 종이책 + 최근 밀리 책(최근 읽은 순). 밀리 카드는 엎기 기록 대상이 아니라
// (밀리가 자동 집계 — 이중 계상 방지) 그 사실을 배지로 명시한다.
// 데모(rtshot 오라클)는 homeCards 가 비어 이 뷰를 타지 않는다 — Screen02Home.stage 분기.
struct RTHomeCarousel: View {
    @ObservedObject var model: RTAppModel
    private var cards: [RTHomeCard] { model.homeCards }

    // 시안 스테이지 폭 = 390 - 26*2
    private static let pageW: CGFloat = 390 - 26 * 2
    @State private var drag: CGFloat = 0

    private var index: Int { min(max(0, model.homeCardIndex), cards.count - 1) }

    @ViewBuilder var body: some View {
        if cards.isEmpty {
            EmptyView()
        } else {
            carousel
        }
    }

    private var carousel: some View {
        VStack(spacing: 0) {
            ZStack {
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    cardView(card)
                        .opacity(i == index ? 1 : 0)          // 한 장만 보이되 전환은 오프셋으로
                        .offset(x: CGFloat(i - index) * Self.pageW + drag)
                        .accessibilityHidden(i != index)
                }
            }
            .frame(width: Self.pageW)
            .contentShape(Rectangle())
            .gesture(swipe)
            // 인디케이터: 카드와 18, 하단 도킹 카드와 최소 16 확보.
            // (홈 VStack 의 Spacer(minLength:0) 가 0 까지 눌려 점이 카드에 2pt 로 붙었다 — 실측 2026-08-26)
            if cards.count > 1 {
                RTHomeDots(count: cards.count, active: index)
                    .padding(.top, 18).padding(.bottom, 16)
            }
        }
    }

    // 좌우 스와이프 — 40pt 넘기면 페이지 전환 (스크린 스와이프백과 충돌 없게 수평 우세 판정)
    private var swipe: some Gesture {
        DragGesture(minimumDistance: 12)
            .onChanged { v in
                guard abs(v.translation.width) > abs(v.translation.height) else { return }
                drag = v.translation.width
            }
            .onEnded { v in
                let dx = v.translation.width
                var next = index
                if dx < -40, index < cards.count - 1 { next = index + 1 }
                if dx > 40, index > 0 { next = index - 1 }
                withAnimation(.spring(response: 0.34, dampingFraction: 0.86)) {
                    drag = 0
                    model.homeCardIndex = next
                }
            }
    }

    private var current: RTHomeCard { cards[index] }

    // 상태 배지 문구 — 종이책은 "N일째", 밀리는 출처 명시(엎기 대상 아님을 여기서 전달)
    private func badgeText(_ card: RTHomeCard) -> String {
        if card.isEbook { return "밀리 · 자동 기록" }
        if let isbn = card.isbn, let b = model.userData?.books.first(where: { $0.isbn == isbn }) {
            return "\(model.daysSinceAdded(b))일째"
        }
        return "읽는 중"
    }

    private func cardView(_ card: RTHomeCard) -> some View {
        RTHomeHeroBody(title: card.title,
                       badgeText: badgeText(card),
                       amber: card.isEbook,
                       titleID: "home.carousel.title.\(card.id)") {
            // 표지는 RTBook3D 기준 크기(172×252) 그대로 넘기고 뷰 전체를 등비 축소한다.
            // frontCoverWarped 가 앞면을 172×252 프레임에 넣으므로 여기서 줄이면 여백이 생긴다.
            RTBook3D(front: AnyView(
                RTRemoteCover(url: card.coverUrl, size: .init(width: 172, height: 252), radius: 0,
                              title: card.title, author: card.author)
                    .rtBookFace(size: .init(width: 172, height: 252))),
                     spineTitle: card.title)
        } trailing: {
            if card.isEbook {
                // 완독 처리 진입점만 (밀리는 08 상세가 없다).
                finishButton
            } else if let isbn = card.isbn {
                RTHomeAccum(text: RTAppModel.hmString(model.totalSeconds(isbn: isbn)))
            }
        }
        .frame(width: Self.pageW)
    }

    // 밀리 완독 — 종이책의 08 상세 '완독' CTA 에 대응하는 홈 진입점.
    // 확인 단계는 서재 편입(2026-09-01)으로 제거 — 완독한 책이 서재에 남아 상세의
    // '다시 읽기'로 언제든 되돌릴 수 있으므로 즉시 실행이 안전해졌다.
    private var finishButton: some View {
        Button { withAnimation(.easeOut(duration: 0.2)) { model.finishSelectedCard() } } label: {
            HStack(spacing: 5) {
                RTIcon(RTIconPath.check, size: 13, stroke: RT.green, lineWidth: 2.4)
                Text("다 읽었어요").font(.sans(11.5, 600)).foregroundColor(RT.green)
            }
            .padding(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
            .background(Capsule().fill(RT.greenTint))
        }
        .buttonStyle(.plain)
    }
}

/// 캐러셀 인디케이터 점 — 활성 6 / 비활성 5, spacing 6. 데모 스테이지도 같은 문법을 쓴다.
struct RTHomeDots: View {
    let count: Int
    let active: Int
    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Circle()
                    .fill(i == active ? RT.ink : RT.ghost)
                    .frame(width: i == active ? 6 : 5, height: i == active ? 6 : 5)
            }
        }
        .accessibilityHidden(true)
    }
}

import SwiftUI

// 홈 표지 캐러셀 (사용자 결정 2026-08-25) — 히어로 1권 고정을 좌우 슬라이딩으로 교체.
// 카드 = 읽는 중 종이책 + 최근 밀리 책(최근 읽은 순). 밀리 카드는 엎기 기록 대상이 아니라
// (밀리가 자동 집계 — 이중 계상 방지) 그 사실을 칩·안내로 명시한다.
// 데모(rtshot 오라클)는 homeCards 가 비어 이 뷰를 타지 않는다 — Screen02Home.stage 분기.
struct RTHomeCarousel: View {
    @ObservedObject var model: RTAppModel
    let cards: [RTHomeCard]

    // 시안 스테이지 폭 = 390 - 26*2
    private static let pageW: CGFloat = 390 - 26 * 2
    @State private var drag: CGFloat = 0

    private var index: Int { min(max(0, model.homeCardIndex), cards.count - 1) }

    var body: some View {
        VStack(spacing: 0) {
            chip
            ZStack {
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    cardView(card)
                        .opacity(i == index ? 1 : 0)          // 한 장만 보이되 전환은 오프셋으로
                        .offset(x: CGFloat(i - index) * Self.pageW + drag)
                }
            }
            .frame(width: Self.pageW)
            .contentShape(Rectangle())
            .gesture(swipe)
            if cards.count > 1 { dots.padding(.top, 12) }
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

    // 상태 칩 — 종이책은 "읽는 중 · N일째", 밀리는 출처 명시(엎기 대상 아님을 여기서 전달)
    private var chip: some View {
        HStack(spacing: 7) {
            Circle().fill(current.isEbook ? RT.amber : RT.green)
                .frame(width: 6, height: 6).rtBlink(duration: 2.2)
            Text(current.isEbook ? "밀리의서재 · 자동 기록" : "읽는 중")
                .font(.sans(11, 700)).tracking(11 * 0.02)
                .foregroundColor(current.isEbook ? RT.amber : RT.green)
        }
        .padding(EdgeInsets(top: 5, leading: 12, bottom: 5, trailing: 12))
        .background(Capsule().fill(current.isEbook ? RT.amberTint : RT.greenTint))
        .rtRiseIn(dy: 10, duration: 0.5, delay: 0.04)
    }

    private func cardView(_ card: RTHomeCard) -> some View {
        VStack(spacing: 0) {
            RTBook3D(front: AnyView(
                RTRemoteCover(url: card.coverUrl, size: .init(width: 172, height: 252), radius: 0,
                              title: card.title, author: card.author)
                    .rtBookFace(size: .init(width: 172, height: 252))),
                     spineTitle: card.title)
                .rtBookDropIn()
                .padding(.top, 24)
            VStack(spacing: 0) {
                Text(card.title).font(.sans(23, 900)).tracking(23 * -0.03)
                    .foregroundColor(RT.ink).lineLimit(1).minimumScaleFactor(0.6)
                Text(card.author ?? "밀리의서재").font(.sans(12.5, 500))
                    .foregroundColor(RT.muted).padding(.top, 3).lineLimit(1).minimumScaleFactor(0.8)
                Group {
                    if card.isEbook {
                        // 엎어도 기록되지 않는다는 사실을 카드에서 직접 알린다
                        Text("밀리에서 읽은 시간은 자동으로 합산돼요")
                            .font(.sans(11.5, 500)).foregroundColor(RT.faint)
                    } else if let isbn = card.isbn {
                        HStack(spacing: 8) {
                            Text(RTAppModel.hmString(model.totalSeconds(isbn: isbn)))
                                .font(.mono(14, 700)).foregroundColor(RT.ink)
                            Circle().fill(RT.ghost).frame(width: 3, height: 3)
                            Text("\(model.sessionCount(isbn: isbn))회 함께 읽음")
                                .font(.sans(11.5, 500)).foregroundColor(RT.faint)
                        }
                    }
                }
                .padding(.top, 9)
            }
            .padding(.top, 16)
            .rtRiseIn(delay: 0.18)
        }
        .frame(width: Self.pageW)
    }

    private var dots: some View {
        HStack(spacing: 6) {
            ForEach(Array(cards.enumerated()), id: \.element.id) { i, _ in
                Circle()
                    .fill(i == index ? RT.ink : RT.ghost)
                    .frame(width: i == index ? 6 : 5, height: i == index ? 6 : 5)
            }
        }
    }
}

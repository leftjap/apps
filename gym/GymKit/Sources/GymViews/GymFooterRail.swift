import SwiftUI
import GymCore

// 세션 하단 운동종목 레일 — 작업지시서 §4 3단 깊이(완료=눌림/현재=떠오름/예정=평면) 네이티브 이식.
// PWA mocks/session.html .fp-* 정합. 상태: done / current / upcoming.

public enum RailState { case done, current, upcoming }

// 완료(done) — 눌린 회색 칩 + 무채색 체크 (§4.2)
struct DoneChip: View {
    let name: String
    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "checkmark")
                .font(.system(size: 8.5, weight: .semibold))
                .foregroundStyle(Color(oklch: 0.72, 0.006, 60))
            Text(name)
                .font(.sans(14.5, 500))
                .lineLimit(1)
                .foregroundStyle(Color(oklch: 0.62, 0.008, 60))
        }
        .padding(.horizontal, 15)
        .frame(height: 40)
        .background(Color(oklch: 0.965, 0.004, 60), in: RoundedRectangle(cornerRadius: 13))
        .overlay(  // inset 0 0 0 1px oklch(93.5% .005 60) — 눌림 테두리
            RoundedRectangle(cornerRadius: 13).strokeBorder(Color(oklch: 0.935, 0.005, 60), lineWidth: 1))
        .overlay(  // inset 0 1px 3px rgba(20,18,14,.09) 근사 — 상단 내부 그림자
            RoundedRectangle(cornerRadius: 13)
                .fill(LinearGradient(colors: [Color(hex: 0x14120E).opacity(0.09), .clear],
                                     startPoint: .top, endPoint: .init(x: 0.5, y: 0.35)))
                .allowsHitTesting(false))
    }
}

// 예정(upcoming) — 평면 아웃라인 칩 (§4.3)
struct UpcomingChip: View {
    let name: String
    var body: some View {
        Text(name)
            .font(.sans(14.5, 600))
            .lineLimit(1)
            .foregroundStyle(Color(oklch: 0.60, 0.008, 60))
            .padding(.horizontal, 15)
            .frame(height: 40)
            .overlay(  // inset 0 0 0 1.5px oklch(91% .006 60)
                RoundedRectangle(cornerRadius: 12).strokeBorder(Color(oklch: 0.91, 0.006, 60), lineWidth: 1.5))
    }
}

// 현재(current) — 떠오른 흰 카드 + crail 테두리 + 브리드 (§4.1 · §5 fpCurrent)
struct CurrentChip: View {
    let name: String
    @State private var breathe = false
    var body: some View {
        Text(name)
            .font(.sans(19, 800))
            .lineLimit(1)
            .foregroundStyle(GY.ink1)
            .tracking(-0.38) // -0.02em @19px
            .padding(.horizontal, 19)
            .frame(height: 50)
            .background(
                LinearGradient(colors: [Color(hex: 0xFFFFFF), Color(hex: 0xFAF9F5)],
                               startPoint: .top, endPoint: .bottom),
                in: RoundedRectangle(cornerRadius: 15))
            .overlay(alignment: .top) {  // 상단 하이라이트 오버레이 (fp-chip__hl)
                RoundedRectangle(cornerRadius: 15)
                    .fill(LinearGradient(colors: [.white.opacity(0.7), .clear], startPoint: .top, endPoint: .bottom))
                    .frame(height: 25)
                    .allowsHitTesting(false)
            }
            .overlay(  // crail 테두리 링 (box-shadow 0 0 0 1.5px)
                RoundedRectangle(cornerRadius: 15).strokeBorder(GY.crailBase, lineWidth: 1.5))
            .shadow(color: Color(hex: 0x14120E).opacity(0.30), radius: 6, x: 0, y: 5)
            .shadow(color: Color(hex: 0x14120E).opacity(0.32), radius: 12, x: 0, y: 14)
            .scaleEffect(breathe ? 1.035 : 1)
            .offset(y: breathe ? -5 : -3)
            .animation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true), value: breathe)
            .onAppear { breathe = true }
    }
}

// ＋ 종목 추가 버튼 (§4.4)
struct AddExerciseButton: View {
    var body: some View {
        Image(systemName: "plus")
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(GY.ink3)
            .frame(width: 44, height: 44)
            .background(GY.card, in: Circle())
            .overlay(Circle().strokeBorder(GY.line, lineWidth: 1))
    }
}

// 레일 컨테이너 — 트랙(스크롤) + ＋버튼(고정). 현재 카드 중앙 정렬은 스크롤/정렬 로직(다음 증분).
public struct GymFooterRail: View {
    public struct Item: Identifiable { public let id = UUID(); public let name: String; public let state: RailState
        public init(name: String, state: RailState) { self.name = name; self.state = state } }
    let items: [Item]
    public init(items: [Item]) { self.items = items }

    public var body: some View {
        // NOTE: 가로 스크롤 + 현재 카드 중앙 정렬은 실 세션 화면 배선 증분에서 ScrollViewReader 로 구현.
        // (ImageRenderer 는 ScrollView 내부 미렌더 → 스냅샷 단계는 평면 HStack.)
        HStack(spacing: 8) {
            HStack(spacing: 10) {
                ForEach(items) { item in
                    switch item.state {
                    case .done: DoneChip(name: item.name)
                    case .current: CurrentChip(name: item.name)
                    case .upcoming: UpcomingChip(name: item.name)
                    }
                }
            }
            .fixedSize(horizontal: true, vertical: false) // white-space:nowrap — 칩 자연폭 유지
            .padding(.vertical, 12)
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, alignment: items.count <= 1 ? .center : .leading)
            .clipped()
            AddExerciseButton()
        }
        .padding(.top, 16).padding(.bottom, 22).padding(.horizontal, 12)
        .overlay(alignment: .top) { Rectangle().fill(GY.lineSoft).frame(height: 1) } // inset 상단 구분선
        .background(GY.shell)
    }
}

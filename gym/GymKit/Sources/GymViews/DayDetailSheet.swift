import SwiftUI
import GymCore

// 날짜 상세 바텀시트 (spec §9-1·§5-2, mocks #dayDetailSheet 픽셀 정합).
// step: summary(기록 요약) / confirm(꾹누르기 → 세션 삭제 확인).
struct DayDetailSheet: View {
    let iso: String
    let entry: GymDayEntry?          // nil = 기록 없음
    var step: Step = .summary
    let onDelete: () -> Void
    let onCancel: () -> Void
    enum Step { case summary, confirm }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(GymDayDetailLogic.dayLabel(iso))
                    .font(.sans(16, 600)).foregroundStyle(GY.ink1)
                    .accessibilityIdentifier("daydetail-date")
                Spacer()
                if step == .summary, let entry, !entry.tag.isEmpty {
                    Text(entry.tag).font(.sans(13, 500)).foregroundStyle(GY.ink3)
                }
            }
            .padding(.bottom, 14)
            switch step {
            case .summary: summary
            case .confirm: confirm
            }
        }
        .padding(.init(top: 18, leading: 18, bottom: 24, trailing: 18))
        .frame(maxWidth: .infinity)
        .background {
            UnevenRoundedRectangle(cornerRadii: .init(topLeading: GY.rXl, topTrailing: GY.rXl))
                .fill(GY.card)
                .shadow(color: Color(hex: 0x14120E).opacity(0.4), radius: 25, y: -10)
        }
    }

    @ViewBuilder var summary: some View {
        if let entry {
            // 메타 칩 — "52분 · 3종목 · 12세트 · 888kg" (볼륨 강조)
            let setCount = entry.ex.reduce(0) { $0 + $1.setCount }
            HStack(spacing: 14) {
                if entry.min > 0 { Text("\(entry.min)분").font(.sans(14, 500)).foregroundStyle(GY.ink2) }
                if !entry.ex.isEmpty { Text("\(entry.ex.count)종목").font(.mono(14, 500)).foregroundStyle(GY.ink2) }
                if setCount > 0 { Text("\(setCount)세트").font(.mono(14, 500)).foregroundStyle(GY.ink2) }
                if entry.vol > 0 {
                    Text("\(GymDayDetailLogic.loc(entry.vol))kg").font(.mono(14, 600)).foregroundStyle(GY.ink1)
                }
                Spacer()
            }
            .padding(.bottom, 12)
            VStack(spacing: 0) {
                ForEach(Array(entry.ex.enumerated()), id: \.offset) { i, it in
                    HStack {
                        Text(it.n).font(.sans(15, 500)).foregroundStyle(GY.ink1).lineLimit(1)
                        Spacer()
                        Text(it.s).font(.mono(14, 500)).foregroundStyle(GY.ink3)
                    }
                    .padding(.vertical, 8)
                    .overlay(alignment: .bottom) {
                        if i < entry.ex.count - 1 { Rectangle().fill(GY.lineSoft).frame(height: 1) }
                    }
                }
            }
        } else {
            Text("기록 없음").font(.sans(14, 500)).foregroundStyle(GY.ink4)
                .frame(maxWidth: .infinity).padding(.vertical, 24)
        }
    }

    var confirm: some View {
        VStack(spacing: 8) {
            Text("이 날짜의 기록을 삭제하시겠습니까?")
                .font(.sans(15, 500)).foregroundStyle(GY.ink1)
                .padding(.top, 8).padding(.bottom, 12)
            Button(action: onDelete) {
                Text("삭제").font(.sans(16, 600)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(GY.danger, in: RoundedRectangle(cornerRadius: GY.rMd))
            }.buttonStyle(.plain).accessibilityIdentifier("daydetail-delete")
            Button(action: onCancel) {
                Text("취소").font(.sans(16, 600)).foregroundStyle(GY.ink3)
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rMd))
                    .overlay(RoundedRectangle(cornerRadius: GY.rMd).strokeBorder(GY.line, lineWidth: 1))
            }.buttonStyle(.plain)
        }
    }
}

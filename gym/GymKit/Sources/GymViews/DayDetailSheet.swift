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
            // 그래버 — mocks #dayDetailSheet 40×4 radius2 --line, margin 0 auto 14px
            RoundedRectangle(cornerRadius: 2).fill(GY.line)
                .frame(width: 40, height: 4).padding(.bottom, 14)
            HStack {
                Text(GymDayDetailLogic.dayLabel(iso))
                    .font(.sans(16, 600)).foregroundStyle(GY.ink1)
                    .accessibilityIdentifier("daydetail-date")
                Spacer()
                if step == .summary, let entry, !entry.tag.isEmpty {
                    Text(entry.tag).font(.sans(13, 500)).foregroundStyle(GY.ink3)
                }
            }
            .padding(.bottom, 12)
            switch step {
            case .summary: summary
            case .confirm: confirm
            }
        }
        .padding(.init(top: 12, leading: 20, bottom: 24, trailing: 20))
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
            // #dayDetailMeta — 13px ink-3 / 볼륨만 ink-1 600, gap 14, margin-bottom 10
            HStack(spacing: 14) {
                if entry.min > 0 { Text("\(entry.min)분").font(.sans(13, 400)).foregroundStyle(GY.ink3) }
                if !entry.ex.isEmpty { Text("\(entry.ex.count)종목").font(.mono(13, 400)).foregroundStyle(GY.ink3) }
                if setCount > 0 { Text("\(setCount)세트").font(.mono(13, 400)).foregroundStyle(GY.ink3) }
                if entry.vol > 0 {
                    Text("\(GymDayDetailLogic.loc(entry.vol))kg").font(.mono(13, 600)).foregroundStyle(GY.ink1)
                }
                Spacer()
            }
            .padding(.bottom, 10)
            if entry.ex.isEmpty {
                Text("운동 기록 없음").font(.sans(14, 400)).foregroundStyle(GY.ink4)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 0) {   // day-detail-sheet.js:78 — 15px ink-1 400 / 값 mono ink-3, 전 행 하단선
                    ForEach(Array(entry.ex.enumerated()), id: \.offset) { _, it in
                        HStack {
                            Text(it.n).font(.sans(15, 400)).foregroundStyle(GY.ink1).lineLimit(1)
                            Spacer()
                            Text(it.s).font(.mono(15, 400)).foregroundStyle(GY.ink3)
                        }
                        .padding(.vertical, 8)
                        .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
                    }
                }
            }
        } else {
            Text("기록 없음").font(.sans(14, 400)).foregroundStyle(GY.ink4)
                .frame(maxWidth: .infinity).padding(.vertical, 24)
        }
    }

    var confirm: some View {
        VStack(spacing: 8) {
            Text("이 날짜의 기록을 삭제하시겠습니까?")
                .font(.sans(15, 400)).foregroundStyle(GY.ink2)
                .padding(.top, 8).padding(.bottom, 12)
            Button(action: onDelete) {
                Text("삭제").font(.sans(16, 600)).foregroundStyle(.white)
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(GY.danger, in: RoundedRectangle(cornerRadius: GY.rMd))
            }.buttonStyle(.plain).accessibilityIdentifier("daydetail-delete")
            Button(action: onCancel) {
                Text("취소").font(.sans(16, 500)).foregroundStyle(GY.ink3)
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rMd))
                    .overlay(RoundedRectangle(cornerRadius: GY.rMd).strokeBorder(GY.line, lineWidth: 1))
            }.buttonStyle(.plain)
        }
    }
}

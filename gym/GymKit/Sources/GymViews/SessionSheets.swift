import SwiftUI
import GymCore

// 운동 추가 바텀시트 (spec §6-2, mocks .addex-sheet 픽셀 정합).
// 부위 칩 → 종목 리스트 (숨김/삭제 제외·관리 순서 반영). 종목 탭 = 추가/제거 토글 (다중 자유).
struct AddExerciseSheet: View {
    @ObservedObject var model: GymAppModel
    @State var part: String
    var inline: Bool = false            // 빈 세션 인라인 (그림자 약하게, 항상 표시)

    init(model: GymAppModel, initialPart: String = "chest", inline: Bool = false) {
        self.model = model
        _part = State(initialValue: initialPart)
        self.inline = inline
    }

    static func meta(_ def: GymExerciseDef) -> String {
        switch def.equipment {
        case "cardio":     return "시간 기반"
        case "bodyweight": return "자체 × \(def.defaultReps)회"
        default:           return String(format: "%gkg × %d회", def.defaultWeight, def.defaultReps)
        }
    }

    var chipsRow: some View {
        HStack(spacing: 8) {
            ForEach(GymExercises.partOrder, id: \.self) { pid in
                let active = pid == part
                Button { part = pid } label: {
                    Text(GymExercises.partName(pid))
                        .font(.sans(14, active ? 600 : 500))
                        .lineLimit(1).fixedSize()
                        .foregroundStyle(active ? GY.ink1 : GY.ink3)
                        .padding(.horizontal, 15).padding(.vertical, 8)
                        .background(active ? GY.crailSoft : GY.card, in: Capsule())
                        .overlay(Capsule().strokeBorder(active ? GY.crailBase : GY.line, lineWidth: 1))
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .fixedSize(horizontal: true, vertical: false)   // nowrap — 칩 자연폭 (초과분은 스크롤/클립)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var listColumn: some View {
        let items = model.selectableExercises(part: part)
        return VStack(spacing: 0) {
            if items.isEmpty {
                Text("이 부위에 표시할 종목이 없습니다")
                    .font(.sans(14, 500)).foregroundStyle(GY.ink4)
                    .padding(.vertical, 24)
            }
            ForEach(Array(items.enumerated()), id: \.element.id) { i, def in
                let added = model.hasExercise(def.id)
                Button {
                    added ? model.removeExercise(def.id) : model.addExercise(def.id)
                } label: {
                    HStack(spacing: 12) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(def.name).font(.sans(16, 500)).foregroundStyle(GY.ink1).lineLimit(1)
                            Spacer(minLength: 8)
                            Text(Self.meta(def)).font(.mono(13, 500)).foregroundStyle(GY.ink4)
                                .lineLimit(1).fixedSize()
                        }
                        // 토글 스위치 (mock .ex-toggle 36×22)
                        Capsule().fill(added ? GY.crailBase : GY.line)
                            .frame(width: 36, height: 22)
                            .overlay(alignment: added ? .trailing : .leading) {
                                Circle().fill(GY.card)
                                    .shadow(color: Color(hex: 0x14120E).opacity(0.15), radius: 2, y: 1)
                                    .padding(2)
                            }
                    }
                    .padding(.vertical, 14).padding(.horizontal, 12)
                    .overlay(alignment: .top) {
                        if i > 0 { Rectangle().fill(GY.lineSoft).frame(height: 1) }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("addex-\(def.id)")
            }
        }
        .padding(.horizontal, 12)
    }

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(GY.line).frame(width: 38, height: 4).padding(.bottom, 16)
            // 부위 칩 — 스냅샷 모드는 평면(ImageRenderer 가 ScrollView 내부 미렌더), 실기기는 가로 스크롤.
            if GymSnapshot.isActive {
                chipsRow.frame(width: 390, alignment: .leading).clipped()
            } else {
                ScrollView(.horizontal, showsIndicators: false) { chipsRow }
            }
            // 종목 리스트
            if GymSnapshot.isActive {
                listColumn.clipped()
                Spacer(minLength: 0)
            } else {
                ScrollView { listColumn }.padding(.top, 12)
            }
        }
        .padding(.top, 14).padding(.bottom, 22)
        .frame(maxWidth: .infinity)
        .frame(height: 844 * 0.66)   // mock height:66%
        .background {
            UnevenRoundedRectangle(cornerRadii: .init(topLeading: GY.rXl, topTrailing: GY.rXl))
                .fill(GY.card)
                .shadow(color: Color(hex: 0x14120E).opacity(inline ? 0.18 : 0.18), radius: 20, y: -8)
        }
    }
}

// 액션 시트 (spec §6-9, mocks #actionSheet 정합). 파괴 액션은 선택 → 확인 2단계.
struct GymActionItem: Identifiable {
    let id: String
    let label: String
    var danger: Bool = false
}

struct GymActionSheet: View {
    let title: String
    let items: [GymActionItem]
    let onSelect: (String) -> Void
    let onCancel: () -> Void
    @State private var confirming: GymActionItem? = nil

    var body: some View {
        VStack(spacing: 0) {
            Capsule().fill(GY.line).frame(width: 38, height: 4).padding(.bottom, 14)
            Text(title).font(.sans(14, 600)).foregroundStyle(GY.ink3).padding(.bottom, 14)
            VStack(spacing: 6) {
                if let c = confirming {
                    // 확인 단계 — danger solid 버튼 (mock .action-confirm)
                    Button { onSelect(c.id) } label: {
                        Text("\(c.label) 확인").font(.sans(16, 600)).foregroundStyle(.white)
                            .frame(maxWidth: .infinity).frame(height: 50)
                            .background(GY.danger, in: RoundedRectangle(cornerRadius: GY.rMd))
                    }.buttonStyle(.plain).accessibilityIdentifier("action-confirm")
                } else {
                    ForEach(items) { item in
                        Button {
                            if item.danger { confirming = item } else { onSelect(item.id) }
                        } label: {
                            Text(item.label).font(.sans(16, item.danger ? 600 : 500))
                                .foregroundStyle(item.danger ? GY.danger : GY.ink1)
                                .frame(maxWidth: .infinity).frame(height: 50)
                                .background(GY.sunken, in: RoundedRectangle(cornerRadius: GY.rMd))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("action-\(item.id)")
                    }
                }
            }
            Button(action: onCancel) {
                Text("취소").font(.sans(15, 600)).foregroundStyle(GY.ink3)
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rMd))
                    .overlay(RoundedRectangle(cornerRadius: GY.rMd).strokeBorder(GY.line, lineWidth: 1))
            }
            .buttonStyle(.plain).accessibilityIdentifier("action-cancel")
            .padding(.top, 14)
        }
        .padding(.top, 12).padding(.horizontal, 16).padding(.bottom, 24)
        .background {
            UnevenRoundedRectangle(cornerRadii: .init(topLeading: GY.rXl, topTrailing: GY.rXl))
                .fill(GY.card)
                .shadow(color: Color(hex: 0x14120E).opacity(0.4), radius: 25, y: -10)
        }
    }
}

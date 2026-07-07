import SwiftUI
import GymCore

// 홈 화면 — mocks/home.html HomeA(idle) 이식. GymAppModel(실 이력·체중) 구동.
public struct HomeScreenView: View {
    @ObservedObject var model: GymAppModel
    var onStart: () -> Void
    var onStats: () -> Void
    var onAdmin: () -> Void
    public init(model: GymAppModel, onStart: @escaping () -> Void = {},
                onStats: @escaping () -> Void = {}, onAdmin: @escaping () -> Void = {}) {
        self.model = model; self.onStart = onStart; self.onStats = onStats; self.onAdmin = onAdmin
    }
    // 데모/스냅샷 편의 init.
    public init(onStart: @escaping () -> Void = {}, onStats: @escaping () -> Void = {}) {
        self.model = GymAppModel(); self.onStart = onStart; self.onStats = onStats; self.onAdmin = {}
    }

    // 부위 밸런스 표시 순서 (mock 가슴/등/어깨/팔/코어/하체).
    static let balanceOrder = ["chest", "back", "shoulder", "arms", "core", "legs"]

    public var body: some View {
        let ref = model.referenceToday
        let week = model.weekCells(around: ref)
        let last = model.lastCompletedSession()
        let thisW = model.partDoneSets(weekOffset: 0, from: ref)
        let lastW = model.partDoneSets(weekOffset: -1, from: ref)
        let latestWeight = model.weights.first

        return VStack(spacing: 0) {
            header
            weekCalendar(week).padding(.horizontal, 18).padding(.top, 18)
            lastWorkoutRow(last, ref: ref)
            balance(thisW: thisW, lastW: lastW)
            weightRow(latestWeight).padding(.horizontal, 24)
            cta
        }
        .frame(width: 390)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(GY.shell)
    }

    var header: some View {
        HStack {
            Text("Gym").font(.sans(23, 700)).tracking(-0.69).foregroundStyle(GY.ink1)
            Spacer()
            HStack(spacing: 2) {
                Button(action: onStats) {
                    Text("통계").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain).accessibilityIdentifier("home-stats")
                Button(action: onAdmin) {
                    Text("관리").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain).accessibilityIdentifier("home-admin")
            }
        }
        .padding(.horizontal, 24).padding(.top, 8)
    }

    func weekCalendar(_ week: [GymAppModel.HomeWeekCell]) -> some View {
        HStack(spacing: 0) {
            ForEach(week) { d in
                VStack(spacing: 6) {
                    Text(d.label).font(.sans(11, 600)).tracking(0.44)
                        .foregroundStyle(d.isToday ? GY.crailDeep : GY.ink4)
                    ZStack {
                        Circle().fill(d.isToday ? GY.crailBase : .clear).frame(width: 28, height: 28)
                        if d.isLast && !d.isToday { Circle().strokeBorder(GY.crailSoft, lineWidth: 1.5).frame(width: 28, height: 28) }
                        Text("\(d.num)").font(.mono(14, 500))
                            .foregroundStyle(d.isToday ? .white : (d.worked ? GY.ink2 : GY.ink4))
                        if d.worked {
                            Circle().fill(d.isToday ? Color.white : GY.crailBase)
                                .frame(width: 4, height: 4).offset(y: 13)
                        }
                    }.frame(height: 28)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    func lastWorkoutRow(_ last: GymSession?, ref: Date) -> some View {
        let parts = (last?.tags ?? []).map { GymExercises.partName($0) }.joined(separator: " · ")
        let ago: String = {
            guard let last else { return "기록 없음" }
            let d = model.daysAgo(last.date, from: ref)
            let rel = d <= 0 ? "오늘" : (d == 1 ? "어제" : "\(d)일 전")
            return "\(rel) · \(last.durationMin)분"
        }()
        return HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 9).fill(GY.sunken).frame(width: 30, height: 30)
                .overlay(Image(systemName: "dumbbell.fill").font(.system(size: 12)).foregroundStyle(GY.ink3))
            Text("직전 운동").font(.sans(12, 600)).tracking(0.24).foregroundStyle(GY.ink4)
            Text(parts.isEmpty ? "—" : parts).font(.sans(15, 700)).foregroundStyle(GY.ink1).lineLimit(1)
            Spacer()
            Text(ago).font(.sans(12.5, 500)).foregroundStyle(GY.ink4)
        }
        .padding(.horizontal, 24).padding(.top, 18)
    }

    func balance(thisW: [String: Int], lastW: [String: Int]) -> some View {
        let parts = Self.balanceOrder.map { pid in
            (name: GymExercises.partName(pid), last: lastW[pid] ?? 0, this: thisW[pid] ?? 0, pid: pid)
        }
        let totalThis = parts.map(\.this).reduce(0, +)
        let totalLast = parts.map(\.last).reduce(0, +)
        let diff = totalThis - totalLast
        // 초점 부위 = 이번 주 최소 세트 (동률 시 balanceOrder 우선).
        let focusPid = parts.min { $0.this < $1.this }?.pid ?? ""
        let focusName = GymExercises.partName(focusPid)
        let maxSets = max(1, parts.flatMap { [$0.last, $0.this] }.max() ?? 1)

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("부위 밸런스").font(.sans(14, 700)).tracking(-0.14).foregroundStyle(GY.ink1)
                Spacer()
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2.5).fill(Color(oklch: 0.91, 0.012, 65)).frame(width: 9, height: 9)
                    Text("지난주").font(.mono(11, 500)).foregroundStyle(GY.ink4)
                    RoundedRectangle(cornerRadius: 2.5).fill(Color(oklch: 0.26, 0.01, 60)).frame(width: 9, height: 9).padding(.leading, 4)
                    Text("이번 주").font(.mono(11, 500)).foregroundStyle(GY.ink4)
                }
            }
            HStack(alignment: .bottom, spacing: 9) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(totalThis)").font(.mono(33, 700)).tracking(-1.15).foregroundStyle(GY.ink1)
                    Text("세트").font(.sans(12.5, 600)).foregroundStyle(GY.ink4)
                }
                balChip(diff >= 0 ? "▲ +\(diff)" : "▼ \(diff)",
                        tint: Color(oklch: 0.94, 0.03, 150), border: Color(oklch: 0.84, 0.05, 150), fg: Color(oklch: 0.42, 0.08, 150))
                Spacer()
                balChip("● \(focusName)", tint: GY.crailTint, border: GY.crailSoft, fg: GY.crailDeep)
            }
            .padding(.top, 14)
            // 페어 컬럼 — 최대세트 기준 스케일(최대 56px), 최소 3px.
            HStack(alignment: .bottom, spacing: 0) {
                ForEach(parts, id: \.pid) { p in
                    let focus = p.pid == focusPid
                    VStack(spacing: 7) {
                        Text("\(p.this)").font(.mono(14, 700)).foregroundStyle(focus ? GY.crailDeep : GY.ink1)
                        HStack(alignment: .bottom, spacing: 3) {
                            RoundedRectangle(cornerRadius: 4).fill(Color(oklch: 0.91, 0.012, 65))
                                .frame(width: 12, height: barH(p.last, maxSets))
                            UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4.5, topTrailing: 4.5))
                                .fill(focus ? GY.crailBase : Color(oklch: 0.26, 0.01, 60))
                                .frame(width: 15, height: barH(p.this, maxSets))
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 18)
            HStack(spacing: 0) {
                ForEach(parts, id: \.pid) { p in
                    Text(p.name).font(.sans(12.5, p.pid == focusPid ? 700 : 600)).tracking(-0.13)
                        .foregroundStyle(p.pid == focusPid ? GY.crailDeep : GY.ink2)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 8)
            .overlay(alignment: .top) { Rectangle().fill(Color(oklch: 0.88, 0.008, 60)).frame(height: 1.5) }
        }
        .frame(maxHeight: .infinity)
        .padding(.horizontal, 26).padding(.top, 22)
    }

    // 세트수 → 막대 높이 (최대 56px 스케일, 0=3px).
    func barH(_ sets: Int, _ maxSets: Int) -> CGFloat {
        sets <= 0 ? 3 : CGFloat((Double(sets) / Double(maxSets) * 56).rounded())
    }

    func balChip(_ text: String, tint: Color, border: Color, fg: Color) -> some View {
        Text(text).font(.mono(11.5, 700)).foregroundStyle(fg)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(tint, in: Capsule())
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))
            .padding(.bottom, 2)
    }

    func weightRow(_ latest: GymWeight?) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("오늘 체중").font(.sans(14, 600)).foregroundStyle(GY.ink1)
                Text(latest.map { "직전 \(Self.wf.string(from: NSNumber(value: $0.kg)) ?? "\($0.kg)")kg" } ?? "기록 없음")
                    .font(.sans(12, 500)).foregroundStyle(GY.ink4)
            }
            Spacer()
            Text("기록하기").font(.sans(13, 600)).foregroundStyle(GY.crailDeep)
                .padding(.horizontal, 17).padding(.vertical, 10)
                .background(GY.crailTint, in: Capsule())
                .overlay(Capsule().strokeBorder(GY.crailSoft, lineWidth: 1))
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
        .shadow(color: Color(hex: 0x14120E).opacity(0.10), radius: 12, y: 6)
    }
    static let wf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 1; return f }()

    var cta: some View {
        Button(action: onStart) {
            Text("운동 시작").font(.sans(16, 600)).foregroundStyle(Color(hex: 0xFBF8F2))
                .frame(maxWidth: .infinity).frame(height: 56)
                .background(GY.ink1, in: RoundedRectangle(cornerRadius: GY.rLg))
        }
        .buttonStyle(.plain).accessibilityIdentifier("home-cta")
        .padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 24)
    }
}

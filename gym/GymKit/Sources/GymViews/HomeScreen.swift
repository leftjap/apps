import SwiftUI

// 홈 화면 — mocks/home.html HomeA(idle) 이식. 정적 데모 데이터.

// 주간 캘린더 1일
struct CalDay: Identifiable {
    let id = UUID()
    let label: String   // 월..일
    let num: Int
    let worked: Bool
    let today: Bool
    let last: Bool
}

// 부위 밸런스 1개
struct BalPart: Identifiable {
    let id = UUID()
    let name: String
    let lastSets: Int
    let thisSets: Int
    let focus: Bool     // 최소부위(코어)
}

public struct HomeScreenView: View {
    var onStart: () -> Void
    var onStats: () -> Void
    public init(onStart: @escaping () -> Void = {}, onStats: @escaping () -> Void = {}) {
        self.onStart = onStart; self.onStats = onStats
    }

    let week: [CalDay] = [
        .init(label: "월", num: 6, worked: true, today: false, last: true),
        .init(label: "화", num: 7, worked: true, today: true, last: false),
        .init(label: "수", num: 8, worked: false, today: false, last: false),
        .init(label: "목", num: 9, worked: false, today: false, last: false),
        .init(label: "금", num: 10, worked: false, today: false, last: false),
        .init(label: "토", num: 11, worked: false, today: false, last: false),
        .init(label: "일", num: 12, worked: false, today: false, last: false),
    ]
    let parts: [BalPart] = [
        .init(name: "가슴", lastSets: 4, thisSets: 5, focus: false),
        .init(name: "등", lastSets: 5, thisSets: 4, focus: false),
        .init(name: "어깨", lastSets: 3, thisSets: 3, focus: false),
        .init(name: "팔", lastSets: 2, thisSets: 3, focus: false),
        .init(name: "코어", lastSets: 1, thisSets: 1, focus: true),
        .init(name: "하체", lastSets: 6, thisSets: 5, focus: false),
    ]

    public var body: some View {
        VStack(spacing: 0) {
            header
            weekCalendar.padding(.horizontal, 18).padding(.top, 18)
            lastWorkout
            balance
            weightRow.padding(.horizontal, 24)
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
                Text("관리").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
            }
        }
        .padding(.horizontal, 24).padding(.top, 8)
    }

    var weekCalendar: some View {
        HStack(spacing: 0) {
            ForEach(week) { d in
                VStack(spacing: 6) {
                    Text(d.label).font(.sans(11, 600)).tracking(0.44)
                        .foregroundStyle(d.today ? GY.crailDeep : GY.ink4)
                    ZStack {
                        Circle().fill(d.today ? GY.crailBase : .clear).frame(width: 28, height: 28)
                        if d.last { Circle().strokeBorder(GY.crailSoft, lineWidth: 1.5).frame(width: 28, height: 28) }
                        Text("\(d.num)").font(.mono(14, 500))
                            .foregroundStyle(d.today ? .white : (d.worked ? GY.ink2 : GY.ink4))
                        if d.worked {
                            Circle().fill(d.today ? Color.white : GY.crailBase)
                                .frame(width: 4, height: 4).offset(y: 13)
                        }
                    }.frame(height: 28)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    var lastWorkout: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 9).fill(GY.sunken).frame(width: 30, height: 30)
                .overlay(Image(systemName: "dumbbell.fill").font(.system(size: 12)).foregroundStyle(GY.ink3))
            Text("직전 운동").font(.sans(12, 600)).tracking(0.24).foregroundStyle(GY.ink4)
            Text("가슴 · 삼두").font(.sans(15, 700)).foregroundStyle(GY.ink1)
            Spacer()
            Text("어제 · 52분").font(.sans(12.5, 500)).foregroundStyle(GY.ink4)
        }
        .padding(.horizontal, 24).padding(.top, 18)
    }

    var balance: some View {
        let totalThis = parts.map(\.thisSets).reduce(0, +)
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
            // 요약
            HStack(alignment: .bottom, spacing: 9) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(totalThis)").font(.mono(33, 700)).tracking(-1.15).foregroundStyle(GY.ink1)
                    Text("세트").font(.sans(12.5, 600)).foregroundStyle(GY.ink4)
                }
                balChip("▲ +3", tint: Color(oklch: 0.94, 0.03, 150), border: Color(oklch: 0.84, 0.05, 150), fg: Color(oklch: 0.42, 0.08, 150))
                Spacer()
                balChip("● 코어", tint: GY.crailTint, border: GY.crailSoft, fg: GY.crailDeep)
            }
            .padding(.top, 14)
            // 차트 (페어 컬럼) — 7px/세트 (작업지시서 §4.1)
            HStack(alignment: .bottom, spacing: 0) {
                ForEach(parts) { p in
                    VStack(spacing: 7) {
                        Text("\(p.thisSets)").font(.mono(14, 700))
                            .foregroundStyle(p.focus ? GY.crailDeep : GY.ink1)
                        HStack(alignment: .bottom, spacing: 3) {
                            RoundedRectangle(cornerRadius: 4).fill(Color(oklch: 0.91, 0.012, 65))
                                .frame(width: 12, height: CGFloat(p.lastSets) * 7)
                            UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4.5, topTrailing: 4.5))
                                .fill(p.focus ? GY.crailBase : Color(oklch: 0.26, 0.01, 60))
                                .frame(width: 15, height: CGFloat(p.thisSets) * 7)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 18)
            // 라벨
            HStack(spacing: 0) {
                ForEach(parts) { p in
                    Text(p.name).font(.sans(12.5, p.focus ? 700 : 600)).tracking(-0.13)
                        .foregroundStyle(p.focus ? GY.crailDeep : GY.ink2)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 8)
            .overlay(alignment: .top) { Rectangle().fill(Color(oklch: 0.88, 0.008, 60)).frame(height: 1.5) }
        }
        .frame(maxHeight: .infinity)
        .padding(.horizontal, 26).padding(.top, 22)
    }

    func balChip(_ text: String, tint: Color, border: Color, fg: Color) -> some View {
        Text(text).font(.mono(11.5, 700)).foregroundStyle(fg)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(tint, in: Capsule())
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))
            .padding(.bottom, 2)
    }

    var weightRow: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("오늘 체중").font(.sans(14, 600)).foregroundStyle(GY.ink1)
                Text("직전 72.4kg").font(.sans(12, 500)).foregroundStyle(GY.ink4)
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

    var cta: some View {
        Button(action: onStart) {
            Text("운동 시작").font(.sans(16, 600)).foregroundStyle(Color(hex: 0xFBF8F2))
                .frame(maxWidth: .infinity).frame(height: 56)
                .background(GY.ink1, in: RoundedRectangle(cornerRadius: GY.rLg))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-cta")
        .padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 24)
    }
}

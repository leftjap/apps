import SwiftUI

// v8 바텀시트 — 스펙: frames/07·09·13.html. rtshot 은 베이스 화면 + 딤 + 시트 합성.

// 시트 셸 (bottom-anchored, r26 top, v8Up 종료 상태)
struct SheetShell<Content: View>: View {
    var topPadding: CGFloat = 12
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack {
            Spacer(minLength: 0)
            VStack(spacing: 0) {
                RoundedRectangle(cornerRadius: 99).fill(Color(hex: 0xE2DCCB))
                    .frame(width: 40, height: 4)
                    .padding(.bottom, 16)
                content()
            }
            .padding(EdgeInsets(top: topPadding, leading: 26, bottom: 30, trailing: 26))
            .frame(maxWidth: .infinity)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26)
                    .fill(RT.sheet)
                    .shadow(color: Color(hex: 0x14100A, alpha: 0.4), radius: 24, x: 0, y: -20)
            )
        }
    }
}

struct SheetHead: View {
    let title: String
    var onClose: (() -> Void)? = nil
    var body: some View {
        HStack {
            Text(title).font(.sans(20, 900)).tracking(20 * -0.02).foregroundColor(RT.ink)
            Spacer()
            RoundedRectangle(cornerRadius: 9).fill(RT.segBg)
                .frame(width: 32, height: 32)
                .overlay(RTIcon(["M6 6l12 12M18 6L6 18"], size: 14, stroke: RT.muted, lineWidth: 2.4, cap: .round, join: .miter))
                .contentShape(Rectangle())
                .onTapGesture { onClose?() }
        }
    }
}

// ── 07 시간 직접 추가 ──
public struct Sheet07AddTime: View {
    var model: RTAppModel?
    private let value: Int
    private let selPreset: Int?

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.value = model?.addtimeValue ?? 35
        // model 없음(정적 데모) = +15 선택 / model 있고 preset nil = 미선택 (이중 옵셔널 구분)
        self.selPreset = model.map(\.addtimePreset) ?? 15
    }

    public var body: some View {
        SheetShell {
            VStack(spacing: 0) {
                SheetHead(title: "시간 직접 추가", onClose: { model?.closeSheet() })
                bookRow.padding(.top, 18)
                stepper.padding(.top, 24)
                presets.padding(.top, 20)
                whenRow.padding(.top, 20)
                RTCTAPlain("\(value)분 추가하기")
                    .contentShape(Rectangle())
                    .onTapGesture { model?.addTime() }
                    .padding(.top, 18)
            }
        }
    }

    var bookRow: some View {
        HStack(spacing: 11) {
            ZStack(alignment: .topLeading) {
                RT.kraftGrad(CGSize(width: 30, height: 42))
                Rectangle().fill(Color.black.opacity(0.16)).frame(width: 2)
                Text("몰입").font(.sans(8, 900)).foregroundColor(Color(hex: 0x241C0D))
                    .frame(maxWidth: .infinity).padding(.top, 12)
            }
            .frame(width: 30, height: 42)
            .clipShape(RoundedRectangle(cornerRadius: 3))
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.3), radius: 3, x: 0, y: 3)
            VStack(alignment: .leading, spacing: 2) {
                Text("몰입").font(.sans(13.5, 700)).foregroundColor(RT.ink)
                Text("미하이 칙센트미하이").font(.sans(11, 500)).foregroundColor(RT.faint)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            ChevronRight(width: 7, height: 12, color: Color(hex: 0xC4BCA6))
        }
        .padding(EdgeInsets(top: 10, leading: 13, bottom: 10, trailing: 13))
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(RT.hair, lineWidth: 1))
    }

    var stepper: some View {
        HStack(spacing: 26) {
            Circle().fill(RT.surface)
                .frame(width: 46, height: 46)
                .overlay(Circle().stroke(Color(hex: 0xE5DFCD), lineWidth: 1))
                .overlay(RTIcon(["M5 12h14"], size: 16, stroke: RT.body, lineWidth: 2.4))
                .shadow(color: Color(hex: 0x16140F, alpha: 0.15), radius: 4, x: 0, y: 3)
                .contentShape(Circle())
                .onTapGesture { model?.step(-5) }
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text("\(value)").font(.mono(56, 700)).tracking(56 * -0.04).foregroundColor(RT.ink)
                Text("분").font(.sans(19, 700)).foregroundColor(RT.muted)
            }
            .frame(minWidth: 130)
            Circle().fill(RT.ctaGrad(CGSize(width: 46, height: 46)))
                .frame(width: 46, height: 46)
                .overlay(RTIcon(RTIconPath.plus, size: 16, stroke: RT.ctaText, lineWidth: 2.4))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.42), radius: 5, x: 0, y: 6)
                .contentShape(Circle())
                .onTapGesture { model?.step(5) }
        }
    }

    var presets: some View {
        HStack(spacing: 8) {
            preset(5)
            preset(10)
            preset(15)
            preset(30)
        }
    }

    func preset(_ n: Int) -> some View {
        let sel = selPreset == n
        return Text("+\(n)").font(.mono(12.5, 600))
            .foregroundColor(sel ? RT.ctaText : RT.body)
            .padding(EdgeInsets(top: 8, leading: 15, bottom: 8, trailing: 15))
            .background(Capsule().fill(sel ? RT.ink : RT.segBg))
            .contentShape(Capsule())
            .onTapGesture { model?.preset(n) }
    }

    var whenRow: some View {
        HStack {
            Text("일시").font(.sans(13, 500)).foregroundColor(RT.muted)
            Spacer()
            HStack(spacing: 7) {
                Text("오늘 · 14:14").font(.mono(13, 600)).foregroundColor(RT.ink)
                ChevronRight(width: 7, height: 12, color: Color(hex: 0xC4BCA6))
            }
        }
        .padding(EdgeInsets(top: 13, leading: 15, bottom: 13, trailing: 15))
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(RT.hair, lineWidth: 1))
    }
}

// ── 09 완독 · 별점 ──
public struct Sheet09Finish: View {
    var model: RTAppModel?
    private let rating: Int

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.rating = model?.rating ?? 4
    }

    public var body: some View {
        SheetShell(topPadding: 13) {
            VStack(spacing: 0) {
                coverStage
                Text("다 읽었어요").font(.sans(24, 900)).tracking(24 * -0.03)
                    .foregroundColor(RT.ink).padding(.top, 18)
                Text("몰입 · 미하이 칙센트미하이 · 18일 동안").font(.sans(12.5, 500))
                    .foregroundColor(RT.muted).padding(.top, 6)
                Text("이 책, 어떠셨나요?").font(.sans(12.5, 700))
                    .foregroundColor(Color(hex: 0x4A5A44)).padding(.top, 22)
                stars.padding(.top, 13)
                Text(RTAppModel.ratingLabels[rating] ?? "").font(.sans(12.5, 700))
                    .foregroundColor(Color(hex: 0xB3841F)).padding(.top, 12)
                tiles.padding(.top, 22)
                ctaFinish
                    .contentShape(Rectangle())
                    .onTapGesture { model?.saveFinished() }
                    .padding(.top, 16)
            }
        }
    }

    var coverStage: some View {
        ZStack {
            Ellipse().stroke(Color(hex: 0x3A5C4B, alpha: 0.35), lineWidth: 1.5)
                .frame(width: 110, height: 146) // inset -16, border-radius 50% = 타원
                .rtRippleLoop(duration: 3, delay: 0.4)
            FlowCover(.init(width: 78, height: 114, frameInset: 6,
                            padTop: 0, padBottom: 0, authorEN: nil,
                            titleSize: 21, titleTop: 0, flowSize: 5.5, flowTop: 5,
                            ruleWidth: nil, authorKR: nil, centered: true))
                .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.45), radius: 13, x: 0, y: 16)
                .rtPop(duration: 0.5)
            Circle().fill(RT.ctaGrad(CGSize(width: 30, height: 30)))
                .frame(width: 30, height: 30)
                .overlay(RTIcon(RTIconPath.check, size: 14, stroke: RT.ctaText, lineWidth: 3))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.55), radius: 6, x: 0, y: 6)
                .offset(x: 78 / 2 + 9 - 15, y: 114 / 2 + 9 - 15)
        }
        .frame(width: 78, height: 114)
    }

    static let starPath = "M12 2.6l2.85 5.98 6.55.86-4.8 4.55 1.2 6.5L12 18.2l-5.8 3.29 1.2-6.5-4.8-4.55 6.55-.86z"

    var stars: some View {
        HStack(spacing: 11) {
            ForEach(0..<5, id: \.self) { i in
                Group {
                    if i < rating {
                        ZStack {
                            RTIcon([Self.starPath], size: 34, fill: Color(hex: 0xC9973B))
                            RTIcon([Self.starPath], size: 34, stroke: Color(hex: 0xB3841F), lineWidth: 1, join: .round)
                        }
                        .rtStarPop(delay: Double(i) * 0.08)
                    } else {
                        RTIcon([Self.starPath], size: 34, stroke: Color(hex: 0xD8D2C1), lineWidth: 1.6, join: .round)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture { model?.rate(i + 1) }
            }
        }
    }

    var tiles: some View {
        HStack(spacing: 9) {
            tile(value: "4:12", unit: nil, label: "총 시간")
            tile(value: "8", unit: "회", label: "세션")
            tile(value: "18", unit: "일", label: "함께한 기간")
        }
    }

    func tile(value: String, unit: String?, label: String) -> some View {
        VStack(spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(value).font(.mono(16, 700)).tracking(16 * -0.02).foregroundColor(RT.ink)
                if let unit { Text(unit).font(.sans(11, 400)).foregroundColor(RT.muted) }
            }
            Text(label).font(.sans(10, 600)).foregroundColor(RT.faint)
        }
        .frame(maxWidth: .infinity)
        .padding(EdgeInsets(top: 13, leading: 6, bottom: 13, trailing: 6))
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(RT.hair, lineWidth: 1))
    }

    var ctaFinish: some View {
        GeometryReader { geo in
            Text("완독으로 저장").font(.sans(15.5, 800)).foregroundColor(RT.ctaText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RT.ctaGrad(geo.size))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.38), radius: 9, x: 0, y: 12)
        }
        .frame(height: 54)
    }
}

// rtshot 합성: 베이스 + 딤 + 시트
struct SheetSnapshot<Base: View, Sheet: View>: View {
    let base: Base
    let dim: Color
    let dimOpacity: Double
    let sheet: Sheet

    var body: some View {
        ZStack {
            base
            dim.opacity(dimOpacity)
            sheet
        }
        .frame(width: 390, height: 844)
    }
}

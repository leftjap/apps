import SwiftUI

// 세션 요약 — mocks/summary.html 영수증 카드 이식. 정적 데모 데이터.

// 하단 톱니(찢긴 종이) 영수증 형태 — clip-path zigzag 근사.
struct ReceiptShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let dip = rect.height * 0.010
        let teeth = 12
        let tw = rect.width / CGFloat(teeth)
        p.move(to: CGPoint(x: 0, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: rect.height - dip))
        for i in 0..<teeth {
            let x0 = rect.width - tw * CGFloat(i)
            p.addLine(to: CGPoint(x: x0 - tw / 2, y: rect.height))
            p.addLine(to: CGPoint(x: x0 - tw, y: rect.height - dip))
        }
        p.addLine(to: CGPoint(x: 0, y: rect.height - dip))
        p.closeSubpath()
        return p
    }
}

// 가로 점선 구분
struct DashedDivider: View {
    var body: some View {
        Rectangle().fill(.clear).frame(height: 1.5)
            .overlay(
                GeometryReader { g in
                    Path { $0.move(to: CGPoint(x: 0, y: 0.75)); $0.addLine(to: CGPoint(x: g.size.width, y: 0.75)) }
                        .stroke(GY.line, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                })
    }
}

public struct SummaryScreenView: View {
    var onHome: () -> Void
    public init(onHome: @escaping () -> Void = {}) { self.onHome = onHome }

    struct ExRow { let name: String; let sets: Int; let vol: Int; let pr: Bool }
    let rows: [ExRow] = [
        .init(name: "벤치프레스", sets: 5, vol: 600, pr: true),
        .init(name: "인클라인 덤벨", sets: 4, vol: 168, pr: false),
        .init(name: "케이블 플라이", sets: 3, vol: 120, pr: false),
    ]

    public var body: some View {
        ZStack {
            // 배경 — radial glow + shell
            RadialGradient(colors: [Color(oklch: 0.96, 0.012, 60), .clear], center: .init(x: 0.2, y: -0.1), startRadius: 0, endRadius: 500)
                .background(RadialGradient(colors: [Color(oklch: 0.95, 0.02, 50).opacity(0.6), .clear], center: .init(x: 1.1, y: 1.15), startRadius: 0, endRadius: 400))
                .background(GY.shell)
                .ignoresSafeArea()

            receipt
                .frame(width: 286)
                .background(ReceiptShape().fill(Color(hex: 0xFFFDF8)))
                .shadow(color: Color(hex: 0x14120E).opacity(0.16), radius: 20, y: 14)
        }
    }

    var receipt: some View {
        VStack(spacing: 0) {
            // 헤더
            VStack(spacing: 0) {
                Text("GYM").font(.mono(22, 600)).tracking(3.5).foregroundStyle(GY.ink1)
                Text("SESSION · #0142").font(.mono(11, 500)).tracking(2).foregroundStyle(GY.ink3).padding(.top, 7)
                Text("2026-05-06 WED · 18:42→19:34").font(.mono(11, 400)).tracking(0.2).foregroundStyle(GY.ink4).padding(.top, 5)
            }.padding(.bottom, 16)
            DashedDivider()
            // 운동 행
            VStack(spacing: 0) {
                ForEach(rows.indices, id: \.self) { i in
                    let r = rows[i]
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        HStack(spacing: 6) {
                            Text(r.name).font(.sans(13, 500)).foregroundStyle(r.pr ? GY.crailDeep : GY.ink1).lineLimit(1)
                            if r.pr { Text("★").font(.system(size: 11)).foregroundStyle(GY.crailDeep) }
                        }
                        Spacer()
                        Text("\(r.sets)세트").font(.mono(12, 400)).foregroundStyle(GY.ink4)
                        Text("\(r.vol)kg").font(.mono(13, 600)).foregroundStyle(GY.ink2)
                            .frame(minWidth: 56, alignment: .trailing)
                    }
                    .padding(.vertical, 7)
                }
            }.padding(.top, 6).padding(.bottom, 12)
            DashedDivider()
            // TOTAL
            HStack(alignment: .firstTextBaseline) {
                Text("TOTAL").font(.mono(12, 600)).tracking(1.44).foregroundStyle(GY.ink3)
                Spacer()
                (Text("888").font(.mono(38, 500)).tracking(-1.14).foregroundStyle(GY.ink1)
                 + Text(" kg").font(.mono(15, 500)).foregroundStyle(GY.ink4))
            }.padding(.vertical, 14)
            DashedDivider()
            // 메타 3열
            HStack(spacing: 0) {
                metaCol("52분", "소요", .leading)
                metaCol("1", "신기록", .center, crail: true)
                metaCol("12", "세트", .trailing)
            }.padding(.vertical, 13)
            DashedDivider()
            // 스탬프
            HStack(spacing: 7) {
                Text("★").font(.system(size: 11)).foregroundStyle(GY.crailDeep)
                Text("3주 연속 달성").font(.mono(12, 600)).tracking(0.48).foregroundStyle(GY.ink1)
            }
            .padding(.horizontal, 16).padding(.vertical, 7)
            .overlay(Capsule().strokeBorder(GY.crailBase, lineWidth: 1.5))
            .padding(.vertical, 18)
            // 홈으로
            Button(action: onHome) {
                Text("홈으로").font(.sans(15, 600)).foregroundStyle(Color(hex: 0xFBF8F2))
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .background(GY.ink1, in: RoundedRectangle(cornerRadius: GY.rMd))
            }.buttonStyle(.plain).accessibilityIdentifier("summary-home")
        }
        .padding(.horizontal, 26).padding(.top, 26).padding(.bottom, 30)
    }

    func metaCol(_ val: String, _ label: String, _ align: HorizontalAlignment, crail: Bool = false) -> some View {
        VStack(alignment: align, spacing: 3) {
            Text(val).font(.mono(14, 600)).foregroundStyle(crail ? GY.crailDeep : GY.ink1)
            Text(label).font(.sans(10, 500)).tracking(0.4).foregroundStyle(GY.ink4)
        }
        .frame(maxWidth: .infinity, alignment: align == .leading ? .leading : (align == .trailing ? .trailing : .center))
    }
}

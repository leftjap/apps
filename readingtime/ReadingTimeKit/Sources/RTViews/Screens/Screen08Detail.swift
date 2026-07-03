import SwiftUI

// v8 08 책 상세 — 스펙: frames/08.html
public struct Screen08Detail: View {
    public init() {}

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            VStack(alignment: .leading, spacing: 0) {
                topBlock
                ctas.padding(.top, 18)
                logHead.padding(EdgeInsets(top: 26, leading: 0, bottom: 6, trailing: 0))
                logRow(tile: .flip, min: "26분", label: "엎기 · 14:14", right: .today, divider: true)
                logRow(tile: .flip, min: "41분", label: "엎기 · 21:40", right: .date("5.20"), divider: true)
                logRow(tile: .tap, min: "33분", label: "탭 · 08:32", right: .date("5.19"), divider: true)
                logRow(tile: .manual, min: "28분", label: "직접 추가", right: .date("5.18"), divider: true)
                logRow(tile: .flip, min: "19분", label: "엎기 · 22:05", right: .date("5.17"), divider: false)
                Spacer(minLength: 0)
            }
            .padding(EdgeInsets(top: 100 + 2, leading: 24, bottom: 20, trailing: 24))
            header
        }
        .frame(width: 390, height: 844)
    }

    var header: some View {
        HStack {
            RTIcon(RTIconPath.back, size: 17, viewBox: 20, stroke: RT.body, lineWidth: 2.2)
                .frame(width: 38, height: 38)
            Spacer()
            VStack(spacing: 3.2) {
                ForEach(0..<3, id: \.self) { _ in
                    Circle().fill(RT.muted).frame(width: 4.8, height: 4.8)
                }
            }
            .frame(width: 38, height: 38)
        }
        .padding(EdgeInsets(top: 52, leading: 18, bottom: 8, trailing: 18))
        .background(RT.paper)
    }

    var topBlock: some View {
        HStack(alignment: .top, spacing: 18) {
            FlowCover(.init(width: 104, height: 152, spine: 4, frameInset: 7,
                            padTop: 15, padBottom: 11, authorEN: 5,
                            titleSize: 29, titleTop: 17, flowSize: 6.5, flowTop: 6,
                            ruleWidth: 24, authorKR: 6.5))
                .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.45), radius: 12, x: 0, y: 16)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Circle().fill(RT.green).frame(width: 5, height: 5)
                    Text("읽는 중").font(.sans(10.5, 700)).foregroundColor(RT.green)
                }
                .padding(EdgeInsets(top: 4, leading: 10, bottom: 4, trailing: 10))
                .background(RoundedRectangle(cornerRadius: 12).fill(RT.greenTint))
                Text("몰입").font(.sans(23, 900)).tracking(23 * -0.03)
                    .foregroundColor(RT.ink).padding(.top, 11)
                Text("미하이 칙센트미하이 · 한울림").font(.sans(12.5, 500))
                    .foregroundColor(RT.muted).padding(.top, 5)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("4:12").font(.mono(28, 700)).tracking(28 * -0.03).foregroundColor(RT.ink)
                    Text("누적 · 8회 · 18일째").font(.mono(11, 500)).foregroundColor(RT.faint)
                }
                .padding(.top, 14)
            }
            .padding(.top, 2)
        }
    }

    var ctas: some View {
        GeometryReader { row in
            let mainW = (row.size.width - 9) * 1.6 / 2.6 // flex 1.6 : 1
            HStack(spacing: 9) {
                HStack(spacing: 9) {
                    RTIcon(RTIconPath.play, size: 16, fill: RT.ctaText)
                    Text("이어서 읽기").font(.sans(15, 800)).foregroundColor(RT.ctaText)
                }
                .frame(width: mainW, height: 52)
                .background(RT.ctaGrad(CGSize(width: mainW, height: 52)))
                .clipShape(RoundedRectangle(cornerRadius: 15))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.35), radius: 8, x: 0, y: 10) // 0 14 24 -10 근사
                HStack(spacing: 6) {
                    RTIcon(RTIconPath.check, size: 15, stroke: RT.green, lineWidth: 2.4)
                    Text("완독").font(.sans(13.5, 700)).foregroundColor(Color(hex: 0x4A5A44))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(RoundedRectangle(cornerRadius: 15).fill(RT.surface))
                .overlay(RoundedRectangle(cornerRadius: 15).stroke(Color(hex: 0xE5DFCD), lineWidth: 1))
            }
        }
        .frame(height: 52)
    }

    var logHead: some View {
        HStack {
            Text("기록").font(.sans(14.5, 800)).foregroundColor(RT.ink)
            Spacer()
            HStack(spacing: 5) {
                ZStack {
                    Circle().stroke(RT.muted, lineWidth: 2 * 12 / 24).frame(width: 8, height: 8)
                    RTIcon(RTIconPath.clock, size: 12, stroke: RT.muted, lineWidth: 2)
                }
                Text("직접 추가").font(.sans(11.5, 600)).foregroundColor(RT.muted)
            }
        }
    }

    enum Tile { case flip, tap, manual }
    enum Right { case today, date(String) }

    func logRow(tile: Tile, min: String, label: String, right: Right, divider: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 13) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(tile == .flip ? RT.greenTint : RT.segBg)
                    .frame(width: 32, height: 32)
                    .overlay(tileIcon(tile))
                HStack(spacing: 8) {
                    Text(min).font(.mono(15, 700)).foregroundColor(RT.ink)
                    Text(label).font(.sans(12, 500)).foregroundColor(RT.muted)
                }
                Spacer()
                switch right {
                case .today:
                    Text("오늘").font(.sans(12, 600)).foregroundColor(RT.body)
                case .date(let d):
                    Text(d).font(.mono(11.5, 500)).foregroundColor(RT.faint)
                }
            }
            .padding(EdgeInsets(top: 13, leading: 2, bottom: 13, trailing: 2))
            if divider { Rectangle().fill(RT.hair2).frame(height: 1) }
        }
    }

    @ViewBuilder
    func tileIcon(_ t: Tile) -> some View {
        switch t {
        case .flip: FlipIcon(size: 15, color: RT.green, lineWidth: 2)
        case .tap: RTIcon(RTIconPath.tapZone, size: 15, stroke: RT.muted, lineWidth: 2)
        case .manual:
            ZStack {
                Circle().stroke(RT.muted, lineWidth: 2 * 15 / 24).frame(width: 10, height: 10)
                RTIcon(RTIconPath.clock, size: 15, stroke: RT.muted, lineWidth: 2)
            }
        }
    }
}

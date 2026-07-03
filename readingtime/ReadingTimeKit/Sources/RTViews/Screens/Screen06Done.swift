import SwiftUI

// v8 06 세션 완료 — 스펙: frames/06.html (모션 종료 상태 = 타임라인 완료 프레임)
public struct Screen06Done: View {
    var model: RTAppModel?
    public init(model: RTAppModel? = nil) { self.model = model }

    var minutes: Int { (model?.session?.elapsed ?? RTAppModel.demoElapsed) / 60 }
    var seconds: Int { (model?.session?.elapsed ?? RTAppModel.demoElapsed) % 60 }
    var isFlip: Bool { model.map { $0.session?.mode != .tap } ?? true }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            VStack(spacing: 0) {
                ZStack {
                    Circle().stroke(Color(hex: 0x3A5C4B, alpha: 0.4), lineWidth: 1.5)
                        .frame(width: 116, height: 116) // inset -14 정지 프레임
                        .rtRippleLoop(duration: 2.8, delay: 0.5)
                    Circle().fill(RT.ctaGrad(CGSize(width: 88, height: 88)))
                        .frame(width: 88, height: 88)
                        .shadow(color: Color(hex: 0x26413A, alpha: 0.45), radius: 11, x: 0, y: 14)
                        .overlay(
                            RTIcon(RTIconPath.check, size: 38, stroke: RT.ctaText, lineWidth: 2.6)
                                .rtFadeIn(delay: 0.35, duration: 0.7)   // v5Draw 근사
                        )
                        .rtPop(duration: 0.45)
                }
                .frame(width: 88, height: 88)
                Text("기록됐어요").font(.sans(14, 700)).foregroundColor(RT.muted)
                    .padding(.top, 20)
                    .rtEntrance(delay: 0.5, duration: 0.6)
                Text("\(minutes):\(String(format: "%02d", seconds))")
                    .font(.mono(52, 700)).tracking(52 * -0.04)
                    .foregroundColor(RT.ink).padding(.top, 8)
                    .rtEntrance(delay: 0.65, duration: 0.6)
                HStack(spacing: 7) {
                    HStack(spacing: 6) {
                        if isFlip {
                            FlipIcon(size: 12, color: RT.green, lineWidth: 2)
                            Text("엎기 · 자동").font(.sans(11.5, 600)).foregroundColor(RT.green)
                        } else {
                            TapIcon(size: 12, color: RT.green)
                            Text("탭").font(.sans(11.5, 600)).foregroundColor(RT.green)
                        }
                    }
                    .padding(EdgeInsets(top: 5, leading: 12, bottom: 5, trailing: 12))
                    .background(Capsule().fill(RT.greenTint))
                    Text("몰입").font(.sans(11.5, 600)).foregroundColor(RT.body)
                        .padding(EdgeInsets(top: 5, leading: 12, bottom: 5, trailing: 12))
                        .background(Capsule().fill(RT.segBg))
                }
                .padding(.top, 14)
                .rtEntrance(delay: 0.8, duration: 0.6)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 112)
            VStack(spacing: 13) {
                todayCard
                ledger
            }
            .padding(.horizontal, 24)
            .padding(.top, 406)
            VStack(spacing: 0) {
                Spacer()
                RTCTAPlain("저장하기")
                    .contentShape(Rectangle())
                    .onTapGesture { model?.saveSession() }
                Text("이 기록 삭제").font(.sans(12.5, 600)).foregroundColor(Color(hex: 0xB56A55))
                    .padding(.top, 12)
                    .contentShape(Rectangle())
                    .onTapGesture { model?.deleteSession() }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 36)
        }
        .frame(width: 390, height: 844)
    }

    var todayCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("오늘의 리딩타임").font(.sans(14, 800)).foregroundColor(RT.ink)
                Spacer()
                (Text("32분 → ").foregroundColor(RT.faint)
                    + Text("\(32 + minutes)분").fontWeight(.bold).foregroundColor(RT.green))
                    .font(.mono(12, 500))
            }
            bar.padding(.top, 28)
            HStack {
                Text("0분").font(.mono(10, 400)).foregroundColor(RT.ghost)
                Spacer()
                Text("1시간").font(.mono(10, 400)).foregroundColor(RT.ghost)
            }
            .padding(.top, 12)
        }
        .padding(EdgeInsets(top: 18, leading: 18, bottom: 20, trailing: 18))
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(RT.hair, lineWidth: 1))
        .shadow(color: Color(hex: 0x16140F, alpha: 0.03), radius: 1, x: 0, y: 1)
        .shadow(color: Color(hex: 0x16140F, alpha: 0.15), radius: 5, x: 0, y: 7) // 0 14 30 -22 근사
    }

    var bar: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .topLeading) {
                Capsule().fill(Color(hex: 0xECE5D2)).frame(height: 12)
                UnevenRoundedRectangle(topLeadingRadius: 99, bottomLeadingRadius: 99)
                    .fill(Color(hex: 0x3A5C4B))
                    .frame(width: w * 0.36, height: 12)
                UnevenRoundedRectangle(bottomTrailingRadius: 99, topTrailingRadius: 99)
                    .fill(Color(hex: 0x729A80))
                    .frame(width: w * 0.29, height: 12)
                    .offset(x: w * 0.36)
                    .rtSweep(delay: 1.2, duration: 1.1)
                Text("+\(minutes)분").font(.mono(11, 600)).foregroundColor(RT.ctaText)
                    .padding(EdgeInsets(top: 3, leading: 9, bottom: 3, trailing: 9))
                    .background(RoundedRectangle(cornerRadius: 8).fill(RT.ink))
                    .fixedSize()
                    .rtDrop(delay: 1.9)
                    .position(x: w * 0.5, y: -27 + 10.5) // top -27, 칩 h≈21 의 중심
            }
        }
        .frame(height: 12)
    }

    var ledger: some View {
        VStack(spacing: 0) {
            row("시작", "14:14", divider: true)
            row("종료", "14:40", divider: true)
            row("일시정지", "2회 · 3분", divider: false)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 6)
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
    }

    func row(_ label: String, _ value: String, divider: Bool) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text(label).font(.sans(12.5, 500)).foregroundColor(RT.muted)
                Spacer()
                Text(value).font(.mono(12.5, 600)).foregroundColor(RT.ink)
            }
            .padding(.vertical, 10)
            if divider { Rectangle().fill(Color(hex: 0xF0EAD9)).frame(height: 1) }
        }
    }
}

// 아이콘 없는 그린 CTA (06 저장하기 등)
public struct RTCTAPlain: View {
    let label: String
    public init(_ label: String) { self.label = label }
    public var body: some View {
        GeometryReader { geo in
            Text(label).font(.sans(16, 800)).foregroundColor(RT.ctaText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RT.ctaGrad(geo.size))
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.38), radius: 9, x: 0, y: 12)
        }
        .frame(height: 54)
    }
}

import SwiftUI

// 베젤 크롬 재현 (bezel.jsx) — rtshot 렌더 대조용 오버레이.
// 실기기에서는 시스템이 제공하므로 앱 화면에는 넣지 않는다.
public struct RTChrome: View {
    let dark: Bool
    public init(dark: Bool) { self.dark = dark }

    var fg: Color { dark ? .white : Color(hex: 0x141413) }

    public var body: some View {
        ZStack(alignment: .top) {
            // 상태바
            HStack {
                Text("9:41").font(.poppins600(15)).tracking(0.2).foregroundColor(fg)
                    .padding(.top, 7)
                Spacer()
                HStack(spacing: 6.5) {
                    signalIcon
                    wifiIcon
                    batteryIcon
                }
                .padding(.top, 7)
            }
            .padding(.horizontal, 32)
            .frame(height: 47)

            // 노치
            ZStack {
                UnevenRoundedRectangle(bottomLeadingRadius: 20, bottomTrailingRadius: 20)
                    .fill(Color.black)
                    .frame(width: 162, height: 29)
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(hex: 0x17191B))
                    .frame(width: 36, height: 5)
                Circle()
                    .fill(Color(hex: 0x0A1512))
                    .frame(width: 9, height: 9)
                    .offset(x: 162 / 2 - 40 - 4.5, y: -29 / 2 + 9 + 4.5)
            }
            .frame(maxWidth: .infinity)

            // 홈 인디케이터
            VStack {
                Spacer()
                RoundedRectangle(cornerRadius: 3)
                    .fill(dark ? Color.white.opacity(0.85) : Color(hex: 0x141413).opacity(0.28))
                    .frame(width: 134, height: 5)
                    .padding(.bottom, 8)
            }
        }
        .frame(width: 390, height: 844)
        .allowsHitTesting(false)
    }

    // bezel.jsx 상태바 아이콘 3종 (fill, 비정방 viewBox → 수동 스케일 없이 원좌표 사용)
    var signalIcon: some View {
        Path { p in
            for (x, h) in [(CGFloat(0), CGFloat(4)), (4.6, 6), (9.2, 8.5), (13.8, 11)] {
                p.addRoundedRect(in: CGRect(x: x, y: 11 - h, width: 3, height: h), cornerSize: CGSize(width: 1, height: 1))
            }
        }
        .fill(fg)
        .frame(width: 17, height: 11)
    }

    var wifiIcon: some View {
        ZStack {
            Path { p in
                p.addPath(RTSVG.path("M8 2.15c2.4 0 4.6.92 6.25 2.5l1.35-1.42C13.6 1.22 10.94 0 8 0 5.06 0 2.4 1.22.4 3.23L1.75 4.65C3.4 3.07 5.6 2.15 8 2.15z"))
                p.addPath(RTSVG.path("M8 5.5c1.4 0 2.68.55 3.66 1.46l1.35-1.44C11.66 4.28 9.9 3.6 8 3.6s-3.66.68-5.01 1.92l1.35 1.44A5.32 5.32 0 0 1 8 5.5z"))
                p.addEllipse(in: CGRect(x: 8 - 1.65, y: 9.1 - 1.65, width: 3.3, height: 3.3))
            }
            .fill(fg)
        }
        .frame(width: 16, height: 11)
    }

    var batteryIcon: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 3)
                .stroke(fg.opacity(0.4), lineWidth: 1)
                .frame(width: 21, height: 11)
                .offset(x: 0.5, y: 0.5)
            RoundedRectangle(cornerRadius: 1.6)
                .fill(fg)
                .frame(width: 14.76, height: 8)
                .offset(x: 2, y: 2)
            Path { $0.addPath(RTSVG.path("M23.5 4v4c.9-.35 1.5-1.1 1.5-2s-.6-1.65-1.5-2z")) }
                .fill(fg.opacity(0.5))
        }
        .frame(width: 26, height: 12, alignment: .topLeading)
    }
}

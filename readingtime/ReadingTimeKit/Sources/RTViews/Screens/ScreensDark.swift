import SwiftUI

// v8 03·04·05 다크 타이머 3종 — 스펙: frames/03·04·05.html
// rtshot 스냅샷은 정지 프레임: 무한 모션(플립·물결·점멸)은 기준 상태로 렌더.

// 공용 다크 요소
struct DarkTopBar<Trailing: View>: View {
    let showBookChip: Bool
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack {
            if showBookChip {
                HStack(spacing: 9) {
                    ZStack(alignment: .topLeading) {
                        RT.kraftGrad(CGSize(width: 22, height: 31))
                        Rectangle().fill(Color.black.opacity(0.18)).frame(width: 2)
                    }
                    .frame(width: 22, height: 31)
                    .clipShape(RoundedRectangle(cornerRadius: 2.5))
                    Text("몰입").font(.sans(12.5, 600)).foregroundColor(Color(hex: 0xDDD8C2))
                }
                .padding(EdgeInsets(top: 7, leading: 8, bottom: 7, trailing: 12))
                .background(Capsule().fill(Color.white.opacity(0.06)))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
            } else {
                HStack(spacing: 8) {
                    TapIcon(size: 13, color: Color(hex: 0xDDD8C2))
                    Text("탭 모드").font(.sans(12, 600)).foregroundColor(Color(hex: 0xDDD8C2))
                }
                .padding(EdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 14))
                .background(Capsule().fill(Color.white.opacity(0.06)))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
            }
            Spacer()
            trailing()
        }
        .padding(.horizontal, 20)
        .padding(.top, 56)
    }
}

struct PausedPill: View {
    var body: some View {
        HStack(spacing: 7) {
            ZStack {
                RoundedRectangle(cornerRadius: 1.3 * 0.5).fill(Color(hex: 0xE8BE78))
                    .frame(width: 3.4 * 0.5, height: 14 * 0.5).offset(x: -1.65)
                RoundedRectangle(cornerRadius: 1.3 * 0.5).fill(Color(hex: 0xE8BE78))
                    .frame(width: 3.4 * 0.5, height: 14 * 0.5).offset(x: 1.65)
            }
            .frame(width: 12, height: 12)
            Text("일시정지됨").font(.sans(12, 700)).tracking(12 * 0.04)
                .foregroundColor(Color(hex: 0xE8BE78))
        }
        .padding(EdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 14))
        .background(Capsule().fill(Color(hex: 0xE8BE78, alpha: 0.1)))
        .overlay(Capsule().stroke(Color(hex: 0xE8BE78, alpha: 0.28), lineWidth: 1))
    }
}

struct LivePill: View {
    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(RT.gold).frame(width: 7, height: 7)
                .shadow(color: Color(hex: 0xE2CF9E, alpha: 0.9), radius: 4.5)
            Text("기록 중").font(.sans(12.5, 600)).tracking(12.5 * 0.06)
                .foregroundColor(RT.gold)
        }
        .padding(EdgeInsets(top: 7, leading: 15, bottom: 7, trailing: 15))
        .background(Capsule().fill(Color(hex: 0xE2CF9E, alpha: 0.1)))
        .overlay(Capsule().stroke(Color(hex: 0xE2CF9E, alpha: 0.22), lineWidth: 1))
    }
}

// ── 03 엎기 · 시작 대기 ──
public struct Screen03FlipWait: View {
    public init() {}
    public var body: some View {
        ZStack(alignment: .top) {
            RT.darkGrad(CGSize(width: 390, height: 844))
            DarkTopBar(showBookChip: true) {
                Text("취소").font(.sans(13, 600)).foregroundColor(Color(hex: 0xB9C4B4))
                    .padding(EdgeInsets(top: 9, leading: 16, bottom: 9, trailing: 16))
                    .background(Capsule().fill(Color.white.opacity(0.06)))
                    .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
            }
            VStack(spacing: 0) {
                VStack(spacing: 16) {
                    Spacer(minLength: 0)
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(hex: 0xE2CF9E, alpha: 0.08))
                        .frame(width: 58, height: 92)
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(RT.gold, lineWidth: 2.5))
                        .overlay(alignment: .top) {
                            RoundedRectangle(cornerRadius: 3).fill(RT.gold.opacity(0.8))
                                .frame(width: 16, height: 3.5).padding(.top, 7)
                        }
                        .shadow(color: Color(hex: 0xE2CF9E, alpha: 0.18), radius: 17)
                    Ellipse().fill(Color.black)
                        .frame(width: 58, height: 9)
                        .blur(radius: 4)
                        .opacity(0.32)
                }
                .frame(width: 150, height: 158)
                Text("폰을 엎어 주세요").font(.sans(24, 800)).tracking(24 * -0.02)
                    .foregroundColor(RT.ctaText).padding(.top, 26)
                Text("00:00:00").font(.mono(38, 600)).tracking(38 * -0.02)
                    .foregroundColor(Color(hex: 0x3D4F42)).padding(.top, 26)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 200)
            VStack {
                Spacer()
                HStack(spacing: 8) {
                    TapIcon(size: 14, color: Color(hex: 0xB9C4B4))
                    Text("탭 모드로 전환").font(.sans(13.5, 600)).foregroundColor(Color(hex: 0xB9C4B4))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(RoundedRectangle(cornerRadius: 15).fill(Color.white.opacity(0.05)))
                .overlay(RoundedRectangle(cornerRadius: 15).stroke(Color.white.opacity(0.1), lineWidth: 1))
                .padding(.horizontal, 22)
                .padding(.bottom, 44)
            }
        }
        .frame(width: 390, height: 844)
    }
}

// ── 04 엎기 · 일시정지 ──
public struct Screen04FlipPaused: View {
    public init() {}
    public var body: some View {
        ZStack(alignment: .top) {
            RT.darkGrad(CGSize(width: 390, height: 844))
            DarkTopBar(showBookChip: true) { PausedPill() }
            VStack(spacing: 0) {
                ZStack {
                    Circle()
                        .stroke(Color(hex: 0xE8BE78, alpha: 0.35),
                                style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [3, 9]))
                        .frame(width: 132, height: 132)
                    Circle()
                        .fill(RadialGradient(
                            colors: [Color(hex: 0xFFFDF2), Color(hex: 0xE7E3D0)],
                            center: UnitPoint(x: 0.38, y: 0.3), startRadius: 0, endRadius: 73))
                        .frame(width: 96, height: 96)
                        .shadow(color: Color.black.opacity(0.5), radius: 15, x: 0, y: 16)
                        .overlay(
                            RTIcon(RTIconPath.play, size: 30, fill: Color(hex: 0x26413A))
                                .offset(x: 4)
                        )
                }
                .frame(width: 150, height: 150)
                Text("탭하여 이어 읽기").font(.sans(11, 500))
                    .foregroundColor(Color(hex: 0x7D8F80)).padding(.top, 12)
                Text("00:26:14").font(.mono(56, 600)).tracking(56 * -0.04)
                    .foregroundColor(RT.ctaText).padding(.top, 16)
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(RT.darkSub, lineWidth: 1.8)
                        .frame(width: 11, height: 17)
                    Text("다시 엎으면 이어서").font(.sans(13.5, 500)).foregroundColor(RT.darkSub)
                }
                .padding(.top, 16)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 186)
            VStack(spacing: 0) {
                Spacer()
                HStack {
                    Text("이 세션").font(.sans(12.5, 500)).foregroundColor(RT.darkSub)
                    Spacer()
                    Text("26분").font(.mono(13, 600)).foregroundColor(Color(hex: 0xDDD8C2))
                    Spacer()
                    Rectangle().fill(Color.white.opacity(0.12)).frame(width: 1, height: 16)
                    Spacer()
                    Text("오늘 누적").font(.sans(12.5, 500)).foregroundColor(RT.darkSub)
                    Spacer()
                    Text("58분").font(.mono(13, 600)).foregroundColor(Color(hex: 0xDDD8C2))
                }
                .padding(EdgeInsets(top: 13, leading: 16, bottom: 13, trailing: 16))
                .background(RoundedRectangle(cornerRadius: 16).fill(Color.white.opacity(0.05)))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.1), lineWidth: 1))
                HStack(spacing: 9) {
                    RTIcon(RTIconPath.check, size: 16, stroke: Color(hex: 0x26413A), lineWidth: 2.6)
                    Text("여기까지 읽기").font(.sans(15.5, 800)).foregroundColor(Color(hex: 0x1D2F28))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(RoundedRectangle(cornerRadius: 16).fill(RT.ctaText))
                .shadow(color: Color.black.opacity(0.5), radius: 15, x: 0, y: 16)
                .padding(.top, 14)
            }
            .padding(.horizontal, 22)
            .padding(.bottom, 44)
        }
        .frame(width: 390, height: 844)
    }
}

// ── 05 탭 모드 · 기록 중 ──
public struct Screen05TapRecording: View {
    public init() {}
    public var body: some View {
        ZStack(alignment: .top) {
            RT.darkGrad(CGSize(width: 390, height: 844))
            // 물결 3겹 — 정지 프레임(중앙 정렬, scale 1)
            ForEach(Array([0.32, 0.26, 0.2].enumerated()), id: \.offset) { _, a in
                Circle().stroke(Color(hex: 0xE2CF9E, alpha: a), lineWidth: 1.5)
                    .frame(width: 280, height: 280)
                    .position(x: 195, y: 844 * 0.27)
            }
            DarkTopBar(showBookChip: false) {
                Text("종료").font(.sans(13, 700)).foregroundColor(Color(hex: 0xF0ECD9))
                    .padding(EdgeInsets(top: 9, leading: 16, bottom: 9, trailing: 16))
                    .background(Capsule().fill(Color.white.opacity(0.12)))
                    .overlay(Capsule().stroke(Color.white.opacity(0.18), lineWidth: 1))
            }
            VStack(spacing: 0) {
                LivePill()
                HStack(spacing: 0) {
                    Text("00").opacity(0.4)
                    Text(":").opacity(0.4)
                    Text("26")
                    Text(":")
                    Text("14")
                }
                .font(.mono(62, 600)).tracking(62 * -0.04)
                .foregroundColor(RT.ctaText)
                .shadow(color: Color(hex: 0xE2CF9E, alpha: 0.22), radius: 19)
                .padding(.top, 24)
                Text("미하이 칙센트미하이, 《몰입》").font(.sans(13, 500))
                    .foregroundColor(RT.darkSub).padding(.top, 16)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 172)
            VStack {
                Spacer()
                VStack(spacing: 10) {
                    Circle().fill(Color(hex: 0xE2CF9E, alpha: 0.12))
                        .frame(width: 52, height: 52)
                        .overlay(RTIcon(RTIconPath.tapZone, size: 24, stroke: RT.gold, lineWidth: 1.8))
                    Text("화면을 탭하면 일시정지").font(.sans(15, 700)).foregroundColor(Color(hex: 0xF0ECD9))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 168)
                .background(RoundedRectangle(cornerRadius: 24).fill(Color.white.opacity(0.035)))
                .overlay(
                    RoundedRectangle(cornerRadius: 24)
                        .stroke(Color(hex: 0xE8D59E, alpha: 0.4),
                                style: StrokeStyle(lineWidth: 1.5, dash: [4.5, 4.5]))
                )
                .padding(.horizontal, 22)
                .padding(.bottom, 112)
            }
            VStack {
                Spacer()
                Text("두 번 탭 = 종료").font(.mono(10, 500)).tracking(10 * 0.16)
                    .foregroundColor(Color(hex: 0x5C6F60))
                    .padding(.bottom, 48)
            }
        }
        .frame(width: 390, height: 844)
    }
}

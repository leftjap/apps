import SwiftUI

// v8 03·04·05 다크 타이머 3종 — 스펙: frames/03·04.html, 05 는 시안 J(design-ref/design_handoff_tap_mode)
// rtshot 스냅샷은 정지 프레임: 무한 모션(플립·물결·점멸)은 기준 상태로 렌더.
// model 주입 시 인터랙션·상태 변형(recording/paused) 활성 — 인터랙션 정본 prototype/app.js.

// 공용 다크 요소
struct DarkTopBar<Trailing: View>: View {
    var bookTitle = "몰입"   // 라이브: 현재 책 제목 (데모 기본 = 시안 값)
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack {
            HStack(spacing: 9) {
                ZStack(alignment: .topLeading) {
                    RT.kraftGrad(CGSize(width: 22, height: 31))
                    Rectangle().fill(Color.black.opacity(0.18)).frame(width: 2)
                }
                .frame(width: 22, height: 31)
                .clipShape(RoundedRectangle(cornerRadius: 2.5))
                Text(bookTitle).font(.sans(12.5, 600)).foregroundColor(Color(hex: 0xDDD8C2))
                    .lineLimit(1)
                    .frame(maxWidth: 170, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(EdgeInsets(top: 7, leading: 8, bottom: 7, trailing: 12))
            .background(Capsule().fill(Color.white.opacity(0.06)))
            .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 1))
            Spacer()
            trailing()
        }
        .padding(.horizontal, 20)
        .padding(.top, 56)
    }
}

// 04 하단 블록 — 통계 스트립 + "여기까지 읽기" CTA (디자인 통일, 2026-07-04 피드백). 05 는 DarkTapFooter(시안 J)
struct DarkSessionFooter: View {
    let sessionMin: Int
    let todayBase: Int
    let onEnd: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("이 세션").font(.sans(12.5, 500)).foregroundColor(RT.darkSub)
                Spacer()
                Text("\(sessionMin)분").font(.mono(13, 600)).foregroundColor(Color(hex: 0xDDD8C2))
                Spacer()
                Rectangle().fill(Color.white.opacity(0.12)).frame(width: 1, height: 16)
                Spacer()
                Text("오늘 누적").font(.sans(12.5, 500)).foregroundColor(RT.darkSub)
                Spacer()
                Text("\(todayBase + sessionMin)분").font(.mono(13, 600)).foregroundColor(Color(hex: 0xDDD8C2))
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
            .contentShape(Rectangle())
            .onTapGesture { onEnd() }
            .padding(.top, 14)
        }
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
                .rtBlink(duration: 1.6)
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
    var model: RTAppModel?
    private let bookTitle: String

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.bookTitle = model?.sessionBook?.title ?? model?.currentBook?.title ?? "몰입"
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.darkGrad(CGSize(width: 390, height: 844))
            DarkTopBar(bookTitle: bookTitle) {
                Text("취소").font(.sans(13, 600)).foregroundColor(Color(hex: 0xB9C4B4))
                    .padding(EdgeInsets(top: 9, leading: 16, bottom: 9, trailing: 16))
                    .background(Capsule().fill(Color.white.opacity(0.06)))
                    .overlay(Capsule().stroke(Color.white.opacity(0.12), lineWidth: 1))
                    .contentShape(Rectangle())
                    .onTapGesture { model?.cancelSession() }
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
                        .rtTumble(duration: 3.6)
                    Ellipse().fill(Color.black)
                        .frame(width: 58, height: 9)
                        .blur(radius: 4)
                        .rtTumbleShadow(duration: 3.6)
                }
                .frame(width: 150, height: 158)
                .contentShape(Rectangle())
                .onTapGesture { model?.simFlip() }   // (프로토타입) 탭 = 엎기 시뮬레이션
                Text("폰을 엎어 주세요").font(.sans(24, 800)).tracking(24 * -0.02)
                    .foregroundColor(RT.ctaText).padding(.top, 26)
                Text("00:00:00").font(.mono(38, 600)).tracking(38 * -0.02)
                    .foregroundColor(Color(hex: 0x3D4F42)).padding(.top, 26)
                    .rtBreath(duration: 3)
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
                .contentShape(Rectangle())
                .onTapGesture { model?.switchTap() }
                .padding(.horizontal, 22)
                .padding(.bottom, 44)
            }
        }
        .frame(width: 390, height: 844)
    }
}

// ── 04 엎기 타이머 (paused 기본 = 시안 캐노니컬 / recording 변형) ──
// 동적 값은 저장 프로퍼티로 스냅샷 — model 참조만 들고 있으면 SwiftUI 가
// 자식 뷰를 "변화 없음"으로 스킵해 tick 이 화면에 반영되지 않는다 (실창 검증에서 발견).
public struct Screen04FlipPaused: View {
    var model: RTAppModel?
    private let paused: Bool
    private let elapsed: Int
    private let bookTitle: String
    private let todayBase: Int

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.paused = model.map { $0.session?.status != .recording } ?? true
        self.elapsed = model?.session?.elapsed ?? RTAppModel.demoElapsed
        self.bookTitle = model?.sessionBook?.title ?? model?.currentBook?.title ?? "몰입"
        // 라이브: 오늘 실누적(진행 세션 제외), 데모: 시안 값 32분
        self.todayBase = (model?.userData != nil) ? (model!.todaySeconds / 60) : 32
    }

    var sessionMin: Int { elapsed / 60 }

    public var body: some View {
        let t = RTAppModel.hms(elapsed)
        ZStack(alignment: .top) {
            RT.darkGrad(CGSize(width: 390, height: 844))
            if !paused {
                // 기록 중 물결 3겹 (top 31%)
                ForEach(Array([(0.32, 0.0), (0.26, 1.4), (0.2, 2.8)].enumerated()), id: \.offset) { _, r in
                    RTRipple(baseOpacity: r.0, phase: r.1)
                        .position(x: 195, y: 844 * 0.31)
                }
            }
            DarkTopBar(bookTitle: bookTitle) {
                if paused { PausedPill() } else { LivePill() }
            }
            VStack(spacing: 0) {
                ZStack {
                    Circle()
                        .stroke(Color(hex: 0xE8BE78, alpha: 0.35),
                                style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [3, 9]))
                        .frame(width: 132, height: 132)
                        .rtSpinIf(paused, duration: 26)   // app.js: 기록 중엔 still
                    Circle()
                        .fill(RadialGradient(
                            colors: [Color(hex: 0xFFFDF2), Color(hex: 0xE7E3D0)],
                            center: UnitPoint(x: 0.38, y: 0.3), startRadius: 0, endRadius: 73))
                        .frame(width: 96, height: 96)
                        .shadow(color: Color.black.opacity(0.5), radius: 15, x: 0, y: 16)
                        .overlay(emblemGlyph)
                        .rtResumePop(paused: paused)
                        .contentShape(Circle())
                        .onTapGesture { model?.togglePause() }
                }
                .frame(width: 150, height: 150)
                if paused {
                    Text("탭하여 이어 읽기").font(.sans(11, 500))
                        .foregroundColor(Color(hex: 0x7D8F80)).padding(.top, 12)
                }
                timerText(t).padding(.top, 16)
                if paused {
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 3)
                            .stroke(RT.darkSub, lineWidth: 1.8)
                            .frame(width: 11, height: 17)
                            .rtTumble(duration: 3.2)
                        Text("다시 엎으면 이어서").font(.sans(13.5, 500)).foregroundColor(RT.darkSub)
                    }
                    .padding(.top, 16)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 186)
            VStack(spacing: 0) {
                Spacer()
                DarkSessionFooter(sessionMin: sessionMin, todayBase: todayBase) {
                    model?.endSession()
                }
            }
            .padding(.horizontal, 22)
            .padding(.bottom, 44)
        }
        .frame(width: 390, height: 844)
    }

    @ViewBuilder var emblemGlyph: some View {
        if paused {
            RTIcon(RTIconPath.play, size: 30, fill: Color(hex: 0x26413A))
                .offset(x: 4)
        } else {
            HStack(spacing: 3.4 * 30 / 24 * 0.9) {
                RoundedRectangle(cornerRadius: 1.3 * 30 / 24)
                    .frame(width: 3.4 * 30 / 24, height: 14 * 30 / 24)
                RoundedRectangle(cornerRadius: 1.3 * 30 / 24)
                    .frame(width: 3.4 * 30 / 24, height: 14 * 30 / 24)
            }
            .foregroundColor(Color(hex: 0x26413A))
        }
    }

    @ViewBuilder func timerText(_ t: (h: String, m: String, s: String)) -> some View {
        if paused {
            // 시안 정본: 일시정지 타이머는 단일 텍스트 노드 (§4-1)
            Text("\(t.h):\(t.m):\(t.s)")
                .font(.mono(56, 600)).tracking(56 * -0.04)
                .foregroundColor(RT.ctaText)
                .rtPausedDim()
        } else {
            HStack(spacing: 0) {
                Text(t.h)
                Text(":").rtColonTick()
                Text(t.m)
                Text(":").rtColonTick()
                Text(t.s)
            }
            .font(.mono(56, 600)).tracking(56 * -0.04)
            .foregroundColor(RT.ctaText)
        }
    }
}

// ── 05 탭 모드 — 시안 J (design-ref/design_handoff_tap_mode, 2026-09-27) ──
// 링 타이머 + 기록 추격: 바깥 줄 = 이 세션, 안쪽 줄 = 역대 최장, 사이 점선 = 남은 거리.
// 링·원형 버튼 탭 = togglePause 즉시(디바운스·더블탭 종료 없음). 종료는 "여기까지 읽기" 뿐.
// 동적 값은 04 와 같은 이유로 저장 프로퍼티로 스냅샷한다 (model 참조만 들면 tick 이 반영되지 않는다).
public struct Screen05TapRecording: View {
    var model: RTAppModel?
    let paused: Bool
    let elapsed: Int
    let best: Int
    let bookTitle: String
    private let todayBase: Int
    let streak: Int

    public init(model: RTAppModel? = nil) {
        self.model = model
        self.paused = model.map { $0.session?.status != .recording } ?? false
        self.elapsed = model?.session?.elapsed ?? RTAppModel.demoElapsed
        self.best = model?.bestSessionSeconds ?? RTAppModel.demoBest
        self.bookTitle = model?.sessionBook?.title ?? model?.currentBook?.title ?? "몰입"
        // 라이브: 오늘 실누적(진행 세션 제외)·연속일, 데모: 시안 값 32분·9일(홈 데모 연속과 같다)
        let live = model?.userData != nil
        self.todayBase = live ? model!.todaySeconds / 60 : 32
        self.streak = live ? model!.streakDays : 9
    }

    var todayMin: Int { todayBase + elapsed / 60 }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.darkGrad(CGSize(width: 390, height: 844))
            DarkTopBar(bookTitle: bookTitle) {
                if paused { PausedPill() } else { LivePill() }
            }
            TapRingBlock(ring: RTTapRing(elapsed: elapsed, best: best),
                         elapsed: elapsed, best: best, paused: paused) { model?.togglePause() }
                .padding(.top, 168)
            TapToggleButton(paused: paused) { model?.togglePause() }
                .padding(.top, 508)
            VStack(spacing: 0) {
                Spacer()
                DarkTapFooter(todayMin: todayMin, streak: streak) { model?.endSession() }
            }
            .padding(.horizontal, 22)
            .padding(.bottom, 44)
        }
        .frame(width: 390, height: 844)
    }
}

private let tapPausedAmber = Color(hex: 0xE8BE78)   // 일시정지·타이·신기록 강조 (PausedPill 과 같은 값)

// 05 링 블록 300×300 — 레이어(뒤→앞): 트랙 · 최장 줄 · 남은 거리 점선 · 결승 눈금 · 이 세션 줄 · 끝점.
// 가운데 타이머 + 기록 줄. 블록 어디를 탭해도 일시정지↔재개.
private struct TapRingBlock: View {
    let ring: RTTapRing
    let elapsed: Int
    let best: Int
    let paused: Bool
    let onTap: () -> Void
    @Environment(\.rtMotionEnabled) private var motion
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let animate = motion && !reduceMotion
        let grow: Animation? = animate ? .linear(duration: 1) : nil          // 이 세션 줄 1s linear 성장
        let fade: Animation? = animate ? .timingCurve(0.25, 0.1, 0.25, 1, duration: 0.4) : nil   // 색 전환 .4s
        let isRecord = ring.state == .record
        ZStack {
            ZStack {
                Circle().stroke(RT.gold.opacity(0.1), lineWidth: 10)
                    .frame(width: 282, height: 282)
                if ring.hasBest {
                    arc(0, ring.ghostDeg)
                        .stroke(RT.ctaText.opacity(0.38), style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 244, height: 244)
                        .animation(grow, value: ring.ghostDeg)
                }
                if let gap = ring.gap {   // 정지 점선 — 흐르지 않는다(매 tick 새로 그림)
                    arc(gap.lowerBound, gap.upperBound)
                        .stroke(RT.ctaText.opacity(0.35),
                                style: StrokeStyle(lineWidth: 3, lineCap: .round, dash: [2, 7]))
                        .rotationEffect(.degrees(-90))
                        .frame(width: 282, height: 282)
                }
                if ring.hasBest {   // 결승 눈금 — 최장 위치, 반지름 110→134 (안쪽 줄 끝을 가로지른다)
                    Capsule().fill(RT.ctaText.opacity(0.75))
                        .frame(width: 2, height: 24)
                        .offset(y: -122)
                        .rotationEffect(.degrees(ring.ghostDeg))
                        .animation(grow, value: ring.ghostDeg)
                }
                Group {
                    arc(0, ring.liveDeg)
                        .stroke(paused ? tapPausedAmber : RT.gold, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    // 신기록 — 골드→앰버 그라데이션(목업 SVG 와 같이 회전 전 좌상→우하 = 화면 좌하→우상)
                    arc(0, ring.liveDeg)
                        .stroke(LinearGradient(colors: [RT.gold, RT.amber], startPoint: .topLeading, endPoint: .bottomTrailing),
                                style: StrokeStyle(lineWidth: 10, lineCap: .round))
                        .opacity(isRecord && !paused ? 1 : 0)
                }
                .rotationEffect(.degrees(-90))
                .frame(width: 282, height: 282)
                .animation(fade, value: paused)
                .animation(fade, value: isRecord)
                .animation(grow, value: ring.liveDeg)
                Circle().fill(paused ? tapPausedAmber : (isRecord ? RT.amber : RT.gold))
                    .frame(width: 16, height: 16)
                    .offset(y: -141)
                    .rotationEffect(.degrees(ring.liveDeg))
                    .animation(fade, value: paused)
                    .animation(fade, value: isRecord)
                    .animation(grow, value: ring.liveDeg)
            }
            .accessibilityElement()
            .accessibilityLabel(paused ? "이어 읽기" : "일시정지")
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("tap.ring")
            .accessibilityAction { onTap() }
            VStack(spacing: 14) {
                timer
                recordLine
            }
        }
        .frame(width: 300, height: 300)
        .background(TapRecordPulse(isRecord: isRecord))
        .contentShape(Circle())
        .onTapGesture { onTap() }
    }

    // 12시 = 0° 시계 방향 호 — Circle 은 3시에서 시작하므로 쓰는 쪽에서 −90° 회전한다
    private func arc(_ from: Double, _ to: Double) -> some Shape {
        Circle().trim(from: from / 360, to: to / 360)
    }

    // 1시간 미만 mm:ss 58pt, 이상 h:mm:ss 46pt(시 한 자리). CSS line-height 1 = 글자 크기 높이.
    @ViewBuilder private var timer: some View {
        let t = RTAppModel.clockParts(elapsed)
        let size: CGFloat = t.h == nil ? 58 : 46
        let digits = HStack(spacing: 0) {
            if let h = t.h {
                Text(h)
                Text(":").rtColonTick(active: !paused)
            }
            Text(t.m)
            Text(":").rtColonTick(active: !paused)
            Text(t.s)
        }
        .font(.mono(size, 600)).tracking(size * -0.04)
        .foregroundColor(RT.ctaText)
        .frame(height: size)
        Group {
            if paused { digits.rtPausedDim() } else { digits }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("경과 시간")
        .accessibilityValue(Self.spoken(elapsed))
        .accessibilityIdentifier("tap.timer")
    }

    // 기록 줄 — 평상시 "최장 47:00" · 타이(같은 분) 앰버 · 신기록 "▲ 신기록 47:00(취소선) +N분". 최장 0 이면 없음.
    @ViewBuilder private var recordLine: some View {
        if ring.hasBest {
            if ring.state == .record {
                HStack(alignment: .firstTextBaseline, spacing: 9) {
                    HStack(spacing: 4) {
                        RTIcon(["M4 0 8 7H0z"], width: 8, height: 7, viewBoxW: 8, viewBoxH: 7, fill: tapPausedAmber)
                        Text("신기록").font(.sans(10, 700)).tracking(10 * 0.14).foregroundColor(tapPausedAmber)
                    }
                    Text(RTAppModel.clock(best)).font(.mono(16, 500)).tracking(16 * 0.02)
                        .foregroundColor(RT.ctaText.opacity(0.35))
                        .strikethrough(color: RT.ctaText.opacity(0.45))
                    Text("+\(ring.overMinutes)분").font(.mono(16, 700)).foregroundColor(tapPausedAmber)
                }
                .rtPopIn(from: 0.7, peak: 1.1, peakAt: 0.65, duration: 0.4)   // badgePop
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("신기록")
                .accessibilityValue("최장 \(best / 60)분보다 \(ring.overMinutes)분 더")
                .accessibilityIdentifier("tap.badge")
            } else {
                let tie = ring.state == .tie
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("최장").font(.sans(10, 700)).tracking(10 * 0.14)
                        .foregroundColor(tie ? tapPausedAmber : RT.ctaText.opacity(0.42))
                    Text(RTAppModel.clock(best)).font(.mono(17, 500)).tracking(17 * 0.02)
                        .foregroundColor(tie ? tapPausedAmber : RT.ctaText.opacity(0.5))
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("기록")
                .accessibilityValue("최장 \(best / 60)분")
                .accessibilityIdentifier("tap.record")
            }
        }
    }

    // VoiceOver 경과 — "26분 14초" / "1시간 12분 8초"
    private static func spoken(_ sec: Int) -> String {
        let h = sec / 3600, m = sec / 60 % 60, s = sec % 60
        return (h > 0 ? "\(h)시간 " : "") + "\(m)분 \(s)초"
    }
}

// 신기록 순간 — 300 원 테두리가 scale 1→1.12 로 퍼지며 사라진다(.9s ease-out, 1회, 시안 J §4).
// 보고 있는 화면에서 '신기록 아님 → 신기록'으로 바뀔 때만 재생한다. 복원된 세션이 이미 신기록이면 재생하지 않고,
// 세션 종료·취소 때 초기화할 상태도 없다.
private struct TapRecordPulse: View {
    let isRecord: Bool
    @Environment(\.rtMotionEnabled) private var motion
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var fired = 0

    struct Pose { var scale: CGFloat = 1; var opacity: Double = 0 }

    var body: some View {
        Circle().strokeBorder(RT.ctaText.opacity(0.6), lineWidth: 3)
            .frame(width: 300, height: 300)
            .keyframeAnimator(initialValue: Pose(), trigger: fired) { v, p in
                v.scaleEffect(p.scale).opacity(p.opacity)
            } keyframes: { _ in
                KeyframeTrack(\.scale) {
                    MoveKeyframe(1)
                    LinearKeyframe(1.12, duration: 0.9, timingCurve: .easeOut)
                }
                KeyframeTrack(\.opacity) {
                    MoveKeyframe(0.7)
                    LinearKeyframe(0, duration: 0.9, timingCurve: .easeOut)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onChange(of: isRecord) { _, now in
                if now && motion && !reduceMotion { fired += 1 }
            }
    }
}

// 05 원형 버튼 96 — 기록 중: 반투명 원 + 세로 막대 2개 / 일시정지: 크림 원 + ▶
private struct TapToggleButton: View {
    let paused: Bool
    let onTap: () -> Void
    @Environment(\.rtMotionEnabled) private var motion
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let fade: Animation? = motion && !reduceMotion ? .timingCurve(0.25, 0.1, 0.25, 1, duration: 0.3) : nil
        ZStack {
            // CSS box-shadow 는 배경 투명도와 무관하게 원 밖에만 진다 — 불투명 원으로 그림자를 만들고 안을 도려낸다
            Circle().fill(Color.black)
                .shadow(color: Color.black.opacity(0.35), radius: 10, x: 0, y: 8)
                .mask {
                    ZStack {
                        Rectangle().padding(-40)
                        Circle().blendMode(.destinationOut)
                    }
                    .compositingGroup()
                }
            Circle().fill(paused ? RT.ctaText : Color.white.opacity(0.08))
                .animation(fade, value: paused)
            Circle().strokeBorder(paused ? RT.ctaText : Color.white.opacity(0.14), lineWidth: 1)
                .animation(fade, value: paused)
            if paused {
                RTIcon(RTIconPath.play, size: 40, fill: Color(hex: 0x26413A))
                    .offset(x: 2.5)   // 목업 margin-left 5 — 가운데 정렬 flex 안이라 실제 이동은 절반
                    .rtPopIn(from: 0.6, peak: 1.12, peakAt: 0.6, duration: 0.35)   // glyphPop
            } else {
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 3).frame(width: 9, height: 32)
                    RoundedRectangle(cornerRadius: 3).frame(width: 9, height: 32)
                }
                .foregroundColor(RT.ctaText)
                .rtPopIn(from: 0.6, peak: 1.12, peakAt: 0.6, duration: 0.35)   // glyphPop
            }
        }
        .frame(width: 96, height: 96)
        .contentShape(Circle())
        .onTapGesture { onTap() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(paused ? "이어 읽기" : "일시정지")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("tap.toggle")
        .accessibilityAction { onTap() }
    }
}

// 05 하단 — 통계(오늘 누적 · 연속) + 아웃라인 "여기까지 읽기" (시안 J §3). 04 는 DarkSessionFooter 그대로.
struct DarkTapFooter: View {
    let todayMin: Int
    let streak: Int
    let onEnd: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text("오늘 누적").font(.sans(12.5, 500)).foregroundColor(RT.darkSub)
                Spacer()
                Text("\(todayMin)분").font(.mono(15, 600)).foregroundColor(Color(hex: 0xDDD8C2))
                    .accessibilityIdentifier("tap.today")
                Spacer()
                Rectangle().fill(Color.white.opacity(0.12)).frame(width: 1, height: 16)
                Spacer()
                Text("연속").font(.sans(12.5, 500)).foregroundColor(RT.darkSub)
                Spacer()
                Text("\(streak)일").font(.mono(15, 600)).foregroundColor(Color(hex: 0xDDD8C2))
                    .accessibilityIdentifier("tap.streak")
            }
            .padding(EdgeInsets(top: 13, leading: 16, bottom: 13, trailing: 16))
            .background(RoundedRectangle(cornerRadius: 16).fill(Color.white.opacity(0.05)))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.1), lineWidth: 1))
            HStack(spacing: 9) {
                RTIcon(RTIconPath.check, size: 16, stroke: Color(hex: 0xDDD8C2), lineWidth: 2.4)
                Text("여기까지 읽기").font(.sans(15, 700)).foregroundColor(Color(hex: 0xDDD8C2))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(RoundedRectangle(cornerRadius: 16).fill(Color.white.opacity(0.04)))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(RT.ctaText.opacity(0.28), lineWidth: 1))
            .contentShape(Rectangle())
            .onTapGesture { onEnd() }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("tap.end")
        }
    }
}

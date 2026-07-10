import SwiftUI

// 02 홈 (읽던 책 있음) — 리디자인 "정물" (design_handoff_home_redesign). 서가/pickup 걷어내고
// 저녁 독서등 아래 놓인 실물 3D 책 한 권 + 도킹 정보 카드. 폰을 엎으면 이어 기록(FlipEngine 그대로).
//
// 데모/라이브 이중 경로 유지 (userData==nil = 시안 데모값 = rtshot 픽셀 오라클 경로).
// 정적 렌더(모션 off)가 idle 정지 포즈 — 리빙 그라데이션·플립·카운트업·부유는 모션 시에만.
public struct Screen02Home: View {
    struct Live {
        let title: String
        let author: String
        let coverUrl: String
        let totalHM: String        // "4:12"
        let count: Int             // 8 (함께 읽은 세션 수)
        let days: Int              // 18 (함께한 일수)
        let todayMin: Int          // 32
        let weekHM: String         // "7:26"
        let streak: Int            // 12
        let chain: [Bool]          // 최근 13일 달성
        let lastBook: String?      // "몰입"
        let lastMin: Int?          // 26
        let lastWhen: String?      // "오늘 22:14"
    }

    var model: RTAppModel?
    private let live: Live?
    @State private var menuOpen: Bool

    static let chainDays = 13

    public init(model: RTAppModel? = nil, menuOpen: Bool = false) {
        self.model = model
        _menuOpen = State(initialValue: menuOpen)
        if let m = model, m.userData != nil, let book = m.currentBook {
            let last = m.recentRecords(1).first
            self.live = Live(
                title: book.title,
                author: book.author,
                coverUrl: book.coverUrl,
                totalHM: RTAppModel.hmString(m.totalSeconds(isbn: book.isbn)),
                count: m.sessionCount(isbn: book.isbn),
                days: m.daysSinceAdded(book),
                todayMin: m.todaySeconds / 60,
                weekHM: RTAppModel.hmString(m.weekSeconds),
                streak: m.streakDays,
                chain: m.streakChain(Self.chainDays),
                // isbn 이 nil(수동/미연결 세션)이거나 매칭 책이 없으면 현재 책 제목으로 폴백
                // (라이브에서 데모 기본값 "몰입" 이 새는 것 방지, 리뷰 #4)
                lastBook: last.flatMap { r in m.userData?.books.first { $0.isbn == r.isbn }?.title } ?? book.title,
                lastMin: last.map { $0.seconds / 60 },
                lastWhen: last.map { RTAppModel.recentWhen($0.endedAt, now: m.now()) })
        } else {
            self.live = nil
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            lightPool
            VStack(spacing: 0) {
                header
                Spacer(minLength: 0)
                stage
                Spacer(minLength: 0)
                card
            }
            vignette
            if menuOpen { settingsMenu }
        }
        .frame(width: 390, height: 844)
    }

    // ── 2. 따뜻한 독서등 빛 웅덩이 (책 뒤 중앙) ──
    var lightPool: some View {
        RadialGradient(gradient: Gradient(stops: [
            .init(color: Color(hex: 0xFFE4B4, alpha: 0.85), location: 0),
            .init(color: Color(hex: 0xFFE4B4, alpha: 0.30), location: 0.34),
            .init(color: Color(hex: 0xFFE4B4, alpha: 0), location: 0.62)]),
            center: .center, startRadius: 0, endRadius: 260)
            .frame(width: 520, height: 520)
            .position(x: 195, y: 300)
    }

    // ── 5. 가장자리 비네트 (저녁 딤) ──
    var vignette: some View {
        RadialGradient(gradient: Gradient(stops: [
            .init(color: .clear, location: 0.40),
            .init(color: Color(hex: 0x3A2A16, alpha: 0.09), location: 0.74),
            .init(color: Color(hex: 0x2E2010, alpha: 0.20), location: 1)]),
            center: UnitPoint(x: 0.5, y: 0.38), startRadius: 0, endRadius: 470)
            .scaleEffect(x: 1.15, y: 1, anchor: UnitPoint(x: 0.5, y: 0.38))
            .frame(width: 390, height: 844)
            .allowsHitTesting(false)
    }

    // ── 헤더 ──
    var header: some View {
        HStack(spacing: 0) {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 9)
                    .fill(RT.ctaGrad(CGSize(width: 28, height: 28)))
                    .frame(width: 28, height: 28)
                    .overlay(RTIcon([
                        "M12 6.5C10.2 5.2 7.6 4.9 5.6 5.2c-.9.1-1.6.9-1.6 1.8v10.4c0 .9.8 1.7 1.7 1.6 1.9-.2 4.3.1 6 1.3",
                        "M12 6.5c1.8-1.3 4.4-1.6 6.4-1.3.9.1 1.6.9 1.6 1.8v10.4c0 .9-.8 1.7-1.7 1.6-1.9-.2-4.3.1-6 1.3z",
                        "M12 6.5v13",
                    ], size: 18, stroke: RT.ctaText, lineWidth: 1.9))
                Text("리딩타임").font(.sans(17, 900)).tracking(17 * -0.02).foregroundColor(RT.ink)
            }
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                Circle().fill(RT.ctaGrad(CGSize(width: 34, height: 34)))
                    .frame(width: 34, height: 34)
                    .overlay(RTIcon(["M12 6v12M6 12h12"], size: 16, stroke: RT.ctaText, lineWidth: 2.2))
                    .shadow(color: Color(hex: 0x26413A, alpha: 0.42), radius: 5, x: 0, y: 4)
                    .contentShape(Circle())
                    .onTapGesture { model?.openSheet(.addbook) }
                Circle().fill(RT.segBg)
                    .frame(width: 34, height: 34)
                    .overlay(Circle().stroke(Color(hex: 0xE0D8C4), lineWidth: 1))
                    .overlay(gearIcon)
                    .contentShape(Circle())
                    .onTapGesture { menuOpen = true }
            }
        }
        .padding(EdgeInsets(top: 52, leading: 22, bottom: 0, trailing: 22))
    }

    var gearIcon: some View {
        RTIcon([
            "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
            "M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z",
        ], size: 17, stroke: RT.body, lineWidth: 1.8)
    }

    // ── 히어로 스테이지 (칩 + 책 + 제목) ──
    var stage: some View {
        VStack(spacing: 0) {
            // 라이브 칩
            HStack(spacing: 7) {
                Circle().fill(RT.green).frame(width: 6, height: 6).rtBlink(duration: 2.2)
                Text(chipText).font(.sans(11, 700)).tracking(11 * 0.02).foregroundColor(RT.green)
            }
            .padding(EdgeInsets(top: 5, leading: 12, bottom: 5, trailing: 12))
            .background(Capsule().fill(RT.greenTint))
            .rtRiseIn(dy: 10, duration: 0.5, delay: 0.04)
            // 3D 책 + 접지 그림자 (부유·sway 는 RTBook3D 내부, 진입 드롭인은 여기)
            VStack(spacing: 0) {
                bookView.rtBookDropIn().padding(.top, 24)
                floorShadow.padding(.top, 2)
            }
            // 제목 / 저자 / 누적
            VStack(spacing: 0) {
                Text(live?.title ?? "몰입").font(.sans(23, 900)).tracking(23 * -0.03)
                    .foregroundColor(RT.ink).lineLimit(1)
                Text(live?.author ?? "미하이 칙센트미하이").font(.sans(12.5, 500))
                    .foregroundColor(RT.muted).padding(.top, 3).lineLimit(1)
                HStack(spacing: 8) {
                    Text(live?.totalHM ?? "4:12").font(.mono(14, 700)).foregroundColor(RT.ink)
                    Circle().fill(RT.ghost).frame(width: 3, height: 3)
                    Text("\(live?.count ?? 8)회 함께 읽음").font(.sans(11.5, 500)).foregroundColor(RT.faint)
                }
                .padding(.top, 9)
            }
            .padding(.top, 16)
            .rtRiseIn(delay: 0.18)
        }
    }

    // 접지 그림자 — RTBook3D 와 동일 부유 위상(sin(.7t)·3.5)으로 동기. support.js 실측 수치 그대로:
    // 책이 가라앉을수록(floatY>0) 옅고 좁게 / 뜰수록(floatY<0) 진하고 넓게 — README 프로즈 요약
    // ("위로 뜰수록 옅고 좁게")과 방향이 반대이나, §Fidelity 원칙(HTML 인라인 수치가 원본)에 따라
    // 실제 참조 코드(support.js sc=1-floatY·.01, opacity=.5-floatY·.008)를 정본으로 채택.
    var floorShadow: some View {
        RTMotionFrame {
            floorShadowShape(scaleX: 1, alpha: 0.5)
        } anim: { t in
            let floatY = Double(rtBookFloatY(t))   // RTBook3D 부유와 동일 단일 소스
            return floorShadowShape(scaleX: 1 - floatY * 0.01, alpha: 0.5 - floatY * 0.008)
        }
    }
    // alpha 는 그라디언트에 직접 bake — .opacity() 배수(>1 clamp) 로는 "위로 뜰수록 진해짐"
    // 방향을 표현 불가(REST alpha=.5 가 이미 상한 부근이라 배수 상향이 무효화됨). 절대값으로 계산.
    private func floorShadowShape(scaleX: CGFloat, alpha: Double) -> some View {
        Ellipse().fill(RadialGradient(gradient: Gradient(stops: [
            .init(color: Color(hex: 0x3A2C1C, alpha: alpha), location: 0),
            .init(color: Color(hex: 0x3A2C1C, alpha: 0), location: 0.7)]),
            center: .center, startRadius: 0, endRadius: 88))
            .frame(width: 176, height: 26).blur(radius: 8)
            .scaleEffect(x: scaleX, y: 1)
    }

    private var chipText: String {
        if let live { return live.days > 0 ? "읽는 중 · \(live.days)일째" : "읽는 중" }
        return "읽는 중 · 18일째"
    }

    @ViewBuilder var bookView: some View {
        if let live {
            RTBook3D(front: AnyView(
                RTRemoteCover(url: live.coverUrl, size: .init(width: 172, height: 252), radius: 0,
                              title: live.title, author: live.author)),
                     spineTitle: live.title)
        } else {
            RTBook3D { HomeBook3DFront() }
        }
    }

    // ── 도킹 정보 카드 ──
    var card: some View {
        VStack(spacing: 0) {
            // 읽기 CTA + 탭 시작
            HStack(spacing: 10) {
                readCTA
                tapStartButton
            }
            // 보조 안내
            (Text("엎기 어려운 곳이면 ").font(.sans(11, 500)).foregroundColor(RT.faint)
             + Text("탭 시작").font(.sans(11, 600)).foregroundColor(RT.muted)
             + Text("으로 기록하세요").font(.sans(11, 500)).foregroundColor(RT.faint))
                .padding(.top, 12)
            // 스탯 + 연속 체인
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 1) {
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        countUp(live?.todayMin ?? 32)
                        Text("분").font(.sans(13, 700)).foregroundColor(RT.body)
                    }
                    Text("오늘 읽음").font(.sans(10.5, 600)).foregroundColor(RT.muted)
                }
                .fixedSize()
                Rectangle().fill(RT.hair2).frame(width: 1, height: 34)
                VStack(spacing: 0) {
                    HStack {
                        Text("\(live?.streak ?? 12)일 연속").font(.mono(11.5, 700)).foregroundColor(RT.terra)
                        Spacer(minLength: 0)
                        Text("이번 주 \(live?.weekHM ?? "7:26")").font(.mono(11, 500)).foregroundColor(RT.faint)
                    }
                    .padding(.bottom, 8)
                    streakChain
                }
            }
            .padding(EdgeInsets(top: 14, leading: 4, bottom: 12, trailing: 4))
            // 마지막 기록
            HStack(spacing: 11) {
                RoundedRectangle(cornerRadius: 9).fill(RT.greenTint)
                    .frame(width: 30, height: 30)
                    .overlay(RTIcon(["M3.5 12a8.5 8.5 0 1 1 2.6 6.1", "M3.2 19.5l.5-4.2 4.2.6"],
                                    size: 16, stroke: RT.green, lineWidth: 2))
                VStack(alignment: .leading, spacing: 1) {
                    Text("마지막 기록").font(.sans(11, 600)).foregroundColor(RT.muted)
                    (Text("\(live?.lastBook ?? "몰입") · ").font(.sans(13, 700))
                     + Text("\(live?.lastMin ?? 26)").font(.mono(13, 700))
                     + Text("분 읽음").font(.sans(13, 700)))
                        .foregroundColor(RT.ink)
                }
                Spacer(minLength: 0)
                Text(live?.lastWhen ?? "어제 22:14").font(.mono(11, 600)).foregroundColor(RT.faint)
            }
            .padding(EdgeInsets(top: 11, leading: 4, bottom: 11, trailing: 4))
            .overlay(alignment: .top) { Rectangle().fill(RT.hair2).frame(height: 1) }
            // 홈 인디케이터 여백 (막대는 RTChrome/시스템이 그림)
            Color.clear.frame(height: 26)
        }
        .padding(EdgeInsets(top: 16, leading: 20, bottom: 0, trailing: 20))
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26)
                .fill(RT.surface)
                .overlay(alignment: .top) { Rectangle().fill(RT.hair).frame(height: 1) }
                .shadow(color: Color(hex: 0x16140F, alpha: 0.16), radius: 15, x: 0, y: -8)
        )
        .rtRiseIn(delay: 0.26)
    }

    // 읽기(엎기) CTA — 정지=그린 앞면. 모션: 리빙 그라데이션(8s) + 주기 플립(4.6s)으로
    // 다크 뒷면(00:00:00 기록 시작) 예고. "엎으면 이렇게 기록된다"를 정지 상태서도 시연.
    var readCTA: some View {
        RTMotionFrame {
            ctaFront(living: nil)
        } anim: { t in
            let angle = ctaFlipAngle(t)
            let showFront = angle < 90 || angle > 270
            return Group {
                if showFront { ctaFront(living: sin(t * 2 * .pi / 8) * 70) }
                else { ctaBack().scaleEffect(x: 1, y: -1) }   // 뒤집힘 보정(rotateX 180 후 정립)
            }
            .rotation3DEffect(.degrees(angle), axis: (x: 1, y: 0, z: 0), perspective: 0.5)
        }
        .frame(maxWidth: .infinity).frame(height: 60)
        .contentShape(RoundedRectangle(cornerRadius: 16))
        .onTapGesture { model?.start() }
    }

    // rtBtnFlip 주기 4.6s: 0~60% 0°, 60~72% 0→180, 72~84% hold 180(뒷면), 84~96% 180→360.
    private func ctaFlipAngle(_ t: Double) -> Double {
        let p = t.truncatingRemainder(dividingBy: 4.6) / 4.6
        func ease(_ x: Double) -> Double { x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2 }
        switch p {
        case ..<0.60: return 0
        case ..<0.72: return 180 * ease((p - 0.60) / 0.12)
        case ..<0.84: return 180
        case ..<0.96: return 180 + 180 * ease((p - 0.84) / 0.12)
        default: return 360
        }
    }

    // CTA 앞면 (living=nil → 정지 정확 그라데이션 / 값 → 리빙 팬)
    func ctaFront(living: CGFloat?) -> some View {
        HStack(spacing: 10) {
            CTAFlipGlyph()
            Text("엎으면 이어 읽어요").font(.sans(15.5, 700)).tracking(15.5 * -0.01)
                .foregroundColor(RT.ctaText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ctaLivingBG(living))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color(hex: 0x26413A, alpha: 0.5), radius: 12, x: 0, y: 12)
    }

    @ViewBuilder private func ctaLivingBG(_ shift: CGFloat?) -> some View {
        if let shift {
            LinearGradient.css(135, size: CGSize(width: 607, height: 60),
                               [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)])
                .frame(width: 607, height: 60).offset(x: shift)
        } else {
            LinearGradient.css(135, size: CGSize(width: 276, height: 60),
                               [(Color(hex: 0x3A5C4B), 0), (Color(hex: 0x26413A), 1)])
        }
    }

    // CTA 다크 뒷면 (타이머 프리뷰)
    func ctaBack() -> some View {
        ZStack {
            RT.darkGrad(CGSize(width: 276, height: 60))
            Circle().stroke(Color(hex: 0xE2CF9E, alpha: 0.45), lineWidth: 1.5).frame(width: 50, height: 50)
            HStack(spacing: 9) {
                Circle().fill(RT.gold).frame(width: 8, height: 8)
                    .shadow(color: Color(hex: 0xE2CF9E, alpha: 0.85), radius: 4)
                Text("00:00:00").font(.mono(15, 600)).tracking(15 * 0.02).foregroundColor(RT.ctaText)
                Text("기록 시작").font(.sans(13.5, 700)).foregroundColor(RT.gold)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: Color.black.opacity(0.5), radius: 12, x: 0, y: 12)
    }

    // "오늘 읽음" 숫자 — 정지=목표값, 모션=0→목표 카운트업(~1s ease-out cubic).
    // t = 등장 후 경과초(RTMotionFrame 이 라이브에서도 경과초를 넘김) → rtCountUpValue 로 값 산출.
    func countUp(_ target: Int) -> some View {
        RTMotionFrame {
            countUpText(target)
        } anim: { t in
            countUpText(rtCountUpValue(target, elapsed: t))
        }
    }
    private func countUpText(_ v: Int) -> some View {
        Text("\(v)").font(.mono(27, 700)).tracking(27 * -0.02).foregroundColor(RT.ink)
    }

    // 탭 시작 버튼
    var tapStartButton: some View {
        VStack(spacing: 3) {
            StopwatchGlyph()
            Text("탭 시작").font(.sans(9, 700)).tracking(9 * 0.04).foregroundColor(RT.muted)
        }
        .frame(width: 64, height: 60)
        .background(RT.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: 0xE5DFCD), lineWidth: 1))
        .shadow(color: Color(hex: 0x16140F, alpha: 0.24), radius: 7, x: 0, y: 6)
        .contentShape(RoundedRectangle(cornerRadius: 16))
        .onTapGesture { model?.switchTap() }
    }

    // 연속 기록 체인 (13 도트)
    var streakChain: some View {
        HStack(spacing: 4.5) {
            ForEach(Array(chainDots.enumerated()), id: \.offset) { i, dot in
                let isToday = i == chainDots.count - 1
                Group {
                    if dot.ring {
                        Circle().strokeBorder(Color(hex: 0xE0D8C4), lineWidth: 1.4)
                    } else {
                        Circle().fill(dot.color)
                    }
                }
                .frame(width: isToday ? 8 : 7, height: isToday ? 8 : 7)
                .background {
                    if isToday && !dot.ring {
                        RTMotionFrame {
                            Circle().fill(RT.terra.opacity(0.18)).frame(width: 14, height: 14)
                        } anim: { t in
                            let ph = (sin(t * 2 * .pi / 2.6 - .pi / 2) + 1) / 2
                            Circle().fill(RT.terra.opacity(0.24 - 0.19 * ph))
                                .frame(width: 14 + 8 * ph, height: 14 + 8 * ph)
                        }
                    }
                }
                .rtPop(delay: 0.5 + Double(i) * 0.05)
            }
            Spacer(minLength: 0)
        }
    }

    struct Dot { let color: Color; let ring: Bool }
    private var chainDots: [Dot] {
        if let live {
            // 라이브: 미달=링, 달성=terra, 오늘 달성은 위에서 크게+글로우
            return live.chain.map { $0 ? Dot(color: RT.terra, ring: false) : Dot(color: .clear, ring: true) }
        }
        // 데모 = 시안 고정 램프 (픽셀 오라클)
        let ramp: [UInt32] = [0xE3A58F, 0xDC9078, 0xD4805F, 0xCF7355, 0xCA664A, 0xC85F43,
                              0xC2553A, 0xC2553A, 0xC2553A, 0xC2553A, 0xC2553A]
        return [Dot(color: .clear, ring: true), Dot(color: .clear, ring: true)]
            + ramp.map { Dot(color: Color(hex: $0), ring: false) }
    }

    // ── 설정 팝오버 메뉴 ──
    var settingsMenu: some View {
        ZStack(alignment: .topTrailing) {
            Color(hex: 0x17150F, alpha: 0.28)
                .contentShape(Rectangle())
                .onTapGesture { menuOpen = false }
            VStack(spacing: 0) {
                // 프로필 헤더
                menuRow(bg: Color(hex: 0xF1F5EE), padding: EdgeInsets(top: 15, leading: 15, bottom: 15, trailing: 15)) {
                    Circle().fill(RT.ctaGrad(CGSize(width: 40, height: 40)))
                        .frame(width: 40, height: 40)
                        .overlay(Text("지").font(.sans(15, 800)).foregroundColor(RT.ctaText))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("지훈").font(.sans(14.5, 800)).tracking(14.5 * -0.01).foregroundColor(RT.ink)
                        Text("프로필 수정").font(.sans(11.5, 600)).foregroundColor(RT.green)
                    }
                    Spacer(minLength: 0)
                    chev(Color(hex: 0xA99F86))
                } action: { menuOpen = false }
                menuDivider
                menuRow {
                    menuTile(RT.greenTint) {
                        RTIcon(["M4 5.5A1.5 1.5 0 0 1 5.5 4H9a1 1 0 0 1 1 1v13a1 1 0 0 0-1-1H5.5A1.5 1.5 0 0 1 4 15.5z",
                                "M20 5.5A1.5 1.5 0 0 0 18.5 4H15a1 1 0 0 0-1 1v13a1 1 0 0 1 1-1h3.5a1.5 1.5 0 0 0 1.5-1.5z"],
                               size: 17, stroke: RT.green, lineWidth: 1.8)
                    }
                    Text("서재").font(.sans(13.5, 700)).foregroundColor(RT.ink)
                    Spacer(minLength: 0)
                    Text("\(model?.userData?.books.count ?? 24)").font(.mono(12, 600)).foregroundColor(RT.faint)
                    chev(RT.ghost)
                } action: { menuOpen = false; model?.nav(.library) }
                menuDivider
                menuRow {
                    menuTile(RT.greenTint) {
                        RTIcon(["M5 20V11M12 20V4M19 20v-6"], size: 17, stroke: RT.green, lineWidth: 1.9)
                    }
                    Text("통계").font(.sans(13.5, 700)).foregroundColor(RT.ink)
                    Spacer(minLength: 0)
                    chev(RT.ghost)
                } action: { menuOpen = false; model?.nav(.statsWeek) }
                menuDivider
                menuRow(padding: EdgeInsets(top: 12, leading: 15, bottom: 13, trailing: 15)) {
                    menuTile(RT.amberTint) {
                        RTIcon(["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5M21 12H9"],
                               size: 16, stroke: RT.terra, lineWidth: 1.8)
                    }
                    Text("로그아웃").font(.sans(13.5, 700)).foregroundColor(Color(hex: 0xB56A55))
                    Spacer(minLength: 0)
                } action: { menuOpen = false; model?.logout() }
            }
            .frame(width: 234)
            .background(RT.surface)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(RT.hair, lineWidth: 1))
            .shadow(color: Color(hex: 0x16140F, alpha: 0.5), radius: 23, x: 0, y: 22)
            .padding(.top, 92)
            .padding(.trailing, 20)
        }
        .frame(width: 390, height: 844)
    }

    @ViewBuilder func menuRow<C: View>(bg: Color = .clear,
                                       padding: EdgeInsets = EdgeInsets(top: 12, leading: 15, bottom: 12, trailing: 15),
                                       @ViewBuilder content: () -> C, action: @escaping () -> Void) -> some View {
        HStack(spacing: 12, content: content)
            .padding(padding)
            .frame(maxWidth: .infinity)
            .background(bg)
            .contentShape(Rectangle())
            .onTapGesture(perform: action)
    }
    var menuDivider: some View { Rectangle().fill(Color(hex: 0xEEE7D6)).frame(height: 1) }
    func menuTile<C: View>(_ bg: Color, @ViewBuilder icon: () -> C) -> some View {
        RoundedRectangle(cornerRadius: 9).fill(bg).frame(width: 30, height: 30).overlay(icon())
    }
    func chev(_ color: Color) -> some View {
        RTIcon(["M9 6l6 6-6 6"], size: 15, stroke: color, lineWidth: 2.2)
    }
}

// ── CTA 엎기 글리프 (viewBox 30×24) ──
struct CTAFlipGlyph: View {
    var body: some View {
        RTIcon([
            "M13 2.5H17.5A2 2 0 0 1 19.5 4.5V16.5A2 2 0 0 1 17.5 18.5H13A2 2 0 0 1 11 16.5V4.5A2 2 0 0 1 13 2.5Z",
            "M7.5 6.5A9 9 0 0 0 4 12", "M2 10.5 4 12.4l2.2-1.7",
            "M22.5 17.5A9 9 0 0 0 26 11.5", "M28 13.5 26 11.6l-2.2 1.7",
        ], width: 23, height: 18.4, viewBoxW: 30, viewBoxH: 24, stroke: RT.ctaText, lineWidth: 1.9)
    }
}

// ── 탭 시작 스톱워치 글리프 (viewBox 24) ──
struct StopwatchGlyph: View {
    var body: some View {
        RTIcon([
            "M9.6 2.7h4.8", "M12 2.7v2.1",
            "M12 5.7a7.7 7.7 0 1 0 0 15.4a7.7 7.7 0 1 0 0-15.4",
            "M12 13.4V9.1", "M18.4 7.2l1.3-1.3",
        ], size: 21, stroke: RT.green, lineWidth: 1.8)
    }
}

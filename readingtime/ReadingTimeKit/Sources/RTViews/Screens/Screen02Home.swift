import SwiftUI

// 02 홈 (읽던 책 있음) — 리디자인 "정물" (design_handoff_home_redesign). 서가/pickup 걷어내고
// 저녁 독서등 아래 놓인 실물 3D 책 한 권 + 도킹 정보 카드. 폰을 엎으면 이어 기록(FlipEngine 그대로).
//
// 데모/라이브 이중 경로 유지 (userData==nil = 시안 데모값 = rtshot 픽셀 오라클 경로).
// 정적 렌더(모션 off)가 idle 정지 포즈 — 리빙 그라데이션·플립·카운트업·부유는 모션 시에만.
public struct Screen02Home: View {
    struct Live {
        let title: String
        let author: String         // 유지 — RTRemoteCover 폴백 렌더용. 화면엔 그리지 않는다.
        let coverUrl: String
        let totalHM: String        // "4:12"
        let days: Int              // 18 (함께한 일수)
        let todayMin: Int          // 46
        let weekHM: String         // "2:24"
        let streak: Int            // 9
        let bestStreak: Int        // 24 — 0 이면 과거 완료 구간 없음 → 게이지 하단 행 숨김
        let bestStreakMonth: String// "3월" / 해가 다르면 "2025.11"
        let cal14: [HomeCalCell]   // 정확히 14개 (월→일 × 2주)
        let lastBook: String?      // "몰입"
        let lastMin: Int?          // 22
        let lastWhen: String?      // "오늘 21:47"
    }

    // 파트너 행 (함께 읽기) — 도킹 카드 최하단. nil 이면 행 숨김(README AC #6).
    struct Partner {
        let name: String
        let initial: String
        let avatar: CGImage?
        let reading: Bool          // 지금 읽는 중 = 회전 링+헤일로+"지금 읽는 중"
        let idleText: String       // idle 배지 "N시간 전"
        let book: String?          // 현재 읽는 책 (없으면 2행 생략)
        let todayMin: Int
    }

    var model: RTAppModel?
    private let live: Live?
    private let avatar: CGImage?   // init 스냅샷 (사진 선택 즉시 반영용 — live 와 같은 이유)
    private let partner: Partner?
    @State private var menuOpen: Bool

    public init(model: RTAppModel? = nil, menuOpen: Bool = false) {
        self.model = model
        self.avatar = model?.avatarImage
        _menuOpen = State(initialValue: menuOpen)
        if let m = model, m.userData != nil, let card = m.homeCards.first {
            let book = card.isbn.flatMap { isbn in m.userData?.books.first { $0.isbn == isbn } }
            let paperLast = m.recentRecords(1).first
            let ebookLast = m.ebookReadAt.max { $0.value < $1.value }
            let ebookIsLatest = ebookLast.map { ebook in
                paperLast.map { ebook.value > $0.endedAt } ?? true
            } ?? false
            let paperLastTitle = paperLast.flatMap { record in
                m.userData?.books.first { $0.isbn == record.isbn }?.title
            }
            let ebookLastMinutes = ebookLast.flatMap { ebook in
                m.ebookBreakdown(on: ebook.value).first { $0.title == ebook.key }.map { $0.seconds / 60 }
            }
            self.live = Live(
                title: book?.title ?? card.title,
                author: book?.author ?? card.author ?? "밀리의서재",
                coverUrl: book?.coverUrl ?? card.coverUrl,
                totalHM: book.map { RTAppModel.hmString(m.totalSeconds(isbn: $0.isbn)) }
                    ?? RTAppModel.hmString(m.countedEbookTotalSeconds),
                days: book.map(m.daysSinceAdded) ?? 1,
                todayMin: m.todaySeconds / 60,
                weekHM: RTAppModel.hmString(m.weekSeconds),
                streak: m.streakDays,
                bestStreak: m.bestStreak.days,
                bestStreakMonth: m.bestStreak.monthLabel,
                cal14: m.calendarWindow14,
                lastBook: ebookIsLatest ? ebookLast?.key : (paperLastTitle ?? card.title),
                lastMin: ebookIsLatest ? (ebookLastMinutes ?? 0) : paperLast.map { $0.seconds / 60 },
                lastWhen: ebookIsLatest
                    ? ebookLast.map { RTAppModel.recentWhen($0.value, now: m.now()) }
                    : paperLast.map { RTAppModel.recentWhen($0.endedAt, now: m.now()) })
        } else {
            self.live = nil
        }
        // 파트너 행: 실데이터(partnerData) 있으면 그걸로, 없으면(데모/시안 픽셀 경로) 시안 데모값.
        // partnerData 미로드 + 라이브(내 실데이터)면 nil → 행 숨김(백엔드 배선 전, README AC #6).
        if let m = model, let pdata = m.partnerData {
            let cal = Calendar(identifier: .gregorian)
            let last = pdata.sessions.max { $0.endedAt < $1.endedAt }
            let todaySec = pdata.sessions.filter { cal.isDate($0.endedAt, inSameDayAs: m.now()) }
                .reduce(0) { $0 + $1.seconds }
            self.partner = Partner(
                name: m.partnerName, initial: m.partnerInitial, avatar: m.partnerAvatar,
                reading: m.partnerReadingNow,
                idleText: last.map { RTAppModel.agoText($0.endedAt, now: m.now()) } ?? "기록 없음",
                book: pdata.books.last { !$0.finished }?.title,
                todayMin: todaySec / 60)
        } else if model?.userData == nil {
            // 데모/시안 픽셀 경로 — README 데모값 (소연 · 지금 읽는 중 · 작별하지 않는다 · 24분)
            self.partner = Partner(
                name: model?.partnerName ?? "소연", initial: model?.partnerInitial ?? "소",
                avatar: nil, reading: true, idleText: "3시간 전",
                book: "작별하지 않는다", todayMin: 24)
        } else {
            self.partner = nil
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            lightPool
            // vignette 는 배경 레이어 — 도킹 카드 위에 덮이면 카드 하단·모서리가 탁해진다
            // (실기기 2026-08-26: '하단 색상 깨짐'). 표지 무대에만 적용되도록 카드 아래로 내림.
            vignette
            VStack(spacing: 0) {
                header
                Spacer(minLength: 0)
                stage
                Spacer(minLength: 0)
                card
            }
            if menuOpen { RTHomeMenu(model: model, avatar: avatar) { menuOpen = false } }
        }
        .frame(width: 390, height: 844)
    }

    // ── 2. 따뜻한 독서등 빛 웅덩이 (책 뒤 중앙) ──
    // 표지가 29% 작아지고 카드가 커지며 책이 위로 올라갔다 → 조명도 따라 올린다.
    // 시안 #14a 실측: 420×420, 중심 (195, 244) — 종전 520×520 @ (195,300).
    var lightPool: some View {
        RadialGradient(gradient: Gradient(stops: [
            .init(color: Color(hex: 0xFFE4B4, alpha: 0.88), location: 0),
            .init(color: Color(hex: 0xFFE4B4, alpha: 0.30), location: 0.34),
            .init(color: Color(hex: 0xFFE4B4, alpha: 0), location: 0.62)]),
            center: .center, startRadius: 0, endRadius: 210)
            .frame(width: 420, height: 420)
            .position(x: 195, y: 244)
    }

    // ── 5. 가장자리 비네트 (저녁 딤) ──
    // 시안 #14a: radial-gradient(115% 78% at 50% 32%, …) → 타원 반지름 rx 448.5 · ry 658.32,
    // 중심 (195, 270.08). CSS 는 축별 비율이 다르므로 EllipticalGradient 를 2rx×2ry 프레임에 그려
    // (endRadiusFraction .5 = 프레임 반지름) 중심을 배치한다. 화면 네 모서리는 전부 타원 안쪽(≤0.974).
    var vignette: some View {
        EllipticalGradient(gradient: Gradient(stops: [
            .init(color: .clear, location: 0.40),
            .init(color: Color(hex: 0x3A2A16, alpha: 0.09), location: 0.74),
            .init(color: Color(hex: 0x2E2010, alpha: 0.20), location: 1)]),
            center: .center, startRadiusFraction: 0, endRadiusFraction: 0.5)
            .frame(width: 897, height: 1316.64)
            .position(x: 195, y: 270.08)
            .frame(width: 390, height: 844)
            .clipped()
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
                // 우상단은 아바타 (SCREENS.md §02 "아바타(이니셜 34)") — 탭하면 설정 메뉴
                RTAvatar(model?.displayInitial ?? "지", photo: avatar)
                    .accessibilityIdentifier("home.avatar")
                    .accessibilityValue(avatar == nil ? "initial" : "photo")
                    .contentShape(Circle())
                    .onTapGesture { menuOpen = true }
            }
        }
        .padding(EdgeInsets(top: 52, leading: 22, bottom: 0, trailing: 22))
    }

    // ── 히어로 스테이지 (칩 + 책 + 제목) ──
    @ViewBuilder var stage: some View {
        // 라이브(실데이터)면 표지 캐러셀 — 읽는 중 종이책 + 최근 밀리 책 (2026-08-25 결정).
        // 데모(userData nil)는 카드가 비어 기존 단일 히어로를 그린다 → rtshot 오라클 불변.
        if let m = model, !m.homeCards.isEmpty {
            RTHomeCarousel(model: m)
                .padding(.horizontal, 26)
        } else {
            demoStage
        }
    }

    var demoStage: some View {
        VStack(spacing: 0) {
            RTHomeHeroBody(title: live?.title ?? "몰입",
                           badgeText: badgeText,
                           amber: false) {
                bookView
            } trailing: {
                RTHomeAccum(text: live?.totalHM ?? "4:12")
            }
            // 데모/스크린샷은 "여러 권을 병행해 읽는 사용자의 홈"이 정본 — 점이 없으면 히어로가
            // 캐러셀이라는 사실을 알 수 없다(작업지시서 v3 §3.4). 시안 #14a = 3개, 활성 index 0.
            RTHomeDots(count: 3, active: 0)
                .padding(.top, 18).padding(.bottom, 16)
        }
        .padding(.horizontal, 26)   // 시안 스테이지 padding: 0 26px (누락돼 긴 제목이 화면 끝까지 닿았음)
    }

    // 히어로 상태 배지 문구 — 종이책 "N일째". 밀리 분기는 캐러셀에만 있다(데모는 종이책 고정).
    private var badgeText: String {
        if let live { return "\(live.days)일째" }
        return "18일째"
    }

    @ViewBuilder var bookView: some View {
        if let live {
            // 라이브 표지에도 시안의 앞면 처리(책등 음영·책배·광택) 적용 — 없으면 실표지 책이
            // 밋밋해 3D 가 안 읽힘. 데모(HomeBook3DFront)는 baked-in 이라 그대로 둔다.
            RTBook3D(front: AnyView(
                RTRemoteCover(url: live.coverUrl, size: .init(width: 172, height: 252), radius: 0,
                              title: live.title, author: live.author)
                    .rtBookFace(size: .init(width: 172, height: 252))),
                     spineTitle: live.title)
        } else {
            RTBook3D { HomeBook3DFront() }
        }
    }

    // ── 도킹 정보 카드 ──
    var card: some View {
        VStack(spacing: 0) {
            // 읽기 CTA + 탭 시작
            // model 은 일반 var 라 @Published(homeCardIndex) 변경이 이 화면에 전파되지 않는다.
            // 캐러셀만 @ObservedObject 라 카드는 넘어가는데 CTA 는 이전 카드로 남았다
            // (실기기 2026-08-26: 종이책 카드인데 '밀리에서 자동 기록 중'). → 관찰 래퍼로 감싼다.
            RTObserveModel(model: model) { recordable in
                // 보조 안내 문구는 삭제 — 엎기/탭 안내는 CTA 라벨이 이미 말하고,
                // 밀리 문구는 배지·CTA·안내 3중 중복이었다(작업지시서 v3 §4-①).
                HStack(spacing: 10) {
                    if recordable {
                        readCTA
                        tapStartButton
                    } else {
                        readCTADisabled   // 밀리 카드: 기록 진입점 자체를 노출하지 않는다
                    }
                }
            }
            myRecordHeader
            streakBlock
            dowHeader
            calendarGrid
            // 마지막 기록
            HStack(spacing: 11) {
                RoundedRectangle(cornerRadius: 9).fill(RT.greenTint)
                    .frame(width: 30, height: 30)
                    .overlay(RTIcon(["M3.5 12a8.5 8.5 0 1 1 2.6 6.1", "M3.2 19.5l.5-4.2 4.2.6"],
                                    size: 16, stroke: RT.green, lineWidth: 2))
                VStack(alignment: .leading, spacing: 1) {
                    Text("마지막 기록").font(.sans(11, 600)).foregroundColor(RT.muted)
                    (Text("\(live?.lastBook ?? "몰입") · ").font(.sans(13, 700))
                     + Text("\(live?.lastMin ?? 22)").font(.mono(13, 700))
                     + Text("분 읽음").font(.sans(13, 700)))
                        .foregroundColor(RT.ink)
                        .lineLimit(1).minimumScaleFactor(0.65)   // 긴 책 제목이 2줄로 카드 깨뜨리던 것
                }
                Spacer(minLength: 0)
                Text(live?.lastWhen ?? "오늘 21:47").font(.mono(11, 600)).foregroundColor(RT.faint)
            }
            .padding(EdgeInsets(top: 9, leading: 4, bottom: 9, trailing: 4))
            .overlay(alignment: .top) { Rectangle().fill(RT.hair2).frame(height: 1) }
            .contentShape(Rectangle())
            .onTapGesture { model?.openRecentDetail() }   // 마지막 기록 → 그 책 상세(08)
            .accessibilityElement(children: .combine)     // 자식 전파 방지 — 단일 요소(테스트 오라클)
            .accessibilityIdentifier("home.recentRow")
            // 파트너 행 (함께 읽기) — 도킹 카드 최하위. 위계: 내 책 > 내 기록 > 소연.
            if let p = partner { partnerRow(p) }
            // 홈 인디케이터 여백 (막대는 RTChrome/시스템이 그림)
            Color.clear.frame(height: 26)
        }
        .padding(EdgeInsets(top: 14, leading: 20, bottom: 0, trailing: 20))
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 26, topTrailingRadius: 26)
                .fill(RT.surface)
                .overlay(alignment: .top) { Rectangle().fill(RT.hair).frame(height: 1) }
                .shadow(color: Color(hex: 0x16140F, alpha: 0.16), radius: 15, x: 0, y: -8)
        )
        .rtRiseIn(delay: 0.26)
    }

    // ── ② 내 기록 헤더 행 ──────────────────────────────────────────────────
    var myRecordHeader: some View {
        HStack(spacing: 7) {
            Text("내 기록").font(.sans(13, 800)).foregroundColor(RT.ink).rtLB(RTLB.n13)
            if isNewRecord { newRecordBadge }
            Spacer(minLength: 0)
            statsButton
        }
        .padding(EdgeInsets(top: 13, leading: 4, bottom: 0, trailing: 4))
    }

    /// 통계 진입점 — 아바타 메뉴를 거치지 않고 주간 기록(10)으로 직행한다.
    /// 아이콘은 RTHomeMenu 통계 행과 동일 기호(같은 목적지). 꺽쇠는 이 디자인에서 금지 패턴.
    var statsButton: some View {
        HStack(spacing: 6) {
            RTIcon(["M5 20V11M12 20V4M19 20v-6"], size: 13, stroke: RT.green, lineWidth: 1.9)
            Text("전체 통계").font(.sans(11.5, 700)).foregroundColor(RT.green).rtLB(RTLB.n11_5)
        }
        .padding(EdgeInsets(top: 5, leading: 9, bottom: 5, trailing: 11))
        .background(Capsule().fill(RT.greenTint))
        // 히트 영역은 **아래로만** 9pt 확장 (캡슐 27 + 9 = 36pt ≥ AC #16).
        // 위로도 늘리면 CTA 행(60pt, 탭 대상)의 히트 영역을 뺏는다. 아래는 연속 블록이고 탭 대상이 아니다.
        // .padding(.vertical, N) 을 그대로 쓰면 SwiftUI 는 레이아웃 높이에 더해(CSS 와 다름)
        // 이하 모든 블록이 밀리므로 음수 패딩으로 원복한다 — 행 높이 27 유지.
        .padding(.bottom, 9)
        .contentShape(Capsule())
        .padding(.bottom, -9)
        .onTapGesture { model?.nav(.statsWeek) }
        .accessibilityElement(children: .ignore)
        .accessibilityIdentifier("home.statsButton")
        .accessibilityLabel("전체 통계")
        .accessibilityAddTraits(.isButton)
    }

    /// 신기록 배지 — 짐·큐 앱의 신기록 문법. ▲ 는 폰트 글리프 의존을 없애려 3.5×3 Path 로 그린다.
    var newRecordBadge: some View {
        HStack(spacing: 4) {
            Path { p in
                p.move(to: CGPoint(x: 1.75, y: 0))
                p.addLine(to: CGPoint(x: 3.5, y: 3))
                p.addLine(to: CGPoint(x: 0, y: 3))
                p.closeSubpath()
            }
            .fill(RT.amberDeep)
            .frame(width: 3.5, height: 3)
            Text("신기록").font(.sans(10.5, 700)).foregroundColor(RT.amberDeep).rtLB(RTLB.n10_5)
        }
        .padding(EdgeInsets(top: 3, leading: 8, bottom: 3, trailing: 8))
        .background(Capsule().fill(RT.amberTint))
        .rtBreath(duration: 2.6)
    }

    // ── ③ 연속 / 오늘 블록 ────────────────────────────────────────────────
    var streakBlock: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    countUp(todayMinVal)
                    Text("분").font(.sans(13, 700)).foregroundColor(RT.body).rtLB(RTLB.n13)
                }
                Text("오늘 읽음").font(.sans(10.5, 600)).foregroundColor(RT.muted).rtLB(RTLB.n10_5)
                    .padding(.top, 4)
            }
            .fixedSize()
            Rectangle().fill(RT.hair2).frame(width: 1, height: 42)
            VStack(spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(streakVal)일 연속").font(.mono(13, 700))
                        .foregroundColor(streakColor).rtLB(RTLB.m13)
                    Spacer(minLength: 0)
                    Text("이번 주 \(weekHMVal)").font(.mono(11, 500))
                        .foregroundColor(RT.faint).rtLB(RTLB.m11)
                }
                gauge.padding(.top, 7)
                // 과거 완료 구간이 없으면(best == 0) 하단 행 전체를 숨긴다 — 빈 트랙만 남는다.
                if bestVal > 0 {
                    HStack(spacing: 5) {
                        Text("역대 최고").font(.sans(10, 600)).foregroundColor(RT.faint).rtLB(RTLB.n10)
                        Text("\(bestVal)일").font(.mono(10.5, 600)).foregroundColor(RT.muted).rtLB(RTLB.m10_5)
                        Text("· \(bestMonthVal)").font(.sans(10, 500)).foregroundColor(RT.faint).rtLB(RTLB.n10)
                        Spacer(minLength: 0)
                        Text(remainLabel).font(.mono(10.5, 700)).foregroundColor(streakColor).rtLB(RTLB.m10_5)
                    }
                    .padding(.top, 6)
                }
            }
            // combine 이 이 VStack 전체를 한 요소로 묶고 label 이 병합 라벨을 덮으므로,
            // 같은 묶음 안에 있는 '이번 주 N:NN' 을 라벨에 넣지 않으면 VoiceOver 에서 사라진다
            // (주간 누적은 홈에서 이 한 곳뿐이라 대체 경로가 없다). §8-3 예시 문구에 이번 주를 더한다.
            .accessibilityElement(children: .combine)
            .accessibilityLabel(bestVal > 0
                ? "\(streakVal)일 연속, 이번 주 \(weekHMVal), 역대 최고 \(bestVal)일, \(remainLabel)"
                : "\(streakVal)일 연속, 이번 주 \(weekHMVal)")
        }
        .padding(EdgeInsets(top: 10, leading: 4, bottom: 0, trailing: 4))
    }

    /// 역대 최고 대비 게이지. 눈금(역대 최고 지점)은 tickFrac == 1 일 때 트랙 오른쪽 끝에 딱 붙어야
    /// 하므로 offset 에서 폭 1.5 를 빼 안쪽으로 넣는다. 트랙 폭은 GeometryReader 로 받는다.
    var gauge: some View {
        GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Color(hex: 0xECE5D2))
                gaugeFill(w: w)
                if bestVal > 0 {
                    Rectangle().fill(Color(hex: 0x17150F, alpha: 0.34))
                        .frame(width: 1.5)
                        .offset(x: w * tickFrac - 1.5)
                }
            }
        }
        .frame(height: 5)
        .clipShape(Capsule())
    }

    @ViewBuilder private func gaugeFill(w: CGFloat) -> some View {
        // LinearGradient.css 는 size: 를 반드시 넘겨야 한다 — 픽셀 공간에서 각도를 계산하므로
        // 생략하면 1×1 로 왜곡된다.
        let fw = max(w * gaugeFrac, 0.001)
        let fill = Capsule()
            .fill(LinearGradient.css(90, size: CGSize(width: fw, height: 5), gaugeStops))
            .frame(width: w * gaugeFrac)
        // 신기록 하이라이트는 RTRankRow 진행 바와 동일한 모디파이어를 쓴다(정적 렌더에선 미표시).
        if isNewRecord { fill.rtSweep() } else { fill }
    }

    private var gaugeStops: [(color: Color, location: Double)] {
        isNewRecord ? [(RT.gold, 0), (RT.amber, 1)]
                    : [(Color(hex: 0xDC9078), 0), (Color(hex: 0xC2553A), 1)]
    }

    // ── ④ 요일 헤더 ──────────────────────────────────────────────────────
    // Screen11Month.dowHeader 와 동일 규칙: mono 10 / 500, 일요일만 terra. 오늘 열은 강조하지 않는다
    // (그건 Screen10Stats.barRow 의 막대 차트 규칙이며 캘린더에는 적용하지 않는다).
    var dowHeader: some View {
        HStack(spacing: 6) {
            ForEach(Array(["월", "화", "수", "목", "금", "토", "일"].enumerated()), id: \.offset) { i, d in
                Text(d).font(.mono(10, 500))
                    .foregroundColor(i == 6 ? RT.terra : RT.faint)
                    .rtLB(RTLB.m10)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(EdgeInsets(top: 14, leading: 4, bottom: 0, trailing: 4))
        .accessibilityHidden(true)
    }

    // ── ⑤ 2주 캘린더 ─────────────────────────────────────────────────────
    var calendarGrid: some View {
        VStack(spacing: 6) {
            ForEach(0..<2, id: \.self) { row in
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { col in
                        calCell(cal14[row * 7 + col]).frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding(EdgeInsets(top: 6, leading: 4, bottom: 13, trailing: 4))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("최근 2주 독서 기록")
    }

    /// 칸 하나 — 분기 순서를 반드시 지킬 것: ① 오늘 그리고 분>0 → ② 미래 → ③ 미기록 과거 → ④ 읽은 과거.
    /// weight 700 은 "오늘"의 표식이지 읽었는지의 표식이 아니다 → 오늘 미기록도 700 유지.
    @ViewBuilder func calCell(_ c: HomeCalCell) -> some View {
        let filledToday = c.isToday && c.minutes > 0
        let base = Text("\(c.day)")
            .font(.mono(11.5, c.isToday ? 700 : 500))
            .tracking(11.5 * 0.01)
            .foregroundColor(calFG(c, filledToday: filledToday))
            .rtLB(RTLB.m11_5)
            .frame(maxWidth: .infinity)
            .frame(height: 33)
            .background(RoundedRectangle(cornerRadius: 10).fill(calBG(c, filledToday: filledToday)))
            .overlay {
                // 읽은 과거만 안쪽 1pt — 색면 경계를 살짝 잡아준다
                if !filledToday && !c.isFuture && c.minutes > 0 {
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color(hex: 0x7A3C28, alpha: 0.05), lineWidth: 1)
                }
            }
        Group {
            if filledToday {
                base.rtRing(10, RT.terra.opacity(0.13), width: 3)
            } else {
                base
            }
        }
        // 색만으로 분량을 전달하므로 VoiceOver 대체 텍스트가 필수
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(calMonth(c))월 \(c.day)일")
        .accessibilityValue(c.minutes > 0 ? "\(c.minutes)분" : "기록 없음")
        .accessibilityAddTraits(c.isToday ? .isSelected : [])
        .accessibilityHidden(c.isFuture)
    }

    /// 색면이 깔린 칸(읽은 과거)에는 월간(11)의 "일요일은 항상 terra" 규칙을 적용하지 않는다 —
    /// 색면 위 terra 숫자는 대비가 2.1:1 까지 떨어진다(월간엔 셀 배경이 없어 안 생기는 문제).
    private func calFG(_ c: HomeCalCell, filledToday: Bool) -> Color {
        if filledToday { return .white }
        if c.isFuture { return Color(hex: 0xD3CBB6) }
        if c.minutes == 0 { return c.isSunday ? RT.terra : RT.faint }
        return Color(hex: 0x2E1C15)
    }
    private func calBG(_ c: HomeCalCell, filledToday: Bool) -> Color {
        if filledToday { return RT.terra }
        if c.isFuture || c.minutes == 0 { return .clear }
        return RT.terra.opacity(RTHomeCal.alpha(c.minutes))
    }
    private func calMonth(_ c: HomeCalCell) -> Int {
        Calendar(identifier: .gregorian).component(.month, from: c.date)
    }

    // ── 기록 블록 파생값 (데모는 시안 #14a 고정값) ────────────────────────
    private var todayMinVal: Int { live?.todayMin ?? 46 }
    private var weekHMVal: String { live?.weekHM ?? "2:24" }
    private var streakVal: Int { live?.streak ?? 9 }
    private var bestVal: Int { live?.bestStreak ?? 24 }
    private var bestMonthVal: String { live?.bestStreakMonth ?? "3월" }
    private var cal14: [HomeCalCell] {
        let w = live?.cal14 ?? []
        return w.count == 14 ? w : Self.demoCal14
    }
    private var isNewRecord: Bool { bestVal > 0 && streakVal > bestVal }
    private var gaugeFrac: CGFloat {
        bestVal <= 0 ? 0 : min(1, CGFloat(streakVal) / CGFloat(bestVal))
    }
    private var tickFrac: CGFloat {
        isNewRecord ? CGFloat(bestVal) / CGFloat(streakVal) : 1.0
    }
    private var streakColor: Color { isNewRecord ? RT.amberDeep : RT.terra }
    private var remainLabel: String {
        if isNewRecord { return "+\(streakVal - bestVal)일" }
        if streakVal == bestVal { return "최고 타이" }
        return "\(bestVal - streakVal)일 남음"
    }

    /// 데모 캘린더 창 — 2026-08-27(목) 고정. 오늘 날짜가 바뀌어도 스크린샷이 흔들리면 안 된다(AC #23).
    static let demoCal14: [HomeCalCell] = {
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 2
        let mins = [0, 0, 34, 52, 41, 63, 28, 12, 47, 39, 46, 0, 0, 0]
        return (0..<14).map { i in
            let d = c.date(from: DateComponents(year: 2026, month: 8, day: 17 + i)) ?? Date()
            return HomeCalCell(date: d, day: 17 + i, minutes: mins[i],
                               isToday: i == 10, isFuture: i > 10, isSunday: i % 7 == 6)
        }
    }()

    // ── 파트너 행 (함께 읽기) — 마지막 기록 행과 같은 행 문법. 탭 → 파트너 통계 ──
    func partnerRow(_ p: Partner) -> some View {
        HStack(spacing: 11) {
            // 아바타 30pt = 위 '마지막 기록' 아이콘과 동일 크기·시작점(leading 정렬).
            // 헤일로(50pt)·링(34pt)은 background/overlay 로 레이아웃 밖에 그려 행 시작점을 밀지 않음.
            Circle().fill(RT.segBg)
                .frame(width: 30, height: 30)
                .overlay(RTAvatarFill(initial: p.initial, photo: p.avatar,
                                      size: 30, fontSize: 12, initialColor: RT.body))
                .background {
                    if p.reading {   // 은은한 초록 헤일로 (뒤, 레이아웃 무영향)
                        RadialGradient(gradient: Gradient(stops: [
                            .init(color: Color(hex: 0x2C4A3C, alpha: 0.15), location: 0),
                            .init(color: Color(hex: 0x2C4A3C, alpha: 0), location: 0.68)]),
                            center: .center, startRadius: 0, endRadius: 25)
                            .frame(width: 50, height: 50)
                    }
                }
                .overlay {
                    if p.reading {   // 회전 라이브 타이머 링 (아바타 중심, 34pt·4.5s ∞)
                        ZStack {
                            Circle().stroke(RT.green.opacity(0.12), lineWidth: 2)
                            Circle().trim(from: 0, to: 0.25)          // dasharray "27 200" ≈ 원주 25%
                                .stroke(RT.green, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                                .rotationEffect(.degrees(-90))
                        }
                        .frame(width: 34, height: 34)
                        .rtSpin(duration: 4.5)
                    }
                }
            // 텍스트 열
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(p.name).font(.sans(13, 700)).foregroundColor(RT.ink)
                    if p.reading {
                        Text("지금 읽는 중").font(.sans(11, 600)).foregroundColor(RT.green)
                    } else {
                        Text(p.idleText).font(.mono(11, 500)).foregroundColor(RT.faint)
                    }
                }
                if let book = p.book {
                    Text(book).font(.sans(11.5, 500)).foregroundColor(RT.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            // 우측 오늘 시간
            VStack(alignment: .trailing, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text("\(p.todayMin)").font(.mono(13, 700)).foregroundColor(RT.ink)
                    Text("분").font(.sans(10, 600)).foregroundColor(RT.muted)
                }
                Text("오늘").font(.sans(9.5, 500)).foregroundColor(RT.faint)
            }
        }
        .padding(EdgeInsets(top: 9, leading: 4, bottom: 9, trailing: 4))
        .overlay(alignment: .top) { Rectangle().fill(RT.hair2).frame(height: 1) }
        .contentShape(Rectangle())
        .onTapGesture { model?.openPartnerStats() }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("home.partnerRow")
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

    /// 밀리 카드 선택 중 CTA — 기록 대상이 아님을 불투명 카드로 알린다.
    /// (반투명 opacity 는 홈 vignette 가 비쳐 '색 깨짐'으로 읽혔다 — 실기기 피드백 2026-08-26)
    var readCTADisabled: some View {
        HStack(spacing: 8) {
            RTIcon(RTIconPath.check, size: 15, stroke: RT.faint, lineWidth: 2.2)
            Text("밀리에서 자동 기록 중").font(.sans(14, 700)).foregroundColor(RT.faint)
        }
        .frame(maxWidth: .infinity).frame(height: 60)
        .background(RoundedRectangle(cornerRadius: 16).fill(RT.segBg))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color(hex: 0xE5DFCD), lineWidth: 1))
    }

    /// 선택된 홈 카드가 기록 대상인가 (밀리면 false). 데모는 항상 true.
    private var recordable: Bool { model?.selectedCardRecordable ?? true }

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
    // 카운트업 중 숫자 폭·높이가 바뀌면 블록이 흔들리므로 라인박스를 고정한다.
    // 오늘 미기록(0)은 terra 로 눈에 걸리게 한다(상태 매트릭스 B).
    private func countUpText(_ v: Int) -> some View {
        Text("\(v)").font(.mono(27, 700)).tracking(27 * -0.02)
            .foregroundColor(todayMinVal == 0 ? RT.terra : RT.ink)
            .rtLB(RTLB.m27)
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

}

// ── 아바타 메뉴 (02·14 공용) — 프로필/서재/통계/로그아웃 ──
// 빈 홈(14)도 같은 메뉴를 쓴다: 설정 시트 직행이면 완독 직후(읽는 중 0권)
// 서재 진입 경로가 없음 (실기기 보고 2026-07-13).
struct RTHomeMenu: View {
    var model: RTAppModel?
    let avatar: CGImage?
    let close: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color(hex: 0x17150F, alpha: 0.28)
                .contentShape(Rectangle())
                .onTapGesture { close() }
            VStack(spacing: 0) {
                // 프로필 헤더
                menuRow(bg: Color(hex: 0xF1F5EE), padding: EdgeInsets(top: 15, leading: 15, bottom: 15, trailing: 15)) {
                    Circle().fill(RT.ctaGrad(CGSize(width: 40, height: 40)))
                        .frame(width: 40, height: 40)
                        .overlay(RTAvatarFill(initial: model?.displayInitial ?? "지", photo: avatar,
                                              size: 40, fontSize: 15, initialColor: RT.ctaText))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(model?.displayNameOrDemo ?? "지훈").font(.sans(14.5, 800)).tracking(14.5 * -0.01).foregroundColor(RT.ink)
                        Text("프로필 수정").font(.sans(11.5, 600)).foregroundColor(RT.green)
                    }
                    Spacer(minLength: 0)
                    chev(Color(hex: 0xA99F86))
                } action: { close(); model?.openSheet(.settings) }   // 프로필 수정 = 설정 시트(이름 수정)
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
                } action: { close(); model?.nav(.library) }
                menuDivider
                menuRow {
                    menuTile(RT.greenTint) {
                        RTIcon(["M5 20V11M12 20V4M19 20v-6"], size: 17, stroke: RT.green, lineWidth: 1.9)
                    }
                    Text("통계").font(.sans(13.5, 700)).foregroundColor(RT.ink)
                    Spacer(minLength: 0)
                    chev(RT.ghost)
                } action: { close(); model?.nav(.statsWeek) }
                menuDivider
                menuRow(padding: EdgeInsets(top: 12, leading: 15, bottom: 13, trailing: 15)) {
                    menuTile(RT.amberTint) {
                        RTIcon(["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5M21 12H9"],
                               size: 16, stroke: RT.terra, lineWidth: 1.8)
                    }
                    Text("로그아웃").font(.sans(13.5, 700)).foregroundColor(Color(hex: 0xB56A55))
                    Spacer(minLength: 0)
                } action: { close(); model?.logout() }
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

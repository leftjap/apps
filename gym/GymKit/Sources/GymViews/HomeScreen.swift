import SwiftUI
import GymCore
#if canImport(UIKit)
import UIKit
#endif

// 홈 화면 — 시안 20a 정본: `specs/2026-08-17-home-redesign-20a.md` (+ 같은 이름 .html 픽셀 오라클).
// 대조: `gymshot home-20a` 가 시안 예시 데이터를 375×812 로 그대로 재현한다 (GymScreens.demo20aModel).
// 이전 시안 대비: 유산소가 부위 밸런스 차트에서 빠져 독립 카드가 됐고, 캘린더에 유산소 링이,
// 체중 카드에 30일 스파크라인이 들어왔다.
//
// 색의 의미 (§1, 반드시 유지):
//   crail = 날짜·기록 행위 (캘린더 근력/오늘, 기록하기 버튼) — 화면 통틀어 이 둘뿐
//   teal/pine = 훈련량 (막대·원·델타·CTA),  ghost = 지난주,  warn = 미달
public struct HomeScreenView: View {
    @ObservedObject var model: GymAppModel
    var onStart: () -> Void
    var onStats: () -> Void
    var onAdmin: () -> Void
    public init(model: GymAppModel, onStart: @escaping () -> Void = {},
                onStats: @escaping () -> Void = {}, onAdmin: @escaping () -> Void = {}) {
        self.model = model; self.onStart = onStart; self.onStats = onStats; self.onAdmin = onAdmin
    }
    // 데모/스냅샷 편의 init.
    public init(onStart: @escaping () -> Void = {}, onStats: @escaping () -> Void = {}) {
        self.model = GymAppModel(); self.onStart = onStart; self.onStats = onStats; self.onAdmin = {}
    }

    // 진행 중 세션 존재 → HomeC(이어하기), 아니면 HomeA(idle) — mocks home.html 이중 분기 (spec §5-5).
    var isActiveSession: Bool {
        model.session.status == .active && !model.session.blocks.isEmpty
    }

    @State private var detailISO: String? = nil   // 날짜 탭 → 상세 바텀시트 (§5-2)
    @State private var weightKeypad: KeypadContext? = nil   // 오늘 체중 입력 (§10-2 home 공유)

    /// §12 작은 화면 대응 임계 — 기기 화면 높이 기준 (SE 667·568 < 750 < 11 Pro/13 mini 812).
    ///
    /// 뷰포트를 GeometryReader 로 재려던 두 시도가 모두 실패했다 (2026-08-17 시뮬 실측):
    ///  · 본문을 감싸면 높이 계산이 바뀌어 CTA 가 11pt 내려가 홈 인디케이터를 침범 (788.7 → 799.7pt)
    ///  · 배경에서 재면 순환한다 — 콘텐츠가 화면보다 크면 frame 이 콘텐츠 크기(SE 720pt)로 커져
    ///    임계를 항상 넘어 compact 가 영영 안 켜진다
    /// 그래서 레이아웃과 무관한 기기 화면 높이를 직접 읽는다.
    static let compactScreenHeight: CGFloat = 750
    static var screenHeight: CGFloat {
        #if canImport(UIKit)
        if let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first {
            return scene.screen.bounds.height
        }
        return 812
        #else
        return 812   // gymshot(macOS) — 시안 기준 기기 375×812
        #endif
    }
    var isCompactScreen: Bool { Self.screenHeight < Self.compactScreenHeight }

    public var body: some View {
        Group {
            if isActiveSession { homeC(compact: isCompactScreen) }
            else { homeA(compact: isCompactScreen) }
        }
        // 화면 폭에 맞춘다 — 390 고정 시 375pt 기기(iPhone SE·11 Pro)에서 좌우 7.5pt 씩 잘린다
        // (2026-07-10 실기기 실측: CTA 여백 24 → 16.67pt).
        .frame(maxWidth: .infinity)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(GY.shell)
        .overlay {
            ZStack(alignment: .bottom) {
                if let iso = detailISO {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle())
                        .onTapGesture { detailISO = nil }
                        .transition(.opacity)
                    DayDetailSheet(iso: iso, entry: model.dayEntry(iso),
                                   onDelete: { detailISO = nil }, onCancel: { detailISO = nil })
                        .transition(.move(edge: .bottom))
                }
            }
            .animation(.easeOut(duration: 0.2), value: detailISO != nil)
        }
        // 오늘 체중 입력 키패드 (home/admin 공유 — mock #weightKeypadSheet)
        .overlay {
            ZStack(alignment: .bottom) {
                if weightKeypad != nil {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle()).onTapGesture { weightKeypad = nil }
                        .transition(.opacity)
                    KeypadSheet(ctx: weightKeypad!,
                                refValue: model.weights.first.map { Self.wf.string(from: NSNumber(value: $0.kg)) ?? "\($0.kg)" },
                                bare: true, title: "오늘 체중", doneLabel: "저장",
                                onKey: { k in if weightKeypad != nil { KeypadBuffer.apply(k, to: &weightKeypad!) } },
                                onQuick: { _ in }, onMode: { _ in },
                                onDone: {
                                    defer { weightKeypad = nil }
                                    guard let kp = weightKeypad, let v = Double(kp.buffer), v > 0 else { return }
                                    model.saveWeight((v * 10).rounded() / 10)
                                })
                        .transition(.move(edge: .bottom))
                }
            }
            .animation(.easeOut(duration: 0.2), value: weightKeypad != nil)
        }
    }

    // 화면 구조 §3 — 블록별 외곽 여백은 각 블록이 스스로 갖는다(루트 VStack spacing 0).
    // 375×812 에서 Spacer 는 0 에 수렴한다. 초과 시 회수 순서: 캘린더 gap 8→7 → 밸런스 축 11→10.
    //
    // §12 작은 화면(SE 375×667): 145px 이 부족한데 지시서의 축소 1~4 를 전부 적용해도 119px 회수라
    // 스크롤 없이는 들어가지 않는다. 그래서 지시서가 제시한 대안대로 **1·2(캘린더 1주 + 축 8px/세트)만
    // 적용하고 나머지는 스크롤에 맡긴다.** (compact 는 812 기기에선 절대 켜지지 않으므로
    // gymshot ImageRenderer 의 ScrollView 미렌더 제약과 충돌하지 않는다.)
    @ViewBuilder
    func homeA(compact: Bool) -> some View {
        if compact {
            ScrollView(.vertical, showsIndicators: false) { homeAStack(compact: true) }
        } else {
            homeAStack(compact: false)
        }
    }

    func homeAStack(compact: Bool) -> some View {
        let ref = model.referenceToday
        let last = model.lastCompletedSession()
        let sessions = model.allWorkedSessions()
        let bal = GymHomeLogic.weeklyBalance(sessions: sessions, custom: model.custom, now: ref)
        let cw = GymHomeLogic.cardioWeek(sessions: sessions, custom: model.custom, now: ref)

        return VStack(spacing: 0) {
            header
            if GymSyncHealth.isAtRisk(model.syncState, now: ref) { syncBanner }
            weekCalendar(model.weekCells(around: ref), compact: compact)
            if last != nil { lastWorkoutRow(last, ref: ref) }   // empty 시 행 숨김 (home.js)
            balance(bal, compact: compact)
            Spacer(minLength: 0)   // 남는 공간은 여기 한 곳 — 차트 위아래로 갈라지지 않게
            cardioCard(cw)
            weightCard(ref: ref)
            cta(empty: last == nil)
        }
    }

    // HomeC — 운동 중 홈. 부위 밸런스를 실시간(진행 중 세션 done 세트 포함 — allWorkedSessions)으로
    // 보여주고, 이어하기는 하단 콤팩트 카드로 (사용자 2026-07-23). 재설계 §3 은 idle(HomeA) 대상이라
    // 여기선 공유 컴포넌트(캘린더·밸런스)만 새 규격을 따르고 구조는 그대로 둔다.
    // 작은 화면 규칙은 homeA 와 같게 — 세션 유무에 따라 캘린더 주 수가 바뀌면 더 혼란스럽다.
    @ViewBuilder
    func homeC(compact: Bool) -> some View {
        if compact {
            ScrollView(.vertical, showsIndicators: false) { homeCStack(compact: true) }
        } else {
            homeCStack(compact: false)
        }
    }

    // 하단은 idle 과 같은 유산소·체중 카드로 채운다 — 없으면 밸런스와 이어하기 사이가 통째로
    // 빈 공간이 됐다 (2026-08-24 사용자 보고). 직전 운동 행만 뺀다: 운동 중엔 의미가 겹치고
    // 812 화면 세로가 모자란다. CTA 자리는 이어하기 카드가 대신한다.
    func homeCStack(compact: Bool) -> some View {
        let ref = model.referenceToday
        let sessions = model.allWorkedSessions()
        let bal = GymHomeLogic.weeklyBalance(sessions: sessions, custom: model.custom, now: ref)
        let cw = GymHomeLogic.cardioWeek(sessions: sessions, custom: model.custom, now: ref)
        return VStack(spacing: 0) {
            header
            if GymSyncHealth.isAtRisk(model.syncState, now: ref) { syncBanner }
            weekCalendar(model.weekCells(around: ref), compact: compact)
            balance(bal, compact: compact)
            Spacer(minLength: 0)   // homeA 와 동일 — 여백은 밸런스 아래 한 곳
            cardioCard(cw)
            weightCard(ref: ref)
            resumeCard
                .padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 22)
        }
    }

    // 콤팩트 이어하기 카드 — idle CTA 자리. 카드 전체 = 이어가기, crail 테두리 + 숨쉬는 글로우 유지.
    var resumeCard: some View {
        let session = model.session
        // 표시 블록·세트 줄은 순수 로직이 정한다 — 전 종목 완료 시 이름 공백·"SET 1/0" 으로 깨지던
        // 것과 세트 0개 종목을 '현재 운동중' 으로 표기하던 불일치 수정 (감사 #11·#12).
        let sum = GymHomeLogic.resumeSummary(session: session)
        let exName = sum.blockIdx.map { model.exerciseName(session.blocks[$0].exerciseId) } ?? ""
        let totalVol = model.sessionDoneVolume

        return Button(action: onStart) {
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    HStack(spacing: 7) {
                        Circle().fill(GY.crailBase).frame(width: 7, height: 7)
                        // 전 종목 완료면 '운동 중' 이 아니라 마무리 안내 — 레일·히어로와 일치시킨다
                        Text(sum.allDone ? "마무리" : "운동 중")
                            .font(.sans(12, 600)).tracking(0.72).foregroundStyle(GY.crailDeep)
                    }
                    Spacer()
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        TimelineView(.periodic(from: .now, by: 1)) { ctx in
                            Text(Self.fmtResume(session.startTime, now: ctx.date))
                                .font(.mono(16, 500)).tracking(-0.32).foregroundStyle(GY.ink1)
                        }
                        Text("경과").font(.sans(11, 500)).foregroundStyle(GY.ink4)
                    }
                }
                HStack(alignment: .firstTextBaseline) {
                    Text(exName).font(.sans(20, 700)).tracking(-0.4).lineLimit(1)
                        .foregroundStyle(GY.ink1)
                        .accessibilityIdentifier("resume-exname")
                    Spacer(minLength: 12)
                    // 세트 줄은 표시할 세트가 있을 때만 (세트 0개 종목의 "SET 1/0" 방지)
                    ((sum.setLine.map { Text("\($0) · ").font(.mono(12.5, 600)).foregroundStyle(GY.ink2) }
                      ?? Text(""))
                     + Text("누적 ").font(.mono(12.5, 500)).foregroundStyle(GY.ink4)
                     + Text(Self.volF.string(from: NSNumber(value: totalVol)) ?? "0")
                        .font(.mono(12.5, 600)).foregroundStyle(GY.crailDeep)
                     + Text("kg").font(.mono(12.5, 500)).foregroundStyle(GY.ink4))
                }
            }
            .padding(.init(top: 16, leading: 20, bottom: 16, trailing: 20))
            .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
            .overlay(RoundedRectangle(cornerRadius: GY.rLg).strokeBorder(GY.crailBase, lineWidth: 1.5))
            .breathGlow(cornerRadius: GY.rLg)   // mock #cardResume breath (2.8s crail 링)
            // 대형 카드 그림자 파라미터 승계 (음수 spread 부재 보정 — 좁고 옅게, 2026-07-18 실기기 보고)
            .shadow(color: Color(hex: 0x14120E).opacity(0.08), radius: 11, y: 7)
        }
        .buttonStyle(.plain).accessibilityIdentifier("home-resume")
    }

    static let volF: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()
    // 경과 mm:ss (home.js padStart 정합 — "18:42", "05:03").
    static func fmtResume(_ startMillis: Int64?, now: Date) -> String {
        guard let st = startMillis, st > 0 else { return "00:00" }
        let total = max(0, Int(Int64(now.timeIntervalSince1970 * 1000) - st) / 1000)
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    // 백업 위험 배너 — 미로그인/오래된 백업/최근 실패 시 홈 상단 노출 (2026-07-14 데이터 소실 사고).
    // 탭하면 관리>프로필(로그인·상태)로 이동.
    var syncBanner: some View {
        Button(action: onAdmin) {
            HStack(spacing: 9) {
                Circle().fill(GY.crailBase).frame(width: 7, height: 7)
                Text(GymSyncHealth.statusText(model.syncState, now: model.referenceToday))
                    .font(.sans(13, 600)).foregroundStyle(GY.crailDeep).lineLimit(1)
                Spacer(minLength: 8)
                Text("해결").font(.sans(12.5, 600)).foregroundStyle(GY.crailDeep)
            }
            .padding(.horizontal, 14).padding(.vertical, 11)
            .background(GY.crailTint, in: RoundedRectangle(cornerRadius: GY.rMd))
            .overlay(RoundedRectangle(cornerRadius: GY.rMd).strokeBorder(GY.crailSoft, lineWidth: 1))
        }
        .buttonStyle(.plain).accessibilityIdentifier("home-sync-banner")
        .padding(.horizontal, 24).padding(.top, 12)
    }

    // §4 헤더 — padding 8px 24px 0.
    var header: some View {
        HStack {
            Text("Gym").font(.sans(23, 700)).tracking(-0.69).foregroundStyle(GY.ink1)
            Spacer()
            HStack(spacing: 2) {
                Button(action: onStats) {
                    Text("통계").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain).accessibilityIdentifier("home-stats")
                Button(action: onAdmin) {
                    Text("관리").font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
                }.buttonStyle(.plain).accessibilityIdentifier("home-admin")
            }
        }
        .padding(.horizontal, 24).padding(.top, 8)
    }

    // MARK: - §5 2주 캘린더 (근력 crail 채움 + 유산소 teal 링)

    // 요일 헤더 1줄 공유 + [지난주(작게) · 이번 주] 2행 (사용자 2026-07-25). 밸런스가 달력 주를
    // 비교하므로 롤링 14일이 아니라 달력 주 2개를 쌓아 두 요소의 '주' 정의를 일치시킨다.
    func weekCalendar(_ week: [GymAppModel.HomeWeekCell], tappable: Bool = true,
                      compact: Bool = false) -> some View {
        let ref = model.referenceToday
        let prev = model.weekCells(around: ref, weekOffset: -1)
        return VStack(spacing: 8) {
            HStack(spacing: 0) {   // 요일 헤더 — 두 행이 공유 (반복 제거 + 세로 공간 절약)
                ForEach(Array(week.enumerated()), id: \.element.id) { _, d in
                    Text(d.label).font(.sans(11, 600)).tracking(0.44)
                        .foregroundStyle(d.isToday ? GY.crailDeep : GY.ink4)
                        .frame(maxWidth: .infinity)
                }
            }
            if !compact {   // §12-1 작은 화면은 이번 주 1행만 (−45px)
                weekRow(prev, weekOffset: -1, tappable: tappable, dim: true)
            }
            weekRow(week, weekOffset: 0, tappable: tappable, dim: false)
            calendarLegend
        }
        .padding(.horizontal, 18).padding(.top, 8)
    }

    // 캘린더 한 행 — dim 은 지난주(부차적 정보라 원 크기를 낮춰 이번 주가 주인공으로 남는다).
    func weekRow(_ week: [GymAppModel.HomeWeekCell], weekOffset: Int,
                 tappable: Bool, dim: Bool) -> some View {
        let cal = GymAppModel.kst
        let ref = model.referenceToday
        let monday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: ref))
            .flatMap { cal.date(byAdding: .day, value: 7 * weekOffset, to: $0) }
        let dia: CGFloat = dim ? 24 : 28
        return HStack(spacing: 0) {
            ForEach(Array(week.enumerated()), id: \.element.id) { i, d in
                ZStack {
                    // §5 상태표 — 근력 = crail 채움(오늘이면 crail-base), 유산소 = teal 링.
                    // 두 신호가 독립이라 "유산소만" 은 배경 없이 링만 남는다.
                    if d.worked {
                        Circle().fill(d.isToday ? GY.crailBase : GY.crailTint)
                            .frame(width: dia, height: dia)
                    }
                    if d.cardio {
                        Circle().strokeBorder(GY.teal, lineWidth: 1.5).frame(width: dia, height: dia)
                    } else if d.isToday && !d.worked {
                        // 오늘인데 아직 안 한 날 — 위치만 표시. line(L .92)은 배경에 묻혀 ink4 로.
                        Circle().strokeBorder(GY.ink4, lineWidth: 1.5).frame(width: dia, height: dia)
                    }
                    // 오늘도 예외 없이 600 — 채움 색만으로 충분히 구분된다 (700 으로 올리지 말 것).
                    Text("\(d.num)").font(.mono(dim ? 12.5 : 14, (d.worked || d.cardio) ? 600 : 500))
                        .foregroundStyle(d.isToday && d.worked ? .white
                                         : (d.worked ? GY.crailDeep
                                            : (d.cardio ? GY.ink2 : (d.isToday ? GY.ink1 : GY.ink4))))
                }
                .frame(height: dia)
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                // 셀을 단일 요소로 — 날짜·링이 하나로 읽히고(VoiceOver) 탭 타깃도 셀 전체가 된다
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier(
                    monday.flatMap { cal.date(byAdding: .day, value: i, to: $0) }
                        .map { "home-day-\(GymAppModel.dayFmt.string(from: $0))" } ?? "home-day")
                .onTapGesture {
                    guard tappable, let monday,
                          let date = cal.date(byAdding: .day, value: i, to: monday) else { return }
                    detailISO = GymAppModel.dayFmt.string(from: date)
                }
            }
        }
    }

    // 범례 — 채움 = 근력, 테두리 = 유산소. padding 0 12px, margin-top 2px.
    var calendarLegend: some View {
        HStack(spacing: 6) {
            Circle().fill(GY.crailTint)
                .overlay(Circle().strokeBorder(GY.crailDeep, lineWidth: 1.5))
                .frame(width: 10, height: 10)
            Text("근력").font(.sans(10.5, 500)).foregroundStyle(GY.ink4)
            Circle().strokeBorder(GY.teal, lineWidth: 1.5).frame(width: 10, height: 10)
                .padding(.leading, 5)
            Text("유산소").font(.sans(10.5, 500)).foregroundStyle(GY.ink4)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12).padding(.top, 2)
    }

    // MARK: - §6 직전 운동

    // 부위(맨몸 제외) + 경과. 요일과 "오늘" 을 함께 쓰지 않는다 — 중복 (§6).
    func lastWorkoutRow(_ last: GymSession?, ref: Date) -> some View {
        let tags = last?.tags ?? []
        let nonCardio = tags.filter { $0 != "cardio" }
        let parts = (nonCardio.isEmpty ? tags : nonCardio)
            .map { GymExercises.partName($0) }.joined(separator: " · ")
        let ago: String = {
            guard let last else { return "기록 없음" }
            let d = model.daysAgo(last.date, from: ref)
            return d <= 0 ? "오늘" : "\(d)일 전"
        }()
        return HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 9).fill(GY.sunken).frame(width: 30, height: 30)
                .overlay(BarbellGlyph().stroke(GY.ink3, style: BarbellGlyph.stroke(17))
                    .frame(width: 17, height: 17))
            Text("직전 운동").font(.sans(12, 600)).tracking(0.24).foregroundStyle(GY.ink4)
            Text(parts.isEmpty ? "—" : parts).font(.sans(15, 700)).foregroundStyle(GY.ink1).lineLimit(1)
            Spacer()
            Text(ago).font(.sans(12.5, 500)).foregroundStyle(GY.ink4)
        }
        .padding(.horizontal, 24).padding(.top, 11)
    }

    // MARK: - §7 부위 밸런스 (페어 컬럼 차트)

    // 축 11px/세트, 트랙 88px 고정. 유산소 행 없음 — 독립 카드로 내려갔다 (§0·§13).
    // 미달 부위를 점선·crail 로 강조하지 않는다 — 고스트가 잉크보다 높은 것 자체가 미달 신호다 (§7).
    func balance(_ bal: GymHomeLogic.WeeklyBalance, compact: Bool = false) -> some View {
        let parts = bal.parts
        let totalThis = parts.map(\.sets).reduce(0, +)
        let totalLast = parts.map(\.prevSets).reduce(0, +)
        let delta = totalThis - totalLast
        // 8세트 초과 시 전체 비례 축소, 트랙 높이는 축×8 고정 (§7).
        // 작은 화면은 축 11 → 8px/세트 = 트랙 88 → 64 (§12-2, −24px).
        let unit: CGFloat = compact ? 8 : 11
        let track = unit * 8
        let maxVal = max(1, parts.map { max($0.sets, $0.prevSets) }.max() ?? 1)
        let pxPerSet = min(unit, track / CGFloat(maxVal))

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 7) {
                Text("부위 밸런스").font(.sans(13.5, 700)).tracking(-0.135).foregroundStyle(GY.ink1)
                Spacer(minLength: 7)
                // 헤드라인 카운트업 prevTotal→thisTotal + 착지 팝 (animNumHome 620ms 정합)
                BalanceHeadline(from: totalLast, to: totalThis)
                Text("세트").font(.sans(11.5, 500)).foregroundStyle(GY.ink4)
                deltaChip(delta)
            }
            HStack(spacing: 6) {
                RoundedRectangle(cornerRadius: 2.5).fill(GY.ghost).frame(width: 9, height: 9)
                Text("지난주").font(.sans(11, 500)).foregroundStyle(GY.ink4)
                RoundedRectangle(cornerRadius: 2.5).fill(GY.teal).frame(width: 9, height: 9)
                    .padding(.leading, 6)
                Text("이번 주").font(.sans(11, 500)).foregroundStyle(GY.ink4)
            }
            .padding(.top, 7)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 0) {
                    ForEach(Array(parts.enumerated()), id: \.element.key) { i, p in
                        VStack(spacing: 0) {
                            // margin-left 16 (align-items:center) = 잉크 막대 중심으로 +8 이동 (§7)
                            Text("\(p.sets)").font(.mono(14.5, 700)).foregroundStyle(GY.ink1)
                                .frame(height: 14.5)     // line-height: 1
                                .offset(x: 8)
                                .padding(.bottom, 6)
                            HStack(alignment: .bottom, spacing: 3) {
                                if p.prevSets > 0 {
                                    UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4, topTrailing: 4))
                                        .fill(GY.ghost)
                                        .frame(width: 13, height: CGFloat(p.prevSets) * pxPerSet)
                                }
                                BalanceInkBar(height: CGFloat(p.sets) * pxPerSet, index: i)
                            }
                            .frame(height: track, alignment: .bottom)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                // 기준선은 부위 이름의 상단 보더 — 별도 전폭 룰을 그리지 않는다 (§7·§13).
                HStack(spacing: 0) {
                    ForEach(parts, id: \.key) { p in
                        Text(p.name).font(.sans(12.5, 600)).foregroundStyle(GY.ink2)
                            .frame(height: 12.5)     // line-height: 1
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.top, 7)
                .overlay(alignment: .top) { Rectangle().fill(GY.axis).frame(height: 1.5) }
            }
            .padding(.top, 8)
        }
        .padding(.horizontal, 24).padding(.top, 9)
    }

    // 델타 칩 — 증가/동률은 ghost-tint + pine, 감소는 warn-tint + warn-deep `−N` (§7).
    func deltaChip(_ delta: Int) -> some View {
        Text(delta < 0 ? "−\(-delta)" : "+\(delta)")
            .font(.mono(12, 700))
            .foregroundStyle(delta < 0 ? GY.warnDeep : GY.pine)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(delta < 0 ? GY.warnTint : GY.ghostTint, in: Capsule())
            .modifier(BalChipPopIn(delay: 0.18))   // gPopIn 380ms 오버슈트
            .accessibilityIdentifier("home-balance-delta")
    }

    // MARK: - §8 유산소 카드 (이번 변경의 핵심)

    // 채움 = 이번 주, 테두리 + 회색 숫자 = 지난주 같은 요일. 별도 설명 텍스트 없음 (§8·§13).
    // 원 크기는 30 고정 — 시간에 비례해 바꾸지 않는다. 아이콘도 넣지 않는다 (§13).
    func cardioCard(_ cw: GymHomeLogic.CardioWeek) -> some View {
        let labels = ["월", "화", "수", "목", "금", "토", "일"]
        let chip = GymHomeLogic.cardioRenewChip(thisTotal: cw.thisTotal, prevTotal: cw.prevTotal)
        return VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("유산소").font(.sans(13.5, 600)).foregroundStyle(GY.ink1)
                Text("이번 주").font(.sans(11.5, 500)).foregroundStyle(GY.ink4).padding(.leading, 7)
                Spacer(minLength: 7)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text("\(cw.thisTotal)").font(.mono(26, 700)).tracking(-0.78)
                        .foregroundStyle(GY.ink1)
                    Text("분").font(.sans(12, 500)).foregroundStyle(GY.ink4)
                    Rectangle().fill(GY.line).frame(width: 1, height: 12).padding(.horizontal, 7)
                    Text("\(cw.thisDays)").font(.mono(16, 700)).foregroundStyle(GY.ink2)
                    Text("일").font(.sans(12, 500)).foregroundStyle(GY.ink4)
                }
            }
            // space-between — 원 7개의 좌우 끝이 카드 내부 폭에 정확히 닿는다 (§14)
            HStack(spacing: 0) {
                ForEach(0..<7, id: \.self) { i in
                    if i > 0 { Spacer(minLength: 0) }
                    cardioDay(label: labels[i], this: cw.thisMin[i], prev: cw.prevMin[i],
                              isToday: i == cw.todayIndex)
                }
            }
            .padding(.top, 9)
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("지난주 \(cw.prevTotal)분 · \(cw.prevDays)일")
                    .font(.sans(11.5, 500)).foregroundStyle(GY.ink3)
                Spacer(minLength: 8)
                if let chip {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        if let v = chip.value {
                            Text(v).font(.mono(11.5, 700))
                                .foregroundStyle(chip.isWarn ? GY.warnDeep : GY.pine)
                        }
                        Text(chip.label).font(.sans(10.5, 600))
                            .foregroundStyle(chip.isWarn ? GY.warnDeep : GY.pine)
                    }
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .background(chip.isWarn ? GY.warnTint : GY.ghostTint, in: Capsule())
                    .accessibilityIdentifier("home-cardio-chip")
                }
            }
            // margin-top 9 → 구분선 → padding-top 7 (바깥 padding 이 margin, overlay 가 border-top)
            .padding(.top, 7)
            .overlay(alignment: .top) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
            .padding(.top, 9)
        }
        .padding(.init(top: 11, leading: 18, bottom: 10, trailing: 18))
        .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
        // 3층 그림자는 SwiftUI 에 음수 spread 가 없어 그대로 못 옮긴다 — 실기기 보정된 단일 근사 사용
        // (2026-07-18 실기기 보고). 체중 카드와 동일 셸.
        .shadow(color: Color(hex: 0x14120E).opacity(0.10), radius: 12, y: 6)
        .padding(.horizontal, 24).padding(.top, 12)
        .accessibilityIdentifier("home-cardio-card")
    }

    // 네 케이스 모두 원 30×30 · 숫자 13 고정. 크기로 구분하지 않는다 (§8).
    func cardioDay(label: String, this: Int?, prev: Int?, isToday: Bool) -> some View {
        let ran = this != nil
        return VStack(spacing: 5) {
            ZStack {
                if ran {
                    Circle().fill(GY.teal).frame(width: 30, height: 30)
                } else {
                    Circle().strokeBorder(GY.ring, lineWidth: 1.5).frame(width: 30, height: 30)
                }
                if let v = this {
                    Text("\(v)").font(.mono(13, isToday ? 700 : 600)).foregroundStyle(.white)
                } else if let p = prev {
                    Text("\(p)").font(.mono(13, 600)).foregroundStyle(GY.ink3)
                }
            }
            .frame(width: 30, height: 30)
            // 오늘 + 뛴 날 — 흰 링 1.5 + pine 링 1 (실질 지름 35 < 원 간격 43.5, §14)
            .overlay {
                if isToday && ran {
                    ZStack {
                        Circle().stroke(.white, lineWidth: 1.5).frame(width: 31.5, height: 31.5)
                        Circle().stroke(GY.pine, lineWidth: 1).frame(width: 34, height: 34)
                    }
                }
            }
            Text(label)
                .font(.sans(10.5, isToday && ran ? 700 : 500))
                .foregroundStyle(isToday && ran ? GY.pine : GY.ink4)
                .frame(height: 10.5)     // line-height: 1
        }
        .frame(width: 30)
    }

    // MARK: - §9 체중 카드 (30일 sma7 스파크라인)

    func weightCard(ref: Date) -> some View {
        let latest = model.weights.first
        let prev = model.weights.count >= 2 ? model.weights[1] : nil
        let goal = model.settings.goalWeight
        let deltaText: String? = {
            guard let latest, let prev else { return nil }
            let d = ((latest.kg - prev.kg) * 10).rounded() / 10
            guard d != 0 else { return nil }
            // 증감 기호는 ▲▼ 대신 − / +. 체중은 감소가 목표라 색을 입히지 않는다 — ink-3 고정 (§9).
            return "\(d < 0 ? "−" : "+")\(Self.wf.string(from: NSNumber(value: abs(d))) ?? "\(abs(d))")"
        }()
        // 전체 이력에 sma7 → 최근 30일 절단 (창 안에서만 평균 내면 첫 점이 실측값이 된다)
        let rows = model.weights.reversed().map { (date: $0.date, kg: $0.kg) }
        let pts = GymWeightLogic.sparklinePoints(
            values: GymWeightLogic.recentSma(rows: rows, days: 30, now: ref),
            width: 132, height: 38)

        return VStack(spacing: 0) {
            HStack {
                HStack(alignment: .firstTextBaseline, spacing: 0) {
                    Text("오늘 체중").font(.sans(13.5, 600)).foregroundStyle(GY.ink1)
                    Text("최근 30일").font(.sans(11.5, 500)).foregroundStyle(GY.ink4).padding(.leading, 7)
                }
                Spacer()
                Button {
                    let pre = model.weights.first?.kg
                    weightKeypad = KeypadContext(field: .weight,
                                                 buffer: pre.map { Self.wf.string(from: NSNumber(value: $0)) ?? "\($0)" } ?? "",
                                                 fresh: pre != nil, pairHidesWeight: false)
                } label: {
                    Text("기록하기").font(.sans(12.5, 600)).foregroundStyle(GY.crailDeep)
                        .padding(.horizontal, 15).padding(.vertical, 8)
                        .background(GY.crailTint, in: Capsule())
                        .overlay(Capsule().strokeBorder(GY.crailSoft, lineWidth: 1))
                }.buttonStyle(.plain).accessibilityIdentifier("home-weight-input")
            }
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(latest.map { Self.wf.string(from: NSNumber(value: $0.kg)) ?? "\($0.kg)" } ?? "—")
                            .font(.mono(28, 700)).tracking(-0.84).foregroundStyle(GY.ink1)
                        Text("kg").font(.sans(12, 500)).foregroundStyle(GY.ink4)
                        if let deltaText {
                            Text(deltaText).font(.mono(12, 500)).foregroundStyle(GY.ink3)
                                .padding(.leading, 5)
                        }
                    }
                    Text(Self.goalLine(current: latest?.kg, goal: goal))
                        .font(.sans(11, 500)).foregroundStyle(GY.ink4)
                }
                Spacer(minLength: 8)
                if !pts.isEmpty {
                    WeightSparkline(pts: pts).accessibilityIdentifier("home-weight-spark")
                }
            }
            .padding(.top, 9)
        }
        .padding(.horizontal, 18).padding(.vertical, 13)
        .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
        .shadow(color: Color(hex: 0x14120E).opacity(0.10), radius: 12, y: 6)
        .padding(.horizontal, 24).padding(.top, 12)
    }

    // "목표 69 · 3.4kg 남음". 체중 기록이 없으면 남은 양을 셀 수 없으므로 목표만.
    static func goalLine(current: Double?, goal: Double) -> String {
        let g = wf.string(from: NSNumber(value: goal)) ?? "\(goal)"
        guard let current else { return "목표 \(g)" }
        let left = GymWeightLogic.remainingLoss(current: current, goal: goal)
        let l = wf.string(from: NSNumber(value: left)) ?? "\(left)"
        return "목표 \(g) · \(l)kg 남음"
    }
    static let wf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 1; return f }()

    // MARK: - §10 CTA

    // 이력 없으면 "첫 운동 시작" (home.js applyStreakToDom 정합).
    func cta(empty: Bool) -> some View {
        Button(action: onStart) {
            Text(empty ? "첫 운동 시작" : "운동 시작")
                .font(.sans(16, 600)).tracking(-0.16).foregroundStyle(Color(hex: 0xFBFDFC))
                .frame(maxWidth: .infinity).frame(height: 56)
                .background(GY.pine, in: RoundedRectangle(cornerRadius: GY.rLg))
                // 그림자 0 10px 22px -12px rgba(33,93,91,.7). `.shadow` 는 음수 spread 가 없어
                // 좌우로 글로우가 새므로, 12 만큼 줄인 도형을 직접 blur 해 spread 를 표현한다
                // (CSS 는 좌우로 거의 안 번지고 아래로만 떨어지는 그림자다).
                .background {
                    RoundedRectangle(cornerRadius: GY.rLg).fill(GY.pine)
                        .padding(12).offset(y: 10).blur(radius: 11).opacity(0.7)
                }
        }
        .buttonStyle(.plain).accessibilityIdentifier("home-cta")
        .padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 22)
    }
}

// MARK: - 시안 SVG 글리프 (viewBox 20×20 좌표 그대로, stroke-width 1.6)

// 직전 운동 아이콘 — "M4 8v4M6.5 6.2v7.6M13.5 6.2v7.6M16 8v4M6.5 10h7" (§6 라인 바벨).
struct BarbellGlyph: Shape {
    static func stroke(_ size: CGFloat) -> StrokeStyle {
        StrokeStyle(lineWidth: 1.6 * size / 20, lineCap: .round)
    }
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 20
        var p = Path()
        for (x, y0, y1) in [(4.0, 8.0, 12.0), (6.5, 6.2, 13.8), (13.5, 6.2, 13.8), (16.0, 8.0, 12.0)] {
            p.move(to: CGPoint(x: x * s, y: y0 * s))
            p.addLine(to: CGPoint(x: x * s, y: y1 * s))
        }
        p.move(to: CGPoint(x: 6.5 * s, y: 10 * s))
        p.addLine(to: CGPoint(x: 13.5 * s, y: 10 * s))
        return p
    }
}

// MARK: - §9 스파크라인 (선 1개 = 7일 이동평균. 실측선은 그리지 않는다 — §13)

struct SparkPath: Shape {
    let pts: [CGPoint]
    let closed: Bool      // true = 아래 변까지 닫아 면으로
    func path(in rect: CGRect) -> Path {
        guard pts.count >= 2 else { return Path() }
        var p = Path()
        p.move(to: pts[0])
        for q in pts.dropFirst() { p.addLine(to: q) }
        if closed {
            p.addLine(to: CGPoint(x: pts[pts.count - 1].x, y: rect.maxY))
            p.addLine(to: CGPoint(x: pts[0].x, y: rect.maxY))
            p.closeSubpath()
        }
        return p
    }
}

struct WeightSparkline: View {
    let pts: [CGPoint]      // 132×38 좌표계
    var body: some View {
        ZStack(alignment: .topLeading) {
            SparkPath(pts: pts, closed: true).fill(GY.sparkFill)
            SparkPath(pts: pts, closed: false)
                .stroke(GY.ink2, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            if let last = pts.last {
                Circle().fill(GY.ink1)
                    .overlay(Circle().stroke(.white, lineWidth: 1.4))
                    .frame(width: 5.2, height: 5.2)
                    .offset(x: last.x - 2.6, y: last.y - 2.6)
            }
        }
        .frame(width: 132, height: 38)
    }
}

// MARK: - 부위 밸런스 진입 모션 (스냅샷·reduced-motion 은 정적 최종 상태)

// 헤드라인 카운트업(620ms ease-out-cubic, animNumHome 정합) + 착지 팝(scale 1.16, 420ms 오버슈트).
// 크기·자간은 §7 (31px / 700 / -0.035em).
struct BalanceHeadline: View {
    let from: Int
    let to: Int
    @State private var shown: Double
    @State private var landed = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    init(from: Int, to: Int) {
        self.from = from; self.to = to
        _shown = State(initialValue: Double(to))
    }
    var body: some View {
        CountUpVolumeText(value: shown, size: 31, tracking: -1.085)
            .scaleEffect(landed ? 1 : 1.16, anchor: .bottomLeading)
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion, from != to else { return }
                shown = Double(from)
                withAnimation(.timingCurve(0.33, 1, 0.68, 1, duration: 0.62)) { shown = Double(to) }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.62) {
                    withAnimation(.timingCurve(0.2, 0.8, 0.3, 1.2, duration: 0.19)) { landed = false }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.19) {
                        withAnimation(.timingCurve(0.2, 0.8, 0.3, 1.2, duration: 0.23)) { landed = true }
                    }
                }
            }
    }
}

// 이번주 잉크 막대 — teal 고정 + 재질감 하이라이트 + 웨이브 성장(gGrow 520ms·60ms 스태거).
// 미달 부위 강조는 없다 — 주 초에는 모든 부위가 미달이라 강조하면 전부 강조된다 (§7).
struct BalanceInkBar: View {
    let height: CGFloat
    let index: Int
    @State private var grown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4.5, topTrailing: 4.5))
            .fill(GY.teal)
            .overlay(alignment: .top) {   // inset 0 1px 0 rgba(255,255,255,.20) 재질감
                UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4.5, topTrailing: 4.5))
                    .fill(.white.opacity(0.20))
                    .frame(height: 1)
            }
            .frame(width: 17, height: max(height, 0))
            .scaleEffect(y: grown ? 1 : 0.12, anchor: .bottom)
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion else { grown = true; return }
                withAnimation(.spring(response: 0.52, dampingFraction: 0.62)
                    .delay(Double(index) * 0.06)) { grown = true }   // gGrow 오버슈트 근사
            }
    }
}

// 칩 팝인 — gPopIn 380ms cubic-bezier(.2,.8,.3,1.2).
struct BalChipPopIn: ViewModifier {
    let delay: Double
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .scaleEffect(shown ? 1 : 0.5)
            .offset(y: shown ? 0 : 5)
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion else { shown = true; return }
                withAnimation(.timingCurve(0.2, 0.8, 0.3, 1.2, duration: 0.38).delay(delay)) { shown = true }
            }
    }
}

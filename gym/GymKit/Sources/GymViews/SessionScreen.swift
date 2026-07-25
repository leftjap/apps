import SwiftUI
import GymCore

// 세션 화면 — mocks/session.html .session-active/.session-empty 이식. GymAppModel(실 세션) 구동.
// 폰트: 실앱은 번들 Pretendard/Space Grotesk. 스캐폴딩은 시스템 폴백(.monospaced for mono).

// 상단 툴바 — grid 1fr auto 1fr, height 48 (mocks .sess-toolbar). 타이머는 startTime 기반 라이브(spec §6-6).
// "종료"는 꾹누르기 → 종료/삭제 확인 (§6-9·§7-1, PWA 탭 무동작 정합).
struct SessionToolbar: View {
    var startMillis: Int64? = nil     // 세션 시작 epoch(ms) — 경과 = now - startTime
    var displayTime: String? = nil    // 정적 표시(컴포넌트 데모용). nil 이면 라이브.
    var onHome: () -> Void = {}
    var onEndLongPress: () -> Void = {}

    // 경과 포맷 — <1h: m:ss, ≥1h: h:mm:ss (spec §6-6 "18:42").
    static func fmtElapsed(_ startMillis: Int64?, now: Date) -> String {
        guard let st = startMillis, st > 0 else { return "0:00" }
        let total = max(0, Int(Int64(now.timeIntervalSince1970 * 1000) - st) / 1000)
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    func timer(_ t: String) -> some View {
        HStack(spacing: 8) {
            Circle().fill(GY.crailBase).frame(width: 6, height: 6)   // accent pulse dot
            Text(t).font(.mono(18, 500)).foregroundStyle(GY.ink2)
                .accessibilityIdentifier("session-timer")
        }
    }

    var body: some View {
        ZStack {
            HStack {
                Button(action: onHome) {
                    Image(systemName: "house").font(.system(size: 16, weight: .regular))
                        .foregroundStyle(GY.ink3).frame(width: 40, height: 40)
                }.buttonStyle(.plain).accessibilityIdentifier("session-home")
                Spacer()
            }
            if let displayTime {
                timer(displayTime)
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    timer(Self.fmtElapsed(startMillis, now: ctx.date))
                }
            }
            HStack {
                Spacer()
                // PWA 정합: #sessionEndBtn 은 click 과 longpress 둘 다 동일 액션시트 (session.js §585 — UX 보강).
                // 구 구현의 "탭 무동작 정합" 주석은 오독이었음 (실기기 사용자 보고 2026-07-10).
                Text("종료").font(.sans(14, 600)).foregroundStyle(GY.ink3)
                    .padding(.leading, 14).padding(.trailing, 4).padding(.vertical, 9)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onEndLongPress)
                    .onLongPressGesture(minimumDuration: 0.5, perform: onEndLongPress)
                    .accessibilityIdentifier("session-end")
            }
        }
        .padding(.horizontal, 16).frame(height: 48)
    }
}

// 타이틀 + 세션 볼륨 링 (시안 #15a 헤더: align center, gap 16 / .sv gap 11 / ring 56).
// 신기록(오늘 누적 > 직전 총볼륨): 직전 취소선 + "▲ 신기록 +Nkg" 태그(cloudy) + 링 펄스 (mock §5.4).
struct SessionHeader: View {
    let exName: String
    let part: String
    let volCur: String
    let volTotal: String
    let pct: Int
    var record: Bool = false      // 정적 — 취소선·태그·링 펄스
    var recordAmt: Int = 0
    var pulseMoment: Int = 0      // 돌파 1회성 — 누적 숫자 펄스 (topRecordPulse)
    var exSwapMoment: Int = 0     // 종목 전환 1회성 — 이름 스왑 IN (로테이션 확인 신호, 2026-07-23)
    @State private var pulsing = false
    @State private var ringPulseOn = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let amtF: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                // 종목 전환 시 이름이 우측 소폭에서 착지 + crail 플래시 — "종목이 갈렸다"는 정체성 신호.
                // 세트완료 히어로 스왑(dx 88)과 같은 모션 언어의 축소판이라 학습 비용 없이 구별된다.
                Text(exName).font(.sans(25, 700)).tracking(-0.5)
                    .foregroundStyle(GY.ink1).lineLimit(1).accessibilityIdentifier("session-exname")
                    .modifier(HeroRowSwapIn(trigger: exSwapMoment, delay: 0, dxIn: 24,
                                            landScale: 1.03, landOvershoot: -2, baseColor: GY.ink1))
                Text(part).font(.sans(12.5, 500))
                    .foregroundStyle(GY.ink4).lineLimit(1)
                    .modifier(HeroRowSwapIn(trigger: exSwapMoment, delay: 0.055, dxIn: 24,
                                            landScale: 1.03, landOvershoot: -2, baseColor: GY.ink4))
            }
            Spacer(minLength: 0)
            HStack(spacing: 11) {
                VStack(alignment: .trailing, spacing: 3) {
                    Text("세션 볼륨").font(.sans(10.5, 600)).tracking(0.42).foregroundStyle(GY.ink4)
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        // 누적 숫자만 펄스 (mock topRecordPulse — #cardSetProgress 한정)
                        // numericText — 커밋 트랜잭션 크로스페이드 이중 노출 방지 + §7 숫자 롤 정합
                        Text(volCur).font(.mono(13, 600)).foregroundStyle(pulsing ? GY.crailDeep : GY.ink2)
                            .contentTransition(.numericText())
                            .scaleEffect(pulsing ? 1.16 : 1, anchor: .trailing)
                        // 신기록 시 직전 총볼륨 취소선 + 흐림 (mock #cardSessTotalWrap.struck)
                        Text("/ \(volTotal)kg").font(.mono(13, 500)).foregroundStyle(GY.ink4)
                            .strikethrough(record)
                            .opacity(record ? 0.55 : 1)
                    }
                    .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                    if record {   // mock #cardRecordTag — cloudy-deep 10.5/700, 삽입 시 rise-in
                        HStack(spacing: 3) {
                            Text("▲").font(.system(size: 8))
                            Text("신기록 +\(Self.amtF.string(from: NSNumber(value: recordAmt)) ?? "\(recordAmt)")kg")
                                .font(.mono(10.5, 700))
                        }
                        .foregroundStyle(GY.cloudyDeep)
                        .transition(.offset(y: 6).combined(with: .opacity))
                        .accessibilityIdentifier("session-record-tag")
                    }
                }
                ZStack {
                    GymRing(size: 56, lineWidth: 4.76, progress: Double(pct) / 100,
                            track: Color(oklch: 0.92, 0.006, 60), fill: GY.cloudyBase)
                        .animation(.linear(duration: 0.2), value: pct)   // 세트 완료 실시간 상승 (§7 — 200ms linear)
                    if record {   // mock #cardVolRingPulse.is-record — cloudy 확산 링 1.6s 루프
                        Circle().stroke(GY.cloudyBase, lineWidth: 2.5)
                            .frame(width: 45, height: 45)
                            .scaleEffect(ringPulseOn ? 1.34 : 1)
                            .opacity(ringPulseOn ? 0 : 0.5)
                            .allowsHitTesting(false)
                    }
                    Text("\(pct)%").font(.mono(14, 700)).tracking(-0.28).foregroundStyle(GY.cloudyDeep)
                        .contentTransition(.numericText())
                }
            }
        }
        .padding(.horizontal, 24).padding(.top, 10)   // 시안 #6b 581행 padding:10px 24px 0
        .onAppear { startRingPulseIfNeeded(record) }
        .onChange(of: record) { _, on in startRingPulseIfNeeded(on) }
        .onChange(of: pulseMoment) { _, _ in
            guard !reduceMotion else { return }
            withAnimation(.timingCurve(0.2, 0.7, 0.2, 1, duration: 0.19)) { pulsing = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.19) {
                withAnimation(.timingCurve(0.2, 0.7, 0.2, 1, duration: 0.39)) { pulsing = false }
            }
        }
    }

    func startRingPulseIfNeeded(_ on: Bool) {
        guard on, !ringPulseOn, !GymSnapshot.isActive, !reduceMotion else { return }
        withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false)) { ringPulseOn = true }
    }
}

// 상단 블록 (툴바 + 헤더) — 컴포넌트 스냅샷 데모.
public struct SessionTopBlock: View {
    public init() {}
    public var body: some View {
        VStack(spacing: 0) {
            SessionToolbar(displayTime: "18:42")
            SessionHeader(exName: "벤치프레스", part: "가슴",
                          volCur: "4,800", volTotal: "8,940", pct: 54)
            Spacer()
        }
        .frame(width: 390, height: 200).background(GY.shell)
    }
}

// 히어로 탭 존 — 좌 30% 감소 / 중앙 40% 키패드 / 우 30% 증가 (spec §6-3-2, session.js ratio 0.3/0.7).
enum HeroZone { case minus, center, plus }

// 세션 화면 전체 — mocks/session.html. GymAppModel(실 세션) 구동.
public struct SessionScreenView: View {
    @ObservedObject var model: GymAppModel
    var onHome: () -> Void
    @State private var keypad: KeypadContext? = nil
    @State private var addexOpen: Bool
    @State private var actionTarget: ActionTarget? = nil
    @State private var prPopVisible: Bool
    @State private var prPopRise = false
    // 드래그 추종 커밋 (작업지시서 §4 / FIG 2 — GymSwipeMath 수식 구동)
    @State private var heroDragX: CGFloat
    @State private var heroDragging = false
    @State private var ringVisible = false     // 햅틱 링 (커밋 1회)
    @State private var ringIsPR = false
    @State private var ringMoment = 0          // 재생 id (연속 커밋 재마운트)
    @State private var burstMoment = 0         // 종목 직전기록 돌파 1회성 (exRecordBurst)
    @State private var headerPulseMoment = 0   // 세션 신기록 돌파 1회성 (topRecordPulse)
    // 히어로 수평 스왑 (§5.3) — 커밋 시 옛 값 고스트 OUT + 새 값 IN + 스와이프 큐
    @State private var heroSwapMoment = 0
    @State private var exSwapMoment = 0        // 종목 전환 1회성 — 이름 스왑 + 컨텍스트 딥 (2026-07-23)
    @State private var heroGhost: (top: String, bottom: String, kind: GymCardKind, fromDrag: Bool)? = nil
    @State private var heroGhostDragX: CGFloat = 0   // 드래그 커밋 시 고스트 시작 위치
    @State private var cueVisible = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // 꾹누르기 액션시트 대상 (§6-9)
    enum ActionTarget: Equatable {
        case block(Int)      // 푸터 레일 칩
        case setRow(Int)     // 세트바 슬롯
        case end             // 종료 버튼
    }

    public init(model: GymAppModel, onHome: @escaping () -> Void = {},
                initialKeypadField: GymAppModel.KeypadField? = nil, initialPRPop: Bool = false,
                initialAddex: Bool = false, initialAction: Bool = false,
                initialDragX: CGFloat = 0) {
        self.model = model; self.onHome = onHome
        _prPopVisible = State(initialValue: initialPRPop)
        _addexOpen = State(initialValue: initialAddex)
        _heroDragX = State(initialValue: initialDragX)
        if initialAction { _actionTarget = State(initialValue: .block(model.currentBlockIdx)) }
        if let f = initialKeypadField {   // 검증 훅 — 실 openKeypad 와 동일 prefill
            let set = model.currentSet ?? model.currentBlock?.sets.last
            let pre: Double? = {
                switch f {
                case .weight:   return set?.weight
                case .reps:     return set?.reps.map(Double.init)
                case .duration: return set?.duration.map { ($0 / 60).rounded() }
                case .distance: return set?.distance
                }
            }()
            _keypad = State(initialValue: KeypadContext(
                field: f, buffer: pre.map { Self.fmtW($0) } ?? "", fresh: pre != nil,
                pairHidesWeight: model.currentCardKind == .bodyweight))
        }
    }
    // 데모 편의 init (프리뷰/스냅샷) — 자체 모델 시드.
    public init(onHome: @escaping () -> Void = {},
                initialKeypadField: GymAppModel.KeypadField? = nil, initialPRPop: Bool = false,
                initialAddex: Bool = false, initialAction: Bool = false,
                initialDragX: CGFloat = 0) {
        self.init(model: GymAppModel(), onHome: onHome,
                  initialKeypadField: initialKeypadField, initialPRPop: initialPRPop,
                  initialAddex: initialAddex, initialAction: initialAction,
                  initialDragX: initialDragX)
    }

    static let nf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()
    static func fmt(_ n: Double) -> String { nf.string(from: NSNumber(value: n)) ?? "\(Int(n))" }
    static func fmtW(_ n: Double) -> String { String(format: "%g", n) }

    // 히어로 표시값 (kind 분기) — 본문 렌더·스왑 고스트 캡처 공용.
    static func heroValues(kind: GymCardKind, set: GymSet?) -> (String, String) {
        switch kind {
        case .weight:     return (set?.weight.map { fmtW($0) } ?? "—", set?.reps.map { "\($0)" } ?? "—")
        case .bodyweight: return ("맨몸", set?.reps.map { "\($0)" } ?? "—")
        case .cardio:     return ("\(Int(((set?.duration ?? 0) / 60).rounded()))", set?.distance.map { fmtW($0) } ?? "0")
        }
    }

    public var body: some View {
        Group {
            if model.session.blocks.isEmpty { emptyState } else { activeContent }
        }
        .frame(maxWidth: .infinity)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(GY.shell)
        // PR 팝 (§6-11) — "PR" 텍스트만 짧게, 위로 떠오르며 1초 내 페이드아웃. mocks #cardPrPop.
        .overlay(alignment: .top) {
            if prPopVisible {
                Text("PR").font(.mono(22, 600)).tracking(0.88).foregroundStyle(GY.crailDeep)
                    .opacity(prPopRise ? 0 : 1)
                    .offset(y: prPopRise ? -16 : 0)
                    .padding(.top, 218)
                    .allowsHitTesting(false)
                    .accessibilityIdentifier("pr-pop")
            }
        }
        .onChange(of: model.prMoment) { _, _ in
            prPopRise = false
            prPopVisible = true
            withAnimation(.easeOut(duration: 0.7).delay(0.22)) { prPopRise = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                prPopVisible = false; prPopRise = false
            }
        }
        // 첫 종목 추가로 empty→active 화면이 스왑되면 인라인 시트가 소멸한다 — 오버레이 시트를
        // 이어서 열어 다중 선택 유지 (PWA session.js:3757 "다중 선택 유지" 정합, 사용자 2026-07-23).
        .onChange(of: model.session.blocks.isEmpty) { wasEmpty, isEmpty in
            if wasEmpty && !isEmpty { addexOpen = true }
        }
        // 표시 종목 전환(레일 탭·종목완료 자동 전환 공통) — 이름 스왑 + 컨텍스트 딥 1회 재생.
        .onChange(of: model.currentExerciseId) { _, _ in
            guard !reduceMotion else { return }
            exSwapMoment += 1
        }
        // 오버레이 z 순서 — 운동추가(69) < 키패드(79) < 액션시트(90), mock z-index 정합.
        .overlay { addexOverlay }
        .overlay { keypadOverlay }
        .overlay { actionOverlay }
    }

    // MARK: - 빈 세션 (mocks .session-empty) — 인라인 운동추가 시트, 타이머 0:00 (§6-1)

    var emptyState: some View {
        VStack(spacing: 0) {
            SessionToolbar(startMillis: nil, onHome: onHome,
                           onEndLongPress: { actionTarget = .end })
            VStack(spacing: 0) {
                Text("NEW SESSION").font(.mono(11, 600)).tracking(2.2).foregroundStyle(GY.crailDeep)
                Text("오늘은 어디부터\n시작할까요?")
                    .font(.sans(26, 700)).tracking(-0.78).lineSpacing(8)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(GY.ink1)
                    .padding(.top, 18)
            }
            .padding(.top, 32).padding(.horizontal, 32)
            Spacer()
            AddExerciseSheet(model: model, initialPart: model.lastAddexPart, inline: true)
        }
    }

    // MARK: - 진행 중 (mocks .session-active)

    var activeContent: some View {
        let exId = model.currentExerciseId
        let block = model.currentBlock
        let sets = block?.sets ?? []
        let cur = model.currentSetCursor
        let kind = model.currentCardKind
        let locked = model.currentBlockLocked
        let prevBlk = model.prevBlock(forExercise: exId)
        let blockTotal = sets.reduce(0.0) { $0 + $1.volume }
        let blockDone = sets.filter(\.done).reduce(0.0) { $0 + $1.volume }

        // 프로그레스바 분모 = 직전 이 종목 총볼륨 (없으면 오늘 계획), spec §6-7.
        let prevExVol = model.prevExerciseVolume(forExercise: exId)
        let exDenom = prevExVol > 0 ? prevExVol : blockTotal
        let exPct = exDenom > 0 ? Int((blockDone / exDenom * 100).rounded()) : 0
        let ov = VolumeRing.overflow(exDoneVol: blockDone, prevExVol: prevExVol)

        // 세션 볼륨 분모 = 직전 세션 총볼륨 (없으면 오늘 계획). 신기록 = 직전 존재 + 누적 초과 (§5.4).
        let prevTotal = model.prevSession?.totalVolume ?? 0
        let sessDenom = prevTotal > 0 ? prevTotal : model.sessionTotalVolume
        let topRecord = prevTotal > 0 && model.sessionDoneVolume > prevTotal

        // 세트바 — 슬롯 = 현재 세션 세트, 값 = done/current 실값 + 미입력 preview(직전 세션 타깃), §6-3-3.
        let slots: [SetBarSlot] = sets.indices.map { i in
            let d = GymSessionLogic.dotDisplay(sets: sets, i: i, cur: cur,
                                               prevSessionSets: prevBlk?.sets, kind: kind)
            return SetBarSlot(id: i, top: d.top, bottom: d.bottom, isPreview: d.isPreview,
                              state: i == cur ? .now : (sets[i].done ? .done : .upcoming),
                              pr: sets[i].pr, volume: sets[i].volume)
        }
        let bestPR = model.prs.first { $0.exerciseId == exId && $0.type == .e1rm }
        let best: (weight: Int, reps: Int)? = kind == .weight
            ? bestPR.map { (Int($0.weight.rounded()), $0.reps) } : nil

        // 히어로 표시 세트 — 커서 세트, 전부 done 이면 마지막 세트.
        let dispSet = model.currentSet ?? sets.last
        let (heroTop, heroBottom) = Self.heroValues(kind: kind, set: dispSet)

        // PR 칩 (progressive overload 넛지) — 현재 무게 > 직전 세션 최대 무게 (session.js 정합).
        let prChip: String? = {
            guard kind == .weight, !locked, let prevSets = prevBlk?.sets else { return nil }
            let curW = dispSet?.weight ?? 0
            let prevMax = prevSets.filter { ($0.reps ?? 0) > 0 }.compactMap(\.weight).max() ?? 0
            let delta = curW - prevMax
            guard prevMax > 0, delta > 0 else { return nil }
            return delta == delta.rounded() ? "+\(Int(delta))kg" : String(format: "+%.1fkg", delta)
        }()

        return VStack(spacing: 0) {
            SessionToolbar(startMillis: model.session.startTime, onHome: onHome,
                           onEndLongPress: { actionTarget = .end })
            SessionHeader(exName: model.currentExerciseName, part: model.currentPartName,
                          volCur: Self.fmt(model.sessionDoneVolume),
                          volTotal: Self.fmt(sessDenom), pct: model.sessionPct,
                          record: topRecord,
                          recordAmt: Int((model.sessionDoneVolume - prevTotal).rounded()),
                          pulseMoment: headerPulseMoment, exSwapMoment: exSwapMoment)
            let revealP = GymSwipeMath.revealProgress(Double(heroDragX))
            if !slots.isEmpty && kind != .cardio {
                PrevRecordBars(slots: slots, best: best, encodeHeight: kind == .weight,
                               dragP: CGFloat(revealP),
                               onLongPressSlot: { i in actionTarget = .setRow(i) })
                    .modifier(ExSwitchDip(trigger: exSwapMoment))
            }
            Spacer()
            ZStack {
                SessionHero(kind: kind, topValue: heroTop, bottomValue: heroBottom,
                            preset: dispSet?.preset ?? false, locked: locked,
                            doneSetCount: sets.filter(\.done).count,
                            pace: kind == .cardio
                                ? GymSessionLogic.paceText(durationSec: dispSet?.duration, distanceKm: dispSet?.distance)
                                : nil,
                            prChip: prChip, swapMoment: heroSwapMoment,
                            onTopTap: locked ? nil : { zone in heroTap(row: .top, zone: zone, kind: kind) },
                            onBottomTap: locked ? nil : { zone in heroTap(row: .bottom, zone: zone, kind: kind) })
                .offset(x: heroDragX)   // 드래그 추종 — 히어로 값만 이동 (칩·링은 고정)
                // 옛 값 고스트 — 좌향 퇴장 (드래그 커밋은 끌린 위치에서 제자리 페이드)
                if let g = heroGhost {
                    // 행별 OUT — 중량 -96 / 횟수 -88(55ms 지연). 시안 §6 gHeroSwapW/R.
                    SessionHero(kind: g.kind, topValue: g.top, bottomValue: g.bottom, ghostOut: g.fromDrag)
                        .offset(x: g.fromDrag ? heroGhostDragX : 0)
                        .accessibilityHidden(true)   // 고스트 — a11y 트리 중복 방지 (UI 테스트 쿼리 오염 차단)
                        .id(heroSwapMoment)
                }
            }
            .modifier(ExSwitchDip(trigger: exSwapMoment))   // 종목 전환 — 기록 바와 함께 V자 딥
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            // "완료" 칩 비례 노출 (mock #completeReveal — 좌드래그 p 에 비례)
            .overlay(alignment: .trailing) {
                HStack(spacing: 7) {
                    Image(systemName: "checkmark").font(.system(size: 12, weight: .bold))
                    Text("완료").font(.sans(13, 600))
                }
                .foregroundStyle(GY.crailDeep)
                .padding(.init(top: 7, leading: 11, bottom: 7, trailing: 14))
                .background(GY.crailSoft, in: Capsule())
                .overlay(Capsule().strokeBorder(GY.crailBase, lineWidth: 1))
                .opacity(revealP)
                .scaleEffect(0.9 + CGFloat(revealP) * 0.1)
                .offset(x: (1 - CGFloat(revealP)) * 14)
                .padding(.trailing, 22)
                .allowsHitTesting(false)
                .accessibilityIdentifier("complete-reveal")
            }
            // 햅틱 링 (mock #hapticRing — 커밋 직후 1회, PR 은 확장 강화)
            .overlay {
                if ringVisible {
                    HapticRing(isPR: ringIsPR).id(ringMoment)
                }
            }
            // 스와이프 방향 큐 (gSwipeHint — 커밋 1회, 좌향 스트릭+셰브런+엣지)
            .overlay {
                if cueVisible {
                    // 시안 #7b 의 % 좌표는 히어로 컨테이너(padding:0 26px) 기준 — 같은 폭을 준다.
                    SwipeCue().id(heroSwapMoment).padding(.horizontal, 26)
                }
            }
            .gesture(DragGesture(minimumDistance: 8)
                .onChanged { v in
                    let dx = Double(v.translation.width), dy = Double(v.translation.height)
                    if !heroDragging {
                        guard GymSwipeMath.engaged(dx: dx, dy: dy) else { return }   // 수직 스크롤 양보
                        heroDragging = true
                        model.prepareCommitHaptic()   // Taptic 예열 — 커밋 진동 지연·누락 방지
                    }
                    heroDragX = CGFloat(GymSwipeMath.heroTranslate(dx))   // 우저항 ×0.25 · 좌 -150 클램프
                }
                .onEnded { v in
                    let wasDragging = heroDragging
                    heroDragging = false
                    guard wasDragging else { return }
                    switch GymSwipeMath.endAction(dx: Double(v.translation.width),
                                                  dy: Double(v.translation.height)) {
                    case .commit: commitSwipe()                            // 좌 = 세트완료
                    case .revert: model.revertToPreviousSet(); springBackHero()   // 우 = 이전 세트
                    case .tap, .springBack: springBackHero()
                    }
                })
            Spacer()
            if kind != .cardio {   // 유산소는 볼륨 링 없음 (§6-4)
                ExerciseVolumeRing(
                    sets: sets, cur: model.currentSetIdx, pct: exPct,
                    curVol: blockDone, totVol: Self.fmt(exDenom),
                    exOver: prevExVol > 0 && blockDone >= prevExVol,
                    over: ov, burstMoment: burstMoment)
            }
            // 레일 순서 = [완료(완료순) 좌측 · 현재·미완료는 삽입 순서 유지] (2026-07-24).
            // 탭·꾹누르기는 원본 블록 인덱스(it.index)로 전달.
            // 전부 완료면 current 없음 → 완료된 종목이 흰 카드로 남지 않고 체크 칩이 된다.
            let railItems = GymSessionLogic.footerOrder(blocks: model.session.blocks,
                                                        currentIdx: model.activeBlockIdx ?? -1)
            GymFooterRail(items: railItems.map {
                GymFooterRail.Item(name: model.exerciseName(model.session.blocks[$0.index].exerciseId),
                                   state: RailState(core: $0.state), blockIdx: $0.index)
            }, onTapItem: { model.selectBlock($0) },
               onLongPressItem: { actionTarget = .block($0) },
               onAdd: { addexOpen = true })
        }
    }

    // MARK: - 드래그 커밋 (§6-3-1 — 카운트업·햅틱 링·스프링백)

    func sessionDoneCount() -> Int {
        model.session.blocks.reduce(0) { $0 + $1.sets.filter(\.done).count }
    }
    // 스프링백 — session.js springBack(320ms cubic-bezier(.2,.8,.3,1) 오버슈트) 근사.
    func springBackHero() {
        withAnimation(.spring(response: 0.32, dampingFraction: 0.72)) { heroDragX = 0 }
    }
    // 현재 블록 완료 볼륨 (돌파 전/후 비교용).
    func blockDoneVol(_ bi: Int) -> Double {
        guard model.session.blocks.indices.contains(bi) else { return 0 }
        return model.session.blocks[bi].sets.filter(\.done).reduce(0) { $0 + $1.volume }
    }
    // 좌스와이프 커밋 — 카운트업은 커밋 트랜잭션만 애니 (PWA countUp 가드: 키패드 수정·리로드 미발화).
    func commitSwipe() {
        let bi = model.currentBlockIdx
        let exId = model.session.blocks.indices.contains(bi) ? model.session.blocks[bi].exerciseId : ""
        let prevExVol = model.prevExerciseVolume(forExercise: exId)
        let prevTotal = model.prevSession?.totalVolume ?? 0
        let exBefore = blockDoneVol(bi)
        let sessBefore = model.sessionDoneVolume
        let doneBefore = sessionDoneCount()
        let prBefore = model.prMoment
        // 스왑 고스트용 옛 값 캡처 (§5.3 — 커밋 확정 후 사용)
        let ghostKind = model.currentCardKind
        let ghostVals = Self.heroValues(kind: ghostKind, set: model.currentSet ?? model.currentBlock?.sets.last)
        let dragXAtCommit = heroDragX
        withAnimation(.timingCurve(0.33, 1, 0.68, 1, duration: 0.62)) {
            model.completeCurrentSet()
        }
        guard sessionDoneCount() > doneBefore else {
            withAnimation(.easeOut(duration: 0.18)) { heroDragX = 0 }
            return
        }
        if reduceMotion {
            withAnimation(.easeOut(duration: 0.18)) { heroDragX = 0 }
        } else {
            // 히어로 수평 스왑 + 스와이프 큐 (gHeroSwap*/gSwipeHint 760ms, 1회)
            heroGhostDragX = dragXAtCommit
            heroGhost = (ghostVals.0, ghostVals.1, ghostKind, true)
            heroSwapMoment += 1
            cueVisible = true
            heroDragX = 0   // 즉시 — 퇴장 시각은 고스트가 담당 (fromDrag 정합)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.85) {
                heroGhost = nil
                cueVisible = false
            }
        }
        fireRing(isPR: model.prMoment > prBefore)
        guard !reduceMotion else { return }   // 1회성 팝 — PWA countUp RM 게이트 정합
        if GymRecordMoments.exRecordCrossed(before: exBefore, after: blockDoneVol(bi), prevExVol: prevExVol) {
            burstMoment += 1
        }
        if GymRecordMoments.topRecordCrossed(before: sessBefore, after: model.sessionDoneVolume,
                                             prevSessionVol: prevTotal) {
            headerPulseMoment += 1
        }
    }
    // 햅틱 링 재생 (부록 햅틱 링 — 일반 420ms / PR 540ms). reduced-motion 스킵.
    func fireRing(isPR: Bool) {
        guard !reduceMotion else { return }
        ringIsPR = isPR
        ringMoment += 1
        ringVisible = true
        DispatchQueue.main.asyncAfter(deadline: .now() + (isPR ? 0.6 : 0.5)) { ringVisible = false }
    }

    // MARK: - 히어로 존 → 모델 액션 매핑 (§6-3·§6-4)

    enum HeroRow { case top, bottom }
    func heroTap(row: HeroRow, zone: HeroZone, kind: GymCardKind) {
        switch kind {
        case .cardio:
            openKeypad(row == .top ? .duration : .distance)   // 전 영역 키패드 (§6-4)
        case .bodyweight:
            guard row == .bottom else { return }              // 맨몸 — 횟수 전용
            switch zone {
            case .minus: model.adjustReps(-1)
            case .plus:  model.adjustReps(1)
            case .center: openKeypad(.reps)
            }
        case .weight:
            switch (row, zone) {
            case (.top, .minus):    model.adjustWeight(-1)
            case (.top, .plus):     model.adjustWeight(1)
            case (.top, .center):   openKeypad(.weight)
            case (.bottom, .minus): model.adjustReps(-1)
            case (.bottom, .plus):  model.adjustReps(1)
            case (.bottom, .center): openKeypad(.reps)
            }
        }
    }

    // MARK: - 키패드 (§6-3-2) — prefill = 대상 세트 값, duration 은 분 변환

    func prefillValue(_ field: GymAppModel.KeypadField, setIdx: Int? = nil) -> Double? {
        let set: GymSet? = {
            if let si = setIdx, let b = model.currentBlock, b.sets.indices.contains(si) { return b.sets[si] }
            return model.currentSet ?? model.currentBlock?.sets.last
        }()
        switch field {
        case .weight:   return set?.weight
        case .reps:     return set?.reps.map(Double.init)
        case .duration: return set?.duration.map { ($0 / 60).rounded() }
        case .distance: return set?.distance
        }
    }
    func openKeypad(_ field: GymAppModel.KeypadField, setIdx: Int? = nil) {
        guard !model.currentBlockLocked else { return }
        let pre = prefillValue(field, setIdx: setIdx)
        keypad = KeypadContext(field: field,
                               buffer: pre.map { Self.fmtW($0) } ?? "",
                               fresh: pre != nil,
                               pairHidesWeight: model.currentCardKind == .bodyweight,
                               setIdx: setIdx)
    }
    func switchKeypadMode(_ field: GymAppModel.KeypadField) {
        guard var kp = keypad, kp.field != field else { return }
        let pre = prefillValue(field, setIdx: kp.setIdx)
        kp.field = field
        kp.buffer = pre.map { Self.fmtW($0) } ?? ""
        kp.fresh = pre != nil
        keypad = kp
    }
    func quickDelta(_ d: Double) {
        guard var kp = keypad else { return }
        let cur = Double(kp.buffer) ?? 0
        kp.buffer = Self.fmtW(max(0, cur + d))
        kp.fresh = false
        keypad = kp
    }
    // 완료/배경 탭 — buf 파싱 유효 시 적용, 아니면 단순 닫기 (applyKeypadValue 정합).
    func keypadDone() {
        defer { keypad = nil }
        guard let kp = keypad, let v = Double(kp.buffer), v >= 0 else { return }
        model.applyKeypad(kp.field, value: v, setIdx: kp.setIdx)
    }

    var keypadOverlay: some View {
        // 슬라이드업 (mock translateY(100%)→0 200ms ease + 백드롭 페이드)
        ZStack(alignment: .bottom) {
            if keypad != nil {
                Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                    .contentShape(Rectangle())
                    .onTapGesture { keypadDone() }   // 배경 탭 = 적용 (PWA backdrop apply)
                    .transition(.opacity)
                KeypadSheet(ctx: keypad!,
                            refValue: prefillValue(keypad!.field, setIdx: keypad!.setIdx).map { Self.fmtW($0) },
                            onKey: { k in if keypad != nil { KeypadBuffer.apply(k, to: &keypad!) } },
                            onQuick: { d in quickDelta(d) },
                            onMode: { m in switchKeypadMode(m) },
                            onDone: { keypadDone() })
                    .transition(.move(edge: .bottom))
            }
        }
        .animation(.easeOut(duration: 0.2), value: keypad != nil)
    }

    // MARK: - 운동 추가 시트 (§6-2)

    var addexOverlay: some View {
        ZStack(alignment: .bottom) {
            if addexOpen {
                Color(oklch: 0.22, 0.008, 60).opacity(0.32)
                    .contentShape(Rectangle())
                    .onTapGesture { addexOpen = false }
                    .transition(.opacity)
                AddExerciseSheet(model: model, initialPart: model.lastAddexPart)
                    .transition(.move(edge: .bottom))
            }
        }
        .animation(.easeOut(duration: 0.2), value: addexOpen)
    }

    // MARK: - 꾹누르기 액션시트 (§6-9)

    func actionSheetSpec(_ target: ActionTarget) -> (title: String, items: [GymActionItem]) {
        switch target {
        case .block(let i):
            guard model.session.blocks.indices.contains(i) else { return ("운동 옵션", []) }
            // session.js getActionMenuFor('footer-exercise') — 항목은 blockActions 가 정본. '이동' 없음.
            let state: GymSessionLogic.GymRailState = i == model.activeBlockIdx
                ? .current : (GymSessionLogic.isBlockDone(model.session.blocks[i]) ? .done : .upcoming)
            let labels: [GymSessionLogic.GymBlockAction: (String, Bool)] = [
                .finish: ("완료", false), .edit: ("수정", false), .delete: ("삭제", true),
            ]
            return ("운동 옵션", GymSessionLogic.blockActions(state: state).map {
                .init(id: $0.rawValue, label: labels[$0]!.0, danger: labels[$0]!.1)
            })
        case .setRow(let i):
            return ("\(i + 1)세트", [.init(id: "edit", label: "수정"),
                                     .init(id: "delete", label: "삭제", danger: true)])
        case .end:
            return ("세션", [.init(id: "finish", label: "종료"),
                            .init(id: "discard", label: "세션 삭제", danger: true)])
        }
    }

    func handleAction(_ id: String, target: ActionTarget) {
        defer { actionTarget = nil }
        switch target {
        case .block(let i):
            switch id {
            case "finish": model.finishBlock(at: i)
            case "delete":
                guard model.session.blocks.indices.contains(i) else { return }
                model.removeExercise(model.session.blocks[i].exerciseId)
            case "edit": model.selectBlock(i)
            default: break
            }
        case .setRow(let i):
            switch id {
            case "edit": openKeypad(.weight, setIdx: i)
            case "delete": model.removeSet(blockIdx: model.currentBlockIdx, setIdx: i)
            default: break
            }
        case .end:
            switch id {
            case "finish": model.endSession()
            case "discard": model.discardSession()
            default: break
            }
        }
    }

    var actionOverlay: some View {
        ZStack(alignment: .bottom) {
            if let target = actionTarget {
                let spec = actionSheetSpec(target)
                Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                    .contentShape(Rectangle())
                    .onTapGesture { actionTarget = nil }
                    .transition(.opacity)
                GymActionSheet(title: spec.title, items: spec.items,
                               onSelect: { handleAction($0, target: target) },
                               onCancel: { actionTarget = nil })
                    .transition(.move(edge: .bottom))
            }
        }
        .animation(.easeOut(duration: 0.2), value: actionTarget != nil)
    }
}

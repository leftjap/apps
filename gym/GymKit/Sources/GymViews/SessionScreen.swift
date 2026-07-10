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
                Text("종료").font(.sans(14, 600)).foregroundStyle(GY.ink3)
                    .padding(.leading, 14).padding(.trailing, 4).padding(.vertical, 9)
                    .contentShape(Rectangle())
                    .onLongPressGesture(minimumDuration: 0.5, perform: onEndLongPress)
                    .accessibilityIdentifier("session-end")
            }
        }
        .padding(.horizontal, 16).frame(height: 48)
    }
}

// 타이틀 + 세션 볼륨 링 (시안 #15a 헤더: align center, gap 16 / .sv gap 11 / ring 56).
struct SessionHeader: View {
    let exName: String
    let part: String
    let volCur: String
    let volTotal: String
    let pct: Int
    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(exName).font(.sans(25, 700)).tracking(-0.5)
                    .foregroundStyle(GY.ink1).lineLimit(1).accessibilityIdentifier("session-exname")
                Text(part).font(.sans(12.5, 500))
                    .foregroundStyle(GY.ink4).lineLimit(1)
            }
            Spacer(minLength: 0)
            HStack(spacing: 11) {
                VStack(alignment: .trailing, spacing: 3) {
                    Text("세션 볼륨").font(.sans(10.5, 600)).tracking(0.42).foregroundStyle(GY.ink4)
                    (Text(volCur + " ").font(.mono(13, 600)).foregroundStyle(GY.ink2)
                     + Text("/ \(volTotal)kg").font(.mono(13, 500)).foregroundStyle(GY.ink4))
                        .lineLimit(1).fixedSize(horizontal: true, vertical: false)
                }
                ZStack {
                    GymRing(size: 56, lineWidth: 4.76, progress: Double(pct) / 100,
                            track: Color(oklch: 0.92, 0.006, 60), fill: GY.cloudyBase)
                    Text("\(pct)%").font(.mono(14, 700)).tracking(-0.28).foregroundStyle(GY.cloudyDeep)
                }
            }
        }
        .padding(.horizontal, 24).padding(.top, 12)
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // 꾹누르기 액션시트 대상 (§6-9)
    enum ActionTarget: Equatable {
        case block(Int)      // 푸터 레일 칩
        case setRow(Int)     // 세트바 슬롯
        case end             // 종료 버튼
        case move(Int)       // 이동 — 위치 선택 단계
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

    public var body: some View {
        Group {
            if model.session.blocks.isEmpty { emptyState } else { activeContent }
        }
        .frame(width: 390)
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
            AddExerciseSheet(model: model, inline: true)
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

        // 세션 볼륨 분모 = 직전 세션 총볼륨 (없으면 오늘 계획).
        let sessDenom = (model.prevSession?.totalVolume ?? 0) > 0 ? model.prevSession!.totalVolume : model.sessionTotalVolume

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
        let heroTop: String = {
            switch kind {
            case .weight:     return dispSet?.weight.map { Self.fmtW($0) } ?? "—"
            case .bodyweight: return "맨몸"
            case .cardio:     return "\(Int(((dispSet?.duration ?? 0) / 60).rounded()))"
            }
        }()
        let heroBottom: String = {
            switch kind {
            case .weight, .bodyweight: return dispSet?.reps.map { "\($0)" } ?? "—"
            case .cardio:              return dispSet?.distance.map { Self.fmtW($0) } ?? "0"
            }
        }()

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
                          volTotal: Self.fmt(sessDenom), pct: model.sessionPct)
            let revealP = GymSwipeMath.revealProgress(Double(heroDragX))
            if !slots.isEmpty && kind != .cardio {
                PrevRecordBars(slots: slots, best: best, encodeHeight: kind == .weight,
                               dragP: CGFloat(revealP),
                               onLongPressSlot: { i in actionTarget = .setRow(i) })
            }
            Spacer()
            SessionHero(kind: kind, topValue: heroTop, bottomValue: heroBottom,
                        preset: dispSet?.preset ?? false, locked: locked,
                        doneSetCount: sets.filter(\.done).count,
                        pace: kind == .cardio
                            ? GymSessionLogic.paceText(durationSec: dispSet?.duration, distanceKm: dispSet?.distance)
                            : nil,
                        prChip: prChip,
                        onTopTap: locked ? nil : { zone in heroTap(row: .top, zone: zone, kind: kind) },
                        onBottomTap: locked ? nil : { zone in heroTap(row: .bottom, zone: zone, kind: kind) })
            .offset(x: heroDragX)   // 드래그 추종 — 히어로 값만 이동 (칩·링은 고정)
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
            .gesture(DragGesture(minimumDistance: 8)
                .onChanged { v in
                    let dx = Double(v.translation.width), dy = Double(v.translation.height)
                    if !heroDragging {
                        guard GymSwipeMath.engaged(dx: dx, dy: dy) else { return }   // 수직 스크롤 양보
                        heroDragging = true
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
                    overAmt: ov.isOver ? "+\(ov.overAmt)" : nil)
            }
            GymFooterRail(items: model.session.blocks.enumerated().map { i, b in
                let state: RailState = i == model.currentBlockIdx
                    ? .current : (GymSessionLogic.isBlockDone(b) ? .done : .upcoming)
                return GymFooterRail.Item(name: model.exerciseName(b.exerciseId), state: state)
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
    // 좌스와이프 커밋 — 카운트업은 커밋 트랜잭션만 애니 (PWA countUp 가드: 키패드 수정·리로드 미발화).
    func commitSwipe() {
        let doneBefore = sessionDoneCount()
        let prBefore = model.prMoment
        withAnimation(.timingCurve(0.33, 1, 0.68, 1, duration: 0.62)) {
            model.completeCurrentSet()
        }
        withAnimation(.easeOut(duration: 0.18)) { heroDragX = 0 }   // 커밋 — 위치 점프 없이 복귀
        if sessionDoneCount() > doneBefore {
            fireRing(isPR: model.prMoment > prBefore)
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
                AddExerciseSheet(model: model, initialPart: model.currentPartId.isEmpty ? "chest" : model.currentPartId)
                    .transition(.move(edge: .bottom))
            }
        }
        .animation(.easeOut(duration: 0.2), value: addexOpen)
    }

    // MARK: - 꾹누르기 액션시트 (§6-9)

    func actionSheetSpec(_ target: ActionTarget) -> (title: String, items: [GymActionItem]) {
        switch target {
        case .block(let i):
            guard model.session.blocks.indices.contains(i) else { return ("메뉴", []) }
            let b = model.session.blocks[i]
            let name = model.exerciseName(b.exerciseId)
            if GymSessionLogic.isBlockDone(b) {
                return (name, [.init(id: "edit", label: "수정"),
                               .init(id: "delete", label: "삭제", danger: true),
                               .init(id: "move", label: "이동")])
            }
            if b.sets.contains(where: \.done) || i == model.currentBlockIdx {
                return (name, [.init(id: "finish", label: "완료"),
                               .init(id: "delete", label: "삭제", danger: true),
                               .init(id: "move", label: "이동")])
            }
            return (name, [.init(id: "delete", label: "삭제", danger: true),
                           .init(id: "move", label: "이동")])
        case .setRow(let i):
            return ("\(i + 1)세트", [.init(id: "edit", label: "수정"),
                                     .init(id: "delete", label: "삭제", danger: true)])
        case .end:
            return ("세션", [.init(id: "finish", label: "종료"),
                            .init(id: "discard", label: "세션 삭제", danger: true)])
        case .move(let from):
            let name = model.session.blocks.indices.contains(from)
                ? model.exerciseName(model.session.blocks[from].exerciseId) : ""
            return ("\(name) 이동 — 위치 선택",
                    model.session.blocks.enumerated().map { i, b in
                        .init(id: "to-\(i)", label: i == from
                              ? "\(i + 1). \(model.exerciseName(b.exerciseId)) (현재)"
                              : "\(i + 1). \(model.exerciseName(b.exerciseId))")
                    })
        }
    }

    func handleAction(_ id: String, target: ActionTarget) {
        defer { if case .block(let f) = target, id == "move" { actionTarget = .move(f) } else { actionTarget = nil } }
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
        case .move(let from):
            if id.hasPrefix("to-"), let to = Int(id.dropFirst(3)) {
                model.moveBlock(from: from, to: to)
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

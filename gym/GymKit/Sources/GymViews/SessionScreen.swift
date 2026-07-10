import SwiftUI
import GymCore

// 세션 화면 — mocks/session.html .session-active 이식. GymAppModel(실 세션) 구동.
// 폰트: 실앱은 번들 Pretendard/Space Grotesk. 스캐폴딩은 시스템 폴백(.monospaced for mono).

// 상단 툴바 — grid 1fr auto 1fr, height 48 (mocks .sess-toolbar). 타이머는 startTime 기반 라이브(spec §6-6).
struct SessionToolbar: View {
    var startMillis: Int64? = nil     // 세션 시작 epoch(ms) — 경과 = now - startTime
    var displayTime: String? = nil    // 정적 표시(컴포넌트 데모용). nil 이면 라이브.
    var onHome: () -> Void = {}
    var onEnd: () -> Void = {}
    var onEndLongPress: () -> Void = {}   // 꾹누르기 → 종료/삭제 확인 (§6-9)

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
                    .onTapGesture(perform: onEnd)
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

// 세션 화면 전체 — mocks/session.html .session-active. GymAppModel(실 세션) 구동.
public struct SessionScreenView: View {
    @ObservedObject var model: GymAppModel
    var onHome: () -> Void
    @State private var keypad: KeypadContext? = nil
    @State private var prPopVisible: Bool
    @State private var prPopRise = false

    public init(model: GymAppModel, onHome: @escaping () -> Void = {},
                initialKeypadField: GymAppModel.KeypadField? = nil, initialPRPop: Bool = false) {
        self.model = model; self.onHome = onHome
        _prPopVisible = State(initialValue: initialPRPop)
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
                initialKeypadField: GymAppModel.KeypadField? = nil, initialPRPop: Bool = false) {
        self.init(model: GymAppModel(), onHome: onHome,
                  initialKeypadField: initialKeypadField, initialPRPop: initialPRPop)
    }

    static let nf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()
    static func fmt(_ n: Double) -> String { nf.string(from: NSNumber(value: n)) ?? "\(Int(n))" }
    static func fmtW(_ n: Double) -> String { String(format: "%g", n) }

    public var body: some View {
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

        return VStack(spacing: 0) {
            SessionToolbar(startMillis: model.session.startTime, onHome: onHome, onEnd: { model.endSession() })
            SessionHeader(exName: model.currentExerciseName, part: model.currentPartName,
                          volCur: Self.fmt(model.sessionDoneVolume),
                          volTotal: Self.fmt(sessDenom), pct: model.sessionPct)
            if !slots.isEmpty && kind != .cardio {
                PrevRecordBars(slots: slots, best: best, encodeHeight: kind == .weight)
            }
            Spacer()
            SessionHero(kind: kind, topValue: heroTop, bottomValue: heroBottom,
                        preset: dispSet?.preset ?? false, locked: locked,
                        doneSetCount: sets.filter(\.done).count,
                        pace: kind == .cardio
                            ? GymSessionLogic.paceText(durationSec: dispSet?.duration, distanceKm: dispSet?.distance)
                            : nil,
                        onTopTap: locked ? nil : { zone in heroTap(row: .top, zone: zone, kind: kind) },
                        onBottomTap: locked ? nil : { zone in heroTap(row: .bottom, zone: zone, kind: kind) })
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 60)
                .onEnded { v in
                    guard abs(v.translation.width) > abs(v.translation.height) else { return }   // 수직 스크롤 우선
                    if v.translation.width < -60 { model.completeCurrentSet() }        // 좌 = 세트완료
                    else if v.translation.width > 60 { model.revertToPreviousSet() }    // 우 = 이전 세트
                })
            Spacer()
            if kind != .cardio {   // 유산소는 볼륨 링 없음 (§6-4)
                ExerciseVolumeRing(
                    sets: sets, cur: model.currentSetIdx, pct: exPct,
                    curVol: Self.fmt(blockDone), totVol: Self.fmt(exDenom),
                    overAmt: ov.isOver ? "+\(ov.overAmt)" : nil)
            }
            GymFooterRail(items: model.session.blocks.enumerated().map { i, b in
                let state: RailState = i == model.currentBlockIdx
                    ? .current : (GymSessionLogic.isBlockDone(b) ? .done : .upcoming)
                return GymFooterRail.Item(name: model.exerciseName(b.exerciseId), state: state)
            }, onTapItem: { model.selectBlock($0) })
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
        // 키패드 바텀시트 (§6-3-2) — 배경 탭 = 값 적용 (PWA backdrop apply 정합).
        .overlay {
            if keypad != nil {
                ZStack(alignment: .bottom) {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle())
                        .onTapGesture { keypadDone() }
                    KeypadSheet(ctx: keypad!,
                                refValue: keypadRef(),
                                onKey: { k in if keypad != nil { KeypadBuffer.apply(k, to: &keypad!) } },
                                onQuick: { d in quickDelta(d) },
                                onMode: { m in switchKeypadMode(m) },
                                onDone: { keypadDone() })
                }
            }
        }
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

    // MARK: - 키패드 상태 (prefill = 현재 세트 값, duration 은 분 변환)

    func prefillValue(_ field: GymAppModel.KeypadField) -> Double? {
        let set = model.currentSet ?? model.currentBlock?.sets.last
        switch field {
        case .weight:   return set?.weight
        case .reps:     return set?.reps.map(Double.init)
        case .duration: return set?.duration.map { ($0 / 60).rounded() }
        case .distance: return set?.distance
        }
    }
    func openKeypad(_ field: GymAppModel.KeypadField) {
        guard !model.currentBlockLocked else { return }
        let pre = prefillValue(field)
        keypad = KeypadContext(field: field,
                               buffer: pre.map { Self.fmtW($0) } ?? "",
                               fresh: pre != nil,
                               pairHidesWeight: model.currentCardKind == .bodyweight)
    }
    func keypadRef() -> String? { keypad.flatMap { _ in prefillValue(keypad!.field).map { Self.fmtW($0) } } }
    func switchKeypadMode(_ field: GymAppModel.KeypadField) {
        guard var kp = keypad, kp.field != field else { return }
        let pre = prefillValue(field)
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
        model.applyKeypad(kp.field, value: v)
    }
}

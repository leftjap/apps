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
                Button(action: onEnd) {
                    Text("종료").font(.sans(14, 600)).foregroundStyle(GY.ink3)
                        .padding(.leading, 14).padding(.trailing, 4).padding(.vertical, 9)
                }.buttonStyle(.plain).accessibilityIdentifier("session-end")
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

// 세션 화면 전체 — mocks/session.html .session-active. GymAppModel(실 세션) 구동.
public struct SessionScreenView: View {
    @ObservedObject var model: GymAppModel
    var onHome: () -> Void
    public init(model: GymAppModel, onHome: @escaping () -> Void = {}) {
        self.model = model; self.onHome = onHome
    }
    // 데모 편의 init (프리뷰/스냅샷) — 자체 모델 시드.
    public init(onHome: @escaping () -> Void = {}) {
        self.model = GymAppModel(); self.onHome = onHome
    }

    static let nf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()
    static func fmt(_ n: Double) -> String { nf.string(from: NSNumber(value: n)) ?? "\(Int(n))" }
    static let wf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 1; return f }()
    static func fmtW(_ n: Double) -> String { wf.string(from: NSNumber(value: n)) ?? "\(n)" }

    public var body: some View {
        let exId = model.currentExerciseId
        let block = model.currentBlock
        let sets = block?.sets ?? []
        let curIdx = model.currentSetIdx
        let blockTotal = sets.reduce(0.0) { $0 + $1.volume }
        let blockDone = sets.filter(\.done).reduce(0.0) { $0 + $1.volume }
        let cur = model.currentSet

        // 프로그레스바 분모 = 직전 이 종목 총볼륨 (없으면 오늘 계획), spec §6-7.
        let prevExVol = model.prevExerciseVolume(forExercise: exId)
        let exDenom = prevExVol > 0 ? prevExVol : blockTotal
        let exPct = exDenom > 0 ? Int((blockDone / exDenom * 100).rounded()) : 0
        let ov = VolumeRing.overflow(exDoneVol: blockDone, prevExVol: prevExVol)

        // 세션 볼륨 분모 = 직전 세션 총볼륨 (없으면 오늘 계획).
        let sessDenom = (model.prevSession?.totalVolume ?? 0) > 0 ? model.prevSession!.totalVolume : model.sessionTotalVolume

        // 직전 세션 기록 바 — prevBlock 세트값 + 현재 세트 위치 now.
        let prevBlk = model.prevBlock(forExercise: exId)
        let prevBars: [PrevSetBar] = (prevBlk?.sets ?? []).enumerated().map { i, s in
            let st: BarState = i == curIdx ? .now : (i < curIdx ? .done : .upcoming)
            return PrevSetBar(weight: Int((s.weight ?? 0).rounded()), reps: s.reps ?? 0, state: st)
        }
        let bestPR = model.prs.first { $0.exerciseId == exId && $0.type == .e1rm }
        let best: (weight: Int, reps: Int)? = bestPR.map { (Int($0.weight.rounded()), $0.reps) }

        return VStack(spacing: 0) {
            SessionToolbar(startMillis: model.session.startTime, onHome: onHome, onEnd: { model.endSession() })
            SessionHeader(exName: model.currentExerciseName, part: model.currentPartName,
                          volCur: Self.fmt(model.sessionDoneVolume),
                          volTotal: Self.fmt(sessDenom), pct: model.sessionPct)
            if !prevBars.isEmpty {
                PrevRecordBars(sets: prevBars, best: best)
            }
            Spacer()
            ZStack {
                SessionHero(weight: cur?.weight.map { Self.fmtW($0) } ?? "—", unit: "kg",
                            reps: cur?.reps.map { "\($0)" } ?? "—")
                // 좌/우 빈 영역 탭 = 중량 증감(장비별, spec §6-3). 중앙은 키패드(후속).
                HStack(spacing: 0) {
                    Color.clear.contentShape(Rectangle())
                        .onTapGesture { model.adjustWeight(-1) }
                        .accessibilityIdentifier("hero-minus")
                    Spacer().frame(width: 150)
                    Color.clear.contentShape(Rectangle())
                        .onTapGesture { model.adjustWeight(1) }
                        .accessibilityIdentifier("hero-plus")
                }
            }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 30)
                .onEnded { v in
                    if v.translation.width < -30 { model.completeCurrentSet() }        // 좌 = 세트완료
                    else if v.translation.width > 30 { model.revertToPreviousSet() }    // 우 = 이전 세트
                })
            Spacer()
            ExerciseVolumeRing(
                sets: sets, cur: curIdx, pct: exPct,
                curVol: Self.fmt(blockDone), totVol: Self.fmt(exDenom),
                overAmt: ov.isOver ? "+\(ov.overAmt)" : nil)
            GymFooterRail(items: model.session.blocks.enumerated().map { i, b in
                let allDone = b.sets.allSatisfy(\.done)
                let state: RailState = i == model.currentBlockIdx ? .current : (allDone ? .done : .upcoming)
                return GymFooterRail.Item(name: model.exerciseName(b.exerciseId), state: state)
            })
        }
        .frame(width: 390)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(GY.shell)
    }
}

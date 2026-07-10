import SwiftUI
import GymCore

// 홈 화면 — mocks/home.html HomeA(idle) 이식. GymAppModel(실 이력·체중) 구동.
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

    // 부위 밸런스 — home.js summarizeWeeklyBalance (롤링 7일·고정 순서 하체~코어·유산소 별도 행).

    // 진행 중 세션 존재 → HomeC(이어하기), 아니면 HomeA(idle) — mocks home.html 이중 분기 (spec §5-5).
    var isActiveSession: Bool {
        model.session.status == .active && !model.session.blocks.isEmpty
    }

    @State private var detailISO: String? = nil   // 날짜 탭 → 상세 바텀시트 (§5-2)
    @State private var weightKeypad: KeypadContext? = nil   // 오늘 체중 입력 (§10-2 home 공유)

    public var body: some View {
        Group {
            if isActiveSession { homeC } else { homeA }
        }
        .frame(width: 390)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(GY.shell)
        .overlay {
            if let iso = detailISO {
                ZStack(alignment: .bottom) {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle())
                        .onTapGesture { detailISO = nil }
                    DayDetailSheet(iso: iso, entry: model.dayEntry(iso),
                                   onDelete: { detailISO = nil }, onCancel: { detailISO = nil })
                }
            }
        }
        // 오늘 체중 입력 키패드 (home/admin 공유 — mock #weightKeypadSheet)
        .overlay {
            if weightKeypad != nil {
                ZStack(alignment: .bottom) {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle()).onTapGesture { weightKeypad = nil }
                    KeypadSheet(ctx: weightKeypad!,
                                refValue: model.weights.first.map { Self.wf.string(from: NSNumber(value: $0.kg)) ?? "\($0.kg)" },
                                bare: true, doneLabel: "저장",
                                onKey: { k in if weightKeypad != nil { KeypadBuffer.apply(k, to: &weightKeypad!) } },
                                onQuick: { _ in }, onMode: { _ in },
                                onDone: {
                                    defer { weightKeypad = nil }
                                    guard let kp = weightKeypad, let v = Double(kp.buffer), v > 0 else { return }
                                    model.saveWeight((v * 10).rounded() / 10)
                                })
                }
            }
        }
    }

    var homeA: some View {
        let ref = model.referenceToday
        let week = model.weekCells(around: ref)
        let last = model.lastCompletedSession()
        let bal = GymHomeLogic.weeklyBalance(sessions: model.allWorkedSessions(),
                                             custom: model.custom, now: ref)

        return VStack(spacing: 0) {
            header
            weekCalendar(week).padding(.horizontal, 18).padding(.top, 18)
            if last != nil { lastWorkoutRow(last, ref: ref) }   // empty 시 행 숨김 (home.js)
            balance(bal)
            weightRow(model.weights.first, prev: model.weights.count >= 2 ? model.weights[1] : nil)
                .padding(.horizontal, 24)
            cta(empty: last == nil)
        }
    }

    // HomeC — 이어하기 카드 (mocks #cardResume, spec §5-5). 박스 전체 = 이어가기 버튼.
    var homeC: some View {
        let session = model.session
        let singles = session.blocks.filter { $0.type == "single" }
        let completed = singles.filter { !$0.sets.isEmpty && $0.sets.allSatisfy(\.done) }.count
        // 현재 블록 = 첫 미완료 + 위치 (home.js summarizeActiveSession)
        var curBlock: GymBlock? = nil
        var curPos = 0
        for (i, b) in singles.enumerated() where curBlock == nil {
            if !(!b.sets.isEmpty && b.sets.allSatisfy(\.done)) { curBlock = b; curPos = i + 1 }
        }
        let curSets = curBlock?.sets ?? []
        let curSetIdx = curSets.firstIndex { !$0.done } ?? max(0, curSets.count - 1)
        let exName = curBlock.map { model.exerciseName($0.exerciseId) } ?? ""
        let partNames = session.tags.map { GymExercises.partName($0) }.joined(separator: " · ")
        let subLine = "\(partNames.isEmpty ? "" : partNames + " · ")\(singles.count)종목 중 \(max(1, curPos))번째"
        let totalVol = model.sessionDoneVolume

        return VStack(spacing: 0) {
            header
            weekCalendar(model.weekCells(around: model.referenceToday))
                .padding(.horizontal, 18).padding(.top, 18)
            Spacer()
            Button(action: onStart) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        HStack(spacing: 7) {
                            Circle().fill(GY.crailBase).frame(width: 7, height: 7)
                            Text("운동 중").font(.sans(12, 600)).tracking(0.72).foregroundStyle(GY.crailDeep)
                        }
                        Spacer()
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            TimelineView(.periodic(from: .now, by: 1)) { ctx in
                                Text(Self.fmtResume(session.startTime, now: ctx.date))
                                    .font(.mono(18, 500)).tracking(-0.36).foregroundStyle(GY.ink1)
                            }
                            Text("경과").font(.sans(11, 500)).foregroundStyle(GY.ink4)
                        }
                    }
                    Text(exName).font(.sans(30, 700)).tracking(-0.6).lineLimit(1)
                        .foregroundStyle(GY.ink1).padding(.top, 18)
                        .accessibilityIdentifier("resume-exname")
                    Text(subLine).font(.sans(13, 500)).foregroundStyle(GY.ink4)
                        .lineLimit(1).padding(.top, 5)
                    // 세트 세그먼트 (mock #cardResumeSeg — done ink bar / now crail 굵게)
                    HStack(spacing: 6) {
                        ForEach(Array(curSets.enumerated()), id: \.offset) { i, s in
                            VStack(spacing: 7) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(i == curSetIdx ? GY.crailBase : (s.done ? GY.ink2 : .clear))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: i == curSetIdx ? 10 : 8)
                                    .overlay(!s.done && i != curSetIdx
                                             ? RoundedRectangle(cornerRadius: 4).strokeBorder(GY.line, lineWidth: 1.5) : nil)
                                Text(i == curSetIdx ? "\(i + 1)세트"
                                     : (s.done && (s.reps ?? 0) > 0 ? "\(Int((s.weight ?? 0).rounded()))·\(s.reps ?? 0)" : "·"))
                                    .font(.mono(10, i == curSetIdx ? 700 : 500))
                                    .foregroundStyle(i == curSetIdx ? GY.crailDeep : GY.ink4)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .padding(.top, 20)
                    HStack {
                        Text("SET \(curSetIdx + 1) / \(curSets.count)")
                            .font(.mono(13, 600)).foregroundStyle(GY.ink2)
                        Spacer()
                        (Text("누적 ").font(.mono(13, 500)).foregroundStyle(GY.ink4)
                         + Text(Self.volF.string(from: NSNumber(value: totalVol)) ?? "0")
                            .font(.mono(13, 600)).foregroundStyle(GY.crailDeep)
                         + Text("kg").font(.mono(13, 500)).foregroundStyle(GY.ink4))
                    }
                    .padding(.top, 16)
                    .overlay(alignment: .top) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
                    .padding(.top, 22)
                }
                .padding(.init(top: 24, leading: 24, bottom: 22, trailing: 24))
                .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rXl))
                .overlay(RoundedRectangle(cornerRadius: GY.rXl).strokeBorder(GY.crailBase, lineWidth: 1.5))
                .shadow(color: Color(hex: 0x14120E).opacity(0.14), radius: 18, y: 10)
            }
            .buttonStyle(.plain).accessibilityIdentifier("home-resume")
            .padding(.horizontal, 22)
            Spacer()
        }
    }

    static let volF: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()
    // 경과 mm:ss (home.js padStart 정합 — "18:42", "05:03").
    static func fmtResume(_ startMillis: Int64?, now: Date) -> String {
        guard let st = startMillis, st > 0 else { return "00:00" }
        let total = max(0, Int(Int64(now.timeIntervalSince1970 * 1000) - st) / 1000)
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

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

    // 주간 캘린더 — 날짜 탭 → 해당 날짜 상세 바텀시트 (spec §5-2).
    func weekCalendar(_ week: [GymAppModel.HomeWeekCell], tappable: Bool = true) -> some View {
        let ref = model.referenceToday
        let cal = GymAppModel.kst
        let monday = cal.date(from: cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: ref))
        return HStack(spacing: 0) {
            ForEach(Array(week.enumerated()), id: \.element.id) { i, d in
                VStack(spacing: 6) {
                    Text(d.label).font(.sans(11, 600)).tracking(0.44)
                        .foregroundStyle(d.isToday ? GY.crailDeep : GY.ink4)
                    ZStack {
                        Circle().fill(d.isToday ? GY.crailBase : .clear).frame(width: 28, height: 28)
                        if d.isLast && !d.isToday { Circle().strokeBorder(GY.crailSoft, lineWidth: 1.5).frame(width: 28, height: 28) }
                        Text("\(d.num)").font(.mono(14, 500))
                            .foregroundStyle(d.isToday ? .white : (d.worked ? GY.ink2 : GY.ink4))
                        if d.worked {
                            Circle().fill(d.isToday ? Color.white : GY.crailBase)
                                .frame(width: 4, height: 4).offset(y: 13)
                        }
                    }.frame(height: 28)
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
                .onTapGesture {
                    guard tappable, let monday,
                          let date = cal.date(byAdding: .day, value: i, to: monday) else { return }
                    detailISO = GymAppModel.dayFmt.string(from: date)
                }
            }
        }
    }

    static let weekdayKor = ["", "일", "월", "화", "수", "목", "금", "토"]   // Calendar.weekday 1=일
    // 직전 운동 행 — 부위(맨몸 제외) · 요일 · N일 전 (home.js applyLastWorkoutToDom 정합).
    func lastWorkoutRow(_ last: GymSession?, ref: Date) -> some View {
        let tags = last?.tags ?? []
        let nonCardio = tags.filter { $0 != "cardio" }
        let parts = (nonCardio.isEmpty ? tags : nonCardio)
            .map { GymExercises.partName($0) }.joined(separator: " · ")
        let ago: String = {
            guard let last else { return "기록 없음" }
            let d = model.daysAgo(last.date, from: ref)
            let since = d <= 0 ? "오늘" : "\(d)일 전"
            let wd: String = {
                guard let date = GymAppModel.dayFmt.date(from: last.date) else { return "" }
                let i = GymAppModel.kst.component(.weekday, from: date)
                return "\(Self.weekdayKor[i])요일"
            }()
            return [wd, since].filter { !$0.isEmpty }.joined(separator: " · ")
        }()
        return HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 9).fill(GY.sunken).frame(width: 30, height: 30)
                .overlay(Image(systemName: "dumbbell.fill").font(.system(size: 12)).foregroundStyle(GY.ink3))
            Text("직전 운동").font(.sans(12, 600)).tracking(0.24).foregroundStyle(GY.ink4)
            Text(parts.isEmpty ? "—" : parts).font(.sans(15, 700)).foregroundStyle(GY.ink1).lineLimit(1)
            Spacer()
            Text(ago).font(.sans(12.5, 500)).foregroundStyle(GY.ink4)
        }
        .padding(.horizontal, 24).padding(.top, 18)
    }

    func balance(_ bal: GymHomeLogic.WeeklyBalance) -> some View {
        let parts = bal.parts
        let totalThis = parts.map(\.sets).reduce(0, +)
        let totalLast = parts.map(\.prevSets).reduce(0, +)
        let diff = totalThis - totalLast
        let focusPid = bal.focusKey
        let maxSets = bal.max

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("부위 밸런스").font(.sans(14, 700)).tracking(-0.14).foregroundStyle(GY.ink1)
                Spacer()
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 2.5).fill(Color(oklch: 0.91, 0.012, 65)).frame(width: 9, height: 9)
                    Text("지난주").font(.mono(11, 500)).foregroundStyle(GY.ink4)
                    RoundedRectangle(cornerRadius: 2.5).fill(Color(oklch: 0.26, 0.01, 60)).frame(width: 9, height: 9).padding(.leading, 4)
                    Text("이번 주").font(.mono(11, 500)).foregroundStyle(GY.ink4)
                }
            }
            HStack(alignment: .bottom, spacing: 9) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(totalThis)").font(.mono(33, 700)).tracking(-1.15).foregroundStyle(GY.ink1)
                    Text("세트").font(.sans(12.5, 600)).foregroundStyle(GY.ink4)
                }
                if diff != 0 {
                    balChip(diff > 0 ? "▲ +\(diff)" : "▼ \(diff)",
                            tint: Color(oklch: 0.94, 0.03, 150), border: Color(oklch: 0.84, 0.05, 150), fg: Color(oklch: 0.42, 0.08, 150))
                }
                Spacer()
                if let focusPid {
                    balChip("● \(GymExercises.partName(focusPid))",
                            tint: GY.crailTint, border: GY.crailSoft, fg: GY.crailDeep)
                }
            }
            .padding(.top, 14)
            // 페어 컬럼 — 최대세트 기준 스케일(최대 56px), 최소 3px.
            HStack(alignment: .bottom, spacing: 0) {
                ForEach(parts, id: \.key) { p in
                    let focus = p.key == focusPid
                    VStack(spacing: 7) {
                        Text("\(p.sets)").font(.mono(14, 700)).foregroundStyle(focus ? GY.crailDeep : GY.ink1)
                        HStack(alignment: .bottom, spacing: 3) {
                            RoundedRectangle(cornerRadius: 4).fill(Color(oklch: 0.91, 0.012, 65))
                                .frame(width: 12, height: barH(p.prevSets, maxSets))
                            UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4.5, topTrailing: 4.5))
                                .fill(focus ? GY.crailBase : Color(oklch: 0.26, 0.01, 60))
                                .frame(width: 15, height: barH(p.sets, maxSets))
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 18)
            HStack(spacing: 0) {
                ForEach(parts, id: \.key) { p in
                    Text(p.name).font(.sans(12.5, p.key == focusPid ? 700 : 600)).tracking(-0.13)
                        .foregroundStyle(p.key == focusPid ? GY.crailDeep : GY.ink2)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 8)
            .overlay(alignment: .top) { Rectangle().fill(Color(oklch: 0.88, 0.008, 60)).frame(height: 1.5) }
            // 유산소 별도 행 (home.js homeCardioRow — 이번 주 분·회 + 지난주 대비)
            if bal.cardioCount > 0 {
                HStack(spacing: 8) {
                    Image(systemName: "waveform.path.ecg").font(.system(size: 13)).foregroundStyle(GY.ink3)
                    Text("유산소").font(.sans(13, 600)).foregroundStyle(GY.ink2)
                    Text(bal.cardioMin > 0 ? "\(bal.cardioMin)분 · \(bal.cardioCount)회" : "\(bal.cardioCount)회")
                        .font(.mono(12.5, 500)).foregroundStyle(GY.ink3)
                    if bal.cardioDeltaMin != 0 {
                        Text("\(bal.cardioDeltaMin > 0 ? "▲" : "▼")\(abs(bal.cardioDeltaMin))분")
                            .font(.sans(11.5, 600)).foregroundStyle(GY.ink4)
                    }
                    Spacer()
                }
                .padding(.top, 12)
            }
        }
        .frame(maxHeight: .infinity)
        .padding(.horizontal, 26).padding(.top, 22)
    }

    // 세트수 → 막대 높이 (최대 56px 스케일, 0=3px).
    func barH(_ sets: Int, _ maxSets: Int) -> CGFloat {
        sets <= 0 ? 3 : CGFloat((Double(sets) / Double(maxSets) * 56).rounded())
    }

    func balChip(_ text: String, tint: Color, border: Color, fg: Color) -> some View {
        Text(text).font(.mono(11.5, 700)).foregroundStyle(fg)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(tint, in: Capsule())
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))
            .padding(.bottom, 2)
    }

    // "직전 73.4kg · ▼0.3" (home.js applyWeightCardToDom 정합 — 증감은 보조 톤).
    func weightRow(_ latest: GymWeight?, prev: GymWeight? = nil) -> some View {
        let deltaText: String = {
            guard let latest, let prev else { return "" }
            let d = ((latest.kg - prev.kg) * 10).rounded() / 10
            guard d != 0 else { return "" }
            return " · \(d < 0 ? "▼" : "▲")\(Self.wf.string(from: NSNumber(value: abs(d))) ?? "\(abs(d))")"
        }()
        return HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("오늘 체중").font(.sans(14, 600)).foregroundStyle(GY.ink1)
                (Text(latest.map { "직전 \(Self.wf.string(from: NSNumber(value: $0.kg)) ?? "\($0.kg)")kg" } ?? "오늘 첫 기록")
                    .font(.sans(12, 500)).foregroundStyle(GY.ink4)
                 + Text(deltaText).font(.sans(12, 500)).foregroundStyle(GY.ink3))
            }
            Spacer()
            Button {
                let pre = model.weights.first?.kg
                weightKeypad = KeypadContext(field: .weight,
                                             buffer: pre.map { Self.wf.string(from: NSNumber(value: $0)) ?? "\($0)" } ?? "",
                                             fresh: pre != nil, pairHidesWeight: false)
            } label: {
                Text("기록하기").font(.sans(13, 600)).foregroundStyle(GY.crailDeep)
                    .padding(.horizontal, 17).padding(.vertical, 10)
                    .background(GY.crailTint, in: Capsule())
                    .overlay(Capsule().strokeBorder(GY.crailSoft, lineWidth: 1))
            }.buttonStyle(.plain).accessibilityIdentifier("home-weight-input")
        }
        .padding(.horizontal, 18).padding(.vertical, 14)
        .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
        .shadow(color: Color(hex: 0x14120E).opacity(0.10), radius: 12, y: 6)
    }
    static let wf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 1; return f }()

    // CTA — 이력 없으면 "첫 운동 시작" (home.js applyStreakToDom 정합).
    func cta(empty: Bool) -> some View {
        Button(action: onStart) {
            Text(empty ? "첫 운동 시작" : "운동 시작").font(.sans(16, 600)).foregroundStyle(Color(hex: 0xFBF8F2))
                .frame(maxWidth: .infinity).frame(height: 56)
                .background(GY.ink1, in: RoundedRectangle(cornerRadius: GY.rLg))
        }
        .buttonStyle(.plain).accessibilityIdentifier("home-cta")
        .padding(.horizontal, 24).padding(.top, 14).padding(.bottom, 24)
    }
}

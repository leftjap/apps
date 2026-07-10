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
                .padding(.horizontal, 24).padding(.top, 18)   // 시안 #6a — 밸런스와 체중 카드 사이 18px
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
                    // 세트 세그먼트 (mock #cardResumeSeg — done ink bar / now crail 굵게 + segGlow)
                    HStack(spacing: 6) {
                        ForEach(Array(curSets.enumerated()), id: \.offset) { i, s in
                            VStack(spacing: 7) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(i == curSetIdx ? GY.crailBase : (s.done ? GY.ink2 : .clear))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: i == curSetIdx ? 10 : 8)
                                    .overlay(!s.done && i != curSetIdx
                                             ? RoundedRectangle(cornerRadius: 4).strokeBorder(GY.line, lineWidth: 1.5) : nil)
                                    .segGlowIf(i == curSetIdx, cornerRadius: 4, alpha: 0.18)
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
                .breathGlow(cornerRadius: GY.rXl)   // mock #cardResume breath (2.8s crail 링)
                .shadow(color: Color(hex: 0x14120E).opacity(0.14), radius: 18, y: 10)
            }
            .buttonStyle(.plain).accessibilityIdentifier("home-resume")
            .padding(.horizontal, 22)
            // "다음" 미리보기 — home.js applyNextBlocksToDom (현재 이후 미완료 2개, 없으면 숨김)
            let nexts = GymHomeLogic.nextBlockPreviews(session: session, custom: model.custom)
            if !nexts.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("다음").font(.sans(12, 600)).tracking(0.24).foregroundStyle(GY.ink4)
                    ForEach(Array(nexts.enumerated()), id: \.offset) { _, n in
                        HStack(alignment: .firstTextBaseline) {
                            Text(n.name).font(.sans(15, 500)).foregroundStyle(GY.ink1).lineLimit(1)
                            Spacer(minLength: 12)
                            Text(n.summary).font(.mono(14, 500)).foregroundStyle(GY.ink4)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 46).padding(.top, 20)
                .accessibilityIdentifier("home-next-blocks")
            }
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
                            // 시안 #6a 실측 — 도트 중심이 28px 원 중심에서 19px 아래 (원 밖).
                            Circle().fill(d.isToday ? Color.white : GY.crailBase)
                                .frame(width: 4, height: 4).offset(y: 19)
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
                .overlay(BarbellGlyph().stroke(GY.ink3, style: BarbellGlyph.stroke(17))
                    .frame(width: 17, height: 17))
            Text("직전 운동").font(.sans(12, 600)).tracking(0.24).foregroundStyle(GY.ink4)
            Text(parts.isEmpty ? "—" : parts).font(.sans(15, 700)).foregroundStyle(GY.ink1).lineLimit(1)
            Spacer()
            Text(ago).font(.sans(12.5, 500)).foregroundStyle(GY.ink4)
        }
        .padding(.horizontal, 24).padding(.top, 18)
    }

    // 부위 밸런스 — 작업지시서 §4.1/§4.2 정본 (home.js applyBalanceToDom 1:1).
    // 스케일 7px/세트(최고막대 100px 캡), 개선칩(▲, delta>0만), 최소부위 칩 "이름 ±N"+도트 펄스+글로우,
    // 진입 모션: 잉크바 웨이브(520ms·60ms 스태거) + 카운트업(620ms)+착지팝 + 칩 팝인(380ms @180/280ms).
    func balance(_ bal: GymHomeLogic.WeeklyBalance) -> some View {
        let parts = bal.parts
        let totalThis = parts.map(\.sets).reduce(0, +)
        let totalLast = parts.map(\.prevSets).reduce(0, +)
        let delta = totalThis - totalLast
        let focusPid = bal.focusKey
        // 7px/세트, 최고 막대 100px 캡 (사용자 2026-07-07 겹침 버그 수정 정합)
        let maxVal = max(1, parts.map { max($0.sets, $0.prevSets) }.max() ?? 1)
        let pxPerSet = min(7.0, 100.0 / Double(maxVal))
        let focus = parts.first { $0.key == focusPid }

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
                    // 헤드라인 카운트업 prevTotal→thisTotal + 착지 팝 (§4.2, animNumHome 620ms 정합)
                    BalanceHeadline(from: totalLast, to: totalThis)
                    Text("세트").font(.sans(12.5, 600)).foregroundStyle(GY.ink4)
                }
                if delta > 0 {   // 개선 칩 — delta>0 만 (정본: 감소 칩 없음)
                    balChip("▲ \(delta)",
                            tint: Color(oklch: 0.94, 0.03, 150), border: Color(oklch: 0.84, 0.05, 150),
                            fg: Color(oklch: 0.42, 0.08, 150), popDelay: 0.18)
                }
                Spacer()
                if let focus {   // 최소 부위 칩 "코어 -3" — 도트 펄스 + 글로우 (§4.1)
                    let fd = focus.sets - focus.prevSets
                    focusBalChip(name: focus.name, fdText: fd > 0 ? "+\(fd)" : "\(fd)")
                }
            }
            .padding(.top, 14)
            // .bal-chart — flex:1 + justify-content:center: 차트만 남는 공간 중앙에 (시안 #6a 실측).
            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: 0)
                // 페어 컬럼 — [지난주 고스트 12px(prev>0만)] + [이번주 잉크 15px], 웨이브 진입 (§4.1·§4.2)
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(Array(parts.enumerated()), id: \.element.key) { i, p in
                        let isFocus = p.key == focusPid
                        VStack(spacing: 7) {
                            Text("\(p.sets)").font(.mono(14, 700)).foregroundStyle(isFocus ? GY.crailDeep : GY.ink1)
                            HStack(alignment: .bottom, spacing: 3) {
                                if p.prevSets > 0 {
                                    UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4, topTrailing: 4))
                                        .fill(Color(oklch: 0.91, 0.012, 65))
                                        .frame(width: 12, height: CGFloat((Double(p.prevSets) * pxPerSet).rounded()))
                                }
                                BalanceInkBar(height: CGFloat((Double(p.sets) * pxPerSet).rounded()),
                                              isFocus: isFocus, index: i)
                            }
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                HStack(spacing: 0) {
                    ForEach(parts, id: \.key) { p in
                        Text(p.name).font(.sans(12.5, p.key == focusPid ? 700 : 600)).tracking(-0.13)
                            .foregroundStyle(p.key == focusPid ? GY.crailDeep : GY.ink2)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.top, 8)
                .overlay(alignment: .top) { Rectangle().fill(Color(oklch: 0.88, 0.008, 60)).frame(height: 1.5) }
                Spacer(minLength: 0)
            }
            .frame(maxHeight: .infinity)
            cardioRow(bal)
        }
        .frame(maxHeight: .infinity)
        .padding(.horizontal, 26).padding(.top, 22)
    }

    // 유산소 행 — mocks/home.html .cardio-row + 시안 #6a 실측 (행은 항상 표시, 0회 시 "기록 없음").
    // 상단 line-soft 구분선(margin-top 10 → padding-top 14), 아이콘 26px sunken 배지, 수치는 우측 정렬.
    func cardioRow(_ bal: GymHomeLogic.WeeklyBalance) -> some View {
        let delta = GymHomeLogic.cardioDeltaText(count: bal.cardioCount, deltaMin: bal.cardioDeltaMin)
        return HStack(spacing: 11) {
            RoundedRectangle(cornerRadius: 8).fill(GY.sunken).frame(width: 26, height: 26)
                .overlay(EcgGlyph().stroke(GY.ink4, style: EcgGlyph.stroke(16)).frame(width: 16, height: 16))
            Text("유산소").font(.sans(13.5, 600)).foregroundStyle(GY.ink2)
            Spacer(minLength: 11)
            Text(GymHomeLogic.cardioSubText(min: bal.cardioMin, count: bal.cardioCount))
                .font(.mono(12, 500)).foregroundStyle(GY.ink4)
            if let delta {
                // 시안 #6a: 개선(▲)은 sage-deep. 감소(▼)는 시안에 없어 PWA(.dl = ink-3) 를 따름.
                Text(delta).font(.mono(12, 600))
                    .foregroundStyle(delta.hasPrefix("▲") ? GY.sageDeep : GY.ink3)
                    .padding(.leading, 10)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 14)
        .overlay(alignment: .top) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
        .padding(.top, 10)
        .accessibilityIdentifier("home-cardio-row")
    }

    // 밸런스 칩 — gPopIn(380ms 오버슈트, §4.2 순차 팝인)
    func balChip(_ text: String, tint: Color, border: Color, fg: Color, popDelay: Double) -> some View {
        Text(text).font(.mono(11.5, 700)).foregroundStyle(fg)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(tint, in: Capsule())
            .overlay(Capsule().strokeBorder(border, lineWidth: 1))
            .padding(.bottom, 2)
            .modifier(BalChipPopIn(delay: popDelay))
    }

    // 최소 부위 칩 — 도트 펄스(pulse 1.8s) + 칩 글로우(gChipGlow) + 팝인 280ms (§4.1)
    func focusBalChip(name: String, fdText: String) -> some View {
        HStack(spacing: 5) {
            BalanceDot()
            Text("\(name) \(fdText)").font(.mono(11.5, 700)).foregroundStyle(GY.crailDeep)
        }
        .padding(.horizontal, 9).padding(.vertical, 4)
        .background(GY.crailTint, in: Capsule())
        .overlay(Capsule().strokeBorder(GY.crailSoft, lineWidth: 1))
        .modifier(PulseGlow(color: GY.crailBase, maxAlpha: 0.16, spread: 6, cornerRadius: 999))   // gChipGlow
        .padding(.bottom, 2)
        .modifier(BalChipPopIn(delay: 0.28))
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

// MARK: - 시안 SVG 글리프 (viewBox 20×20 좌표 그대로, stroke-width 1.6)

// 유산소 아이콘 — "M2 10h3l1.5-4.5 2.8 9 1.7-4.5H18" (시안 #6a · mocks/home.html cardioIcon).
struct EcgGlyph: Shape {
    static func stroke(_ size: CGFloat) -> StrokeStyle {
        StrokeStyle(lineWidth: 1.6 * size / 20, lineCap: .round, lineJoin: .round)
    }
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 20
        var p = Path()
        p.move(to: CGPoint(x: 2 * s, y: 10 * s))
        p.addLine(to: CGPoint(x: 5 * s, y: 10 * s))
        p.addLine(to: CGPoint(x: 6.5 * s, y: 5.5 * s))
        p.addLine(to: CGPoint(x: 9.3 * s, y: 14.5 * s))
        p.addLine(to: CGPoint(x: 11 * s, y: 10 * s))
        p.addLine(to: CGPoint(x: 18 * s, y: 10 * s))
        return p
    }
}

// 직전 운동 아이콘 — "M4 8v4M6.5 6.2v7.6M13.5 6.2v7.6M16 8v4M6.5 10h7" (시안 #6a 라인 바벨).
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

// MARK: - 부위 밸런스 진입 모션 컴포넌트 (작업지시서 §4.2 · §6 — 스냅샷·reduced-motion 은 정적 최종 상태)

// 헤드라인 카운트업(620ms ease-out-cubic, animNumHome 정합) + 착지 팝(scale 1.16, 420ms 오버슈트).
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
        CountUpVolumeText(value: shown, size: 33, tracking: -1.15)
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

// 이번주 잉크 막대 — 재질감 하이라이트 + 웨이브 성장(gGrow 520ms·60ms 스태거) + 최소부위 경고펄스(gCoreAlert 1.7s).
struct BalanceInkBar: View {
    let height: CGFloat
    let isFocus: Bool
    let index: Int
    @State private var grown = false
    @State private var alert = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4.5, topTrailing: 4.5))
            .fill(isFocus ? GY.crailBase : Color(oklch: 0.26, 0.01, 60))
            .overlay(alignment: .top) {   // inset 0 1px 0 rgba(255,255,255,.18/.25) 재질감
                UnevenRoundedRectangle(cornerRadii: .init(topLeading: 4.5, topTrailing: 4.5))
                    .fill(.white.opacity(isFocus ? 0.25 : 0.18))
                    .frame(height: 1)
            }
            .frame(width: 15, height: max(height, 0))
            .scaleEffect(y: grown ? (alert && isFocus ? 1.12 : 1) : 0.12, anchor: .bottom)
            .shadow(color: Color(oklch: 0.67, 0.12, 50).opacity(isFocus && alert ? 0.5 : 0),
                    radius: 7)   // gCoreAlert 글로우 근사 (0 0 14px 3px)
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion else { grown = true; return }
                if isFocus {
                    grown = true   // 최소부위는 grow 제외 — 상시 경고펄스 (#7a 정합)
                    withAnimation(.easeInOut(duration: 0.85).repeatForever(autoreverses: true)) { alert = true }
                } else {
                    withAnimation(.spring(response: 0.52, dampingFraction: 0.62)
                        .delay(Double(index) * 0.06)) { grown = true }   // gGrow 오버슈트 근사
                }
            }
    }
}

// 최소부위 칩 도트 — 5px crail, pulse 1.8s (opacity 1↔.35).
struct BalanceDot: View {
    @State private var dim = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Circle().fill(GY.crailBase).frame(width: 5, height: 5)
            .opacity(dim ? 0.35 : 1)
            .onAppear {
                guard !GymSnapshot.isActive, !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { dim = true }
            }
    }
}

// 칩 팝인 — gPopIn 380ms cubic-bezier(.2,.8,.3,1.2), 순차 지연 (§4.2).
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

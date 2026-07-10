import SwiftUI
import GymCore

// 관리 화면 — mocks/admin.html 이식. 3탭(운동/체중/프로필) GymAppModel 실데이터 구동.
public struct AdminScreenView: View {
    public enum Tab: String { case ex, weight, profile }
    @ObservedObject var model: GymAppModel
    @State private var tab: Tab
    @State private var activePart = "chest"
    @State private var addFormOpen = false          // 커스텀 운동 추가 인라인 폼 (§10-1)
    @State private var newExName = ""
    @State private var deleteTarget: GymExerciseDef? = nil   // 꾹누르기 삭제 확인
    @State private var dragIndex: Int? = nil                 // 그립 드래그 정렬
    @State private var dragOffset: CGFloat = 0
    @State private var weightKeypad: KeypadContext? = nil    // 오늘 체중 입력 (§10-2)
    @State private var weightPRPop = false                   // 최저 신기록 팝
    var embedScroll: Bool
    var onHome: () -> Void
    var onStats: () -> Void
    var onLogin: () -> Void
    var onLogout: () -> Void

    public init(model: GymAppModel, initialTab: Tab = .ex, embedScroll: Bool = true,
                onHome: @escaping () -> Void = {}, onStats: @escaping () -> Void = {},
                onLogin: @escaping () -> Void = {}, onLogout: @escaping () -> Void = {}) {
        self.model = model; _tab = State(initialValue: initialTab); self.embedScroll = embedScroll
        self.onHome = onHome; self.onStats = onStats; self.onLogin = onLogin; self.onLogout = onLogout
    }

    var cloud: CloudStore { model.cloud }

    public var body: some View {
        VStack(spacing: 0) {
            header
            tabBar
            if embedScroll { ScrollView { paneContent } } else { paneContent }
        }
        .frame(width: 390).frame(maxHeight: .infinity, alignment: .top).background(GY.shell)
        // 꾹누르기 삭제 확인 (§10-1 — 커스텀 행 삭제 / 빌트인 영구 제거)
        .overlay {
            if let target = deleteTarget {
                ZStack(alignment: .bottom) {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle()).onTapGesture { deleteTarget = nil }
                    GymActionSheet(title: target.name,
                                   items: [.init(id: "delete", label: "삭제", danger: true)],
                                   onSelect: { id in
                                       if id == "delete" { model.deleteExercise(target.id) }
                                       deleteTarget = nil
                                   },
                                   onCancel: { deleteTarget = nil })
                }
            }
        }
        // 오늘 체중 입력 키패드 (§10-2, mock #weightKeypadSheet — 세그·quick 없음, 저장 버튼)
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
                                onDone: { saveWeightFromKeypad() })
                }
            }
        }
        // 체중 최저 신기록 팝 (§10-2 — §6-11 과 동일 방식)
        .overlay(alignment: .top) {
            if weightPRPop {
                Text("PR").font(.mono(22, 600)).tracking(0.88).foregroundStyle(GY.crailDeep)
                    .padding(.top, 218).allowsHitTesting(false)
                    .accessibilityIdentifier("weight-pr-pop")
            }
        }
    }

    func saveWeightFromKeypad() {
        defer { weightKeypad = nil }
        guard let kp = weightKeypad, let v = Double(kp.buffer), v > 0 else { return }
        let isPR = model.saveWeight((v * 10).rounded() / 10)
        if isPR {
            weightPRPop = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { weightPRPop = false }
        }
    }

    @ViewBuilder var paneContent: some View {
        switch tab {
        case .ex: exPane
        case .weight: weightPane
        case .profile: profilePane
        }
    }

    var header: some View {
        HStack {
            Text("관리").font(.sans(24, 700)).tracking(-0.48).foregroundStyle(GY.ink1)
            Spacer()
            HStack(spacing: 4) {
                Button(action: onHome) { navChip("홈") }.buttonStyle(.plain).accessibilityIdentifier("admin-home")
                Button(action: onStats) { navChip("통계") }.buttonStyle(.plain)
            }
        }.padding(.horizontal, 24).padding(.top, 8)
    }
    func navChip(_ t: String) -> some View {
        Text(t).font(.sans(14, 500)).foregroundStyle(GY.ink3).padding(.horizontal, 12).padding(.vertical, 8)
    }

    var tabBar: some View {
        HStack(spacing: 22) {
            tabItem("운동", .ex); tabItem("체중", .weight); tabItem("프로필", .profile); Spacer()
        }
        .padding(.horizontal, 24).padding(.top, 8)
        .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
    }
    func tabItem(_ label: String, _ t: Tab) -> some View {
        let on = tab == t
        return Button { tab = t } label: {
            Text(label).font(.sans(15, on ? 600 : 500)).foregroundStyle(on ? GY.ink1 : GY.ink4)
                .padding(.top, 8).padding(.bottom, 12)
                .overlay(alignment: .bottom) { if on { Rectangle().fill(GY.crailBase).frame(height: 2).cornerRadius(1) } }
        }.buttonStyle(.plain).accessibilityIdentifier("admin-tab-\(label)")
    }

    // MARK: - 운동 탭 (부위 칩 + 카탈로그 행 + 숨김 토글)
    static let wf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 1; return f }()
    func detail(_ ex: GymExerciseDef) -> String {
        if ex.equipment == "cardio" { return "유산소" }
        if ex.equipment == "bodyweight" { return "자체 × \(ex.defaultReps)" }
        let w = Self.wf.string(from: NSNumber(value: ex.defaultWeight)) ?? "\(ex.defaultWeight)"
        return "\(w)kg × \(ex.defaultReps)"
    }
    static let exRowH: CGFloat = 69   // 드래그 정렬 스텝 (행 높이 근사)
    var exPane: some View {
        let rows = model.exercisesForPart(activePart)
        return VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(GymExercises.partOrder, id: \.self) { p in partChip(p) }
                }.padding(.horizontal, 20)
            }.padding(.top, 14)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, ex in
                    let shown = !model.isHidden(ex.id)
                    HStack(spacing: 12) {
                        // 그립 — 잡는 즉시 드래그 정렬, 놓으면 순서 영속 (§10-1)
                        Image(systemName: "line.3.horizontal").font(.system(size: 14)).foregroundStyle(GY.ink4).frame(width: 24, height: 36)
                            .contentShape(Rectangle())
                            .gesture(DragGesture()
                                .onChanged { v in dragIndex = i; dragOffset = v.translation.height }
                                .onEnded { v in
                                    let delta = Int((v.translation.height / Self.exRowH).rounded())
                                    let to = min(max(0, i + delta), rows.count - 1)
                                    if to != i {
                                        var ids = rows.map(\.id)
                                        let id = ids.remove(at: i); ids.insert(id, at: to)
                                        model.setExerciseOrder(part: activePart, ids: ids)
                                    }
                                    dragIndex = nil; dragOffset = 0
                                })
                        Text(ex.name).font(.sans(16, 500)).foregroundStyle(shown ? GY.ink1 : GY.ink4).lineLimit(1)
                        Spacer()
                        Text(detail(ex)).font(.mono(13, 500)).foregroundStyle(GY.ink4)
                        Button { model.toggleHidden(ex.id) } label: { ToggleSwitch(on: shown) }
                            .buttonStyle(.plain).accessibilityIdentifier("admin-toggle-\(ex.id)")
                    }
                    .padding(.vertical, 16).padding(.horizontal, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
                    .contentShape(Rectangle())
                    .onLongPressGesture(minimumDuration: 0.5) { deleteTarget = ex }   // §10-1 꾹누르기 삭제
                    .offset(y: dragIndex == i ? dragOffset : 0)
                    .zIndex(dragIndex == i ? 1 : 0)
                }
                // 커스텀 운동 추가 (mock custom-add-trigger — 대시 보더 버튼 → 인라인 폼)
                if addFormOpen {
                    HStack(spacing: 6) {
                        TextField("새 운동 이름", text: $newExName)
                            .textFieldStyle(.plain)
                            .font(.sans(16, 500)).foregroundStyle(GY.ink1)
                            .padding(.horizontal, 14).frame(height: 44)
                            .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rSm))
                            .overlay(RoundedRectangle(cornerRadius: GY.rSm).strokeBorder(GY.line, lineWidth: 1))
                        Button {
                            let name = newExName.trimmingCharacters(in: .whitespaces)
                            guard !name.isEmpty else { return }
                            model.createCustomExercise(name: name, part: activePart)
                            newExName = ""; addFormOpen = false
                        } label: {
                            Text("저장").font(.sans(15, 600)).foregroundStyle(Color(hex: 0xFBF8F2))
                                .padding(.horizontal, 16).frame(height: 44)
                                .background(GY.ink1, in: RoundedRectangle(cornerRadius: GY.rSm))
                        }.buttonStyle(.plain).accessibilityIdentifier("admin-custom-save")
                        Button { addFormOpen = false; newExName = "" } label: {
                            Text("취소").font(.sans(15, 500)).foregroundStyle(GY.ink3)
                                .padding(.horizontal, 14).frame(height: 44)
                        }.buttonStyle(.plain)
                    }
                    .padding(.vertical, 8)
                } else {
                    Button { addFormOpen = true } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "plus").font(.system(size: 14, weight: .medium)).foregroundStyle(GY.crailBase)
                            Text("커스텀 운동 추가").font(.sans(15, 600)).foregroundStyle(GY.ink3)
                        }
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .overlay(RoundedRectangle(cornerRadius: GY.rMd)
                            .strokeBorder(GY.line, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
                    }.buttonStyle(.plain).accessibilityIdentifier("admin-custom-add")
                    .padding(.top, 12)
                }
            }.padding(.horizontal, 16).padding(.top, 6)
        }
    }
    func partChip(_ p: String) -> some View {
        let on = activePart == p
        return Button { activePart = p } label: {
            Text(GymExercises.partName(p)).font(.sans(14, on ? 600 : 500)).foregroundStyle(on ? GY.ink1 : GY.ink3)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(on ? GY.crailSoft : GY.card, in: Capsule())
                .overlay(Capsule().strokeBorder(on ? GY.crailBase : GY.line, lineWidth: 1))
        }.buttonStyle(.plain)
    }

    // MARK: - 체중 탭 (실 기록)
    static let md: DateFormatter = { let f = DateFormatter(); f.dateFormat = "M월 d일"; f.locale = Locale(identifier: "ko_KR"); f.timeZone = TimeZone(identifier: "Asia/Seoul"); return f }()
    func mdLabel(_ dayStr: String) -> String {
        guard let d = GymAppModel.dayFmt.date(from: dayStr) else { return dayStr }
        return Self.md.string(from: d)
    }
    func fmtKg(_ v: Double) -> String { Self.wf.string(from: NSNumber(value: v)) ?? "\(v)" }
    var weightPane: some View {
        let entries = model.weightEntries()          // date desc
        let latest = entries.first?.w
        let start = entries.last?.w
        let minKg = entries.map(\.w.kg).min()
        let goal = model.settings.goalWeight
        let todayStr = GymAppModel.dayFmt.string(from: model.referenceToday)

        return VStack(spacing: 0) {
            // 히어로 — 현재 체중 + 시작 대비 증감 + 목표 메타 (mock weight-hero)
            HStack(alignment: .bottom, spacing: 14) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("현재 체중").font(.sans(12, 500)).foregroundStyle(GY.ink3)
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Text(latest.map { fmtKg($0.kg) } ?? "—")
                            .font(.mono(58, 500)).tracking(-2.3).foregroundStyle(GY.ink1)
                            .accessibilityIdentifier("weight-hero-num")
                        Text("kg").font(.mono(16, 500)).foregroundStyle(GY.ink4)
                        if let latest, let start, latest.kg != start.kg {
                            let d = ((latest.kg - start.kg) * 10).rounded() / 10
                            Text("\(d < 0 ? "↓" : "↑") \(fmtKg(d))")
                                .font(.mono(13, 600)).foregroundStyle(d < 0 ? GY.crailDeep : GY.ink4)
                        }
                    }.padding(.top, 6)
                    // 목표 메타 — "목표 69 · −3.4kg 남음 · 약 N주" (weights.js hero meta)
                    Group {
                        if let latest {
                            let remaining = GymWeightLogic.remainingLoss(current: latest.kg, goal: goal)
                            let weeks = GymWeightLogic.estimateGoalDate(current: latest.kg, goal: goal)
                                .flatMap { GymWeightLogic.weeksUntil($0) }
                            let weeksText = (remaining > 0 ? weeks.flatMap { $0 > 0 ? " · 약 \($0)주" : nil } : nil) ?? ""
                            (Text("목표 ").font(.sans(12, 500)).foregroundStyle(GY.ink4)
                             + Text(fmtKg(goal)).font(.mono(12, 600)).foregroundStyle(GY.crailDeep)
                             + Text(remaining > 0 ? " · −\(fmtKg(remaining))kg 남음" : " · 목표 달성")
                                .font(.sans(12, 600)).foregroundStyle(GY.ink2)
                             + Text(weeksText).font(.sans(12, 500)).foregroundStyle(GY.ink4))
                        } else {
                            Text("목표 \(fmtKg(goal))kg · 첫 입력을 기다립니다")
                                .font(.sans(12, 500)).foregroundStyle(GY.ink4)
                        }
                    }.padding(.top, 9)
                }
                .fixedSize()
                // 추이 차트 — 체중 라인(crail) + 목표선(점선), 최근 30건 (weights.js projectChart)
                VStack(spacing: 4) {
                    weightChart(entries: entries.map(\.w).reversed(), goal: goal)
                        .frame(height: 76)
                    HStack {
                        Text("14일 전").font(.mono(9, 500)).foregroundStyle(GY.ink4)
                        Spacer()
                        Text("오늘").font(.mono(9, 500)).foregroundStyle(GY.ink4)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .padding(.init(top: 22, leading: 26, bottom: 0, trailing: 26))
            // 입력 기록 헤더
            HStack {
                Text("입력 기록").font(.sans(12, 600)).tracking(0.24).foregroundStyle(GY.ink2)
                Spacer()
                Text("최근 14일").font(.sans(12, 500)).foregroundStyle(GY.ink4)
            }
            .padding(.horizontal, 26).padding(.top, 22).padding(.bottom, 4)
            // 리스트 — 오늘 미입력 행 + 최근 10건 (최저 마크 + 증감 ▼crail/▲뉴트럴)
            VStack(spacing: 0) {
                if entries.isEmpty {
                    Text("아직 기록이 없습니다. 아래 버튼으로 입력하세요.")
                        .font(.sans(13, 400)).foregroundStyle(GY.ink4).padding(.vertical, 24)
                }
                if let first = entries.first, first.w.date != todayStr {
                    weightRowView(label: mdLabel(todayStr), today: true, valText: nil,
                                  isMin: false, delta: nil)
                }
                ForEach(Array(entries.prefix(10).enumerated()), id: \.offset) { _, e in
                    weightRowView(label: mdLabel(e.w.date), today: false,
                                  valText: fmtKg(e.w.kg),
                                  isMin: entries.count > 1 && e.w.kg == minKg,
                                  delta: e.delta)
                }
            }
            .padding(.horizontal, 26)
            // 통계 3열 — 시작/최저/7일 평균 (mock weight-stat-*)
            if let start {
                let last7 = entries.prefix(7).map(\.w.kg)
                let avg7 = last7.reduce(0, +) / Double(last7.count)
                HStack(spacing: 8) {
                    weightStat(fmtKg(start.kg), "시작", GY.ink1)
                    weightStat(minKg.map { fmtKg($0) } ?? "—", "최저", GY.crailDeep)
                    weightStat(fmtKg((avg7 * 10).rounded() / 10), "7일 평균", GY.ink1)
                }
                .padding(.horizontal, 26).padding(.top, 12)
                .overlay(alignment: .top) {
                    Rectangle().fill(GY.lineSoft).frame(height: 1).padding(.horizontal, 26)
                }
                .padding(.top, 12)
            }
            // 오늘 체중 입력 (mock weight-input-trigger)
            Button {
                let pre = latest?.kg
                weightKeypad = KeypadContext(field: .weight,
                                             buffer: pre.map { fmtKg($0) } ?? "",
                                             fresh: pre != nil, pairHidesWeight: false)
            } label: {
                Text("오늘 체중 입력").font(.sans(15, 600)).foregroundStyle(Color(hex: 0xFBF8F2))
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(GY.ink1, in: RoundedRectangle(cornerRadius: GY.rMd))
                    .shadow(color: Color(hex: 0x14120E).opacity(0.5), radius: 10, y: 4)
            }
            .buttonStyle(.plain).accessibilityIdentifier("weight-input")
            .padding(.init(top: 14, leading: 26, bottom: 26, trailing: 26))
        }.padding(.top, 8)
    }

    func weightRowView(label: String, today: Bool, valText: String?, isMin: Bool, delta: Double?) -> some View {
        HStack(spacing: 8) {
            (Text(label).font(.sans(15, 500)).foregroundStyle(GY.ink1)
             + Text(today ? "  오늘" : "").font(.sans(11, 700)).foregroundStyle(GY.crailDeep))
            Spacer()
            if let delta {
                let mag = fmtKg(abs(delta))
                if abs(delta) < 0.05 {
                    Text("— 0.0").font(.mono(12, 500)).foregroundStyle(GY.ink4)
                } else if delta < 0 {
                    Text("▼ \(mag)").font(.mono(12, 600)).foregroundStyle(GY.crailDeep)   // 감소 = 목표 진척
                } else {
                    Text("▲ \(mag)").font(.mono(12, 500)).foregroundStyle(GY.ink4)
                }
            }
            if let valText {
                (Text(valText).font(.mono(16, 600)).foregroundStyle(GY.ink1)
                 + Text(" kg").font(.sans(12, 500)).foregroundStyle(GY.ink4)
                 + Text(isMin ? "  최저" : "").font(.sans(10, 700)).foregroundStyle(GY.crailDeep))
                    .padding(.leading, 8)
            } else {
                Text("미입력").font(.sans(14, 500)).foregroundStyle(GY.ink4)
            }
        }
        .padding(.vertical, 13)
        .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
    }

    func weightStat(_ val: String, _ label: String, _ tint: Color) -> some View {
        VStack(spacing: 4) {
            (Text(val).font(.mono(16, 600)).foregroundStyle(tint)
             + Text(" kg").font(.sans(12, 500)).foregroundStyle(GY.ink4))
            Text(label).font(.sans(12, 500)).foregroundStyle(GY.ink4)
        }.frame(maxWidth: .infinity)
    }

    // 추이 차트 — 체중 라인 + 목표 점선 (7일 이동평균선은 PWA 정합상 비표시 채널 유지).
    func weightChart(entries: [GymWeight], goal: Double) -> some View {
        GeometryReader { g in
            let rows = Array(entries.suffix(30))
            if rows.count >= 2 {
                let p = GymWeightLogic.chartPoints(weights: rows.map(\.kg), goal: goal,
                                                   width: g.size.width, height: g.size.height)
                ZStack {
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: p.goalY))
                        path.addLine(to: CGPoint(x: g.size.width, y: p.goalY))
                    }
                    .stroke(GY.ink4, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    Path { path in
                        guard let first = p.weightPts.first else { return }
                        path.move(to: first)
                        for pt in p.weightPts.dropFirst() { path.addLine(to: pt) }
                    }
                    .stroke(GY.crailBase, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
            } else {
                Rectangle().fill(.clear)
            }
        }
    }

    // MARK: - 프로필 탭 (실 설정 + 계정)
    var profilePane: some View {
        let s = model.settings
        return VStack(spacing: 0) {
            settingRow("계정", cloud.signedIn ? "로그인됨" : "로그인 안 됨")
            settingRow("데이터 동기화", cloud.signedIn ? "켜짐" : "꺼짐")
            settingRow("키", s.height.map { "\($0) cm" } ?? "미설정")
            settingRow("생년", s.birthYear.map { "\($0)" } ?? "미설정")
            settingRow("주간 목표", "\(s.weeklyGoal)회")
            settingRow("목표 체중", "\(Self.wf.string(from: NSNumber(value: s.goalWeight)) ?? "\(s.goalWeight)") kg")
            Button(action: cloud.signedIn ? onLogout : onLogin) {
                Text(cloud.signedIn ? "로그아웃" : "Google 로그인")
                    .font(.sans(15, 600)).foregroundStyle(cloud.signedIn ? GY.danger : GY.crailDeep)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(cloud.signedIn ? GY.card : GY.crailTint, in: RoundedRectangle(cornerRadius: GY.rMd))
                    .overlay(RoundedRectangle(cornerRadius: GY.rMd).strokeBorder(cloud.signedIn ? GY.line : GY.crailSoft, lineWidth: 1))
            }
            .buttonStyle(.plain).accessibilityIdentifier("profile-auth")
            .padding(.horizontal, 24).padding(.top, 18)
        }.padding(.top, 8)
    }
    func settingRow(_ k: String, _ v: String) -> some View {
        HStack {
            Text(k).font(.sans(15, 500)).foregroundStyle(GY.ink1)
            Spacer()
            Text(v).font(.sans(14, 400)).foregroundStyle(GY.ink4)
        }
        .padding(.vertical, 16).padding(.horizontal, 24)
        .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
    }
}

// 토글 스위치 — .ex-toggle (38×23, is-on=crail, 노브 translate)
struct ToggleSwitch: View {
    let on: Bool
    var body: some View {
        Capsule().fill(on ? GY.crailBase : GY.line)
            .frame(width: 38, height: 23)
            .overlay(alignment: on ? .trailing : .leading) {
                Circle().fill(.white).frame(width: 19, height: 19)
                    .shadow(color: Color(hex: 0x14120E).opacity(0.2), radius: 1.5, y: 1)
                    .padding(2)
            }
    }
}

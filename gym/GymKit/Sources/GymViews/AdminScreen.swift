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
    @State private var profileKeypad: KeypadContext? = nil   // 프로필 필드 편집 (§10-3)
    @State private var profileField: ProfileField? = nil
    var embedScroll: Bool
    var onHome: () -> Void
    var onStats: () -> Void
    var onLogin: () -> Void
    var onLogout: () -> Void

    public init(model: GymAppModel, initialTab: Tab = .ex, embedScroll: Bool = true,
                initialProfileField: String? = nil,
                onHome: @escaping () -> Void = {}, onStats: @escaping () -> Void = {},
                onLogin: @escaping () -> Void = {}, onLogout: @escaping () -> Void = {}) {
        self.model = model; _tab = State(initialValue: initialTab); self.embedScroll = embedScroll
        self.onHome = onHome; self.onStats = onStats; self.onLogin = onLogin; self.onLogout = onLogout
        if let f = initialProfileField.flatMap(ProfileField.init(rawValue:)) {   // 검증 훅 — 실 탭과 동일 prefill
            _profileField = State(initialValue: f)
            _profileKeypad = State(initialValue: Self.profileKeypadContext(f, settings: model.settings))
        }
    }

    var cloud: CloudStore { model.cloud }

    public var body: some View {
        VStack(spacing: 0) {
            header
            tabBar
            Group {
                if embedScroll { ScrollView { paneContent } } else { paneContent }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                if tab == .weight { weightHero }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if tab == .weight { weightInputButton }
            }
        }
        .frame(maxWidth: .infinity).frame(maxHeight: .infinity, alignment: .top).background(GY.shell)
        // 꾹누르기 삭제 확인 (§10-1 — 커스텀 행 삭제 / 빌트인 영구 제거)
        .overlay {
            ZStack(alignment: .bottom) {
                if let target = deleteTarget {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle()).onTapGesture { deleteTarget = nil }
                        .transition(.opacity)
                    GymActionSheet(title: target.name,
                                   items: [.init(id: "delete", label: "삭제", danger: true)],
                                   onSelect: { id in
                                       if id == "delete" { model.deleteExercise(target.id) }
                                       deleteTarget = nil
                                   },
                                   onCancel: { deleteTarget = nil })
                        .transition(.move(edge: .bottom))
                }
            }
            .animation(.easeOut(duration: 0.2), value: deleteTarget != nil)
        }
        // 오늘 체중 입력 키패드 (§10-2, mock #weightKeypadSheet — 세그·quick 없음, 저장 버튼)
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
                                onDone: { saveWeightFromKeypad() })
                        .transition(.move(edge: .bottom))
                }
            }
            .animation(.easeOut(duration: 0.2), value: weightKeypad != nil)
        }
        // 프로필 필드 편집 키패드 (§10-3 — bare + 필드 타이틀, 저장. 배경 탭 = 취소)
        .overlay {
            ZStack(alignment: .bottom) {
                if profileKeypad != nil {
                    Color(oklch: 0.22, 0.008, 60).opacity(0.42)
                        .contentShape(Rectangle())
                        .onTapGesture { profileKeypad = nil; profileField = nil }
                        .transition(.opacity)
                    KeypadSheet(ctx: profileKeypad!,
                                refValue: nil,
                                bare: true, title: profileField.map { Self.profileFieldLabel($0) },
                                doneLabel: "저장",
                                onKey: { k in if profileKeypad != nil { KeypadBuffer.apply(k, to: &profileKeypad!) } },
                                onQuick: { _ in }, onMode: { _ in },
                                onDone: { saveProfileKeypad() })
                        .transition(.move(edge: .bottom))
                }
            }
            .animation(.easeOut(duration: 0.2), value: profileKeypad != nil)
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
    /// 체중 표기 — 소수 1자리 고정. `wf` 는 74.0 을 "74" 로 떨궈 목록의 소수점 열이 어긋났다.
    /// `wf` 자체는 운동 기본중량("20kg")·키패드 prefill 이 함께 쓰므로 건드리지 않는다.
    static let wf1: NumberFormatter = {
        let f = NumberFormatter(); f.numberStyle = .decimal
        f.minimumFractionDigits = 1; f.maximumFractionDigits = 1
        return f
    }()
    func fmtKg1(_ v: Double) -> String { Self.wf1.string(from: NSNumber(value: v)) ?? "\(v)" }

    // 입력 기록 — 전체 이력. 헤더("전체 N건")와 통계 3열은 지웠다: 건수는 히어로 메타가,
    // 최저·시작은 차트와 히어로가 말한다 (작업지시서 2026-09-19 §3-3).
    var weightPane: some View {
        let entries = model.weightEntries()          // date desc
        let todayStr = GymAppModel.dayFmt.string(from: model.referenceToday)
        return LazyVStack(spacing: 0) {
            if entries.isEmpty {
                Text("아직 기록이 없습니다. 아래 버튼으로 입력하세요.")
                    .font(.sans(13, 400)).foregroundStyle(GY.ink3).padding(.vertical, 24)
            }
            if let first = entries.first, first.w.date != todayStr {
                weightRowView(dayStr: todayStr, today: true, valText: nil, delta: nil)
            }
            ForEach(Array(entries.enumerated()), id: \.element.w.date) { i, e in
                weightRowView(dayStr: e.w.date, today: false, valText: fmtKg1(e.w.kg),
                              delta: e.delta, last: i + 1 == entries.count)
            }
        }
        .padding(.horizontal, 24)
    }

    // 기록 행 44pt — 날짜·요일 / 증감(폭 42) / 값(폭 56). " kg" 접미사는 뺐다(44회 반복이고
    // 단위는 히어로가 말한다). 요일을 새로 붙여 주 리듬이 목록에서도 보인다 (§3-3).
    func weightRowView(dayStr: String, today: Bool, valText: String?, delta: Double?,
                       last: Bool = false) -> some View {
        let day = GymAppModel.dayFmt.date(from: dayStr)
        return HStack(spacing: 7) {
            Text(day.map { Self.md.string(from: $0) } ?? dayStr)
                .font(.sans(15, today ? 600 : 500)).foregroundStyle(GY.ink1)
            Text(day.map { Self.wd.string(from: $0) } ?? "")
                .font(.sans(12, 500)).foregroundStyle(GY.ink4)
            if today { Text("오늘").font(.sans(11, 700)).foregroundStyle(GY.crailDeep) }
            Spacer(minLength: 4)
            if let valText {
                weightDelta(delta).frame(width: 42, alignment: .trailing)
                Text(valText).font(.mono(18, 600)).tracking(-0.3).foregroundStyle(GY.ink1)
                    .frame(width: 56, alignment: .trailing)
            } else {
                Text("미입력").font(.sans(13, 500)).foregroundStyle(GY.ink4)
            }
        }
        .frame(height: 44)
        .overlay(alignment: .bottom) {
            if !last { Rectangle().fill(GY.lineSoft).frame(height: 1) }
        }
    }

    // 증감 — 감소 ▼crailDeep(목표 진척) / 증가 ▲ink3. 이중 음수를 쓰지 않는다.
    @ViewBuilder func weightDelta(_ delta: Double?) -> some View {
        if let delta {
            if abs(delta) < 0.05 {
                Text("— 0.0").font(.mono(12, 500)).foregroundStyle(GY.ink3)
            } else if delta < 0 {
                Text("▼\(fmtKg1(-delta))").font(.mono(12, 600)).foregroundStyle(GY.crailDeep)
            } else {
                Text("▲\(fmtKg1(delta))").font(.mono(12, 500)).foregroundStyle(GY.ink3)
            }
        }
    }

    // MARK: - 히어로 + 추이 차트 (작업지시서 2026-09-19 §3-1·3-2)

    /// 추이 차트 높이 — 기기와 무관하게 시안 F 값 222. 히어로 줄 상자를 시안대로 죈 뒤로는
    /// SE(667)에서도 목록이 3행 남는다 (2026-09-19 시뮬 실측: 11 Pro 5.05행 · SE 3.07행).
    static let chartH: CGFloat = 222
    static let chartLeft: CGFloat = 20       // 플롯 좌 여백
    static let chartRight: CGFloat = 40      // 세로 축 라벨이 쓰는 폭
    static let chartGridExtra: CGFloat = 13  // 격자는 플롯보다 이만큼 더 나간다(축 라벨 6pt 앞에서 끊김)
    static let axisLabelTrailing: CGFloat = 8
    static let wd: DateFormatter = { let f = DateFormatter(); f.dateFormat = "E"; f.locale = Locale(identifier: "ko_KR"); f.timeZone = TimeZone(identifier: "Asia/Seoul"); return f }()

    // 히어로 — 현재 값을 크게, 차트는 그 아래 통째로. 탭 상단 고정(목록 어디를 보고 있든
    // 현재 체중과 추이를 함께 읽는다). 배경 틴트·목표선·기간 칩·범례는 넣지 않는다.
    var weightHero: some View {
        let ws = model.weights                       // date desc
        let buckets = GymWeightLogic.weekBuckets(rows: ws.map { (date: $0.date, kg: $0.kg) },
                                                 now: model.referenceToday)
        return VStack(alignment: .leading, spacing: 0) {
            weightHeroValue(latest: ws.first, start: ws.last, count: ws.count)
            // 점 2개 미만이면 추세선이 안 그려진다 — 고정 영역이라 빈 껍데기를 남기지 않는다.
            if ws.count >= 2, !buckets.isEmpty {
                weightChart(buckets: buckets)
                    .frame(height: Self.chartH).padding(.top, 12)
                // 가로축은 주 단위로 통일한다. 날짜로 적으면 마지막 칸의 끝(이번 주 일요일)과
                // 마지막 기록일이 어긋난다.
                HStack(spacing: 8) {
                    if buckets.count >= 2 { Text("\(buckets.count - 1)주 전") }
                    Spacer(minLength: 0)
                    Text("이번 주")
                }
                .font(.sans(10, 500)).foregroundStyle(GY.ink3)
                .frame(height: 17)                    // 시안 줄 상자 (10 × 1.7)
                .padding(.init(top: 9, leading: Self.chartLeft, bottom: 14,
                               trailing: Self.chartRight))
            }
        }
        .background(GY.shell)
        // 목록이 히어로 밑으로 지나가는 것이 보이도록 경계선 (고정 영역임을 알린다)
        .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
    }

    func weightHeroValue(latest: GymWeight?, start: GymWeight?, count: Int) -> some View {
        let goal = model.settings.goalWeight
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text(latest.map { fmtKg1($0.kg) } ?? "—")
                    .font(.mono(52, 600)).tracking(-1.6).foregroundStyle(GY.ink1)
                    .accessibilityIdentifier("weight-hero-num")
                Text("kg").font(.sans(15, 500)).foregroundStyle(GY.ink3).padding(.leading, 6)
                Spacer(minLength: 8)
                // 기록이 하나뿐이면 latest 와 start 가 같은 행이라 "시작 … 대비" 가 제 값을 가리킨다.
                if let latest, let start, latest.date != start.date {
                    let d = ((latest.kg - start.kg) * 10).rounded() / 10
                    (Text("시작 ").font(.sans(11, 500))
                     + Text(fmtKg1(start.kg)).font(.mono(11, 600))
                     + Text(" 대비").font(.sans(11, 500)))
                        .foregroundStyle(GY.ink3)
                    Text(d == 0 ? "—" : (d < 0 ? "▼\(fmtKg1(-d))" : "▲\(fmtKg1(d))"))
                        .font(.mono(15, 600)).foregroundStyle(d < 0 ? GY.crailDeep : GY.ink3)
                        .padding(.leading, 5)
                }
            }
            // 줄 상자를 시안 값으로 고정한다 (2026-09-19 시안 HTML 실측: 숫자 줄 52.0, 메타 줄 20.4).
            // SwiftUI Text 는 서체의 자연 행 높이(52pt 숫자 = 약 65)를 쓰는데 시안은 CSS
            // line-height 로 눌렀다 — 그대로 두면 히어로가 10.4pt 높아 목록 한 행을 먹는다.
            .frame(height: 52)
            // 메타 — 건수와 목표. 시작값은 위 증감 줄이 말하므로 여기서 뺐다.
            weightHeroMeta(latest: latest, goal: goal, count: count)
                .foregroundStyle(GY.ink2)
                .accessibilityIdentifier("weight-hero-meta")   // 식별자는 말단 Text 에만
                .frame(height: 20.4, alignment: .leading)
                .padding(.top, 9)
        }
        .padding(.init(top: 16, leading: 24, bottom: 0, trailing: 20))
    }

    // "44회 기록 · 목표 69.0 까지 4.9kg" — 숫자만 mono. 삭제한 목록 헤더("전체 N건")의 건수가
    // 여기로 왔다.
    func weightHeroMeta(latest: GymWeight?, goal: Double, count: Int) -> Text {
        guard let latest else {
            return Text("목표 \(fmtKg1(goal))kg · 첫 입력을 기다립니다").font(.sans(12, 500))
        }
        let remaining = GymWeightLogic.remainingLoss(current: latest.kg, goal: goal)
        let head = Text("\(count)").font(.mono(12, 600))
            + Text("회 기록 · 목표 ").font(.sans(12, 500))
            + Text(fmtKg1(goal)).font(.mono(12, 600))
        guard remaining > 0 else { return head + Text(" 달성").font(.sans(12, 500)) }
        return head + Text(" 까지 ").font(.sans(12, 500))
            + Text(fmtKg1(remaining)).font(.mono(12, 600)) + Text("kg").font(.sans(12, 500))
    }

    // 오늘 체중 입력 (mock weight-input-trigger) — 탭 하단 고정. 입력 기록이 전체 이력이라
    // 스크롤 끝에 두면 기록이 쌓일수록 버튼이 멀어진다 (사용자 2026-09-18).
    var weightInputButton: some View {
        Button {
            let pre = model.weights.first?.kg
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
        // 아래 24 — 루트가 하단 세이프에어리어를 22pt 당겨 쓰므로(GymApp), 그만큼 돌려주지 않으면
        // 세이프에어리어가 0 인 SE(667) 에서 버튼 아랫부분이 화면 밖으로 잘린다 (2026-09-18 실측).
        .padding(.init(top: 12, leading: 24, bottom: 24, trailing: 24))
        .background(GY.shell)
    }

    // 차트 좌표 한 벌 — 칸 기하·축 범위·평활은 GymWeightLogic 이 낸다(테스트가 그쪽에 있다).
    struct WeightChartGeo {
        let cell: GymWeightLogic.WeekCellMetrics
        let lo: Double, hi: Double
        let ticks: [Double]
        let width: CGFloat, height: CGFloat
        /// 실측 점 — 버킷 순서대로 평탄화. r == nil 이면 칸이 좁아 점을 그리지 않는다.
        let dots: [(x: CGFloat, kg: Double, r: CGFloat?)]
        let trend: [Double]          // 지수평활 값 — dots 와 같은 순서·개수

        init(buckets: [GymWeightLogic.WeekBucket], width: CGFloat, height: CGFloat) {
            self.width = width; self.height = height
            let plotW = width - AdminScreenView.chartLeft - AdminScreenView.chartRight
            let m = GymWeightLogic.cellMetrics(plotWidth: plotW, weeks: buckets.count)
            let values = buckets.flatMap(\.values)
            let r = GymWeightLogic.axisRange(values: values)
            cell = m; lo = r.lo; hi = r.hi
            ticks = GymWeightLogic.axisTicks(lo: r.lo, hi: r.hi).ticks
            trend = GymWeightLogic.ema(values)
            dots = buckets.enumerated().flatMap { i, b -> [(x: CGFloat, kg: Double, r: CGFloat?)] in
                let rad = m.dotRadius(count: b.values.count)
                let xs = m.dotXs(cellX: AdminScreenView.chartLeft + CGFloat(i) * m.cellWidth,
                                 count: b.values.count)
                return zip(xs, b.values).map { (x: $0, kg: $1, r: rad) }
            }
        }
        func y(_ v: Double) -> CGFloat { CGFloat((hi - v) / (hi - lo)) * height }
        func cellX(_ i: Int) -> CGFloat { AdminScreenView.chartLeft + CGFloat(i) * cell.cellWidth }
        var gridRight: CGFloat {
            width - AdminScreenView.chartRight + AdminScreenView.chartGridExtra
        }
    }

    // 추이 차트 — 주 변동폭 박스 + 일별 실측 점 + 지수평활 추세선 (a=0.12).
    // 세로는 기록 범위에 상하 0.5kg, 최소 3.0kg. 가로는 **주 단위 칸**이라 이틀 공백이
    // 하루치 폭으로 그려지지 않는다. 목표선은 그리지 않는다 — 목표 69 는 범위 밖이라 늘 안
    // 그려졌고, 남은 양은 히어로 메타가 숫자로 말한다.
    func weightChart(buckets: [GymWeightLogic.WeekBucket]) -> some View {
        GeometryReader { g in
            let geo = WeightChartGeo(buckets: buckets, width: g.size.width, height: g.size.height)
            ZStack(alignment: .topLeading) {
                // ① 격자 — 눈금 자리 가로선. 축 라벨에 닿지 않게 앞에서 끊는다.
                Path { p in
                    for t in geo.ticks {
                        p.move(to: CGPoint(x: Self.chartLeft, y: geo.y(t)))
                        p.addLine(to: CGPoint(x: geo.gridRight, y: geo.y(t)))
                    }
                }
                .stroke(GY.lineSoft, lineWidth: 1)
                // ② 주 박스 — 그 주 최저~최고. 빈 주는 그리지 않고 칸만 자리를 지킨다.
                if geo.cell.showsBox {
                    ForEach(buckets.indices, id: \.self) { i in
                        if !buckets[i].values.isEmpty {
                            let top = geo.y(buckets[i].max)
                            RoundedRectangle(cornerRadius: min(3, geo.cell.boxWidth / 2))
                                .fill(GY.weightBand)
                                .frame(width: geo.cell.boxWidth,
                                       height: max(4, geo.y(buckets[i].min) - top))
                                .offset(x: geo.cellX(i) + geo.cell.inset, y: top)
                        }
                    }
                }
                // ③ 일별 실측 점 — 한 칸 안에서 안쪽 64% 폭에 균등 배치.
                ForEach(geo.dots.indices, id: \.self) { i in
                    if let r = geo.dots[i].r {
                        Circle().fill(GY.weightDot).frame(width: r * 2, height: r * 2)
                            .offset(x: geo.dots[i].x - r, y: geo.y(geo.dots[i].kg) - r)
                    }
                }
                // ④ 최고·최저 마커 + 라벨
                weightExtremes(geo)
                // ⑤ 추세선 — 실측 점과 같은 x 좌표.
                Path { p in
                    for (i, e) in geo.trend.enumerated() {
                        let pt = CGPoint(x: geo.dots[i].x, y: geo.y(e))
                        if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
                    }
                }
                .stroke(GY.crailDeep,
                        style: StrokeStyle(lineWidth: 2.6, lineCap: .round, lineJoin: .round))
                // ⑥ 최신 실측 점 — 히어로의 큰 숫자와 같은 값이라 혼동이 없다.
                if let d = geo.dots.last {
                    Circle().fill(GY.crailDeep)
                        .overlay(Circle().stroke(GY.shell, lineWidth: 1.2))
                        .frame(width: 5.6, height: 5.6)
                        .offset(x: d.x - 2.8, y: geo.y(d.kg) - 2.8)
                }
                // 세로 축 라벨 — 격자선과 수직 중앙 정렬, trailing.
                ForEach(geo.ticks, id: \.self) { t in
                    Text("\(Int(t))").font(.mono(10, 600)).foregroundStyle(GY.ink3)
                        .frame(width: 40, height: 14, alignment: .trailing)
                        .offset(x: g.size.width - Self.axisLabelTrailing - 40, y: geo.y(t) - 7)
                }
            }
        }
    }

    // 최고·최저 — 그 점에 빈 원 마커 + 값 라벨. 라벨 위치는 시안 F 의 baseline(최고 마커 위 11,
    // 최저 마커 아래 16)을 중심 기준으로 환산한 값이다 — 눈으로 위아래가 대칭이다.
    @ViewBuilder func weightExtremes(_ geo: WeightChartGeo) -> some View {
        let kgs = geo.dots.map(\.kg)
        if let mx = kgs.max(), let mn = kgs.min(), mx > mn,
           let iMax = kgs.firstIndex(of: mx), let iMin = kgs.firstIndex(of: mn) {
            weightExtremeMarker(geo, at: iMax, text: "최고 \(fmtKg1(mx))", dy: -14.5)
            weightExtremeMarker(geo, at: iMin, text: "최저 \(fmtKg1(mn))", dy: 12.5)
        }
    }

    @ViewBuilder func weightExtremeMarker(_ geo: WeightChartGeo, at i: Int,
                                          text: String, dy: CGFloat) -> some View {
        let x = geo.dots[i].x, y = geo.y(geo.dots[i].kg)
        Circle().fill(GY.shell).overlay(Circle().stroke(GY.ink3, lineWidth: 1.5))
            .frame(width: 6.2, height: 6.2)
            .offset(x: x - 3.1, y: y - 3.1)
        Text(text).font(.sans(10, 600)).foregroundStyle(GY.ink2)
            .frame(width: 70, height: 13)
            .offset(x: x - 35, y: y + dy - 6.5)
    }

    // MARK: - 프로필 탭 (mocks pane-profile — 4필드 편집 + 동기화 카드 + 로그아웃 + 푸터, §10-3)

    enum ProfileField: String { case height, birthdate, goalWeight = "goal-weight", weeklyGoal = "weekly-goal" }

    // 필드 → 키패드 컨텍스트 (prefill = 현재값 ?? PWA FIELD_DEFS fallback).
    static func profileKeypadContext(_ f: ProfileField, settings s: GymUserSettings) -> KeypadContext {
        switch f {
        case .height:
            return KeypadContext(field: .reps, buffer: "\(s.height ?? 173)", fresh: true,
                                 pairHidesWeight: false, unitOverride: "cm")
        case .birthdate:
            let digits = s.birthDate.map { $0.replacingOccurrences(of: "-", with: "") } ?? ""
            return KeypadContext(field: .reps, buffer: digits, fresh: !digits.isEmpty,
                                 pairHidesWeight: false, unitOverride: "", digitLimit: 8, asDate: true)
        case .goalWeight:
            return KeypadContext(field: .weight,
                                 buffer: wf.string(from: NSNumber(value: s.goalWeight)) ?? "\(s.goalWeight)",
                                 fresh: true, pairHidesWeight: false)
        case .weeklyGoal:
            return KeypadContext(field: .reps, buffer: "\(s.weeklyGoal)", fresh: true,
                                 pairHidesWeight: false, digitLimit: 1)
        }
    }
    static func profileFieldLabel(_ f: ProfileField) -> String {
        switch f {
        case .height: "키"; case .birthdate: "생년월일"
        case .goalWeight: "목표 체중"; case .weeklyGoal: "주간 목표"
        }
    }

    // 저장 — profile.js editProfileField 정합 (검증 실패·빈 입력은 no-op).
    func saveProfileKeypad() {
        defer { profileKeypad = nil; profileField = nil }
        guard let kp = profileKeypad, let f = profileField, !kp.buffer.isEmpty else { return }
        switch f {
        case .height:
            guard let v = GymProfileFields.parseHeight(kp.buffer) else { return }
            model.updateSettings { $0.height = v }
        case .birthdate:
            guard let iso = GymProfileFields.parseBirthdateDigits(kp.buffer) else { return }
            model.updateSettings { $0.birthDate = iso }
        case .goalWeight:
            guard let v = GymProfileFields.parseGoalWeight(kp.buffer) else { return }
            model.updateSettings { $0.goalWeight = v }
        case .weeklyGoal:
            guard let v = GymProfileFields.parseWeeklyGoal(kp.buffer) else { return }
            model.updateSettings { $0.weeklyGoal = v }
        }
    }

    var profilePane: some View {
        let s = model.settings
        return VStack(spacing: 0) {
            // 4필드 (mock data-field 행 — 값 ?? FIELD_DEFS fallback, 미입력 birthdate 는 dim "입력")
            VStack(spacing: 0) {
                profileRow(.height, value: "\(s.height ?? 173)", unit: "cm")
                profileRow(.birthdate, value: GymProfileFields.birthdateDisplay(s.birthDate),
                           unit: nil, empty: s.birthDate == nil)
                profileRow(.goalWeight, value: Self.wf.string(from: NSNumber(value: s.goalWeight)) ?? "\(s.goalWeight)",
                           unit: "kg")
                profileRow(.weeklyGoal, value: "\(s.weeklyGoal)", unit: "회")
            }
            .padding(.horizontal, 26).padding(.top, 10)
            // 동기화 카드 (mock sync-card) — signedIn 만 보던 걸 실제 백업 상태로 교체.
            // 미로그인·오래된 백업·최근 실패면 위험(crail 점 + 사유)을 드러낸다 (2026-07-14 사고).
            let atRisk = GymSyncHealth.isAtRisk(model.syncState, now: model.referenceToday)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Circle().fill(atRisk ? GY.crailBase : GY.sageDeep).frame(width: 7, height: 7)
                    Text(GymSyncHealth.statusText(model.syncState, now: model.referenceToday))
                        .font(.sans(13, 600)).tracking(0.26)
                        .foregroundStyle(atRisk ? GY.crailDeep : GY.ink2)
                }
                Text(cloud.userEmail ?? model.syncState.userEmail ?? "로그인하지 않음")
                    .font(.sans(13, 500)).foregroundStyle(GY.ink4).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.init(top: 16, leading: 18, bottom: 16, trailing: 18))
            .background(GY.card, in: RoundedRectangle(cornerRadius: GY.rLg))
            .overlay(RoundedRectangle(cornerRadius: GY.rLg).strokeBorder(GY.line, lineWidth: 1))
            .shadow(color: Color(hex: 0x14120E).opacity(0.06), radius: 10, y: 4)
            .padding(.horizontal, 26).padding(.top, 24)
            // 로그아웃 / 미로그인 시 Google 로그인. cloud(별도 ObservableObject)는 이 뷰가
            // observe 안 해 갱신 누락 → observe 되는 model.syncState.signedIn 으로 반응성 확보.
            let signedIn = model.syncState.signedIn
            Button(action: signedIn ? onLogout : onLogin) {
                Text(signedIn ? "로그아웃" : "Google 로그인")
                    .font(.sans(15, 600)).foregroundStyle(signedIn ? GY.ink3 : GY.crailDeep)
                    .frame(maxWidth: .infinity).frame(height: 48)
                    .background(signedIn ? GY.card : GY.crailTint, in: RoundedRectangle(cornerRadius: GY.rMd))
                    .overlay(RoundedRectangle(cornerRadius: GY.rMd)
                        .strokeBorder(signedIn ? GY.line : GY.crailSoft, lineWidth: 1))
            }
            .buttonStyle(.plain).accessibilityIdentifier("profile-auth")
            .padding(.horizontal, 26).padding(.top, 16)
            // 푸터 (mock "GYM · EST 2026")
            Spacer(minLength: 40)
            Text("GYM · EST 2026").font(.mono(12, 500)).tracking(1.92).foregroundStyle(GY.ink4)
                .padding(.bottom, 26)
        }
        .padding(.top, 8)
        .frame(maxHeight: .infinity)
    }

    func profileRow(_ f: ProfileField, value: String, unit: String?, empty: Bool = false) -> some View {
        Button {
            profileField = f
            profileKeypad = Self.profileKeypadContext(f, settings: model.settings)
        } label: {
            HStack {
                Text(Self.profileFieldLabel(f)).font(.sans(15, 500)).foregroundStyle(GY.ink2)
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(value).font(.mono(17, empty ? 500 : 600))
                        .foregroundStyle(empty ? GY.ink4 : GY.ink1)   // 미입력 dim placeholder (P14)
                    if let unit {
                        Text(unit).font(.sans(13, 500)).foregroundStyle(GY.ink4)
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .medium)).foregroundStyle(GY.ink4)
                        .padding(.leading, 4)
                }
            }
            .padding(.vertical, 16)
            .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("profile-field-\(f.rawValue)")
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

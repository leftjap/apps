import SwiftUI
import GymCore

// 관리 화면 — mocks/admin.html 이식. 3탭(운동/체중/프로필) GymAppModel 실데이터 구동.
public struct AdminScreenView: View {
    public enum Tab: String { case ex, weight, profile }
    @ObservedObject var model: GymAppModel
    @State private var tab: Tab
    @State private var activePart = "chest"
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
    var exPane: some View {
        let rows = model.exercisesForPart(activePart)
        return VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(GymExercises.partOrder, id: \.self) { p in partChip(p) }
                }.padding(.horizontal, 20)
            }.padding(.top, 14)
            VStack(spacing: 0) {
                ForEach(rows) { ex in
                    let shown = !model.isHidden(ex.id)
                    HStack(spacing: 12) {
                        Image(systemName: "line.3.horizontal").font(.system(size: 14)).foregroundStyle(GY.ink4).frame(width: 24, height: 36)
                        Text(ex.name).font(.sans(16, 500)).foregroundStyle(shown ? GY.ink1 : GY.ink4).lineLimit(1)
                        Spacer()
                        Text(detail(ex)).font(.mono(13, 500)).foregroundStyle(GY.ink4)
                        Button { model.toggleHidden(ex.id) } label: { ToggleSwitch(on: shown) }
                            .buttonStyle(.plain).accessibilityIdentifier("admin-toggle-\(ex.id)")
                    }
                    .padding(.vertical, 16).padding(.horizontal, 8)
                    .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
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
    var weightPane: some View {
        let entries = model.weightEntries()
        return VStack(spacing: 0) {
            if entries.isEmpty {
                Text("체중 기록 없음").font(.sans(13, 400)).foregroundStyle(GY.ink4).padding(.vertical, 24)
            }
            ForEach(entries.indices, id: \.self) { i in
                let e = entries[i]
                HStack {
                    Text(mdLabel(e.w.date)).font(.sans(15, 500)).foregroundStyle(GY.ink1)
                    Spacer()
                    if let d = e.delta {
                        Text("\(d > 0 ? "+" : (d < 0 ? "−" : ""))\(Self.wf.string(from: NSNumber(value: abs(d))) ?? "")")
                            .font(.mono(12, 500)).foregroundStyle(GY.ink4)
                    }
                    (Text(Self.wf.string(from: NSNumber(value: e.w.kg)) ?? "\(e.w.kg)").font(.mono(16, 600)).foregroundStyle(GY.ink1)
                     + Text("kg").font(.sans(12, 500)).foregroundStyle(GY.ink4))
                        .padding(.leading, 12)
                }
                .padding(.vertical, 15).padding(.horizontal, 24)
                .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
            }
        }.padding(.top, 8)
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

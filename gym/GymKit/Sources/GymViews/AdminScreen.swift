import SwiftUI
import GymCore

// 관리 화면 — mocks/admin.html 이식. 3탭(운동/체중/프로필). 운동/체중은 데모, 프로필은 실 로그인 상태.
public struct AdminScreenView: View {
    public enum Tab: String { case ex, weight, profile }
    @State private var tab: Tab
    @State private var activePart = "가슴"
    @ObservedObject var cloud: CloudStore
    var onHome: () -> Void
    var onStats: () -> Void
    var onLogin: () -> Void
    var onLogout: () -> Void
    public init(initialTab: Tab = .ex, cloud: CloudStore,
                onHome: @escaping () -> Void = {}, onStats: @escaping () -> Void = {},
                onLogin: @escaping () -> Void = {}, onLogout: @escaping () -> Void = {}) {
        _tab = State(initialValue: initialTab); self.cloud = cloud
        self.onHome = onHome; self.onStats = onStats; self.onLogin = onLogin; self.onLogout = onLogout
    }

    public var body: some View {
        VStack(spacing: 0) {
            header
            tabBar
            ScrollView {
                switch tab {
                case .ex: exPane
                case .weight: weightPane
                case .profile: profilePane
                }
            }
        }
        .frame(width: 390).frame(maxHeight: .infinity, alignment: .top)
        .background(GY.shell)
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

    // 운동 탭 — 부위 칩 + 운동 행(토글)
    var exPane: some View {
        let parts = ["가슴", "등", "어깨", "하체", "팔", "맨몸"]
        let rows: [(String, String, Bool)] = [
            ("벤치프레스", "60kg × 10", true), ("인클라인 벤치", "45kg × 10", true),
            ("케이블 플라이", "20kg × 12", true), ("체스트 프레스", "50kg × 10", false),
            ("딥스", "자체 × 12", true),
        ]
        return VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(parts, id: \.self) { p in partChip(p) }
                }.padding(.horizontal, 20)
            }.padding(.top, 14)
            VStack(spacing: 0) {
                ForEach(rows.indices, id: \.self) { i in
                    let r = rows[i]
                    HStack(spacing: 12) {
                        Image(systemName: "line.3.horizontal").font(.system(size: 14)).foregroundStyle(GY.ink4).frame(width: 24, height: 36)
                        Text(r.0).font(.sans(16, 500)).foregroundStyle(r.2 ? GY.ink1 : GY.ink4).lineLimit(1)
                        Spacer()
                        Text(r.1).font(.mono(13, 500)).foregroundStyle(GY.ink4)
                        ToggleSwitch(on: r.2)
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
            Text(p).font(.sans(14, on ? 600 : 500)).foregroundStyle(on ? GY.ink1 : GY.ink3)
                .padding(.horizontal, 14).padding(.vertical, 7)
                .background(on ? GY.crailSoft : GY.card, in: Capsule())
                .overlay(Capsule().strokeBorder(on ? GY.crailBase : GY.line, lineWidth: 1))
        }.buttonStyle(.plain)
    }

    // 체중 탭 — 기록 list
    var weightPane: some View {
        let entries: [(String, String, String)] = [
            ("5월 6일", "72.4", "−0.2"), ("5월 4일", "72.6", "+0.1"),
            ("5월 2일", "72.5", "−0.3"), ("4월 29일", "72.8", "−0.1"),
        ]
        return VStack(spacing: 0) {
            ForEach(entries.indices, id: \.self) { i in
                let e = entries[i]
                HStack {
                    Text(e.0).font(.sans(15, 500)).foregroundStyle(GY.ink1)
                    Spacer()
                    Text(e.2).font(.mono(12, 500)).foregroundStyle(GY.ink4)
                    (Text(e.1).font(.mono(16, 600)).foregroundStyle(GY.ink1)
                     + Text("kg").font(.sans(12, 500)).foregroundStyle(GY.ink4))
                        .padding(.leading, 12)
                }
                .padding(.vertical, 15).padding(.horizontal, 24)
                .overlay(alignment: .bottom) { Rectangle().fill(GY.lineSoft).frame(height: 1) }
            }
        }.padding(.top, 8)
    }

    // 프로필 탭 — 실 로그인 상태 + 설정 행
    var profilePane: some View {
        let items: [(String, String)] = [
            ("단위", "kg"), ("휴식 타이머", "90초"), ("버전", "1.0"),
        ]
        return VStack(spacing: 0) {
            // 계정 / 동기화 상태 (실 CloudStore)
            settingRow("계정", cloud.signedIn ? "로그인됨" : "로그인 안 됨")
            settingRow("데이터 동기화", cloud.signedIn ? "켜짐" : "꺼짐")
            ForEach(items.indices, id: \.self) { i in settingRow(items[i].0, items[i].1) }
            // Google 로그인/로그아웃 (local-first — 로그인은 sync 활성화용)
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
                Circle().fill(.white)
                    .frame(width: 19, height: 19)
                    .shadow(color: Color(hex: 0x14120E).opacity(0.2), radius: 1.5, y: 1)
                    .padding(2)
            }
    }
}

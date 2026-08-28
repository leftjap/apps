import SwiftUI
import GymCore

// 세션 요약 — mocks/summary.html 영수증 카드 이식. 방금 끝낸 실 세션(GymSession) 구동 (spec §7-2·§7-3).

// 하단 톱니(찢긴 종이) 영수증 형태 — clip-path zigzag 근사.
struct ReceiptShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let dip = rect.height * 0.010
        let teeth = 12
        let tw = rect.width / CGFloat(teeth)
        p.move(to: CGPoint(x: 0, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: 0))
        p.addLine(to: CGPoint(x: rect.width, y: rect.height - dip))
        for i in 0..<teeth {
            let x0 = rect.width - tw * CGFloat(i)
            p.addLine(to: CGPoint(x: x0 - tw / 2, y: rect.height))
            p.addLine(to: CGPoint(x: x0 - tw, y: rect.height - dip))
        }
        p.addLine(to: CGPoint(x: 0, y: rect.height - dip))
        p.closeSubpath()
        return p
    }
}

// 가로 점선 구분
struct DashedDivider: View {
    var body: some View {
        Rectangle().fill(.clear).frame(height: 1.5)
            .overlay(
                GeometryReader { g in
                    Path { $0.move(to: CGPoint(x: 0, y: 0.75)); $0.addLine(to: CGPoint(x: g.size.width, y: 0.75)) }
                        .stroke(GY.line, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                })
    }
}

public struct SummaryScreenView: View {
    let session: GymSession
    let custom: [GymCustomExercise]
    let sessionNo: Int        // 누적 세션 번호 (#0142)
    let totalCount: Int       // 누적 완료 세션 수 (스탬프)
    var onHome: () -> Void

    // 앱 경로 — 방금 완료된 model.session 구동.
    public init(model: GymAppModel, onHome: @escaping () -> Void = {}) {
        session = model.session; custom = model.custom
        sessionNo = model.history.count; totalCount = model.history.count
        self.onHome = onHome
    }
    // 스냅샷/데모 경로.
    public init(session: GymSession, custom: [GymCustomExercise] = [], sessionNo: Int = 42,
                totalCount: Int = 42, onHome: @escaping () -> Void = {}) {
        self.session = session; self.custom = custom; self.sessionNo = sessionNo
        self.totalCount = totalCount; self.onHome = onHome
    }

    // MARK: - 파생값 (실 세션 집계)
    struct ExRow: Identifiable { let id = UUID(); let name: String; let sets: Int; let vol: String; let pr: Bool }
    static let vf: NumberFormatter = { let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f }()
    var rows: [ExRow] {
        session.blocks.compactMap { b in
            let done = b.sets.filter(\.done)
            guard !done.isEmpty else { return nil }   // 완료 세트 없으면 표시 제외 (session-summary.js)
            let name = GymExercises.resolveName(b.exerciseId, custom: custom)
            // 시간 기반(유산소) — 볼륨 열에 "25분 · 3km" (formatTimeBased 정합)
            if let dur = done[0].duration {
                let km = done[0].distance.map { " · \(String(format: "%g", $0))km" } ?? ""
                return ExRow(name: name, sets: done.count,
                             vol: "\(Int((dur / 60).rounded()))분\(km)",
                             pr: b.sets.contains { $0.pr })
            }
            let total = done.reduce(0.0) { $0 + $1.volume }
            return ExRow(name: name, sets: done.count,
                         vol: "\(Self.vf.string(from: NSNumber(value: total.rounded())) ?? "0")kg",
                         pr: b.sets.contains { $0.pr })
        }
    }
    var totalVolume: Int { Int(session.blocks.reduce(0.0) { $0 + $1.sets.filter(\.done).reduce(0) { $0 + $1.volume } }.rounded()) }
    var totalSets: Int { session.blocks.reduce(0) { $0 + $1.sets.filter(\.done).count } }
    var prCount: Int { session.blocks.filter { $0.sets.contains { $0.pr } }.count }

    static let hm: DateFormatter = { let f = DateFormatter(); f.dateFormat = "HH:mm"; f.timeZone = TimeZone(identifier: "Asia/Seoul"); return f }()
    static let wd: DateFormatter = { let f = DateFormatter(); f.dateFormat = "EEE"; f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "Asia/Seoul"); return f }()
    func hhmm(_ ms: Int64?) -> String { guard let ms else { return "--:--" }; return Self.hm.string(from: Date(timeIntervalSince1970: Double(ms) / 1000)) }
    var weekday: String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "Asia/Seoul")
        guard let d = f.date(from: session.date) else { return "" }
        return Self.wd.string(from: d).uppercased()
    }

    public var body: some View {
        ZStack {
            RadialGradient(colors: [Color(oklch: 0.96, 0.012, 60), .clear], center: .init(x: 0.2, y: -0.1), startRadius: 0, endRadius: 500)
                .background(RadialGradient(colors: [Color(oklch: 0.95, 0.02, 50).opacity(0.6), .clear], center: .init(x: 1.1, y: 1.15), startRadius: 0, endRadius: 400))
                .background(GY.shell)
                .ignoresSafeArea()

            receipt
                .frame(width: 286)
                .background(ReceiptShape().fill(Color(hex: 0xFFFDF8)))
                .shadow(color: Color(hex: 0x14120E).opacity(0.16), radius: 20, y: 14)
        }
    }

    var receipt: some View {
        VStack(spacing: 0) {
            // 헤더
            VStack(spacing: 0) {
                Text("GYM").font(.mono(22, 600)).tracking(3.5).foregroundStyle(GY.ink1)
                Text("SESSION · #\(String(format: "%04d", sessionNo))").font(.mono(11, 500)).tracking(2).foregroundStyle(GY.ink3).padding(.top, 7)
                Text("\(session.date) \(weekday) · \(hhmm(session.startTime))→\(hhmm(session.endTime))")
                    .font(.mono(11, 400)).tracking(0.2).foregroundStyle(GY.ink4).padding(.top, 5)
            }.padding(.bottom, 16)
            DashedDivider()
            // 운동 행 (실 세션 블록)
            VStack(spacing: 0) {
                ForEach(rows) { r in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        HStack(spacing: 6) {
                            Text(r.name).font(.sans(13, 500)).foregroundStyle(r.pr ? GY.crailDeep : GY.ink1).lineLimit(1)
                            if r.pr { Text("★").font(.system(size: 11)).foregroundStyle(GY.crailDeep) }
                        }
                        Spacer()
                        Text("\(r.sets)세트").font(.mono(12, 400)).foregroundStyle(GY.ink4)
                        Text(r.vol).font(.mono(13, 600)).foregroundStyle(GY.ink2).frame(minWidth: 56, alignment: .trailing)
                    }
                    .padding(.vertical, 7)
                }
            }.padding(.top, 6).padding(.bottom, 12)
            DashedDivider()
            // TOTAL
            HStack(alignment: .firstTextBaseline) {
                Text("TOTAL").font(.mono(12, 600)).tracking(1.44).foregroundStyle(GY.ink3)
                Spacer()
                (Text("\(totalVolume)").font(.mono(38, 500)).tracking(-1.14).foregroundStyle(GY.ink1)
                 + Text(" kg").font(.mono(15, 500)).foregroundStyle(GY.ink4))
            }.padding(.vertical, 14)
            // 칼로리 — TOTAL 다음가는 위계로 (사용자 2026-08-28 "더 키우고").
            // 10.5pt 한 줄은 영수증에서 사실상 안 읽혔다. 숫자만 키우고 접사는 작게 남겨
            // TOTAL(38pt)과 섞이지 않게 한다. (spec §7-3 "부각 안 함" → "읽히게" 로 갱신)
            if session.totalCalories > 0 {
                (Text("약 ").font(.sans(11, 500)).foregroundStyle(GY.ink4)
                 + Text("\(session.totalCalories)").font(.mono(22, 500)).tracking(-0.44).foregroundStyle(GY.ink2)
                 + Text(" kcal 소모").font(.sans(11, 500)).foregroundStyle(GY.ink4))
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .padding(.bottom, 10)
                    .accessibilityIdentifier("summary-kcal")
            }
            DashedDivider()
            // 메타 3열
            HStack(spacing: 0) {
                metaCol("\(session.durationMin)분", "소요", .leading)
                metaCol("\(prCount)", "신기록", .center, crail: true)
                metaCol("\(totalSets)", "세트", .trailing)
            }.padding(.vertical, 13)
            DashedDivider()
            // 스탬프 (누적 완료 세션)
            HStack(spacing: 7) {
                Text("★").font(.system(size: 11)).foregroundStyle(GY.crailDeep)
                Text("누적 \(totalCount)회 달성").font(.mono(12, 600)).tracking(0.48).foregroundStyle(GY.ink1)
            }
            .padding(.horizontal, 16).padding(.vertical, 7)
            .overlay(Capsule().strokeBorder(GY.crailBase, lineWidth: 1.5))
            .padding(.vertical, 18)
            // 홈으로
            Button(action: onHome) {
                Text("홈으로").font(.sans(15, 600)).foregroundStyle(Color(hex: 0xFBF8F2))
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .background(GY.ink1, in: RoundedRectangle(cornerRadius: GY.rMd))
            }.buttonStyle(.plain).accessibilityIdentifier("summary-home")
        }
        .padding(.horizontal, 26).padding(.top, 26).padding(.bottom, 30)
    }

    func metaCol(_ val: String, _ label: String, _ align: HorizontalAlignment, crail: Bool = false) -> some View {
        VStack(alignment: align, spacing: 3) {
            Text(val).font(.mono(14, 600)).foregroundStyle(crail ? GY.crailDeep : GY.ink1)
            Text(label).font(.sans(10, 500)).tracking(0.4).foregroundStyle(GY.ink4)
        }
        .frame(maxWidth: .infinity, alignment: align == .leading ? .leading : (align == .trailing ? .trailing : .center))
    }
}

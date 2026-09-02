import SwiftUI

// v8 08 책 상세 — 스펙: frames/08.html. userData 주입 시 selectedBook 실데이터 (init 스냅샷).
public struct Screen08Detail: View {
    struct Live {
        let book: RTBook
        let total: String            // "0:01"
        let count: Int               // 종이책 세션 수 / 밀리 편입 책은 읽은 날 수
        let days: Int
        let isMillie: Bool           // 밀리 편입 책 — 기록은 일별, CTA 는 '밀리의 서재' 비활성
        let rows: [(tile: Tile, min: String, label: String, right: Right)]
    }

    var model: RTAppModel?
    private let live: Live?
    private let readOnly: Bool   // 파트너 책 상세 = 읽기전용(CTA·책메뉴 숨김)

    public init(model: RTAppModel? = nil) {
        self.model = model
        // 파트너 통계에서 진입 시 partnerData 기준(읽기전용), 아니면 본인 selectedBook
        let partner = model?.statsSubject == .partner
        self.readOnly = partner
        let data: RTUserData? = partner ? model?.partnerData : model?.userData
        let book: RTBook? = partner ? model?.partnerSelectedBook : model?.selectedBook
        if let m = model, let data, let book {
            let cal = Calendar(identifier: .gregorian)
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "HH:mm"
            let days = (cal.dateComponents([.day], from: cal.startOfDay(for: book.addedAt),
                                           to: cal.startOfDay(for: m.now())).day ?? 0) + 1
            if book.millieBookId != nil {
                // 밀리 편입 책 — 세션이 없다. 기록은 일별(밀리 히스토리), 시간은 그 책이 그날
                // 유일할 때만 귀속(ebookBreakdown 규칙 — 다권 날 추측 금지). 누적도 그 합.
                let df = DateFormatter()
                df.locale = Locale(identifier: "en_US_POSIX")
                df.dateFormat = "yyyy-MM-dd"
                // 1분 미만 날(ebookMinSeconds 미달)은 홈 캘린더처럼 미기록 취급해 행을 만들지
                // 않는다 — 남기면 혼자 읽은 날이 '다른 책과 함께'로 오표기된다(1권인데 시간만 미달).
                // 파트너의 밀리 책은 히스토리를 받지 않는다(스냅샷은 책 목록뿐) — 내 기록을 붙이면 안 됨
                let myDays = partner ? [] : m.ebookBooks.filter { $0.value.contains(book.title) }.keys.sorted(by: >)
                    .filter { ds in df.date(from: ds).map { m.ebookSeconds(on: $0) > 0 } ?? false }
                var totalSec = 0
                let rows = myDays.prefix(5).compactMap { ds -> (Tile, String, String, Right)? in
                    guard let d = df.date(from: ds) else { return nil }
                    let mine = m.ebookBreakdown(on: d).first { $0.title == book.title }
                    let right: Right = cal.isDate(d, inSameDayAs: m.now())
                        ? .today
                        : .date("\(cal.component(.month, from: d)).\(cal.component(.day, from: d))")
                    if let mine {
                        return (.millie, "\(max(1, mine.seconds / 60))분", "밀리 · 자동 기록", right)
                    }
                    return (.millie, "—", "밀리 · 다른 책과 함께", right)
                }
                for ds in myDays {
                    if let d = df.date(from: ds),
                       let mine = m.ebookBreakdown(on: d).first(where: { $0.title == book.title }) {
                        totalSec += mine.seconds
                    }
                }
                self.live = Live(book: book,
                                 total: RTAppModel.hmString(totalSec),
                                 count: myDays.count,
                                 days: days,
                                 isMillie: true,
                                 rows: rows)
            } else {
                let modeLabel = ["flip": "엎기", "tap": "탭"]
                let rows = data.sessions
                    .filter { $0.isbn == book.isbn }
                    .sorted { $0.endedAt > $1.endedAt }
                    .prefix(5)
                    .map { r -> (Tile, String, String, Right) in
                        let tile: Tile = r.mode == "flip" ? .flip : (r.mode == "tap" ? .tap : .manual)
                        let label = r.mode == "manual" ? "직접 추가" : "\(modeLabel[r.mode] ?? r.mode) · \(f.string(from: r.endedAt))"
                        let right: Right = cal.isDate(r.endedAt, inSameDayAs: m.now())
                            ? .today
                            : .date("\(cal.component(.month, from: r.endedAt)).\(cal.component(.day, from: r.endedAt))")
                        return (tile, "\(max(1, r.seconds / 60))분", label, right)
                    }
                let forBook = data.sessions.filter { $0.isbn == book.isbn }
                self.live = Live(book: book,
                                 total: RTAppModel.hmString(forBook.reduce(0) { $0 + $1.seconds }),
                                 count: forBook.count,
                                 days: days,
                                 isMillie: false,
                                 rows: rows)
            }
        } else {
            self.live = nil
        }
    }

    public var body: some View {
        ZStack(alignment: .top) {
            RT.paper
            VStack(alignment: .leading, spacing: 0) {
                topBlock
                if !readOnly { ctas.padding(.top, 18) }   // 파트너 책 = 읽기전용, CTA 숨김
                logHead.padding(EdgeInsets(top: readOnly ? 20 : 26, leading: 0, bottom: 6, trailing: 0))
                if let live {
                    ForEach(Array(live.rows.enumerated()), id: \.offset) { i, r in
                        logRow(tile: r.tile, min: r.min, label: r.label, right: r.right,
                               divider: i < live.rows.count - 1)
                    }
                } else {
                    logRow(tile: .flip, min: "26분", label: "엎기 · 14:14", right: .today, divider: true)
                    logRow(tile: .flip, min: "41분", label: "엎기 · 21:40", right: .date("5.20"), divider: true)
                    logRow(tile: .tap, min: "33분", label: "탭 · 08:32", right: .date("5.19"), divider: true)
                    logRow(tile: .manual, min: "28분", label: "직접 추가", right: .date("5.18"), divider: true)
                    logRow(tile: .flip, min: "19분", label: "엎기 · 22:05", right: .date("5.17"), divider: false)
                }
                Spacer(minLength: 0)
            }
            .padding(EdgeInsets(top: 100 + 2, leading: 24, bottom: 20, trailing: 24))
            header
        }
        .frame(width: 390, height: 844)
        .accessibilityIdentifier("detail.screen")
    }

    var header: some View {
        HStack {
            RTIcon(RTIconPath.back, size: 17, viewBox: 20, stroke: RT.body, lineWidth: 2.2)
                .frame(width: 38, height: 38)
                .contentShape(Rectangle())
                .onTapGesture { model.map { $0.nav($0.detailOrigin) } }   // 진입 출처로 복귀 (홈/서재)
            Spacer()
            if !readOnly {   // 파트너 책엔 책 메뉴(삭제) 없음
                VStack(spacing: 3.2) {
                    ForEach(0..<3, id: \.self) { _ in
                        Circle().fill(RT.muted).frame(width: 4.8, height: 4.8)
                    }
                }
                .frame(width: 38, height: 38)
                .contentShape(Rectangle())
                .onTapGesture { model?.openSheet(.bookmenu) }
            } else {
                Color.clear.frame(width: 38, height: 38)
            }
        }
        .padding(EdgeInsets(top: 52, leading: 18, bottom: 8, trailing: 18))
        .background(RT.paper)
    }

    var topBlock: some View {
        HStack(alignment: .top, spacing: 18) {
            Group {
                if let live {
                    RTRemoteCover(url: live.book.coverUrl, size: .init(width: 104, height: 152), radius: 5)
                } else {
                    FlowCover(.init(width: 104, height: 152, spine: 4, frameInset: 7,
                                    padTop: 15, padBottom: 11, authorEN: 5,
                                    titleSize: 29, titleTop: 17, flowSize: 6.5, flowTop: 6,
                                    ruleWidth: 24, authorKR: 6.5))
                }
            }
            .shadow(color: Color(hex: 0x3A2C1C, alpha: 0.45), radius: 12, x: 0, y: 16)
            .rtFloat(duration: 8)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    Circle().fill(RT.green).frame(width: 5, height: 5)
                    Text(live?.book.finished == true ? "완독" : "읽는 중")
                        .font(.sans(10.5, 700)).foregroundColor(RT.green)
                }
                .padding(EdgeInsets(top: 4, leading: 10, bottom: 4, trailing: 10))
                .background(RoundedRectangle(cornerRadius: 12).fill(RT.greenTint))
                Text(live?.book.title ?? "몰입").font(.sans(23, 900)).tracking(23 * -0.03)
                    .foregroundColor(RT.ink).padding(.top, 11)
                    .lineLimit(2)
                Text(live.map { l in [l.book.author, l.book.publisher].filter { !$0.isEmpty }
                        .joined(separator: " · ") } ?? "미하이 칙센트미하이 · 한울림")
                    .font(.sans(12.5, 500))
                    .foregroundColor(RT.muted).padding(.top, 5)
                    .lineLimit(1)
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(live?.total ?? "4:12").font(.mono(28, 700)).tracking(28 * -0.03).foregroundColor(RT.ink)
                    Text(live.map { "누적 · \($0.count)\($0.isMillie ? "일 읽음" : "회") · \($0.days)일째" }
                         ?? "누적 · 8회 · 18일째")
                        .font(.mono(11, 500)).foregroundColor(RT.faint)
                }
                .padding(.top, 14)
            }
            .padding(.top, 2)
        }
    }

    var ctas: some View {
        GeometryReader { row in
            if live?.book.finished == true {
                // 완독 책: 다시 읽기 단일 CTA — 완독 해제(별점·완독일 보존) 후 그 책으로 세션 시작
                HStack(spacing: 9) {
                    RTIcon(RTIconPath.play, size: 16, fill: RT.ctaText)
                    Text("다시 읽기").font(.sans(15, 800)).foregroundColor(RT.ctaText)
                }
                .frame(width: row.size.width, height: 52)
                .background(RT.ctaGrad(CGSize(width: row.size.width, height: 52)))
                .clipShape(RoundedRectangle(cornerRadius: 15))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.35), radius: 8, x: 0, y: 10)
                .contentShape(Rectangle())
                .onTapGesture { model?.rereadBook() }
            } else {
            let mainW = (row.size.width - 9) * 1.6 / 2.6 // flex 1.6 : 1
            HStack(spacing: 9) {
                if live?.book.millieBookId != nil {
                    // 밀리 편입 책 — 세션 시작이 무의미(자동 수집). 사용자 확정(2026-09-01):
                    // 이어서 읽기 자리를 비활성으로 두고 '밀리의 서재' 표기. 홈 readCTADisabled 문법.
                    HStack(spacing: 8) {
                        RTIcon(RTIconPath.check, size: 15, stroke: RT.faint, lineWidth: 2.2)
                        Text("밀리의 서재").font(.sans(15, 800)).foregroundColor(RT.faint)
                    }
                    .frame(width: mainW, height: 52)
                    .background(RoundedRectangle(cornerRadius: 15).fill(RT.segBg))
                    .overlay(RoundedRectangle(cornerRadius: 15).strokeBorder(Color(hex: 0xE5DFCD), lineWidth: 1))
                } else {
                HStack(spacing: 9) {
                    RTIcon(RTIconPath.play, size: 16, fill: RT.ctaText)
                    Text("이어서 읽기").font(.sans(15, 800)).foregroundColor(RT.ctaText)
                }
                .frame(width: mainW, height: 52)
                .background(RT.ctaGrad(CGSize(width: mainW, height: 52)))
                .clipShape(RoundedRectangle(cornerRadius: 15))
                .shadow(color: Color(hex: 0x26413A, alpha: 0.35), radius: 8, x: 0, y: 10) // 0 14 24 -10 근사
                .contentShape(Rectangle())
                .onTapGesture { model?.continueReading() }
                }
                HStack(spacing: 6) {
                    RTIcon(RTIconPath.check, size: 15, stroke: RT.green, lineWidth: 2.4)
                    Text("완독").font(.sans(13.5, 700)).foregroundColor(Color(hex: 0x4A5A44))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(RoundedRectangle(cornerRadius: 15).fill(RT.surface))
                .overlay(RoundedRectangle(cornerRadius: 15).stroke(Color(hex: 0xE5DFCD), lineWidth: 1))
                .contentShape(Rectangle())
                .onTapGesture { model?.openSheet(.finish) }
            }
            }
        }
        .frame(height: 52)
    }

    var logHead: some View {
        HStack {
            Text("기록").font(.sans(14.5, 800)).foregroundColor(RT.ink)
            Spacer()
            // 파트너 책 + 밀리 편입 책엔 '직접 추가' 없음 — 밀리 상세의 기록은 일별 뷰라
            // 수동 세션을 넣어도 화면에 나타나지 않는다(자동 수집 문법과도 모순)
            if !readOnly && live?.isMillie != true {
                HStack(spacing: 5) {
                    ZStack {
                        Circle().stroke(RT.muted, lineWidth: 2 * 12 / 24).frame(width: 8, height: 8)
                        RTIcon(RTIconPath.clock, size: 12, stroke: RT.muted, lineWidth: 2)
                    }
                    Text("직접 추가").font(.sans(11.5, 600)).foregroundColor(RT.muted)
                }
                .contentShape(Rectangle())
                .onTapGesture { model?.openSheet(.addtime) }
            }
        }
    }

    enum Tile { case flip, tap, manual, millie }
    enum Right { case today, date(String) }

    func logRow(tile: Tile, min: String, label: String, right: Right, divider: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 13) {
                RoundedRectangle(cornerRadius: 10)
                    .fill(tile == .flip ? RT.greenTint : (tile == .millie ? RT.amberTint : RT.segBg))
                    .frame(width: 32, height: 32)
                    .overlay(tileIcon(tile))
                HStack(spacing: 8) {
                    Text(min).font(.mono(15, 700)).foregroundColor(RT.ink)
                    Text(label).font(.sans(12, 500)).foregroundColor(RT.muted)
                }
                Spacer()
                switch right {
                case .today:
                    Text("오늘").font(.sans(12, 600)).foregroundColor(RT.body)
                case .date(let d):
                    Text(d).font(.mono(11.5, 500)).foregroundColor(RT.faint)
                }
            }
            .padding(EdgeInsets(top: 13, leading: 2, bottom: 13, trailing: 2))
            if divider { Rectangle().fill(RT.hair2).frame(height: 1) }
        }
    }

    @ViewBuilder
    func tileIcon(_ t: Tile) -> some View {
        switch t {
        case .flip: FlipIcon(size: 15, color: RT.green, lineWidth: 2)
        case .tap: RTIcon(RTIconPath.tapZone, size: 15, stroke: RT.muted, lineWidth: 2)
        case .manual:
            ZStack {
                Circle().stroke(RT.muted, lineWidth: 2 * 15 / 24).frame(width: 10, height: 10)
                RTIcon(RTIconPath.clock, size: 15, stroke: RT.muted, lineWidth: 2)
            }
        case .millie: RTIcon(RTIconPath.check, size: 15, stroke: RT.amber, lineWidth: 2.2)
        }
    }
}

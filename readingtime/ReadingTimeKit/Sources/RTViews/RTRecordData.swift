import SwiftUI
import CoreGraphics

// 기록(주·월·지도) 데이터 모델 + 순수 엔진.
// 정본: 작업지시서 design_handoff_record_stats/README.md + mockups/RTRecord.dc.html 의 class Component.
// 뷰는 이 엔진의 파생값만 렌더한다 (로직·수치는 전부 여기, 화면엔 없음).

// ── 표지 페인트 (solid | linear-gradient) ── 목업 books[].bg 그대로.
public enum RTFill: Equatable, Sendable {
    case solid(UInt32)
    case gradient(Double, [UInt32])   // CSS deg, 2 stop

    public func paint(_ size: CGSize) -> AnyShapeStyle {
        switch self {
        case .solid(let hex):
            return AnyShapeStyle(Color(hex: hex))
        case .gradient(let deg, let hexes):
            let n = max(1, hexes.count - 1)
            let stops = hexes.enumerated().map { (Color(hex: $0.element), Double($0.offset) / Double(n)) }
            return AnyShapeStyle(LinearGradient.css(deg, size: size, stops))
        }
    }
}

public struct RTRecBook: Sendable {
    public let title: String
    public let short: String        // 핀·캘린더용 축약 ("\n" = 줄바꿈)
    public let author: String
    public let fill: RTFill
    public let tc: UInt32           // 표지 글자색
    public let dot: UInt32          // 강조색 (팝오버 점·랭킹 진행바)
    public let millie: Bool
    public var coverUrl = ""        // §14 실표지 (실데이터) — "" = 색+제목 플레이스홀더(데모)
}

public struct RTRecSession: Sendable {
    public let book: Int
    public let min: Int
    public let iso: String          // "2026-06-20"
    public let short: String        // "6.20"
}

public struct RTRecPlace: Sendable {
    public let id: String
    public let name: String
    public let sub: String
    public let lat: Double
    public let lng: Double
    public let s: [RTRecSession]

    var totalMin: Int { s.reduce(0) { $0 + $1.min } }
}

public struct RTRecWeekDay: Sendable {
    public let lbl: String
    public let min: Int
    public let sun: Bool
    public let today: Bool
    public let sp: [(book: Int, min: Int)]   // 그날 책별 분해
}

// ── §12 데모 데이터 (시안과 동일 화면을 위해 그대로 사용) ──
public enum RTRecordDemo {
    public static let books: [RTRecBook] = [
        RTRecBook(title: "몰입", short: "몰입", author: "황농문",
                  fill: .gradient(168, [0xEEE1BC, 0xE3D09E]), tc: 0x241C0D, dot: 0xD8C184, millie: false),
        RTRecBook(title: "돈의 심리학", short: "돈의\n심리학", author: "모건 하우절",
                  fill: .solid(0x1F2D45), tc: 0xE9EDF5, dot: 0x3D5575, millie: false),
        RTRecBook(title: "도둑맞은 집중력", short: "집중력", author: "요한 하리",
                  fill: .solid(0xE4572E), tc: 0xFFFFFF, dot: 0xE4572E, millie: true),
        RTRecBook(title: "작별하지 않는다", short: "작별", author: "한강",
                  fill: .solid(0xE9EAE2), tc: 0x2B3A34, dot: 0x38564E, millie: false),
        RTRecBook(title: "파친코", short: "파친코", author: "이민진",
                  fill: .gradient(180, [0x7D2F2A, 0x3F1414]), tc: 0xF3DDC8, dot: 0x8A3B3B, millie: false),
        RTRecBook(title: "미드나잇 라이브러리", short: "미드\n나잇", author: "매트 헤이그",
                  fill: .gradient(200, [0x243A72, 0x0D1533]), tc: 0xDFE4FF, dot: 0x3A56A0, millie: false),
        RTRecBook(title: "1984", short: "1984", author: "조지 오웰",
                  fill: .gradient(160, [0x232323, 0x0C0C0C]), tc: 0xE9C6BD, dot: 0xC0392B, millie: false),
        RTRecBook(title: "페스트", short: "페스트", author: "알베르 카뮈",
                  fill: .solid(0xD9CBB0), tc: 0x4A3D24, dot: 0xB8985F, millie: false),
        RTRecBook(title: "노르웨이의 숲", short: "노르\n웨이", author: "무라카미 하루키",
                  fill: .gradient(180, [0x2F6B50, 0x173F31]), tc: 0xDCEEE2, dot: 0x2E6B4F, millie: false),
        RTRecBook(title: "사피엔스", short: "사피\n엔스", author: "유발 하라리",
                  fill: .gradient(170, [0xEFB43E, 0xD68F1E]), tc: 0x3A2606, dot: 0xE0982A, millie: false),
    ]

    static func s(_ b: Int, _ m: Int, _ iso: String, _ sh: String) -> RTRecSession {
        RTRecSession(book: b, min: m, iso: iso, short: sh)
    }

    public static let places: [RTRecPlace] = [
        RTRecPlace(id: "seoul", name: "서울", sub: "대한민국 · 홈", lat: 37.5, lng: 127.0, s: [
            s(0, 180, "2026-06-20", "6.20"), s(0, 150, "2026-06-08", "6.08"),
            s(1, 120, "2026-05-14", "5.14"), s(3, 96, "2026-05-09", "5.09"),
            s(9, 88, "2026-06-16", "6.16"), s(2, 64, "2026-05-24", "5.24"),
            s(6, 54, "2026-04-30", "4.30"),
        ]),
        RTRecPlace(id: "jeju", name: "제주", sub: "대한민국", lat: 33.5, lng: 126.5, s: [
            s(8, 72, "2026-05-30", "5.30"), s(8, 40, "2026-05-31", "5.31"),
        ]),
        RTRecPlace(id: "tokyo", name: "도쿄", sub: "일본", lat: 35.7, lng: 139.7, s: [
            s(4, 88, "2026-06-05", "6.05"), s(8, 52, "2026-06-04", "6.04"), s(4, 36, "2026-06-06", "6.06"),
        ]),
        RTRecPlace(id: "hongkong", name: "홍콩", sub: "홍콩", lat: 22.3, lng: 114.2, s: [
            s(6, 66, "2026-04-18", "4.18"),
        ]),
        RTRecPlace(id: "bangkok", name: "방콕", sub: "태국", lat: 13.8, lng: 100.5, s: [
            s(7, 58, "2026-03-22", "3.22"),
        ]),
        RTRecPlace(id: "singapore", name: "싱가포르", sub: "싱가포르", lat: 1.35, lng: 103.8, s: [
            s(9, 74, "2026-02-11", "2.11"),
        ]),
        RTRecPlace(id: "dubai", name: "두바이", sub: "아랍에미리트", lat: 25.2, lng: 55.3, s: [
            s(5, 84, "2026-06-12", "6.12"), s(9, 40, "2026-06-11", "6.11"),
        ]),
        RTRecPlace(id: "paris", name: "파리", sub: "프랑스", lat: 48.9, lng: 2.35, s: [
            s(7, 90, "2026-05-16", "5.16"), s(3, 60, "2026-05-15", "5.15"),
        ]),
        RTRecPlace(id: "london", name: "런던", sub: "영국", lat: 51.5, lng: -0.13, s: [
            s(5, 70, "2026-05-09", "5.09"), s(6, 44, "2026-05-08", "5.08"),
        ]),
        RTRecPlace(id: "rome", name: "로마", sub: "이탈리아", lat: 41.9, lng: 12.5, s: [
            s(9, 52, "2026-05-02", "5.02"),
        ]),
        RTRecPlace(id: "ny", name: "뉴욕", sub: "미국", lat: 40.7, lng: -74.0, s: [
            s(4, 96, "2026-06-24", "6.24"), s(2, 48, "2026-06-23", "6.23"),
        ]),
        RTRecPlace(id: "la", name: "LA", sub: "미국", lat: 34.05, lng: -118.24, s: [
            s(5, 60, "2026-01-20", "1.20"),
        ]),
        RTRecPlace(id: "sydney", name: "시드니", sub: "호주", lat: -33.87, lng: 151.21, s: [
            s(8, 55, "2026-03-05", "3.05"),
        ]),
    ]

    // 주간 (월~일) 합 446 = 7:26, today = 목(idx3)
    public static let week: [RTRecWeekDay] = [
        RTRecWeekDay(lbl: "월", min: 52, sun: false, today: false, sp: [(0, 52)]),
        RTRecWeekDay(lbl: "화", min: 74, sun: false, today: false, sp: [(0, 40), (9, 34)]),
        RTRecWeekDay(lbl: "수", min: 43, sun: false, today: false, sp: [(1, 43)]),
        RTRecWeekDay(lbl: "목", min: 96, sun: false, today: true, sp: [(0, 60), (1, 36)]),
        RTRecWeekDay(lbl: "금", min: 63, sun: false, today: false, sp: [(3, 63)]),
        RTRecWeekDay(lbl: "토", min: 34, sun: false, today: false, sp: [(2, 34)]),
        RTRecWeekDay(lbl: "일", min: 84, sun: true, today: false, sp: [(0, 50), (9, 34)]),
    ]

    // 주 범위·델타 (§3)
    public static let weekRange = "5.18 – 5.24"
    public static let weekDeltaMin = 52

    // 월간 상수 (§12)
    public static let monthTitle = "2026년 5월"
    public static let monthTotalHM = "21:08"
    public static let monthReadDays = 17
    public static let monthElapsedDays = 21
    public static let monthWeekMins = [190, 324, 362, 288, 104]
    public static let monthCurrentWeek = 3               // idx (4주)
    public static let monthAgg: [(book: Int, min: Int)] = [(0, 372), (9, 228), (3, 150), (8, 125), (1, 100)]
    public static let monthToday = 21
    public static let monthNoRead: Set<Int> = [4, 11, 14, 18]
    public static let monthLeadingBlanks = 4             // 2026-05-01 = 금 (월요일 시작)
    public static let monthDays = 31

    // 지도 통계 칩 (표시용 상수 — 실앱은 집계값)
    public static let mapChip = "13개 도시 · 5개 대륙"

    public static let streak = 23
    public static let peakLabel = "주로 밤 9–11시"
}

// ── 순수 엔진 ──
public enum RTRecord {

    // §2 헬퍼 (정확히 이 로직)
    public static func fmtHM(_ min: Int) -> String {
        "\(min / 60):" + String(format: "%02d", min % 60)
    }
    public static func fmtKorMin(_ min: Int) -> String {
        let h = min / 60, m = min % 60
        return h > 0 ? "\(h)시간 \(m)분" : "\(m)분"
    }
    static func clamp(_ v: Double, _ a: Double, _ b: Double) -> Double { max(a, min(b, v)) }

    // §5.1 등장방형 투영 — 1000×500 월드
    public static func proj(lat: Double, lng: Double) -> CGPoint {
        CGPoint(x: (lng + 180) / 360 * 1000, y: (90 - lat) / 180 * 500)
    }

    // ── §13 실데이터 집계 — RTUserData → 지도 엔진이 먹는 (places, books) ──
    // 위치(placeId)가 있는 세션만 지도에 오른다. 좌표는 그 place 의 첫 세션 좌표.
    // 표지는 실제 이미지(coverUrl)라 여기선 색 플레이스홀더를 쓰지 않고, 뷰가 coverUrl 로 렌더한다.
    public static func live(from data: RTUserData) -> (places: [RTRecPlace], books: [RTRecBook]) {
        let cal = Calendar(identifier: .gregorian)
        func isoStr(_ d: Date) -> String {
            String(format: "%04d-%02d-%02d",
                   cal.component(.year, from: d), cal.component(.month, from: d), cal.component(.day, from: d))
        }
        func shortStr(_ d: Date) -> String {
            "\(cal.component(.month, from: d)).\(String(format: "%02d", cal.component(.day, from: d)))"
        }

        // 책 인덱스 (등장 순) — 엔진은 books 를 인덱스로 참조한다
        var bookIdx: [String: Int] = [:]
        var books: [RTRecBook] = []
        func indexOf(_ isbn: String?, _ data: RTUserData) -> Int? {
            guard let isbn else { return nil }
            if let i = bookIdx[isbn] { return i }
            guard let b = data.books.first(where: { $0.isbn == isbn }) else { return nil }
            let i = books.count
            bookIdx[isbn] = i
            books.append(RTRecBook(title: b.title, short: b.title, author: b.author,
                                   fill: .solid(0xE8E2D2), tc: 0x3A2C1C, dot: 0x8C8570, millie: false,
                                   coverUrl: b.coverUrl))
            return i
        }

        var order: [String] = []
        var byPlace: [String: (name: String, sub: String, lat: Double, lng: Double, s: [RTRecSession])] = [:]
        for rec in data.sessions.sorted(by: { $0.endedAt < $1.endedAt }) {
            guard let pid = rec.placeId, let lat = rec.latitude, let lng = rec.longitude,
                  let bi = indexOf(rec.isbn, data) else { continue }
            let se = RTRecSession(book: bi, min: rec.seconds / 60,
                                  iso: isoStr(rec.endedAt), short: shortStr(rec.endedAt))
            if byPlace[pid] == nil {
                order.append(pid)
                byPlace[pid] = (rec.placeName ?? pid, rec.country ?? "", lat, lng, [se])
            } else {
                byPlace[pid]!.s.append(se)
            }
        }
        let places = order.map { pid -> RTRecPlace in
            let p = byPlace[pid]!
            return RTRecPlace(id: pid, name: p.name, sub: p.sub, lat: p.lat, lng: p.lng, s: p.s)
        }
        return (places, books)
    }

    // ── §3 주간 ──
    /// 막대 높이 = round(12 + min/96*72), maxMin = 96
    public static func weekBarH(_ min: Int) -> CGFloat {
        CGFloat((12 + Double(min) / 96 * 72).rounded())
    }

    public struct TipRow: Sendable { public let dot: UInt32; public let title: String; public let min: Int }
    public struct Tip: Sendable {
        public let leftPct: Double
        public let date: String
        public let rows: [TipRow]
    }
    public static func weekTip(day: Int) -> Tip {
        let d = RTRecordDemo.week[day]
        return Tip(leftPct: (Double(day) + 0.5) / 7 * 100,
                   date: "5.\(18 + day) \(d.lbl) · \(d.min)분",
                   rows: d.sp.map { TipRow(dot: RTRecordDemo.books[$0.book].dot,
                                           title: RTRecordDemo.books[$0.book].title, min: $0.min) })
    }

    public struct Rank: Sendable {
        public let book: Int
        public let title: String
        public let fill: RTFill
        public let tc: UInt32
        public let dot: UInt32
        public let tag: String          // "밀리" 또는 ""
        public let pct: Int
        public let total: String
        public let short: String
    }
    private static func ranks(_ agg: [(book: Int, min: Int)], top: Int) -> [Rank] {
        let mx = agg.map(\.min).max() ?? 1
        return agg.prefix(top).map { x in
            let b = RTRecordDemo.books[x.book]
            return Rank(book: x.book, title: b.title, fill: b.fill, tc: b.tc, dot: b.dot,
                        tag: b.millie ? "밀리" : "",
                        pct: Int((Double(x.min) / Double(mx) * 100).rounded()),
                        total: fmtHM(x.min), short: b.short)
        }
    }

    /// 이번 주 많이 읽은 책 (상위 3) — 주간 세션 합산 내림차순
    public static func weekRanks() -> [Rank] {
        var agg: [Int: Int] = [:]
        for d in RTRecordDemo.week { for x in d.sp { agg[x.book, default: 0] += x.min } }
        // JS Object.entries 는 정수 키 오름차순 → 그 순서에서 안정 내림차순 정렬
        let ordered = agg.keys.sorted().map { (book: $0, min: agg[$0]!) }
        let sorted = ordered.enumerated()
            .sorted { $0.element.min != $1.element.min ? $0.element.min > $1.element.min : $0.offset < $1.offset }
            .map(\.element)
        return ranks(sorted, top: 3)
    }

    /// 이달 많이 읽은 책 (상위 4)
    public static func monthRanks() -> [Rank] { ranks(RTRecordDemo.monthAgg, top: 4) }

    public struct StreakDot: Sendable { public let color: UInt32; public let isLast: Bool }
    public static func streakDots() -> [StreakDot] {
        let cols: [UInt32] = [0xEEE7D4, 0xEEE7D4, 0xDD9C8B, 0xDD9C8B, 0xD67D63, 0xD67D63, 0xD67D63,
                              0xCD6647, 0xCD6647, 0xCD6647, 0xC2553A, 0xC2553A, 0xC2553A, 0xC2553A]
        return cols.enumerated().map { StreakDot(color: $0.element, isLast: $0.offset == 13) }
    }

    // ── §4 월간 ──
    public struct MonthWeek: Sendable {
        public let lbl: String
        public let val: String
        public let h: CGFloat
        public let current: Bool
    }
    /// 주차별 막대 — h = round(8 + v/362*40)
    public static func monthWeeks() -> [MonthWeek] {
        let mw = RTRecordDemo.monthWeekMins
        let mx = Double(mw.max() ?? 1)
        return mw.enumerated().map { i, v in
            MonthWeek(lbl: "\(i + 1)주", val: fmtHM(v),
                      h: CGFloat((8 + Double(v) / mx * 40).rounded()),
                      current: i == RTRecordDemo.monthCurrentWeek)
        }
    }

    public struct CalCell: Sendable {
        public let day: Int?            // nil = 앞 빈칸
        public let cover: RTFill?       // nil = 안 읽은 날 / 미래
        public let today: Bool
        public let future: Bool
        public let sunday: Bool
    }
    public static func calendarCells() -> [CalCell] {
        var out = [CalCell](repeating: CalCell(day: nil, cover: nil, today: false, future: false, sunday: false),
                            count: RTRecordDemo.monthLeadingBlanks)
        for d in 1...RTRecordDemo.monthDays {
            let col = (RTRecordDemo.monthLeadingBlanks + d - 1) % 7   // 0=월 … 6=일
            let today = d == RTRecordDemo.monthToday
            let future = d > RTRecordDemo.monthToday
            let read = !future && !RTRecordDemo.monthNoRead.contains(d)
            let bk = RTRecordDemo.books[(d * 3 + 5) % RTRecordDemo.books.count]
            out.append(CalCell(day: d, cover: read ? bk.fill : nil,
                               today: today, future: future, sunday: col == 6))
        }
        return out
    }

    // ── §5.3~5.4 클러스터 · 마커 ──
    // 투영은 SDK가 담당(§5.1) — 클러스터링은 "각 place의 현재 화면좌표" 만 받아 52px 체인으로 묶는다.
    // 실기기: MapKit 카메라 기준 좌표(MKMapPoint 투영). 헤드리스(rtshot): 목업 등장방형 투영.
    public struct Marker: Sendable, Identifiable {
        public let id: String
        public let left: CGFloat        // centroid 화면 x (헤드리스 배치용)
        public let top: CGFloat         // centroid 화면 y
        public let centroidLat: Double  // centroid 위경도 (MapKit annotation 배치용)
        public let centroidLng: Double
        public let coverFill: RTFill
        public let coverTC: UInt32
        public let coverTitle: String
        public let coverUrl: String     // §14 실표지 ("" = 플레이스홀더)
        public let s1Url: String?
        public let s2Url: String?
        public let count: Int
        public let showBadge: Bool
        public let hasStack: Bool
        public let hasS2: Bool
        public let s1: RTFill?
        public let s2: RTFill?
        public let label: String
        public let isCluster: Bool
        public let placeId: String
        public let members: [String]
        public let w: CGFloat
        public let hpx: CGFloat
        public let shadowW: CGFloat
        public let z: Double
    }

    static let clusterTH: Double = 52   // 화면 거리 임계 (px)

    /// 체인(BFS/LIFO) 클러스터 — 목업 computeMarkers 그대로 (그룹 순서·시드 순서 보존).
    /// screenPos: place → 현재 화면좌표 (투영 주체가 주입).
    static func groups(_ places: [RTRecPlace], _ screenPos: (RTRecPlace) -> CGPoint) -> [[Int]] {
        let pts = places.map(screenPos)
        var used = [Bool](repeating: false, count: pts.count)
        var out: [[Int]] = []
        for i in pts.indices where !used[i] {
            var g = [i]
            used[i] = true
            var stack = [i]
            while let k = stack.popLast() {
                for j in pts.indices where !used[j] {
                    if hypot(pts[k].x - pts[j].x, pts[k].y - pts[j].y) < clusterTH {
                        used[j] = true
                        g.append(j)
                        stack.append(j)
                    }
                }
            }
            out.append(g)
        }
        return out
    }

    /// 마커 파생 — screenPos 로 클러스터링 후 대표표지·배지·스택·라벨·centroid 계산.
    public static func clusters(_ screenPos: (RTRecPlace) -> CGPoint,
                                places: [RTRecPlace] = RTRecordDemo.places,
                                books: [RTRecBook] = RTRecordDemo.books) -> [Marker] {
        groups(places, screenPos).enumerated().map { idx, g in
            // 그룹 전 세션을 iso 내림차순 (동률은 삽입 순서 유지 = JS 안정 정렬)
            var all: [(b: Int, iso: String, place: Int)] = []
            for gi in g { for se in places[gi].s { all.append((se.book, se.iso, gi)) } }
            let sorted = all.enumerated()
                .sorted { $0.element.iso != $1.element.iso ? $0.element.iso > $1.element.iso : $0.offset < $1.offset }
                .map(\.element)

            let rep = books[sorted[0].b]
            var seen = Set<Int>()
            var distB: [Int] = []
            for a in sorted where !seen.contains(a.b) { seen.insert(a.b); distB.append(a.b) }
            let distinct = distB.count
            let isCluster = g.count > 1
            let dom = g.max { places[$0].totalMin < places[$1].totalMin }!   // 누적 분 최대
            let pts = g.map { screenPos(places[$0]) }
            let sx = pts.reduce(0.0) { $0 + $1.x } / Double(g.count)
            let sy = pts.reduce(0.0) { $0 + $1.y } / Double(g.count)
            let cLat = g.reduce(0.0) { $0 + places[$1].lat } / Double(g.count)
            let cLng = g.reduce(0.0) { $0 + places[$1].lng } / Double(g.count)
            let w: CGFloat = isCluster ? 36 : 32

            func stackUrl(_ i: Int) -> String? {
                guard distB.count > i, !books[distB[i]].coverUrl.isEmpty else { return nil }
                return books[distB[i]].coverUrl
            }
            return Marker(
                id: "c\(idx)",
                left: CGFloat(sx.rounded()), top: CGFloat(sy.rounded()),
                centroidLat: cLat, centroidLng: cLng,
                coverFill: rep.fill, coverTC: rep.tc,
                coverTitle: rep.short.isEmpty ? rep.title : rep.short,
                coverUrl: rep.coverUrl, s1Url: stackUrl(1), s2Url: stackUrl(2),
                count: distinct, showBadge: distinct > 1,
                hasStack: distinct > 1, hasS2: distinct > 2,
                s1: distB.count > 1 ? books[distB[1]].fill : nil,
                s2: distB.count > 2 ? books[distB[2]].fill : nil,
                label: isCluster ? "\(places[dom].name) 외 \(g.count - 1)" : places[g[0]].name,
                isCluster: isCluster, placeId: places[g[0]].id,
                members: g.map { places[$0].id },
                w: w, hpx: isCluster ? 50 : 44,
                shadowW: CGFloat(((Double(w) + 6) * 0.72).rounded()),
                z: isCluster ? 20 : 10)
        }
    }

    /// 헤드리스(rtshot) · 엔진 테스트용 — 목업 등장방형 투영(scale·tx·ty)으로 클러스터.
    public static func markers(scale: Double, tx: Double, ty: Double,
                               places: [RTRecPlace] = RTRecordDemo.places,
                               books: [RTRecBook] = RTRecordDemo.books) -> [Marker] {
        clusters({ p in
            let q = proj(lat: p.lat, lng: p.lng)
            return CGPoint(x: q.x * scale + tx, y: q.y * scale + ty)
        }, places: places, books: books)
    }

    /// 헤드리스 정적 렌더용 기본 뷰 (목업 기본 뷰 — 실기기는 MapKit 카메라가 대체)
    public static let defaultView: (scale: Double, tx: Double, ty: Double) = (0.46, -88, 258)

    // ── §5.6 탭 규칙 ──
    public enum Target: Equatable, Sendable {
        case book(Int)
        case sheet([String])
    }

    static func place(_ id: String, _ places: [RTRecPlace]) -> RTRecPlace {
        places.first { $0.id == id }!
    }

    public static func distinctBooks(_ ids: [String], places: [RTRecPlace] = RTRecordDemo.places) -> [Int] {
        var seen = Set<Int>()
        var out: [Int] = []
        for id in ids {
            for se in place(id, places).s where !seen.contains(se.book) {
                seen.insert(se.book); out.append(se.book)
            }
        }
        return out
    }

    /// 단일 place 탭 — distinct 책 1권 → 책 상세 직행, 2권 이상 → 장소 시트 (§5.6-4)
    public static func openTarget(_ ids: [String], places: [RTRecPlace] = RTRecordDemo.places) -> Target {
        let db = distinctBooks(ids, places: places)
        return db.count == 1 ? .book(db[0]) : .sheet(ids)
    }

    // ── §6 장소 시트 ──
    public struct SheetCover: Sendable {
        public let bookId: Int
        public let title: String
        public let fill: RTFill
        public let tc: UInt32
        public let millie: Bool
        public let time: String
        public let coverUrl: String     // §14 실표지 ("" = 플레이스홀더)
    }
    public struct PlaceSheet: Sendable {
        public let ids: [String]
        public let name: String
        public let sub: String
        public let statBooks: Int
        public let statTime: String
        public let period: String
        public let covers: [SheetCover]
    }

    public static func buildSheet(_ ids: [String], places: [RTRecPlace] = RTRecordDemo.places,
                                  books: [RTRecBook] = RTRecordDemo.books) -> PlaceSheet {
        // 대표 place = 세션수 내림차순 (동률은 원순서 — JS 안정 정렬)
        let ps = ids.map { place($0, places) }.enumerated()
            .sorted { $0.element.s.count != $1.element.s.count
                ? $0.element.s.count > $1.element.s.count : $0.offset < $1.offset }
            .map(\.element)
        let dom = ps[0]
        let name = dom.name
        let sub = ps.count > 1
            ? (dom.sub.components(separatedBy: " · ").first ?? dom.sub) + " · \(ps.count)개 지역"
            : dom.sub

        // 책별 합산 (첫 등장 순 유지 후 분 내림차순 — JS Object.values 삽입 순 + 안정 정렬)
        var order: [Int] = []
        var byBook: [Int: Int] = [:]
        var allS: [RTRecSession] = []
        for p in ps.isEmpty ? [] : ids.map({ place($0, places) }) {
            for se in p.s {
                allS.append(se)
                if byBook[se.book] == nil { order.append(se.book) }
                byBook[se.book, default: 0] += se.min
            }
        }
        let covers = order.enumerated()
            .sorted { byBook[$0.element]! != byBook[$1.element]!
                ? byBook[$0.element]! > byBook[$1.element]! : $0.offset < $1.offset }
            .map { (_, b) -> SheetCover in
                let bk = books[b]
                return SheetCover(bookId: b, title: bk.title, fill: bk.fill, tc: bk.tc,
                                  millie: bk.millie, time: fmtKorMin(byBook[b]!), coverUrl: bk.coverUrl)
            }
        let totMin = allS.reduce(0) { $0 + $1.min }
        let dsort = allS.sorted { $0.iso < $1.iso }
        let period = dsort.count > 1 ? "\(dsort[0].short) – \(dsort[dsort.count - 1].short)" : dsort[0].short

        return PlaceSheet(ids: ids, name: name, sub: sub, statBooks: covers.count,
                          statTime: fmtHM(totMin), period: period, covers: covers)
    }

    // ── §7 책 상세 ──
    public struct BookRow: Sendable {
        public let date: String
        public let place: String
        public let dur: String
    }
    public struct BookDetail: Sendable {
        public let id: Int
        public let title: String
        public let author: String
        public let fill: RTFill
        public let tc: UInt32
        public let millie: Bool
        public let coverUrl: String     // §14 실표지 ("" = 플레이스홀더)
        public let tag: String
        public let statTime: String
        public let statSessions: Int
        public let statPlaces: Int
        public let places: [String]
        public let sessions: [BookRow]
    }

    /// 해당 책의 모든 place 세션 집계 (위치 무관, 전체). iso 내림차순.
    public static func buildBook(_ id: Int, places: [RTRecPlace] = RTRecordDemo.places,
                                 books: [RTRecBook] = RTRecordDemo.books) -> BookDetail {
        let bk = books[id]
        var sess: [(short: String, iso: String, place: String, min: Int)] = []
        for p in places { for se in p.s where se.book == id {
            sess.append((se.short, se.iso, p.name, se.min))
        } }
        let sorted = sess.enumerated()
            .sorted { $0.element.iso != $1.element.iso ? $0.element.iso > $1.element.iso : $0.offset < $1.offset }
            .map(\.element)
        let totMin = sorted.reduce(0) { $0 + $1.min }
        var seen = Set<String>()
        var pl: [String] = []
        for s in sorted where !seen.contains(s.place) { seen.insert(s.place); pl.append(s.place) }

        return BookDetail(
            id: id, title: bk.title, author: bk.author, fill: bk.fill, tc: bk.tc, millie: bk.millie,
            coverUrl: bk.coverUrl,
            tag: bk.millie ? "밀리의서재" : "직접 기록",
            statTime: fmtHM(totMin), statSessions: sorted.count, statPlaces: pl.count,
            places: pl,
            sessions: sorted.map { BookRow(date: $0.short, place: $0.place, dur: fmtKorMin($0.min)) })
    }
}

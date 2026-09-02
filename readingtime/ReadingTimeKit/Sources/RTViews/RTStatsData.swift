import SwiftUI
import CoreGraphics

// 기록(통계) 원페이지 데이터 모델 + 순수 엔진.
// 정본: design_handoff_record_onepage/README.md + mockups/RTRecordOnePage.dc.html 의 class Component.
// 뷰는 이 엔진의 파생값만 렌더한다 (집계·정렬·클러스터·시트 문구는 전부 여기).

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

public struct RTStatsBook: Sendable, Equatable {
    public let title: String
    public let author: String
    public let short: String        // 데모 표지 축약 ("\n" = 줄바꿈)
    public let fill: RTFill         // 데모 표지 색면
    public let tc: UInt32
    public let millie: Bool
    public var coverUrl = ""        // 실표지 ("" = 색면 플레이스홀더)
    public var isbn = ""            // 서재 책 식별자 (탭 → 08). "" = 탭 불가 (밀리 미편입·귀속 불가)

    public init(title: String, author: String, short: String, fill: RTFill, tc: UInt32, millie: Bool,
                coverUrl: String = "", isbn: String = "") {
        self.title = title; self.author = author; self.short = short; self.fill = fill; self.tc = tc
        self.millie = millie; self.coverUrl = coverUrl; self.isbn = isbn
    }
}

public struct RTStatsPlace: Sendable, Equatable {
    public let id: String
    public let name: String
    public let lat: Double
    public let lng: Double
    public let continent: String?   // nil = 미상 (역지오코딩 실패 폴백 키) — 대륙 집계에서 제외
}

/// 세션 = [책, 초, 장소] (밀리 = 장소 nil). 하루 안의 순서는 기록 순서 그대로 (day 시트 동률 정렬 기준).
public struct RTStatsSession: Sendable, Equatable {
    public let year: Int, month: Int, day: Int
    public let book: Int            // books 인덱스
    public let sec: Int
    public let place: Int?          // places 인덱스
}

public struct RTStatsYM: Sendable, Equatable, Comparable {
    public let year: Int, month: Int
    public init(year: Int, month: Int) { self.year = year; self.month = month }
    public static func < (a: RTStatsYM, b: RTStatsYM) -> Bool { (a.year, a.month) < (b.year, b.month) }
}

public struct RTStatsDataset: Sendable {
    public var books: [RTStatsBook]
    public var places: [RTStatsPlace]
    public var sessions: [RTStatsSession]
    public var finished: [(book: Int, ym: RTStatsYM)]   // 완독 (책, 완독한 달)
    public var today: (year: Int, month: Int, day: Int)
}

public enum RTStats {
    // ── 포맷 ──
    /// `H:MM` — RTAppModel.hmString 과 동일 포맷 (엔진은 MainActor 밖이라 별도 정의)
    public static func hm(_ sec: Int) -> String {
        "\(sec / 3600):" + String(format: "%02d", sec / 60 % 60)
    }
    /// `1시간 3분` / `45분` / `2시간` (0분이면 분 생략)
    public static func korMin(_ min: Int) -> String {
        let h = min / 60, m = min % 60
        return h > 0 ? (m > 0 ? "\(h)시간 \(m)분" : "\(h)시간") : "\(m)분"
    }

    // ── 월 단위 파생 ──
    public struct Rank: Sendable, Equatable {
        public let book: Int
        public let sec: Int
        public let days: Int        // 그 달 읽은 날 수
        public let done: Bool       // 표시 중인 달에 완독
    }
    public struct Month: Sendable {
        public let year: Int, month: Int
        public let isCurrent: Bool
        public let offset: Int                  // 월요일 시작 앞 빈칸
        public let cells: [HomeCalCell?]        // nil = 빈칸 (앞 오프셋 / fixedSixRows 뒤 채움)
        public let totalSec: Int
        public let readDays: Int
        public let denomDays: Int               // 현재 달 = 오늘 일자, 과거 달 = 말일
        public let ranked: [Rank]               // 총 시간 내림차순 (동률은 책 인덱스 오름차순 — 목업 Object.entries 순서)
    }

    static let cal = Calendar(identifier: .gregorian)

    static func daysIn(_ year: Int, _ month: Int) -> Int {
        cal.range(of: .day, in: .month, for: cal.date(from: DateComponents(year: year, month: month, day: 1))!)!.count
    }
    /// 월요일 시작 오프셋 (0=월 … 6=일)
    static func mondayOffset(_ year: Int, _ month: Int) -> Int {
        (cal.component(.weekday, from: cal.date(from: DateComponents(year: year, month: month, day: 1))!) + 5) % 7
    }

    public static func month(_ ds: RTStatsDataset, year: Int, month: Int, fixedSixRows: Bool = false) -> Month {
        let isCur = ds.today.year == year && ds.today.month == month
        let days = daysIn(year, month)
        let off = mondayOffset(year, month)
        let ss = ds.sessions.filter { $0.year == year && $0.month == month }
        var daySec = [Int](repeating: 0, count: days + 1)
        var perBook: [Int: Int] = [:]
        var daysPerBook: [Int: Set<Int>] = [:]
        for s in ss {
            daySec[s.day] += s.sec
            perBook[s.book, default: 0] += s.sec
            daysPerBook[s.book, default: []].insert(s.day)
        }
        var cells: [HomeCalCell?] = Array(repeating: nil, count: off)
        for d in 1...days {
            let future = isCur && d > ds.today.day
            let date = cal.date(from: DateComponents(year: year, month: month, day: d))!
            cells.append(HomeCalCell(date: date, day: d, minutes: future ? 0 : daySec[d] / 60,
                                     isToday: isCur && d == ds.today.day, isFuture: future,
                                     isSunday: (off + d - 1) % 7 == 6))
        }
        if fixedSixRows { while cells.count < 42 { cells.append(nil) } }
        let doneHere = Set(ds.finished.filter { $0.ym == RTStatsYM(year: year, month: month) }.map(\.book))
        let ranked = perBook.keys.sorted()
            .sorted { perBook[$0]! != perBook[$1]! ? perBook[$0]! > perBook[$1]! : $0 < $1 }
            .map { Rank(book: $0, sec: perBook[$0]!, days: daysPerBook[$0]!.count, done: doneHere.contains($0)) }
        return Month(year: year, month: month, isCurrent: isCur, offset: off, cells: cells,
                     totalSec: ss.reduce(0) { $0 + $1.sec },
                     readDays: Set(ss.map(\.day)).count,
                     denomDays: isCur ? ds.today.day : days,
                     ranked: ranked)
    }

    /// 최근 N일(오늘 포함) 랭킹 — 현재 달의 '많이 읽은 책'(사용자 결정 2026-09-02: 월초에 목록이 비는 문제).
    /// 창은 달 경계를 넘는다. 완독 필 = 창 안에서 완독한 책. 정렬 규칙은 month() 와 동일.
    public struct Recent: Sendable {
        public let start: (year: Int, month: Int, day: Int)
        public let end: (year: Int, month: Int, day: Int)
        public let ranked: [Rank]
        public let totalSec: Int
    }
    public static func recentRanked(_ ds: RTStatsDataset, days: Int = 28) -> Recent {
        let endDate = cal.date(from: DateComponents(year: ds.today.year, month: ds.today.month, day: ds.today.day))!
        let startDate = cal.date(byAdding: .day, value: -(days - 1), to: endDate)!
        func key(_ y: Int, _ m: Int, _ d: Int) -> Int { y * 10000 + m * 100 + d }
        let lo = key(cal.component(.year, from: startDate), cal.component(.month, from: startDate), cal.component(.day, from: startDate))
        let hi = key(ds.today.year, ds.today.month, ds.today.day)
        let ss = ds.sessions.filter { let k = key($0.year, $0.month, $0.day); return k >= lo && k <= hi }
        var perBook: [Int: Int] = [:]
        var daysPerBook: [Int: Set<Int>] = [:]
        for s in ss {
            perBook[s.book, default: 0] += s.sec
            daysPerBook[s.book, default: []].insert(key(s.year, s.month, s.day))
        }
        // 완독 필은 README §4-1 그대로 "표시 중인 달(=현재 달)에 완독한 책만" — 창이 지난달에 걸쳐도 지난달 완독은 제외
        let doneHere = Set(ds.finished.filter { $0.ym == RTStatsYM(year: ds.today.year, month: ds.today.month) }.map(\.book))
        let ranked = perBook.keys.sorted()
            .sorted { perBook[$0]! != perBook[$1]! ? perBook[$0]! > perBook[$1]! : $0 < $1 }
            .map { Rank(book: $0, sec: perBook[$0]!, days: daysPerBook[$0]!.count, done: doneHere.contains($0)) }
        return Recent(start: (cal.component(.year, from: startDate), cal.component(.month, from: startDate), cal.component(.day, from: startDate)),
                      end: ds.today, ranked: ranked, totalSec: ss.reduce(0) { $0 + $1.sec })
    }

    /// 달 범위 — 첫 기록이 있는 달(종이·밀리 중 가장 이른) … 현재 달. 기록이 없으면 현재 달만.
    public static func monthRange(_ ds: RTStatsDataset) -> (first: RTStatsYM, last: RTStatsYM) {
        let last = RTStatsYM(year: ds.today.year, month: ds.today.month)
        let first = ds.sessions.map { RTStatsYM(year: $0.year, month: $0.month) }.min() ?? last
        return (min(first, last), last)
    }

    // ── 바텀시트 (공용 1종, 내용 3가지) ──
    public enum SheetKind: Sendable, Equatable { case day, list, place }
    public struct Row: Sendable, Equatable {
        public let book: Int
        public let rank: Int?           // list 만
        public let sub: String          // 장소명 / "밀리에서 자동 기록" / "N일 읽음" / "N회 읽음"
        public let subMillie: Bool      // 서브라인 amberDeep
        public let pin: Bool            // 리딩타임 day 행 = 핀 아이콘
        public let value: String        // "N분" / "H:MM"
        public let done: Bool           // 완독 필 (list 만 — 목업 그대로)
        public let sec: Int
    }
    public struct Sheet: Sendable, Equatable {
        public let kind: SheetKind
        public let title: String
        public let sub: String
        public let rows: [Row]
    }

    static let weekdayNames = ["월", "화", "수", "목", "금", "토", "일"]

    public static func daySheet(_ ds: RTStatsDataset, year: Int, month: Int, day: Int) -> Sheet {
        let rows = ds.sessions.filter { $0.year == year && $0.month == month && $0.day == day }
        let sorted = rows.enumerated()
            .sorted { $0.element.sec != $1.element.sec ? $0.element.sec > $1.element.sec : $0.offset < $1.offset }
            .map(\.element)
        let sum = sorted.reduce(0) { $0 + $1.sec }
        let wd = weekdayNames[(mondayOffset(year, month) + day - 1) % 7]
        let isToday = ds.today.year == year && ds.today.month == month && ds.today.day == day
        return Sheet(kind: .day,
                     title: "\(month)월 \(day)일 \(wd)요일" + (isToday ? " · 오늘" : ""),
                     sub: "\(sorted.count)권 · \(korMin(sum / 60)) 읽음",
                     rows: sorted.map { s in
                         let millie = ds.books[s.book].millie
                         return Row(book: s.book, rank: nil,
                                    sub: millie ? "밀리에서 자동 기록" : (s.place.map { ds.places[$0].name } ?? ""),
                                    subMillie: millie, pin: !millie,
                                    value: "\(s.sec / 60)분", done: false, sec: s.sec)
                     })
    }

    public static func listSheet(_ ds: RTStatsDataset, year: Int, month: Int) -> Sheet {
        let mo = Self.month(ds, year: year, month: month)
        // 현재 달 = 최근 4주 창 (화면의 '많이 읽은 책' 과 같은 기준)
        let ranked = mo.isCurrent ? recentRanked(ds).ranked : mo.ranked
        let total = mo.isCurrent ? recentRanked(ds).totalSec : mo.totalSec
        return Sheet(kind: .list,
                     title: mo.isCurrent ? "최근 4주 읽은 책" : "\(month)월에 읽은 책",
                     sub: "\(ranked.count)권 · \(hm(total))",
                     rows: ranked.enumerated().map { i, r in
                         Row(book: r.book, rank: i + 1, sub: "\(r.days)일 읽음", subMillie: false, pin: false,
                             value: hm(r.sec), done: r.done, sec: r.sec)
                     })
    }

    /// 전체 기간 장소별 집계 — 책별 {초, 세션 수}. 기록 있는 장소만, places 순서.
    public struct PlaceAgg: Sendable, Equatable {
        public let place: Int
        public let sec: Int
        public let books: [(book: Int, sec: Int, n: Int)]   // 초 내림차순 (동률 책 인덱스 오름차순)
        public static func == (a: PlaceAgg, b: PlaceAgg) -> Bool { a.place == b.place && a.sec == b.sec }
    }
    public static func placeAggs(_ ds: RTStatsDataset) -> [PlaceAgg] {
        var sec = [Int](repeating: 0, count: ds.places.count)
        var books = [[Int: (sec: Int, n: Int)]](repeating: [:], count: ds.places.count)
        for s in ds.sessions { guard let p = s.place else { continue }
            sec[p] += s.sec
            books[p][s.book, default: (0, 0)].sec += s.sec
            books[p][s.book]!.n += 1
        }
        return ds.places.indices.filter { sec[$0] > 0 }.map { p in
            let bs = books[p].keys.sorted()
                .sorted { books[p][$0]!.sec != books[p][$1]!.sec ? books[p][$0]!.sec > books[p][$1]!.sec : $0 < $1 }
                .map { (book: $0, sec: books[p][$0]!.sec, n: books[p][$0]!.n) }
            return PlaceAgg(place: p, sec: sec[p], books: bs)
        }
    }

    public static func placeSheet(_ ds: RTStatsDataset, place: Int) -> Sheet {
        let agg = placeAggs(ds).first { $0.place == place }
        let bs = agg?.books ?? []
        return Sheet(kind: .place, title: ds.places[place].name,
                     sub: "\(bs.count)권 · \(korMin((agg?.sec ?? 0) / 60)) 읽음",
                     rows: bs.map { Row(book: $0.book, rank: nil, sub: "\($0.n)회 읽음", subMillie: false,
                                        pin: false, value: hm($0.sec), done: false, sec: $0.sec) })
    }

    // ── 지도 ──
    /// `N개 도시 · N개 대륙` — 도시 = 기록 있는 장소 수, 대륙 = 그 장소들의 대륙 집합(미상 제외). 0곳 = nil.
    public static func chipText(_ ds: RTStatsDataset) -> String? {
        let used = placeAggs(ds)
        guard !used.isEmpty else { return nil }
        let conts = Set(used.compactMap { ds.places[$0.place].continent })
        return "\(used.count)개 도시 · \(conts.count)개 대륙"
    }

    /// 등장방형 투영 — 1000×500 월드 (헤드리스 플레이스홀더용)
    public static func proj(lat: Double, lng: Double) -> CGPoint {
        CGPoint(x: (lng + 180) / 360 * 1000, y: (90 - lat) / 180 * 500)
    }
    /// 지도 카드 프리뷰 뷰 (목업: translate(-2308,-357) scale(3))
    public static let cardView: (s: Double, tx: Double, ty: Double) = (3, -2308, -357)

    /// 전체 화면 기본 카메라 — 모든 핀이 폭 300·높이 520 안, 중심 (195,422), 배율 .3~2 클램프
    public static func fitAll(_ ds: RTStatsDataset) -> (s: Double, tx: Double, ty: Double) {
        let used = placeAggs(ds).map { ds.places[$0.place] }
        guard !used.isEmpty else { return (0.5, -55, 300) }
        let xs = used.map { (Double($0.lng) + 180) / 360 * 1000 }
        let ys = used.map { (90 - Double($0.lat)) / 180 * 500 }
        let x0 = xs.min()!, x1 = xs.max()!, y0 = ys.min()!, y1 = ys.max()!
        let s = max(0.3, min(2, min(300 / max(x1 - x0, 1), 520 / max(y1 - y0, 1))))
        return (s, 195 - (x0 + x1) / 2 * s, 422 - (y0 + y1) / 2 * s)
    }

    public struct Pin: Sendable, Identifiable, Equatable {
        public let id: String
        public let x: CGFloat, y: CGFloat   // 앵커 장소의 화면좌표 (반올림)
        public let anchor: Int              // places 인덱스 — 총 분이 가장 큰 장소
        public let members: [Int]
        public let cover: Int               // 클러스터 내 가장 많이 읽은 책
        public let stack: [Int]             // 뒤 2장 (2권 이상일 때만 표시)
        public let badge: Int?              // 책 수 (2권 이상)
        public let label: String
        public var isCluster: Bool { members.count > 1 }
    }

    static let clusterTH: Double = 52

    /// 52px 체인 클러스터 — 목업 `clusters` 그대로 (LIFO 탐색, 앵커 = 총 분 최대, 표지 = 최다 독서 책)
    public static func clusters(_ ds: RTStatsDataset, screenPos: (RTStatsPlace) -> CGPoint) -> [Pin] {
        let aggs = placeAggs(ds)
        let pts = aggs.map { screenPos(ds.places[$0.place]) }
        var used = [Bool](repeating: false, count: pts.count)
        var out: [Pin] = []
        for i in pts.indices where !used[i] {
            var grp = [i]; used[i] = true
            var q = [i]
            while let j = q.popLast() {
                for k in pts.indices where !used[k] {
                    if hypot(pts[j].x - pts[k].x, pts[j].y - pts[k].y) < clusterTH {
                        used[k] = true; grp.append(k); q.append(k)
                    }
                }
            }
            let mem = grp.enumerated()
                .sorted { aggs[$0.element].sec != aggs[$1.element].sec ? aggs[$0.element].sec > aggs[$1.element].sec : $0.offset < $1.offset }
                .map(\.element)
            let an = mem[0]
            var bm: [Int: Int] = [:]
            for m in mem { for b in aggs[m].books { bm[b.book, default: 0] += b.sec } }
            let bs = bm.keys.sorted().sorted { bm[$0]! != bm[$1]! ? bm[$0]! > bm[$1]! : $0 < $1 }
            let anchorPlace = ds.places[aggs[an].place]
            out.append(Pin(id: "p\(out.count)",
                           x: pts[an].x.rounded(), y: pts[an].y.rounded(),
                           anchor: aggs[an].place,
                           members: mem.map { aggs[$0].place },
                           cover: bs[0],
                           stack: bs.count > 1 ? [bs[1], bs.count > 2 ? bs[2] : bs[1]] : [],
                           badge: bs.count > 1 ? bs.count : nil,
                           label: anchorPlace.name + (mem.count > 1 ? " 외 \(mem.count - 1)" : "")))
        }
        return out
    }

    // ── 실데이터 → 데이터셋 ──
    /// 종이 세션(RTUserData) + 밀리 일별(ebookBreakdown — 1권인 날만 책 귀속, 그 외 "밀리의서재") 합성.
    /// 파트너는 밀리 인자를 비워 종이만. 완독 = RTBook.finishedAt 의 달. 장소 = placeId 첫 세션 좌표,
    /// 대륙 = placeId 의 ISO 국가코드 접두("KR:…") — 좌표 그리드 폴백 키는 미상(nil).
    public static func live(data: RTUserData, now: Date,
                            ebookDays: [Date] = [],
                            ebookBreakdown: (Date) -> [(title: String, seconds: Int)] = { _ in [] },
                            ebookCover: (String) -> String? = { _ in nil }) -> RTStatsDataset {
        var books: [RTStatsBook] = []
        var byIsbn: [String: Int] = [:]
        var byTitle: [String: Int] = [:]
        func paperIndex(_ isbn: String) -> Int? {
            if let i = byIsbn[isbn] { return i }
            guard let b = data.books.first(where: { $0.isbn == isbn }) else { return nil }
            let i = books.count
            byIsbn[isbn] = i
            books.append(RTStatsBook(title: b.title, author: b.author, short: b.title,
                                     fill: .solid(0xE8E2D2), tc: 0x3A2C1C, millie: b.millieBookId != nil,
                                     coverUrl: b.coverUrl, isbn: b.isbn))
            return i
        }
        func millieIndex(_ title: String) -> Int {
            if let i = byTitle[title] { return i }
            // 서재에 편입된 밀리 책이면 그 ISBN 으로 (탭 → 08)
            if let adopted = data.books.first(where: { $0.millieBookId != nil && $0.title == title }),
               let i = paperIndex(adopted.isbn) {
                byTitle[title] = i
                return i
            }
            let i = books.count
            byTitle[title] = i
            books.append(RTStatsBook(title: title, author: "", short: title,
                                     fill: .solid(0xF6ECD6), tc: 0xB8862E, millie: true,
                                     coverUrl: ebookCover(title) ?? "", isbn: ""))
            return i
        }

        var places: [RTStatsPlace] = []
        var placeIdx: [String: Int] = [:]
        var sessions: [RTStatsSession] = []
        for s in data.sessions.sorted(by: { $0.endedAt < $1.endedAt }) {
            guard let isbn = s.isbn, let bi = paperIndex(isbn), s.seconds > 0 else { continue }
            var pi: Int?
            if let pid = s.placeId, let lat = s.latitude, let lng = s.longitude {
                if let i = placeIdx[pid] { pi = i } else {
                    pi = places.count
                    placeIdx[pid] = places.count
                    places.append(RTStatsPlace(id: pid, name: s.placeName ?? pid, lat: lat, lng: lng,
                                               continent: continent(placeId: pid)))
                }
            }
            sessions.append(RTStatsSession(year: cal.component(.year, from: s.endedAt),
                                           month: cal.component(.month, from: s.endedAt),
                                           day: cal.component(.day, from: s.endedAt),
                                           book: bi, sec: s.seconds, place: pi))
        }
        for d in ebookDays.sorted() {
            for e in ebookBreakdown(d) where e.seconds > 0 {
                sessions.append(RTStatsSession(year: cal.component(.year, from: d),
                                               month: cal.component(.month, from: d),
                                               day: cal.component(.day, from: d),
                                               book: millieIndex(e.title), sec: e.seconds, place: nil))
            }
        }
        let finished: [(book: Int, ym: RTStatsYM)] = data.books.compactMap { b in
            guard b.finished, let at = b.finishedAt, let i = byIsbn[b.isbn] else { return nil }
            return (i, RTStatsYM(year: cal.component(.year, from: at), month: cal.component(.month, from: at)))
        }
        return RTStatsDataset(books: books, places: places, sessions: sessions, finished: finished,
                              today: (cal.component(.year, from: now), cal.component(.month, from: now),
                                      cal.component(.day, from: now)))
    }

    /// placeId "KR:서울특별시:성수동" 의 ISO 3166-1 alpha-2 접두 → 대륙. 접두가 국가코드가 아니면 nil.
    static func continent(placeId: String) -> String? {
        guard let code = placeId.split(separator: ":").first, code.count == 2,
              code.allSatisfy({ $0.isUppercase && $0.isLetter }) else { return nil }
        return continentByISO[String(code)]
    }
    static let continentByISO: [String: String] = {
        let groups: [(String, String)] = [
            ("아시아", "AF AM AZ BH BD BT BN KH CN CY GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP OM PK PS PH QA SA SG KR LK SY TW TJ TH TL TR TM AE UZ VN YE HK MO IO"),
            ("유럽", "AL AD AT BY BE BA BG HR CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB VA FO GI GG IM JE AX SJ"),
            ("북미", "US CA MX GL BM BZ CR SV GT HN NI PA AG BS BB CU DM DO GD HT JM KN LC VC TT PR VI KY TC AI MS AW CW SX BQ GP MQ BL MF PM"),
            ("남미", "AR BO BR CL CO EC GY PY PE SR UY VE FK GF"),
            ("아프리카", "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH RE YT SH"),
            ("오세아니아", "AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU NC PF GU MP AS CK NU TK WF PN NF"),
            ("남극", "AQ"),
        ]
        var m: [String: String] = [:]
        for (cont, codes) in groups { for c in codes.split(separator: " ") { m[String(c)] = cont } }
        return m
    }()
}

// ── 데모 데이터 (userData nil — rtshot 픽셀 오라클) — 목업 class Component 의 books·places·gen·aug 그대로 ──
public enum RTStatsDemo {
    static func B(_ title: String, _ author: String, _ short: String, _ fill: RTFill, _ tc: UInt32,
                  _ millie: Bool = false) -> RTStatsBook {
        RTStatsBook(title: title, author: author, short: short, fill: fill, tc: tc, millie: millie)
    }
    public static let books: [RTStatsBook] = [
        B("몰입", "황농문", "몰입", .gradient(168, [0xEEE1BC, 0xE3D09E]), 0x241C0D),
        B("돈의 심리학", "모건 하우절", "돈의\n심리학", .solid(0x1F2D45), 0xE9EDF5),
        B("도둑맞은 집중력", "요한 하리", "도둑맞은\n집중력", .solid(0xE4572E), 0xFFFFFF, true),
        B("작별하지 않는다", "한강", "작별", .solid(0xE9EAE2), 0x2B3A34),
        B("파친코", "이민진", "파친코", .gradient(180, [0x7D2F2A, 0x3F1414]), 0xF3DDC8),
        B("미드나잇 라이브러리", "매트 헤이그", "미드\n나잇", .gradient(200, [0x243A72, 0x0D1533]), 0xDFE4FF, true),
        B("1984", "조지 오웰", "1984", .gradient(160, [0x232323, 0x0C0C0C]), 0xE9C6BD),
        B("페스트", "알베르 카뮈", "페스트", .solid(0xD9CBB0), 0x4A3D24),
        B("노르웨이의 숲", "무라카미 하루키", "노르\n웨이", .gradient(180, [0x2F6B50, 0x173F31]), 0xDCEEE2),
        B("사피엔스", "유발 하라리", "사피\n엔스", .gradient(170, [0xEFB43E, 0xD68F1E]), 0x3A2606, true),
        B("아몬드", "손원평", "아몬드", .solid(0xF2E9D8), 0x3B3A36),
        B("불편한 편의점", "김호연", "불편한\n편의점", .gradient(170, [0x5FA8A0, 0x2F6F6A]), 0xF2FBF9, true),
    ]
    static func P(_ name: String, _ lat: Double, _ lng: Double, _ cont: String) -> RTStatsPlace {
        RTStatsPlace(id: name, name: name, lat: lat, lng: lng, continent: cont)
    }
    public static let places: [RTStatsPlace] = [
        P("서울", 37.57, 126.98, "아시아"), P("제주", 33.5, 126.53, "아시아"), P("도쿄", 35.68, 139.69, "아시아"),
        P("부산", 35.18, 129.08, "아시아"), P("파리", 48.86, 2.35, "유럽"), P("런던", 51.51, -0.13, "유럽"),
        P("두바이", 25.2, 55.27, "아시아"), P("뉴욕", 40.71, -74.01, "북미"), P("시드니", -33.87, 151.21, "오세아니아"),
        P("방콕", 13.75, 100.5, "아시아"),
    ]

    /// 목업 `rng` (mulberry32) — 32비트 래핑 연산으로 JS 와 비트 동일
    struct Rng {
        var s: UInt32
        init(_ seed: Int32) { s = UInt32(bitPattern: seed) }
        mutating func next() -> Double {
            s = s &+ 0x6D2B79F5
            var t = (s ^ (s >> 15)) &* (1 | s)
            t = (t &+ ((t ^ (t >> 7)) &* (61 | t))) ^ t
            return Double(t ^ (t >> 14)) / 4294967296
        }
    }

    /// 목업 `gen(seed, days, feat, pl, prob)` — 세션 = [책, 분, 장소(밀리 = null)]
    static func gen(seed: Int32, year: Int, month: Int, days: Int, feat: [Int], pl: [Int], prob: Double)
        -> [Int: [(book: Int, min: Int, place: Int?)]] {
        var r = Rng(seed)
        var sess: [Int: [(book: Int, min: Int, place: Int?)]] = [:]
        for d in 1...days {
            if r.next() < prob {
                let n = r.next() < 0.3 ? 2 : 1
                var rows: [(book: Int, min: Int, place: Int?)] = []
                var used: [Int] = []
                for _ in 0..<n {
                    let b = feat[Int(floor(r.next() * Double(feat.length)))]
                    if used.contains(b) { continue }
                    used.append(b)
                    let min = 10 + Int(floor(r.next() * 58))
                    let place: Int? = books[b].millie ? nil : pl[Int(floor(r.next() * Double(pl.length)))]
                    rows.append((b, min, place))
                }
                sess[d] = rows
            }
        }
        return sess
    }

    public static let today = (year: 2026, month: 8, day: 27)

    public static let dataset: RTStatsDataset = {
        // 8월 17–27 은 홈 데모(demoCal14: 0,0,34,52,41,63,28,12,47,39,46)와 일치 — 픽셀 오라클 공유
        let aug: [Int: [(book: Int, min: Int, place: Int?)]] = [
            1: [(0, 52, 0)], 3: [(3, 38, 0), (10, 20, 0)], 4: [(2, 21, nil)], 6: [(0, 64, 0)],
            8: [(9, 45, nil), (11, 17, nil)], 9: [(2, 30, nil)], 11: [(1, 58, 0), (6, 14, 0)],
            13: [(7, 26, 0), (4, 19, 0)], 15: [(0, 44, 1), (9, 28, nil)],
            16: [(2, 18, nil), (8, 15, 1), (5, 21, nil)], 19: [(0, 22, 0), (2, 12, nil)],
            20: [(0, 52, 0)], 21: [(1, 41, 0)], 22: [(0, 40, 0), (9, 23, nil)], 23: [(3, 28, 0)],
            24: [(2, 12, nil)], 25: [(1, 47, 0)], 26: [(9, 39, nil)], 27: [(0, 24, 0), (2, 22, nil)],
        ]
        var may = gen(seed: 11, year: 2026, month: 5, days: 31, feat: [0, 1, 1, 9, 2, 7, 7], pl: [0, 0, 0, 4, 4, 5, 8], prob: 0.58)
        may[20] = [(7, 35, 8)]   // 5월 시드니 출장 — 오세아니아 핀
        let months: [(y: Int, m: Int, sess: [Int: [(book: Int, min: Int, place: Int?)]], done: [Int])] = [
            (2026, 5, may, [7]),
            (2026, 6, gen(seed: 22, year: 2026, month: 6, days: 30, feat: [8, 8, 6, 6, 2], pl: [0, 0, 7, 7, 9], prob: 0.2), []),
            (2026, 7, gen(seed: 33, year: 2026, month: 7, days: 31, feat: [4, 4, 5, 5, 6, 3, 0], pl: [0, 0, 0, 2, 2, 3, 6], prob: 0.6), [4]),
            (2026, 8, aug, [1]),
        ]
        var sessions: [RTStatsSession] = []
        var finished: [(book: Int, ym: RTStatsYM)] = []
        for mo in months {
            for d in mo.sess.keys.sorted() {
                for r in mo.sess[d]! {
                    sessions.append(RTStatsSession(year: mo.y, month: mo.m, day: d, book: r.book, sec: r.min * 60, place: r.place))
                }
            }
            for b in mo.done { finished.append((b, RTStatsYM(year: mo.y, month: mo.m))) }
        }
        return RTStatsDataset(books: books, places: places, sessions: sessions, finished: finished, today: today)
    }()
}

private extension Array { var length: Int { count } }

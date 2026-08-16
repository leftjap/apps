import Foundation

// HomeC "다음" 미리보기 항목 — home.js formatBlockPreview 반환 shape.
public struct GymNextBlockPreview: Equatable, Sendable {
    public let name: String
    public let summary: String
    public init(name: String, summary: String) { self.name = name; self.summary = summary }
}

// 홈 부위 밸런스 — 캘린더 주 비교(이번 주 월~일 vs 지난 주 월~일) · 고정 부위순서 · 유산소 별도 행 · core 흡수.
// 범례("지난주 / 이번 주")·상단 주간 캘린더(월~일)와 같은 기준. 구현은 롤링 7일이었어서 화요일에도
// "이번 주" 가 지난주 수·목까지 합산되던 불일치를 바로잡았다.
public enum GymHomeLogic {

    public struct BalancePart: Equatable, Sendable {
        public let key: String
        public let name: String
        public let sets: Int
        public let prevSets: Int
    }
    public struct WeeklyBalance: Equatable, Sendable {
        public let parts: [BalancePart]     // 하체·어깨·등·가슴·팔·코어 고정 순서
        public let focusKey: String?        // 이번 주 최소 부위 (전부 0 이면 nil)
        public let max: Int                 // 막대 스케일 (최소 1)
    }

    public static let balanceParts: [(key: String, name: String)] = [
        ("legs", "하체"), ("shoulder", "어깨"), ("back", "등"),
        ("chest", "가슴"), ("arms", "팔"), ("core", "코어"),
    ]

    // 밸런스 분류 — equipment cardio → 'cardio'(별도 행), part core|cardio → 'core' (구데이터 흡수).
    public static func categorize(_ exId: String, custom: [GymCustomExercise]) -> String? {
        guard let def = GymExercises.def(exId, custom: custom) else { return nil }
        if def.equipment == "cardio" { return "cardio" }
        if def.part == "core" || def.part == "cardio" { return "core" }
        return def.part
    }

    public static func weeklyBalance(sessions: [GymSession], custom: [GymCustomExercise],
                                     now: Date) -> WeeklyBalance {
        let cal = GymWeightLogic.kst
        let fmt = GymWeightLogic.isoFmt
        // 이번 주 월요일 (KST). GymWeightLogic.kst 는 firstWeekday 미설정(일요일 시작)이라
        // weekOfYear 대신 weekday 성분으로 직접 계산한다 (1=일 … 7=토 → 월요일까지의 offset).
        let weekday = cal.component(.weekday, from: now)
        let monday = cal.date(byAdding: .day, value: -((weekday + 5) % 7), to: now) ?? now
        func shift(_ n: Int) -> String { fmt.string(from: cal.date(byAdding: .day, value: n, to: monday) ?? monday) }
        let thisFrom = shift(0), thisTo = shift(6)      // 이번 주 월~일
        let prevFrom = shift(-7), prevTo = shift(-1)    // 지난 주 월~일

        var thisSets: [String: Int] = [:], prevSets: [String: Int] = [:]

        func accumulate(_ s: GymSession, isThisWeek: Bool) {
            for b in s.blocks where b.type == "single" {
                guard let cat = categorize(b.exerciseId, custom: custom) else { continue }
                let done = b.sets.filter(\.done)
                guard !done.isEmpty else { continue }
                // 유산소는 부위 막대에 안 들어간다 — 독립 카드가 따로 집계 (cardioWeek).
                guard cat != "cardio" else { continue }
                if isThisWeek { thisSets[cat, default: 0] += done.count }
                else { prevSets[cat, default: 0] += done.count }
            }
        }
        for s in sessions {
            if s.date >= thisFrom && s.date <= thisTo { accumulate(s, isThisWeek: true) }
            else if s.date >= prevFrom && s.date <= prevTo { accumulate(s, isThisWeek: false) }
        }

        let parts = balanceParts.map {
            BalancePart(key: $0.key, name: $0.name,
                        sets: thisSets[$0.key] ?? 0, prevSets: prevSets[$0.key] ?? 0)
        }
        var focusKey: String? = nil
        if parts.contains(where: { $0.sets > 0 }) {
            var minSets = Int.max
            for p in parts where p.sets < minSets { minSets = p.sets; focusKey = p.key }
        }
        let maxBar = Swift.max(1, parts.map { Swift.max($0.sets, $0.prevSets) }.max() ?? 1)
        return WeeklyBalance(parts: parts, focusKey: focusKey, max: maxBar)
    }

    // MARK: - 유산소 카드 (홈 재설계 2026-08-17 §8·§11 — 밸런스 차트의 유산소 행을 대체)

    /// 날짜(ISO) → 그날 완료 유산소 총 분(날짜별 반올림). **"뛴 날" 의 단일 정의.**
    /// 캘린더의 유산소 링과 카드의 채운 원이 반드시 같은 날짜 집합이어야 해서(§14) 둘 다 여기서 나온다.
    /// duration 미입력(구버그 데이터)도 done 세트면 날짜 키가 남고 값 0 — 크기는 술어 하나로 통일한다.
    public static func cardioDayMinutes(sessions: [GymSession],
                                        custom: [GymCustomExercise]) -> [String: Int] {
        var sec: [String: Double] = [:]
        for s in sessions {
            for b in s.blocks where b.type == "single" {
                guard categorize(b.exerciseId, custom: custom) == "cardio" else { continue }
                let done = b.sets.filter(\.done)
                guard !done.isEmpty else { continue }
                sec[s.date, default: 0] += done.reduce(0) { $0 + ($1.duration ?? 0) }
            }
        }
        return sec.mapValues { Int(($0 / 60).rounded()) }
    }

    /// 근력(비유산소) 완료 세트가 있는 날 (§11 liftDays). 유산소만 한 날은 들어가지 않는다 —
    /// 캘린더의 crail 채움은 근력 신호이고 유산소는 teal 링이 따로 표현하므로(§5) 둘을 분리해야
    /// "유산소만" 상태(배경 없음 + 링)가 성립한다.
    public static func liftDays(sessions: [GymSession],
                                custom: [GymCustomExercise]) -> Set<String> {
        var out: Set<String> = []
        for s in sessions {
            for b in s.blocks {
                guard categorize(b.exerciseId, custom: custom) != "cardio",
                      b.sets.contains(where: \.done) else { continue }
                out.insert(s.date); break
            }
        }
        return out
    }

    /// 월~일 7칸 × (이번 주 / 지난주). nil = 그날 유산소 없음(빈 원).
    public struct CardioWeek: Equatable, Sendable {
        public let thisMin: [Int?]      // 7칸, 월→일
        public let prevMin: [Int?]      // 지난주 같은 요일
        public let thisTotal: Int
        public let thisDays: Int
        public let prevTotal: Int
        public let prevDays: Int
        public let todayIndex: Int      // 0=월 … 6=일
    }

    /// 주 시작 = 월요일 고정 (§11). GymWeightLogic.kst 는 firstWeekday 미설정(일요일 시작)이라
    /// weekOfYear 가 아니라 weekday 성분으로 직접 계산한다 — weeklyBalance 와 같은 규칙.
    static func mondayIndex(_ weekday: Int) -> Int { (weekday + 5) % 7 }

    public static func cardioWeek(sessions: [GymSession], custom: [GymCustomExercise],
                                  now: Date) -> CardioWeek {
        let cal = GymWeightLogic.kst
        let fmt = GymWeightLogic.isoFmt
        let byDay = cardioDayMinutes(sessions: sessions, custom: custom)
        let todayIdx = mondayIndex(cal.component(.weekday, from: now))
        let monday = cal.date(byAdding: .day, value: -todayIdx, to: now) ?? now
        func slot(_ offset: Int) -> Int? {
            cal.date(byAdding: .day, value: offset, to: monday).flatMap { byDay[fmt.string(from: $0)] }
        }
        let this = (0..<7).map { slot($0) }
        let prev = (0..<7).map { slot($0 - 7) }
        return CardioWeek(thisMin: this, prevMin: prev,
                          thisTotal: this.compactMap { $0 }.reduce(0, +),
                          thisDays: this.compactMap { $0 }.count,
                          prevTotal: prev.compactMap { $0 }.reduce(0, +),
                          prevDays: prev.compactMap { $0 }.count,
                          todayIndex: todayIdx)
    }

    /// 하단 갱신 칩 3갈래 (사용자 2026-08-17 — 동률은 갱신이 아니다).
    /// 부족 = warn(주황), 동률·초과 = pine. 유산소를 한 번도 안 했으면 nil(칩 숨김, §14).
    public struct CardioRenewChip: Equatable, Sendable {
        public let value: String?    // "18분" / "+12분". 동률이면 없음
        public let label: String
        public let isWarn: Bool
    }
    public static func cardioRenewChip(thisTotal: Int, prevTotal: Int) -> CardioRenewChip? {
        guard thisTotal > 0 || prevTotal > 0 else { return nil }
        let short = prevTotal - thisTotal
        if short > 0 { return CardioRenewChip(value: "\(short)분", label: "더 하면 갱신", isWarn: true) }
        if short == 0 { return CardioRenewChip(value: nil, label: "지난주와 동률", isWarn: false) }
        return CardioRenewChip(value: "+\(-short)분", label: "갱신", isWarn: false)
    }

    // MARK: - HomeC "다음" 미리보기 (home.js summarizeNextBlocks + formatBlockPreview 정합)

    // 미완료 판정 — home.js isSingleBlockIncomplete: single + finishedAt 없음 + (빈 세트 or 일부 미완료).
    static func isSingleBlockIncomplete(_ b: GymBlock) -> Bool {
        guard b.type == "single", b.finishedAt == nil else { return false }
        if b.sets.isEmpty { return true }
        return b.sets.contains { !$0.done }
    }

    static func blockPreview(_ b: GymBlock, custom: [GymCustomExercise]) -> GymNextBlockPreview {
        let name = GymExercises.resolveName(b.exerciseId, custom: custom)
        let equipment = GymExercises.def(b.exerciseId, custom: custom)?.equipment
        let first = b.sets.first
        func g(_ v: Double) -> String { String(format: "%g", v) }
        switch equipment {
        case "cardio":
            let mins = Int(((first?.duration ?? 0) / 60).rounded())
            let dist = first?.distance ?? 0
            return GymNextBlockPreview(name: name,
                                       summary: dist > 0 ? "\(mins)분 · \(g(dist))km" : "\(mins)분")
        case "bodyweight":
            return GymNextBlockPreview(name: name,
                                       summary: "맨몸 \(first?.reps ?? 0)회 · \(b.sets.count)세트")
        default:
            return GymNextBlockPreview(name: name,
                                       summary: "\(g(first?.weight ?? 0))×\(first?.reps ?? 0) · \(b.sets.count)세트")
        }
    }

    // 현재 진행 블록(첫 미완료) 이후의 미완료 블록 미리보기 — active 세션만, 최대 limit 개.
    public static func nextBlockPreviews(session: GymSession, custom: [GymCustomExercise],
                                         limit: Int = 2) -> [GymNextBlockPreview] {
        guard session.status == .active,
              let curIdx = session.blocks.firstIndex(where: { isSingleBlockIncomplete($0) }) else { return [] }
        var out: [GymNextBlockPreview] = []
        for b in session.blocks.dropFirst(curIdx + 1) where isSingleBlockIncomplete(b) {
            out.append(blockPreview(b, custom: custom))
            if out.count >= limit { break }
        }
        return out
    }

    /// 운동 중 홈(HomeC) 이어하기 카드 요약. 전 종목 완료면 카드가 종목 이름 공백 + "SET 1/0" 으로
    /// 깨졌고(감사 확정 #11), 세트 0개로 건너뛴 완료 종목을 '현재 운동중' 으로 표시해 레일·히어로와
    /// 어긋났다(#12). 세션 화면의 heroBlockIdx 규칙(선택 → 첫 미완료 → 마지막)과 같은 블록을 고른다.
    public struct GymResumeSummary: Equatable, Sendable {
        public let blockIdx: Int?      // 표시 블록 (블록 없으면 nil)
        public let setLine: String?    // "SET 3/5" — 표시할 세트가 없으면 nil
        public let allDone: Bool       // 전 종목 완료 → "마무리" 상태 표기
        public init(blockIdx: Int?, setLine: String?, allDone: Bool) {
            self.blockIdx = blockIdx; self.setLine = setLine; self.allDone = allDone
        }
    }
    public static func resumeSummary(session: GymSession) -> GymResumeSummary {
        let singles = session.blocks.enumerated().filter { $0.element.type == "single" }
        guard !singles.isEmpty else { return GymResumeSummary(blockIdx: nil, setLine: nil, allDone: false) }
        let pending = singles.first { GymSessionLogic.firstUnfinishedBlockIdx(session) == $0.offset }
        let shown = pending ?? singles.last!
        let sets = shown.element.sets
        let cursor = sets.firstIndex { !$0.done }
        let line: String? = sets.isEmpty ? nil
            : "SET \((cursor ?? sets.count - 1) + 1)/\(sets.count)"
        return GymResumeSummary(blockIdx: shown.offset, setLine: line, allDone: pending == nil)
    }
}

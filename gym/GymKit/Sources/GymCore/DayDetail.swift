import Foundation

// 날짜 상세 시트 로직 — PWA stats.js sessionToWorkoutEntry/mergeWorkoutEntries +
// day-detail-sheet.js formatDayLabel 1:1 포팅 (§9-1·§5-2 날짜 탭 바텀시트).

public struct GymDayEntryEx: Equatable, Sendable {
    public var n: String          // 운동명
    public var s: String          // 요약 ("2세트 · 1,250kg" / "30분 · 3.2km" / "—")
    public var key: String
    public var kind: String       // "weight" | "cardio"
    public var setCount: Int
    public var vol: Double
    public var durSec: Double
    public var distKm: Double
}

public struct GymDayEntry: Equatable, Sendable {
    public var tag: String        // 부위 풀네임 ("가슴 · 어깨")
    public var vol: Double
    public var min: Int
    public var pr: Int
    public var ex: [GymDayEntryEx]
    public var sessionId: String?
}

public enum GymDayDetailLogic {

    static let nf: NumberFormatter = {
        let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0; return f
    }()
    public static func loc(_ v: Double) -> String { nf.string(from: NSNumber(value: v.rounded())) ?? "\(Int(v))" }
    static func num(_ v: Double) -> String { String(format: "%g", v) }

    // 세션 → 상세 entry. done 0 종목 제외, cardio 는 시간·거리 표기 (stats.js formatExEntrySpec).
    public static func entry(for session: GymSession, custom: [GymCustomExercise]) -> GymDayEntry {
        var ex: [GymDayEntryEx] = []
        var prCount = 0
        for b in session.blocks where b.type == "single" {
            let doneSets = b.sets.filter(\.done)
            guard !doneSets.isEmpty else { continue }
            prCount += doneSets.filter(\.pr).count
            let name = GymExercises.resolveName(b.exerciseId, custom: custom)
            let first = doneSets[0]
            if let dur = first.duration {
                let distKm = first.distance ?? 0
                let km = distKm > 0 ? " · \(num(distKm))km" : ""
                ex.append(GymDayEntryEx(n: name, s: "\(Int((dur / 60).rounded()))분\(km)",
                                        key: b.exerciseId, kind: "cardio", setCount: doneSets.count,
                                        vol: 0, durSec: dur, distKm: distKm))
                continue
            }
            // cardio 인데 duration 미입력(구버그 데이터) — 세트·kg 표기 부적절 → "—"
            if GymExercises.def(b.exerciseId, custom: custom)?.equipment == "cardio" {
                ex.append(GymDayEntryEx(n: name, s: "—", key: b.exerciseId, kind: "cardio",
                                        setCount: doneSets.count, vol: 0, durSec: 0, distKm: 0))
                continue
            }
            let total = doneSets.reduce(0.0) { $0 + $1.volume }
            let label = total > 0 ? "\(doneSets.count)세트 · \(loc(total))kg" : "\(doneSets.count)세트"
            ex.append(GymDayEntryEx(n: name, s: label, key: b.exerciseId, kind: "weight",
                                    setCount: doneSets.count, vol: total, durSec: 0, distKm: 0))
        }
        let tag = session.tags.map { GymExercises.partName($0) }.joined(separator: " · ")
        return GymDayEntry(tag: tag, vol: session.totalVolume, min: session.durationMin,
                           pr: prCount, ex: ex, sessionId: session.id)
    }

    // 같은 날 다중 세션 병합 — vol/min/pr 합산, 같은 종목 행 합침 (stats.js mergeWorkoutEntries).
    public static func merged(_ entries: [GymDayEntry]) -> GymDayEntry {
        guard !entries.isEmpty else {
            return GymDayEntry(tag: "", vol: 0, min: 0, pr: 0, ex: [], sessionId: nil)
        }
        if entries.count == 1 { return entries[0] }
        var vol = 0.0, min = 0, pr = 0
        var tag = ""
        var sessionId: String? = nil
        var byKey: [String: GymDayEntryEx] = [:]
        var order: [String] = []
        for e in entries {
            vol += e.vol; min += e.min; pr += e.pr
            if tag.isEmpty, !e.tag.isEmpty { tag = e.tag }
            if let sid = e.sessionId { sessionId = sid }
            for item in e.ex {
                let k = "\(item.key)::\(item.kind)"
                guard var existing = byKey[k] else {
                    byKey[k] = item; order.append(k); continue
                }
                if item.kind == "cardio" {
                    existing.durSec += item.durSec
                    existing.distKm += item.distKm
                    let km = existing.distKm > 0 ? " · \(num(existing.distKm))km" : ""
                    existing.s = "\(Int((existing.durSec / 60).rounded()))분\(km)"
                } else {
                    existing.setCount += item.setCount
                    existing.vol += item.vol
                    existing.s = "\(existing.setCount)세트 · \(loc(existing.vol))kg"
                }
                byKey[k] = existing
            }
        }
        return GymDayEntry(tag: tag, vol: vol, min: min, pr: pr,
                           ex: order.compactMap { byKey[$0] }, sessionId: sessionId)
    }

    // "5월 6일 · 수요일" (day-detail-sheet.js formatDayLabel).
    static let weekdayKor = ["일", "월", "화", "수", "목", "금", "토"]
    public static func dayLabel(_ iso: String) -> String {
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return "" }
        var c = DateComponents(); c.year = parts[0]; c.month = parts[1]; c.day = parts[2]
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Seoul")!
        guard let d = cal.date(from: c) else { return "" }
        let wd = weekdayKor[cal.component(.weekday, from: d) - 1]
        return "\(parts[1])월 \(parts[2])일 · \(wd)요일"
    }
}

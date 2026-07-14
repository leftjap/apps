import Foundation

// 세션 상태머신 순수 로직 — PWA src/features/session.js 1:1 포팅.
// (buildPresetSets / addExerciseToActiveSession / handleLeftSwipe / resolveDotDisplay+formatSetSegment / pace)

// 카드 종류 — equipment 기반 분기 (spec §6-3·§6-4).
public enum GymCardKind: Equatable, Sendable {
    case weight, bodyweight, cardio
    public static func from(equipment: String) -> GymCardKind {
        equipment == "cardio" ? .cardio : equipment == "bodyweight" ? .bodyweight : .weight
    }
}

// 세트바 슬롯 표시 값 (formatSetSegment 정합 — top 굵게 / bottom 작게).
public struct GymDotDisplay: Equatable, Sendable {
    public let top: String
    public let bottom: String
    public let isPreview: Bool   // 미입력 preview(회색 톤) 여부
    public init(top: String, bottom: String, isPreview: Bool) {
        self.top = top; self.bottom = bottom; self.isPreview = isPreview
    }
}

public enum GymSessionLogic {

    // 소수 없는 값은 정수 표기 ("62.5"·"60") — JS 템플릿 문자열 정합.
    static func num(_ v: Double) -> String { String(format: "%g", v) }

    // MARK: - 프리셋 생성 (spec §6-3-3)

    // ③ 운동 기본값 prefill — defaultSets 개수만큼 preset:true. cardio 는 단일 세트(§6-4).
    public static func buildPresetSets(_ def: GymExerciseDef?) -> [GymSet] {
        guard let def else { return [] }
        let isCardio = def.equipment == "cardio"
        let isBodyweight = def.equipment == "bodyweight"
        let count = isCardio ? 1 : max(1, def.defaultSets)
        return (0..<count).map { _ in
            GymSet(weight: isCardio || isBodyweight ? nil : def.defaultWeight,
                   reps: isCardio ? nil : def.defaultReps,
                   preset: true)
        }
    }

    // ① 직전 세션 세트 카피 — weight/reps + cardio duration/distance 보존.
    public static func presetSets(fromPrev prevSets: [GymSet]) -> [GymSet] {
        prevSets.map {
            GymSet(weight: $0.weight, reps: $0.reps, preset: true,
                   duration: $0.duration, distance: $0.distance)
        }
    }

    // MARK: - 운동 추가/제거 (spec §6-1·§6-2)

    // 첫 종목 선택 순간 = startTime. 중복 exerciseId 거부. tags 에 part 누적.
    public static func addExercise(to session: GymSession, exerciseId: String, part: String,
                                   presetSets: [GymSet], now: Int64) -> (session: GymSession, added: Bool) {
        var s = session
        if s.blocks.contains(where: { $0.type == "single" && $0.exerciseId == exerciseId }) {
            return (s, false)
        }
        if s.startTime == nil { s.startTime = now }
        s.blocks.append(GymBlock(exerciseId: exerciseId, sets: presetSets))
        if !part.isEmpty && !s.tags.contains(part) { s.tags.append(part) }
        return (s, true)
    }

    // 블록 제거 — 해당 part 의 다른 블록이 없으면 tags 에서도 제거.
    public static func removeExercise(from session: GymSession, exerciseId: String,
                                      partResolver: (String) -> String) -> (session: GymSession, removed: Bool) {
        var s = session
        guard let idx = s.blocks.firstIndex(where: { $0.type == "single" && $0.exerciseId == exerciseId }) else {
            return (s, false)
        }
        let part = partResolver(exerciseId)
        s.blocks.remove(at: idx)
        if !part.isEmpty, !s.blocks.contains(where: { partResolver($0.exerciseId) == part }) {
            s.tags.removeAll { $0 == part }
        }
        return (s, true)
    }

    // MARK: - 좌 스와이프 커밋 (spec §6-3-1 handleLeftSwipe)

    // cur 세트 done 커밋. 마지막 세트면 preset 카피 추가. cur == -1(전부 완료)이면 추가만.
    // 다음 세트 상속(②)은 미수정 preset + 직전 세션 같은 세트번호 기록(reps>0) 없을 때만 (① 보존).
    public static func completeSet(sets: [GymSet], cur: Int,
                                   prevSessionSets: [GymSet]?) -> (sets: [GymSet], committed: Int?) {
        var out = sets
        if cur == -1 {
            let last = out.last
            out.append(GymSet(weight: last?.weight, reps: last?.reps, preset: true,
                              duration: last?.duration, distance: last?.distance))
            return (out, nil)
        }
        guard out.indices.contains(cur) else { return (out, nil) }
        out[cur].done = true
        out[cur].preset = false
        let committed = out[cur]
        if cur == out.count - 1 {
            out.append(GymSet(weight: committed.weight, reps: committed.reps, preset: true,
                              duration: committed.duration, distance: committed.distance))
        } else if out[cur + 1].preset {
            let ps: GymSet? = prevSessionSets.flatMap { $0.indices.contains(cur + 1) ? $0[cur + 1] : nil }
            let hasPrevSame = (ps?.reps ?? 0) > 0
            if !hasPrevSame {
                out[cur + 1].weight = committed.weight
                out[cur + 1].reps = committed.reps
            }
        }
        return (out, cur)
    }

    // PR 평가 대상 — 유의미한 중량 세트만 (0·nil·맨몸 제외, session.js (g) 가드 정합).
    public static func isPRCandidate(_ set: GymSet) -> Bool {
        (set.weight ?? 0) > 0 && (set.reps ?? 0) > 0
    }

    // MARK: - 블록 완료·잠금 (spec §6-8·§6-9)

    // 명시적 "완료" 액션 — done 세트만 보존(빈 세트 폐기) + finishedAt 스탬프.
    public static func finishBlock(_ block: GymBlock, now: Double) -> GymBlock {
        var b = block
        b.sets = b.sets.filter(\.done)
        b.finishedAt = now
        return b
    }

    // 잠금(read-only) = 명시적 완료만. 세트 전부 done 은 잠금 아님 (push/revert 보존).
    public static func isBlockLocked(_ block: GymBlock) -> Bool { block.finishedAt != nil }

    // 푸터 pill done 판정 = finishedAt 또는 세트 전부 done.
    public static func isBlockDone(_ block: GymBlock) -> Bool {
        block.finishedAt != nil || block.sets.allSatisfy(\.done)
    }

    // 완료 후 현재 종목 = 첫 미완료 블록 (전부 완료면 nil — 마지막 카드 read-only 유지).
    public static func firstUnfinishedBlockIdx(_ session: GymSession) -> Int? {
        session.blocks.firstIndex { $0.type == "single" && !isBlockDone($0) }
    }

    // MARK: - 하단 운동종목 레일 (session.js computeFooterOrder + classifyBlockState 정합)

    // 레일 칩 3단 깊이 (작업지시서 §4). PWA 'hold'(일부만 완료)는 예정과 같은 평면 아웃라인 룩.
    public enum GymRailState: String, Sendable { case done, current, upcoming }
    public struct GymFooterItem: Equatable, Sendable {
        public let index: Int          // 원본 blocks 인덱스 (탭·꾹누르기 타깃)
        public let state: GymRailState
    }

    /// 레일·액션시트용 현재 블록 — **전 종목 완료면 nil** (완료 칩을 탭해 selected 가 잡혀도 nil).
    /// 히어로는 heroBlockIdx 로 따로 뽑아 read-only 카드를 계속 그린다.
    /// PWA session.js footerCurrentBlock 과 같은 규칙 (전부 완료면 null, 그 외 pickedBlock).
    public static func activeBlockIdx(session: GymSession, selected: Int?) -> Int? {
        guard firstUnfinishedBlockIdx(session) != nil else { return nil }  // 전부 완료 — 선택돼 있어도 nil
        return heroBlockIdx(session: session, selected: selected)
    }

    /// 히어로 표시용 블록 — 명시 선택 우선, 없으면 첫 미완료, 그마저 없으면(전부 완료) 마지막 블록.
    /// 레일과 달리 전부 완료여도 nil 이 아니다 (read-only 카드를 계속 그려야 한다).
    /// PWA session.js:702 pickedBlock 과 같은 규칙.
    public static func heroBlockIdx(session: GymSession, selected: Int?) -> Int? {
        guard !session.blocks.isEmpty else { return nil }
        if let s = selected, session.blocks.indices.contains(s) { return s }
        return firstUnfinishedBlockIdx(session) ?? (session.blocks.count - 1)
    }

    // 꾹누르기 액션시트 항목 (session.js:1943 getActionMenuFor 'footer-exercise').
    // '이동' 은 PWA 에서 제거됨 — long-press hold + drag 재정렬로 대체 (spec §6-9 갱신).
    public enum GymBlockAction: String, Sendable { case finish, edit, delete }
    public static func blockActions(state: GymRailState) -> [GymBlockAction] {
        switch state {
        case .current: return [.finish, .delete]     // exState 'active'
        case .done: return [.edit, .delete]          // exState 'completed'
        case .upcoming: return [.delete]             // exState 'hold' | 'upcoming'
        }
    }

    /// [완료(finishedAt 오름차순) · 현재 · 예정(원래순)]. single 블록만. 현재는 완료여도 current.
    public static func footerOrder(blocks: [GymBlock], currentIdx: Int) -> [GymFooterItem] {
        let entries = blocks.enumerated().filter { $0.element.type == "single" }
        let isCur = { (i: Int) in i == currentIdx }
        let done = entries.filter { !isCur($0.offset) && isBlockDone($0.element) }
            .sorted { ($0.element.finishedAt ?? 0) < ($1.element.finishedAt ?? 0) }
        let current = entries.filter { isCur($0.offset) }
        let pending = entries.filter { !isCur($0.offset) && !isBlockDone($0.element) }
        return done.map { GymFooterItem(index: $0.offset, state: .done) }
            + current.map { GymFooterItem(index: $0.offset, state: .current) }
            + pending.map { GymFooterItem(index: $0.offset, state: .upcoming) }
    }

    // 레일 스크롤 정렬 대상. `.id(items 위치)` 로 스크롤한다.
    public enum GymRailScroll: Equatable, Sendable {
        case leading        // 선두(완료 칩)부터 보이게 — 스크롤 안 함과 동치
        case center(Int)    // 현재 칩을 트랙 중앙으로
    }

    /// 현재 칩이 뷰포트에 온전히 들어오면 선두 정렬, 벗어나면 중앙 정렬.
    /// **현재 칩이 없으면(전 종목 완료) 선두로 되돌린다** — 안 그러면 SwiftUI ScrollView 가
    /// 직전 오프셋을 유지해 완료 칩이 좌측으로 잘린다 (레일 작업지시서 §7 · PWA scrollLeft 0).
    /// currentChipMaxX == 0 은 preference 미측정 — 현재 칩이 있으면 중앙 정렬로 보장.
    public static func railScrollTarget(states: [GymRailState],
                                        currentChipMaxX: Double,
                                        viewportWidth: Double) -> GymRailScroll? {
        guard !states.isEmpty else { return nil }
        guard let idx = states.firstIndex(of: .current) else { return .leading }
        let fits = currentChipMaxX > 0 && currentChipMaxX <= viewportWidth
        return fits ? .leading : .center(idx)
    }

    /// 종목 볼륨 링 중앙 % 글꼴 (pt). 시안 #6b 676행 미돌파 15/10 · 693행 돌파 13.5/9.5.
    /// 돌파 시 3자리(`107%`)가 되므로 시안이 한 단계 축소한다.
    public static func exRingPctFont(isOver: Bool) -> (num: Double, unit: Double) {
        isOver ? (num: 13.5, unit: 9.5) : (num: 15, unit: 10)
    }

    // MARK: - 세트바 표시 (resolveDotDisplay + formatSetSegment)

    // done/current 는 실값, 미입력 preview 는 ① 직전 세션 같은 세트번호 → (직전 세션 없을 때만)
    // ② 이번 세션 직전 세트 → ③ sets[i] 자체 preset → '—'.
    public static func dotDisplay(sets: [GymSet], i: Int, cur: Int,
                                  prevSessionSets: [GymSet]?, kind: GymCardKind) -> GymDotDisplay {
        let bw = kind == .bodyweight
        func hasVal(_ s: GymSet?) -> Bool {
            guard let s else { return false }
            return s.reps != nil && (bw || s.weight != nil)
        }
        func meaningful(_ s: GymSet?) -> Bool { hasVal(s) && (s?.reps ?? 0) > 0 }
        func seg(_ s: GymSet, preview: Bool) -> GymDotDisplay {
            bw ? GymDotDisplay(top: "\(s.reps ?? 0)", bottom: "회", isPreview: preview)
               : GymDotDisplay(top: num(s.weight ?? 0), bottom: "×\(s.reps ?? 0)", isPreview: preview)
        }
        func dash(_ preview: Bool) -> GymDotDisplay { GymDotDisplay(top: "—", bottom: "", isPreview: preview) }

        let set: GymSet? = sets.indices.contains(i) ? sets[i] : nil
        if i == cur {
            if let set, hasVal(set) { return seg(set, preview: false) }
            return dash(false)
        }
        if let set, set.done, hasVal(set) { return seg(set, preview: false) }
        // ① 직전 세션 같은 세트번호 — 직전 세션이 존재하면 그 값만 (없는 세트번호는 '—').
        if let prev = prevSessionSets, !prev.isEmpty {
            if prev.indices.contains(i), hasVal(prev[i]) { return seg(prev[i], preview: true) }
            return dash(true)
        }
        // ② 이번 세션 직전 세트 (done 또는 현재 세트 값) — 첫 운동일 때만.
        var j = i - 1
        while j >= 0 {
            let s = sets[j]
            if meaningful(s), s.done || j == cur { return seg(s, preview: true) }
            j -= 1
        }
        // ③ sets[i] 자체 preset
        if let set, hasVal(set) { return seg(set, preview: true) }
        return dash(true)
    }

    // MARK: - 세션 마감 (finalizeActiveSession 정합 — §7-1·§8)

    // done 세트만 보존 + 빈 블록 제거 + totalVolume/durationMin(최소 1)/completed.
    // date 는 세션 생성일 유지 (PWA 정합 — 지난 밤 넘긴 세션도 시작일 기록).
    public static func finalize(_ session: GymSession, endTime: Int64) -> GymSession {
        var s = session
        s.blocks = s.blocks
            .map { b -> GymBlock in var x = b; x.sets = x.sets.filter(\.done); return x }
            .filter { !($0.type == "single" && $0.sets.isEmpty) }
        s.totalVolume = s.blocks.reduce(0.0) { $0 + $1.sets.reduce(0.0) { $0 + $1.volume } }
        s.endTime = endTime
        let start = s.startTime ?? endTime
        s.durationMin = max(1, Int((Double(endTime - start) / 60_000).rounded()))
        // 귀속일 = 실제 운동 시각(startTime = 첫 종목 추가 순간, 없으면 endTime) 의 KST 날짜.
        // 세션 생성일을 그대로 쓰면, 전날 만들어져 방치된 활성 세션을 오늘 재사용할 때
        // (startSession 은 active 세션이 있으면 그대로 씀) 오늘 운동이 어제로 기록된다.
        s.date = GymWeightLogic.isoFmt.string(from: Date(timeIntervalSince1970: Double(start) / 1000))
        s.status = .completed
        return s
    }

    // 마지막 활동 시각 — 블록 finishedAt 최대, 없으면 startTime (§8 sweep — duration 과대계산 방지).
    public static func lastActivityMillis(_ session: GymSession) -> Int64 {
        let finished = session.blocks.compactMap(\.finishedAt).max()
        if let f = finished { return Int64(f) }
        return session.startTime ?? 0
    }

    // MARK: - 유산소 페이스 (spec §6-4) — "9:23/km". 시간·거리 둘 다 있어야 표시.

    public static func paceText(durationSec: Double?, distanceKm: Double?) -> String? {
        guard let d = durationSec, d > 0, let km = distanceKm, km > 0 else { return nil }
        let pace = d / km
        let mm = Int(pace / 60)
        let ss = Int((pace.truncatingRemainder(dividingBy: 60)).rounded())
        return String(format: "%d:%02d/km", mm, ss)
    }
}

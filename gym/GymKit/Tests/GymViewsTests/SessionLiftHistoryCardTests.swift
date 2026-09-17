import Foundation
import Testing
import GymCore
@testable import GymViews

// 히스토리 카드의 두 원천이 같은 날을 가리키는지 (작업지시서 2026-09-17 §5).
//
// 원 안에 그리는 **날짜 숫자**는 `weekCells`(홈 캘린더)에서 오고, 셀 식별자·탭 시 넘기는
// **ISO 날짜**는 `SessionLiftHistoryCard.days` 가 직접 계산한다. 두 원천이 주 시작(월요일)을
// 다르게 잡으면 "9월 14일" 라벨 옆에 15 가 그려지고, 탭하면 엉뚱한 날 시트가 열린다.
// 접근성 라벨에는 ISO 쪽만 나오므로 UI 테스트로는 이 어긋남을 잡을 수 없다 — 여기서 본다.
//
// 두 원천의 월요일 계산식이 다르다는 점이 위험의 근거다:
//   weekCells        `dateComponents([.yearForWeekOfYear, .weekOfYear])` + firstWeekday 2
//   liftMetricWeek   `mondayIndex(weekday)` 만큼 날짜 빼기
@MainActor @Suite struct SessionLiftHistoryCardTests {

    func model(_ todayISO: String, worked: [String] = [], ex: String = "lat_pulldown") -> GymAppModel {
        let m = GymAppModel(snapshotSession: GymSession(id: "x", date: todayISO))
        m.referenceToday = GymAppModel.dayFmt.date(from: todayISO)!
        m.history = worked.map {
            GymSession(id: "h-\($0)", date: $0,
                       blocks: [GymBlock(exerciseId: ex,
                                         sets: [GymSet(weight: 45, reps: 10, done: true)])],
                       status: .completed)
        }
        return m
    }

    func cardDays(_ m: GymAppModel, ex: String = "lat_pulldown",
                  kind: GymCardKind = .weight) -> [LiftHistoryDay] {
        let week = GymSessionLogic.liftMetricWeek(history: m.history, todaySets: [],
                                                  exerciseId: ex, kind: kind, now: m.referenceToday)
        return SessionLiftHistoryCard.days(
            week: week,
            thisCells: m.weekCells(around: m.referenceToday),
            prevCells: m.weekCells(around: m.referenceToday, weekOffset: -1),
            refToday: m.referenceToday)
    }

    static func dayOfMonth(_ iso: String) -> Int { Int(iso.split(separator: "-")[2])! }

    // 요일·월말·연말·연초를 섞어 본다. 주 번호 계산은 연 경계에서 어긋나기 쉽다.
    @Test(arguments: ["2026-09-14",   // 월
                      "2026-09-17",   // 목
                      "2026-09-20",   // 일
                      "2026-08-31",   // 월 · 월말
                      "2026-12-28",   // 월 · 연말 주
                      "2027-01-03",   // 일 · 연초 (그 주 월요일은 전년 12-28)
                      "2027-01-04"])  // 월 · 새해 첫 주
    func dateNumberMatchesCellISO(_ todayISO: String) {
        let days = cardDays(model(todayISO))
        #expect(days.count == 14)
        for d in days {
            #expect(d.num == Self.dayOfMonth(d.iso),
                    "\(todayISO): 셀 \(d.iso) 에 숫자 \(d.num) 이 그려진다")
        }
        // 지난주 7칸은 이번 주 같은 칸보다 정확히 7일 앞선다.
        let cal = GymAppModel.kst
        for i in 0..<7 {
            let prev = GymAppModel.dayFmt.date(from: days[i].iso)!
            let this = GymAppModel.dayFmt.date(from: days[i + 7].iso)!
            #expect(cal.dateComponents([.day], from: prev, to: this).day == 7,
                    "\(todayISO): \(days[i].iso) 와 \(days[i + 7].iso) 이 7일 차가 아니다")
        }
    }

    // 심은 기록이 정확히 그 칸에만 찍힌다 — 앞뒤로 밀리면 여기서 걸린다.
    @Test func recordLandsOnExactlyItsOwnCell() {
        // 2026-09-17(목). 이번 주 월 = 09-14, 지난주 화 = 09-08, 지난주 금 = 09-11.
        let days = cardDays(model("2026-09-17", worked: ["2026-09-14", "2026-09-08", "2026-09-11"]))
        let marked = Set(days.filter(\.mark.ran).map(\.iso))
        #expect(marked == ["2026-09-14", "2026-09-08", "2026-09-11"])
        #expect(days.filter(\.isFuture).map(\.iso) == ["2026-09-18", "2026-09-19", "2026-09-20"])
        #expect(days.filter(\.tappable).map(\.iso).sorted() == ["2026-09-08", "2026-09-11", "2026-09-14"])
    }

    // 다른 종목·유산소 기록은 이 카드에 들어오지 않는다.
    @Test func otherExercisesAndCardioDoNotFillTheCard() {
        let m = model("2026-09-17", worked: ["2026-09-15"], ex: "bench_press")
        var run = GymSession(id: "run", date: "2026-09-16", status: .completed)
        var set = GymSet(preset: false); set.done = true; set.duration = 1500; set.distance = 3.2
        run.blocks = [GymBlock(exerciseId: "treadmill", sets: [set])]
        m.history.append(run)
        #expect(cardDays(m).filter(\.mark.ran).isEmpty, "랫 풀다운 카드에 다른 종목이 새어 들어왔다")
        // 같은 이력으로 벤치프레스 카드를 보면 그날만 찬다.
        #expect(cardDays(m, ex: "bench_press").filter(\.mark.ran).map(\.iso) == ["2026-09-15"])
    }

    // 맨몸 종목 — 볼륨이 0 이어도 done 세트가 있으면 그날은 찬다.
    @Test func bodyweightDayCountsEvenWithZeroVolume() {
        let m = model("2026-09-17")
        m.history = [GymSession(id: "bw", date: "2026-09-15",
                                blocks: [GymBlock(exerciseId: "decline_situp",
                                                  sets: [GymSet(reps: 12, done: true)])],
                                status: .completed)]
        let days = cardDays(m, ex: "decline_situp", kind: .bodyweight)
        #expect(days.filter(\.mark.ran).map(\.iso) == ["2026-09-15"])
    }

    // 오늘 — 기록이 없으면 링(todayEmpty)이고 탭되지 않는다. 생기면 채움이고 탭된다.
    @Test func todayIsRingUntilThereIsARecord() {
        let empty = cardDays(model("2026-09-17"))
        let today = empty.first { $0.iso == "2026-09-17" }
        #expect(today?.mark == .todayEmpty && today?.tappable == false)

        let filled = cardDays(model("2026-09-17", worked: ["2026-09-17"]))
        let t2 = filled.first { $0.iso == "2026-09-17" }
        #expect(t2?.mark == .ranToday && t2?.tappable == true)
    }
}

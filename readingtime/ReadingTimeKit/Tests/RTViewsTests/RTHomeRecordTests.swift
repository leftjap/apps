import Testing
import Foundation
@testable import RTViews

// 홈(02) 기록 리디자인 신규 파생값 — 역대 최고 연속(bestStreak) + 2주 캘린더 창(calendarWindow14).
// 작업지시서 v3 §5.1 · §5.2. 시간 의존은 model.now 주입으로 결정적 실행.
@MainActor
@Suite struct RTHomeRecordTests {
    let cal = Calendar(identifier: .gregorian)

    func date(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h))!
    }
    func model(now: Date) -> RTAppModel {
        let m = RTAppModel(); m.now = { now }; return m
    }
    func rec(_ d: Date, sec: Int = 600) -> RTSessionRecord {
        RTSessionRecord(isbn: nil, mode: "flip", seconds: sec, endedAt: d, pauseCount: 0)
    }
    /// yyyy-MM-dd 키 (ebookDaily 용) — RTAppModel.dayFormatter 와 동일 규약
    func key(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = cal; f.timeZone = cal.timeZone
        f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    // ── §5.1 bestStreak ──

    @Test func bestStreakExcludesRunInProgress() {
        // 오늘 6/18 에 닿은 구간(6/16~6/18, 3일)은 진행 중 → 제외.
        // 과거 완료 구간 6/1~6/5(5일)이 역대 최고.
        let m = model(now: date(2026, 6, 18, 20))
        let days = [1, 2, 3, 4, 5, 16, 17, 18].map { date(2026, 6, $0) }
        m.userData = RTUserData(books: [], sessions: days.map { rec($0) })
        #expect(m.bestStreak.days == 5)
        #expect(m.bestStreak.monthLabel == "6월")
    }

    @Test func bestStreakDayOneDoesNotReportZeroRemaining() {
        // AC #13 — 기록 첫날. 진행 구간(오늘 하루)뿐이면 과거 완료 구간이 없다 → (0, "").
        // 제외하지 않으면 best == streak == 1 이 되어 "최고까지 0일"이 뜬다.
        let m = model(now: date(2026, 6, 18, 20))
        m.userData = RTUserData(books: [], sessions: [rec(date(2026, 6, 18))])
        #expect(m.bestStreak.days == 0)
        #expect(m.bestStreak.monthLabel == "")
    }

    @Test func bestStreakTodayUnreadStillExcludesYesterdayRun() {
        // 오늘(6/18) 미기록 + 어제까지 연속 → 그 구간이 진행 구간이므로 제외.
        let m = model(now: date(2026, 6, 18, 9))
        let days = [1, 2, 3, 15, 16, 17].map { date(2026, 6, $0) }
        m.userData = RTUserData(books: [], sessions: days.map { rec($0) })
        #expect(m.bestStreak.days == 3)   // 6/1~6/3 (6/15~6/17 은 어제에 닿아 진행 중)
    }

    @Test func bestStreakTieTakesMostRecentRun() {
        // 동률(둘 다 2일)이면 최근 구간 → monthLabel 이 5월.
        let m = model(now: date(2026, 6, 18, 20))
        let days = [date(2026, 3, 10), date(2026, 3, 11), date(2026, 5, 20), date(2026, 5, 21)]
        m.userData = RTUserData(books: [], sessions: days.map { rec($0) })
        #expect(m.bestStreak.days == 2)
        #expect(m.bestStreak.monthLabel == "5월")
    }

    @Test func bestStreakLabelUsesYearWhenDifferent() {
        // 구간 마지막 날의 해가 오늘과 다르면 "2025.11" 형식.
        let m = model(now: date(2026, 6, 18, 20))
        let days = [date(2025, 11, 3), date(2025, 11, 4), date(2025, 11, 5)]
        m.userData = RTUserData(books: [], sessions: days.map { rec($0) })
        #expect(m.bestStreak.days == 3)
        #expect(m.bestStreak.monthLabel == "2025.11")
    }

    @Test func bestStreakCountsEbookDays() {
        // 밀리(ebookDaily > 0)도 같은 dayset 소스 — streakDays/streakChain 과 동일.
        let m = model(now: date(2026, 6, 18, 20))
        m.userData = RTUserData(books: [], sessions: [rec(date(2026, 6, 18))])
        m.ebookDaily = [key(date(2026, 6, 10)): 600, key(date(2026, 6, 11)): 600,
                        key(date(2026, 6, 12)): 600, key(date(2026, 6, 13)): 600]
        #expect(m.bestStreak.days == 4)
    }

    @Test func bestStreakEmptyWithoutUserData() {
        #expect(RTAppModel().bestStreak.days == 0)
    }

    // ── §5.2 calendarWindow14 ──

    @Test func calendarWindowIsFourteenMondayToSunday() {
        // 2026-08-27 은 목요일. 이번 주 월 = 8/24 → 창 시작 = 8/17(월), 끝 = 8/30(일).
        let m = model(now: date(2026, 8, 27, 21))
        m.userData = RTUserData(books: [], sessions: [])
        let w = m.calendarWindow14
        #expect(w.count == 14)
        #expect(w.first?.day == 17)
        #expect(w.last?.day == 30)
        #expect(w[6].isSunday)          // 8/23
        #expect(w[13].isSunday)         // 8/30
        #expect(!w[0].isSunday)
    }

    @Test func calendarWindowMarksTodayInLastRow() {
        // AC #6 — 오늘이 마지막 줄(index 7...13)에 포함된다. 8/27 = index 10.
        let m = model(now: date(2026, 8, 27, 21))
        m.userData = RTUserData(books: [], sessions: [])
        let w = m.calendarWindow14
        #expect(w.firstIndex(where: { $0.isToday }) == 10)
        #expect(w.filter(\.isToday).count == 1)
    }

    @Test func calendarWindowFlagsFutureAndZeroesMinutes() {
        let m = model(now: date(2026, 8, 27, 21))
        // 미래(8/28)에 기록이 있어도 미래 칸은 0분·isFuture 로 그린다.
        m.userData = RTUserData(books: [], sessions: [rec(date(2026, 8, 28), sec: 3600)])
        let w = m.calendarWindow14
        #expect(w.map(\.isFuture) == (0..<14).map { $0 > 10 })
        #expect(w[11].minutes == 0)
    }

    @Test func calendarWindowSumsPaperAndEbookMinutesFloor() {
        // 종이 90초 + 종이 30초 + 밀리 60초 = 180초 → 3분 (내림 규칙: todaySeconds/60 과 동일)
        let m = model(now: date(2026, 8, 27, 21))
        let d = date(2026, 8, 25)
        m.userData = RTUserData(books: [], sessions: [rec(d, sec: 90), rec(d, sec: 30)])
        m.ebookDaily = [key(d): 60]
        #expect(m.calendarWindow14[8].minutes == 3)   // 8/25 = index 8
        // 119초는 1분 (내림)
        let d2 = date(2026, 8, 19)
        m.userData?.sessions.append(rec(d2, sec: 119))
        #expect(m.calendarWindow14[2].minutes == 1)   // 8/19 = index 2
    }

    @Test func calendarWindowEmptyWithoutUserData() {
        // 데모 경로는 화면이 고정 배열을 쓰므로 모델은 빈 값을 낸다(날짜 의존 제거).
        #expect(RTAppModel().calendarWindow14.isEmpty)
    }

    // ── 캘린더 농도 α — 절대 기준 60분 (§4-⑤) ──

    @Test func calendarAlphaMatchesDesignValues() {
        // 시안 #14a 실측(CSS rgba 소수 3자리 반올림)과 대조.
        let pairs: [(Int, Double)] = [(12, 0.256), (28, 0.410), (34, 0.469),
                                      (39, 0.517), (41, 0.536), (47, 0.594),
                                      (52, 0.643), (63, 0.720)]
        for (min, expected) in pairs {
            #expect(abs(RTHomeCal.alpha(min) - expected) < 0.001,
                    "\(min)분 → \(RTHomeCal.alpha(min))")
        }
    }

    @Test func calendarAlphaClampsAtSixtyMinutes() {
        // AC #9 — 60분 이상은 0.72 고정.
        #expect(RTHomeCal.alpha(60) == 0.72)
        #expect(RTHomeCal.alpha(120) == 0.72)
        #expect(RTHomeCal.fullMinutes == 60)
    }

    // ── §4-③ 게이지 상태표 (4개 상태) ──
    // 신기록 상태는 데모 시드로 렌더 도달이 안 돼 이 테스트가 AC #14 의 유일한 검증 수단이다.

    @Test func gaugeNormalBelowBest() {
        // 시안 #14a: streak 9 / best 24 → frac 0.375, 눈금 오른쪽 끝, "15일 남음"
        let g = RTStreakGauge(streak: 9, best: 24)
        #expect(abs(g.frac - 0.375) < 0.0001)
        #expect(g.tickFrac == 1.0)
        #expect(!g.isNewRecord)
        #expect(g.showsBest)
        #expect(g.remainLabel == "15일 남음")
    }

    @Test func gaugeTieWithBest() {
        let g = RTStreakGauge(streak: 24, best: 24)
        #expect(g.frac == 1.0)
        #expect(g.tickFrac == 1.0)
        #expect(!g.isNewRecord)
        #expect(g.remainLabel == "최고 타이")
    }

    @Test func gaugeNewRecordGoesGoldAndShowsPlusDays() {
        // AC #14 — 골드 그라데이션(isNewRecord) + "+N일". 눈금은 역대 최고 지점으로 당겨진다.
        let g = RTStreakGauge(streak: 30, best: 24)
        #expect(g.isNewRecord)
        #expect(g.frac == 1.0)                       // 넘쳐도 1 로 clamp
        #expect(abs(g.tickFrac - 24.0 / 30.0) < 0.0001)
        #expect(g.remainLabel == "+6일")
        #expect(g.showsBest)
    }

    @Test func gaugeNoPastRunHidesBottomRow() {
        // best == 0 → 빈 트랙만, 하단 행(역대 최고 / 남음) 숨김. 눈금도 숨긴다.
        let g = RTStreakGauge(streak: 9, best: 0)
        #expect(g.frac == 0)
        #expect(!g.showsBest)
        #expect(!g.isNewRecord)
    }

    @Test func gaugeDayOneNeverShowsZeroRemaining() {
        // AC #13 — 기록 1일째(best 0)에서 하단 행이 숨겨지므로 "0일 남음" 이 뜰 수 없다.
        let g = RTStreakGauge(streak: 1, best: 0)
        #expect(!g.showsBest)
    }

    // ── AC #23 — 데모 캘린더 창은 날짜에 의존하지 않는다 (오늘이 바뀌어도 스크린샷 불변) ──

    @Test func demoCalendarWindowIsDateIndependent() {
        let w = Screen02Home.demoCal14
        #expect(w.count == 14)
        #expect(w.map(\.day) == Array(17...30))
        #expect(w.map(\.minutes) == [0, 0, 34, 52, 41, 63, 28, 12, 47, 39, 46, 0, 0, 0])
        #expect(w.firstIndex(where: { $0.isToday }) == 10)          // 8/27(목) 고정
        #expect(w.map(\.isFuture) == (0..<14).map { $0 > 10 })
        #expect(w.map(\.isSunday) == (0..<14).map { $0 % 7 == 6 })
        // 날짜가 2026-08 로 못 박혀 있어야 라벨("8월 27일")도 흔들리지 않는다
        let cal = Calendar(identifier: .gregorian)
        #expect(w.allSatisfy { cal.component(.year, from: $0.date) == 2026 })
        #expect(w.allSatisfy { cal.component(.month, from: $0.date) == 8 })
    }
}

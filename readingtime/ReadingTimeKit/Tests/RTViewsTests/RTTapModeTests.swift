import Testing
import Foundation
@testable import RTViews

// 탭 모드(05) 시안 J — design-ref/design_handoff_tap_mode.
// 링 눈금·각도·상태 분기, 05 시간 표기, 최장 계산, 화면 스냅샷 값(데모 오라클·라이브 배선).
// 기대값은 시안 문서 §1·§데모 경로·AC 7 의 식으로 손 계산한 값이다.

private func day(_ s: String, hour: Int = 12) -> Date {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone.current
    let p = s.split(separator: "-").map { Int($0)! }
    return c.date(from: DateComponents(year: p[0], month: p[1], day: p[2], hour: hour))!
}

private func near(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 1e-9 }

@Suite struct RTTapRingTests {
    // 데모: 26:14 / 최장 47:00 → 눈금 60분 · 최장 줄 282° · 이 세션 줄 157.4° · 점선 160.4°→280°
    @Test func demoGeometry() throws {
        let r = RTTapRing(elapsed: 26 * 60 + 14, best: 47 * 60)
        #expect(r.scaleMinutes == 60)
        #expect(near(r.ghostDeg, 282))
        #expect(near(r.liveDeg, 157.4))
        let gap = try #require(r.gap)
        #expect(near(gap.lowerBound, 160.4))
        #expect(near(gap.upperBound, 280))
        #expect(r.state == .normal)
        #expect(r.hasBest)
    }

    // AC 7: 최장 47분에 51분 → 눈금 75분, 두 줄이 함께 줄어들고 남은 거리는 없다
    @Test func scaleGrowsWhenSessionOutrunsBest() {
        let r = RTTapRing(elapsed: 51 * 60, best: 47 * 60)
        #expect(r.scaleMinutes == 75)
        #expect(near(r.ghostDeg, 225.6))   // 360 × 47/75
        #expect(near(r.liveDeg, 244.8))    // 360 × 51/75
        #expect(r.gap == nil)
    }

    // 눈금은 초 단위 경과로 정한다(목업 scaleMin 식) — 50:00 까지 60분, 50:01 부터 75분.
    // 분으로 내림해 계산하면 50:59 까지 60분에 머문다.
    @Test func scaleStepsOnSecondsNotFlooredMinutes() {
        #expect(RTTapRing(elapsed: 50 * 60, best: 47 * 60).scaleMinutes == 60)
        #expect(RTTapRing(elapsed: 50 * 60 + 1, best: 47 * 60).scaleMinutes == 75)
    }

    // 최소 눈금 30분 — 최장이 짧아도(10분) 한 바퀴를 30분 아래로 줄이지 않는다
    @Test func scaleFloorIsThirtyMinutes() {
        #expect(RTTapRing(elapsed: 60, best: 10 * 60).scaleMinutes == 30)
    }

    // 분 판정은 홈 게이지(RTStreakGauge)처럼 정수 비교 — 같은 분이면 타이, 다음 분부터 신기록
    @Test func tieAndRecordAreWholeMinuteComparisons() {
        let best = 47 * 60 + 32   // 47:32
        #expect(RTTapRing(elapsed: 46 * 60 + 59, best: best).state == .normal)
        #expect(RTTapRing(elapsed: 47 * 60 + 10, best: best).state == .tie)   // 22초 모자라도 같은 분
        #expect(RTTapRing(elapsed: 47 * 60 + 59, best: best).state == .tie)
        let rec = RTTapRing(elapsed: 48 * 60, best: best)
        #expect(rec.state == .record)
        #expect(rec.overMinutes == 1)
    }

    // 점선은 1° 이상 남았을 때만 — 끝점이 결승 눈금 5° 안에 들어오면 그리지 않는다
    @Test func gapHiddenWithinFiveDegreesOfBest() {
        #expect(RTTapRing(elapsed: 45 * 60, best: 47 * 60).gap != nil)       // 270° → 273…280
        #expect(RTTapRing(elapsed: 46 * 60 + 15, best: 47 * 60).gap == nil)  // 277.5° → 280.5…280
    }

    // AC 8: 최장 0(과거 세션 없음) → 최장 줄·결승 눈금·점선·기록 줄 없음, 신기록도 아니다
    @Test func noBestHidesChase() {
        let r = RTTapRing(elapsed: 26 * 60 + 14, best: 0)
        #expect(!r.hasBest)
        #expect(r.gap == nil)
        #expect(r.state == .normal)
        #expect(r.scaleMinutes == 45)   // 26:14 × 1.2 = 31.5분 → 15분 단위 올림
    }
}

@MainActor
@Suite struct RTTapClockTests {
    // 1시간 미만 mm:ss — 현행 05 의 "00:" 시 자리는 없다(AC 9)
    @Test func underAnHourShowsMinutesAndSeconds() {
        #expect(RTAppModel.clockParts(26 * 60 + 14) == (nil, "26", "14"))
        #expect(RTAppModel.clock(47 * 60) == "47:00")
    }

    // 1시간 이상 h:mm:ss — 시는 한 자리. 04·Live Activity 의 hms 는 그대로 두 자리
    @Test func hourIsSingleDigit() {
        #expect(RTAppModel.clockParts(3599) == (nil, "59", "59"))
        #expect(RTAppModel.clockParts(3600) == ("1", "00", "00"))   // 정확히 1시간부터 시 자리
        #expect(RTAppModel.clockParts(4328) == ("1", "12", "08"))
        #expect(RTAppModel.clock(89 * 60 + 12) == "1:29:12")
        #expect(RTAppModel.hms(4328) == ("01", "12", "08"))
    }
}

@MainActor
@Suite struct RTBestSessionTests {
    private func model(_ sessions: [RTSessionRecord]) -> RTAppModel {
        let m = RTAppModel()
        m.now = { day("2026-09-27") }
        m.userData = RTUserData(sessions: sessions)
        return m
    }

    // 타이머로 잰 세션(엎기·탭)만 — 직접 추가(manual)는 한 번에 앉아 잰 시간이 아니다
    @Test func countsOnlyTimedSessions() {
        let m = model([
            .init(isbn: nil, mode: "flip", seconds: 30 * 60, endedAt: day("2026-09-20"), pauseCount: 0),
            .init(isbn: nil, mode: "tap", seconds: 40 * 60, endedAt: day("2026-09-21"), pauseCount: 0),
            .init(isbn: nil, mode: "manual", seconds: 120 * 60, endedAt: day("2026-09-22"), pauseCount: 0),
        ])
        #expect(m.bestSessionSeconds == 40 * 60)
        // 엎기 세션이 최장이면 그 값 — 탭 모드 화면이라고 탭 세션만 보면 안 된다
        let f = model([
            .init(isbn: nil, mode: "flip", seconds: 50 * 60, endedAt: day("2026-09-20"), pauseCount: 0),
            .init(isbn: nil, mode: "tap", seconds: 40 * 60, endedAt: day("2026-09-21"), pauseCount: 0),
        ])
        #expect(f.bestSessionSeconds == 50 * 60)
    }

    @Test func zeroWithoutTimedSessions() {
        #expect(model([]).bestSessionSeconds == 0)
        #expect(model([.init(isbn: nil, mode: "manual", seconds: 50 * 60,
                             endedAt: day("2026-09-22"), pauseCount: 0)]).bestSessionSeconds == 0)
    }

    // 진행 중 세션은 저장 전이라 최장에 들어가지 않는다 — 그래야 넘는 순간이 신기록이 된다
    @Test func excludesSessionInProgress() {
        let m = model([.init(isbn: nil, mode: "tap", seconds: 40 * 60, endedAt: day("2026-09-21"), pauseCount: 0)])
        m.setMode(.tap)
        m.start()
        m.syncElapsed(90 * 60)
        #expect(m.bestSessionSeconds == 40 * 60)
    }

    // 데모(userData nil) — 시안 값 47분
    @Test func demoIsFortySevenMinutes() {
        #expect(RTAppModel().bestSessionSeconds == 47 * 60)
    }

    // 검증용 --seq 액션 — 타이·신기록 상태를 rtshot 으로 렌더하려면 경과를 넣을 수 있어야 한다
    @Test func elapsedActionSetsSessionTime() {
        let m = RTAppModel()
        for a in ["login", "mode:tap", "start", "elapsed:2830"] { m.apply(a) }
        #expect(m.session?.elapsed == 2830)
    }
}

@MainActor
@Suite struct Screen05SnapshotTests {
    // 데모 오라클(시안 J §데모 경로): 몰입 · 26:14 · 최장 47:00 · 오늘 누적 58분 · 연속 9일.
    // 정적 렌더(model nil)와 시드 모델 경로(rtshot --app 05)가 같은 값을 내야 한다.
    @Test func demoValues() throws {
        let seeded = try #require(RTAppModel.seeded("05"))
        for s in [Screen05TapRecording(), Screen05TapRecording(model: seeded)] {
            #expect(s.bookTitle == "몰입")
            #expect(s.elapsed == 26 * 60 + 14)
            #expect(s.best == 47 * 60)
            #expect(s.todayMin == 58)
            #expect(s.streak == 9)
            #expect(!s.paused)
        }
    }

    // 라이브: 오늘 누적 = 오늘 저장된 기록 + 이 세션 분, 연속 = streakDays, 최장 = 타이머 세션 최장, 책 = 세션 책
    @Test func liveValues() {
        let book = RTBook(isbn: "9791167903792", title: "서성이다", author: "장강명",
                          publisher: "현대문학", coverUrl: "", addedAt: day("2026-09-20"))
        let m = RTAppModel()
        m.now = { day("2026-09-27", hour: 21) }
        m.sessionSeed = 0
        m.userData = RTUserData(books: [book], sessions: [
            .init(isbn: book.isbn, mode: "tap", seconds: 89 * 60 + 12, endedAt: day("2026-09-25"), pauseCount: 0),
            .init(isbn: book.isbn, mode: "flip", seconds: 20 * 60, endedAt: day("2026-09-26"), pauseCount: 0),
            .init(isbn: book.isbn, mode: "tap", seconds: 30 * 60, endedAt: day("2026-09-27", hour: 9), pauseCount: 0),
        ])
        m.login()
        m.setMode(.tap)
        m.start()
        m.syncElapsed(12 * 60 + 5)
        let s = Screen05TapRecording(model: m)
        #expect(s.bookTitle == "서성이다")
        #expect(s.best == 89 * 60 + 12)
        #expect(s.todayMin == 42)   // 오늘 저장된 30분 + 이 세션 12분
        #expect(s.streak == 3)      // 9.25 · 9.26 · 9.27
    }
}

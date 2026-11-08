import Testing
import Foundation
@testable import RTViews

// 2026-11-08 검토 남은 항목 2차 — 06 이어 읽기, 07 책 고르기, 오래된 밀리 카드, 위치 정밀도,
// 위치는 세션 시작 때만, readingtime_daily 를 앱 기록에서 계산.

private let cal = Calendar(identifier: .gregorian)
private func at(_ m: Int, _ d: Int, _ h: Int, _ mi: Int = 0) -> Date {
    cal.date(from: DateComponents(year: 2026, month: m, day: d, hour: h, minute: mi))!
}
private let bookA = RTBook(isbn: "A", title: "서성이다", author: "장강명", publisher: "", coverUrl: "", addedAt: at(11, 1, 9))
private let bookB = RTBook(isbn: "B", title: "몰입", author: "칙센트미하이", publisher: "", coverUrl: "", addedAt: at(11, 2, 9))
private let bookDone = RTBook(isbn: "C", title: "다 읽은 책", author: "", publisher: "", coverUrl: "", addedAt: at(10, 1, 9),
                              finished: true, rating: 4, finishedAt: at(10, 20, 9))
private let bookMillie = RTBook(isbn: "millie:x", title: "밀리 책", author: "", publisher: "", coverUrl: "",
                                addedAt: at(10, 1, 9), finished: true, millieBookId: "x")

@MainActor
private func liveModel(_ sessions: [RTSessionRecord] = [], now: Date = at(11, 8, 14, 14)) -> RTAppModel {
    let m = RTAppModel()
    m.sessionSeed = 0
    m.now = { now }
    m.userData = RTUserData(books: [bookA, bookB, bookDone, bookMillie], sessions: sessions)
    m.login()
    return m
}

// ── 06 — 저장 전 화면에서 이어 읽기 ──
@MainActor
@Suite struct RTDoneResumeTests {
    @Test func resumeReturnsToPausedFlipTimer() {
        let m = liveModel()
        m.selectedISBN = "A"
        m.start(isbn: "A")
        m.simFlip(at: at(11, 8, 13, 0))
        m.endSession()
        #expect(m.route == .done)
        let elapsed = m.session?.elapsed
        m.resumeFromDone()
        #expect(m.route == .flipTimer)
        #expect(m.session?.status == .paused && m.session?.elapsed == elapsed)
        #expect(m.userData?.sessions.isEmpty == true, "이어 읽기는 저장하지 않는다")
    }

    @Test func resumeTapSessionReturnsToTapTimer() {
        let m = liveModel()
        m.setMode(.tap)
        m.start(isbn: "A")
        m.endSession()
        m.resumeFromDone()
        #expect(m.route == .tapTimer && m.session?.status == .paused)
    }
}

// ── 07 — 기록할 책 고르기 ──
@MainActor
@Suite struct RTAddTimeBookPickTests {
    @Test func bookChoicesArePaperBooksReadingFirst() {
        let m = liveModel()
        #expect(m.addtimeBookChoices.map(\.isbn) == ["B", "A", "C"], "밀리 편입 책 제외, 읽는 중(최근 추가순) → 완독")
    }

    @Test func newRecordGoesToChosenBook() {
        let m = liveModel()
        m.selectedISBN = "A"
        m.openSheet(.addtime)
        #expect(m.addtimeBook?.isbn == "A")
        m.chooseAddtimeBook("B")
        m.addTime()
        #expect(m.userData?.sessions.last?.isbn == "B")
    }

    @Test func editedRecordMovesToChosenBook() {
        let rec = RTSessionRecord(isbn: "A", mode: "flip", seconds: 1200, endedAt: at(11, 7, 21), pauseCount: 1)
        let m = liveModel([rec])
        m.openRecordEditor(rec)
        #expect(m.addtimeBook?.isbn == "A")
        m.chooseAddtimeBook("B")
        m.addTime()
        let saved = m.userData!.sessions[0]
        #expect(saved.isbn == "B" && saved.seconds == 1200 && saved.mode == "flip" && saved.endedAt == at(11, 7, 21),
                "잘못 붙은 기록을 다른 책으로 옮길 수 있어야 한다")
    }
}

// ── 오래된 밀리 카드 — 30일 넘게 안 읽은 밀리 책은 홈 카드에서 빠진다 ──
@MainActor
@Suite struct RTMillieCardWindowTests {
    @Test func staleMillieCardsDrop() {
        let m = liveModel()
        m.ebookReadAt = ["최근 밀리": at(11, 1, 9), "오래된 밀리": at(9, 20, 9)]
        let titles = m.homeCards.filter(\.isEbook).map(\.title)
        #expect(titles == ["최근 밀리"])
    }
}

// ── 위치 — 저장 좌표는 소수 셋째 자리(약 100m)까지, 위치는 세션을 시작할 때만 잡는다 ──
@MainActor
@Suite struct RTLocationPrivacyTests {
    @Test func savedCoordinatesAreCoarse() {
        let m = liveModel()
        m.locationProvider = { RTPlaceFix(latitude: 37.5443217, longitude: 127.0559871, placeId: "KR:서울:성수동") }
        m.start(isbn: "A")
        m.simFlip()
        m.endSession()
        m.saveSession()
        let rec = m.userData!.sessions.last!
        #expect(rec.latitude == 37.544 && rec.longitude == 127.056)
        m.openSheet(.addtime)
        m.addTime()
        #expect(m.userData!.sessions.last!.latitude == 37.544)
    }

    @Test func sessionStartHookFiresOnlyOnStart() {
        let m = liveModel()
        var starts = 0
        m.onSessionStart = { starts += 1 }
        m.setMode(.tap)
        m.start(isbn: "A")
        m.togglePause()
        m.togglePause()     // 재개
        m.togglePause()
        m.togglePause()     // 재개
        #expect(starts == 1, "재개할 때마다 위치를 다시 잡으면 마지막 재개 위치가 세션 위치가 된다")
    }
}

// ── readingtime_daily — 앱 기록에서 날짜(KST)·방식별 합을 계산해 서버 값과 맞춘다 ──
@Suite struct RTDailyMirrorTests {
    private func kst(_ m: Int, _ d: Int, _ h: Int) -> Date {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Seoul")!
        return c.date(from: DateComponents(year: 2026, month: m, day: d, hour: h))!
    }

    @Test func totalsPerKSTDayAndSource() {
        let data = RTUserData(sessions: [
            RTSessionRecord(isbn: "A", mode: "flip", seconds: 600, endedAt: kst(11, 7, 23), pauseCount: 0),
            RTSessionRecord(isbn: "B", mode: "flip", seconds: 300, endedAt: kst(11, 7, 9), pauseCount: 0),
            RTSessionRecord(isbn: "A", mode: "tap", seconds: 120, endedAt: kst(11, 8, 0), pauseCount: 0),
            RTSessionRecord(isbn: "A", mode: "manual", seconds: 1800, endedAt: kst(11, 8, 8), pauseCount: 0),
        ])
        #expect(RTDailyMirror.rows(data) == [
            RTDailyMirror.Key(day: "2026-11-07", source: "flip"): 900,
            RTDailyMirror.Key(day: "2026-11-08", source: "tap"): 120,
            RTDailyMirror.Key(day: "2026-11-08", source: "manual"): 1800,
        ])
    }

    @Test func changesUpsertDifferencesAndZeroMissingRows() {
        let want: [RTDailyMirror.Key: Int] = [.init(day: "2026-11-07", source: "flip"): 900,
                                              .init(day: "2026-11-08", source: "manual"): 1800]
        let server: [RTDailyMirror.Key: Int] = [.init(day: "2026-11-07", source: "flip"): 900,      // 같음 → 안 보냄
                                                .init(day: "2026-11-06", source: "tap"): 400,       // 지운 기록 → 0
                                                .init(day: "2026-11-08", source: "manual"): 600]    // 고친 기록 → 1800
        let c = RTDailyMirror.changes(want: want, server: server)
        #expect(c == [.init(day: "2026-11-06", source: "tap"): 0,
                      .init(day: "2026-11-08", source: "manual"): 1800])
    }
}

// ── 밀리 편입 책의 ISBN 이 바뀌어도 열려 있는 상세는 같은 책 ──
// 완독 → 서재 편입 → 백그라운드 책 검색이 키를 "millie:…" 에서 실 ISBN 으로 바꾼다. 상세가 옛 키를 들고 있으면
// selectedBook 이 읽는 중 종이책으로 넘어가 다른 책 상세가 뜬다 (MillieLibraryUITests 가 네트워크 속도에 따라 실패한 원인).
@MainActor
@Suite struct RTMillieUpgradeSelectionTests {
    @Test func openDetailFollowsUpgradedISBN() {
        let m = liveModel()
        m.millieMeta = ["삼미": RTMillieMeta(bookId: "4c17", author: "박민규", publisher: nil, coverUrl: nil)]
        m.ebookReadAt = ["삼미": at(11, 7, 9)]
        m.finishEbook("삼미")
        m.openBookDetail(isbn: "millie:4c17")
        #expect(m.selectedBook?.title == "삼미")
        m.upgradeMillieBook(key: "millie:4c17",
                            to: RTBookHit(title: "삼미", author: "박민규", publisher: "한겨레", isbn: "978000", coverUrl: ""))
        #expect(m.selectedISBN == "978000")
        #expect(m.selectedBook?.title == "삼미", "ISBN 이 바뀐 뒤에도 상세는 같은 책이어야 한다")
    }
}

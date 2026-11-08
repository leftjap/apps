import Testing
import Foundation
import CoreGraphics
@testable import RTViews

// 2026-11-08 전체 검토 후속 — 07 시간 직접 추가 시트의 실데이터화, 저장된 기록 고치기·지우기,
// 1분 미만 종이 기록의 연속일 제외, 통계에서 빠지던 삭제한 책의 시간, 로컬 사본 디코딩 실패 보존.

private let cal = Calendar(identifier: .gregorian)
private func at(_ d: Int, _ h: Int, _ mi: Int = 0) -> Date {
    cal.date(from: DateComponents(year: 2026, month: 11, day: d, hour: h, minute: mi))!
}
private let bookA = RTBook(isbn: "A", title: "서성이다", author: "장강명", publisher: "현대문학",
                           coverUrl: "", addedAt: at(1, 9))
private let bookB = RTBook(isbn: "B", title: "몰입", author: "미하이 칙센트미하이", publisher: "한울림",
                           coverUrl: "", addedAt: at(2, 9))

@MainActor
private func liveModel(sessions: [RTSessionRecord] = [], now: Date = at(8, 14, 14)) -> RTAppModel {
    let m = RTAppModel()
    m.userData = RTUserData(books: [bookA, bookB], sessions: sessions)
    m.now = { now }
    m.login()
    return m
}

// ── 07 시간 직접 추가 ──
@MainActor
@Suite struct RTAddTimeLiveTests {
    @Test func liveSheetOpensWithNeutralDefaults() {
        let m = liveModel()
        m.addtimeValue = 50; m.addtimePreset = 10; m.addtimeDate = at(3, 9)   // 지난번 값이 남아 있어도
        m.openSheet(.addtime)
        #expect(m.addtimeValue == 30)
        #expect(m.addtimePreset == nil, "시안 데모의 +15 선택 상태로 열리면 안 된다")
        #expect(m.addtimeDate == nil, "일시 기본값 = 저장하는 순간(지금)")
        #expect(m.editingRecord == nil)
    }

    @Test func demoSheetKeepsMockState() {
        let m = RTAppModel()   // userData nil = rtshot 픽셀 오라클 경로
        m.openSheet(.addtime)
        #expect(m.addtimeValue == 35 && m.addtimePreset == 15)
    }

    @Test func addTimeSavesChosenDateForSelectedBook() {
        let m = liveModel()
        m.selectedISBN = "B"
        m.openSheet(.addtime)
        m.addtimeDate = at(6, 21, 40)
        m.addTime()
        let rec = m.userData!.sessions.last!
        #expect(rec.endedAt == at(6, 21, 40))
        #expect(rec.isbn == "B" && rec.mode == "manual" && rec.seconds == 30 * 60)
    }

    @Test func addTimeWithoutChosenDateSavesNow() {
        let m = liveModel()
        m.openSheet(.addtime)
        m.addTime()
        #expect(m.userData!.sessions.last!.endedAt == at(8, 14, 14))
    }

    @Test func futureDateIsClampedToNow() {
        let m = liveModel()
        m.openSheet(.addtime)
        m.addtimeDate = at(9, 10)
        m.addTime()
        #expect(m.userData!.sessions.last!.endedAt == at(8, 14, 14))
    }

    @Test func stepDownNeverRaisesSmallValue() {
        let m = liveModel()
        m.addtimeValue = 3
        m.step(-5)
        #expect(m.addtimeValue == 3, "5분 하한 클램프가 3분을 5분으로 올리면 안 된다")
    }

    @Test func whenLabel() {
        let now = at(8, 14, 14)
        #expect(Sheet07AddTime.whenLabel(at(8, 9, 5), now: now) == "오늘 · 09:05")
        #expect(Sheet07AddTime.whenLabel(at(7, 21, 40), now: now) == "어제 · 21:40")
        #expect(Sheet07AddTime.whenLabel(at(3, 8, 0), now: now) == "11.3 · 08:00")
    }
}

// ── 저장된 기록 고치기·지우기 (08 기록 행 탭) ──
@MainActor
@Suite struct RTRecordEditorTests {
    static let flipRec = RTSessionRecord(isbn: "A", mode: "flip", seconds: 26 * 60 + 40, endedAt: at(7, 21, 40),
                                         pauseCount: 2, latitude: 37.5, longitude: 127.0,
                                         placeId: "KR:서울특별시:성수동", placeName: "성수동", country: "대한민국")
    static let other = RTSessionRecord(isbn: "A", mode: "tap", seconds: 600, endedAt: at(6, 8), pauseCount: 0)

    @Test func editorPrefillsFromRecord() {
        let m = liveModel(sessions: [Self.other, Self.flipRec])
        m.openRecordEditor(Self.flipRec)
        #expect(m.sheet == .addtime)
        #expect(m.editingRecord == Self.flipRec)
        #expect(m.addtimeValue == 26 && m.addtimePreset == nil)
        #expect(m.addtimeDate == at(7, 21, 40))
    }

    @Test func savingEditReplacesOnlyThatRecord() {
        let m = liveModel(sessions: [Self.other, Self.flipRec])
        m.openRecordEditor(Self.flipRec)
        m.step(5)
        m.addtimeDate = at(7, 22, 0)
        m.addTime()
        let s = m.userData!.sessions
        #expect(s.count == 2)
        #expect(s[0] == Self.other)
        #expect(s[1].seconds == 31 * 60 && s[1].endedAt == at(7, 22, 0))
        #expect(s[1].mode == "flip" && s[1].pauseCount == 2 && s[1].placeName == "성수동",
                "방식·일시정지·위치는 그대로")
        #expect(m.sheet == nil && m.editingRecord == nil)
    }

    @Test func savingWithoutChangesKeepsExactSeconds() {
        let m = liveModel(sessions: [Self.flipRec])
        m.openRecordEditor(Self.flipRec)
        m.addTime()
        #expect(m.userData!.sessions == [Self.flipRec], "분 단위 표시값으로 저장하면 40초가 사라진다")
    }

    @Test func deleteRemovesOneRecord() {
        let m = liveModel(sessions: [Self.flipRec, Self.other, Self.flipRec])   // 똑같은 기록 두 개
        m.openRecordEditor(Self.flipRec)
        m.deleteEditingRecord()
        #expect(m.userData!.sessions == [Self.other, Self.flipRec])
        #expect(m.sheet == nil && m.editingRecord == nil)
    }

    @Test func closingEditorForgetsRecord() {
        let m = liveModel(sessions: [Self.flipRec])
        m.openRecordEditor(Self.flipRec)
        m.closeSheet()
        #expect(m.editingRecord == nil)
        m.openSheet(.addtime)
        m.addTime()
        #expect(m.userData!.sessions.count == 2, "닫은 뒤 '직접 추가'는 새 기록이어야 한다")
    }

    @Test func editorIgnoresUnknownRecord() {
        let m = liveModel(sessions: [Self.other])
        m.openRecordEditor(Self.flipRec)
        #expect(m.sheet == nil && m.editingRecord == nil)
    }

    @Test func detailListsEveryRecordOfTheBook() {
        let recs = (0..<8).map { i in
            RTSessionRecord(isbn: "A", mode: "flip", seconds: 600, endedAt: at(1 + i % 7, 10 + i), pauseCount: 0)
        }
        let m = liveModel(sessions: recs + [RTSessionRecord(isbn: "B", mode: "tap", seconds: 60,
                                                             endedAt: at(8, 9), pauseCount: 0)])
        m.selectedISBN = "A"
        let live = Screen08Detail(model: m).live!
        #expect(live.rows.count == 8, "최근 5건만 보이면 그 앞 기록은 고칠 수 없다")
        #expect(live.rows.allSatisfy { $0.record?.isbn == "A" })
    }
}

// ── 1분 미만 종이 기록은 읽은 날이 아니다 (밀리 ebookMinSeconds 와 같은 기준) ──
@MainActor
@Suite struct RTPaperMinDayTests {
    @Test func underOneMinuteDayDoesNotKeepStreak() {
        let m = liveModel(sessions: [
            RTSessionRecord(isbn: "A", mode: "tap", seconds: 20, endedAt: at(8, 9), pauseCount: 0),
            RTSessionRecord(isbn: "A", mode: "flip", seconds: 900, endedAt: at(7, 9), pauseCount: 0),
        ])
        #expect(m.streakDays == 1, "오늘 20초는 읽은 날이 아니다 — 어제까지의 연속 1일")
        #expect(m.streakChain(2) == [true, false])
    }

    @Test func shortSessionsSummingToAMinuteCount() {
        let m = liveModel(sessions: [
            RTSessionRecord(isbn: "A", mode: "tap", seconds: 30, endedAt: at(8, 9), pauseCount: 0),
            RTSessionRecord(isbn: "A", mode: "tap", seconds: 30, endedAt: at(8, 10), pauseCount: 0),
        ])
        #expect(m.streakDays == 1)
    }

    @Test func statsReadDaysSkipUnderOneMinute() {
        let data = RTUserData(books: [bookA], sessions: [
            RTSessionRecord(isbn: "A", mode: "tap", seconds: 20, endedAt: at(5, 9), pauseCount: 0),
            RTSessionRecord(isbn: "A", mode: "flip", seconds: 900, endedAt: at(6, 9), pauseCount: 0),
        ])
        let mo = RTStats.month(RTStats.live(data: data, now: at(8, 12)), year: 2026, month: 11)
        #expect(mo.readDays == 1)
    }
}

// ── 통계 합계 = 홈 합계 (삭제한 책·책 없는 기록도 센다) ──
@Suite struct RTStatsOrphanTests {
    @Test func deletedBookTimeStaysInStats() throws {
        let data = RTUserData(books: [bookA], sessions: [
            RTSessionRecord(isbn: "A", mode: "flip", seconds: 600, endedAt: at(6, 9), pauseCount: 0),
            RTSessionRecord(isbn: "GONE", mode: "flip", seconds: 1200, endedAt: at(7, 9), pauseCount: 0),
            RTSessionRecord(isbn: nil, mode: "tap", seconds: 300, endedAt: at(7, 10), pauseCount: 0),
        ])
        let ds = RTStats.live(data: data, now: at(8, 12))
        let mo = RTStats.month(ds, year: 2026, month: 11)
        #expect(mo.totalSec == 2100, "서재에서 지운 책의 기록은 남는다고 안내했다 — 통계에서도 빠지면 안 된다")
        let gone = try #require(ds.books.first { $0.title == "삭제한 책" })
        #expect(gone.isbn == "", "지운 책은 08 상세가 없으므로 탭 불가")
        #expect(ds.books.contains { $0.title == "책 미지정" && $0.isbn == "" })
    }
}

// ── 로컬 사본 디코딩 실패 — 원본을 지우지 않고 보관 ──
@Suite struct RTLocalUserDataTests {
    @Test func missingLocalNeedsRestore() {
        let r = RTUserData.loadLocal(nil)
        #expect(r.data == RTUserData() && r.needsRestore && r.unreadable == nil)
    }

    @Test func unreadableLocalIsKeptForRecovery() {
        let raw = Data("{\"books\":[{\"isbn\":1}]".utf8)
        let r = RTUserData.loadLocal(raw)
        #expect(r.needsRestore, "깨진 사본으로 업로드하면 서버 정본을 빈 데이터로 덮는다")
        #expect(r.unreadable == raw)
    }

    @Test func readableLocalLoads() throws {
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        let d = RTUserData(books: [bookA])
        let r = RTUserData.loadLocal(try enc.encode(d))
        #expect(r.data == d && !r.needsRestore && r.unreadable == nil)
    }
}

// ── 06 오늘 막대 — 1시간 고정이면 1시간 넘게 읽은 날 이번 세션 구간이 0 이 된다 ──
@Suite struct RTDoneBarScaleTests {
    @Test func underAnHourKeepsOneHourAxis() {
        let s = Screen06Done.barScale(todaySeconds: 32 * 60, sessionSeconds: 26 * 60)
        #expect(s.hours == 1)
        #expect(abs(s.base - 32.0 / 60) < 1e-9 && abs(s.add - 26.0 / 60) < 1e-9)
    }

    @Test func longDayWidensAxis() {
        let s = Screen06Done.barScale(todaySeconds: 70 * 60, sessionSeconds: 30 * 60)
        #expect(s.hours == 2)
        #expect(abs(s.base - 70.0 / 120) < 1e-9 && abs(s.add - 30.0 / 120) < 1e-9)
    }
}

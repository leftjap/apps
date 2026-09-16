import Testing
import Foundation
@testable import RTViews

// 홈 파트너 행 (사용자 보고 2026-09-16) — 소연이 28일째 안 읽었는데 행에는 늘 "0분 오늘"이
// 뜨고, 탭해서 들어가면 최근 기록이 없다. 실데이터: 소연 마지막 세션 2026-08-19T07:37:39Z,
// 미완독 책 '웬만해선 아무렇지 않다' 한 권.
//
// 행이 답해야 하는 것은 "오늘 몇 분"이 아니라 **마지막으로 읽은 때와 그때 읽던 책**이다.
// 오늘 읽고 있을 때만 오늘 시간이 의미를 갖는다.

private func at(_ s: String) -> Date {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = TimeZone.current
    f.dateFormat = s.contains(" ") ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd"
    return f.date(from: s)!
}

@MainActor
@Suite struct RTPartnerRowTests {

    private func book(_ isbn: String, _ title: String, finished: Bool = false) -> RTBook {
        RTBook(isbn: isbn, title: title, author: "저자", publisher: "출판",
               coverUrl: "", addedAt: at("2026-07-01"), finished: finished)
    }

    /// 2026-09-16 실데이터 — 소연: 완독 3권 + 미완독 1권, 마지막 세션 08-19
    private func model(now: String = "2026-09-16 00:30") -> RTAppModel {
        let m = RTAppModel()
        m.now = { at(now) }
        m.userData = RTUserData()
        m.partnerData = RTUserData(
            books: [book("9788937489341", "차남들의 세계사", finished: true),
                    book("9788960907706", "눈감지 마라", finished: true),
                    book("9788960902572", "웬만해선 아무렇지 않다")],
            sessions: [
                .init(isbn: "9788960907706", mode: "flip", seconds: 2012, endedAt: at("2026-08-02 16:55"), pauseCount: 0),
                .init(isbn: "9788960902572", mode: "flip", seconds: 1878, endedAt: at("2026-08-10 18:06"), pauseCount: 0),
                .init(isbn: "9788960902572", mode: "flip", seconds: 1846, endedAt: at("2026-08-19 16:37"), pauseCount: 0),
            ])
        return m
    }

    // ── 마지막으로 읽은 때 ──

    @Test func reportsWhenAndWhatWasLastRead() {
        let m = model()
        let p = m.partnerSummary
        #expect(p?.lastAt == at("2026-08-19 16:37"))
        #expect(p?.lastBook == "웬만해선 아무렇지 않다")
        #expect(p?.readToday == false)
    }

    @Test func lastBookComesFromTheLastSessionNotShelfOrder() {
        // 서재 배열의 마지막 미완독 책이 아니라 '마지막 세션의 책' 이어야 한다.
        // 미완독이 여러 권이면 둘이 갈린다.
        let m = model()
        m.partnerData?.books.append(book("9999999999999", "나중에 담은 미완독 책"))
        #expect(m.partnerData?.books.last(where: { !$0.finished })?.title == "나중에 담은 미완독 책")
        #expect(m.partnerSummary?.lastBook == "웬만해선 아무렇지 않다")
    }

    @Test func finishedBookStillNamedWhenItWasTheLastRead() {
        // 마지막으로 읽은 책을 그 뒤 완독했어도 그 책을 댄다(그때 읽던 책이 사실이므로).
        let m = model()
        m.partnerData?.sessions.append(
            .init(isbn: "9788960907706", mode: "flip", seconds: 600, endedAt: at("2026-08-20 10:00"), pauseCount: 0))
        #expect(m.partnerSummary?.lastBook == "눈감지 마라")
    }

    // ── 오늘 읽었을 때만 오늘 시간이 의미를 갖는다 ──

    @Test func todayMinutesOnlyWhenReadToday() {
        let m = model(now: "2026-09-16 00:30")
        #expect(m.partnerSummary?.readToday == false)
        #expect(m.partnerSummary?.todayMinutes == 0)

        m.partnerData?.sessions.append(
            .init(isbn: "9788960902572", mode: "flip", seconds: 1500, endedAt: at("2026-09-16 00:10"), pauseCount: 0))
        #expect(m.partnerSummary?.readToday == true)
        #expect(m.partnerSummary?.todayMinutes == 25)
        #expect(m.partnerSummary?.lastAt == at("2026-09-16 00:10"))
    }

    @Test func lastDayMinutesIsThatDaysTotal() {
        // 오늘 안 읽었을 때 우측에 보여줄 값 — 마지막으로 읽은 '그날' 의 총 시간.
        let m = model()
        #expect(m.partnerSummary?.lastDayMinutes == 30)      // 08-19 1846초

        // 같은 날 두 번 읽었으면 합산
        m.partnerData?.sessions.append(
            .init(isbn: "9788960902572", mode: "flip", seconds: 600, endedAt: at("2026-08-19 21:00"), pauseCount: 0))
        #expect(m.partnerSummary?.lastDayMinutes == 40)      // (1846 + 600) / 60
    }

    @Test func noSessionsYieldsNoSummary() {
        let m = model()
        m.partnerData = RTUserData()
        #expect(m.partnerSummary?.lastAt == nil)
        #expect(m.partnerSummary?.lastBook == nil)
    }

    @Test func withoutPartnerDataThereIsNoSummary() {
        let m = model()
        m.partnerData = nil
        #expect(m.partnerSummary == nil)
    }

    // ── 탭하면 기록이 있는 달이 열려야 한다 ──

    @Test func openingPartnerStatsLandsOnTheirLastRecordedMonth() {
        // 현재 달(9월)에는 파트너 기록이 없다 — 빈 화면을 띄우면 고장으로 보인다.
        let m = model()
        m.openPartnerStats()
        #expect(m.statsSubject == .partner)
        #expect(m.route == .stats)
        #expect(m.statsDisplayedMonth == RTStatsYM(year: 2026, month: 8))
    }

    @Test func openingPartnerStatsStaysOnCurrentMonthWhenTheyReadThisMonth() {
        let m = model()
        m.partnerData?.sessions.append(
            .init(isbn: "9788960902572", mode: "flip", seconds: 600, endedAt: at("2026-09-16 00:10"), pauseCount: 0))
        m.openPartnerStats()
        #expect(m.statsDisplayedMonth == RTStatsYM(year: 2026, month: 9))
    }

    @Test func myStatsIgnoresPartnerMonth() {
        // 파트너 통계를 보고 나온 뒤 내 통계는 현재 달이어야 한다.
        let m = model()
        m.openPartnerStats()
        m.nav(.home)
        m.openMyStats()
        #expect(m.statsSubject == .me)
        #expect(m.statsDisplayedMonth == RTStatsYM(year: 2026, month: 9))
    }
}

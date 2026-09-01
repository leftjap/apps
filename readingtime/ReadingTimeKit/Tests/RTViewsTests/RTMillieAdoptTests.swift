import Testing
import Foundation
@testable import RTViews

// 밀리 책 서재 편입 (사용자 결정 2026-09-01) — 완독 처리 시 RTBook 으로 서재에 남기고,
// 알라딘 검색(제목+저자)으로 ISBN 을 매칭해 업그레이드한다. 밀리 원천엔 ISBN 이 없다(실측).
@MainActor
@Suite struct RTMillieAdoptTests {
    let cal = Calendar(identifier: .gregorian)

    func date(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 12) -> Date {
        cal.date(from: DateComponents(year: y, month: mo, day: d, hour: h))!
    }
    /// 밀리 데이터가 실린 라이브 모델 — 삼미(메타 있음) + 스모킹 오레오(메타 없음, 표지만)
    func model(now: Date) -> RTAppModel {
        let m = RTAppModel(); m.now = { now }
        m.login()   // route home — 다시 읽기 분기가 화면 이동을 안 하는지 검증하려면 홈에서 출발
        m.userData = RTUserData(books: [], sessions: [])
        m.millieMeta = ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]":
            RTMillieMeta(bookId: "4c17703240404997", author: "박민규",
                         publisher: "한겨레출판", coverUrl: "https://img.millie.co.kr/sammi.jpg")]
        m.ebookCovers = ["스모킹 오레오": "https://img.millie.co.kr/oreo.jpg"]
        m.ebookBooks = ["2026-08-25": ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"],
                        "2026-08-28": ["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"],
                        "2026-08-29": ["스모킹 오레오"]]
        return m
    }

    // ── 편입 ──

    @Test func finishEbookAdoptsIntoLibrary() {
        let m = model(now: date(2026, 9, 1, 16))
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")

        let b = try! #require(m.userData?.books.first)
        #expect(b.isbn == "millie:4c17703240404997")
        #expect(b.millieBookId == "4c17703240404997")
        #expect(b.title == "삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        #expect(b.author == "박민규")
        #expect(b.publisher == "한겨레출판")
        #expect(b.coverUrl == "https://img.millie.co.kr/sammi.jpg")
        #expect(b.finished)
        #expect(b.finishedAt == date(2026, 9, 1, 16))
        // addedAt = 그 책을 처음 읽은 날 (일별 히스토리 최소 day)
        #expect(cal.isDate(b.addedAt, inSameDayAs: date(2026, 8, 25)))
        // 기존 완독 마커도 그대로 (홈 카드 제외 문법 유지)
        #expect(m.finishedEbooks["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"] != nil)
    }

    @Test func finishEbookWithoutMetaFallsBackToTitleKey() {
        let m = model(now: date(2026, 9, 1))
        m.finishEbook("스모킹 오레오")

        let b = try! #require(m.userData?.books.first)
        #expect(b.isbn == "millie:t:스모킹 오레오")
        #expect(b.millieBookId == "스모킹 오레오")     // 판별 플래그는 항상 non-nil
        #expect(b.author == "")
        #expect(b.coverUrl == "https://img.millie.co.kr/oreo.jpg")   // ebookCovers 폴백
        #expect(cal.isDate(b.addedAt, inSameDayAs: date(2026, 8, 29)))
    }

    @Test func refinishUpdatesExistingEntryWithoutDuplicate() {
        let m = model(now: date(2026, 9, 1, 10))
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        // 다시 읽기 → 재완독 (하루 뒤)
        m.selectedISBN = "millie:4c17703240404997"
        m.rereadBook()
        m.now = { self.date(2026, 9, 2, 22) }
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")

        #expect(m.userData?.books.count == 1)
        let b = try! #require(m.userData?.books.first)
        #expect(b.finished)
        #expect(b.finishedAt == date(2026, 9, 2, 22))
    }

    @Test func demoPathWithoutUserDataDoesNotAdopt() {
        let m = RTAppModel()   // userData nil = 데모/rtshot 경로
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        #expect(m.userData == nil)
        #expect(m.finishedEbooks.count == 1)   // 마커 동작은 기존 그대로
    }

    // ── 다시 읽기 (밀리 분기) ──

    @Test func rereadMillieClearsMarkerWithoutStartingSession() {
        let m = model(now: date(2026, 9, 1))
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        m.selectedISBN = "millie:4c17703240404997"

        m.rereadBook()

        #expect(m.userData?.books.first?.finished == false)
        #expect(m.finishedEbooks.isEmpty, "완독 마커가 해제돼야 홈 카드가 부활한다")
        #expect(m.session == nil, "밀리 책은 엎기 세션을 시작하면 안 된다")
        #expect(m.route == .home, "세션 화면으로 이동하면 안 된다")
    }

    @Test func rereadPaperBookStillStartsSession() {
        let m = model(now: date(2026, 9, 1))
        m.userData = RTUserData(books: [RTBook(isbn: "P1", title: "몰입", author: "칙센트미하이",
                                               publisher: "한울림", coverUrl: "", addedAt: date(2026, 8, 1),
                                               finished: true, rating: 4, finishedAt: date(2026, 8, 20))],
                                sessions: [])
        m.selectedISBN = "P1"
        m.rereadBook()
        #expect(m.userData?.books.first?.finished == false)
        // 종이책 start() 는 세션 객체가 아니라 엎기 대기(03) 진입 — 그 문법이 유지되는지 검증
        #expect(m.route == .flipWait, "종이책 다시 읽기는 기존대로 엎기 대기로 진입한다")
    }

    // ── 알라딘 매칭 ──

    func hit(_ title: String, _ author: String, isbn: String = "9788901234567",
             publisher: String = "출판사") -> RTBookHit {
        RTBookHit(title: title, author: author, publisher: publisher, isbn: isbn,
                  coverUrl: "https://aladin/\(isbn).jpg")
    }

    @Test func bestMatchIgnoresBracketSuffixAndMatchesAuthor() {
        let hits = [hit("삼미 슈퍼스타즈의 마지막 팬클럽", "김철수"),
                    hit("삼미 슈퍼스타즈의 마지막 팬클럽", "박민규", isbn: "9788972756194")]
        let best = RTAppModel.bestMillieMatch(
            hits: hits, title: "삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]", author: "박민규")
        #expect(best?.isbn == "9788972756194")
    }

    @Test func bestMatchNormalizesAuthorRoleSuffixes() {
        // 밀리 저자 원문 "이기호 지음 / 박선경 그림" → 첫 저자 토큰으로 매칭
        let hits = [hit("웬만해선 아무렇지 않다", "이기호", isbn: "9788954637169")]
        let best = RTAppModel.bestMillieMatch(
            hits: hits, title: "웬만해선 아무렇지 않다", author: "이기호 지음 / 박선경 그림")
        #expect(best?.isbn == "9788954637169")
    }

    @Test func bestMatchRejectsWrongAuthor() {
        let hits = [hit("독학이라는 세계", "전혀다른사람")]
        #expect(RTAppModel.bestMillieMatch(hits: hits, title: "독학이라는 세계",
                                           author: "시라토리 하루히코 지음") == nil)
    }

    @Test func bestMatchWithoutAuthorRequiresExactTitle() {
        let hits = [hit("스모킹 오레오와 친구들", "김홍"), hit("스모킹 오레오", "김홍", isbn: "9791159924361")]
        let best = RTAppModel.bestMillieMatch(hits: hits, title: "스모킹 오레오", author: nil)
        #expect(best?.isbn == "9791159924361")
    }

    @Test func bestMatchAcceptsAladinSubtitleConvention() {
        // 알라딘은 부제를 "제목 - 부제" 로 붙인다 (실측: "독학이라는 세계 - 생각하는 힘을
        // 잃어버린 어른들을 위한"). 밀리 제목과 본제목이 같으면 부제는 무시하고 매칭한다.
        let hits = [hit("독학이라는 세계 - 생각하는 힘을 잃어버린 어른들을 위한",
                        "시라토리 하루히코", isbn: "9791193941645")]
        let best = RTAppModel.bestMillieMatch(hits: hits, title: "독학이라는 세계",
                                              author: "시라토리 하루히코 지음 / 양필성 옮김")
        #expect(best?.isbn == "9791193941645")
    }

    @Test func bestMatchDoesNotTreatLongerTitleAsSubtitle() {
        // "제목 - " 경계 없이 이어지는 다른 책은 부제 관행으로 오인하면 안 된다
        let hits = [hit("독학이라는 세계관", "시라토리 하루히코")]
        #expect(RTAppModel.bestMillieMatch(hits: hits, title: "독학이라는 세계",
                                           author: "시라토리 하루히코") == nil)
    }

    // ── ISBN 업그레이드 ──

    @Test func upgradeReplacesKeyAndKeepsMillieCoverAndFlag() {
        let m = model(now: date(2026, 9, 1))
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        m.upgradeMillieBook(key: "millie:4c17703240404997",
                            to: hit("삼미 슈퍼스타즈의 마지막 팬클럽", "박민규", isbn: "9788972756194"))

        let b = try! #require(m.userData?.books.first)
        #expect(b.isbn == "9788972756194")
        #expect(b.millieBookId == "4c17703240404997", "실 ISBN 이 돼도 밀리 판별은 유지")
        #expect(b.coverUrl == "https://img.millie.co.kr/sammi.jpg", "화면에 쓰던 밀리 표지 유지")
        #expect(b.finished && b.title == "삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
    }

    @Test func upgradeFillsEmptyAuthorAndPublisher() {
        let m = model(now: date(2026, 9, 1))
        m.finishEbook("스모킹 오레오")   // 메타 없음 → author/publisher 빈 값
        m.upgradeMillieBook(key: "millie:t:스모킹 오레오",
                            to: hit("스모킹 오레오", "김홍", isbn: "9791159924361", publisher: "한겨레출판"))
        let b = try! #require(m.userData?.books.first)
        #expect(b.author == "김홍" && b.publisher == "한겨레출판")
    }

    @Test func upgradeAbortsWhenISBNAlreadyInLibrary() {
        // 같은 책을 종이로도 갖고 있으면 병합 대신 포기 (중복 ISBN 금지 — 병합은 별건)
        let m = model(now: date(2026, 9, 1))
        m.userData?.books.append(RTBook(isbn: "9788972756194", title: "삼미(종이)", author: "박민규",
                                        publisher: "한겨레출판", coverUrl: "", addedAt: date(2026, 1, 1)))
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        m.upgradeMillieBook(key: "millie:4c17703240404997",
                            to: hit("삼미", "박민규", isbn: "9788972756194"))
        #expect(m.userData?.books.first(where: { $0.isbn == "millie:4c17703240404997" }) != nil,
                "밀리 키가 그대로 남아야 한다")
    }

    @Test func matchAdoptedMillieBookEndToEnd() async {
        let m = model(now: date(2026, 9, 1))
        m.searchProvider = { query in
            // 검색어는 대괄호 꼬리를 뗀 제목이어야 알라딘에서 잡힌다
            #expect(query == "삼미 슈퍼스타즈의 마지막 팬클럽")
            return [self.hit("삼미 슈퍼스타즈의 마지막 팬클럽", "박민규", isbn: "9788972756194")]
        }
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        await m.matchAdoptedMillieBook("millie:4c17703240404997")
        #expect(m.userData?.books.first?.isbn == "9788972756194")
    }

    @Test func saveFinishedOnMillieBookAlsoSetsHomeCardMarker() {
        // 미완독 밀리 책(다시 읽기 상태)을 상세→별점 시트로 완독하면 홈 카드도 빠져야 한다
        let m = model(now: date(2026, 9, 1))
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        m.selectedISBN = "millie:4c17703240404997"
        m.rereadBook()                       // 마커 해제 + finished=false
        #expect(m.finishedEbooks.isEmpty)

        m.rate(5)
        m.saveFinished()

        let b = try! #require(m.userData?.books.first)
        #expect(b.finished && b.rating == 5)
        #expect(m.finishedEbooks["삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]"] != nil,
                "별점 시트 완독도 홈 카드 제외 마커를 세워야 한다")
    }

    @Test func adoptionFiresPersistenceHook() {
        // 앱은 onUserDataChange 로 UserDefaults 에 저장한다 — 편입·업그레이드가 이 훅을 타야
        // 재실행 후에도 서재에 남는다. (--seq 실행은 오염 방지로 훅을 의도적으로 미배선하므로
        // 영속은 E2E 가 아니라 여기서 검증한다.)
        let m = model(now: date(2026, 9, 1))
        var saves = 0
        m.onUserDataChange = { _ in saves += 1 }
        m.finishEbook("삼미 슈퍼스타즈의 마지막 팬클럽[개정2판]")
        #expect(saves == 1, "편입이 영속 훅을 타지 않음")
        m.upgradeMillieBook(key: "millie:4c17703240404997",
                            to: hit("삼미 슈퍼스타즈의 마지막 팬클럽", "박민규", isbn: "9788972756194"))
        #expect(saves == 2, "ISBN 업그레이드가 영속 훅을 타지 않음")
    }

    // ── Codable 하위호환 ──

    @Test func bookDecodesWithoutMillieField() throws {
        let legacy = """
        {"isbn":"P1","title":"몰입","author":"칙센트미하이","publisher":"한울림",
         "coverUrl":"","addedAt":700000000,"finished":false}
        """.data(using: .utf8)!
        let d = JSONDecoder()
        d.dateDecodingStrategy = .secondsSince1970
        let b = try d.decode(RTBook.self, from: legacy)
        #expect(b.millieBookId == nil)
    }
}

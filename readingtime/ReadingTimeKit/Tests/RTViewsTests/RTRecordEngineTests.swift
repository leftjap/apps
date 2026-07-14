import Testing
import Foundation
import CoreGraphics
@testable import RTViews

// 기록(주·월·지도) 엔진 — 목업 mockups/RTRecord.dc.html 의 Component 로직 이식 정합.
// 오라클: 작업지시서 README + screens/*.png 에서 읽히는 값.

@Suite struct RTRecordEngineTests {

    // ── §2 헬퍼 ──
    @Test func fmtHM() {
        #expect(RTRecord.fmtHM(446) == "7:26")
        #expect(RTRecord.fmtHM(60) == "1:00")
        #expect(RTRecord.fmtHM(104) == "1:44")
        #expect(RTRecord.fmtHM(1268) == "21:08")   // 월간 총 시간
        #expect(RTRecord.fmtHM(144) == "2:24")     // 뉴욕 누적 (screens/2)
    }

    @Test func fmtKorMin() {
        #expect(RTRecord.fmtKorMin(96) == "1시간 36분")   // screens/2 파친코
        #expect(RTRecord.fmtKorMin(48) == "48분")
        #expect(RTRecord.fmtKorMin(88) == "1시간 28분")   // screens/3 6.05 도쿄
        #expect(RTRecord.fmtKorMin(60) == "1시간 0분")
    }

    // ── §3 주간 ──
    @Test func weekBarHeights() {
        // h = round(12 + min/96*72), min = [52,74,43,96,63,34,84]
        let h = RTRecordDemo.week.map { RTRecord.weekBarH($0.min) }
        #expect(h == [51, 68, 44, 84, 59, 38, 75])
    }

    @Test func weekTotalIs446() {
        #expect(RTRecordDemo.week.reduce(0) { $0 + $1.min } == 446)   // 7:26
    }

    @Test func weekPopoverForSelectedDay() {
        let tip = RTRecord.weekTip(day: 3)   // 기본 선택 = 목
        #expect(tip.leftPct == 50)           // (3+0.5)/7*100
        #expect(tip.date == "5.21 목 · 96분")
        #expect(tip.rows.count == 2)
        #expect(tip.rows[0].title == "몰입" && tip.rows[0].min == 60)
        #expect(tip.rows[1].title == "돈의 심리학" && tip.rows[1].min == 36)
    }

    @Test func weekRanksTop3() {
        let r = RTRecord.weekRanks()
        #expect(r.count == 3)
        #expect(r[0].title == "몰입" && r[0].total == "3:22" && r[0].pct == 100)
        #expect(r[1].title == "돈의 심리학" && r[1].total == "1:19" && r[1].pct == 39)
        #expect(r[2].title == "사피엔스" && r[2].total == "1:08" && r[2].pct == 34)
    }

    @Test func streakDotsLastIsRinged() {
        let d = RTRecord.streakDots()
        #expect(d.count == 14)
        #expect(d[0].color == 0xEEE7D4)
        #expect(d[13].color == 0xC2553A)
        #expect(d[13].isLast)
        #expect(!d[0].isLast)
    }

    // ── §4 월간 ──
    @Test func monthWeekBars() {
        let w = RTRecord.monthWeeks()
        #expect(w.map(\.h) == [29, 44, 48, 40, 19])          // round(8 + v/362*40)
        #expect(w.map(\.val) == ["3:10", "5:24", "6:02", "4:48", "1:44"])
        #expect(w.map(\.current) == [false, false, false, true, false])   // 현재 = 4주(idx3)
        #expect(w.map(\.lbl) == ["1주", "2주", "3주", "4주", "5주"])
    }

    @Test func monthRanksTop4() {
        let r = RTRecord.monthRanks()
        #expect(r.count == 4)
        #expect(r.map(\.pct) == [100, 61, 40, 34])
        #expect(r.map(\.total) == ["6:12", "3:48", "2:30", "2:05"])
        #expect(r[0].title == "몰입")
        #expect(r[3].title == "노르웨이의 숲")
    }

    @Test func calendarCells() {
        let c = RTRecord.calendarCells()
        #expect(c.count == 35)                       // 앞 빈칸 4 + 31일
        #expect(c[0].day == nil)                     // 빈칸
        #expect(c[3].day == nil)
        // 1일 = books[(1*3+5)%10] = books[8] 노르웨이의 숲
        #expect(c[4].day == 1 && c[4].cover == RTRecordDemo.books[8].fill)
        // 4일 = noRead → 표지 없음
        #expect(c[7].day == 4 && c[7].cover == nil)
        // 21일 = 오늘 → 링
        let d21 = c.first { $0.day == 21 }!
        #expect(d21.today && d21.cover == RTRecordDemo.books[8].fill)
        // 22일 이후 = 미래 → 표지 없음
        #expect(c.first { $0.day == 22 }!.future)
        #expect(c.first { $0.day == 22 }!.cover == nil)
        // 일요일 = 3,10,17,24,31
        #expect(c.first { $0.day == 3 }!.sunday)
        #expect(!c.first { $0.day == 4 }!.sunday)
    }

    // ── §5.1 투영 ──
    @Test func projection() {
        let p = RTRecord.proj(lat: 37.5, lng: 127.0)   // 서울
        #expect(abs(p.x - 852.7777) < 0.01)
        #expect(abs(p.y - 145.8333) < 0.01)
        let o = RTRecord.proj(lat: 0, lng: 0)
        #expect(abs(o.x - 500) < 0.001 && abs(o.y - 250) < 0.001)
    }

    // ── §5.3~5.4 클러스터 · 마커 (기본 뷰 scale .46 / tx -88 / ty 258) ──
    @Test func defaultViewMarkers() {
        let m = RTRecord.markers(scale: 0.46, tx: -88, ty: 258)
        // 13 place → 서울권(6) + 유럽(3) + 뉴욕 + LA + 두바이 + 시드니 = 6 마커 (screens/1)
        #expect(m.count == 6)

        let seoul = m.first { $0.label.hasPrefix("서울") }!
        #expect(seoul.label == "서울 외 5")       // screens/1
        #expect(seoul.count == 9)                 // 배지 9
        #expect(seoul.showBadge)
        #expect(seoul.isCluster)
        #expect(seoul.coverTitle == "몰입")        // 최신 세션(6.20)의 책
        #expect(seoul.left == 294 && seoul.top == 342)
        #expect(seoul.w == 36 && seoul.hpx == 50) // 클러스터 크기
        #expect(seoul.hasStack && seoul.hasS2)

        let paris = m.first { $0.label.hasPrefix("파리") }!
        #expect(paris.label == "파리 외 2")
        #expect(paris.count == 5)
        #expect(paris.coverTitle == "페스트")
        #expect(paris.left == 148 && paris.top == 312)

        let ny = m.first { $0.label == "뉴욕" }!
        #expect(!ny.isCluster)
        #expect(ny.count == 2 && ny.showBadge)
        #expect(ny.coverTitle == "파친코")
        #expect(ny.left == 47 && ny.top == 321)
        #expect(ny.w == 32 && ny.hpx == 44)       // 단일 크기
        #expect(ny.hasStack && !ny.hasS2)

        let sydney = m.first { $0.label == "시드니" }!
        #expect(sydney.count == 1 && !sydney.showBadge && !sydney.hasStack)
        #expect(sydney.coverTitle == "노르\n웨이")

        // 그림자 폭 = round((w+6)*0.72)
        #expect(seoul.shadowW == 30)   // round(42*0.72)=30
        #expect(ny.shadowW == 27)      // round(38*0.72)=27
        // z-index
        #expect(seoul.z == 20 && ny.z == 10)
    }

    // ── §5.6 탭 분기 ──
    @Test func singlePlaceOneBookOpensBookDetail() {
        // 시드니 = 노르웨이의 숲 1권 → 책 상세 직행
        #expect(RTRecord.openTarget(["sydney"]) == .book(8))
    }

    @Test func singlePlaceMultiBookOpensSheet() {
        // 뉴욕 = 2권 → 장소 시트
        #expect(RTRecord.openTarget(["ny"]) == .sheet(["ny"]))
    }

    @Test func tightClusterFallsBackToOpenTarget() {
        // 유럽(파리·런던·로마): raw = min(320/bw,300/bh) > 5.6 → 줌 불가 → openTarget → 5권 → 시트
        let ids = ["paris", "london", "rome"]
        #expect(RTRecord.fitOrSheet(ids, scale: 0.46) == .sheet(ids))
    }

    @Test func spreadClusterZoomsToFit() {
        // 서울권 6곳: raw ≈ 2.94 ≤ 5.6 → 줌 투 핏
        let ids = ["seoul", "jeju", "tokyo", "hongkong", "bangkok", "singapore"]
        guard case .zoom(let s, let tx, let ty) = RTRecord.fitOrSheet(ids, scale: 0.46) else {
            Issue.record("줌이어야 함"); return
        }
        #expect(abs(s - 2.9388) < 0.01)
        #expect(abs(tx - (-2255.0)) < 1.0)
        #expect(abs(ty - (-216.2)) < 1.0)
    }

    @Test func zoomAroundClampsAndAnchors() {
        let v = RTRecord.zoomAround(cx: 195, cy: 373, f: 1.6, scale: 0.46, tx: -88, ty: 258)
        #expect(abs(v.scale - 0.736) < 0.0001)
        // tx = 195 - (195-(-88))*1.6 = 195 - 452.8 = -257.8
        #expect(abs(v.tx - (-257.8)) < 0.01)
        // ty = 373 - (373-258)*1.6 = 373 - 184 = 189
        #expect(abs(v.ty - 189) < 0.01)
        // 상한 clamp 4.2
        let hi = RTRecord.zoomAround(cx: 195, cy: 373, f: 1.6, scale: 4.0, tx: 0, ty: 0)
        #expect(abs(hi.scale - 4.2) < 0.0001)
        // 하한 clamp 0.34
        let lo = RTRecord.zoomAround(cx: 195, cy: 373, f: 1 / 1.6, scale: 0.4, tx: 0, ty: 0)
        #expect(abs(lo.scale - 0.34) < 0.0001)
    }

    // ── §6 장소 시트 (screens/2) ──
    @Test func placeSheetForNewYork() {
        let s = RTRecord.buildSheet(["ny"])
        #expect(s.name == "뉴욕")
        #expect(s.sub == "미국")
        #expect(s.statBooks == 2)
        #expect(s.statTime == "2:24")
        #expect(s.period == "6.23 – 6.24")
        #expect(s.covers.count == 2)
        #expect(s.covers[0].title == "파친코" && s.covers[0].time == "1시간 36분" && !s.covers[0].millie)
        #expect(s.covers[1].title == "도둑맞은 집중력" && s.covers[1].time == "48분" && s.covers[1].millie)
        #expect(s.covers[0].bookId == 4 && s.covers[1].bookId == 2)
    }

    @Test func placeSheetForClusterUsesCountrySubtitle() {
        // 복수 place → sub = "{국가} · {N}개 지역", 대표 = 세션수 최다
        let s = RTRecord.buildSheet(["paris", "london", "rome"])
        #expect(s.name == "파리")           // 세션 2개로 london 과 동률 → 원순서(paris 먼저)
        #expect(s.sub == "프랑스 · 3개 지역")
        #expect(s.statBooks == 5)
        #expect(s.statTime == "5:16")       // 90+60+70+44+52 = 316분
        #expect(s.period == "5.02 – 5.16")
    }

    @Test func placeSheetSinglePlaceSingleSessionPeriod() {
        let s = RTRecord.buildSheet(["bangkok"])
        #expect(s.period == "3.22")   // 세션 1개 → 그 날짜
        #expect(s.statBooks == 1)
        #expect(s.statTime == "0:58")
    }

    // ── §7 책 상세 (screens/3) ──
    @Test func bookDetailPachinko() {
        let b = RTRecord.buildBook(4)
        #expect(b.title == "파친코")
        #expect(b.author == "이민진")
        #expect(b.tag == "직접 기록")
        #expect(!b.millie)
        #expect(b.statTime == "3:40")      // 96+36+88 = 220분
        #expect(b.statSessions == 3)
        #expect(b.statPlaces == 2)
        #expect(b.places == ["뉴욕", "도쿄"])
        #expect(b.sessions.map(\.date) == ["6.24", "6.06", "6.05"])   // iso 내림차순
        #expect(b.sessions.map(\.place) == ["뉴욕", "도쿄", "도쿄"])
        #expect(b.sessions.map(\.dur) == ["1시간 36분", "36분", "1시간 28분"])
    }

    @Test func bookDetailMillieTag() {
        let b = RTRecord.buildBook(2)   // 도둑맞은 집중력 (millie)
        #expect(b.millie)
        #expect(b.tag == "밀리의서재")
        #expect(b.statPlaces == 2)      // 서울 + 뉴욕
        #expect(b.statTime == "1:52")   // 64 + 48
    }
}

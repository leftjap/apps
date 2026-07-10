import Foundation
import SwiftUI
import GymCore
import GymViews

// 플로우 하네스 — 실사용 여정을 실제 GymAppModel API 로 구동하며 매 단계 데이터 단언 + 화면 렌더.
// (이 환경에서 제스처·햅틱 자체는 실행 불가 — 제스처 핸들러가 호출하는 모델 경로를 그대로 구동해
//  기능 동작·데이터 축적·화면 반영을 검증한다. 실기기 제스처 인식은 별도 검증 항목.)
// 사용: gymshot flow <outdir>   — 종료코드 0 = 전 단언 통과.
@MainActor
enum FlowHarness {
    static var failures = 0
    static var checks = 0

    static func check(_ cond: Bool, _ desc: String) {
        checks += 1
        print(cond ? "  ok  \(desc)" : "  FAIL \(desc)")
        if !cond { failures += 1 }
    }

    static func render<V: View>(_ view: V, _ dir: String, _ name: String) {
        let renderer = ImageRenderer(content: AnyView(view.frame(width: 390, height: 844)))
        renderer.scale = 2
        guard let cg = renderer.cgImage else { print("  FAIL render \(name)"); failures += 1; return }
        let rep = NSBitmapImageRep(cgImage: cg)
        guard let png = rep.representation(using: .png, properties: [:]) else { print("  FAIL png \(name)"); failures += 1; return }
        let path = "\(dir)/\(name).png"
        try? png.write(to: URL(fileURLWithPath: path))
        print("  render \(name).png")
    }

    static func run(outdir: String) {
        GymSnapshot.isActive = true
        try? FileManager.default.createDirectory(atPath: outdir, withIntermediateDirectories: true)
        let today = GymAppModel.dayFmt.string(from: Date())
        let m = GymAppModel()

        print("[0] 초기 상태 (첫 실행 시드)")
        check(m.history.count == 4, "시드 이력 4건 로드 (실측 \(m.history.count))")
        check(m.weights.count == 4, "시드 체중 4건 로드")
        m.discardSession()   // 데모 진행 세션 정리 → 빈 활성
        check(m.session.blocks.isEmpty && m.session.status == .active, "빈 활성 세션")
        render(HomeScreenView(model: m), outdir, "flow-01-home-idle")

        print("[1] 운동 시작 → 빈 세션 (spec §6-1)")
        m.startSession()
        check(m.session.startTime == nil, "종목 선택 전 startTime 없음 (타이머 0:00)")
        render(SessionScreenView(model: m), outdir, "flow-02-session-empty")

        print("[2] 종목 추가 — 벤치프레스 (직전 세션 프리셋 카피 ①)")
        m.addExercise("bench_press")
        check(m.session.startTime != nil, "첫 종목 선택 순간 startTime 기록")
        check(m.session.blocks.count == 1 && m.session.tags == ["chest"], "블록 1·tags [chest]")
        let ps = m.session.blocks[0].sets
        check(ps.count == 4 && ps.allSatisfy(\.preset), "프리셋 4세트 (직전 h_0503 카피)")
        check(ps[0].weight == 60 && ps[1].weight == 62 && ps[2].weight == 64 && ps[3].weight == 64,
              "프리셋 값 60/62/64/64 (직전 세션 per-set)")
        check(m.hasExercise("bench_press") && !m.hasExercise("squat"), "운동추가 시트 토글 상태")
        render(SessionScreenView(model: m), outdir, "flow-03-session-bench-preset")

        print("[3] 세트 진행 — 0탭 기록·탭 증감·키패드·자동 세트 추가·PR")
        m.completeCurrentSet()   // set1: 프리셋 60×10 그대로 (0탭 기록)
        check(m.session.blocks[0].sets[0].done && m.session.blocks[0].sets[0].weight == 60,
              "set1 완료 60×10 (프리셋 0탭)")
        check(m.session.blocks[0].sets[1].weight == 62, "set2 직전 세션 타깃 62 보존 (상속으로 안 덮임)")
        check(m.prMoment == 0, "60×10 e1rm 80 ≤ 최고 82.7 → PR 아님")
        m.adjustWeight(1)        // set2: 62 → 67 (바벨 +5)
        check(m.currentSet?.weight == 67 && m.currentSet?.preset == false, "우측 존 탭 +5 → 67·프리셋 해제")
        m.completeCurrentSet()
        check(m.prMoment == 1, "67×10 e1rm 89.3 > 82.7 → PR 발화")
        m.applyKeypad(.weight, value: 70)   // set3: 키패드 70×6
        m.applyKeypad(.reps, value: 6)
        check(m.currentSet?.weight == 70 && m.currentSet?.reps == 6, "키패드 70×6 적용")
        m.completeCurrentSet()
        m.completeCurrentSet()   // set4 (마지막): 64×7 → 자동 5번째 프리셋 추가
        check(m.session.blocks[0].sets.count == 5, "마지막 세트 완료 → 세트 자동 추가 (4→5)")
        check(m.session.blocks[0].sets[4].preset && m.session.blocks[0].sets[4].weight == 64,
              "추가 세트 = 직전 값 프리셋 카피")
        m.applyKeypad(.weight, value: 75)   // set5: 75×8 → e1rm 95 > 89.3 → PR
        m.applyKeypad(.reps, value: 8)
        m.completeCurrentSet()
        check(m.prMoment == 2, "75×8 e1rm 95 → PR 팝 트리거 (강햅틱 경로)")
        check(m.session.blocks[0].sets[4].pr, "PR 세트 영구 마크")
        check(m.prs.first { $0.exerciseId == "bench_press" }?.e1rm == 95, "PR 저장 e1rm 95")
        check(m.session.blocks[0].sets.count == 6, "PR 세트도 마지막 → 6번째 자동 추가")
        m.revertToPreviousSet()   // 우스와이프 — 직전 완료 세트 되돌리기 (§6-3-1)
        check(m.session.blocks[0].sets[4].done == false, "우스와이프 → set5 미완료 복귀")
        check(m.session.blocks[0].sets[4].pr, "되돌려도 PR 마크 유지 (handleRightSwipe 정합)")
        m.completeCurrentSet()    // 재완료 — 95 동률 → PR 재발화 없음 (엄격 초과)
        check(m.prMoment == 2, "재완료 동률 e1rm → PR 미발화")
        // 드래그 추종 수식 (GymSwipeMath — 제스처 핸들러가 그대로 사용)
        check(GymSwipeMath.heroTranslate(-200) == -150 && GymSwipeMath.heroTranslate(40) == 10,
              "드래그 추종 좌클램프 -150·우저항 ×0.25")
        check(GymSwipeMath.endAction(dx: -60, dy: 0) == .commit
              && GymSwipeMath.endAction(dx: 60, dy: 10) == .revert
              && GymSwipeMath.endAction(dx: -30, dy: 5) == .springBack,
              "종료 판정 좌커밋·우되돌림·스프링백")
        render(SessionScreenView(model: m), outdir, "flow-04-session-after-sets")
        render(SessionScreenView(model: m, initialDragX: -70), outdir, "flow-04b-session-drag")

        print("[4] 블록 완료(꾹누르기 '완료') + 종목 추가 — 스쿼트")
        m.finishBlock(at: 0)
        check(m.session.blocks[0].finishedAt != nil, "벤치 잠금 (finishedAt)")
        check(m.session.blocks[0].sets.count == 5, "빈 세트 폐기 (6→5 done 만)")
        m.addExercise("squat")
        check(m.currentBlockIdx == 1 && m.currentExerciseName == "스쿼트", "커서 = 스쿼트")
        check(m.session.blocks[1].sets[0].weight == 72, "스쿼트 프리셋 = 직전 h_0505 카피 (72)")
        m.completeCurrentSet()   // 72×10 — e1rm 96 ≤ 96.3 → PR 아님
        m.completeCurrentSet()   // 76×8 — e1rm 96.3 동률 → PR 아님 (엄격 초과)
        check(m.prMoment == 2, "스쿼트 96.0·96.3(동률) → PR 미발화")
        m.selectBlock(0)         // 완료 블록 탭 = 이동 → 잠금 히어로 (✓ N세트 완료)
        render(SessionScreenView(model: m), outdir, "flow-05-session-locked-bench")
        m.selectBlock(1)

        print("[5] 유산소 — 트레드밀 (시간·거리 키패드, 페이스)")
        m.addExercise("treadmill")
        check(m.session.blocks[2].sets.count == 1, "유산소 = 단일 세트")
        m.selectBlock(2)
        m.applyKeypad(.duration, value: 25)   // 분 입력 → 초 저장
        m.applyKeypad(.distance, value: 3.0)
        check(m.currentSet?.duration == 1500 && m.currentSet?.distance == 3.0, "25분 → 1500초·3km 저장")
        check(GymSessionLogic.paceText(durationSec: 1500, distanceKm: 3.0) == "8:20/km", "페이스 8:20/km")
        render(SessionScreenView(model: m), outdir, "flow-06-session-cardio")
        // HomeC "다음" 미리보기 — current=스쿼트(2/4 진행), 다음=[트레드밀 25분·3km]
        let nexts = GymHomeLogic.nextBlockPreviews(session: m.session, custom: m.custom)
        check(nexts == [GymNextBlockPreview(name: "트레드밀", summary: "25분 · 3km")],
              "홈 다음 미리보기 = 트레드밀 25분 · 3km (실측 \(nexts))")
        render(HomeScreenView(model: m), outdir, "flow-06b-home-next")
        m.completeCurrentSet()
        check(m.prMoment == 2, "유산소 완료 — PR 미발화 (0중량 가드)")
        m.finishBlock(at: 2)

        print("[6] 세션 종료 → 요약 (§7-1 finalize)")
        let benchVol: Double = 600 + 670 + 420 + 448 + 600   // 60×10+67×10+70×6+64×7+75×8
        let squatVol: Double = 720 + 608                      // 72×10+76×8
        let expectedVol = benchVol + squatVol                 // 4,066
        m.endSession()
        check(m.session.status == .completed, "완료 처리")
        check(m.session.totalVolume == expectedVol, "총볼륨 \(Int(expectedVol)) (수기 계산 일치)")
        check(m.session.blocks.count == 3, "3종목 보존")
        check(m.session.blocks[1].sets.count == 2, "스쿼트 미완료 세트 폐기 (4→2)")
        check(m.session.durationMin >= 1, "소요 최소 1분")
        check(m.history.count == 5, "이력 4→5 적재")
        check(m.route == .summary, "요약 라우팅")
        render(SummaryScreenView(session: m.session, sessionNo: m.history.count, totalCount: m.history.count),
               outdir, "flow-07-summary")

        print("[7] 홈 — 오늘 기록 반영")
        m.goHome()
        check(m.lastCompletedSession()?.id == m.session.id, "직전 운동 = 방금 세션")
        check(m.lastCompletedSession()?.date == today, "date = 오늘(KST)")
        render(HomeScreenView(model: m), outdir, "flow-08-home-after")

        print("[8] 통계 — 캘린더·상세 반영")
        let cal = GymAppModel.kst
        let y = cal.component(.year, from: Date()), mo = cal.component(.month, from: Date())
        let d = cal.component(.day, from: Date())
        check(m.workedDays(year: y, month: mo).contains(d), "월 캘린더 오늘 worked")
        let entry = m.dayEntry(today)
        check(entry?.ex.first { $0.n == "벤치프레스" }?.s == "5세트 · 2,738kg", "상세 벤치 5세트·2,738kg")
        check(entry?.ex.first { $0.n == "스쿼트" }?.s == "2세트 · 1,328kg", "상세 스쿼트 2세트·1,328kg")
        check(entry?.ex.first { $0.n == "트레드밀" }?.s == "25분 · 3km", "상세 트레드밀 25분·3km")
        render(StatsScreenView(model: m, initialTab: .cal, embedScroll: false), outdir, "flow-09-stats-after")
        render(StatsScreenView(model: m, initialTab: .cal, embedScroll: false, initialDetailISO: today),
               outdir, "flow-10-stats-day-detail")

        print("[9] 관리 — 커스텀 추가·숨김·삭제·순서·체중 PR")
        m.createCustomExercise(name: "체스트 프레스 머신", part: "chest")
        check(m.custom.count == 1 && m.custom[0].id.hasPrefix("cust_"), "커스텀 운동 생성 (cust_ id)")
        check(m.selectableExercises(part: "chest").contains { $0.name == "체스트 프레스 머신" },
              "운동선택 목록에 노출")
        m.toggleHidden("decline_bench")
        check(!m.selectableExercises(part: "chest").contains { $0.id == "decline_bench" }, "숨김 → 운동선택 제외")
        check(m.exercisesForPart("chest").contains { $0.id == "decline_bench" }, "관리 목록엔 유지 (흐림)")
        m.deleteExercise("cable_crossover")
        check(!m.exercisesForPart("chest").contains { $0.id == "cable_crossover" }, "빌트인 영구 삭제")
        let chestIds = m.exercisesForPart("chest").map(\.id)
        m.setExerciseOrder(part: "chest", ids: chestIds.reversed())
        check(m.exercisesForPart("chest").first?.id == chestIds.last, "드래그 순서 영속 반영")
        m.updateSettings { $0.exercisePartOverride["dumbbell_fly"] = "arms" }   // §10-1 부위 변경
        check(m.exercisesForPart("arms").contains { $0.id == "dumbbell_fly" }, "부위 변경 → 팔 목록 재할당")
        check(!m.exercisesForPart("chest").contains { $0.id == "dumbbell_fly" }, "원 부위(가슴)에서 제거")
        let wasPR = m.saveWeight(71.9)
        check(wasPR, "71.9kg = 최저 신기록 → PR 팝")
        check(m.weights.first?.kg == 71.9 && m.weights.first?.date == today, "오늘 체중 적재")
        render(AdminScreenView(model: m, initialTab: .ex, embedScroll: false), outdir, "flow-11-admin-ex")
        render(AdminScreenView(model: m, initialTab: .weight, embedScroll: false), outdir, "flow-12-admin-weight")

        print("[9b] 프로필 편집 — 검증 규칙 + 설정 반영 (§10-3, profile.js FIELD_DEFS 정합)")
        check(GymProfileFields.parseHeight("99") == nil && GymProfileFields.parseWeeklyGoal("8") == nil
              && GymProfileFields.parseGoalWeight("0") == nil
              && GymProfileFields.parseBirthdateDigits("19761301") == nil,
              "범위 밖 입력 전부 거부 (키 99·주간 8·목표 0·13월)")
        if let h = GymProfileFields.parseHeight("178") { m.updateSettings { $0.height = h } }
        if let bd = GymProfileFields.parseBirthdateDigits("19760512") { m.updateSettings { $0.birthDate = bd } }
        if let gw = GymProfileFields.parseGoalWeight("68.5") { m.updateSettings { $0.goalWeight = gw } }
        if let wg = GymProfileFields.parseWeeklyGoal("5") { m.updateSettings { $0.weeklyGoal = wg } }
        check(m.settings.height == 178 && m.settings.birthDate == "1976-05-12", "키 178·생년월일 1976-05-12 반영")
        check(m.settings.goalWeight == 68.5 && m.settings.weeklyGoal == 5, "목표 68.5·주간 목표 5 반영")
        render(AdminScreenView(model: m, initialTab: .profile, embedScroll: false), outdir, "flow-12b-admin-profile")
        render(AdminScreenView(model: m, initialTab: .profile, embedScroll: false,
                               initialProfileField: "birthdate"), outdir, "flow-12c-profile-keypad")

        print("[10] 영속 재로드 — 동일 프로세스 내 새 모델 인스턴스 (크로스 프로세스는 gymshot 재실행 별도)")
        let m2 = GymAppModel()
        check(m2.history.count == 5, "이력 5건 영속")
        check(m2.prs.first { $0.exerciseId == "bench_press" }?.e1rm == 95, "PR 영속")
        check(m2.weights.first?.kg == 71.9, "체중 영속")
        check(m2.custom.count == 1, "커스텀 영속")
        check(m2.settings.hiddenExercises.contains("decline_bench")
              && m2.settings.deletedExercises.contains("cable_crossover"), "설정(숨김·삭제) 영속")
        check(m2.settings.height == 178 && m2.settings.birthDate == "1976-05-12"
              && m2.settings.goalWeight == 68.5 && m2.settings.weeklyGoal == 5, "프로필 4필드 영속")
        check(m2.settings.updatedAt > 0, "설정 LWW 타임스탬프 스탬핑")
        check(m2.session.status == .completed, "완료 세션 유지 (스윕 미발동)")
        m2.startSession()
        check(m2.session.blocks.isEmpty && m2.session.status == .active, "재시작 → 새 빈 세션")
        check(m2.prevBlock(forExercise: "bench_press")?.sets.first?.weight == 60,
              "다음 세션 프리셋 소스 = 오늘 기록")

        print("")
        print(failures == 0 ? "FLOW PASS — \(checks)개 단언 전부 통과" : "FLOW FAIL — \(failures)/\(checks) 실패")
        exit(failures == 0 ? 0 : 4)
    }
}

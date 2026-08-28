import Foundation
import Testing
@testable import GymCore

// 실기기 실세션 대조 — 2026-08-28 세션 #0070 (폰 컨테이너 덤프 기준).
// 화면 표기 "약 229 kcal 소모" 가 어디서 나온 수인지 못박는다.
//
//   체중 74.2kg (2026-08-25 최신 기록) · 경과 46분 · done 26세트 · 트레드밀 600초/입력 46kcal
//   밀리터리4.5×6 · 사이드레터럴3.5×4 · 리스트컬3.0×3 · 행잉레그4.0×3 · 레그익스텐션4.0×5 · 레그프레스4.0×5
//
// 경과가 46 인 이유: endSession 은 finalize **전에** 칼로리를 구하고, 그때 endTime 은 아직 nil 이라
// elapsedMinutes() 가 (now-start)/60000 을 **버림**한다. 영수증의 "47분"(durationMin)은 finalize 가
// 반올림한 값이라 1분 어긋난다 (실측 2809453ms = 46.82분).
@Suite struct CalorieRealSessionTests {
    static let entries: [GymSessionLogic.GymCalorieEntry] = [
        .init(met: 4.5, doneSets: 6, cardioSeconds: 0),    // 밀리터리 프레스
        .init(met: 3.5, doneSets: 4, cardioSeconds: 0),    // 사이드 레터럴
        .init(met: 3.0, doneSets: 3, cardioSeconds: 0),    // 리스트 컬
        .init(met: 4.0, doneSets: 3, cardioSeconds: 0),    // 행잉 레그 레이즈 (맨몸 — 볼륨 0 이어도 시간 배분)
        .init(met: 4.0, doneSets: 5, cardioSeconds: 0),    // 레그 익스텐션
        .init(met: 4.0, doneSets: 5, cardioSeconds: 0),    // 시티드 레그프레스 (커스텀 met 4.0)
        .init(met: 7.0, doneSets: 0, cardioSeconds: 600, enteredKcal: 46),   // 트레드밀
    ]

    @Test func matchesTheNumberShownOnDevice() {
        #expect(GymSessionLogic.estimateCalories(entries: Self.entries, bodyKg: 74.2, elapsedMin: 46) == 229)
    }

    /// 229 의 내역 = 근력 183 + 트레드밀 입력 46. (유산소 kcal 을 0 으로 두면 근력분만 남는다)
    @Test func breakdownIsStrength183PlusCardio46() {
        var e = Self.entries
        e[6] = .init(met: 7.0, doneSets: 0, cardioSeconds: 600, enteredKcal: 0)
        #expect(GymSessionLogic.estimateCalories(entries: e, bodyKg: 74.2, elapsedMin: 46) == 183)
    }

    /// 유산소는 근력 시간 배분에서 빠져야 한다 (doneSets 0). 세트 몫을 주면 입력 kcal 과 이중 계상된다.
    @Test func cardioMustNotTakeAShareOfStrengthTime() {
        var e = Self.entries
        e[6] = .init(met: 7.0, doneSets: 1, cardioSeconds: 600, enteredKcal: 46)   // 잘못된 구성
        #expect(GymSessionLogic.estimateCalories(entries: e, bodyKg: 74.2, elapsedMin: 46) > 229)
    }

    /// 입력 kcal 이 없으면 MET 추정으로 대체된다 (7.0 × 74.2 × 600/3600 × 1.05).
    @Test func fallsBackToMetWhenConsoleValueMissing() {
        var e = Self.entries
        e[6] = .init(met: 7.0, doneSets: 0, cardioSeconds: 600, enteredKcal: nil)
        let met = 7.0 * 74.2 * (600.0 / 3600) * 1.05
        #expect(GymSessionLogic.estimateCalories(entries: e, bodyKg: 74.2, elapsedMin: 46)
                == Int((229.3882 - 46 + met).rounded()))
    }
}

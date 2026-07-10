import Foundation
import Testing
@testable import GymCore

// 프로필 필드 검증·포맷 — PWA profile.js FIELD_DEFS parse/format 정합 (spec §10-3).
@Suite struct ProfileFieldsTests {

    // MARK: - 키 (height) — 100~250 정수

    @Test func heightParsesValidRange() {
        #expect(GymProfileFields.parseHeight("173") == 173)
        #expect(GymProfileFields.parseHeight(" 100 ") == 100)
        #expect(GymProfileFields.parseHeight("250") == 250)
        #expect(GymProfileFields.parseHeight("173.6") == 174)   // Math.round 정합
    }
    @Test func heightRejectsOutOfRangeAndGarbage() {
        #expect(GymProfileFields.parseHeight("99") == nil)
        #expect(GymProfileFields.parseHeight("251") == nil)
        #expect(GymProfileFields.parseHeight("abc") == nil)
        #expect(GymProfileFields.parseHeight("") == nil)
    }

    // MARK: - 목표 체중 (goalWeight) — 0 초과 ~300, 0.1 반올림

    @Test func goalWeightParsesAndRounds() {
        #expect(GymProfileFields.parseGoalWeight("69") == 69)
        #expect(GymProfileFields.parseGoalWeight("68.55") == 68.6)
        #expect(GymProfileFields.parseGoalWeight("68,5") == 68.5)   // 콤마 소수점 정합
        #expect(GymProfileFields.parseGoalWeight("300") == 300)
    }
    @Test func goalWeightRejectsInvalid() {
        #expect(GymProfileFields.parseGoalWeight("0") == nil)
        #expect(GymProfileFields.parseGoalWeight("-1") == nil)
        #expect(GymProfileFields.parseGoalWeight("301") == nil)
        #expect(GymProfileFields.parseGoalWeight("x") == nil)
    }

    // MARK: - 주간 목표 (weeklyGoal) — 1~7 정수

    @Test func weeklyGoalParsesValidRange() {
        #expect(GymProfileFields.parseWeeklyGoal("1") == 1)
        #expect(GymProfileFields.parseWeeklyGoal("4") == 4)
        #expect(GymProfileFields.parseWeeklyGoal("7") == 7)
    }
    @Test func weeklyGoalRejectsInvalid() {
        #expect(GymProfileFields.parseWeeklyGoal("0") == nil)
        #expect(GymProfileFields.parseWeeklyGoal("8") == nil)
        #expect(GymProfileFields.parseWeeklyGoal("") == nil)
    }

    // MARK: - 생년월일 (birthDate) — 키패드 8자리 YYYYMMDD → "YYYY-MM-DD"

    @Test func birthdateParsesEightDigits() {
        #expect(GymProfileFields.parseBirthdateDigits("19760512") == "1976-05-12")
        #expect(GymProfileFields.parseBirthdateDigits("21001231") == "2100-12-31")
        #expect(GymProfileFields.parseBirthdateDigits("19000101") == "1900-01-01")
    }
    @Test func birthdateRejectsInvalidRanges() {
        #expect(GymProfileFields.parseBirthdateDigits("18991231") == nil)   // y < 1900
        #expect(GymProfileFields.parseBirthdateDigits("21010101") == nil)   // y > 2100
        #expect(GymProfileFields.parseBirthdateDigits("19761301") == nil)   // mo 13
        #expect(GymProfileFields.parseBirthdateDigits("19760500") == nil)   // d 0
        #expect(GymProfileFields.parseBirthdateDigits("19760532") == nil)   // d 32
        #expect(GymProfileFields.parseBirthdateDigits("1976051") == nil)    // 7자리
        #expect(GymProfileFields.parseBirthdateDigits("") == nil)
    }

    // MARK: - 표시 포맷 — profile.js format 정합 ("YYYY.MM.DD" / 미입력 "입력")

    @Test func birthdateDisplayFormats() {
        #expect(GymProfileFields.birthdateDisplay("1976-05-12") == "1976.05.12")
        #expect(GymProfileFields.birthdateDisplay(nil) == "입력")
    }
    // 키패드 진행 중 버퍼 표시 — 자릿수에 따라 점 진행 삽입
    @Test func birthdateBufferDisplayProgressive() {
        #expect(GymProfileFields.birthdateBufferDisplay("") == "0")
        #expect(GymProfileFields.birthdateBufferDisplay("1976") == "1976")
        #expect(GymProfileFields.birthdateBufferDisplay("19760") == "1976.0")
        #expect(GymProfileFields.birthdateBufferDisplay("197605") == "1976.05")
        #expect(GymProfileFields.birthdateBufferDisplay("19760512") == "1976.05.12")
    }
}

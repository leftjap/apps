import Testing
import Foundation
@testable import ReadingTimeKit

// 프레즌스 해제가 서버에 도달하지 않던 결함 (사용자 보고 2026-09-16).
// Swift 가 만들어 주는 Encodable 은 옵셔널이 nil 이면 키를 통째로 빼버린다. 그래서
// setReadingSince(nil) 의 PATCH 본문이 `{}` 가 되고 PostgREST 는 아무것도 바꾸지 않았다.
// 세션이 끝나도 reading_since 가 남아 최대 12시간 "지금 읽는 중"이 거짓으로 떴다
// (실측: 지오 2026-09-15T11:46:43Z · 소연 2026-08-19T07:06:45Z 둘 다 매달린 값 보유).
@Suite struct ReadingSincePatchTests {

    private func body(_ patch: ReadingSincePatch) throws -> String {
        String(data: try JSONEncoder().encode(patch), encoding: .utf8)!
    }

    @Test func clearingSendsExplicitNull() throws {
        // `{}` 면 서버가 아무것도 바꾸지 않는다 — null 이 실제로 실려야 한다
        #expect(try body(ReadingSincePatch(reading_since: nil)) == #"{"reading_since":null}"#)
    }

    @Test func settingSendsTheTimestamp() throws {
        #expect(try body(ReadingSincePatch(reading_since: "2026-09-16T04:00:00Z"))
                == #"{"reading_since":"2026-09-16T04:00:00Z"}"#)
    }
}

import Foundation

// 히어로 큰 숫자의 자간(letter-spacing) — 마지막 글자 뒤에는 넣지 않는다.
//
// SwiftUI `.tracking(t)` / `.kerning(t)` 은 마지막 글자 뒤에도 t 를 적용해 Text 프레임이 |t| 만큼
// 좁아지고, 그 좁은 프레임에 마지막 글자 잉크(오른쪽)를 자른다(브라우저는 letter-spacing 를 넣어도
// 잉크를 자르지 않음). AttributedString .kern 은 "그 글자 뒤"에 붙으므로, 마지막 글자에만 kern 을
// 빼면 (n-1) 개 자간이 되어 프레임이 잉크를 담을 만큼 넓어진다. 호출부가 offset(x: t/2) 로 중앙 보정.
public enum HeroNumberText {
    public static func kerned(_ s: String, tracking: Double) -> AttributedString {
        var out = AttributedString()
        let chars = Array(s)
        for (i, ch) in chars.enumerated() {
            var piece = AttributedString(String(ch))
            piece.kern = (i < chars.count - 1) ? tracking : 0   // 마지막 글자 뒤엔 자간 없음
            out.append(piece)
        }
        return out
    }
}

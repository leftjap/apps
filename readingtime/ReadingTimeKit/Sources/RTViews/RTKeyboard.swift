import SwiftUI

/// 키보드가 390×844 캔버스를 가리는 높이. 앱은 캔버스를 scaleEffect 로 축소·중앙 배치하고
/// 키보드 안전 영역을 무시하므로(ReadingTimeApp), 목록이 키보드 위까지 스크롤되려면 이 값을 아래 여백으로 준다.
public enum RTKeyboard {
    public static func canvasInset(screenHeight: CGFloat, keyboardMinY: CGFloat, scale: CGFloat) -> CGFloat {
        let offsetY = (screenHeight - 844 * scale) / 2          // 중앙 배치로 생긴 위 여백
        let keyboardTop = (keyboardMinY - offsetY) / scale      // 캔버스 좌표의 키보드 윗변
        return max(0, 844 - keyboardTop)
    }
}

private struct RTKeyboardInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

public extension EnvironmentValues {
    /// 키보드가 가린 캔버스 높이 (RTKeyboard.canvasInset). 앱이 키보드 프레임 알림으로 넣는다.
    var rtKeyboardInset: CGFloat {
        get { self[RTKeyboardInsetKey.self] }
        set { self[RTKeyboardInsetKey.self] = newValue }
    }
}

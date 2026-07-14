import SwiftUI

// 로그인 게이트 — 형제 앱(readingtime Screen01Login·PWA) 정합. 미로그인 시 홈 대신 이 화면.
// 2026-07-14 사고 재발 방지: 로그인 없이 앱이 열려 데이터가 백업 안 된 채 로컬에만 쌓이던 결함.
public struct GymLoginView: View {
    var onLogin: () -> Void
    public init(onLogin: @escaping () -> Void = {}) { self.onLogin = onLogin }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer()
            logo
            Text("Gym").font(.sans(40, 700)).tracking(-1.2)
                .foregroundStyle(GY.ink1).padding(.top, 28)
            RoundedRectangle(cornerRadius: 2).fill(GY.crailBase)
                .frame(width: 44, height: 3).padding(.top, 16)
            Text("운동 기록을 남기고 어디서든 이어가세요.\n로그인하면 기록이 자동으로 백업·동기화됩니다.")
                .font(.sans(15, 500)).foregroundStyle(GY.ink4)
                .lineSpacing(6).padding(.top, 20)
            Spacer()
            googleButton
            Text("허용된 계정만 로그인할 수 있어요.")
                .font(.sans(11.5, 500)).foregroundStyle(GY.ink4)
                .frame(maxWidth: .infinity).padding(.top, 14)
        }
        .padding(.init(top: 0, leading: 32, bottom: 40, trailing: 32))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(GY.shell)
    }

    var logo: some View {
        RoundedRectangle(cornerRadius: 19).fill(GY.ink1)
            .frame(width: 68, height: 68)
            .shadow(color: Color(hex: 0x14120E).opacity(0.28), radius: 11, y: 12)
            .overlay(BarbellGlyph().stroke(Color(hex: 0xFBF8F2), style: BarbellGlyph.stroke(40))
                .frame(width: 40, height: 40))
    }

    var googleButton: some View {
        Button(action: onLogin) {
            HStack(spacing: 11) {
                googleG
                Text("Google 로 시작하기").font(.sans(16, 700)).foregroundStyle(GY.ink1)
            }
            .frame(maxWidth: .infinity).frame(height: 56)
            .background(GY.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(GY.line, lineWidth: 1))
            .shadow(color: Color(hex: 0x14120E).opacity(0.10), radius: 8, y: 6)
        }
        .buttonStyle(.plain).accessibilityIdentifier("login-google")
    }

    var googleG: some View {
        let parts: [(String, UInt32)] = [
            ("M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z", 0x4285F4),
            ("M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.4v5.7C8 41.1 15.4 46 24 46z", 0x34A853),
            ("M11.8 28.3c-.5-1.4-.7-2.8-.7-4.3s.3-3 .7-4.3v-5.7H4.4C2.9 17 2 20.4 2 24s.9 7 2.4 10l7.4-5.7z", 0xFBBC05),
            ("M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8 6.9 4.4 14l7.4 5.7c1.7-5.2 6.5-9 12.2-9z", 0xEA4335),
        ]
        let sc = CGAffineTransform(scaleX: 20.0 / 48.0, y: 20.0 / 48.0)
        return ZStack {
            ForEach(Array(parts.enumerated()), id: \.offset) { _, p in
                Path { $0.addPath(GoogleSVG.path(p.0).applying(sc)) }.fill(Color(hex: p.1))
            }
        }.frame(width: 20, height: 20)
    }
}

// 최소 SVG path 파서 (구글 G 로고 전용 — M/L/C/Z + 상대 소문자).
enum GoogleSVG {
    static func path(_ d: String) -> Path {
        var p = Path(); var i = d.startIndex; var cur = CGPoint.zero; var cmd: Character = "M"
        func num() -> CGFloat {
            while i < d.endIndex, d[i] == " " || d[i] == "," { i = d.index(after: i) }
            var s = ""
            while i < d.endIndex, "-.0123456789eE".contains(d[i]) {
                if d[i] == "-", !s.isEmpty, s.last != "e", s.last != "E" { break }
                s.append(d[i]); i = d.index(after: i)
            }
            return CGFloat(Double(s) ?? 0)
        }
        while i < d.endIndex {
            let c = d[i]
            if c.isLetter { cmd = c; i = d.index(after: i) }
            switch cmd {
            case "M": cur = CGPoint(x: num(), y: num()); p.move(to: cur)
            case "L": cur = CGPoint(x: num(), y: num()); p.addLine(to: cur)
            case "H": cur.x = num(); p.addLine(to: cur)
            case "V": cur.y = num(); p.addLine(to: cur)
            case "C":
                let c1 = CGPoint(x: num(), y: num()), c2 = CGPoint(x: num(), y: num())
                cur = CGPoint(x: num(), y: num()); p.addCurve(to: cur, control1: c1, control2: c2)
            case "c":
                let c1 = CGPoint(x: cur.x + num(), y: cur.y + num())
                let c2 = CGPoint(x: cur.x + num(), y: cur.y + num())
                cur = CGPoint(x: cur.x + num(), y: cur.y + num()); p.addCurve(to: cur, control1: c1, control2: c2)
            case "l": cur = CGPoint(x: cur.x + num(), y: cur.y + num()); p.addLine(to: cur)
            case "h": cur.x += num(); p.addLine(to: cur)
            case "v": cur.y += num(); p.addLine(to: cur)
            case "Z", "z": p.closeSubpath()
            default: i = d.index(after: i)
            }
        }
        return p
    }
}

import SwiftUI

// SVG path `d` 파서 — 시안 인라인 아이콘을 SwiftUI Path 로 그대로 재현하기 위함.
// 지원: M m L l H h V v C c S s Q q T t A a Z z (arc 는 center-parameterization 후 cubic 근사).
public enum RTSVG {
    public static func path(_ d: String, viewBox: CGFloat = 24) -> Path {
        var p = Path()
        var scanner = Tokenizer(d)
        var cur = CGPoint.zero
        var start = CGPoint.zero
        var lastCmd: Character = " "
        var lastCubicCtrl: CGPoint? = nil
        var lastQuadCtrl: CGPoint? = nil

        func num() -> CGFloat? { scanner.number() }

        while let cmdRaw = scanner.command(defaultFrom: lastCmd) {
            var cmd = cmdRaw
            // 서브패스 시작 후 암묵 반복: M 뒤 좌표쌍 반복은 L 로 처리 (SVG 스펙)
            if cmd == "M", lastCmd == "M" { cmd = "L" }
            if cmd == "m", lastCmd == "m" { cmd = "l" }
            lastCmd = cmdRaw

            switch cmd {
            case "M", "m":
                guard let x = num(), let y = num() else { return p }
                cur = cmd == "m" ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                start = cur
                p.move(to: cur)
                lastCubicCtrl = nil; lastQuadCtrl = nil
            case "L", "l":
                guard let x = num(), let y = num() else { return p }
                cur = cmd == "l" ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                p.addLine(to: cur)
                lastCubicCtrl = nil; lastQuadCtrl = nil
            case "H", "h":
                guard let x = num() else { return p }
                cur = CGPoint(x: cmd == "h" ? cur.x + x : x, y: cur.y)
                p.addLine(to: cur)
                lastCubicCtrl = nil; lastQuadCtrl = nil
            case "V", "v":
                guard let y = num() else { return p }
                cur = CGPoint(x: cur.x, y: cmd == "v" ? cur.y + y : y)
                p.addLine(to: cur)
                lastCubicCtrl = nil; lastQuadCtrl = nil
            case "C", "c":
                guard let x1 = num(), let y1 = num(), let x2 = num(), let y2 = num(), let x = num(), let y = num() else { return p }
                let rel = cmd == "c"
                let c1 = rel ? CGPoint(x: cur.x + x1, y: cur.y + y1) : CGPoint(x: x1, y: y1)
                let c2 = rel ? CGPoint(x: cur.x + x2, y: cur.y + y2) : CGPoint(x: x2, y: y2)
                let to = rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                p.addCurve(to: to, control1: c1, control2: c2)
                cur = to; lastCubicCtrl = c2; lastQuadCtrl = nil
            case "S", "s":
                guard let x2 = num(), let y2 = num(), let x = num(), let y = num() else { return p }
                let rel = cmd == "s"
                let c1 = lastCubicCtrl.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let c2 = rel ? CGPoint(x: cur.x + x2, y: cur.y + y2) : CGPoint(x: x2, y: y2)
                let to = rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                p.addCurve(to: to, control1: c1, control2: c2)
                cur = to; lastCubicCtrl = c2; lastQuadCtrl = nil
            case "Q", "q":
                guard let x1 = num(), let y1 = num(), let x = num(), let y = num() else { return p }
                let rel = cmd == "q"
                let c = rel ? CGPoint(x: cur.x + x1, y: cur.y + y1) : CGPoint(x: x1, y: y1)
                let to = rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                p.addQuadCurve(to: to, control: c)
                cur = to; lastQuadCtrl = c; lastCubicCtrl = nil
            case "T", "t":
                guard let x = num(), let y = num() else { return p }
                let rel = cmd == "t"
                let c = lastQuadCtrl.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let to = rel ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                p.addQuadCurve(to: to, control: c)
                cur = to; lastQuadCtrl = c; lastCubicCtrl = nil
            case "A", "a":
                guard let rx = num(), let ry = num(), let rot = num(),
                      let laf = num(), let sf = num(), let x = num(), let y = num() else { return p }
                let to = cmd == "a" ? CGPoint(x: cur.x + x, y: cur.y + y) : CGPoint(x: x, y: y)
                addArc(&p, from: cur, to: to, rx: rx, ry: ry, rotDeg: rot, largeArc: laf != 0, sweep: sf != 0)
                cur = to; lastCubicCtrl = nil; lastQuadCtrl = nil
            case "Z", "z":
                p.closeSubpath()
                cur = start
                lastCubicCtrl = nil; lastQuadCtrl = nil
            default:
                return p
            }
        }
        _ = viewBox
        return p
    }

    // SVG 타원 호 → cubic bezier 근사 (W3C 명세의 center parameterization)
    private static func addArc(_ p: inout Path, from: CGPoint, to: CGPoint,
                               rx rxIn: CGFloat, ry ryIn: CGFloat, rotDeg: CGFloat,
                               largeArc: Bool, sweep: Bool) {
        var rx = abs(rxIn), ry = abs(ryIn)
        if rx == 0 || ry == 0 || from == to { p.addLine(to: to); return }
        let phi = rotDeg * .pi / 180
        let cosPhi = cos(phi), sinPhi = sin(phi)
        let dx2 = (from.x - to.x) / 2, dy2 = (from.y - to.y) / 2
        let x1p = cosPhi * dx2 + sinPhi * dy2
        let y1p = -sinPhi * dx2 + cosPhi * dy2
        var l = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if l > 1 { let s = sqrt(l); rx *= s; ry *= s; l = 1 }
        let sign: CGFloat = largeArc != sweep ? 1 : -1
        let num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
        let den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
        let co = sign * sqrt(max(0, num / den))
        let cxp = co * rx * y1p / ry
        let cyp = -co * ry * x1p / rx
        let cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2
        func angle(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let dot = ux * vx + uy * vy
            let len = sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy))
            var a = acos(min(1, max(-1, dot / len)))
            if ux * vy - uy * vx < 0 { a = -a }
            return a
        }
        let theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
        var dTheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
        if !sweep && dTheta > 0 { dTheta -= 2 * .pi }
        if sweep && dTheta < 0 { dTheta += 2 * .pi }
        let segs = max(1, Int(ceil(abs(dTheta) / (.pi / 2))))
        let delta = dTheta / CGFloat(segs)
        let t = 4 / 3 * tan(delta / 4)
        var th = theta1
        var p0 = from
        for _ in 0..<segs {
            let th2 = th + delta
            let cosTh = cos(th), sinTh = sin(th)
            let cosTh2 = cos(th2), sinTh2 = sin(th2)
            func pt(_ a: CGFloat, _ b: CGFloat) -> CGPoint {
                CGPoint(x: cx + rx * a * cosPhi - ry * b * sinPhi,
                        y: cy + rx * a * sinPhi + ry * b * cosPhi)
            }
            let p3 = pt(cosTh2, sinTh2)
            let c1 = CGPoint(x: p0.x + t * (-(rx) * sinTh * cosPhi - ry * cosTh * sinPhi),
                             y: p0.y + t * (-(rx) * sinTh * sinPhi + ry * cosTh * cosPhi))
            let c2 = CGPoint(x: p3.x - t * (-(rx) * sinTh2 * cosPhi - ry * cosTh2 * sinPhi),
                             y: p3.y - t * (-(rx) * sinTh2 * sinPhi + ry * cosTh2 * cosPhi))
            p.addCurve(to: p3, control1: c1, control2: c2)
            th = th2
            p0 = p3
        }
    }

    struct Tokenizer {
        private let chars: [Character]
        private var i = 0
        init(_ s: String) { chars = Array(s) }

        mutating func command(defaultFrom last: Character) -> Character? {
            skipSeparators()
            guard i < chars.count else { return nil }
            let c = chars[i]
            if c.isLetter { i += 1; return c }
            // 숫자가 바로 오면 직전 커맨드 반복
            return last == " " ? nil : last
        }

        mutating func number() -> CGFloat? {
            skipSeparators()
            var s = ""
            var seenDot = false
            while i < chars.count {
                let c = chars[i]
                if c == "-" || c == "+" {
                    if s.isEmpty || s.hasSuffix("e") || s.hasSuffix("E") { s.append(c); i += 1 } else { break }
                } else if c == "." {
                    if seenDot { break } // "1.2.3" = "1.2" ".3" (SVG 축약)
                    seenDot = true; s.append(c); i += 1
                } else if c.isNumber || c == "e" || c == "E" {
                    if c == "e" || c == "E" { seenDot = true } // 지수부 뒤 '.' 없음 가정
                    s.append(c); i += 1
                } else { break }
            }
            return s.isEmpty ? nil : CGFloat(Double(s) ?? 0)
        }

        private mutating func skipSeparators() {
            while i < chars.count, chars[i] == " " || chars[i] == "," || chars[i] == "\n" || chars[i] == "\t" { i += 1 }
        }
    }
}

// 스트로크 아이콘 뷰 — 시안 svg(viewBox 24 기본, stroke/fill/두께/캡) 재현
public struct RTIcon: View {
    let d: [String]
    let w: CGFloat
    let h: CGFloat
    let vbW: CGFloat
    let vbH: CGFloat
    let stroke: Color?
    let fill: Color?
    let lineWidth: CGFloat
    let cap: CGLineCap
    let join: CGLineJoin

    public init(_ d: [String], size: CGFloat, viewBox: CGFloat = 24,
                stroke: Color? = nil, fill: Color? = nil,
                lineWidth: CGFloat = 2, cap: CGLineCap = .round, join: CGLineJoin = .round) {
        self.init(d, width: size, height: size, viewBoxW: viewBox, viewBoxH: viewBox,
                  stroke: stroke, fill: fill, lineWidth: lineWidth, cap: cap, join: join)
    }

    public init(_ d: [String], width: CGFloat, height: CGFloat, viewBoxW: CGFloat, viewBoxH: CGFloat,
                stroke: Color? = nil, fill: Color? = nil,
                lineWidth: CGFloat = 2, cap: CGLineCap = .round, join: CGLineJoin = .round) {
        self.d = d
        self.w = width
        self.h = height
        self.vbW = viewBoxW
        self.vbH = viewBoxH
        self.stroke = stroke
        self.fill = fill
        self.lineWidth = lineWidth
        self.cap = cap
        self.join = join
    }

    public var body: some View {
        let scale = min(w / vbW, h / vbH)
        ZStack {
            ForEach(Array(d.enumerated()), id: \.offset) { _, dd in
                let path = RTSVG.path(dd).applying(CGAffineTransform(scaleX: scale, y: scale))
                if let fill {
                    Path { $0.addPath(path) }.fill(fill)
                }
                if let stroke {
                    Path { $0.addPath(path) }
                        .stroke(stroke, style: StrokeStyle(lineWidth: lineWidth * scale, lineCap: cap, lineJoin: join))
                }
            }
        }
        .frame(width: w, height: h)
    }
}

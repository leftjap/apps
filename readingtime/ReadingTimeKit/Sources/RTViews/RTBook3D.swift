import SwiftUI

// 실물 3D 책 — 단일 카메라 투영. 6면 CSS-box 를 SwiftUI 로 이식(중첩 rotation3DEffect 는
// preserve-3d 미지원 → 수동 투영). 앞면 콘텐츠는 homography(projectionEffect) 로 워핑,
// 옆면(책등)·수평 단면은 Canvas quad. 정적 렌더(모션 off)가 픽셀 오라클 = idle 정지 포즈.
//
// 치수: 표지 172×252, 두께 38. idle 3/4 각: rotateY 9° · rotateX 6°. perspective 1000.

// ── 3D 점(박스 중심 기준) → 화면 2D 투영 ──
private struct Cam {
    let ry: Double   // rad
    let rx: Double
    let p: CGFloat   // perspective distance
    let cx: CGFloat  // 컨테이너 중심
    let cy: CGFloat

    // 회전: Rx 먼저(면의 로컬), 그 뒤 Ry. (CSS: rotateY(9) rotateX(6) = Ry·Rx·v)
    func rotate(_ v: SIMD3<Double>) -> SIMD3<Double> {
        // Rx
        let cxr = cos(rx), sxr = sin(rx)
        let y1 = v.y * cxr - v.z * sxr
        let z1 = v.y * sxr + v.z * cxr
        let p1 = SIMD3(v.x, y1, z1)
        // Ry
        let cyr = cos(ry), syr = sin(ry)
        let x2 = p1.x * cyr + p1.z * syr
        let z2 = -p1.x * syr + p1.z * cyr
        return SIMD3(x2, p1.y, z2)
    }

    func project(_ v: SIMD3<Double>) -> CGPoint {
        let r = rotate(v)
        let s = Double(p) / (Double(p) - r.z)     // z 클수록(가까울수록) 확대
        return CGPoint(x: cx + CGFloat(r.x * s), y: cy + CGFloat(r.y * s))
    }

    // 회전한 법선의 z 성분(카메라 방향 +z) > 0 이면 가시
    func faceVisible(normal n: SIMD3<Double>) -> Bool { rotate(n).z > 0.0001 }
}

// 단위 아님: 소스 사각형(w×h) → 투영 4각형(TL,TR,BR,BL) homography.
func rtHomography(w: CGFloat, h: CGFloat,
                  tl: CGPoint, tr: CGPoint, br: CGPoint, bl: CGPoint) -> ProjectionTransform {
    // 단위 정사각 → 4각형 (p0=(0,0),p1=(1,0),p2=(1,1),p3=(0,1))
    let x0 = tl.x, y0 = tl.y, x1 = tr.x, y1 = tr.y
    let x2 = br.x, y2 = br.y, x3 = bl.x, y3 = bl.y
    let ax = x1 - x2, ay = y1 - y2
    let bx = x3 - x2, by = y3 - y2
    let sx = x0 - x1 + x2 - x3
    let sy = y0 - y1 + y2 - y3
    var a: CGFloat, b: CGFloat, c: CGFloat, d: CGFloat, e: CGFloat, f: CGFloat, g: CGFloat, hh: CGFloat
    let det = ax * by - bx * ay
    // sx,sy≈0(어파인) 또는 det≈0(퇴화 사각형) → 원근항 없이 어파인 근사 (NaN 방지, 리뷰 #6)
    if (abs(sx) < 1e-9 && abs(sy) < 1e-9) || abs(det) < 1e-9 {
        a = x1 - x0; b = x3 - x0; c = x0
        d = y1 - y0; e = y3 - y0; f = y0
        g = 0; hh = 0
    } else {
        g = (sx * by - bx * sy) / det
        hh = (ax * sy - sx * ay) / det
        a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0
        d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0
    }
    // 소스 스케일 (X/w, Y/h) 반영 후 SwiftUI 행벡터 규약으로 전치
    var t = ProjectionTransform()
    t.m11 = a / w; t.m12 = d / w; t.m13 = g / w
    t.m21 = b / h; t.m22 = e / h; t.m23 = hh / h
    t.m31 = c;     t.m32 = f;     t.m33 = 1
    return t
}

public struct RTBook3D: View {
    let front: AnyView      // 앞표지 콘텐츠 (172×252 기준)
    let spineTitle: String  // 책등 세로쓰기 제목

    // 컨테이너 (표지 + 책등 슬리버 + 상하 단면). 캐스트 섀도는 프레임 밖으로 그려짐.
    static let cw: CGFloat = 198
    static let ch: CGFloat = 268
    // 표지
    static let W: CGFloat = 172, H: CGFloat = 252, D: CGFloat = 38

    public init(front: AnyView, spineTitle: String = "몰입") {
        self.front = front
        self.spineTitle = spineTitle
    }

    public init(spineTitle: String = "몰입", @ViewBuilder front: () -> some View) {
        self.front = AnyView(front())
        self.spineTitle = spineTitle
    }

    // idle 3/4 각. sway 는 이 값 주위로 미세 진동.
    static let baseRy = 9.0
    static let baseRx = 5.0
    private func makeCam(ryDeg: Double, rxDeg: Double) -> Cam {
        Cam(ry: ryDeg * .pi / 180, rx: rxDeg * .pi / 180, p: 1000,
            cx: Self.cw / 2, cy: Self.ch / 2)
    }

    // 박스 로컬 코너 (x:좌-우, y:상-하, z:뒤-앞). half
    private var hw: Double { Double(Self.W) / 2 }
    private var hh: Double { Double(Self.H) / 2 }
    private var hd: Double { Double(Self.D) / 2 }

    // 앞면 4코너 투영 (좌상,우상,우하,좌하)
    private func frontQuad(_ cam: Cam) -> [CGPoint] {
        [cam.project(SIMD3(-hw, -hh, hd)), cam.project(SIMD3(hw, -hh, hd)),
         cam.project(SIMD3(hw, hh, hd)),  cam.project(SIMD3(-hw, hh, hd))]
    }
    // 책등(좌측 x=-hw) 4코너: 앞-좌상, 뒤-좌상, 뒤-좌하, 앞-좌하
    private func spineQuad(_ cam: Cam) -> [CGPoint] {
        [cam.project(SIMD3(-hw, -hh, hd)), cam.project(SIMD3(-hw, -hh, -hd)),
         cam.project(SIMD3(-hw, hh, -hd)), cam.project(SIMD3(-hw, hh, hd))]
    }
    // 하단 단면(y=hh): 앞-좌하, 앞-우하, 뒤-우하, 뒤-좌하
    private func bottomQuad(_ cam: Cam) -> [CGPoint] {
        [cam.project(SIMD3(-hw, hh, hd)), cam.project(SIMD3(hw, hh, hd)),
         cam.project(SIMD3(hw, hh, -hd)), cam.project(SIMD3(-hw, hh, -hd))]
    }
    // 상단 단면(y=-hh)
    private func topQuad(_ cam: Cam) -> [CGPoint] {
        [cam.project(SIMD3(-hw, -hh, -hd)), cam.project(SIMD3(hw, -hh, -hd)),
         cam.project(SIMD3(hw, -hh, hd)), cam.project(SIMD3(-hw, -hh, hd))]
    }
    // 뒤표지(z=-hd) — idle 각에선 컬링되나 6면 박스 완성(각도 변화 시 갈라짐 방지)
    private func backQuad(_ cam: Cam) -> [CGPoint] {
        [cam.project(SIMD3(hw, -hh, -hd)), cam.project(SIMD3(-hw, -hh, -hd)),
         cam.project(SIMD3(-hw, hh, -hd)), cam.project(SIMD3(hw, hh, -hd))]
    }
    // 우측 책배(페이지 단면, x=hw)
    private func foreQuad(_ cam: Cam) -> [CGPoint] {
        [cam.project(SIMD3(hw, -hh, -hd)), cam.project(SIMD3(hw, -hh, hd)),
         cam.project(SIMD3(hw, hh, hd)), cam.project(SIMD3(hw, hh, -hd))]
    }

    private func path(_ q: [CGPoint]) -> Path {
        var p = Path(); p.move(to: q[0]); q.dropFirst().forEach { p.addLine(to: $0) }; p.closeSubpath(); return p
    }

    public var body: some View {
        RTMotionFrame {
            composite(cam: makeCam(ryDeg: Self.baseRy, rxDeg: Self.baseRx), floatY: 0)
        } anim: { t in
            // 부유+sway (support.js: floatY=sin(.7t)·3.5, ry=9+sin(.45t)·1.5, rx=5+sin(.6t+1)·0.8)
            // floatY 는 접지 그림자와 공유하는 단일 소스 rtBookFloatY 사용(desync 방지, 리뷰 #2)
            let ry = Self.baseRy + sin(t * 0.45) * 1.5
            let rx = Self.baseRx + sin(t * 0.6 + 1) * 0.8
            return composite(cam: makeCam(ryDeg: ry, rxDeg: rx), floatY: rtBookFloatY(t))
        }
    }

    private func composite(cam: Cam, floatY: CGFloat) -> some View {
        ZStack {
            // 뒤 면들 먼저 (앞면이 이음매를 덮음)
            Canvas { ctx, _ in
                let spineVisible = cam.faceVisible(normal: SIMD3(-1, 0, 0))
                let bottomVisible = cam.faceVisible(normal: SIMD3(0, 1, 0))
                let topVisible = cam.faceVisible(normal: SIMD3(0, -1, 0))
                // 뒤표지·우측 책배 (idle 각에선 컬링됨) — 가장 뒤에 먼저
                if cam.faceVisible(normal: SIMD3(0, 0, -1)) {
                    ctx.fill(path(backQuad(cam)), with: .linearGradient(
                        Gradient(colors: [Color(hex: 0xE3D09E), Color(hex: 0xD6C087)]),
                        startPoint: backQuad(cam)[0], endPoint: backQuad(cam)[2]))
                }
                if cam.faceVisible(normal: SIMD3(1, 0, 0)) {
                    ctx.fill(path(foreQuad(cam)), with: .linearGradient(
                        Gradient(colors: [Color(hex: 0xF2EBD5), Color(hex: 0xD7CAA6)]),
                        startPoint: foreQuad(cam)[0], endPoint: foreQuad(cam)[1]))
                }
                if bottomVisible {
                    ctx.fill(path(bottomQuad(cam)), with: .linearGradient(
                        Gradient(colors: [Color(hex: 0xE6DABD), Color(hex: 0xD8CCAA)]),
                        startPoint: bottomQuad(cam)[0], endPoint: bottomQuad(cam)[2]))
                }
                if topVisible {
                    ctx.fill(path(topQuad(cam)), with: .linearGradient(
                        Gradient(colors: [Color(hex: 0xF2EBD5), Color(hex: 0xDCCFAD)]),
                        startPoint: topQuad(cam)[0], endPoint: topQuad(cam)[2]))
                }
                if spineVisible {
                    let sq = spineQuad(cam)
                    ctx.fill(path(sq), with: .linearGradient(
                        Gradient(stops: [
                            .init(color: Color(hex: 0x584627), location: 0),
                            .init(color: Color(hex: 0x736039), location: 0.45),
                            .init(color: Color(hex: 0x836D43), location: 1)]),
                        startPoint: sq[0], endPoint: sq[1]))
                    ctx.stroke(lerpQuadV(sq, t: 26 / Double(Self.H)),
                               with: .color(Color.black.opacity(0.28)), lineWidth: 1.2)
                    ctx.stroke(lerpQuadV(sq, t: 1 - 26 / Double(Self.H)),
                               with: .color(Color.black.opacity(0.28)), lineWidth: 1.2)
                    // 세로쓰기 제목 (시안: #efe1bd 12/900) — 책등 슬리버 안에 클립. 얇아 흐릿하나 존재.
                    if !spineTitle.isEmpty {
                        let cx = (sq[0].x + sq[1].x + sq[2].x + sq[3].x) / 4
                        let cy = (sq[0].y + sq[1].y + sq[2].y + sq[3].y) / 4
                        ctx.drawLayer { lc in
                            lc.clip(to: path(sq))
                            lc.translateBy(x: cx, y: cy)
                            lc.rotate(by: .degrees(90))
                            lc.draw(Text(spineTitle).font(.sans(9, 900))
                                .foregroundColor(Color(hex: 0xEFE1BD)), at: .zero, anchor: .center)
                        }
                    }
                }
            }
            .frame(width: Self.cw, height: Self.ch)

            frontCoverWarped(cam)
        }
        .frame(width: Self.cw, height: Self.ch)
        .offset(y: floatY)
        .shadow(color: Color(hex: 0x2E2110, alpha: 0.28), radius: 16, x: -6, y: 18)
    }

    // 책등 세로 위치 t(0~1)에서의 가로선 (앞모서리→뒤모서리)
    private func lerpQuadV(_ q: [CGPoint], t: Double) -> Path {
        // q: [앞상, 뒤상, 뒤하, 앞하]  → 앞변(0→3), 뒤변(1→2)
        let front = lerp(q[0], q[3], t)
        let back = lerp(q[1], q[2], t)
        var p = Path(); p.move(to: front); p.addLine(to: back); return p
    }
    private func lerp(_ a: CGPoint, _ b: CGPoint, _ t: Double) -> CGPoint {
        CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
    }

    fileprivate func frontCoverWarped(_ cam: Cam) -> some View {
        let q = frontQuad(cam)
        let coverX = (Self.cw - Self.W) / 2
        let coverY = (Self.ch - Self.H) / 2
        let H = rtHomography(
            w: Self.W, h: Self.H,
            // 소스: 컨테이너 안 중앙 배치된 표지 사각형의 로컬 좌표(0..W,0..H)
            tl: CGPoint(x: q[0].x - coverX, y: q[0].y - coverY),
            tr: CGPoint(x: q[1].x - coverX, y: q[1].y - coverY),
            br: CGPoint(x: q[2].x - coverX, y: q[2].y - coverY),
            bl: CGPoint(x: q[3].x - coverX, y: q[3].y - coverY))
        return front
            .frame(width: Self.W, height: Self.H)
            .projectionEffect(H)
            .frame(width: Self.cw, height: Self.ch)   // 컨테이너 안 중앙 정렬
    }
}

// 앞표지 콘텐츠 (172×252) — 시안 2A 라인 109~123. 데모 경로 표지(라이브는 coverUrl).
public struct HomeBook3DFront: View {
    public init() {}
    public var body: some View {
        ZStack {
            RT.kraftGrad(CGSize(width: 172, height: 252))
            // 수평 종이결 (3px 주기)
            Canvas { ctx, size in
                var y: CGFloat = 0
                while y < size.height {
                    ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: 1)),
                             with: .color(Color(hex: 0x7A602C, alpha: 0.05)))
                    y += 3
                }
            }
            // 좌측 책등 음영 (6px)
            HStack(spacing: 0) {
                LinearGradient.css(90, size: CGSize(width: 6, height: 252),
                                   [(Color.black.opacity(0.22), 0), (Color.black.opacity(0), 1)])
                    .frame(width: 6)
                Spacer(minLength: 0)
            }
            // 우측 책배 (종이단 3px, 상하 inset 3)
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                Rectangle().fill(Color(hex: 0xEDE1C2)).frame(width: 3).padding(.vertical, 3)
            }
            // 내부 프레임 (inset 8)
            Rectangle().stroke(Color(hex: 0x7A602C, alpha: 0.4), lineWidth: 1).padding(8)
            // 시트(광택) 158deg
            LinearGradient.css(158, size: CGSize(width: 172, height: 252),
                               [(Color(hex: 0xFFFBEE, alpha: 0.4), 0),
                                (Color(hex: 0xFFFBEE, alpha: 0), 0.42),
                                (Color(hex: 0x4A381A, alpha: 0.06), 1)])
            // 내용
            VStack(spacing: 0) {
                Text("MIHALY CSIKSZENTMIHALYI").font(.mono(7, 600)).tracking(7 * 0.24)
                    .foregroundColor(Color(hex: 0x9A7C40)).lineLimit(1).fixedSize()
                Text("몰입").font(.sans(43, 900)).tracking(43 * 0.08)
                    .foregroundColor(Color(hex: 0x241C0D)).padding(.top, 33)
                Text("FLOW").font(.mono(9, 700)).tracking(9 * 0.42)
                    .foregroundColor(Color(hex: 0xB3494B)).padding(.top, 9)
                Spacer(minLength: 0)
                Rectangle().fill(Color(hex: 0x9A7C40).opacity(0.6)).frame(width: 34, height: 2)
                Text("미하이 칙센트미하이").font(.sans(10, 600))
                    .foregroundColor(Color(hex: 0x7C6A42)).padding(.top, 9)
            }
            .padding(EdgeInsets(top: 23, leading: 14, bottom: 16, trailing: 14))
        }
        .frame(width: 172, height: 252)
    }
}

// 앞표지 면 처리 — 시안(2A 라인 111·112·114)의 책등 음영·책배·광택·내부 보더.
// 데모 표지(HomeBook3DFront)엔 baked-in 이지만 라이브(원격 표지 이미지)엔 없어서
// 실제 표지 책은 입체감이 안 읽혔다(실기기 데이터 재현으로 확인). 두 경로 모두 이 처리를 받아야 함.
public struct RTBookFaceTreatment: ViewModifier {
    let size: CGSize
    public init(size: CGSize) { self.size = size }
    public func body(content: Content) -> some View {
        ZStack {
            content
            // 좌측 책등 쪽 음영(6) / 우측 책배 종이단(3)
            HStack(spacing: 0) {
                LinearGradient.css(90, size: CGSize(width: 6, height: size.height),
                                   [(Color.black.opacity(0.22), 0), (Color.black.opacity(0), 1)])
                    .frame(width: 6)
                Spacer(minLength: 0)
                Rectangle().fill(Color(hex: 0xEDE1C2)).frame(width: 3).padding(.vertical, 3)
            }
            // 158deg 광택(빛 방향)
            LinearGradient.css(158, size: size,
                               [(Color(hex: 0xFFFBEE, alpha: 0.4), 0),
                                (Color(hex: 0xFFFBEE, alpha: 0), 0.42),
                                (Color(hex: 0x4A381A, alpha: 0.06), 1)])
            // 면 1px 내부 보더 (시안 inset 0 0 0 1px rgba(122,96,44,.12))
            Rectangle().stroke(Color(hex: 0x7A602C, alpha: 0.12), lineWidth: 1)
        }
        .frame(width: size.width, height: size.height)
    }
}

public extension View {
    func rtBookFace(size: CGSize) -> some View { modifier(RTBookFaceTreatment(size: size)) }
}

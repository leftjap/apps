// 파라메트릭 SVG 도형 헬퍼 — 좌표를 입력 숫자에서 *계산*(손코딩 금지).
// 정본 규약: docs/math-curriculum.md §도형(figure) 규약. dotsSvg 패턴 확장.
// 원칙: ① 라벨 = 입력 숫자(비율 구조적 정합) ② 개념의 "변형"을 그린다.

const C = { fill: '#dce7d0', stroke: '#788c5d', sq: '#eef3e9', text: '#8a8475', accent: '#d97757' };

const n1 = (v) => +Number(v).toFixed(1);
const P = (p) => `${n1(p[0])},${n1(p[1])}`;
const poly = (pts, fill) =>
  `<polygon points="${pts.map(P).join(' ')}" fill="${fill}" stroke="${C.stroke}" stroke-width="1.5"/>`;
const txt = (x, y, s, fill = C.text, size = 13) =>
  `<text x="${n1(x)}" y="${n1(y)}" font-size="${size}" fill="${fill}" text-anchor="middle">${s}</text>`;
const ctr = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/**
 * 피타고라스 — 직각삼각형 + 세 변 위 정사각형(넓이의 덧셈 a²+b²=c² 시각화).
 * 핵심: 두 변 정사각형 넓이 합 = 빗변 정사각형 넓이. 라벨은 각 정사각형의 넓이(a²·b²·c²).
 */
export function squaresOnSides({ a, b, unit = 20, pad = 18 }) {
  const u = unit;
  const Cx = b * u + pad, Cy = b * u + a * u + pad;       // 직각 꼭짓점(왼·아래 정사각형 자리 확보)
  const Cpt = [Cx, Cy], B = [Cx + a * u, Cy], A = [Cx, Cy - b * u]; // 직각C, 수평끝B, 수직끝A
  const bottom = [Cpt, B, [B[0], B[1] + a * u], [Cx, Cy + a * u]];  // 변 a(수평) 위 정사각형
  const left = [Cpt, A, [A[0] - b * u, A[1]], [Cx - b * u, Cy]];    // 변 b(수직) 위 정사각형
  const hyp = [A, B, [B[0] + b * u, B[1] - a * u], [A[0] + b * u, A[1] - a * u]]; // 빗변 위 정사각형
  const w = Cx + a * u + b * u + pad, h = Cy + a * u + pad;
  const [bx, by] = ctr(bottom), [lx, ly] = ctr(left), [hx, hy] = ctr(hyp);
  return `<svg width="${n1(w)}" height="${n1(h)}" viewBox="0 0 ${n1(w)} ${n1(h)}" role="img" `
    + `aria-label="직각을 낀 두 변 ${a}·${b} 위 정사각형(넓이 ${a * a}·${b * b})의 합 = 빗변 위 정사각형 넓이 ${a * a + b * b}">`
    + poly(left, C.sq) + poly(bottom, C.sq) + poly(hyp, C.sq)
    + poly([Cpt, B, A], C.fill)                                      // 직각삼각형
    + `<rect x="${n1(Cx)}" y="${n1(Cy - 12)}" width="12" height="12" fill="none" stroke="${C.stroke}" stroke-width="1"/>`
    + txt(bx, by + 5, a * a) + txt(lx, ly + 5, b * b) + txt(hx, hy + 5, a * a + b * b, C.accent)
    + '</svg>';
}

const rect = (x, y, w, h, fill) =>
  `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${fill}" stroke="${C.stroke}" stroke-width="1"/>`;

/**
 * 삼각수 — 계단(1+2+…+n) + 똑같은 계단을 거꾸로 끼워 n×(n+1) 직사각형(절반이 삼각수).
 */
export function staircaseToRect({ n, unit = 22, pad = 16 }) {
  const u = unit, W = n * u, H = (n + 1) * u;
  let cells = '';
  for (let j = 1; j <= n; j++) {                       // 열 j: 아래 j칸=계단(채움), 위 (n+1-j)칸=보충
    const x = pad + (j - 1) * u;
    cells += rect(x, pad + (n + 1 - j) * u, u, j * u, C.fill);          // 계단(삼각수)
    cells += rect(x, pad, u, (n + 1 - j) * u, C.sq);                    // 거꾸로 끼운 보충분
  }
  const w = W + pad * 2, h = H + pad * 2;
  return `<svg width="${n1(w)}" height="${n1(h)}" viewBox="0 0 ${n1(w)} ${n1(h)}" role="img" `
    + `aria-label="계단 1+2+…+${n} 와 거꾸로 끼운 계단이 ${n}×${n + 1} 직사각형">`
    + cells
    + rect(pad, pad, W, H, 'none')                                       // 직사각형 윤곽
    + txt(pad + W / 2, pad + H + 12, `${n} × ${n + 1}`) + '</svg>';
}

/**
 * 사다리꼴 — 똑같은 사다리꼴을 거꾸로 붙이면 평행사변형(밑변 = 윗변+아랫변), 그 절반.
 */
export function trapezoidDoubled({ top, bottom, height, unit = 22, pad = 16 }) {
  const u = unit, TOP = top * u, BOT = bottom * u, H = height * u, A = (BOT - TOP) / 2;
  const o = (p) => [p[0] + pad, p[1] + pad];
  const T = [[A, 0], [A + TOP, 0], [BOT, H], [0, H]].map(o);                       // 원본 사다리꼴
  const Td = [[BOT + TOP, H], [BOT, H], [A + TOP, 0], [BOT + A + TOP, 0]].map(o);  // 180° 거꾸로
  const w = BOT + A + TOP + pad * 2, h = H + pad * 2 + 14;
  return `<svg width="${n1(w)}" height="${n1(h)}" viewBox="0 0 ${n1(w)} ${n1(h)}" role="img" `
    + `aria-label="윗변 ${top} 아랫변 ${bottom} 사다리꼴 + 거꾸로 붙인 사다리꼴 = 밑변 ${top + bottom} 평행사변형">`
    + poly(T, C.fill) + poly(Td, C.sq)
    + txt(pad + (BOT + TOP) / 2, pad + H + 12, `평행사변형 밑변 = ${top} + ${bottom}`) + '</svg>';
}

/**
 * 원 — 부채꼴로 잘라 번갈아 끼우면 거의 직사각형(가로 πr · 세로 r) → πr². (간이 묘사)
 */
export function circleToRect({ r, unit = 11, pad = 16, n = 12 }) {
  const u = unit, R = r * u, cx = pad + R, cy = pad + R;
  let radii = '';
  for (let i = 0; i < n; i++) {                                         // 부채꼴 암시 — 반지름선
    const t = (i / n) * 2 * Math.PI;
    radii += `<line x1="${n1(cx)}" y1="${n1(cy)}" x2="${n1(cx + R * Math.cos(t))}" y2="${n1(cy + R * Math.sin(t))}" stroke="${C.stroke}" stroke-width="0.8"/>`;
  }
  const circle = `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(R)}" fill="${C.sq}" stroke="${C.stroke}" stroke-width="1.5"/>` + radii;
  const ax = cx + R + 14;                                               // 화살표
  const arrow = `<text x="${n1(ax + 8)}" y="${n1(cy + 5)}" font-size="18" fill="${C.text}">→</text>`;
  const rx = ax + 28, W = Math.PI * R, halfN = Math.round(n / 2);       // 직사각형(가로 πr·세로 r) + 톱니(부채꼴)
  const ry = cy - R / 2, tooth = W / halfN;
  let teeth = '';
  for (let i = 0; i < halfN; i++) {                                     // 윗변 톱니 = 위로 향한 부채꼴
    const x0 = rx + i * tooth;
    teeth += poly([[x0, ry + R], [x0 + tooth / 2, ry], [x0 + tooth, ry + R]].map((p) => p), i % 2 ? C.sq : C.fill);
  }
  const w = rx + W + pad, h = pad * 2 + 2 * R + 14;
  return `<svg width="${n1(w)}" height="${n1(h)}" viewBox="0 0 ${n1(w)} ${n1(h)}" role="img" `
    + `aria-label="반지름 ${r} 원을 부채꼴로 펴면 가로 πr 세로 r 직사각형 → 넓이 πr²">`
    + circle + arrow + teeth
    + `<rect x="${n1(rx)}" y="${n1(ry)}" width="${n1(W)}" height="${n1(R)}" fill="none" stroke="${C.stroke}" stroke-width="1.5"/>`
    + txt(rx + W / 2, ry + R + 12, '가로 ≈ πr') + txt(rx - 10, ry + R / 2 + 4, 'r')
    + `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="2" fill="${C.stroke}"/>` + '</svg>';
}

/**
 * 라벨 원 — 응용용. 반지름 또는 지름 1개를 표시(단일 원이라 표시 크기는 고정, 라벨이 주어진 값).
 * kind:'diameter' 면 지름선(가로 전체)+"지름 N", 아니면 반지름선+"반지름 N".
 */
export function labeledCircle({ value, kind = 'radius', pad = 18 }) {
  const R = 52, cx = pad + R, cy = pad + R, w = R * 2 + pad * 2, h = R * 2 + pad * 2 + 16;
  const dia = kind === 'diameter';
  const line = dia
    ? `<line x1="${n1(cx - R)}" y1="${cy}" x2="${n1(cx + R)}" y2="${cy}" stroke="${C.stroke}" stroke-width="1.5"/>`
    : `<line x1="${cx}" y1="${cy}" x2="${n1(cx + R)}" y2="${cy}" stroke="${C.stroke}" stroke-width="1.5"/>`;
  const label = dia ? txt(cx, cy - 8, `지름 ${value}`) : txt(cx + R / 2, cy - 8, `반지름 ${value}`);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${dia ? '지름' : '반지름'} ${value} 원">`
    + `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${C.sq}" stroke="${C.stroke}" stroke-width="2"/>`
    + line + `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${C.stroke}"/>` + label + '</svg>';
}

/**
 * 닮음(정사각형) — 작은 정사각형 + 한 변 k배 정사각형(k×k 격자로 넓이 k²배 시각화).
 */
export function scaledSquares({ k, unit = 30, pad = 16, gap = 26 }) {
  const s = unit, big = k * unit, y = pad + big, sx = pad, bx = pad + s + gap;
  let grid = '';
  for (let i = 0; i <= k; i++) {
    grid += `<line x1="${n1(bx + i * unit)}" y1="${n1(y - big)}" x2="${n1(bx + i * unit)}" y2="${y}" stroke="${C.stroke}" stroke-width="0.6"/>`;
    grid += `<line x1="${bx}" y1="${n1(y - i * unit)}" x2="${n1(bx + big)}" y2="${n1(y - i * unit)}" stroke="${C.stroke}" stroke-width="0.6"/>`;
  }
  const w = bx + big + pad, h = y + 16;
  return `<svg width="${n1(w)}" height="${n1(h)}" viewBox="0 0 ${n1(w)} ${n1(h)}" role="img" aria-label="작은 정사각형과 한 변 ${k}배 정사각형(넓이 ${k * k}배)">`
    + rect(sx, y - s, s, s, C.fill) + rect(bx, y - big, big, big, C.sq) + grid
    + txt(sx + s / 2, y + 12, '×1') + txt(bx + big / 2, y + 12, `×${k}`) + '</svg>';
}

/**
 * 닮음(원) — 작은 원 + 지름 k배 원(넓이 k²배). 피자/접시 등.
 */
export function scaledCircles({ k, pad = 16, gap = 26 }) {
  const r = 24, big = k * r, cy = pad + big, sCx = pad + r, bCx = pad + 2 * r + gap + big;
  const w = bCx + big + pad, h = pad + 2 * big + 18;
  return `<svg width="${n1(w)}" height="${n1(h)}" viewBox="0 0 ${n1(w)} ${n1(h)}" role="img" aria-label="작은 원과 지름 ${k}배 원(넓이 ${k * k}배)">`
    + `<circle cx="${n1(sCx)}" cy="${n1(cy)}" r="${r}" fill="${C.fill}" stroke="${C.stroke}" stroke-width="1.5"/>`
    + `<circle cx="${n1(bCx)}" cy="${n1(cy)}" r="${n1(big)}" fill="${C.sq}" stroke="${C.stroke}" stroke-width="1.5"/>`
    + txt(sCx, cy + big + 12, '지름 ×1') + txt(bCx, cy + big + 12, `지름 ×${k}`) + '</svg>';
}

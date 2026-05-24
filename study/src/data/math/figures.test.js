import { describe, it, expect } from 'vitest';
import { squaresOnSides, staircaseToRect, trapezoidDoubled, circleToRect, labeledCircle, scaledSquares, scaledCircles, labeledTriangle, labeledParallelogram, labeledTrapezoid, oddSquareSteps, squareCount, triangleInRect, paraToRect, rightTriangle } from './figures.js';

// 파라메트릭 도형 헬퍼 — 비율이 입력 숫자에서 *계산*됨을 자동 검증(손코딩 비율오류 방지).
// math-curriculum.md §도형 규약: 라벨 = 입력 숫자, 변형 묘사.

const polys = (svg) => [...svg.matchAll(/<polygon points="([^"]+)"/g)]
  .map((m) => m[1].trim().split(/\s+/).map((p) => p.split(',').map(Number)));
const rects = (svg) => [...svg.matchAll(/<rect[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*fill="([^"]+)"/g)]
  .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], fill: m[5] }));
const sides = (pts) => pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]); });

describe('squaresOnSides — 피타고라스 세 변 위 정사각형', () => {
  it('세 정사각형 변 길이 = a·b·c (3·4·5) by construction', () => {
    const svg = squaresOnSides({ a: 3, b: 4, unit: 20 });
    const ps = polys(svg);
    expect(ps).toHaveLength(4); // 정사각형 3 + 삼각형 1
    const sq = ps.slice(0, 3).map(sides);
    expect(sq[0].every((s) => Math.abs(s - 80) < 0.5)).toBe(true);  // b*u = 4*20
    expect(sq[1].every((s) => Math.abs(s - 60) < 0.5)).toBe(true);  // a*u = 3*20
    expect(sq[2].every((s) => Math.abs(s - 100) < 0.5)).toBe(true); // c*u = 5*20
  });
  it('넓이 라벨 a²·b²·c² = 9·16·25', () => {
    const labels = [...squaresOnSides({ a: 3, b: 4 }).matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1]);
    expect(labels).toEqual(['9', '16', '25']); // 방출 순서: bottom a²·left b²·hyp c²
  });
  it('단위 바뀌어도 비율 보존(6·8·10)', () => {
    const sq = polys(squaresOnSides({ a: 6, b: 8, unit: 10 })).slice(0, 3).map(sides);
    expect(sq[2].every((s) => Math.abs(s - 100) < 0.5)).toBe(true); // c*u = 10*10
  });
});

describe('staircaseToRect — 삼각수 계단 두 벌 = 직사각형', () => {
  it('계단 = T_n, 보충 = T_n, 직사각형 n×(n+1)', () => {
    const u = 22, svg = staircaseToRect({ n: 4, unit: 22 });
    const rs = rects(svg);
    const cells = (f) => rs.filter((r) => r.fill === f).reduce((s, r) => s + r.h / u, 0);
    expect(cells('#dce7d0')).toBe(10); // T_4
    expect(cells('#eef3e9')).toBe(10);
    const outline = rs.find((r) => r.fill === 'none');
    expect([outline.w / u, outline.h / u]).toEqual([4, 5]);
  });
});

describe('trapezoidDoubled — 사다리꼴 두 개 = 평행사변형', () => {
  it('두 사다리꼴 결합 = 밑변 (top+bottom)·u 평행사변형', () => {
    const u = 22, svg = trapezoidDoubled({ top: 4, bottom: 8, height: 4, unit: 22 });
    const ps = polys(svg);
    expect(ps).toHaveLength(2);
    const all = ps.flat(), ys = all.map((p) => p[1]);
    const maxY = Math.max(...ys), minY = Math.min(...ys);
    const xs = (y) => all.filter((p) => Math.abs(p[1] - y) < 0.5).map((p) => p[0]);
    const bw = Math.max(...xs(maxY)) - Math.min(...xs(maxY));
    const tw = Math.max(...xs(minY)) - Math.min(...xs(minY));
    expect(Math.abs(bw - (4 + 8) * u)).toBeLessThan(1); // 밑변 = 윗변+아랫변
    expect(Math.abs(tw - (4 + 8) * u)).toBeLessThan(1); // 평행사변형(윗변=밑변)
    expect(Math.abs((maxY - minY) - 4 * u)).toBeLessThan(1); // 높이
  });
});

describe('circleToRect — 원을 부채꼴로 펴면 πr × r 직사각형', () => {
  it('직사각형 가로 = πr·u, 세로 = r·u, 원 반지름 = r·u', () => {
    const u = 11, r = 10, svg = circleToRect({ r, unit: u });
    const rrect = rects(svg).find((x) => x.fill === 'none');
    expect(Math.abs(rrect.w - Math.PI * r * u)).toBeLessThan(1);
    expect(rrect.h).toBe(r * u);
    const cr = +svg.match(/<circle[^>]*r="([\d.]+)"[^>]*fill="#eef/)[1];
    expect(cr).toBe(r * u);
  });
});

const lineLen = (svg) => [...svg.matchAll(/<line[^>]*x1="([\d.]+)"[^>]*x2="([\d.]+)"/g)].map((m) => Math.abs(+m[2] - +m[1]));

describe('labeledCircle — 응용 라벨 원', () => {
  it('반지름 모드: 반지름선(R) + "반지름 N"', () => {
    const svg = labeledCircle({ value: 5, kind: 'radius' });
    expect(svg).toContain('반지름 5');
    expect(lineLen(svg)[0]).toBe(52);
  });
  it('지름 모드: 지름선(2R) + "지름 N"', () => {
    const svg = labeledCircle({ value: 20, kind: 'diameter' });
    expect(svg).toContain('지름 20');
    expect(lineLen(svg)[0]).toBe(104);
  });
});

describe('scaledSquares — 닮음 정사각형 (큰 변 = k × 작은 변)', () => {
  it('k=3 비율 3', () => {
    const r = rects(scaledSquares({ k: 3, unit: 30 }));
    expect(r[1].w / r[0].w).toBe(3);
    expect(r[0].w).toBe(30);
  });
  it('k=2 비율 2', () => {
    const r = rects(scaledSquares({ k: 2, unit: 30 }));
    expect(r[1].w / r[0].w).toBe(2);
  });
});

describe('scaledCircles — 닮음 원 (큰 반지름 = k × 작은 반지름)', () => {
  it('k=2 비율 2', () => {
    const cs = [...scaledCircles({ k: 2 }).matchAll(/<circle[^>]*r="([\d.]+)"/g)].map((m) => +m[1]).filter((x) => x > 3);
    expect(Math.max(...cs) / Math.min(...cs)).toBe(2);
  });
});

describe('labeledTriangle — 응용 삼각형 (밑변·높이)', () => {
  it('밑변 = base·u, 수직 높이 = height·u', () => {
    const u = 14, svg = labeledTriangle({ base: 10, height: 6, unit: u });
    const p = polys(svg)[0];
    const ys = p.map((q) => q[1]);
    expect(Math.abs(p[1][0] - p[0][0])).toBe(10 * u);          // 밑변
    expect(Math.max(...ys) - Math.min(...ys)).toBe(6 * u);     // 높이(수직)
    expect(svg).toContain('밑변 10'); expect(svg).toContain('높이 6');
  });
});

describe('labeledParallelogram — 응용 평행사변형 (밑변·수직높이)', () => {
  it('밑변 = base·u, 수직 높이 = height·u', () => {
    const u = 14, svg = labeledParallelogram({ base: 7, height: 5, unit: u });
    const p = polys(svg)[0];
    const ys = p.map((q) => q[1]);
    expect(Math.abs(p[1][0] - p[0][0])).toBe(7 * u);           // 밑변(아랫변)
    expect(Math.max(...ys) - Math.min(...ys)).toBe(5 * u);     // 수직 높이
  });
});

describe('labeledTrapezoid — 응용 사다리꼴 (윗변·아랫변·높이)', () => {
  it('윗변=top·u, 아랫변=bottom·u, 높이=height·u', () => {
    const u = 14, svg = labeledTrapezoid({ top: 3, bottom: 7, height: 4, unit: u });
    const p = polys(svg)[0];
    const ys = p.map((q) => q[1]); const minY = Math.min(...ys), maxY = Math.max(...ys);
    const xs = (y) => p.filter((q) => Math.abs(q[1] - y) < 0.5).map((q) => q[0]);
    expect(Math.max(...xs(minY)) - Math.min(...xs(minY))).toBe(3 * u);  // 윗변
    expect(Math.max(...xs(maxY)) - Math.min(...xs(maxY))).toBe(7 * u);  // 아랫변
    expect(maxY - minY).toBe(4 * u);                                    // 높이
  });
});

const circleCount = (svg) => [...svg.matchAll(/<circle /g)].length;

describe('oddSquareSteps — 홀수합 단계(정사각형 성장)', () => {
  it('패널 점 합 = Σn² (maxN=4 → 30), 결과·증분 라벨', () => {
    const svg = oddSquareSteps({ maxN: 4 });
    expect(circleCount(svg)).toBe(1 + 4 + 9 + 16); // 각 패널 n×n
    ['1² = 1', '2² = 4', '3² = 9', '4² = 16'].forEach((l) => expect(svg).toContain(l));
    ['+3', '+5', '+7'].forEach((l) => expect(svg).toContain(l)); // 겹마다 더해지는 홀수
  });
  it('인자 없이 호출 가능(기본값) — 모듈 로드 시 oddSquareSteps()', () => {
    expect(() => oddSquareSteps()).not.toThrow();
    expect(oddSquareSteps()).toContain('<svg');
  });
});

describe('squareCount — 정사각 개수 시각화', () => {
  it('side=6 → 36점 + "6 × 6 = 36"', () => {
    const svg = squareCount({ side: 6 });
    expect(circleCount(svg)).toBe(36);
    expect(svg).toContain('6 × 6 = 36');
  });
});

describe('triangleInRect — 삼각형 = 직사각형 절반 (해설)', () => {
  it('점선 직사각형 = base×height·u, 채운 삼각형 = 그 절반(밑변·높이 일치)', () => {
    const u = 16, svg = triangleInRect({ base: 10, height: 6, unit: u });
    const r = rects(svg).find((x) => x.fill === 'none');
    expect(r.w).toBe(10 * u);
    expect(r.h).toBe(6 * u);
    const p = polys(svg)[0];
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(10 * u); // 삼각형 밑변
    expect(Math.max(...ys) - Math.min(...ys)).toBe(6 * u);  // 삼각형 높이(수직)
    expect(svg).toContain('밑변 10'); expect(svg).toContain('높이 6');
  });
});

describe('paraToRect — 평행사변형 → 직사각형 (해설)', () => {
  it('점선 직사각형 = base×height·u, 평행사변형 아랫변 = base·u', () => {
    const u = 16, svg = paraToRect({ base: 7, height: 5, unit: u });
    const r = rects(svg).find((x) => x.fill === 'none');
    expect(r.w).toBe(7 * u);
    expect(r.h).toBe(5 * u);
    const p = polys(svg)[0];
    const ys = p.map((q) => q[1]); const maxY = Math.max(...ys);
    const xsBottom = p.filter((q) => Math.abs(q[1] - maxY) < 0.5).map((q) => q[0]);
    expect(Math.max(...xsBottom) - Math.min(...xsBottom)).toBe(7 * u); // 평행사변형 아랫변
    expect(svg).toContain('밑변 7'); expect(svg).toContain('높이 5');
  });
});

describe('rightTriangle — 직각삼각형 (응용 프롬프트)', () => {
  it('가로변 = a·u, 세로변 = b·u, 라벨 덮어쓰기(빗변 ?)', () => {
    const u = 16, svg = rightTriangle({ a: 6, b: 8, unit: u, labels: { base: '6', height: '8', hyp: '?' } });
    const p = polys(svg)[0];
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(6 * u); // 가로변(밑변)
    expect(Math.max(...ys) - Math.min(...ys)).toBe(8 * u); // 세로변(높이)
    expect(svg).toContain('>6<'); expect(svg).toContain('>8<'); expect(svg).toContain('>?<');
  });
  it('미지수 한 변 문제 — 라벨만 ? (기하는 실수치로 비율 정합)', () => {
    const svg = rightTriangle({ a: 12, b: 5, labels: { base: '?', height: '5', hyp: '13' } });
    expect(svg).toContain('>?<'); expect(svg).toContain('>13<');
  });
});

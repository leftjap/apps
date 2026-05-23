import { describe, it, expect } from 'vitest';
import { squaresOnSides, staircaseToRect, trapezoidDoubled, circleToRect } from './figures.js';

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

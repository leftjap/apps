import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIZE_MAX, sizeAt, sizeGlsl } from '../src/render/size.ts';

describe('멀어질수록 키워 그리는 배율(크기 기준 하나)', () => {
  it('가까운 보기(보는 거리 250m 안, 화면 위쪽까지 15% 여유)에서 사람·차 배율은 1.15 아래다', () => {
    for (const d of [10, 100, 200, 250, 287]) expect(sizeAt('mover', d)).toBeLessThan(1.15);
  });
  it('같은 꼴의 곡선이다: 시작 거리 안은 1, 넘으면 거리에 비례해 커지다 요소별 상한에서 멈춘다', () => {
    for (const k of Object.keys(SIZE_MAX) as (keyof typeof SIZE_MAX)[]) {
      expect(sizeAt(k, 50)).toBe(1);
      let prev = 1;
      for (let d = 0; d <= 8000; d += 50) {
        const s = sizeAt(k, d);
        expect(s).toBeGreaterThanOrEqual(prev);
        expect(s).toBeLessThanOrEqual(SIZE_MAX[k]);
        prev = s;
      }
      expect(sizeAt(k, 8000)).toBe(SIZE_MAX[k]);
    }
  });
  it('길 위에 고정된 것(정류장·출구·나무·신호등)은 사람·차보다 덜 키운다: 길 폭을 넘어 옆 차로·건물을 덮지 않게', () => {
    for (const k of ['tree', 'exit', 'shelter', 'island', 'signal'] as const) expect(SIZE_MAX[k]).toBeLessThanOrEqual(1.5);
    // 중앙버스정류장은 길이·폭을 키우지 않는다(찻길과 맞아야 한다). island 는 높이에만 쓴다
    expect(SIZE_MAX.island).toBeLessThanOrEqual(1.5);
  });
  it('셰이더 식은 TS 식과 같은 값을 낸다', () => {
    const glsl = sizeGlsl('mover', 'd');
    const f = new Function('d', `const clamp = (v, a, b) => Math.min(b, Math.max(a, v)); return ${glsl};`) as (d: number) => number;
    for (const d of [0, 200, 400, 900, 3000]) expect(f(d)).toBeCloseTo(sizeAt('mover', d), 6);
  });
  it('사람·고양이·차·버스·열차·정류장·출구·나무·신호등을 그리는 셰이더는 이 기준만 쓴다(옛 zoomScale 계수가 남지 않는다)', () => {
    for (const f of ['walkers', 'cats', 'cars', 'busstops', 'stations', 'trees', 'signals']) {
      const src = readFileSync(new URL(`../src/render/${f}.ts`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/zoomScale\(/);
      expect(src, f).toMatch(/sizeGlsl\(/);
    }
    const rails = readFileSync(new URL('../src/render/rails.ts', import.meta.url), 'utf8');
    expect(rails).toMatch(/trainVert\([^)]*sizeGlsl\('mover'/);
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(main).not.toMatch(/Math\.min\(6\.5, Math\.max\(1\.6/);
  });
});

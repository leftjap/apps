// 건물 연결형 출구(홍대입구 5·7번, 망원 2번 등): 출구 모형 자리를 덮는 건물 외곽선에 출구 크기만큼 홈을 내 위에서 보이게 한다
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { exitBody, notchOut } from '../src/data/exitFit.ts';
import { EXIT_LOOKS, exitLook } from '../src/data/exits.ts';

const area = (p: Float32Array) => {
  let s = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) s += p[j] * p[i + 1] - p[i] * p[j + 1];
  return s / 2;
};
const inPoly = (x: number, z: number, p: Float32Array) => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if (p[i + 1] > z !== p[j + 1] > z && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  return c;
};

describe('외곽선에 홈 내기', () => {
  const sq = new Float32Array([0, 0, 20, 0, 20, 20, 0, 20]);
  it('변에 걸친 직사각형(사방 0.3m 여유)을 빼고 꼭짓점은 넷 늘어난다', () => {
    // 아래 변(z = 0) 가운데에 걸친 6 × 4 직사각형(z −1 ~ 3)
    const p = notchOut(sq, [[7, -1], [13, -1], [13, 3], [7, 3]])!;
    expect(p.length / 2).toBe(8);
    expect(inPoly(10, 1.5, p)).toBe(false);
    expect(inPoly(10, 5, p)).toBe(true);
    expect(inPoly(3, 1.5, p)).toBe(true);
    expect(area(p)).toBeCloseTo(400 - 6.6 * 3.3, 1);
  });
  it('꺾인 벽에 걸친 직사각형: 직사각형 안 꼭짓점은 빠지고 직사각형 테두리로 잇는다', () => {
    // 아래 변이 x = 10 에서 2m 꺾여 들어간 외곽선
    const jog = new Float32Array([0, 0, 10, 0, 10, 2, 20, 2, 20, 20, 0, 20]);
    const p = notchOut(jog, [[6, -1], [14, -1], [14, 4], [6, 4]])!;
    expect(p).not.toBeNull();
    for (const [x, z] of [[8, 2], [12, 3], [10, 1]]) expect(inPoly(x, z, p)).toBe(false);
    expect(inPoly(10, 8, p)).toBe(true);
    expect(area(p)).toBeGreaterThan(0);
  });
  it('건물과 겹치지 않으면 그대로(null)', () => {
    expect(notchOut(sq, [[30, 0], [36, 0], [36, 4], [30, 4]])).toBeNull();
  });
});

describe('구운 판의 건물 연결형 출구', () => {
  const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
  it('건물 연결형 출구 모형 자리를 출구보다 높은 건물이 덮지 않는다', () => {
    const hidden: string[] = [];
    for (const e of board.exits) {
      if (!e.ref) continue;
      const lk = exitLook(e.st, e.ref);
      if (!lk.attached) continue;
      const { cx, cz, len } = exitBody(e, lk.l);
      const [ux, uz] = [Math.cos(e.yaw), Math.sin(e.yaw)];
      const W = Math.max(2, lk.w);
      let n = 0;
      let hit = 0;
      for (let i = -0.4; i <= 0.41; i += 0.1)
        for (let j = -0.4; j <= 0.41; j += 0.2) {
          n++;
          const x = cx + ux * i * len - uz * j * W;
          const z = cz + uz * i * len + ux * j * W;
          if (board.buildings.some((b) => b.h > 6 && inPoly(x, z, b.pts))) hit++;
        }
      if (hit / n > 0.1) hidden.push(`${e.st}${e.ref} ${hit}/${n}`);
    }
    expect(Object.values(EXIT_LOOKS).filter((l) => l.attached).length).toBeGreaterThanOrEqual(3);
    expect(hidden, hidden.join(', ')).toHaveLength(0);
  });
});

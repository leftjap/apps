import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { curbAt, decodeBoard, type Board, type Building, type Exit } from '../src/data/board.ts';
import { exitBody, exitOutline, fitExits, onRoad } from '../src/data/exitFit.ts';
import { EXIT_LOOKS, exitLook } from '../src/data/exits.ts';
import { EXIT_PARTS, EXIT_SHAPES } from '../src/render/stations.ts';

const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
const parts = (g: ReturnType<(typeof EXIT_SHAPES)['box']>) => new Set(Array.from(g.attributes.aPart.array as Float32Array));

describe('지하철 출구 모양 자료', () => {
  it('판의 출구 49곳이 모두 자료에 있고, 확인하지 못한 출구는 3곳이다', () => {
    const keys = board.exits.filter((e) => e.ref).map((e) => `${e.st}:${e.ref}`);
    expect(keys).toHaveLength(49);
    for (const k of keys) expect(EXIT_LOOKS[k], k).toBeDefined();
    expect(Object.values(EXIT_LOOKS).filter((l) => l.seen === 'no')).toHaveLength(3);
  });
  it('서울교통공사 출구는 공공 자료의 캐노피 종류와 폭을 쓴다', () => {
    expect(exitLook('신촌', '6')).toMatchObject({ kind: 'box', w: 5.1, src: 'OA-22449' });
    expect(exitLook('합정', '2')).toMatchObject({ kind: 'vault', w: 3.44 });
    expect(exitLook('상수', '1').kind).toBe('open');
    expect(exitLook('홍대입구', '8').kind).toBe('old');
    expect(exitLook('홍대입구', '5')).toMatchObject({ kind: 'grand', src: '로드뷰', attached: true });
  });
  it('로드뷰로 고친 출구: 망원은 높이 4.5m 안팎의 큰 건물형, 홍대입구 3번은 그림 판을 두른 낮은 출구, 7번은 건물 연결형', () => {
    expect(exitLook('망원', '1')).toMatchObject({ kind: 'kiosk', w: 3.2, l: 11, h: 1.5 });
    expect(exitLook('홍대입구', '3')).toMatchObject({ kind: 'mural', h: 1 });
    expect(exitLook('홍대입구', '7').attached).toBe(true);
    expect(parts(EXIT_SHAPES.mural()).has(EXIT_PARTS.MURAL)).toBe(true);
    expect(parts(EXIT_SHAPES.mural()).has(EXIT_PARTS.VAULT)).toBe(false);
  });
});

describe('지하철 출구 모형', () => {
  it('모양마다 그 모양의 부품만 있다', () => {
    const P = EXIT_PARTS;
    expect(parts(EXIT_SHAPES.open()).has(P.ROOF)).toBe(false);
    expect(parts(EXIT_SHAPES.open()).has(P.GLASS)).toBe(false);
    expect(parts(EXIT_SHAPES.old()).has(P.ROOF)).toBe(true);
    expect(parts(EXIT_SHAPES.old()).has(P.GLASS)).toBe(false);
    expect(parts(EXIT_SHAPES.vault()).has(P.VAULT)).toBe(true);
    expect(parts(EXIT_SHAPES.vault()).has(P.ROOF)).toBe(false);
    expect(parts(EXIT_SHAPES.box()).has(P.ROOF)).toBe(true);
    expect(parts(EXIT_SHAPES.box()).has(P.GLASS)).toBe(true);
    expect(parts(EXIT_SHAPES.slim()).has(P.SLOPE)).toBe(true);
    expect(parts(EXIT_SHAPES.kiosk()).has(P.KIOSK)).toBe(true);
    expect(parts(EXIT_SHAPES.grand()).has(P.VAULT)).toBe(true);
  });
  it('모양마다 정점은 1,500개 안이다', () => {
    for (const k of Object.keys(EXIT_SHAPES) as (keyof typeof EXIT_SHAPES)[]) expect(EXIT_SHAPES[k]().attributes.position.count, k).toBeLessThan(1500);
  });
});

/** 가운데 (cx, cz), 방향 a, 길이 l, 폭 w 인 직사각형 건물 */
const rect = (cx: number, cz: number, a: number, l: number, w: number, h = 4): Building => {
  const [ux, uz] = [Math.cos(a), Math.sin(a)];
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([i, j]) => [cx + (ux * i * l - uz * j * w) / 2, cz + (uz * i * l + ux * j * w) / 2]);
  return { h, lm: 0, pts: Float32Array.from(pts) };
};
const inPoly = (x: number, z: number, p: Float32Array) => {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if (p[i + 1] > z !== p[j + 1] > z && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  return c;
};

describe('출구 자리 맞추기', () => {
  it('출구 점에 붙은 작은 건물(출구 지붕 외곽선)로 출구 자리·방향·길이를 정하고 그 건물은 지운다', () => {
    const a = Math.PI / 6;
    const exit: Exit = { st: '합정', x: 100 - Math.cos(a) * 4, z: 50 - Math.sin(a) * 4, ref: '2', yaw: a + 0.4 };
    const b = { buildings: [rect(100, 50, a, 9.6, 4.2), rect(100, 70, 0, 30, 20, 30)], exits: [exit], roads: [] } as unknown as Board;
    fitExits(b);
    expect(b.buildings).toHaveLength(1);
    expect(b.buildings[0].h).toBe(30);
    expect(exit.yaw).toBeCloseTo(a, 5);
    expect(exit.len).toBeCloseTo(9.6, 5);
    // 계단 입구(출구 점)는 외곽선 한쪽 끝: 가운데에서 거꾸로 길이 절반
    expect(Math.hypot(exit.x + Math.cos(a) * 4.8 - 100, exit.z + Math.sin(a) * 4.8 - 50)).toBeLessThan(1e-4);
  });
  it('외곽선이 없는 출구는 그대로 두고, 큰 건물은 출구 지붕으로 보지 않는다', () => {
    const exit: Exit = { st: '합정', x: 0, z: 0, ref: '1', yaw: 0 };
    const b = { buildings: [rect(0, 12, 0, 30, 15, 20)], exits: [exit], roads: [] } as unknown as Board;
    fitExits(b);
    expect(b.buildings).toHaveLength(1);
    expect(exit).toMatchObject({ x: 0, z: 0, yaw: 0 });
    expect(exit.len).toBeUndefined();
  });
  it('구운 판: 출구 모형 외곽(지붕 끝·입구 계단·폴사인까지)이 49곳 모두 찻길 가장자리 안쪽(보도 쪽)에 있다', () => {
    const out: string[] = [];
    for (const e of board.exits.filter((e) => e.ref)) {
      const on = exitOutline(e, exitLook(e.st, e.ref)).filter(([x, z]) => onRoad(x, z, board.roads));
      if (on.length) out.push(`${e.st}${e.ref} ${on.length}점`);
    }
    expect(out, out.join(', ')).toHaveLength(0);
  });
  it('구운 판: 출구 모형 자리에 건물과 찻길이 거의 없고, 출구 지붕 외곽선 26곳으로 자리를 맞췄다', () => {
    let bad = 0;
    const where: string[] = [];
    for (const e of board.exits.filter((e) => e.ref)) {
      const lk = exitLook(e.st, e.ref);
      const { cx, cz, len: L } = exitBody(e, lk.l);
      const W = Math.max(2, lk.w) + 0.7;
      const [ux, uz] = [Math.cos(e.yaw), Math.sin(e.yaw)];
      let n = 0;
      let hit = 0;
      for (let i = -0.4; i <= 0.41; i += 0.1)
        for (let j = -0.4; j <= 0.41; j += 0.2) {
          n++;
          const x = cx + ux * i * L - uz * j * W;
          const z = cz + uz * i * L + ux * j * W;
          const inB = board.buildings.some((B) => inPoly(x, z, B.pts));
          const onR = board.roads.some((r) => {
            if (r.cls > 5 || r.bridge) return false;
            let s = 0;
            for (let k = 0; k + 3 < r.p.length; k += 3) {
              const [ax, az, dx, dz] = [r.p[k], r.p[k + 2], r.p[k + 3] - r.p[k], r.p[k + 5] - r.p[k + 2]];
              const len = Math.hypot(dx, dz);
              const t = ((x - ax) * dx + (z - az) * dz) / (len || 1);
              const c = ((x - ax) * -dz + (z - az) * dx) / (len || 1);
              if (len > 1e-3 && t >= 0 && t <= len && Math.abs(c) < curbAt(r, s + t, Math.sign(c) || 1)) return true;
              s += len;
            }
            return false;
          });
          if (inB || onR) hit++;
        }
      // 건물에 붙은 출구(홍대입구 5·7)는 건물과 겹쳐도 된다
      if (!lk.attached && hit / n > 0.1) {
        bad++;
        where.push(`${e.st}${e.ref} ${hit}/${n}`);
      }
    }
    expect(where, where.join(', ')).toHaveLength(0);
    expect(board.exits.filter((e) => e.len)).toHaveLength(26);
    expect(bad).toBe(0);
  });
});

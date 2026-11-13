import { describe, expect, it } from 'vitest';
import { makeCatReactor } from '../src/sim/catReact.ts';
import { CAT_SPOTS, catAt, catName, makeCats, SLOT, type CatState } from '../src/sim/cats.ts';
import { buildWalkGraph } from '../src/sim/graph.ts';
import { road } from './helpers.ts';

// 판 전체에 50m 간격 골목 격자를 깐 시험용 그래프
const grid = () => {
  const out = [];
  for (let k = -2000; k <= 2000; k += 50)
    for (let j = -2000; j < 2000; j += 50) {
      out.push(road([[j, k], [j + 50, k]], { cls: 4, lanes: 1 }), road([[k, j], [k, j + 50]], { cls: 4, lanes: 1 }));
    }
  return buildWalkGraph(out);
};
const building = (x: number, z: number) => ({ h: 9, lm: 0, pts: Float32Array.from([x - 5, z - 5, x + 5, z - 5, x + 5, z + 5, x - 5, z + 5]) });
const cats = makeCats(CAT_SPOTS, grid(), CAT_SPOTS.map((s) => building(s.x + 12, s.z + 12)));
const sec = (t: number) => ({ tod: ((t % 86400) + 86400) % 86400, dow: 2, doy: 317 });
const home = (s: CatState, c: (typeof cats)[number]) => Math.hypot(s.x - c.loaf[0], s.z - c.loaf[1]);

const STATUSES = [
  '식빵 굽는 중',
  '낮잠 중',
  '그루밍 중',
  '급식소로 가는 중',
  '급식소에서 밥 먹는 중',
  '물 마시는 중',
  '집으로 돌아가는 중',
  '영역 순찰 중',
  '주변을 살피는 중',
  '친구 고양이에게 가는 중',
  '친구 고양이와 장난치는 중',
  '쉬는 중',
];

describe('길고양이 일정', () => {
  it('18마리, 네 가지 색, 두 가지 성격, 이름은 "{동} {색}냥"이고 겹치지 않는다', () => {
    expect(cats.length).toBe(18);
    expect(new Set(cats.map((c) => c.coat)).size).toBe(4);
    expect(new Set(cats.map((c) => c.personality))).toEqual(new Set(['shy', 'friendly']));
    const names = cats.map(catName);
    expect(new Set(names).size).toBe(18);
    for (const n of names) expect(n).toMatch(/^\S+ (치즈|삼색|고등어|턱시도)냥$/);
  });
  it('쉬는 자리는 가장 가까운 건물의 남쪽 벽 바로 밖이다', () => {
    const c = cats[0];
    expect(c.loaf[1]).toBeGreaterThan(CAT_SPOTS[0].z + 17);
    expect(c.loaf[1]).toBeLessThan(CAT_SPOTS[0].z + 19);
  });
  it('30분 칸이 바뀌는 순간에는 모두 쉬는 자리에 있다', () => {
    for (const c of cats) for (let k = 0; k < 48; k += 5) expect(home(catAt(c, sec(k * SLOT)), c)).toBeLessThan(0.01);
  });
  it('한낮에는 대부분 쉬는 자리에서 쉰다', () => {
    let resting = 0;
    for (let k = 0; k < 6; k++) for (const c of cats) if (home(catAt(c, sec(12 * 3600 + k * 600 + 300)), c) < 0.01) resting++;
    expect(resting).toBeGreaterThan(18 * 6 * 0.6);
  });
  it('밤에는 급식소에서 밥을 먹고, 친구와 만나 함께 논다', () => {
    let ate = false;
    let played = false;
    for (let t = 20 * 3600; t < 30 * 3600; t += 20)
      for (const c of cats) {
        const s = catAt(c, sec(t));
        if (s.status === '급식소에서 밥 먹는 중') {
          ate = true;
          expect(Math.hypot(s.x - c.feed!.at[0], s.z - c.feed!.at[1])).toBeLessThan(2);
        }
        if (s.status === '친구 고양이와 장난치는 중') {
          played = true;
          const b = catAt(cats[c.buddy], sec(t));
          expect(b.status).toBe('친구 고양이와 장난치는 중');
          expect(Math.hypot(s.x - b.x, s.z - b.z)).toBeLessThan(2.5);
        }
      }
    expect(ate).toBe(true);
    expect(played).toBe(true);
  });
  it('상태는 정해진 말 가운데 하나이고, 같은 시각은 같은 결과, 1초에 1.5m 넘게 움직이지 않는다', () => {
    for (const c of cats)
      for (let t = 0; t < 86400; t += 997) {
        const a = catAt(c, sec(t));
        expect(STATUSES).toContain(a.status);
        expect(catAt(c, sec(t))).toEqual(a);
        const b = catAt(c, sec(t + 1));
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1.5);
      }
  });
});

describe('사람에 대한 반응', () => {
  const shy = cats.find((c) => c.personality === 'shy')!;
  const friendly = cats.find((c) => c.personality === 'friendly')!;
  const walkersAt = (pts: [number, number][]) => ({
    n: pts.length,
    x: Float32Array.from(pts.map((p) => p[0])),
    z: Float32Array.from(pts.map((p) => p[1])),
    id: Int32Array.from(pts.map((_, i) => 100 + i)),
    fade: new Float32Array(pts.length).fill(1),
  });
  const base = (c: (typeof cats)[number]): CatState => ({ x: c.loaf[0], z: c.loaf[1], yaw: 0, walk: 0, pose: 0, status: '낮잠 중', alpha: 1 });

  it('경계심 많은 고양이는 사람이 다가오면 숨었다가, 사람이 떠나면 제자리에 다시 나타난다', () => {
    const r = makeCatReactor(cats);
    const states = cats.map(base);
    const near = walkersAt([[shy.loaf[0] + 3, shy.loaf[1]]]);
    let out = states;
    for (let k = 0; k < 30; k++) out = r.step(0.1, states, near, () => {});
    expect(out[shy.id].alpha).toBeLessThan(0.3);
    const none = walkersAt([]);
    for (let k = 0; k < 250; k++) out = r.step(0.1, states, none, () => {});
    expect(out[shy.id].alpha).toBeGreaterThan(0.95);
    expect(Math.hypot(out[shy.id].x - shy.loaf[0], out[shy.id].z - shy.loaf[1])).toBeLessThan(0.5);
  });

  it('개냥이는 사람에게 다가가고, 그 사람을 멈춰 세워 구경하게 한다', () => {
    const r = makeCatReactor(cats);
    const states = cats.map(base);
    const p: [number, number] = [friendly.loaf[0] + 7, friendly.loaf[1]];
    const holds: number[] = [];
    let out = states;
    for (let k = 0; k < 120; k++) out = r.step(0.1, states, walkersAt([p]), (id) => holds.push(id));
    expect(holds).toEqual([100]);
    expect(Math.hypot(out[friendly.id].x - p[0], out[friendly.id].z - p[1])).toBeLessThan(1.3);
    expect(out[friendly.id].status).toContain('다가가');
  });

  it('개냥이는 한 번 놀고 나면 한동안 다시 다가가지 않는다', () => {
    const r = makeCatReactor(cats);
    const states = cats.map(base);
    const p: [number, number] = [friendly.loaf[0] + 7, friendly.loaf[1]];
    let holds = 0;
    for (let k = 0; k < 700; k++) r.step(0.1, states, walkersAt([p]), () => holds++);
    expect(holds).toBe(1);
  });
});

import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { makePeople, PASS_D } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { runW31, type W31Res } from './w31-run.ts';

// 재작업 W31(설계 mapo-w31-people-design.md 4절 S1): 사람 이동을 한 차림(w31-run.ts)으로 잰다. 고치기 전 값은 아래 AVG 에 있다.
// 목표(설계 2-4절 6번): 맴돌기 3,000명당 15 아래, 10초 3m 흐름 70% 이상(S4·S5 75%), 20초 정체 2% 아래, 되돌아감 0.
// 상한·하한은 고칠 때마다 측정값으로 좁히기만 한다.
const read = (f: string) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), 'utf8'));

// ── Y 갈림 맞흐름 ──
// 어울마당로 Y 갈림 칸(x 400~420, z −440~−420): 6~8m 폭 띠가 (417, −440)에서 (410, −420)으로 지나고 서쪽으로 1~2m 띠 두 줄이 붙는다.
// 맴돈 사람·막힌 사람의 23~49% 가 이 한 칸에 몰렸다(설계 1-2절). 칸 양쪽 끝 바깥에 20명씩 놓고 맞은편으로 걷게 해 60초 안에 모두 칸을 지나는지 본다
// (차·다른 사람 없음, 실제 그물·걷는 면). 남쪽에서 온 사람은 z −418 을 넘으면, 북쪽에서 온 사람은 z −442 아래로 가면 지난 것이다.
describe('W31 Y 갈림 맞흐름(어울마당로 400~420, −440~−420)', () => {
  const board = decodeBoard(read('board.json'));
  const W = decodeWalk(read('walk.json') as WalkJson);
  let passed = 0;
  let placed = 0;
  const overlap: string[] = [];
  const stuck: string[] = [];
  beforeAll(() => {
    const p = makePeople(W, [], makeSimProvider(), 11, 200, { buildings: board.buildings });
    const unit = (x: number, z: number): [number, number] => [x / Math.hypot(x, z), z / Math.hypot(x, z)];
    // 띠 축: 남쪽 끝 (417, −440)에서 남동쪽 (436, −458) 으로, 북쪽 끝 (410, −420)에서 북쪽 (406, −400) 으로
    const S = unit(436 - 417, -458 + 440);
    const N = unit(406 - 410, -400 + 420);
    const south = new Set<number>();
    const north = new Set<number>();
    const fill = (ox: number, oz: number, d: [number, number], gx: number, gz: number, into: Set<number>) => {
      for (let r = 0; r < 12 && into.size < 20; r++)
        for (let c = -4; c <= 4 && into.size < 20; c++) {
          const id = p.put(ox + d[0] * (3 + r * 0.95) - d[1] * c * 0.95, oz + d[1] * (3 + r * 0.95) + d[0] * c * 0.95, gx, gz);
          if (id >= 0) into.add(id);
        }
    };
    // 가는 곳은 300m 너머(돌아다니는 사람의 먼 자리)
    fill(417, -440, S, 410 + N[0] * 300, -420 + N[1] * 300, south);
    fill(410, -420, N, 417 + S[0] * 300, -440 + S[1] * 300, north);
    placed = south.size + north.size;
    const done = new Set<number>();
    const now = { tod: 21 * 3600, dow: 6, doy: 320 };
    for (let f = 0; f < 60 * 30; f++) {
      now.tod += 1 / 30;
      p.step(1 / 30, now, false);
      const w = p.w;
      for (let i = 0; i < w.n; i++) {
        const id = w.id[i];
        if ((south.has(id) && w.z[i] > -418) || (north.has(id) && w.z[i] < -442)) done.add(id);
        for (let j = i + 1; j < w.n; j++) if (Math.hypot(w.x[j] - w.x[i], w.z[j] - w.z[i]) < PASS_D - 0.01 && overlap.length < 10) overlap.push(`${id}-${w.id[j]} f${f}`);
      }
    }
    passed = done.size;
    for (let i = 0; i < p.w.n; i++) if (!done.has(p.w.id[i])) stuck.push(`${p.w.id[i]}@${p.w.x[i].toFixed(1)},${p.w.z[i].toFixed(1)}`);
  }, 60_000);
  it('양쪽에 20명씩 놓았다', () => expect(placed).toBe(40));
  it('몸통 겹침 0', () => expect(overlap).toEqual([]));
  // 지금 코드(HEAD ccf21040)는 40명 가운데 22명만 지난다: 마주 선 무리가 칸 북쪽 끝(406, −417)에서 20초씩 서 있다 돌아서고,
  // 남쪽 무리 몇은 갈래 노드에서 붐빔을 피해 남동쪽 71m 선으로 되돌아간다. S4(갈래 영역 입장 게이트)에서 통과해야 하며, 통과하면 it.fails 를 it 으로 바꾼다
  it.fails('60초 안에 40명 모두 칸을 지난다(S4 전까지는 실패가 맞다)', () => expect(passed, stuck.join(' ')).toBe(40));
});

// ── 한 차림 측정 ──
// 한 판 값은 씨앗마다 ±30% 흔들려(W33: 같은 변형 안에서 맴돌기 131~254) 작은 고침도 어느 씨앗에서든 상한을 넘긴다. 0 규칙은 판마다 보고,
// 맴돌기·10초 흐름·20초 정체는 차림마다 씨앗 셋(11·12·13)의 평균으로 본다(W34)
const SEEDS = [11, 12, 13];
// [이름, 요일, 시, 보는 곳 x, z]
const SETUPS: [string, number, number, number, number][] = [
  ['홍대 토 21시', 6, 21, 330, -300],
  ['홍대 화 15시', 2, 15, 330, -300],
  ['클럽거리 토 21시', 6, 21, 290, 40],
  ['걷고싶은거리 토 21시', 6, 21, 330, -350],
  ['연트럴파크 토 21시', 6, 21, 380, -1110],
];
const CASES = SETUPS.flatMap(([name, dow, hour, fx, fz]) => SEEDS.map((seed) => [name, seed, dow, hour, fx, fz] as [string, number, number, number, number, number]));
const runs = new Map<string, W31Res>();
const res = (name: string, seed: number) => {
  const [, dow, hour, fx, fz] = SETUPS.find((s) => s[0] === name)!;
  const key = `${name}/${seed}`;
  return runs.get(key) ?? runs.set(key, runW31(seed, dow, hour, fx, fz)).get(key)!;
};
// 차림마다 씨앗 11·12·13 평균의 상한·하한 [맴돌기 3,000명당, 10초 3m 흐름, 20초 정체]. 고칠 때마다 측정값으로 좁히기만 한다.
// 값 = HEAD 10b21892 평균(2026-11-18 01:16) ± 세 씨앗 평균의 표준오차(차림 안 씨앗 사이 표준편차를 다섯 차림으로 모아 √3 으로 나눔:
// 맴돌기 10.5, 흐름 0.67%p, 정체 0.47%p). 평균과 똑같은 상한은 사람 코드와 관계없는 차 고침(W32)만으로도 깨졌다(홍대 토21 흐름 75.80 → 75.66%).
// 목표(설계 2-4절 6번): 맴돌기 15 아래, 10초 흐름 70% 이상(S4·S5 75%), 20초 정체 2% 아래
const SE: [number, number, number] = [10.5, 0.0067, 0.0047];
const AVG: Record<string, [number, number, number]> = Object.fromEntries(
  (
    [
      // HEAD 10b21892 평균: 맴돌기, 10초 흐름, 20초 정체
      ['홍대 토 21시', 165.7, 0.7567, 0.1076],
      ['홍대 화 15시', 163.6, 0.7653, 0.101],
      ['클럽거리 토 21시', 176.7, 0.7783, 0.0868],
      ['걷고싶은거리 토 21시', 161.0, 0.7723, 0.0922],
      ['연트럴파크 토 21시', 147.3, 0.8033, 0.081],
    ] as [string, number, number, number][]
  ).map(([k, p, f, s]) => [k, [+(p + SE[0]).toFixed(1), +(f - SE[1]).toFixed(4), +(s + SE[2]).toFixed(4)]]),
);
/** 되돌아감 상한(차림마다 씨앗 평균. 목표 0: S5 에서 도착 문까지 정한 길을 따라가면 0 을 요구한다). 한 판 값은 0~5명으로 흔들린다(HEAD 48efa3c7 홍대 화 15시 씨앗 11 이 5) */
const BACK_MAX = 4;
// 알려진 실패(고치기 전 HEAD 결함): 클럽거리 토 21시 씨앗 12 는 미리 돌리기에서 두 사람(0.32m)이 겹친 채 시작한다. 미리 돌리기 2초 걸음에서
// 겹침 확인 격자가 단계 처음 자리라 먼저 2~3m 옮긴 사람을 못 찾는다. 미리 돌리기를 바꾸는 S7(길 위에 놓고 10초)에서 함께 고친다. 고쳐지면 이 목록에서 뺀다
const KNOWN_OVERLAP = new Set(['클럽거리 토 21시/12']);

describe.each(CASES)('W31 한 차림: %s(씨앗 %i)', (name, seed) => {
  let R: W31Res;
  beforeAll(() => {
    R = res(name, seed);
  }, 400_000);
  it('사람이 있다', () => expect(R.people).toBeGreaterThan(1500));
  it('출구·정류장·문 밖에서 생기거나 사라짐 0', () => expect([...R.born, ...R.gone]).toEqual([]));
  (KNOWN_OVERLAP.has(`${name}/${seed}`) ? it.fails : it)('몸통 겹침 0', () => expect(R.overlap).toEqual([]));
  it('찻길 면 안 자리 0', () => expect(R.road).toEqual([]));
  it('한 프레임 1m 넘는 이동 0', () => expect(R.jump).toEqual([]));
});

describe.each(SETUPS)('W31 한 차림 씨앗 평균: %s', (name) => {
  const [paceMax, flowMin, stillMax] = AVG[name];
  let rs: W31Res[];
  beforeAll(() => {
    rs = SEEDS.map((seed) => res(name, seed));
  }, 1_200_000);
  const avg = (f: (R: W31Res) => number) => rs.reduce((a, R) => a + f(R), 0) / rs.length;
  it(`맴돌기 3,000명당 평균 ${paceMax} 아래`, () => expect(avg((R) => (R.pace.length * 3000) / R.people)).toBeLessThanOrEqual(paceMax));
  it(`10초 3m 흐름 평균 ${(flowMin * 100).toFixed(1)}% 이상`, () => expect(avg((R) => R.flow10[0] / R.flow10[1])).toBeGreaterThanOrEqual(flowMin));
  it(`20초 정체 평균 ${(stillMax * 100).toFixed(2)}% 아래`, () => expect(avg((R) => R.still20[0] / R.still20[1])).toBeLessThanOrEqual(stillMax));
  it(`되돌아감 평균 ${BACK_MAX}명 아래`, () => expect(avg((R) => R.back.length), rs.flatMap((R) => R.back).join('\n')).toBeLessThanOrEqual(BACK_MAX));
});

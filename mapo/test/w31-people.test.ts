import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { makePeople, PASS_D } from '../src/sim/people/index.ts';
import { makeSimProvider } from '../src/sim/provider.ts';
import { decodeWalk, type WalkJson } from '../src/sim/walknet.ts';
import { describeW31 } from './w31-cases.ts';

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
  // S4(W36) 전 코드(HEAD 480ab5da)는 40명 가운데 27명만 지났다(put 이 걷는 길 밖에도 놓던 때는 22명: 길 밖에 놓인 북쪽 무리가 60초 내내 서 있었다).
  // 남쪽 무리는 갈래 노드에서 북쪽 무리와 마주쳐 20초 막힌 뒤 돌아서 되돌아갔고, 북쪽 무리 셋은 북쪽으로 되돌아갔다. 갈래 영역 입장 게이트(junction.ts) 뒤 40명 모두 지난다
  it('60초 안에 40명 모두 칸을 지난다', () => expect(passed, stuck.join(' ')).toBe(40));
});

// 한 차림 측정(w31-cases.ts): 이 파일은 홍대 토 21시, w31-people2~5 가 홍대 화 15시·클럽거리·걷고싶은거리·연트럴파크
describeW31(['홍대 토 21시']);

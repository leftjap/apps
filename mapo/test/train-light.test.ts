import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard } from '../src/data/board.ts';
import { makeLiveSubway } from '../src/data/subway.ts';
import { cumLen } from '../src/poly.ts';
import { findPortals } from '../src/render/rails.ts';
import { CAR_PITCH, carPoses, carSpans, exitFlash, GAP_M, GAP_MAX, GAP_PX, lightLen, makeTrack, poolLevel, portalRamp } from '../src/render/trainLight.ts';
import { arrivals, DWELL, makeProfile, trainsAt, type LineDef } from '../src/sim/trains.ts';

// 지하 열차는 땅 위에 노선 색 빛으로 그린다: 칸마다 나뉜 띠, 머리 쪽이 조금 더 밝고, 역에 서면 승강장 길이만큼 빛이 고이고,
// 그 역 출구 지붕이 사람들이 나오는 때(열차가 서는 순간) 잠깐 밝아진다
const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));

describe('칸 나누기', () => {
  it('노선마다 실제 편성 칸 수: 2호선 10칸, 6호선 8칸, 경의중앙선(용산선 구간 본선) 8칸, 공항철도 일반열차 6칸', () => {
    const cars = Object.fromEntries(board.lines.map((l) => [l.id, l.cars]));
    expect(cars).toEqual({ '2': 10, '6': 8, K: 8, A: 6 });
  });

  it('칸 수만큼 20m 간격으로 놓이고, 열차 가운데가 열차 위치(s)다', () => {
    for (const n of [10, 8, 6]) {
      const cs = carSpans(n, 1000, 0);
      expect(cs).toHaveLength(n);
      const ss = cs.map((c) => c.s).sort((a, b) => a - b);
      for (let i = 1; i < n; i++) expect(ss[i] - ss[i - 1]).toBeCloseTo(CAR_PITCH, 6);
      expect(ss.reduce((a, b) => a + b, 0) / n).toBeCloseTo(1000, 6);
    }
  });

  it('맨 앞 칸(k=0)이 진행 방향 끝에 있고 가장 밝으며, 뒤로 갈수록 어두워진다', () => {
    for (const dir of [0, 1] as const) {
      const cs = carSpans(8, 500, dir);
      const head = cs[0];
      const ahead = dir ? -1 : 1;
      for (const c of cs.slice(1)) expect((head.s - c.s) * ahead).toBeGreaterThan(0);
      expect(head.light).toBe(1);
      for (let k = 1; k < cs.length; k++) expect(cs[k].light).toBeLessThan(cs[k - 1].light);
      expect(cs[cs.length - 1].light).toBeGreaterThan(0.5);
    }
  });

  it('칸 사이에 틈이 남는다: 가까이서는 1.5m, 멀리서는 3픽셀(칸 간격의 40% 까지)', () => {
    expect(CAR_PITCH - lightLen(0.01)).toBeCloseTo(GAP_M, 6);
    for (const mPerPx of [0.5, 1, 2]) expect(CAR_PITCH - lightLen(mPerPx)).toBeCloseTo(Math.max(GAP_M, GAP_PX * mPerPx), 6);
    for (const mPerPx of [3.2, 4, 8]) {
      expect(CAR_PITCH - lightLen(mPerPx)).toBeCloseTo(GAP_MAX * CAR_PITCH, 6);
      expect(lightLen(mPerPx)).toBeGreaterThanOrEqual(CAR_PITCH * 0.6 - 1e-9);
    }
  });

  it('역에 선 열차의 칸은 모두 역 가운데에서 편성 길이의 절반 안에 있다(승강장 안)', () => {
    for (const l of board.lines)
      for (const s of l.stops) for (const c of carSpans(l.cars, s, 0)) expect(Math.abs(c.s - s)).toBeLessThanOrEqual((l.cars * CAR_PITCH) / 2);
  });
});

describe('역 정차 중 빛', () => {
  it('달리는 열차(at < 0)에는 고이지 않고, 서 있는 동안 차올랐다가 떠나기 전에 사그라든다', () => {
    expect(poolLevel(-1)).toBe(0);
    expect(poolLevel(0)).toBeLessThan(0.1);
    for (const t of [4, 10, 18]) expect(poolLevel(t)).toBe(1);
    expect(poolLevel(DWELL)).toBe(0);
    expect(poolLevel(DWELL - 1)).toBeLessThan(poolLevel(DWELL - 3));
    expect(poolLevel(1)).toBeLessThan(poolLevel(2));
  });

  it('시간표 열차: 역에 서 있는 동안만 at 이 0~25초이고, 그때 열차 위치는 역 자리다', () => {
    const p = Float32Array.from([0, 0, 0, 4000, 0, 0]);
    const l: LineDef = { id: '2', name: '2', color: '#0f0', cars: 10, carLen: 20, p, cum: cumLen(p), stops: [1000, 2600], stopNames: ['가', '나'] };
    let dwelling = 0;
    for (let t = 14 * 3600; t < 14 * 3600 + 900; t += 1)
      for (const tp of trainsAt([l], t)) {
        if (tp.at >= 0) {
          dwelling++;
          expect(tp.at).toBeLessThan(DWELL);
          expect(l.stops.some((s) => Math.abs(s - tp.s) < 1e-6)).toBe(true);
        } else expect(tp.at).toBe(-1);
      }
    expect(dwelling).toBeGreaterThan(0);
  });

  it('실시간 열차도 같은 값: 도착 상태로 받으면 정차 중(at ≥ 0), 떠나면 −1', () => {
    const p = Float32Array.from([0, 0, 0, 5000, 0, 0]);
    const l: LineDef = { id: '2', name: '2호선', color: '#3a3', cars: 10, carLen: 20, p, cum: cumLen(p), stops: [1540, 2723, 4079], stopNames: ['합정', '홍대입구', '신촌'] };
    const T0 = Date.parse('2026-11-14T23:00:00+09:00');
    const sub = makeLiveSubway([l]);
    sub.set([{ line: '2', no: '2101', stn: '홍대입구', updn: '0', st: '1', rcv: T0 }], T0);
    const at0 = sub.positions()[0].at;
    expect(at0).toBeGreaterThanOrEqual(0);
    expect(at0).toBeLessThan(DWELL);
    for (let k = 0; k < 300; k++) sub.step(0.1);
    expect(sub.positions()[0].at).toBe(-1);
  });
});

describe('출구 지붕이 밝아지는 시점', () => {
  it('열차가 서는 순간(사람이 출구로 나오는 때) 바로 밝아졌다가 2초 안에 꺼진다', () => {
    expect(exitFlash(-0.1)).toBe(0);
    expect(Math.max(...[0.05, 0.1, 0.2, 0.3].map(exitFlash))).toBeGreaterThan(0.9);
    expect(exitFlash(1.6)).toBeLessThan(0.05);
    expect(exitFlash(2)).toBe(0);
    for (let a = 0.3; a < 2; a += 0.1) expect(exitFlash(a + 0.1)).toBeLessThanOrEqual(exitFlash(a));
  });

  it('시간표 열차: 도착 사건이 나는 1초 동안 그 역에 막 선 열차(0 ≤ at < 1)가 있다', () => {
    let n = 0;
    for (let t = 14 * 3600; t < 14 * 3600 + 600; t++) {
      const now = trainsAt(board.lines, t);
      for (const a of arrivals(board.lines, t - 1, t)) {
        const l = board.lines.find((q) => q.id === a.line)!;
        const s = l.stops[l.stopNames.indexOf(a.name)];
        expect(now.some((tp) => tp.line === a.line && tp.dir === a.dir && tp.at >= 0 && tp.at < 1 && Math.abs(tp.s - s) < 1e-3)).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(10);
  });
});

describe('터널 입구에서 모형과 빛 잇기', () => {
  it('2호선 빛은 터널 입구에서 0, 안쪽 60m 부터 온전히 켜진다', () => {
    const l = board.lines.find((q) => q.id === '2')!;
    const ps = findPortals(l).map((p) => p.sP);
    expect(portalRamp(ps[0], ps)).toBe(0);
    expect(portalRamp(ps[0] + 30, ps)).toBeGreaterThan(0);
    expect(portalRamp(ps[0] + 30, ps)).toBeLessThan(1);
    expect(portalRamp(ps[0] + 60, ps)).toBe(1);
    expect(portalRamp(1234, [])).toBe(1);
  });
});

// 노선 꺾은선은 15m 마다 꼭짓점이 있고 한 꼭짓점에서 최대 16.5° 꺾인다. 칸을 그 꺾은선 위에 놓으면 꼭짓점을 지나는 순간 방향이 한 번에 바뀌어 끊겨 보인다
describe('커브에서 칸 놓기', () => {
  const LEN = CAR_PITCH - GAP_M;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  for (const l of board.lines)
    for (const dir of [0, 1] as const)
      it(`${l.name} 방향 ${dir}: 1/60초마다 움직여도 머리 칸 이동 거리가 고르고(최대/평균 < 1.2), 방향이 한 걸음에 2° 넘게 바뀌지 않고, 칸 사이 틈이 ${GAP_M}±0.2m`, () => {
        const len = l.cum[l.cum.length - 1];
        const tr = makeTrack(l.p, l.cum, dir ? -2.3 : 2.3);
        const stops = dir ? l.stops.map((s) => len - s).reverse() : l.stops;
        const pr = makeProfile(len, stops);
        const fwd = dir ? -1 : 1;
        let prev: ReturnType<typeof carPoses> | null = null;
        let prevS = 0;
        const ratios: number[] = [];
        let maxTurn = 0;
        let gMin = Infinity;
        let gMax = -Infinity;
        for (let t = 0; t <= pr.dur; t += 1 / 60) {
          const s = dir ? len - pr.distAt(t) : pr.distAt(t);
          const ps = carPoses(tr, l.cars, s, dir);
          for (let k = 0; k + 1 < ps.length; k++) {
            const a = ps[k];
            const b = ps[k + 1];
            if (!a || !b) continue;
            const ux = (Math.cos(a.yaw) + Math.cos(b.yaw)) * fwd;
            const uz = (Math.sin(a.yaw) + Math.sin(b.yaw)) * fwd;
            const rx = a.x - Math.cos(a.yaw) * fwd * (LEN / 2) - (b.x + Math.cos(b.yaw) * fwd * (LEN / 2));
            const rz = a.z - Math.sin(a.yaw) * fwd * (LEN / 2) - (b.z + Math.sin(b.yaw) * fwd * (LEN / 2));
            const g = (rx * ux + rz * uz) / Math.hypot(ux, uz);
            gMin = Math.min(gMin, g);
            gMax = Math.max(gMax, g);
          }
          const ds = Math.abs(s - prevS);
          if (prev && ps[0] && prev[0] && ds > 0.05) ratios.push(Math.hypot(ps[0].x - prev[0].x, ps[0].z - prev[0].z) / ds);
          if (prev && ds > 0.01) ps.forEach((p, k) => p && prev![k] && (maxTurn = Math.max(maxTurn, Math.abs(wrap(p.yaw - prev![k]!.yaw)))));
          prev = ps;
          prevS = s;
        }
        const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        expect(Math.max(...ratios) / mean).toBeLessThan(1.2);
        expect((maxTurn * 180) / Math.PI).toBeLessThan(2);
        expect(gMin).toBeGreaterThan(GAP_M - 0.2);
        expect(gMax).toBeLessThan(GAP_M + 0.2);
      });

  it('곧은 선에서는 칸이 선 위(방향별 선로 2.3m 옆)에 20m 간격으로 놓이고, 열차 가운데가 s 다', () => {
    const p = Float32Array.from([0, 0, 0, 1000, 0, 0]);
    const ps = carPoses(makeTrack(p, cumLen(p), 2.3), 10, 500, 0);
    const xs = ps.map((c) => c!.x);
    expect(xs.reduce((a, b) => a + b, 0) / 10).toBeCloseTo(500, 3);
    for (let i = 1; i < 10; i++) expect(xs[i - 1] - xs[i]).toBeCloseTo(CAR_PITCH, 3);
    for (const c of ps) expect(c!.z).toBeCloseTo(2.3, 3), expect(c!.yaw).toBeCloseTo(0, 6), expect(c!.s).toBeCloseTo(c!.x, 3);
    // 가운데가 노선 밖으로 나간 칸(−60·−40·−20m)은 놓지 않고, 가장자리에 걸친 칸(0m)도 제 길이로 놓는다
    const edge = carPoses(makeTrack(p, cumLen(p), 2.3), 10, 30, 0);
    expect(edge.filter((c) => !c)).toHaveLength(3);
    expect(edge[6]!.x).toBeCloseTo(0, 3);
  });
});

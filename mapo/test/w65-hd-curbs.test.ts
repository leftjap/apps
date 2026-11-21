// 찻길 면 가장자리가 측량 연석(국토지리정보원 정밀도로지도, 2023 MMS 측량 ±0.25m)에 놓인다(재작업 W65, 판 전체, 정적).
// 서울시 연석 쪽 선(009 등)은 측량 연석과 중앙값 0.46m 로 맞지만 13% 는 1.2m 넘게 어긋나고(합정 월드컵로는 1.4~2.3m 서쪽),
// 찻길 면이 그 선을 따라가 실제 연석보다 찻길이 넓거나 좁게 그려진 자리를 센다.
// 정밀도로지도는 신청·보안서약 뒤 받는 자료라 커밋하지 않는다(tools/raw/ngii/hd-lines.json, tmp/hdmap/extract.py 로 뽑음). 없으면 건너뛴다.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groundQuery } from '../src/data/offroad.ts';
import { decodeMarks, type MarksJson } from '../src/data/marks.ts';
import { loadHdCurbs } from '../tools/road/hdcurbs.ts';
import { eachLanePoint, load } from './w48-stage2.ts';
import { RIGHT } from '../src/sim/intersection/build.ts';
import { groundTilesOf } from './w57-stage1.ts';

const HD = new URL('../tools/raw/ngii/hd-lines.json', import.meta.url).pathname;

/** 측량 연석(콘크리트연석)을 0.5m 로 짚어, 그린 찻길 면 경계까지 거리(0.05m 단위, 6m 까지) */
function curbOffsets() {
  const d = load();
  const q = groundQuery(groundTilesOf(d));
  const hd = JSON.parse(readFileSync(HD, 'utf8')) as Record<string, { a: Record<string, string>; p: number[] }[]>;
  const out: { x: number; z: number; d: number; on: boolean }[] = [];
  for (const [k, fs] of Object.entries(hd)) {
    if (!k.includes(':C3_')) continue;
    for (const f of fs) {
      if (f.a.Type !== '4') continue;
      for (let i = 2; i < f.p.length; i += 2) {
        const [x0, z0, x1, z1] = [f.p[i - 2], f.p[i - 1], f.p[i], f.p[i + 1]];
        const L = Math.hypot(x1 - x0, z1 - z0);
        for (let s = 0.25; s < L; s += 0.5) {
          const x = x0 + ((x1 - x0) * s) / L;
          const z = z0 + ((z1 - z0) * s) / L;
          if (Math.hypot(x, z) > 1950) continue;
          const on = q.onCar(x, z);
          let dd = 6;
          search: for (let r = 0.05; r <= 6; r += 0.05) for (let a = 0; a < 24; a++) if (q.onCar(x + Math.cos((a * Math.PI) / 12) * r, z + Math.sin((a * Math.PI) / 12) * r) !== on) { dd = r; break search; }
          out.push({ x, z, d: dd, on });
        }
      }
    }
  }
  return out;
}

describe.skipIf(!existsSync(HD))('찻길 면 가장자리가 측량 연석에 놓인다(판 전체, 정적)', () => {
  const r = curbOffsets();
  const far = r.filter((s) => s.d > 1);
  const med = [...r.map((s) => s.d)].sort((a, b) => a - b)[r.length >> 1];
  console.log(`측량 연석 표본 ${r.length}(0.5m): 찻길 면 경계까지 중앙값 ${med.toFixed(2)}m, 1m 넘음 ${far.length}(${((100 * far.length) / r.length).toFixed(1)}%: 찻길이 연석 너머 ${far.filter((s) => s.on).length}, 덜 그림 ${far.filter((s) => !s.on).length})`);
  it('합정 사거리 북쪽 월드컵로(-530,170 둘레 45m)에서 측량 연석이 찻길 면 경계에서 1m 넘게 떨어지지 않는다', () => {
    const here = far.filter((s) => Math.hypot(s.x + 530, s.z - 170) < 45);
    expect(here.length * 0.5, here.slice(0, 10).map((s) => `${s.x.toFixed(0)},${s.z.toFixed(0)} ${s.d.toFixed(1)}m`).join(' ')).toBe(0);
  });
  it('판 전체에서 측량 연석이 찻길 면 경계에서 1m 넘게 떨어진 표본이 2% 아래다(측정값 1.88%, 고치기 전 20.8%)', () => {
    expect(far.length / r.length).toBeLessThan(0.02);
  });
});

const GROUND = new URL('../tools/raw/seoul-lines-ground.json', import.meta.url).pathname;
/** 굽기가 쓴 땅 위 서울시 연석 쪽 선(7·9·10·11·15)을 1m 로 짚어, 측량한 길(측량 연석 4m 안, 교량·고가 면 밖)에서 어느 측량 선과도 1m 넘게 떨어진 자리 */
function seoulCurbOff() {
  const hd = loadHdCurbs()!;
  const pts: number[] = [];
  const tag: number[] = [];
  for (const [t, ls] of [[0, hd.curbs], [1, hd.lanes]] as const)
    for (const p of ls)
      for (let i = 2; i < p.length; i += 2) {
        const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
        for (let s = 0; s <= L; s += 0.25) pts.push(p[i - 2] + ((p[i] - p[i - 2]) * s) / (L || 1), p[i - 1] + ((p[i + 1] - p[i - 1]) * s) / (L || 1)), tag.push(t);
      }
  const grid = new Map<string, number[]>();
  for (let q = 0; q < tag.length; q++) {
    const k = `${Math.floor(pts[2 * q] / 2)},${Math.floor(pts[2 * q + 1] / 2)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(q);
  }
  const near = (x: number, z: number, curbOnly: boolean, r: number) => {
    let d = Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const q of grid.get(`${Math.floor(x / 2) + i},${Math.floor(z / 2) + j}`) ?? []) if (!curbOnly || tag[q] === 0) d = Math.min(d, Math.hypot(pts[2 * q] - x, pts[2 * q + 1] - z));
    return d <= r ? d : Infinity;
  };
  const inDeck = (x: number, z: number) => hd.decks.some((r) => {
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
    return c;
  });
  const off: { x: number; z: number; k: number }[] = [];
  for (const l of decodeMarks(JSON.parse(readFileSync(GROUND, 'utf8')) as MarksJson).lines) {
    if (![7, 9, 10, 11, 15].includes(l.k)) continue;
    for (let k = 3; k < l.p.length; k += 3) {
      const [x0, z0, x1, z1] = [l.p[k - 3], l.p[k - 1], l.p[k], l.p[k + 2]];
      const L = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 0.5; s < L; s += 1) {
        const x = x0 + ((x1 - x0) * s) / L;
        const z = z0 + ((z1 - z0) * s) / L;
        if (near(x, z, true, 4) > 4 || near(x, z, false, 1.05) <= 1.05 || inDeck(x, z)) continue;
        off.push({ x, z, k: l.k });
      }
    }
  }
  return off;
}
describe.skipIf(!existsSync(HD) || !existsSync(GROUND))('서울시 연석 쪽 선이 측량 선과 어긋나지 않는다(판 전체, 정적)', () => {
  it('측량한 길에서 서울시 연석 쪽 선이 어느 측량 선과도 1m 넘게 떨어진 자리가 없다(고치기 전 약 3.4km)', () => {
    const off = seoulCurbOff();
    expect(off.length, off.slice(0, 10).map((p) => `k${p.k} ${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(' ')).toBe(0);
  });
});

/** 굽기가 쓴 땅 위 서울시 중앙선(1)·차선(6)·진로변경제한선(8)을 1m 로 짚어, 어느 측량 선과도 1m 넘게 떨어졌는데
 *  같은 종류 측량 선(중앙선은 501 4m 안, 차선·진로변경제한선은 503·506 2m 안)이 나란히(25° 안) 지나는 자리(교량·고가 면 밖) */
function seoulLaneOff() {
  const hd = JSON.parse(readFileSync(HD, 'utf8')) as Record<string, { a: Record<string, string>; p: number[] }[]>;
  const grid = new Map<string, number[]>(); // [x, z, 방향 x, 방향 z, 종류]
  for (const [key, fs] of Object.entries(hd))
    for (const f of fs) {
      const t = key.includes(':C3_') && f.a.Type === '4' ? 0 : key.includes(':B2_') && !['525', '530'].includes(f.a.Kind) ? +f.a.Kind : -1;
      if (t < 0) continue;
      const p = f.p;
      for (let i = 2; i < p.length; i += 2) {
        const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
        if (L < 1e-6) continue;
        for (let s = 0; s <= L; s += 0.25) {
          const x = p[i - 2] + ((p[i] - p[i - 2]) * s) / L;
          const z = p[i - 1] + ((p[i + 1] - p[i - 1]) * s) / L;
          const k = `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(x, z, (p[i] - p[i - 2]) / L, (p[i + 1] - p[i - 1]) / L, t);
        }
      }
    }
  const near = (x: number, z: number, ok: (t: number, dx: number, dz: number) => boolean, r: number) => {
    let d = Infinity;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const c = grid.get(`${Math.floor(x / 2) + i},${Math.floor(z / 2) + j}`);
      if (c) for (let q = 0; q < c.length; q += 5) if (ok(c[q + 4], c[q + 2], c[q + 3])) d = Math.min(d, Math.hypot(c[q] - x, c[q + 1] - z));
    }
    return d <= r ? d : Infinity;
  };
  const PAR = Math.cos((25 * Math.PI) / 180);
  const decks = loadHdCurbs()!.decks;
  const inDeck = (x: number, z: number) => decks.some((r) => {
    let c = false;
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) if (r[i + 1] > z !== r[j + 1] > z && x < ((r[j] - r[i]) * (z - r[i + 1])) / (r[j + 1] - r[i + 1]) + r[i]) c = !c;
    return c;
  });
  const off: { x: number; z: number; k: number }[] = [];
  for (const l of decodeMarks(JSON.parse(readFileSync(GROUND, 'utf8')) as MarksJson).lines) {
    if (![1, 6, 8].includes(l.k)) continue;
    const [kinds, R] = l.k === 1 ? [[501], 4] : [[503, 506], 2];
    for (let k = 3; k < l.p.length; k += 3) {
      const [x0, z0, x1, z1] = [l.p[k - 3], l.p[k - 1], l.p[k], l.p[k + 2]];
      const L = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 0.5; s < L; s += 1) {
        const x = x0 + ((x1 - x0) * s) / L;
        const z = z0 + ((z1 - z0) * s) / L;
        if (near(x, z, () => true, 1.05) <= 1.05) continue;
        if (near(x, z, (t, dx, dz) => kinds.includes(t) && Math.abs(dx * (x1 - x0) + dz * (z1 - z0)) / L >= PAR, R) > R) continue;
        if (inDeck(x, z)) continue;
        off.push({ x, z, k: l.k });
      }
    }
  }
  return off;
}
describe.skipIf(!existsSync(HD) || !existsSync(GROUND))('서울시 중앙선·차선이 측량 선과 어긋나지 않는다(판 전체, 정적)', () => {
  it('같은 종류 측량 선이 나란히 지나는 자리에서 서울시 중앙선·차선·진로변경제한선이 어느 측량 선과도 1m 넘게 떨어지지 않는다', () => {
    const off = seoulLaneOff();
    const by = (k: number) => off.filter((p) => p.k === k).length;
    // 고치기 전 5,062m. 옮긴 점 하나가 다른 측량 선으로 튀어 버려진 자리(앞뒤 점을 잇는 1m)만 남는다
    expect(off.length, `k1 ${by(1)} k6 ${by(6)} k8 ${by(8)}: ` + off.slice(0, 10).map((p) => `k${p.k} ${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(' ')).toBeLessThanOrEqual(2);
  });
});

/** 우회전 경로(땅 위 점, 0.5m 간격) 가운데 측량 연석에서 1.2m(차 몸 반폭 0.9m + 0.3m) 안에 드는 점 */
function curbTouch() {
  const hd = loadHdCurbs()!;
  const C = 2;
  const grid = new Map<number, number[]>();
  for (const c of hd.curbs)
    for (let i = 2; i < c.length; i += 2) {
      const L = Math.hypot(c[i] - c[i - 2], c[i + 1] - c[i - 1]);
      for (let s = 0; s <= L; s += 0.25) {
        const x = c[i - 2] + ((c[i] - c[i - 2]) * s) / (L || 1);
        const z = c[i - 1] + ((c[i + 1] - c[i - 1]) * s) / (L || 1);
        const k = Math.floor(x / C) * 100003 + Math.floor(z / C);
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(x, z);
      }
    }
  const touch = (x: number, z: number) => {
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const c = grid.get((Math.floor(x / C) + i) * 100003 + Math.floor(z / C) + j);
        if (c) for (let q = 0; q < c.length; q += 2) if (Math.hypot(c[q] - x, c[q + 1] - z) < 1.2) return true;
      }
    return false;
  };
  return touch;
}
function rightTurnOnCurb() {
  const d = load();
  const X = d.inter.X;
  const touch = curbTouch();
  const out: { x: number; z: number }[] = [];
  let n = 0;
  for (const [a, exs] of X.exits)
    for (let k = 0; k < exs.length; k++)
      for (let l = 0; l < d.g[a].lanes; l++) {
        const p = X.path(a, l, k);
        if (!p || p.move !== RIGHT) continue;
        n++;
        for (let i = 0; i < p.pts.length; i += 4) if (Math.abs(p.pts[i + 1]) < 0.3 && touch(p.pts[i], p.pts[i + 2])) out.push({ x: p.pts[i], z: p.pts[i + 2] });
      }
  return { n, out };
}
describe.skipIf(!existsSync(HD))('우회전 경로가 측량 모퉁이 연석 안쪽으로 돈다(판 전체, 정적)', () => {
  it('우회전 경로의 차 몸(반폭 0.9m + 0.3m)이 측량 연석에 닿는 점이 판 전체 64개 이하다', () => {
    // 고치기 전 1,143점(3차 곡선이 모퉁이를 가로질렀다). 남은 것은 경로 10개: 차로 끝 자체가 측량 연석 위에 놓인 자리와 교통섬 연석을 가로지르는 여러 구간 경로
    const { n, out } = rightTurnOnCurb();
    expect(out.length, `우회전 경로 ${n}개: ` + out.filter((_, i) => i % 10 === 0).slice(0, 12).map((p) => `${p.x.toFixed(0)},${p.z.toFixed(0)}`).join(' ')).toBeLessThanOrEqual(64);
  });
});

/** 교차로 밖 이음매 곡선(차로 수가 바뀌거나 15° 넘게 꺾인 이음매, tools/road/surface.ts carPaths 와 같은 곡선) 가운데 측량 연석에서 1.2m 안에 드는 점 */
function linkCurveOnCurb() {
  const d = load();
  const X = d.inter.X;
  const touch = curbTouch();
  const out: string[] = [];
  const o4 = [0, 0, 0, 0];
  for (const a of d.g) {
    if (X.jEnd[a.id] >= 0 || X.rIn[a.id] <= 0) continue;
    a.next.forEach((bi, j) => {
      const b = d.g[bi];
      for (let l = 0; l < a.lanes; l++) {
        const lb = a.lmap[j][l * 2];
        if (lb >= b.lanes) continue;
        for (let s = 0; s <= X.rIn[a.id] + X.rOut[b.id] + 1e-3; s += 0.5) {
          X.curve(a, b, l, lb, s, o4);
          if (Math.abs(o4[1]) < 0.3 && touch(o4[0], o4[2])) out.push(`e${a.id} l${l}→e${b.id} l${lb} ${o4[0].toFixed(0)},${o4[2].toFixed(0)}`);
        }
      }
    });
  }
  return out;
}
describe.skipIf(!existsSync(HD))('교차로 밖 이음매 곡선이 측량 연석을 가로지르지 않는다(판 전체, 정적)', () => {
  it('이음매 곡선의 차 몸(반폭 0.9m + 0.3m)이 측량 연석에 닿는 점이 판 전체 2개 이하다', () => {
    // 고치기 전 91점, 곡선 7개. 6개는 갈림 없이 이어지는 24m 미만 조각이 옆길 입구 폭까지 차로로 읽혀 앞뒤보다 차로가 많고(합정 월드컵로 3→5→4),
    // 그 바깥 차로를 다음 구간 차로로 합치는 곡선이 안쪽으로 꺾여 들어오는 연석을 가로질렀다
    const out = linkCurveOnCurb();
    expect(out.length, out.filter((_, i) => i % 5 === 0).slice(0, 12).join(' | ')).toBeLessThanOrEqual(2);
  });
});

/** 측량 닫힌 연석 고리(교통섬: 첫 점과 끝 점이 0.5m 안) 안, 연석에서 0.5m 넘게 들어간 차로 가운데 점 */
function lanesInIslands() {
  const hd = JSON.parse(readFileSync(HD, 'utf8')) as Record<string, { a: Record<string, string>; p: number[] }[]>;
  const loops = Object.entries(hd).flatMap(([k, fs]) => (k.includes(':C3_') ? fs : [])).filter((f) => f.a.Type === '4' && f.p.length >= 8 && Math.hypot(f.p[0] - f.p[f.p.length - 2], f.p[1] - f.p[f.p.length - 1]) <= 0.5).map((f) => f.p);
  const inside = (p: number[], x: number, z: number) => {
    let c = false;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if (p[i + 1] > z !== p[j + 1] > z && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
    return c;
  };
  const edge = (p: number[], x: number, z: number) => {
    let b = Infinity;
    for (let i = 2; i < p.length; i += 2) {
      const [ax, az, bx, bz] = [p[i - 2], p[i - 1], p[i], p[i + 1]];
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2 || 1)));
      b = Math.min(b, Math.hypot(ax + t * (bx - ax) - x, az + t * (bz - az) - z));
    }
    return b;
  };
  const out: string[] = [];
  eachLanePoint(load(), false, (x, z, _h, e, l) => {
    for (const p of loops) if (inside(p, x, z) && edge(p, x, z) > 0.5) out.push(`e${e.id} l${l} ${x.toFixed(0)},${z.toFixed(0)}`);
  });
  return { loops: loops.length, out };
}
describe.skipIf(!existsSync(HD))('차로가 측량 교통섬 연석 안을 지나지 않는다(판 전체, 정적)', () => {
  it('측량 닫힌 연석 고리 안으로 0.5m 넘게 들어간 차로 가운데 점이 없다', () => {
    // 고치기 전 10점: OSM 회전교차로 고리(345649821)가 측량 섬보다 5.4m 남동쪽에 그려져 고리 차로가 섬 위를 지났다
    const { loops, out } = lanesInIslands();
    expect(loops).toBeGreaterThan(0);
    expect(out, out.slice(0, 12).join(' | ')).toEqual([]);
  });
});

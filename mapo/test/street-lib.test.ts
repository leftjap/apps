import { describe, expect, it } from 'vitest';
import { alignToRoad, isCurrent, mergeStages, minRect } from '../tools/lib/crosswalk.ts';
import { analyseLink, analysePiece, cornerRadius, fitToRoadArea, laneIndex, readEdges, type LaneSeg } from '../tools/lib/lanes.ts';
import type { Corner } from '../src/data/corners.ts';

describe('횡단보도 면 → 축', () => {
  it('긴 변이 건너는 방향, 짧은 변이 폭', () => {
    // 남북으로 20m 건너고 폭 4m 인 직사각형(가운데 (10, 5))
    const r = minRect([[8, -5], [12, -5], [12, 15], [8, 15], [8, -5]]);
    expect(r.cx).toBeCloseTo(10, 5);
    expect(r.cz).toBeCloseTo(5, 5);
    expect(r.len).toBeCloseTo(20, 5);
    expect(r.wid).toBeCloseTo(4, 5);
    expect(Math.abs(r.uz)).toBeCloseTo(1, 5);
  });
  it('기울어진 면도 축을 찾는다', () => {
    const a = Math.PI / 6;
    const pt = (u: number, v: number): [number, number] => [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)];
    const r = minRect([pt(-9, -2), pt(9, -2), pt(9, 2), pt(-9, 2)]);
    expect(r.len).toBeCloseTo(18, 3);
    expect(r.wid).toBeCloseTo(4, 3);
    expect(Math.abs(r.ux * Math.cos(a) + r.uz * Math.sin(a))).toBeCloseTo(1, 3);
  });
  it('중앙섬을 사이에 둔 두 단 횡단보도는 하나로 잇는다', () => {
    const a = minRect([[-2, 0], [2, 0], [2, 12], [-2, 12]]);
    const b = minRect([[-2, 15], [2, 15], [2, 27], [-2, 27]]);
    const c = minRect([[40, 0], [44, 0], [44, 12], [40, 12]]); // 멀리 떨어진 다른 횡단보도
    const m = mergeStages([a, b, c]);
    expect(m).toHaveLength(2);
    const long = m.find((r) => r.len > 20)!;
    expect(long.len).toBeCloseTo(27, 3);
    expect(long.cz).toBeCloseTo(13.5, 3);
  });
  it('정사각형에 가까운 조각은 길과 직각인 쪽을 건너는 방향으로 잡아, 여러 조각 횡단보도가 한 줄로 이어진다', () => {
    // 동서로 뻗은 길(방향 +x)을 남북으로 건너는 세 조각. 가운데 조각은 동서 8.3m·남북 7.5m 라 긴 변이 길과 나란하다
    const top = minRect([[0, 0], [8.3, 0], [8.3, 13.7], [0, 13.7]]);
    const mid = minRect([[0, 16.3], [8.3, 16.3], [8.3, 23.8], [0, 23.8]]);
    const bot = minRect([[0, 26], [8.3, 26], [8.3, 40.6], [0, 40.6]]);
    expect(Math.abs(mid.ux)).toBeCloseTo(1, 5); // 고치기 전: 길 방향을 건너는 방향으로 잡는다
    expect(mergeStages([top, mid, bot])).toHaveLength(3);
    const a = alignToRoad(mid, 1, 0);
    expect(Math.abs(a.uz)).toBeCloseTo(1, 5);
    expect(a.len).toBeCloseTo(7.5, 5);
    expect(a.wid).toBeCloseTo(8.3, 5);
    const m = mergeStages([top, bot, mid].map((r) => alignToRoad(r, 1, 0)));
    expect(m).toHaveLength(1);
    expect(m[0].len).toBeCloseTo(40.6, 3);
    // 긴 조각은 길 방향과 상관없이 그대로 둔다(비스듬한 횡단보도)
    const diag = minRect([[0, 0], [4, 0], [4, 20], [0, 20]]);
    expect(alignToRoad(diag, 0.7, 0.7)).toEqual(diag);
  });
});

describe('2021 면 가운데 지금도 있는 것', () => {
  const ring: [number, number][] = [[0, 0], [4, 0], [4, 16], [0, 16], [0, 0]];
  it('2026 점과 관리번호가 이어진 면은 남긴다', () => {
    expect(isCurrent(ring, true, [], [])).toBe(true);
  });
  it('이어지지 않은 면은 2026 점이 5m 안에 있거나(번호만 바뀐 것) OSM 횡단보도가 6m 안에 지나갈 때만 남긴다', () => {
    expect(isCurrent(ring, false, [], [])).toBe(false);
    expect(isCurrent(ring, false, [[30, 8]], [])).toBe(false);
    expect(isCurrent(ring, false, [[8, 8]], [])).toBe(true);
    expect(isCurrent(ring, false, [[2, 20]], [])).toBe(true);
    expect(isCurrent(ring, false, [], [[[2, -3], [2, 19]]])).toBe(true);
    expect(isCurrent(ring, false, [], [[[20, -3], [20, 19]]])).toBe(false);
  });
});

// 동쪽으로 뻗은 길(가운데선 z = 0)과 그 위의 차선. 진행 방향(+x) 오른쪽이 +z
const line = (z: number, k: string, k2 = '001'): LaneSeg => ({ ax: -200, az: z, bx: 200, bz: z, k, k2 });

describe('연결로(OSM *_link) 폭 읽기', () => {
  it('양쪽 가장 가까운 경계선 사이를 찻길로 보고 차로 수·폭을 정한다(옆 본선 차선은 세지 않는다)', () => {
    // 연결로 가운데선 z = 0, 왼쪽 가장자리구역선 z = −2.3, 오른쪽 주차금지선 z = 2.7(폭 5m 한 차로). 교통섬 너머 본선 차선이 −8 ~ −20
    const idx = laneIndex([line(-2.3, '007'), line(2.7, '009'), line(-8, '009'), line(-11, '006', '002'), line(-14, '006', '002'), line(-17, '006', '002'), line(-20, '001', '003')]);
    const L = analyseLink(idx, [[0, 0], [60, 0]], true)!;
    expect(L.lf).toBe(1);
    expect(L.lb).toBe(0);
    expect(L.lf * L.lw + 1).toBeCloseTo(5, 1);
    expect(L.off).toBeCloseTo(0.2, 1);
    expect(L.medBus).toBe(false);
  });
  it('가운데 차선이 있으면 두 차로, 경계선을 못 찾으면 null', () => {
    const idx = laneIndex([line(-3.5, '007'), line(-0.2, '006', '002'), line(3.2, '010')]);
    const L = analyseLink(idx, [[0, 0], [60, 0]], true)!;
    expect(L.lf).toBe(2);
    expect(L.lf * L.lw + 1).toBeCloseTo(6.7, 1);
    expect(analyseLink(laneIndex([line(2.7, '009')]), [[0, 0], [60, 0]], true)).toBeNull();
    // 차선 없이 9.5m 면 두 차로
    expect(analyseLink(laneIndex([line(-4.7, '007'), line(4.8, '009')]), [[0, 0], [60, 0]], true)!.lf).toBe(2);
  });
});

describe('차선으로 길 모양 읽기', () => {
  it('양방향 길: 중앙선 자리로 가운데선을 옮기고, 방향별 차로 수와 차로 폭을 센다', () => {
    // 황색 복선이 z = 1.5, 오른쪽(+z)에 차선 3줄(3차로), 왼쪽에 1줄(2차로), 차로 폭 3.1m
    const idx = laneIndex([line(1.5, '001', '003'), line(4.6, '006', '002'), line(7.7, '006', '002'), line(-1.6, '006', '002'), line(10.8, '009')]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], false)!;
    expect(r.off).toBeCloseTo(1.5, 1);
    expect(r.lf).toBe(3);
    expect(r.lb).toBe(2);
    expect(r.lw).toBeCloseTo(3.1, 1);
    expect(r.ctype).toBe(3);
  });
  it('한 방향 길: 왼쪽 경계(중앙버스차로 선)에서 차로를 세고 가운데로 옮긴다', () => {
    // 길 왼쪽 z = -7 에 중앙버스전용차선, 차선 3줄 → 4차로, 차로 폭 3m. 실제 가운데는 z = -1
    const idx = laneIndex([line(-7, '017'), line(-4, '006', '002'), line(-1, '006', '002'), line(2, '006', '002')]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], true)!;
    expect(r.lf).toBe(4);
    expect(r.off).toBeCloseTo(-1, 1);
    expect(r.medBus).toBe(true);
  });
  it('연석선(주정차금지선 등)이 있으면 그 자리까지를 찻길로 보고 차로 폭을 나눈다', () => {
    // 한 방향 3차로: 왼쪽 중앙버스차선 −5.5, 차선 −0.4·2.5(중앙버스차선 옆 차로가 넓다), 오른쪽 연석선 5.7
    const idx = laneIndex([line(-5.5, '017'), line(-0.4, '006', '002'), line(2.5, '006', '002'), line(5.7, '009')]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], true)!;
    expect(r.lf).toBe(3);
    expect(r.off).toBeCloseTo(0.1, 1);
    expect(r.lw).toBeCloseTo(11.2 / 3, 1);
  });
  it('차선이 없으면 읽지 않는다', () => {
    expect(analysePiece(laneIndex([]), [[0, 0], [120, 0]], false)).toBeNull();
  });
  it('길과 비스듬한 선(정지선 등)은 차로로 세지 않는다', () => {
    const idx = laneIndex([line(0.2, '001', '001'), { ax: 50, az: -10, bx: 50, bz: 10, k: '006', k2: '001' }]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], false)!;
    expect(r.lf).toBe(1);
    expect(r.lb).toBe(1);
  });
  it('오른쪽 끝 차로가 가로변 버스전용차로면 표시한다', () => {
    const idx = laneIndex([line(0, '001', '003'), line(3.2, '006', '002'), line(6.4, '005', '001'), line(-3.2, '006', '002')]);
    const r = analysePiece(idx, [[0, 0], [120, 0]], false)!;
    expect(r.lf).toBe(3);
    expect(r.busR).toBe(true);
  });
});

describe('연석 쪽 가장자리선으로 찻길 가장자리 읽기', () => {
  const seg = (ax: number, az: number, bx: number, bz: number, k = '009'): LaneSeg => ({ ax, az, bx, bz, k, k2: '001' });
  /** 단면 목록에서 s 자리 값(선형 보간) */
  const at = (p: { s: number[]; v: number[] }, s: number) => {
    let i = 0;
    while (i + 1 < p.s.length - 1 && p.s[i + 1] < s) i++;
    const t = Math.max(0, Math.min(1, (s - p.s[i]) / (p.s[i + 1] - p.s[i] || 1)));
    return p.v[i] + (p.v[i + 1] - p.v[i]) * t;
  };
  it('양쪽 가장자리선 자리 + 0.25m(연석은 칠한 선 바깥)를 가장자리로 삼고, 폭이 그대로면 두 단면으로 줄인다', () => {
    const idx = laneIndex([line(8, '009'), line(-6, '010')]);
    const e = readEdges(idx, [[0, 0], [120, 0]], [7, 5]);
    expect(e.right.s).toHaveLength(2);
    expect(at(e.right, 60)).toBeCloseTo(8.25, 2);
    expect(at(e.left, 60)).toBeCloseTo(6.25, 2);
    expect(e.right.s[e.right.s.length - 1]).toBeCloseTo(120, 3);
  });
  it('버스 정차 자리처럼 폭이 넓어지는 곳을 따라간다', () => {
    const idx = laneIndex([seg(-10, 8, 60, 8), seg(60, 8, 64, 11, '011'), seg(64, 11, 130, 11)]);
    const e = readEdges(idx, [[0, 0], [120, 0]], [7, 5]);
    expect(at(e.right, 30)).toBeCloseTo(8.25, 1);
    expect(at(e.right, 100)).toBeCloseTo(11.25, 1);
  });
  it('가장자리선이 없으면 차로로 어림한 값을 쓰고, 차로 안쪽 선이나 너무 먼 선은 쓰지 않는다', () => {
    const idx = laneIndex([line(2, '009'), line(-14, '009')]);
    const e = readEdges(idx, [[0, 0], [120, 0]], [7, 5]);
    expect(at(e.right, 60)).toBeCloseTo(7, 5);
    expect(at(e.left, 60)).toBeCloseTo(5, 5);
  });
  it('끝(교차로) 가까이 다른 길의 선은 보지 않고 안쪽 값을 이어 쓴다', () => {
    const idx = laneIndex([seg(-10, 8, 130, 8), seg(-5, 11, 5, 11)]);
    const e = readEdges(idx, [[0, 0], [120, 0]], [7, 5]);
    expect(at(e.right, 0)).toBeCloseTo(8.25, 2);
  });
});

describe('모퉁이 반지름', () => {
  // 동쪽(+x)과 남쪽(+z)으로 뻗은 두 길의 가장자리가 (5, 5) 에서 만나는 모퉁이
  const c: Corner = { kx: 5, kz: 5, ax: 1, az: 0, bx: 0, bz: 1, th: Math.PI / 2, t: 5, cap: 30, cls: 3, r0: 6, ra: 0, ea: 0, rb: 1, eb: 0 };
  it('모퉁이를 도는 가장자리선이 있으면 그 반지름', () => {
    const segs: LaneSeg[] = [];
    for (let k = 0; k < 18; k++) {
      const a0 = Math.PI + (k * Math.PI) / 36;
      const a1 = Math.PI + ((k + 1) * Math.PI) / 36;
      segs.push({ ax: 15 + 10 * Math.cos(a0), az: 15 + 10 * Math.sin(a0), bx: 15 + 10 * Math.cos(a1), bz: 15 + 10 * Math.sin(a1), k: '009', k2: '001' });
    }
    expect(cornerRadius(laneIndex(segs), c)).toBeCloseTo(10, 0);
  });
  it('가장자리선이 모퉁이 앞에서 끊기면 잴 수 없다', () => {
    expect(cornerRadius(laneIndex([{ ax: 30, az: 5, bx: 60, bz: 5, k: '009', k2: '001' }]), c)).toBeNaN();
  });
});

describe('실폭도로(도로 면) 경계로 찻길 가장자리 맞추기', () => {
  const rw = (z: number): LaneSeg => ({ ax: -10, az: z, bx: 130, bz: z, k: 'RW', k2: '' });
  const flat = (v: number) => ({ s: [0, 120], v: [v, v] });
  const mid = (p: { s: number[]; v: number[] }) => {
    let i = 0;
    while (i + 1 < p.s.length - 1 && p.s[i + 1] < 60) i++;
    const t = (60 - p.s[i]) / (p.s[i + 1] - p.s[i] || 1);
    return p.v[i] + (p.v[i + 1] - p.v[i]) * t;
  };
  const P: [number, number][] = [[0, 0], [120, 0]];
  it('연석선이 없는 쪽은 도로 면 경계를 가장자리로 삼는다(좁아지거나 넓어진다)', () => {
    const e = fitToRoadArea(laneIndex([rw(3), rw(-5.5)]), P, { right: flat(5), left: flat(5) }, [false, false]);
    expect(mid(e.right)).toBeCloseTo(3, 5);
    expect(mid(e.left)).toBeCloseTo(5.5, 5);
  });
  it('연석선이 없어도 경계가 1.5m 넘게 바깥이면 보도가 있는 것으로 보고 그대로 둔다', () => {
    const e = fitToRoadArea(laneIndex([rw(8), rw(-5)]), P, { right: flat(5), left: flat(5) }, [false, false]);
    expect(mid(e.right)).toBeCloseTo(5, 5);
  });
  it('연석선으로 읽은 쪽은 도로 면 밖으로 0.3m 넘게 나간 곳만 줄인다', () => {
    const narrow = fitToRoadArea(laneIndex([rw(5), rw(-5.8)]), P, { right: flat(6), left: flat(6) }, [true, true]);
    expect(mid(narrow.right)).toBeCloseTo(5, 5);
    expect(mid(narrow.left)).toBeCloseTo(6, 5);
    const wide = fitToRoadArea(laneIndex([rw(9), rw(-9)]), P, { right: flat(6), left: flat(6) }, [true, true]);
    expect(mid(wide.right)).toBeCloseTo(6, 5);
  });
  it('도로 면 선이 없거나 차선 자료 선만 있으면 그대로 둔다', () => {
    const e = fitToRoadArea(laneIndex([{ ax: -10, az: 3, bx: 130, bz: 3, k: '009', k2: '' }]), P, { right: flat(5), left: flat(5) }, [false, false]);
    expect(mid(e.right)).toBeCloseTo(5, 5);
    expect(mid(e.left)).toBeCloseTo(5, 5);
  });
});

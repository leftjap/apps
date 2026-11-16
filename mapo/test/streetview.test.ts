// 로드뷰 기록(data-src/streetview/*.json): 판 건물에 잇기, 층수·지붕·1층 덮어쓰기, 외벽 색 칸, 단지 모형 소품
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard, USE, type Building } from '../src/data/board.ts';
import { addedBuildings, applyRec, matchBuildings, recLook, treeKind, UNKNOWN, type AreaRec, type BuildingRec } from '../src/data/streetview.ts';
import { toLatLon } from '../src/geo.ts';
import { looks, prismGeometry, propsOf, refine, STYLE } from '../src/render/buildings.ts';
import { detailOf, DK, siteOf } from '../src/render/detail.ts';

const box = (x0: number, z0: number, w: number, d: number) => new Float32Array([x0, z0, x0 + w, z0, x0 + w, z0 + d, x0, z0 + d]);
const bld = (o: Partial<Building> & { pts: Float32Array; h: number }): Building => ({ lm: 0, minH: 0, roof: 0, ...o });
const rec = (x: number, z: number, o: Partial<BuildingRec> = {}): BuildingRec => ({
  key: 'k',
  gis: null,
  ll: toLatLon(x, z),
  levels: UNKNOWN,
  wall: UNKNOWN,
  mat: UNKNOWN,
  roof: UNKNOWN,
  roofColor: UNKNOWN,
  ground: UNKNOWN,
  awning: UNKNOWN,
  balcony: UNKNOWN,
  windows: UNKNOWN,
  conf: 'yes',
  pano: null,
  seen: '2026-11-16',
  ...o,
});
const area = (buildings: BuildingRec[]): AreaRec => ({ area: 't', title: 't', center: toLatLon(0, 0), radius: 80, seen: '', source: '', views: [], buildings, streets: [], props: [] });

describe('기록을 판 건물에 잇기', () => {
  it('점이 든 외곽선 가운데 가장 작은 건물에 잇는다', () => {
    const list = [bld({ pts: box(0, 0, 40, 40), h: 10 }), bld({ pts: box(10, 10, 5, 5), h: 6 })];
    const { byIndex, missing } = matchBuildings(list, [area([rec(12, 12), rec(30, 30, { key: 'b' })])]);
    expect(byIndex.get(1)?.key).toBe('k');
    expect(byIndex.get(0)?.key).toBe('b');
    expect(missing).toEqual([]);
  });
  it('어느 외곽선에도 들지 않으면 빠진 기록으로 돌려준다', () => {
    const { byIndex, missing } = matchBuildings([bld({ pts: box(0, 0, 10, 10), h: 10 })], [area([rec(50, 50)])]);
    expect(byIndex.size).toBe(0);
    expect(missing.length).toBe(1);
  });
});

describe('층수·지붕·1층 덮어쓰기', () => {
  const b = bld({ pts: box(0, 0, 12, 12), h: 7.4, use: USE.commercial });
  it('기록 층수가 자료와 다르면 높이를 층수로 다시 잡는다', () => {
    const o = applyRec(b, rec(5, 5, { levels: 5 }));
    expect(o.levels).toBe(5);
    expect(o.h).toBeGreaterThan(15);
    expect(o.h).toBeLessThan(18);
  });
  it('층수가 미확인이면 높이를 그대로 둔다', () => {
    expect(applyRec(b, rec(5, 5)).h).toBe(7.4);
  });
  it('높이를 적어 두면 그 높이를 쓴다', () => {
    expect(applyRec(b, rec(5, 5, { levels: 1, h: 3.2 })).h).toBe(3.2);
  });
  it('지붕 모양: 모임 → 3, 맞배 → 2, 평 → 1', () => {
    expect(applyRec(b, rec(5, 5, { roof: 'hip' })).roof).toBe(3);
    expect(applyRec(b, rec(5, 5, { roof: 'gable' })).roof).toBe(2);
    expect(applyRec(b, rec(5, 5, { roof: 'flat' })).roof).toBe(1);
  });
  it('hide 로 기록한 구조물(출구 지붕이 건물로 들어간 것 등)은 그리지 않는 표시를 단다', () => {
    expect(applyRec(bld({ pts: box(0, 0, 5, 5), h: 4.2 }), rec(2, 2, { hide: true })).hidden).toBe(true);
    expect(applyRec(bld({ pts: box(0, 0, 5, 5), h: 4.2 }), rec(2, 2)).hidden).toBeUndefined();
  });
  it('1층이 가게인데 가게 자료가 없으면 소매 가게 1층을 둔다', () => {
    const o = applyRec(b, rec(5, 5, { ground: 'shop' }));
    expect(o.shop).toBe(6);
    expect((o.shopMask ?? 0) & 2).toBe(2);
  });
  it('가게 자료가 있으면 그대로 둔다', () => {
    const o = applyRec({ ...b, shop: 2, shopMask: 2 }, rec(5, 5, { ground: 'shop' }));
    expect(o.shop).toBe(2);
  });
});

describe('외벽 색 칸', () => {
  it('색은 0~1 RGB 로, 미확인은 비워 둔다', () => {
    const L = recLook(rec(0, 0, { wall: ['#ff8000', '#000000'], roofColor: '#808080' }));
    expect(L.wall).toEqual([1, 128 / 255, 0]);
    expect(L.wall2).toEqual([0, 0, 0]);
    expect(L.roof).toEqual([128 / 255, 128 / 255, 128 / 255]);
    expect(L.glass).toBeUndefined();
    expect(recLook(rec(0, 0)).wall).toBeUndefined();
  });
  it('기록된 1층 필로티는 용도와 상관없이 어두운 1층 덩어리를 둔다', () => {
    const b = applyRec(bld({ pts: box(0, 0, 12, 14), h: 13.8, use: USE.commercial, levels: 4 }), rec(5, 5, { ground: 'piloti' }));
    const [L] = looks(refine([b]));
    expect(L.tiers[0].dark).toBe(true);
  });
  it('1층을 로비로 기록하면 빌라라도 1층 높이를 따로 두어 로비 유리를 그린다', () => {
    const b = applyRec(bld({ pts: box(0, 0, 12, 14), h: 10.6, use: USE.villa, levels: 3 }), rec(5, 5, { ground: 'lobby' }));
    const [L] = looks(refine([b]));
    expect(L.gh).toBeGreaterThan(3);
    expect(L.shopK).toBe(0);
  });
  it('기록된 1층이 필로티가 아니면 빌라 필로티를 난수로 두지 않는다', () => {
    for (let k = 0; k < 30; k++) {
      const b = applyRec(bld({ pts: box(k * 37.3, k * 11.1, 11, 13), h: 13.8, use: USE.villa, levels: 4 }), rec(k * 37.3 + 5, k * 11.1 + 5, { ground: 'house' }));
      expect(looks(refine([b]))[0].tiers[0].dark).toBe(false);
    }
  });
});

describe('기록한 옥상 소품', () => {
  it('옥상 소품을 적어 둔 건물은 기본 기계실 대신 기록한 옥탑(사각뿔 지붕)을 둔다', () => {
    const b = applyRec(
      bld({ pts: box(0, 0, 48, 20), h: 26, use: USE.apartments, levels: 9 }),
      rec(24, 10, { detail: { roofItems: [{ kind: 'hipRoom', ll: toLatLon(12, 10), w: 5, d: 6, h: 2.8, roofH: 2, color: '#eeeeea', roofColor: '#6f6b67', conf: 'part' }] } }),
    );
    const list = refine([b]);
    const d = propsOf(list, looks(list));
    const kinds = Array.from({ length: d.length / 12 }, (_, i) => d[i * 12 + 7]);
    expect(kinds.filter((k) => k === 3).length).toBe(0); // 기본 기계실 없음
    expect(kinds.filter((k) => k === 7).length).toBe(1); // 사각뿔 지붕
    const room = Array.from({ length: d.length / 12 }, (_, i) => i).find((i) => d[i * 12 + 7] === 6)!;
    expect(d[room * 12]).toBeCloseTo(12, 0);
    expect(d[room * 12 + 1]).toBeGreaterThan(24); // 옥상 바닥 위
  });
});

describe('단지 모형: 발코니·계단실·처마', () => {
  const pts = box(0, 0, 40, 16); // 넓이가 양수인 방향: z 가 커지는 쪽(남쪽) 변이 남쪽을 본다
  const b = applyRec(
    bld({ pts, h: 26, use: USE.apartments, levels: 9 }),
    rec(20, 8, {
      levels: 9,
      wall: ['#eeeeea'],
      detail: {
        balconies: { faces: ['S'], from: 1, depth: 0.5, rail: '#ffffff', slab: ['#eeeeea', '#2c4563'], rails: 'bars', ac: 0, conf: 'yes' },
        stair: { kind: 'round', ll: toLatLon(40, 16), r: 1.9, top: 1, bands: ['#2c4563', '#a9cbd6'], conf: 'part' },
        eave: { faces: ['S'], depth: 1.4, drop: 0.6, color: '#8d8c88', conf: 'part' },
      },
    }),
  );
  const list = refine([b]);
  const [L] = looks(list);
  const d = detailOf(list[0], L);
  const n = d.box.length / 12;
  const of = (k: number) => Array.from({ length: n }, (_, i) => i).filter((i) => d.box[i * 12 + 7] === k);
  it('남쪽 면(40m)의 칸마다 2층부터 9층까지 발코니 바닥과 난간이 있다', () => {
    const bays = Math.round(40 / 2.9);
    expect(of(0).length).toBe(bays * 8);
    expect(of(1).length).toBe(bays * 8);
  });
  it('발코니는 벽 밖에 붙고, 바닥 높이는 층 높이를 따른다', () => {
    for (const i of of(0)) {
      const z = d.box[i * 12 + 2];
      expect(z).toBeGreaterThan(16);
      expect(z).toBeLessThan(16.8);
    }
    // 바닥 윗면(아랫면 + 두께)이 층 높이에 온다
    const ys = [...new Set(of(0).map((i) => +(d.box[i * 12 + 1] + d.box[i * 12 + 5]).toFixed(2)))].sort((a, b) => a - b);
    expect(ys.length).toBe(8);
    expect(ys[0]).toBeCloseTo(L.fh, 1);
  });
  it('원통 계단실 하나, 처마 띠는 남쪽 변을 따라', () => {
    expect(d.cyl.length / 12).toBe(1);
    expect(of(3).length).toBeGreaterThan(0);
  });
});

describe('단지 모형: 유리 발코니 칸·꼭대기 층 들임·작은 창', () => {
  const pts = box(0, 0, 40, 16);
  const b = applyRec(
    bld({ pts, h: 26, use: USE.apartments, levels: 9 }),
    rec(20, 8, {
      levels: 9,
      wall: ['#eeeeea'],
      detail: {
        balconies: { faces: ['S'], from: 1, depth: 0.5, rail: '#ffffff', slab: ['#eeeeea'], rails: 'bars', ac: 0, conf: 'yes', glassBays: { faces: ['S'], glass: '#9cc4dc', band: '#2c4563', ac: 1 } },
        setback: { faces: ['S'], depth: 1.5, floors: 1, rail: 'glass', conf: 'part' },
        smallWindows: ['N'],
      },
    }),
  );
  const list = refine([b]);
  const [L] = looks(list);
  const d = detailOf(list[0], L);
  const n = d.box.length / 12;
  const of = (k: number) => Array.from({ length: n }, (_, i) => i).filter((i) => d.box[i * 12 + 7] === k);
  const bays = Math.round(40 / 2.9);
  it('남쪽 면은 칸마다 유리 발코니 칸과 흰 난간 칸이 번갈아 있다(들인 꼭대기 층 빼고)', () => {
    const glass = of(15).length, slabs = of(0).length;
    expect(glass).toBe(Math.ceil(bays / 2) * 7);
    expect(slabs).toBe(Math.floor(bays / 2) * 7);
  });
  it('유리 칸에는 층마다 실외기가 달린다', () => {
    expect(of(2).length).toBe(Math.ceil(bays / 2) * 7);
  });
  it('꼭대기 층은 남쪽 변만 1.5m 들이고, 들인 자리 앞에 유리 난간을 둔다', () => {
    const top = L.tiers[L.tiers.length - 1];
    expect(L.tiers.length).toBe(2);
    expect(top.y0).toBeCloseTo(8 * L.fh, 1);
    expect(Math.max(...Array.from(top.ring).filter((_, i) => i % 2 === 1))).toBeCloseTo(14.5, 5);
    expect(Math.min(...Array.from(top.ring).filter((_, i) => i % 2 === 1))).toBeCloseTo(0, 5);
    expect(of(16).length).toBeGreaterThan(0);
  });
  it('작은 창으로 기록한 북쪽 면의 벽 꼭짓점에만 작은 창 표시가 붙는다', () => {
    const g = prismGeometry(list, [L], true);
    const nor = g.attributes.normal.array as Int8Array;
    const r3 = g.attributes.aRec3 as unknown as { count: number; getW: (i: number) => number };
    let north = 0, other = 0;
    for (let i = 0; i < r3.count; i++) {
      const wall = nor[i * 3 + 1] === 0;
      if (!wall) continue;
      if (nor[i * 3 + 2] < -100) north += r3.getW(i) > 0.5 / 255 ? 1 : 0;
      else other += r3.getW(i) > 0.5 / 255 ? 1 : 0;
    }
    expect(north).toBeGreaterThan(0);
    expect(other).toBe(0);
  });
});

describe('창 없는 벽', () => {
  it('창을 none 으로 기록하면 모든 벽 꼭짓점에 창 없음 표시(2)가 붙는다', () => {
    const b = applyRec(bld({ pts: box(0, 0, 10, 6), h: 3.2, use: USE.apartments, levels: 1 }), rec(5, 3, { windows: 'none', levels: 1, h: 3.2 }));
    const list = refine([b]);
    const g = prismGeometry(list, looks(list), true);
    const nor = g.attributes.normal.array as Int8Array;
    const r3 = g.attributes.aRec3 as unknown as { count: number; getW: (i: number) => number };
    let walls = 0, marked = 0;
    for (let i = 0; i < r3.count; i++) if (nor[i * 3 + 1] === 0) (walls += 1), (marked += Math.round(r3.getW(i) * 255) === 2 ? 1 : 0);
    expect(walls).toBeGreaterThan(0);
    expect(marked).toBe(walls);
  });
});

describe('기록 나무 수종', () => {
  it('수종 이름을 나무 모형 번호로', () => {
    expect(treeKind('소나무')).toBe(4);
    expect(treeKind('소나무류(잣나무로 보임)')).toBe(4);
    expect(treeKind('느티나무')).toBe(2);
    expect(treeKind('벚나무')).toBe(3);
    expect(treeKind('은행나무')).toBe(0);
    expect(treeKind('양버즘나무')).toBe(1);
    expect(treeKind('미확인(활엽수)')).toBe(5);
  });
});

describe('단지 바닥 소품', () => {
  it('주차 칸 n 개는 선 n + 1 개, 담은 받침과 철제 펜스 두 겹', () => {
    const s = siteOf([
      { kind: 'parking', ll: toLatLon(0, 0), yaw: 90, n: 5, w: 2.5, d: 5, orient: 'perp', conf: 'part', seen: '' },
      { kind: 'fence', line: [toLatLon(0, 0), toLatLon(20, 0)], base: 'concrete', baseColor: '#c6c9cd', baseH: 1.2, fence: 'iron', fenceColor: '#f2f2ef', fenceH: 1, conf: 'yes', seen: '' },
    ]);
    const kinds = Array.from({ length: s.length / 12 }, (_, i) => s[i * 12 + 7]);
    expect(kinds.filter((k) => k === 9).length).toBe(6);
    expect(kinds.filter((k) => k === 5).length).toBe(1);
    expect(kinds.filter((k) => k === 6).length).toBe(1);
  });
  it('가로등 기둥은 기록한 색(분홍 기둥 등)으로, 색이 없으면 회색으로 세운다', () => {
    const pole = (color?: string) => {
      const s = siteOf([{ kind: 'lamp', ll: toLatLon(0, 0), type: 'pole', h: 6, color, conf: 'part', seen: '' }]);
      const i = Array.from({ length: s.length / 12 }, (_, k) => k).find((k) => s[k * 12 + 7] === DK.pole)! * 12;
      return [s[i + 8], s[i + 9], s[i + 10]];
    };
    expect(pole('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(pole()).toEqual([0.36, 0.37, 0.39]);
  });
  it('포장 면은 기록한 색(붉은 벽돌 등)으로, 색이 없으면 재질 색으로 깐다', () => {
    const pave = (color?: string) => {
      const s = siteOf([{ kind: 'paving', ll: toLatLon(0, 0), w: 10, d: 4, yaw: 0, surface: 'block', color, conf: 'part', seen: '' }]);
      return [s[8], s[9], s[10]];
    };
    expect(pave('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(pave()).toEqual([0.66, 0.63, 0.59]);
  });
  it('부스는 길이 w 를 방위 yaw 로 눕힌 상자이고, 아래 띠 색을 적으면 띠 위에 몸통을 얹는다', () => {
    const s = siteOf([{ kind: 'booth', ll: toLatLon(10, 20), w: 10, d: 3, h: 3.5, yaw: 90, color: '#ff8000', base: '#0000ff', baseH: 0.5, conf: 'part', seen: '' }]);
    const boxes = Array.from({ length: s.length / 12 }, (_, i) => s.slice(i * 12, i * 12 + 12));
    expect(boxes.length).toBe(2);
    const [base, body] = boxes[0][1] === 0 ? boxes : [boxes[1], boxes[0]];
    expect([base[8], base[9], base[10]]).toEqual([0, 0, 1]);
    expect(body[1]).toBeCloseTo(0.5);
    expect(body[1] + body[5]).toBeCloseTo(3.5);
    expect(body[4]).toBeCloseTo(10); // 동쪽(90°)으로 눕혀 x 축 길이가 w
    expect(body[6]).toBeCloseTo(3);
    const one = siteOf([{ kind: 'booth', ll: toLatLon(0, 0), w: 4, d: 2, h: 0.6, yaw: 0, color: '#808080', conf: 'part', seen: '' }]);
    expect(one.length / 12).toBe(1);
    expect(one[1] + one[5]).toBeCloseTo(0.6);
  });
  it('계단식 좌석은 단 n 개를 쌓아 맨 윗단 위가 h, 맨 아랫단이 깊이 전체를 덮는다', () => {
    const s = siteOf([{ kind: 'steps', ll: toLatLon(10, 20), w: 30, d: 6, h: 1.8, n: 9, yaw: 90, color: '#a7a6a1', conf: 'part', seen: '' }]);
    const boxes = Array.from({ length: s.length / 12 }, (_, i) => s.slice(i * 12, i * 12 + 12));
    expect(boxes.length).toBe(9);
    expect(boxes.every((b) => b[7] === DK.slab)).toBe(true);
    const tops = boxes.map((b) => b[1] + b[5]);
    expect(Math.max(...tops)).toBeCloseTo(1.8);
    const bottom = boxes.find((b) => b[1] === 0)!;
    expect(bottom[4]).toBeCloseTo(6); // 오르는 방향 길이 = 깊이 전체
    expect(bottom[6]).toBeCloseTo(30); // 가로 = 너비
    // 동쪽(90°)으로 오르면 윗단일수록 가운데가 동쪽으로 간다
    const top = boxes.reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(top[0]).toBeGreaterThan(bottom[0]);
    expect(top[2]).toBeCloseTo(bottom[2]);
  });
  it('옛 철길은 선을 따라 레일 두 줄과 0.6m 마다 침목을 깐다', () => {
    const s = siteOf([{ kind: 'track', line: [toLatLon(0, 0), toLatLon(0, -10)], conf: 'yes', seen: '' }]);
    const boxes = Array.from({ length: s.length / 12 }, (_, i) => s.slice(i * 12, i * 12 + 12));
    const rails = boxes.filter((b) => b[4] > 5);
    const ties = boxes.filter((b) => b[4] <= 5);
    expect(rails.length).toBe(2);
    expect(ties.length).toBe(17);
    // 레일은 북쪽(−z)으로 놓이고 궤간(1.435m)만큼 떨어진다
    expect(Math.abs(rails[0][0] - rails[1][0])).toBeCloseTo(1.5, 1);
    expect(rails.every((b) => Math.abs(b[2] + 5) < 0.01)).toBe(true);
    expect(ties.every((b) => b[6] > 2 && b[1] + b[5] < rails[0][1] + rails[0][5])).toBe(true);
  });
});

describe('기록한 창 모양', () => {
  it('커튼월로 기록한 낮은 상가는 유리 커튼월 무늬로, 펀치창으로 기록한 높은 업무 건물은 상가 무늬로 그린다', () => {
    const low = applyRec(bld({ pts: box(0, 0, 20, 20), h: 15, use: USE.commercial, levels: 4 }), rec(10, 10, { windows: 'curtain' }));
    const tall = applyRec(bld({ pts: box(40, 0, 20, 20), h: 60, use: USE.commercial, levels: 15 }), rec(50, 10, { windows: 'punched' }));
    const plain = bld({ pts: box(80, 0, 20, 20), h: 60, use: USE.commercial, levels: 15 });
    const [a, b, c] = looks(refine([low, tall, plain]));
    expect(a.base).toBe(STYLE.glass);
    expect(b.base).toBe(STYLE.shop);
    expect(c.base).toBe(STYLE.glass);
  });
});

describe('외벽 LED 광고판', () => {
  it('기록한 면의 가장 긴 변에 광고판 상자를 벽 밖으로 붙인다', () => {
    const b = applyRec(
      bld({ pts: box(0, 0, 30, 16), h: 40, use: USE.commercial, levels: 10 }),
      rec(15, 8, { detail: { billboards: [{ face: 'S', at: 0.25, w: 8, y0: 20, y1: 32, conf: 'yes' }] } }),
    );
    const list = refine([b]);
    const d = detailOf(list[0], looks(list)[0]);
    const n = d.box.length / 12;
    const scr = Array.from({ length: n }, (_, i) => i).filter((i) => d.box[i * 12 + 7] === DK.screen);
    expect(scr.length).toBe(1);
    const i = scr[0] * 12;
    expect(d.box[i + 4]).toBe(8);
    expect(d.box[i + 5]).toBe(12);
    expect(d.box[i + 1]).toBe(20);
    expect(d.box[i]).toBeCloseTo(22.5, 5);
    expect(d.box[i + 2]).toBeGreaterThan(16);
  });
});

describe('판 자료에 없는 건물 더하기', () => {
  const sq = [toLatLon(0, 0), toLatLon(8, 0), toLatLon(8, 9), toLatLon(0, 9)];
  it('외곽선을 적은 기록은 그 외곽선(넓이가 양수인 방향)과 높이로 새 건물을 만든다', () => {
    const add = addedBuildings([area([rec(4, 4, { outline: sq, h: 21, levels: 6 }), rec(30, 30, { key: 'b' })])]);
    expect(add.length).toBe(1);
    const p = add[0].pts;
    let a = 0;
    for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
    expect(a / 2).toBeGreaterThan(70);
    expect(add[0].h).toBe(21);
    expect(add[0].levels).toBe(6);
    // 거꾸로 돈 외곽선도 같은 방향으로 바로잡는다
    const rev = addedBuildings([area([rec(4, 4, { outline: [...sq].reverse(), levels: 6 })])]);
    let b = 0;
    const q = rev[0].pts;
    for (let i = 0, j = q.length - 2; i < q.length; j = i, i += 2) b += q[j] * q[i + 1] - q[i] * q[j + 1];
    expect(b).toBeCloseTo(a, 1);
    expect(rev[0].h).toBeGreaterThan(18); // 높이를 안 적으면 층수로 어림
  });
  it('더한 건물에 기록이 이어진다', () => {
    const areas = [area([rec(4, 4, { outline: sq, h: 21 })])];
    const list = [bld({ pts: box(50, 50, 10, 10), h: 10 }), ...addedBuildings(areas)];
    const { byIndex, missing } = matchBuildings(list, areas);
    expect(missing).toEqual([]);
    expect(byIndex.has(1)).toBe(true);
  });
});

describe('사선 격자 외피', () => {
  it('면마다 사선 골조를 벽 밖에 붙이고, 지붕을 넘지 않는다', () => {
    const b = applyRec(bld({ pts: box(0, 0, 10, 10), h: 20, use: USE.commercial, levels: 6 }), rec(5, 5, { detail: { lattice: { color: '#ffffff', period: 10, bar: 0.5, conf: 'yes' } } }));
    const list = refine([b]);
    const d = detailOf(list[0], looks(list)[0]);
    const st = Array.from({ length: d.box.length / 12 }, (_, i) => d.box.slice(i * 12, i * 12 + 12)).filter((q) => q[7] === DK.strut);
    // 네 면 × 두 방향 × 높이 20m 를 반 주기(5m)로 나눈 4 칸
    expect(st.length).toBe(32);
    for (const q of st) {
      const half = (Math.abs(Math.sin(q[11])) * q[4]) / 2; // 기울인 골조의 반 높이
      expect(q[1] + half).toBeLessThanOrEqual(20.01);
      expect(q[1] - half).toBeGreaterThanOrEqual(-0.01);
      expect(Math.abs(q[11])).toBeGreaterThan(0.1); // 기운 각도(라디안)
      const out = Math.max(-q[0], q[0] - 10, -q[2], q[2] - 10); // 벽 밖
      expect(out).toBeGreaterThan(0);
    }
  });
});

describe('기록 파일', () => {
  const dir = new URL('../data-src/streetview/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const areas = files.map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as AreaRec);
  const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
  const HEX = /^#[0-9a-f]{6}$/;
  it('파일이 하나 이상 있다', () => expect(files.length).toBeGreaterThan(0));
  it('건물 기록은 모두 판 건물 하나에 이어지고, 두 기록이 한 건물을 겹쳐 잡지 않는다', () => {
    const { byIndex, missing } = matchBuildings([...board.buildings, ...addedBuildings(areas)], areas);
    expect(missing.map((r) => r.key)).toEqual([]);
    expect(byIndex.size).toBe(areas.reduce((s, a) => s + a.buildings.length, 0));
  });
  it('값은 정한 형식이거나 미확인이다', () => {
    for (const a of areas) {
      const keys = new Set<string>();
      for (const r of a.buildings) {
        expect(keys.has(r.key)).toBe(false);
        keys.add(r.key);
        expect(r.levels === UNKNOWN || (Number.isInteger(r.levels) && r.levels > 0)).toBe(true);
        if (r.wall !== UNKNOWN) for (const c of r.wall) expect(c).toMatch(HEX);
        if (r.roofColor !== UNKNOWN) expect(r.roofColor).toMatch(HEX);
        expect(['paint', 'brick', 'stone', 'tile', 'glass', 'metal', 'concrete', UNKNOWN]).toContain(r.mat);
        expect(['flat', 'gable', 'hip', UNKNOWN]).toContain(r.roof);
        expect(['shop', 'piloti', 'lobby', 'house', 'ramp', UNKNOWN]).toContain(r.ground);
        expect(['yes', 'part', 'sky']).toContain(r.conf);
      }
      for (const p of a.props) expect(['tree', 'fence', 'gate', 'paving', 'parking', 'pergola', 'lamp', 'steps', 'booth', 'track']).toContain(p.kind);
    }
  });
});

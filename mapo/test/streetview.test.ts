// 로드뷰 기록(data-src/streetview/*.json): 판 건물에 잇기, 층수·지붕·1층 덮어쓰기, 외벽 색 칸, 단지 모형 소품
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBoard, USE, type Building } from '../src/data/board.ts';
import { applyRec, matchBuildings, recLook, UNKNOWN, type AreaRec, type BuildingRec } from '../src/data/streetview.ts';
import { toLatLon } from '../src/geo.ts';
import { looks, propsOf, refine } from '../src/render/buildings.ts';
import { detailOf, siteOf } from '../src/render/detail.ts';

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
});

describe('기록 파일', () => {
  const dir = new URL('../data-src/streetview/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const areas = files.map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as AreaRec);
  const board = decodeBoard(JSON.parse(readFileSync(new URL('../public/data/board.json', import.meta.url), 'utf8')));
  const HEX = /^#[0-9a-f]{6}$/;
  it('파일이 하나 이상 있다', () => expect(files.length).toBeGreaterThan(0));
  it('건물 기록은 모두 판 건물 하나에 이어지고, 두 기록이 한 건물을 겹쳐 잡지 않는다', () => {
    const { byIndex, missing } = matchBuildings(board.buildings, areas);
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
      for (const p of a.props) expect(['tree', 'fence', 'gate', 'paving', 'parking', 'pergola', 'lamp']).toContain(p.kind);
    }
  });
});

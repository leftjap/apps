// 건물. 외곽선을 세운 벽, 옥상 난간과 그 안쪽의 낮은 옥상 바닥(태그가 있거나 단독주택이면 경사 지붕)을 메시 하나로 합치고,
// 옥탑·실외기·물탱크·기계실·차양·돌출 간판은 상자 하나를 인스턴스로 그린다.
// 유형별 덩어리(tiersOf): 빌라 북쪽 사선 후퇴·필로티, 상가주택 1층 상가와 위층 주거, 업무 빌딩 저층부와 탑. 꼭짓점 수는 원래 외곽선과 같다.
// 외벽은 셰이더가 용도별(다세대 빌라 벽돌, 상가, 유리 커튼월, 아파트, 주택, 공공 건물)로 층마다 창과 창틀, 층 사이 띠,
// 1층 가게 유리와 간판 띠를 그리고, 밤에는 창과 가게·간판에 불을 켠다. 옆 건물과 붙은 벽에는 창을 내지 않는다.
import * as THREE from 'three';
import { USE, type Building } from '../data/board.ts';
import { applyRec, faceOf, xz, type BuildingRec, type RecLook } from '../data/streetview.ts';
import { material, pal } from './env.ts';

/** 외벽 모양(셰이더의 style 값). 6 부터는 명소 건물 전용이고 BASE 의 기본 모양을 따르되 색·창이 다르다 */
export const STYLE = { villa: 0, shop: 1, glass: 2, apt: 3, house: 4, civic: 5, stone: 6, greenGrid: 7, sangsang: 8, mallPanel: 9, blueGlass: 10, tower: 11 } as const;
const BASE = [0, 1, 2, 3, 4, 5, 5, 2, 5, 1, 2, 2];

/** 명소 건물에서 외벽 모양을 정해 둔 건물. crown: 꼭대기를 긴 축을 따라 기울인 높이 차(m), rec: 로드뷰 기록 값(data/streetview.ts) */
type Hot = Building & { style?: number; crown?: number; rec?: RecLook };

const centroid = (p: Float32Array): [number, number] => {
  let x = 0;
  let z = 0;
  for (let i = 0; i < p.length; i += 2) (x += p[i]), (z += p[i + 1]);
  return [(x * 2) / p.length, (z * 2) / p.length];
};

/**
 * 명소 건물 다듬기(사진·항공사진으로 확인한 것). 고친 목록을 돌려준다.
 * - AK&홍대(양화로 188): OSM 은 바닥 전체를 79m 한 덩어리로 그려 두었다. 지상 1~5층 쇼핑몰 기단(약 30m) 위에 안쪽 부분(OSM building:part 17층)만 79.5m 탑으로 세운다.
 * - KT&G 상상마당: 노출 콘크리트 벽에 굽이치는 유리 띠.
 * - 홍익대 홍문관: OSM building:part 의 두 기둥과 20m 위에 걸친 다리(정문이 뚫린 모양)에 베이지 석재 기둥·녹색 유리 격자.
 *   부분 높이는 45m(10층)로 그려져 있지만 건축물대장(GIS건물통합정보)은 16층 64.8m 라 64.8m 로 올린다.
 * - 메세나폴리스: OSM 의 세 주거 탑(101·102동 39층 137m, 103동 29층 102m, building:colour #394EAA, building:material glass)을 푸른 유리 탑으로.
 *   OSM·대장 높이(137m, 103동 102m)는 지붕선이고, 꼭대기는 한쪽으로 기운 왕관이라 긴 축을 따라 실제 높이(위키백과: 101·102동 180m, 103동 121m)까지 올린다.
 */
export function refine(list: Building[]): Building[] {
  const out: Hot[] = [];
  /** 홍문관 부분(45m 안팎)을 대장 높이 64.8m(16층)로 */
  const hong = (b: Building) => (b.h >= 40 && b.h <= 50 ? { h: 64.8, levels: b.levels ? 16 : b.levels } : {});
  for (const b of list) {
    const [cx, cz] = centroid(b.pts);
    const near = (x: number, z: number, r: number) => Math.hypot(cx - x, cz - z) < r;
    if (b.lm === 0 && near(661, -699, 6) && b.h > 70) out.push({ ...b, h: 30, levels: 5, style: STYLE.mallPanel });
    else if (b.lm === 0 && near(659, -697, 6) && b.h > 40 && b.h < 70) out.push({ ...b, h: 79.5, levels: 17, style: STYLE.blueGlass });
    else if (b.lm === 10) out.push({ ...b, style: STYLE.sangsang });
    else if (b.lm === 1 && near(510, -100, 50) && (b.minH ?? 0) > 1) out.push({ ...b, ...hong(b), style: STYLE.greenGrid });
    else if (b.lm === 1 && near(510, -100, 50) && b.h > 40) out.push({ ...b, ...hong(b), style: STYLE.stone });
    else if (b.lm === 13) {
      const peak = b.h > 130 ? 180 : b.h > 95 ? 121 : b.h * 1.15;
      out.push({ ...b, h: peak, style: STYLE.tower, crown: peak - b.h });
    }
    else out.push(b);
  }
  return out;
}

const hexRGB = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];

/** 0~1 고정 난수 */
const rnd = (a: number, b = 0) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** 건물 바닥 외곽선 격자: 옆 건물과 붙은 벽, 앞이 트인 정도를 재는 데 쓴다 */
function footGrid(list: Building[]) {
  const CELL = 24;
  const cells = new Map<number, number[]>();
  const key = (gx: number, gz: number) => (gx + 500) * 1000 + gz + 500;
  list.forEach((b, i) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < b.pts.length; k += 2) {
      x0 = Math.min(x0, b.pts[k]);
      x1 = Math.max(x1, b.pts[k]);
      z0 = Math.min(z0, b.pts[k + 1]);
      z1 = Math.max(z1, b.pts[k + 1]);
    }
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = key(gx, gz);
        (cells.get(k) ?? cells.set(k, []).get(k)!).push(i);
      }
  });
  /** (x, z)가 self 가 아닌 건물(높이 2.5m 넘게 서 있는) 안인가. 그 건물이 (ix, iz)(self 안쪽 점)까지 덮으면 겹친 건물이라 치지 않는다 */
  return (x: number, z: number, self: number, ix: number, iz: number) => {
    for (const i of cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      if (i === self) continue;
      const b = list[i];
      const mh = b.minH ?? 0;
      if (b.h - mh < 2.5 || mh > 4) continue;
      if (inPoly(b.pts, x, z) && !inPoly(b.pts, ix, iz)) return true;
    }
    return false;
  };
}

export function inPoly(p: ArrayLike<number>, x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[i], az = p[i + 1], bx = p[j], bz = p[j + 1];
    if (az > z !== bz > z && x < ax + ((z - az) / (bz - az)) * (bx - ax)) c = !c;
  }
  return c;
}

/** 점에서 외곽선 변까지 가장 가까운 거리 */
function edgeDist(p: ArrayLike<number>, x: number, z: number): number {
  let d = Infinity;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const ax = p[j], az = p[j + 1], dx = p[i] - ax, dz = p[i + 1] - az;
    const L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    d = Math.min(d, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return d;
}

/** 외곽선을 안쪽으로 d 만큼 들인 고리. 들이다 뒤집히거나 너무 줄면 null */
function inset(p: Float32Array, d: number): Float32Array | null {
  const n = p.length / 2;
  const out = new Float32Array(p.length);
  let area0 = 0;
  let area1 = 0;
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const c = (i + 1) % n;
    let e1x = p[i * 2] - p[a * 2], e1z = p[i * 2 + 1] - p[a * 2 + 1];
    let e2x = p[c * 2] - p[i * 2], e2z = p[c * 2 + 1] - p[i * 2 + 1];
    const l1 = Math.hypot(e1x, e1z) || 1;
    const l2 = Math.hypot(e2x, e2z) || 1;
    (e1x /= l1), (e1z /= l1), (e2x /= l2), (e2z /= l2);
    // 안쪽 법선(넓이가 양수인 방향에서 바깥 법선은 (dz, −dx))
    const n1x = -e1z, n1z = e1x, n2x = -e2z, n2z = e2x;
    const k = 1 + n1x * n2x + n1z * n2z;
    let mx = ((n1x + n2x) / Math.max(0.15, k)) * d;
    let mz = ((n1z + n2z) / Math.max(0.15, k)) * d;
    const ml = Math.hypot(mx, mz);
    if (ml > 2.5 * d) (mx *= (2.5 * d) / ml), (mz *= (2.5 * d) / ml);
    out[i * 2] = p[i * 2] + mx;
    out[i * 2 + 1] = p[i * 2 + 1] + mz;
  }
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area0 += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
    area1 += out[j * 2] * out[i * 2 + 1] - out[i * 2] * out[j * 2 + 1];
  }
  if (area1 * area0 <= 0 || Math.abs(area1) < Math.abs(area0) * 0.45) return null;
  for (let i = 0; i < n; i++) if (!inPoly(p, out[i * 2], out[i * 2 + 1])) return null;
  return out;
}

/**
 * 변마다 다른 거리 d[i](변 i = 꼭짓점 i → i+1)만큼 안쪽으로 들인 고리. 꼭짓점 수는 그대로다.
 * 이웃한 두 변을 각자 들인 선의 교점을 새 꼭짓점으로 삼는다. 뒤집히거나 너무 줄면 null
 */
export function insetEdges(p: Float32Array, d: number[]): Float32Array | null {
  const n = p.length / 2;
  const out = new Float32Array(p.length);
  const dmax = Math.max(...d);
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const c = (i + 1) % n;
    let e1x = p[i * 2] - p[a * 2], e1z = p[i * 2 + 1] - p[a * 2 + 1];
    let e2x = p[c * 2] - p[i * 2], e2z = p[c * 2 + 1] - p[i * 2 + 1];
    const l1 = Math.hypot(e1x, e1z) || 1;
    const l2 = Math.hypot(e2x, e2z) || 1;
    (e1x /= l1), (e1z /= l1), (e2x /= l2), (e2z /= l2);
    // 들인 두 선: 점 + 안쪽 법선(−dz, dx) × 거리
    const ox1 = -e1z * d[a], oz1 = e1x * d[a];
    const ox2 = -e2z * d[i], oz2 = e2x * d[i];
    const cr = e1x * e2z - e1z * e2x;
    let mx: number, mz: number;
    if (Math.abs(cr) < 0.05) (mx = (ox1 + ox2) / 2), (mz = (oz1 + oz2) / 2);
    else {
      // 선 1: ox1 + t e1, 선 2: ox2 + u e2 의 교점
      const t = ((ox2 - ox1) * e2z - (oz2 - oz1) * e2x) / cr;
      (mx = ox1 + e1x * t), (mz = oz1 + e1z * t);
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 3 * dmax) (mx *= (3 * dmax) / ml), (mz *= (3 * dmax) / ml);
    out[i * 2] = p[i * 2] + mx;
    out[i * 2 + 1] = p[i * 2 + 1] + mz;
  }
  let area0 = 0;
  let area1 = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area0 += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
    area1 += out[j * 2] * out[i * 2 + 1] - out[i * 2] * out[j * 2 + 1];
  }
  if (area1 * area0 <= 0 || Math.abs(area1) < Math.abs(area0) * 0.3) return null;
  for (let i = 0; i < n; i++) if (d[i] > 0 && !inPoly(p, out[i * 2] + 1e-4 * (out[((i + 1) % n) * 2] - out[i * 2]), out[i * 2 + 1])) return null;
  return out;
}

/** 가장 긴 변 방향으로 잰 바닥 상자: 가운데, 축(단위), 축 방향 길이 L, 가로 W */
function obb(p: Float32Array) {
  let best = 0;
  let ax = 1;
  let az = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const dx = p[i] - p[j], dz = p[i + 1] - p[j + 1];
    const l = Math.hypot(dx, dz);
    if (l > best) (best = l), (ax = dx / l), (az = dz / l);
  }
  let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    const s = p[i] * ax + p[i + 1] * az;
    const t = -p[i] * az + p[i + 1] * ax;
    (s0 = Math.min(s0, s)), (s1 = Math.max(s1, s)), (t0 = Math.min(t0, t)), (t1 = Math.max(t1, t));
  }
  const sc = (s0 + s1) / 2, tc = (t0 + t1) / 2;
  return { cx: sc * ax - tc * az, cz: sc * az + tc * ax, ax, az, L: s1 - s0, W: t1 - t0 };
}

export interface Look {
  style: number;
  /** 기본 모양(명소 전용 모양이면 그것이 따르는 기본 모양) */
  base: number;
  seed: number;
  /** 층 높이와 1층 높이(0 이면 1층도 같은 높이, 바닥부터 센다) */
  fh: number;
  gh: number;
  /** 창을 낼 수 있는 벽 꼭대기(난간 아래) */
  top: number;
  parapet: number;
  floors: number;
  /** 변마다 0 = 옆 건물과 붙음, 1 = 좁은 틈·골목, 2 = 넓게 트임(큰길·광장) */
  open: Uint8Array;
  /** 지붕 모양(태그, 단독주택은 박공 2) */
  roof: number;
  /** 1층·지하 가게의 가장 많은 종류(0 없음 1 카페 2 음식점 3 주점 4 편의점 5 병원·약국 6 소매·생활): 1층 가게 유리·간판과 불 끄는 시각 */
  shopK: number;
  /** 2층 위 가게의 가장 많은 종류: 위층 간판 띠·세로 간판 */
  upK: number;
  /** 가게 층 표시(1 지하 2 1층 4 2층 8 3층 위) */
  shopMask: number;
  /** 아래부터 쌓는 덩어리. 마지막 덩어리에 난간·지붕을 얹는다 */
  tiers: Tier[];
  /** 로드뷰 기록이 있으면 난수 색·무늬 대신 이 값을 쓴다 */
  rec?: RecLook;
}

/** 덩어리: y0~y1 높이에 ring(원래 외곽선과 꼭짓점 수가 같다)을 세운다 */
export interface Tier {
  y0: number;
  y1: number;
  ring: Float32Array;
  /** 변마다 붙음·트임(들인 변은 트임) */
  open: Uint8Array;
  style: number;
  /** 필로티: 안쪽으로 들인 어두운 1층 */
  dark: boolean;
}

/** 골목 안까지 가게가 들어찬 곳(홍대 앞·홍대입구역·합정역·상수역·연남동 경의선숲길 둘레) */
const CORES: [number, number, number][] = [[350, -250, 480], [573, -643, 200], [-470, 240, 220], [343, 415, 160], [330, -1150, 180]];
const inCore = (x: number, z: number) => CORES.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r);

/** 붙은 벽·트인 정도와 태그로 건물마다 외벽 모양과 층을 정한다 */
export function looks(list: Building[]): Look[] {
  const hit = footGrid(list);
  return list.map((b, bi) => {
    const p = b.pts;
    const n = p.length / 2;
    const seed = rnd(p[0], p[1]);
    const open = new Uint8Array(n);
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      area += ax * bz - bx * az;
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (bz - az) / len, nz = -(bx - ax) / len;
      const probe = (t: number, d: number) => {
        const x = ax + (bx - ax) * t;
        const z = az + (bz - az) * t;
        return hit(x + nx * d, z + nz * d, bi, x - nx * 0.5, z - nz * 0.5);
      };
      const at = (d: number) => probe(0.5, d) || (len > 6 && probe(0.2, d) && probe(0.8, d));
      open[i] = at(0.7) ? 0 : at(5) || at(9) ? 1 : 2;
    }
    area /= 2;
    const h = b.h;
    const minH = b.minH ?? 0;
    const tall = h - minH;
    const roof = b.roof ?? 0;
    let style: number;
    const hot = (b as Hot).style;
    if (hot !== undefined) style = hot;
    else if (b.lm === 1 || b.lm === 6 || b.use === USE.civic || b.use === USE.religious) style = STYLE.civic;
    else if (b.use === USE.house) style = h <= 10 ? STYLE.house : STYLE.villa;
    else if (b.use === USE.villa) style = h <= 23 ? STYLE.villa : STYLE.apt;
    else if (b.use === USE.apartments) style = h <= 20 ? STYLE.villa : STYLE.apt;
    else if (b.use === USE.office) style = h >= 20 ? STYLE.glass : STYLE.shop;
    else if (b.use === USE.commercial) style = h >= 42 ? STYLE.glass : STYLE.shop;
    else if (h >= 40) style = STYLE.glass;
    else if (area > 900 || b.shop) style = STYLE.shop;
    else style = area < 45 && h <= 7 ? STYLE.house : STYLE.villa;
    // 로드뷰로 기록한 창 모양이 외벽 모양을 정한다: 커튼월은 유리 무늬, 펀치창·띠창으로 기록한 높은 업무 건물은 상가 무늬
    const win = (b as Hot).rec?.win;
    if (hot === undefined && win === 'curtain') style = STYLE.glass;
    else if (hot === undefined && win && style === STYLE.glass) style = STYLE.shop;
    // 지붕은 자료(OSM 태그, 굽기가 오래된 저층 단독에 단 박공)를 따른다
    const roofK = roof;
    const pitched = roofK >= 2 && roofK !== 5;
    const base = BASE[style];
    const parapet = pitched || (b as Hot).crown || area < 22 || tall < 3.5 ? 0 : base === STYLE.glass ? 1.3 : base === STYLE.apt ? 1.2 : base === STYLE.house ? 0.6 : 0.95;
    // 기운 왕관(crown)은 유리 외벽이 꼭대기까지 이어진다: 창은 꼭대기까지, 층 높이는 지붕선 기준
    const top = h - parapet;
    const usable = Math.max(2.4, top - ((b as Hot).crown ?? 0) - minH - 0.3);
    const floors = b.levels ? b.levels : Math.max(1, Math.round(usable / 3.2));
    let gh = 0;
    let fh = usable / floors;
    const plain = b.lm === 0 && minH < 0.5;
    const shopK = plain ? (b.shop ?? 0) : 0;
    const upK = plain ? (b.shopUp ?? 0) : 0;
    const shopMask = plain ? (b.shopMask ?? 0) : 0;
    // 1층 높이를 따로 두는 건물: 상가·커튼월·가게, 그리고 로드뷰 기록에서 1층이 로비인 건물(1층에 로비 유리를 그린다)
    if (minH < 0.5 && floors >= 2 && (base === STYLE.shop || base === STYLE.glass || shopK || (b as Hot).rec?.ground === 'lobby')) {
      gh = Math.min(5.2, Math.max(3.6, fh * 1.3));
      fh = (usable - gh) / (floors - 1);
    }
    const L = { style, base, seed, fh: Math.max(2.4, Math.min(12, fh)), gh: Math.min(12, gh), top, parapet, floors, open, roof: roofK, shopK, upK, shopMask, tiers: [] as Tier[], rec: (b as Hot).rec };
    L.tiers = tiersOf(b, L, area, hot !== undefined);
    return L;
  });
}

/**
 * 유형별 덩어리(꼭짓점을 늘리지 않게 변마다 들이기만 한다)
 * - 빌라(상가·업무 용도 제외): 정북 일조권 사선. 판 좌표는 경위도를 그대로 편 것이라 −z 가 정북이다. 대지 경계를 모르므로 정북에서 45° 안을 보는 트인 변을
 *   경계 쪽 변으로 보고, 꼭대기가 9m 를 넘는 층마다 그 층 꼭대기 높이의 절반 − 1.5m 만큼 들인다(9m 까지는 경계에서 1.5m, 넘으면 높이의 절반 띄우는 서울 다세대).
 *   남북 깊이의 절반보다 깊게는 들이지 않고 단은 3개까지다. 필로티 빌라는 1층을 0.7m 들인 어두운 덩어리로.
 * - 상가주택(4~6층 이하 작은 상가): 1층 상가 위 주거부를 트인 변에서 0.5m 들이고 빌라 외벽으로.
 * - 업무 빌딩(30m 넘는 커튼월, 바닥 18m 넘음): 3개 층 저층부 위로 탑을 트인 변에서 1.5~4m 들인다.
 * 옆 건물과 붙은 변은 들이지 않는다(붙은 건물 사이에 틈이 생기지 않게).
 */
function tiersOf(b: Building, L: Omit<Look, 'tiers'>, area: number, hot: boolean): Tier[] {
  const p = b.pts;
  const n = p.length / 2;
  const y0 = b.minH ?? 0;
  const one: Tier[] = [{ y0, y1: b.h, ring: p, open: L.open, style: L.style, dark: false }];
  const sb = (b as Hot).rec?.detail?.setback;
  if (sb && !hot && b.lm === 0 && L.floors > sb.floors) {
    // 로드뷰 기록: 꼭대기 층 들임(기록한 면만, 외곽선 꼭짓점 수는 그대로)
    const d = Array.from({ length: n }, (_, i) => {
      const j = (i + 1) % n;
      const len = Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]) || 1;
      return L.open[i] !== 0 && sb.faces.includes(faceOf((p[j * 2 + 1] - p[i * 2 + 1]) / len, -(p[j * 2] - p[i * 2]) / len)) ? sb.depth : 0;
    });
    const f0 = L.floors - sb.floors;
    const yt = L.gh > 0 ? y0 + L.gh + (f0 - 1) * L.fh : y0 + f0 * L.fh;
    const ring = insetEdges(p, d);
    if (ring) return [{ y0, y1: yt, ring: p, open: L.open, style: L.style, dark: false }, { y0: yt, y1: b.h, ring, open: L.open.map((o, i) => (d[i] > 0 ? 2 : o)), style: L.style, dark: false }];
  }
  if (hot || y0 > 0.5 || b.lm !== 0) return one;
  // 로드뷰 기록의 1층: 필로티면 용도와 상관없이 어두운 1층을 두고, 다른 1층이면 빌라 필로티 난수를 쓰지 않는다
  const recGround = (b as Hot).rec?.ground;
  const mk = (ya: number, yb: number, d: number[] | null, style = L.style, dark = false): Tier | null => {
    const ring = d ? insetEdges(p, d) : p;
    if (!ring) return null;
    return { y0: ya, y1: yb, ring, open: d ? L.open.map((o, i) => (d[i] > 0.01 ? 2 : o)) : L.open, style, dark };
  };
  const out: Tier[] = [];
  if (L.style === STYLE.villa) {
    const s8 = Math.floor(L.seed * 255) / 255;
    const piloti = recGround ? recGround === 'piloti' && L.floors >= 2 : L.top > 9 && (s8 * 31) % 1 < 0.55 && L.floors >= 3 && !L.shopK;
    let yb = y0;
    if (piloti) {
      const t = mk(y0, L.fh, Array.from(L.open, (o) => (o ? 0.7 : 0)), L.style, true);
      if (t) out.push(t), (yb = L.fh);
    }
    // 정북 사선: 정북에서 45° 안을 보는 트인 변(바깥 법선 z 성분 < −0.707)
    const north = Array.from({ length: n }, (_, i) => {
      const j = (i + 1) % n;
      const dx = p[j * 2] - p[i * 2], dz = p[j * 2 + 1] - p[i * 2 + 1];
      const len = Math.hypot(dx, dz) || 1;
      return L.open[i] !== 0 && -dx / len < -0.707 && len > 3;
    });
    let zs0 = Infinity, zs1 = -Infinity;
    for (let i = 1; i < p.length; i += 2) (zs0 = Math.min(zs0, p[i])), (zs1 = Math.max(zs1, p[i]));
    const steps: Tier[] = [];
    const residential = b.use !== USE.commercial && b.use !== USE.office;
    if (residential && north.some(Boolean))
      for (let f = 0; f < L.floors; f++) {
        const ya = y0 + L.gh + (f - (L.gh > 0 ? 1 : 0)) * L.fh;
        const yt = Math.min(b.h, f === 0 && L.gh > 0 ? y0 + L.gh : ya + L.fh);
        if (yt <= 9 || f === 0) continue;
        if (steps.length === 3) break; // 정점을 아끼려고 3단까지만, 그 위 층은 마지막 단을 이어 올린다
        const d = Math.min(yt / 2 - 1.5, (zs1 - zs0) / 2);
        const t = mk(ya, b.h, north.map((v) => (v ? d : 0)));
        if (!t) break;
        steps.push(t);
      }
    const body = mk(yb, steps.length ? steps[0].y0 : b.h, null)!;
    out.push(body);
    steps.forEach((t, j) => out.push({ ...t, y1: j + 1 < steps.length ? steps[j + 1].y0 : b.h }));
    return out;
  }
  if (recGround === 'piloti' && L.floors >= 2) {
    const fh = L.gh > 0 ? L.gh : L.fh;
    const t = mk(y0, y0 + fh, Array.from(L.open, (o) => (o ? 0.7 : 0)), L.style, true);
    if (t) return [t, mk(y0 + fh, b.h, null)!];
  }
  if (L.style === STYLE.shop && L.gh > 0 && L.floors >= 3 && L.floors <= 6 && area < 500 && b.h < 25 && rnd(L.seed, 7) < (inCore(p[0], p[1]) ? 0.5 : 0.85)) {
    const home = mk(y0 + L.gh, b.h, Array.from(L.open, (o) => (o ? 0.5 : 0)), STYLE.villa) ?? mk(y0 + L.gh, b.h, null, STYLE.villa)!;
    return [mk(y0, y0 + L.gh, null)!, home];
  }
  if (L.style === STYLE.glass && b.h >= 30 && L.floors >= 8) {
    const o = obb(p);
    const m = Math.min(o.L, o.W);
    if (m >= 18 && L.open.some((v) => v !== 0)) {
      const d = Math.max(1.5, Math.min(4, m * 0.12));
      const yp = y0 + L.gh + 2 * L.fh;
      const tower = mk(yp, b.h, Array.from(L.open, (v) => (v ? d : 0)));
      if (tower) return [mk(y0, yp, null)!, tower];
    }
  }
  return one;
}

/** 로드뷰 기록을 꼭짓점 값 16바이트로: [외벽 rgb·재질] [1층 외벽 rgb·표시] [지붕 rgb·0] [유리 rgb·창]. 표시: 1 외벽 2 1층 외벽 4 지붕 8 유리 16 세대 단위 불빛. 창: 0 보통 1 작은 창 2 창 없음 */
function recBytes(L: Look): number[] {
  const r = L.rec!;
  const c = (v: [number, number, number] | undefined | null) => (v ? v.map((k) => Math.round(k * 255)) : [0, 0, 0]);
  const flags = (r.wall ? 1 : 0) + (r.wall2 ? 2 : 0) + (r.roof ? 4 : 0) + (r.glass ? 8 : 0) + (L.base === STYLE.apt ? 16 : 0);
  return [...c(r.wall), r.mat, ...c(r.wall2), flags, ...c(r.roof), 0, ...c(r.glass), r.noWin ? 2 : 0];
}

/** 벽·난간·옥상 메시. looks 를 주지 않으면 이 목록만으로 붙은 벽을 잰다. rec: 로드뷰 기록 값을 꼭짓점마다 싣는다(모든 건물에 기록이 있어야 한다) */
export function prismGeometry(list: Building[], lk: Look[] = looks(list), rec = false): THREE.BufferGeometry {
  // 숫자 목록 대신 늘어나는 형식 배열에 쌓는다(판 건물 꼭짓점 수백만 개를 숫자 목록에 쌓으면 불러올 때 수백 MB 가 버려진다, W19)
  const pos = grow(Float32Array);
  const nor = grow(Int8Array);
  const edge = grow(Float32Array);
  const bld = grow(Uint8Array);
  const idx = grow(Uint32Array);
  const rb = grow(Uint8Array);
  let recB: number[] = [];
  let small: string[] = [];
  let v = 0;
  let L: Look;
  let tierStyle = 0;
  const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, len: number, flags: number, top: number) => {
    pos.push(x, y, z);
    nor.push(Math.round(nx * 127), Math.round(ny * 127), Math.round(nz * 127));
    edge.push(u, len, flags, top);
    bld.push(tierStyle, Math.floor(L.seed * 255), Math.round(L.gh * 20), Math.round(L.fh * 20));
    if (rec) {
      rb.push(...recB);
      // 작은 창으로 기록한 면의 벽: 마지막 바이트 1
      if (ny === 0 && rb.a[rb.n - 1] === 0 && small.length && small.includes(faceOf(nx, nz))) rb.a[rb.n - 1] = 1;
    }
    return v++;
  };
  const quad = (a: number) => idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
  const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, top: number) => {
    const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    (nx /= l), (ny /= l), (nz /= l);
    if (ny < 0) {
      (nx = -nx), (ny = -ny), (nz = -nz);
      [bx, by, bz, cx, cy, cz] = [cx, cy, cz, bx, by, bz];
    }
    // 가파른 면(박공)은 벽으로 칠한다
    const flags = ny < 0.3 ? 0 : 3;
    const a = put(ax, ay, az, nx, ny, nz, 0, 0, flags, top);
    put(bx, by, bz, nx, ny, nz, 0, 0, flags, top);
    put(cx, cy, cz, nx, ny, nz, 0, 0, flags, top);
    idx.push(a, a + 1, a + 2);
  };

  const cap = (p: Float32Array, y: number) => {
    const contour: THREE.Vector2[] = [];
    const base = v;
    for (let i = 0; i < p.length; i += 2) {
      contour.push(new THREE.Vector2(p[i], p[i + 1]));
      put(p[i], y, p[i + 1], 0, 1, 0, 0, 0, 1, L.top);
    }
    for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) idx.push(base + t[0], base + t[1], base + t[2]);
  };
  list.forEach((b, bi) => {
    L = lk[bi];
    if (rec) (recB = recBytes(L)), (small = L.rec?.detail?.smallWindows ?? []);
    const tiers = L.tiers;
    // 기운 꼭대기: 긴 축을 따라 h − crown ~ h
    const crown = (b as Hot).crown ?? 0;
    const ob = crown ? obb(b.pts) : null;
    const topY = (x: number, z: number, y: number) =>
      ob ? y - crown * (0.5 - ((x - ob.cx) * ob.ax + (z - ob.cz) * ob.az) / Math.max(1, ob.L)) : y;
    tiers.forEach((t, ti) => {
      tierStyle = t.style;
      const q = t.ring;
      const m = q.length / 2;
      for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        const ax = q[i * 2], az = q[i * 2 + 1], bx = q[j * 2], bz = q[j * 2 + 1];
        const len = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (bz - az) / len, nz = -(bx - ax) / len;
        const f = (t.open[i] === 0 ? 8 : 0) + (t.dark ? 4 : 0) + 16 * L.shopK + 128 * L.upK + 1024 * L.shopMask;
        quad(put(ax, t.y0, az, nx, 0, nz, 0, len, f, L.top));
        put(bx, t.y0, bz, nx, 0, nz, len, len, f, L.top);
        const last = ti + 1 === tiers.length;
        put(bx, last ? topY(bx, bz, t.y1) : t.y1, bz, nx, 0, nz, len, len, f, L.top);
        put(ax, last ? topY(ax, az, t.y1) : t.y1, az, nx, 0, nz, 0, len, f, L.top);
      }
      // 아래 덩어리 윗면: 위 덩어리가 들어간 자리가 보인다(필로티는 위 덩어리에 가려 그리지 않는다)
      if (ti + 1 < tiers.length && !t.dark) cap(q, t.y1);
    });
    const top = tiers[tiers.length - 1];
    tierStyle = top.style;
    const p = top.ring;
    const n = p.length / 2;
    const roof = L.roof;
    const h = b.h;
    if (crown) {
      const contour: THREE.Vector2[] = [];
      const base = v;
      for (let i = 0; i < n; i++) {
        contour.push(new THREE.Vector2(p[i * 2], p[i * 2 + 1]));
        put(p[i * 2], topY(p[i * 2], p[i * 2 + 1], h), p[i * 2 + 1], 0, 1, 0, 0, 0, 1, L.top);
      }
      for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) idx.push(base + t[0], base + t[1], base + t[2]);
      return;
    }
    const ring = L.parapet > 0 ? inset(p, 0.28) : null;
    if (ring) {
      // 난간 윗면과 안쪽 벽, 그 안의 낮은 옥상 바닥
      const fy = h - L.parapet + 0.25;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
        const cx = ring[i * 2], cz = ring[i * 2 + 1], dx = ring[j * 2], dz = ring[j * 2 + 1];
        quad(put(ax, h, az, 0, 1, 0, 0, 0, 2, L.top));
        put(cx, h, cz, 0, 1, 0, 0, 0, 2, L.top);
        put(dx, h, dz, 0, 1, 0, 0, 0, 2, L.top);
        put(bx, h, bz, 0, 1, 0, 0, 0, 2, L.top);
        const len = Math.hypot(dx - cx, dz - cz) || 1;
        const nx = -(dz - cz) / len, nz = (dx - cx) / len;
        quad(put(cx, h, cz, nx, 0, nz, 0, len, 2, L.top));
        put(cx, fy, cz, nx, 0, nz, 0, len, 2, L.top);
        put(dx, fy, dz, nx, 0, nz, len, len, 2, L.top);
        put(dx, h, dz, nx, 0, nz, len, len, 2, L.top);
      }
      const contour: THREE.Vector2[] = [];
      const base = v;
      for (let i = 0; i < n; i++) {
        contour.push(new THREE.Vector2(ring[i * 2], ring[i * 2 + 1]));
        put(ring[i * 2], fy, ring[i * 2 + 1], 0, 1, 0, 0, 0, 1, L.top);
      }
      for (const t of THREE.ShapeUtils.triangulateShape(contour, [])) idx.push(base + t[0], base + t[1], base + t[2]);
      return;
    }
    if (roof >= 2 && roof !== 5) {
      // 경사 지붕: 바닥 상자의 긴 축을 따라 용마루를 두고, 꼭짓점마다 용마루로 올린 점과 잇는다(모임·맞배·피라미드)
      const o = obb(p);
      const rh = Math.min(roof >= 6 ? o.W * 0.45 : o.W * 0.32, 6);
      const half = roof === 4 || roof >= 6 ? 0 : roof === 2 ? o.L / 2 : Math.max(0, (o.L - o.W) / 2);
      const ridge = (x: number, z: number): [number, number] => {
        const s = Math.max(-half, Math.min(half, (x - o.cx) * o.ax + (z - o.cz) * o.az));
        return [o.cx + o.ax * s, o.cz + o.az * s];
      };
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
        const [rax, raz] = ridge(ax, az);
        const [rbx, rbz] = ridge(bx, bz);
        tri(ax, h, az, bx, h, bz, rbx, h + rh, rbz, h);
        if (Math.hypot(rax - rbx, raz - rbz) > 0.05) tri(ax, h, az, rbx, h + rh, rbz, rax, h + rh, raz, h);
      }
      return;
    }
    cap(p, h);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.done(), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.done(), 3, true));
  g.setAttribute('aEdge', new THREE.BufferAttribute(edge.done(), 4));
  g.setAttribute('aBld', new THREE.BufferAttribute(bld.done(), 4));
  if (rec) {
    const u = rb.done();
    // 16바이트를 vec4 네 개로(0~1)
    const ib = new THREE.InterleavedBuffer(u, 16);
    for (let k = 0; k < 4; k++) g.setAttribute(`aRec${k}`, new THREE.InterleavedBufferAttribute(ib, 4, k * 4, true));
  }
  g.setIndex(v > 65535 ? new THREE.BufferAttribute(idx.done(), 1) : new THREE.BufferAttribute(Uint16Array.from(idx.done()), 1));
  return g;
}

type Typed = Float32Array | Int8Array | Uint8Array | Uint32Array;
/** 늘어나는 형식 배열: push 로 쌓고 done() 이 딱 맞는 길이의 사본을 돌려준다 */
function grow<T extends Typed>(Kind: { new (n: number): T }) {
  const g = {
    a: new Kind(1024),
    n: 0,
    push(...v: number[]) {
      if (g.n + v.length > g.a.length) {
        const b = new Kind(Math.max(g.a.length * 2, g.n + v.length));
        b.set(g.a as never);
        g.a = b;
      }
      for (let k = 0; k < v.length; k++) g.a[g.n++] = v[k];
    },
    done: (): T => g.a.slice(0, g.n) as T,
  };
  return g;
}

/**
 * 가게 종류 k(1 카페 2 음식점 3 주점 4 편의점 5 병원·약국 6 소매·생활)가 시각 hour(0~24)에 영업 중인가(1/0). r(0~1)로 가게마다 닫는 시각을 흩뜨린다.
 * 카페 8시~21:30~23시, 음식점 11시~21:30~23:30, 주점 17시~새벽 1~5시, 편의점은 늘, 병원·약국 9시~18:30~19:30, 소매·생활 10시~21~22시. 셰이더 shopOpen 과 같은 식
 */
export function shopOpen(k: number, r: number, hour: number): number {
  if (k > 3.5 && k < 4.5) return 1;
  const hh = hour < 6 ? hour + 24 : hour;
  const open = k < 1.5 ? 8 : k < 2.5 ? 11 : k < 3.5 ? 17 : k < 5.5 ? 9 : 10;
  const close = k < 1.5 ? 21.5 + 1.5 * r : k < 2.5 ? 21.5 + 2 * r : k < 3.5 ? 25 + 4 * r : k < 5.5 ? 18.5 + r : 21 + r;
  return hh >= open && hh <= close ? 1 : 0;
}

/**
 * 시각 hour(0~24)에 사무실 층이 켜져 있을 비율. 9~18:30 대부분, 저녁부터 줄어 22시 25%, 자정 10%, 새벽 5%.
 * 셰이더 officeLit 과 같은 식(커튼월 사무실이 밤 11시에도 층마다 하얗게 켜지던 것을 고친다)
 */
export function officeLit(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < 6) return 0.1 - (0.05 * h) / 6;
  if (h < 9) return 0.06 + (0.79 * (h - 6)) / 3;
  if (h < 18.5) return 0.85;
  if (h < 22) return 0.85 - (0.6 * (h - 18.5)) / 3.5;
  return 0.25 - (0.15 * (h - 22)) / 2;
}

/** 외벽 색(용도·난수). 셰이더와 옥탑 색이 같은 식을 쓴다 */
const GLSL_COLORS = /* glsl */ `
vec3 wallColor(float style, float s) {
  float k = fract(s * 7.31);
  if (style > 5.5) return style < 6.5 ? vec3(0.88, 0.8, 0.66) : style < 7.5 ? vec3(0.62, 0.66, 0.6) : style < 8.5 ? vec3(0.7, 0.7, 0.68)
                       : style < 9.5 ? vec3(0.93, 0.93, 0.92) : style < 10.5 ? vec3(0.3, 0.37, 0.44) : vec3(0.86, 0.88, 0.9);
  if (style < 0.5) return k < 0.42 ? vec3(0.76, 0.5, 0.41) : k < 0.58 ? vec3(0.6, 0.43, 0.35) : k < 0.8 ? vec3(0.93, 0.86, 0.74) : vec3(0.93, 0.92, 0.89);
  if (style < 1.5) return k < 0.3 ? vec3(0.95, 0.94, 0.92) : k < 0.52 ? vec3(0.84, 0.84, 0.83) : k < 0.7 ? vec3(0.92, 0.86, 0.77) : k < 0.84 ? vec3(0.5, 0.52, 0.55) : vec3(0.74, 0.5, 0.42);
  if (style < 2.5) return k < 0.5 ? vec3(0.36, 0.39, 0.43) : vec3(0.55, 0.57, 0.6);
  if (style < 3.5) return k < 0.6 ? vec3(0.96, 0.95, 0.91) : vec3(0.92, 0.89, 0.82);
  if (style < 4.5) return k < 0.5 ? vec3(0.92, 0.88, 0.8) : vec3(0.72, 0.5, 0.42);
  return k < 0.55 ? vec3(0.86, 0.85, 0.82) : vec3(0.72, 0.47, 0.4);
}
float officeLit() {
  float h = mod(uHour, 24.0);
  return h < 6.0 ? 0.1 - 0.05 * h / 6.0 : h < 9.0 ? 0.06 + 0.79 * (h - 6.0) / 3.0 : h < 18.5 ? 0.85 : h < 22.0 ? 0.85 - 0.6 * (h - 18.5) / 3.5 : 0.25 - 0.15 * (h - 22.0) / 2.0;
}
float shopOpen(float k, float r) {
  if (k > 3.5 && k < 4.5) return 1.0;
  float hh = uHour < 6.0 ? uHour + 24.0 : uHour;
  float o = k < 1.5 ? 8.0 : k < 2.5 ? 11.0 : k < 3.5 ? 17.0 : k < 5.5 ? 9.0 : 10.0;
  float c = k < 1.5 ? 21.5 + 1.5 * r : k < 2.5 ? 21.5 + 2.0 * r : k < 3.5 ? 25.0 + 4.0 * r : k < 5.5 ? 18.5 + r : 21.0 + r;
  return step(o, hh) * step(hh, c);
}
/** 업종별 간판 색(차분한 두 가지 가운데 r 로 하나): 카페 녹색·갈색, 음식점 적갈색·황토, 주점 호박색·자두색, 편의점 청색·청록, 병원·약국 청록·흰색, 소매·생활 회청·베이지 */
vec3 signColor(float k, float r) {
  vec3 a = vec3(0.46, 0.5, 0.56), b = vec3(0.8, 0.76, 0.68);
  if (k < 1.5) { a = vec3(0.36, 0.5, 0.4); b = vec3(0.52, 0.4, 0.32); }
  else if (k < 2.5) { a = vec3(0.64, 0.32, 0.26); b = vec3(0.74, 0.6, 0.34); }
  else if (k < 3.5) { a = vec3(0.72, 0.5, 0.26); b = vec3(0.46, 0.32, 0.44); }
  else if (k < 4.5) { a = vec3(0.3, 0.46, 0.6); b = vec3(0.36, 0.56, 0.46); }
  else if (k < 5.5) { a = vec3(0.3, 0.56, 0.52); b = vec3(0.9, 0.9, 0.88); }
  return r < 0.5 ? a : b;
}
float isBrick(float style, float s) {
  float k = fract(s * 7.31);
  if (style > 5.5) return 0.0;
  return style < 0.5 ? step(k, 0.58) : style > 0.5 && style < 1.5 ? step(0.84, k) : style > 3.5 && style < 4.5 ? step(0.5, k) : style > 4.5 ? step(0.55, k) : 0.0;
}
`;

const VERT = /* glsl */ `
  attribute vec4 aEdge; attribute vec4 aBld;
  uniform float uLift;
  varying vec3 vN; varying vec4 vEdge; varying vec4 vBld; varying vec3 vPos; varying float vDist;
  #ifdef REC
  attribute vec4 aRec0, aRec1, aRec2, aRec3;
  varying vec4 vR0, vR1, vR2, vR3;
  #endif
  void main() {
    vec3 p = position;
    p.y += uLift * step(0.01, position.y);
    vN = normal; vEdge = aEdge; vBld = aBld; vPos = position;
    #ifdef REC
    vR0 = aRec0; vR1 = aRec1; vR2 = aRec2; vR3 = aRec3;
    #endif
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uBld, uRoof, uTint; uniform float uGlow;
  varying vec3 vN; varying vec4 vEdge; varying vec4 vBld; varying vec3 vPos; varying float vDist;
  #ifdef REC
  varying vec4 vR0, vR1, vR2, vR3;
  #endif
  ${GLSL_COLORS}
  /** 부드러운 사각형 안(0~1). p 와 경계는 같은 단위, w 는 화면 한 점의 크기 */
  float rect(vec2 p, vec2 lo, vec2 hi, vec2 w) {
    vec2 a = smoothstep(lo - w, lo + w, p) * (1.0 - smoothstep(hi - w, hi + w, p));
    return a.x * a.y;
  }
  /**
   * 1층 유리(가게·로비)를 평평한 판 대신 칸 나눈 유리로: 약 1.6m 마다 문살, 문 높이 가로대, 아래 0.35m 밑판(돌려주는 값 0~1).
   * inner 는 실내 밝기(천장 쪽이 밝고 바닥 쪽이 어둡다, 유리 칸마다 진열이 달라 조금씩 다르다)
   */
  float glassBays(float u, float uw, float y, float gh, float uid, float s, float detail, out float inner) {
    float mu = u / (uw / max(2.0, floor(uw / 1.6 + 0.5)));
    float mw = fwidth(mu);
    float mull = 1.0 - smoothstep(0.03, 0.03 + mw, min(fract(mu), 1.0 - fract(mu)));
    float tw = fwidth(y);
    float tr = 1.0 - smoothstep(0.05, 0.05 + tw, abs(y - min(2.3, gh - 1.3)));
    float kick = 1.0 - smoothstep(0.35, 0.35 + tw, y);
    inner = mix(0.35, 1.0, smoothstep(0.3, gh - 1.2, y)) * (0.7 + 0.4 * hash21(vec2(floor(mu), uid) + s * 5.1));
    return max(max(mull, tr), kick) * clamp(detail * 1.5, 0.0, 1.0);
  }
  void main() {
    float fi = focusIn(vPos.xz);
    if (fi > 0.01 && dither(gl_FragCoord.xy) < fi * 0.82) discard;
    float st = vBld.x, s = vBld.y / 255.0, gh = vBld.z / 20.0, fh = max(2.4, vBld.w / 20.0);
    // 명소 전용 모양(6~)은 기본 모양을 따른다: 6 석재·8 상상마당 → 공공, 7 녹색 격자·10 푸른 유리·11 유리 주거 탑 → 커튼월, 9 몰 → 상가
    float style = st < 5.5 ? st : st < 6.5 ? 5.0 : st < 7.5 ? 2.0 : st < 8.5 ? 5.0 : st < 9.5 ? 1.0 : 2.0;
    // 표시 값: 붙음·부분(16 아래) + 16 × 1층 가게 종류 + 128 × 위층 가게 종류 + 1024 × 가게 층 표시(1 지하 2 1층 4 2층 8 3층 위)
    float smask = floor(vEdge.z / 1024.0 + 0.001);
    float fz = vEdge.z - 1024.0 * smask;
    float upK = floor(fz / 128.0 + 0.001);
    fz -= 128.0 * upK;
    float shopK = floor(fz / 16.0 + 0.001);
    float fl0 = fz - 16.0 * shopK;
    float on1F = mod(floor(smask / 2.0), 2.0), on2F = mod(floor(smask / 4.0), 2.0), on3F = step(7.5, smask);
    float party = step(7.5, fl0);
    float part = fl0 - 8.0 * party;
    vec3 n = normalize(vN);
    // 명소 전용 외벽은 실제 색이 보이도록 랜드마크 색을 옅게만 입힌다
    vec3 tint = st > 5.5 ? mix(vec3(1.0), uTint, 0.35) : uTint;
    vec3 wall = wallColor(st, s) * uBld * tint;
    // 로드뷰 기록: 표시(1 외벽 2 1층 외벽 4 지붕 8 유리 16 세대 단위 불빛)와 재질(0 미확인 1 도장 2 벽돌 3 석재 4 타일 5 유리 6 금속 7 노출 콘크리트)
    float rf = 0.0, rmat = 0.0;
    #ifdef REC
    rf = floor(vR1.a * 255.0 + 0.5);
    rmat = floor(vR0.a * 255.0 + 0.5);
    if (mod(rf, 2.0) > 0.5) wall = vR0.rgb * uBld * tint;
    #endif
    float recRoof = mod(floor(rf / 4.0), 2.0);
    vec3 col;
    vec3 glow = vec3(0.0);
    float lightsOn = uNight * (1.0 - fi);
    // 켜진 창 비율: 한밤에도 열에 한두 집은 켜져 있게
    float litFrac = clamp(uLit * 1.15 + 0.045 * uNight, 0.0, 1.0);

    if (part > 3.5) {
      // 필로티: 안쪽으로 들인 어두운 1층(주차 칸)
      col = lit(vec3(0.13, 0.13, 0.14) * uBld * mix(0.75, 1.0, smoothstep(0.0, 3.0, vPos.y)), n);
    } else if (part > 0.5 && part < 1.5) {
      // 평지붕: 녹색 우레탄 방수·회색 콘크리트·밝은 도장, 3m 칸마다 얼룩
      float k = fract(s * 13.7);
      vec3 rc = st > 5.5 ? vec3(0.78, 0.79, 0.8) : style < 1.5 || style > 3.5 ? (k < 0.42 ? vec3(0.55, 0.72, 0.6) : k < 0.72 ? vec3(0.76, 0.76, 0.74) : k < 0.88 ? vec3(0.95, 0.95, 0.93) : vec3(0.62, 0.58, 0.54))
                                           : (k < 0.6 ? vec3(0.74, 0.75, 0.75) : vec3(0.9, 0.9, 0.89));
      #ifdef REC
      if (recRoof > 0.5) rc = vR2.rgb;
      #endif
      rc *= 0.94 + 0.08 * hash21(floor(vPos.xz / 3.0) + s * 17.0);
      col = lit(rc * uRoof * tint, n);
    } else if (part > 2.5) {
      // 경사 지붕: 기와·금속 지붕 색, 비탈을 따라 골
      float k = fract(s * 5.9);
      vec3 rc = k < 0.35 ? vec3(0.42, 0.47, 0.55) : k < 0.6 ? vec3(0.66, 0.38, 0.3) : k < 0.8 ? vec3(0.36, 0.33, 0.31) : vec3(0.38, 0.52, 0.45);
      #ifdef REC
      if (recRoof > 0.5) rc = vR2.rgb;
      #endif
      float gw = fwidth(vPos.y) * 3.0;
      rc *= 1.0 - 0.12 * smoothstep(0.5 - gw, 0.5, abs(fract(vPos.y / 0.35) - 0.5) * 2.0) * step(gw, 0.3);
      col = lit(rc * uTint * mix(uRoof, uBld, 0.5), n);
    } else if (part > 1.5) {
      // 난간: 윗면은 갓돌, 안쪽은 벽색
      col = lit(mix(wall, uRoof * uTint, 0.35) * (n.y > 0.5 ? 1.08 : 0.92), n);
    } else {
      float u = vEdge.x, len = vEdge.y, top = vEdge.w, y = vPos.y;
      bool hasGround = gh > 0.5;
      float yy = hasGround ? y - gh : y;
      float fl = yy / fh;
      float floorI = hasGround ? (y < gh ? 0.0 : 1.0 + floor(fl)) : floor(fl);
      float fy = hasGround && y < gh ? y / gh : fract(fl);
      float flH = hasGround && y < gh ? gh : fh;
      // 기둥 사이 칸: 변마다 양 끝에서 맞춘다
      float bayW = style < 0.5 ? 2.7 : style < 1.5 ? 3.3 : style < 2.5 ? 1.5 : style < 3.5 ? 2.9 : style < 4.5 ? 3.0 : 3.6;
      float nb = max(1.0, floor(len / bayW + 0.5));
      float bw = len / nb;
      float bu = u / bw;
      float bid = floor(bu);
      float bx = fract(bu);
      vec2 w = vec2(fwidth(bu), fwidth(y / flH)) * 0.75;
      // 멀어서 칸이 몇 점밖에 안 되면 무늬 대신 평균색
      float detail = clamp(1.6 - max(w.x * 6.0, w.y * 5.0), 0.0, 1.0);
      float cellR = hash21(vec2(bid, floorI) + s * 91.7);
      float cellR2 = hash21(vec2(bid * 1.7 + 3.1, floorI * 2.3) + s * 13.3);
      float windows = (1.0 - party) * step(1.5, len) * (1.0 - step(top - 0.05, y));

      vec3 alb = wall;
      // 벽돌: 0.15m 줄눈(가까이서만)
      float brick = isBrick(st, s);
      #ifdef REC
      // 기록 1층 외벽 색(1층 높이 안)
      if (mod(floor(rf / 2.0), 2.0) > 0.5 && y < (hasGround ? gh : fh)) alb = vR1.rgb * uBld * tint;
      if (rmat > 0.5) brick = step(1.5, rmat) * step(rmat, 2.5);
      // 석재·타일 판 줄눈, 금속 판 세로 이음, 노출 콘크리트 판과 폼타이 구멍
      if (rmat > 2.5 && rmat < 4.5) {
        vec2 sp = vec2(u / (rmat < 3.5 ? 1.2 : 0.6), y / (rmat < 3.5 ? 0.6 : 0.3));
        vec2 sw = fwidth(sp);
        float j = max(smoothstep(0.95 - sw.x, 0.95, fract(sp.x)), smoothstep(0.93 - sw.y, 0.93, fract(sp.y)));
        alb *= 1.0 - (0.07 * j - 0.025 * hash21(floor(sp) + s)) * clamp(1.5 - max(sw.x, sw.y) * 3.0, 0.0, 1.0);
      } else if (rmat > 5.5 && rmat < 6.5) {
        float sx = u / 0.5, sw = fwidth(sx);
        alb *= 1.0 - 0.08 * smoothstep(0.92 - sw, 0.92, fract(sx)) * clamp(1.5 - sw * 3.0, 0.0, 1.0);
      } else if (rmat > 6.5) {
        vec2 cp = vec2(u / 1.8, y / 0.9), cw = fwidth(cp);
        float pl = max(smoothstep(0.97 - cw.x, 0.97, fract(cp.x)), smoothstep(0.95 - cw.y, 0.95, fract(cp.y)));
        vec2 hp = fract(cp * vec2(3.0, 2.0)) - 0.5;
        float hole = 1.0 - smoothstep(0.05, 0.08, length(hp * vec2(0.6, 0.45)));
        alb *= 1.0 - (0.06 * pl + 0.12 * hole - 0.03 * hash21(floor(cp) + s)) * clamp(1.5 - max(cw.x, cw.y) * 4.0, 0.0, 1.0);
      }
      #endif
      if (brick > 0.5) {
        vec2 bp = vec2(u / 0.26 + 0.5 * mod(floor(y / 0.15), 2.0), y / 0.15);
        vec2 bwid = fwidth(bp);
        float mortar = max(smoothstep(0.9 - bwid.y, 0.9, fract(bp.y)), smoothstep(0.92 - bwid.x, 0.92, fract(bp.x)));
        alb *= 1.0 + (0.1 * mortar - 0.04 * hash21(floor(bp))) * clamp(1.5 - max(bwid.x, bwid.y) * 3.0, 0.0, 1.0);
      }
      // 층 사이 띠(슬래브)
      float slab = (1.0 - smoothstep(0.0, 0.07 + w.y, fy)) * windows * step(0.5, floorI + (hasGround ? 0.0 : 1.0));
      alb *= 1.0 - 0.07 * slab;

      // 창: 용도별 크기
      vec2 lo, hi;
      float frameW = 0.07;
      if (style < 0.5) {               // 빌라: 작은 창, 칸마다 거실 큰 창
        float big = step(0.72, cellR);
        lo = vec2(mix(0.28, 0.12, big), 0.3); hi = vec2(mix(0.72, 0.88, big), mix(0.78, 0.84, big));
      } else if (style < 1.5) {        // 상가: 넓은 창
        lo = vec2(0.1, 0.24); hi = vec2(0.9, 0.86);
      } else if (style < 2.5) {        // 커튼월: 유리 전체, 아래쪽 스팬드럴
        lo = vec2(0.03, 0.26); hi = vec2(0.97, 0.98); frameW = 0.03;
      } else if (style < 3.5) {        // 아파트: 발코니 창
        lo = vec2(0.06, 0.34); hi = vec2(0.94, 0.92);
      } else if (style < 4.5) {        // 주택
        lo = vec2(0.3, 0.36); hi = vec2(0.7, 0.78);
      } else {                         // 공공 건물
        lo = vec2(0.18, 0.28); hi = vec2(0.82, 0.82);
      }
      if (st > 5.5 && st < 6.5) { lo = vec2(0.42, 0.12); hi = vec2(0.58, 0.92); }   // 석재 기둥: 좁고 긴 세로 창
      if (st > 6.5 && st < 7.5) { lo = vec2(0.1, 0.14); hi = vec2(0.9, 0.86); }     // 녹색 유리 격자
      // 로드뷰 기록: 작은 창 면(발코니 창 대신 좁은 창, 난간 띠·세대 벽 없음)
      float smallWin = 0.0;
      #ifdef REC
      smallWin = step(0.002, vR3.a) * step(vR3.a, 0.006);
      if (smallWin > 0.5) { lo = vec2(0.36, 0.42); hi = vec2(0.64, 0.82); }
      if (vR3.a > 0.006) windows = 0.0;   // 창 없는 벽
      #endif
      vec2 q = vec2(bx, fy);
      float win = rect(q, lo, hi, w) * windows;
      if (st > 7.5 && st < 8.5) {
        // 상상마당: 노출 콘크리트에 굽이치는 유리 띠(층과 상관없이 벽을 가로질러 흐른다)
        float wave = (y + 1.6 * sin(u * 0.33 + s * 6.0) + 0.7 * sin(u * 0.91 + 1.3)) / 5.2;
        float fw2 = fwidth(wave) + 0.002;
        win = smoothstep(0.52 - fw2, 0.52 + fw2, fract(wave)) * (1.0 - smoothstep(0.86 - fw2, 0.86 + fw2, fract(wave))) * windows * step(gh + 0.5, y);
        float panel = step(0.97, fract(u / 1.2)) + step(0.96, fract(y / 0.6));     // 거푸집 자국
        alb *= 1.0 - 0.06 * min(1.0, panel) * detail;
      }
      vec2 fr = vec2(frameW / bw, frameW / flH);
      float frame = win * (1.0 - rect(q, lo + fr, hi - fr, w));
      // 창 가운데 문살
      frame = max(frame, win * (1.0 - smoothstep(0.0, w.x + 0.012, abs(bx - 0.5 * (lo.x + hi.x)))) * step(style, 1.5) * step(0.4, cellR2));
      float glass = win - frame;

      vec3 glassCol = vec3(0.2, 0.25, 0.3);
      vec3 frameCol = style < 0.5 || style > 2.5 ? vec3(0.96, 0.96, 0.95) : vec3(0.32, 0.34, 0.37);
      float sign = 0.0;
      vec3 signCol = vec3(0.0);
      float shopGlass = 0.0;
      float shopFrame = 0.0;
      float shopIn = 1.0;
      float doorLit = 0.0;

      if (style > 1.5 && style < 2.5) {
        // 커튼월: 멀리언·스팬드럴, 하늘이 비친다
        glassCol = mix(vec3(0.24, 0.36, 0.42), vec3(0.34, 0.4, 0.47), step(0.5, fract(s * 3.3)));
        if (st > 6.5 && st < 7.5) glassCol = vec3(0.3, 0.46, 0.38);
        if (st > 9.5 && st < 10.5) glassCol = vec3(0.2, 0.36, 0.55);
        if (st > 10.5) glassCol = vec3(0.22, 0.3, 0.62);
        frameCol = wall;
        float span = 1.0 - rect(q, vec2(-1.0, lo.y), vec2(2.0, 2.0), w);
        alb = mix(alb, glassCol * 0.75, span * windows);
      }
      #ifdef REC
      if (mod(floor(rf / 8.0), 2.0) > 0.5) glassCol = vR3.rgb * 0.8;
      #endif
      if (style > 2.5 && style < 3.5 && smallWin < 0.5) {
        // 아파트: 발코니 난간 띠
        float rail = rect(q, vec2(0.0, 0.3), vec2(1.0, 0.36), w) * windows;
        alb = mix(alb, vec3(0.7, 0.72, 0.74) * uBld, rail);
        // 세대 사이 벽(두 칸마다)
        float wallStrip = step(mod(bid, 2.0), 0.5) * (1.0 - smoothstep(0.0, 0.06 + w.x, bx));
        glass *= 1.0 - wallStrip; frame *= 1.0 - wallStrip;
      }
      if (upK > 0.5 && st < 8.5 && (style < 1.5 || style > 2.5)) {
        // 위층 가게(실제 층): 2층 가게면 2층, 3층 위 가게면 3~5층 창 아래 간판 띠, 세로 간판(건물의 20%).
        // 띠는 칸마다 흩지 않고 한 면의 한 층에 이어 붙인 판(약 6m 마다 다른 가게)으로 그린다. 커튼월 사무 건물에는 두지 않는다
        float atF = on2F * step(0.5, floorI) * step(floorI, 1.5) + on3F * step(1.5, floorI) * step(floorI, 4.5);
        float faceR = hash21(vec2(floor(len * 7.3) + 2.0, floorI) + s * 7.0);
        float pn = max(1.0, floor(len / 6.0 + 0.5));
        float pu = u / (len / pn);
        float px = fract(pu);
        float sr = hash21(vec2(floor(pu) * 0.37 + 5.0, floorI) + s * 7.0);
        float band = rect(vec2(px, fy), vec2(0.015, 0.04), vec2(0.985, 0.25), vec2(fwidth(pu), w.y)) * step(faceR, 0.6) * min(1.0, atF) * step(4.0, len);
        float vert = rect(vec2(u, y), vec2(0.35, gh + 0.4), vec2(1.15, min(top - 0.8, gh + fh * 2.0)), vec2(fwidth(u), fwidth(y))) * step(0.8, fract(s * 23.0));
        sign = max(band, vert) * windows;
        signCol = signColor(upK, fract(sr * 7.0 + floorI * 0.31));
        // 간판 글자(흰 획)
        float gx = fract(u / 0.55), gyy = fract(y / 0.5);
        float glyph = step(0.25, gx) * step(gx, 0.75) * step(0.3, gyy) * step(gyy, 0.75) * step(0.35, hash21(floor(vec2(u / 0.55, y / 0.5)) + sr)) * (1.0 - band * (1.0 - step(0.2, px) * step(px, 0.6)));
        signCol = mix(signCol, signCol.r + signCol.g + signCol.b > 2.2 ? vec3(0.1) : vec3(1.0), glyph * 0.85 * detail);
      }
      // 1층
      bool open = party < 0.5;
      if (open && hasGround && y < gh) {
        if (shopK > 0.5) {
          // 가게: 칸(약 4.5m)마다 유리, 사이 기둥, 위 간판 띠
          float nu = max(1.0, floor(len / 4.5 + 0.5));
          float uw = len / nu;
          float uid = floor(u / uw);
          float ux = fract(u / uw);
          vec2 uq = vec2(ux, y);
          vec2 uwd = vec2(fwidth(u / uw), fwidth(y));
          // 지하 가게만 있으면 유리 없이 간판 띠만
          shopGlass = rect(uq, vec2(0.05, 0.12), vec2(0.95, gh - 1.0), uwd) * on1F;
          shopFrame = glassBays(u, uw, y, gh, uid, s, detail, shopIn) * shopGlass;
          shopGlass *= 1.0 - shopFrame;
          float ur = hash21(vec2(uid, 7.0) + s * 3.7);
          float sb = rect(uq, vec2(0.02, gh - 0.92), vec2(0.98, gh - 0.12), uwd);
          sign = max(sign, sb);
          signCol = sb > 0.5 ? signColor(shopK, ur) : signCol;
          float gx = fract(u / 0.42), gyy = (y - (gh - 0.92)) / 0.8;
          float glyph = step(0.2, gx) * step(gx, 0.8) * step(0.25, gyy) * step(gyy, 0.75) * step(0.3, hash21(vec2(floor(u / 0.42), 1.0) + ur)) * step(ux, 0.75) * step(0.25, ux);
          signCol = mix(signCol, signCol.r + signCol.g + signCol.b > 2.2 ? vec3(0.12) : vec3(1.0), glyph * sb * 0.9 * detail);
          doorLit = shopOpen(shopK, ur);
          glass = 0.0; frame = 0.0;
        } else {
          // 로비 유리
          lo = vec2(0.08, 0.04); hi = vec2(0.92, 0.82);
          shopGlass = rect(q, lo, hi, w);
          shopFrame = glassBays(u, bw, y, gh, bid, s, detail, shopIn) * shopGlass;
          shopGlass *= 1.0 - shopFrame;
          glass = 0.0; frame = 0.0;
          doorLit = step(0.3, cellR);
        }
      }

      // 멀리서는 무늬 대신 평균
      float meanWin = style < 0.5 ? 0.22 : style < 1.5 ? 0.45 : style < 2.5 ? 0.7 : style < 3.5 ? 0.45 : style < 4.5 ? 0.15 : 0.3;
      glass = mix(meanWin * 0.85 * windows, glass, detail);
      frame = mix(meanWin * 0.15 * windows, frame, detail);
      sign = mix(sign * 0.6, sign, detail);

      alb = mix(alb, frameCol * uBld, frame);
      alb = mix(alb, signCol, sign);
      alb = mix(alb, vec3(0.16, 0.15, 0.14), shopGlass * 0.85);
      alb = mix(alb, vec3(0.24, 0.25, 0.27) * uBld, shopFrame);
      // 바닥 쪽 그늘
      alb *= mix(0.8, 1.0, smoothstep(0.0, 8.0, y));
      col = lit(alb, n);
      // 유리: 어둡고, 하늘이 비친다(밤에는 꺼진 창이 벽보다 조금 어둡다)
      vec3 view = normalize(vPos - cameraPosition);
      float fres = 0.35 + 0.65 * pow(1.0 - abs(dot(view, n)), 3.0);
      vec3 sky = mix(uFogCol, uSkyCol, 0.5) * (1.0 - 0.6 * uNight);
      vec3 gcol = glassCol * (0.6 + 0.4 * dot(uSkyCol, vec3(0.33))) + sky * fres * (style > 1.5 && style < 2.5 ? 0.6 : 0.35);
      col = mix(col, gcol * (1.0 - 0.2 * uNight), glass);
      col = mix(col, col * 0.55 + gcol * 0.25, shopGlass * 0.6);

      // 밤 불빛
      float on = step(cellR2, litFrac);
      vec3 warm = mix(vec3(1.0, 0.8, 0.52), vec3(0.82, 0.9, 1.0), step(0.78, fract(cellR * 17.0)));
      if (mod(floor(rf / 16.0), 2.0) > 0.5) {
        // 기록한 아파트: 두 칸이 한 세대라 같이 켜지고 꺼진다. 세대마다 조명 색이 조금 다르다
        float unitR = hash21(vec2(floor(bid / 2.0) * 3.7 + 1.3, floorI * 1.9) + s * 29.0);
        on = step(unitR, litFrac * 1.1);
        warm = mix(vec3(1.0, 0.8, 0.52), vec3(0.86, 0.9, 1.0), step(0.7, fract(unitR * 13.0)));
      }
      if (style > 1.5 && style < 2.5) {
        // 사무실: 층 단위로, 시각에 따라(officeLit) 켜지고, 켜진 층도 구역(4칸)마다 꺼진 곳이 있다.
        // 실내 천장등이라 창 위쪽이 밝고 아래쪽은 어둡다(유리 전체가 하얀 판처럼 빛나지 않게)
        on = step(hash21(vec2(floorI, s * 51.0)), officeLit()) * step(hash21(vec2(floor(bid / 4.0), floorI) + s * 3.3), 0.8);
        warm = vec3(0.85, 0.9, 0.95) * 0.5 * mix(0.35, 1.0, smoothstep(0.35, 0.95, fy));
      }
      float farLit = style > 1.5 && style < 2.5 ? officeLit() * 0.8 * 0.7 : litFrac * 0.35;
      float e = mix(farLit * windows * meanWin, glass * on * (0.55 + 0.45 * fract(cellR * 31.0)), detail);
      glow += warm * e;
      // 가게 유리: 영업 중일 때만(주점은 호박색, 그 밖은 따뜻한 흰빛), 로비 유리는 예전처럼
      vec3 shopLight = shopK > 2.5 && shopK < 3.5 ? vec3(1.0, 0.68, 0.42) : vec3(1.0, 0.85, 0.62);
      glow += (shopK > 0.5 ? shopLight * doorLit * 0.8 : vec3(1.0, 0.8, 0.56) * doorLit * min(1.0, 0.35 + uLit * 2.4) * 0.75) * shopIn * shopGlass;
      float signK = hasGround && y < gh ? shopK : upK;
      glow += signCol * sign * 0.6 * shopOpen(signK, fract(s * 17.3)) * step(0.25, fract(s * 41.0 + floorI * 0.37));
      // 2층 가게(카페 등): 영업 중이면 2층 창이 가게 불빛으로
      glow += shopLight * glass * on2F * step(0.5, upK) * step(0.5, floorI) * step(floorI, 1.5) * shopOpen(upK, cellR) * 0.6 * detail;
      col += glow * lightsOn;
    }
    col += uTint * uGlow * (0.1 + 0.28 * uNight);
    col = mix(col, col * 0.7 + vec3(0.04, 0.07, 0.11), fi * 0.5);
    gl_FragColor = vec4(fogged(col, vDist), 1.0);
  }`;

/** rec: 로드뷰 기록 값(aRec0~3)을 읽는 셰이더 */
export function buildingMaterial(tint = '#ffffff', rec = false) {
  const def = rec ? '#define REC\n' : '';
  return material({
    vertex: def + VERT,
    fragment: def + FRAG,
    doubleSide: true,
    uniforms: { uBld: { value: pal.bld }, uRoof: { value: pal.roof }, uTint: { value: new THREE.Color(tint) }, uGlow: { value: 0 }, uLift: { value: 0 } },
  });
}

// ───────────────────────── 옥상·외벽 소품 ─────────────────────────
/** 소품 종류(셰이더의 kind) */
const PROP = { room: 0, ac: 1, tank: 2, machine: 3, awning: 4, sign: 5, roomRGB: 6, hip: 7 } as const;

/** 소품 자리: [x, y, z, 방향, 너비(x), 높이, 깊이(z), 종류, r, g, b, 난수] */
export function propsOf(list: Building[], lk: Look[]): number[] {
  const out: number[] = [];
  const push = (x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, kind: number, c: [number, number, number], r: number) =>
    out.push(x, y, z, yaw, sx, sy, sz, kind, c[0], c[1], c[2], r);
  // 돌출 간판 색: 업종별 두 가지(셰이더 signColor 와 같은 값)
  const SIGNS: [number, number, number][][] = [
    [[0.46, 0.5, 0.56], [0.8, 0.76, 0.68]],
    [[0.36, 0.5, 0.4], [0.52, 0.4, 0.32]],
    [[0.64, 0.32, 0.26], [0.74, 0.6, 0.34]],
    [[0.72, 0.5, 0.26], [0.46, 0.32, 0.44]],
    [[0.3, 0.46, 0.6], [0.36, 0.56, 0.46]],
    [[0.3, 0.56, 0.52], [0.9, 0.9, 0.88]],
    [[0.46, 0.5, 0.56], [0.8, 0.76, 0.68]],
  ];
  // 차양 천: 짙은 녹색·자주·남색·생지·회색·황토(원색을 피한다)
  const AWN: [number, number, number][] = [[0.24, 0.4, 0.34], [0.56, 0.3, 0.28], [0.26, 0.32, 0.46], [0.85, 0.82, 0.74], [0.3, 0.3, 0.32], [0.74, 0.58, 0.36]];
  list.forEach((b, bi) => {
    const L = lk[bi];
    const p = b.pts;
    const n = p.length / 2;
    const s = L.seed;
    // 옥상: 평지붕만(맨 위 덩어리 바닥 안)
    if (L.parapet > 0 && b.h - (b.minH ?? 0) > 5) {
      const p = L.tiers[L.tiers.length - 1].ring;
      const o = obb(p);
      const yaw = Math.atan2(o.az, o.ax);
      const roofY = b.h - L.parapet + 0.25;
      const fits = (x: number, z: number, hx: number, hz: number, m: number) => {
        for (const [a, c] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
          const px = x + o.ax * a * hx - o.az * c * hz;
          const pz = z + o.az * a * hx + o.ax * c * hz;
          if (!inPoly(p, px, pz) || edgeDist(p, px, pz) < m) return false;
        }
        return true;
      };
      const taken: [number, number, number][] = [];
      const free = (x: number, z: number, r: number) => taken.every(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) > tr + r);
      const items = L.rec?.detail?.roofItems;
      if (items) {
        // 로드뷰·항공사진으로 기록한 옥상 소품만 둔다(기본 기계실·실외기는 두지 않는다)
        for (const it of items) {
          const [x, z] = xz(it.ll);
          const c = hexRGB(it.color);
          if (it.kind === 'hipRoom') {
            push(x, roofY, z, yaw, it.w, it.h, it.d, PROP.roomRGB, c, s);
            push(x, roofY + it.h, z, yaw, it.w + 0.5, it.roofH ?? 2, it.d + 0.5, PROP.hip, hexRGB(it.roofColor ?? it.color), s);
          } else push(x, roofY, z, yaw, it.w, it.h, it.d, PROP.machine, c, s);
        }
      } else if (L.base === STYLE.apt) {
        // 아파트: 판상형은 계단실마다 엘리베이터 기계실, 타워형은 가운데 기계실과 옆 물탱크실
        const slab = o.L / Math.max(1, o.W) >= 2.2;
        const hz = Math.max(1.5, Math.min(2.4, o.W * 0.3));
        const boxes: [number, number, number, number][] = [];
        if (slab) {
          const k = Math.max(2, Math.round(o.L / 18));
          for (let q = 0; q < k; q++) boxes.push([(-0.5 + (q + 0.5) / k) * o.L * 0.88, Math.min(2.4, o.L / (k * 3)), hz, 3.2]);
        } else {
          const hx = Math.max(2, o.L * 0.18);
          boxes.push([0, hx, Math.max(2, o.W * 0.18), 3.6], [hx + 2.2, 1.6, 1.6, 2.6]);
        }
        for (const [a, hx, hzz, hy] of boxes) {
          const x = o.cx + o.ax * a;
          const z = o.cz + o.az * a;
          if (!fits(x, z, hx, hzz, 0.6)) continue;
          push(x, roofY, z, yaw, hx * 2, hy, hzz * 2, PROP.machine, hy < 3 ? [0.8, 0.8, 0.78] : [0.66, 0.67, 0.68], s);
          taken.push([x, z, Math.hypot(hx, hzz)]);
        }
      } else if (L.base === STYLE.glass) {
        // 기계실·엘리베이터 탑
        const hx = Math.max(2, o.L * 0.22), hz = Math.max(2, o.W * 0.22);
        if (fits(o.cx, o.cz, hx, hz, 0.8)) {
          // 60m 넘는 건물은 기계실 지붕에 헬리포트(원과 H)
          push(o.cx, roofY, o.cz, yaw, hx * 2, L.base === STYLE.glass ? 4.2 : 3.4, hz * 2, PROP.machine, [0.62, 0.64, 0.66], b.h > 60 && hx > 5 && hz > 5 ? 2 : s);
          taken.push([o.cx, o.cz, Math.hypot(hx, hz)]);
        }
      } else if (L.floors >= 2 && o.L * o.W > 50) {
        // 계단실 옥탑: 바닥 상자 가운데에서 한쪽으로 치우쳐 들어가는 자리
        const hx = Math.min(2.2, o.L * 0.22), hz = Math.min(1.6, o.W * 0.25);
        const shift = (rnd(s, 1) - 0.5) * Math.max(0, o.L - hx * 2 - 1.5);
        for (const k of [shift, shift * 0.5, 0, -shift]) {
          const x = o.cx + o.ax * k;
          const z = o.cz + o.az * k;
          if (fits(x, z, hx, hz, 0.4)) {
            if (L.rec?.wall) push(x, roofY, z, yaw, hx * 2, 2.6, hz * 2, PROP.roomRGB, L.rec.wall, s);
            else push(x, roofY, z, yaw, hx * 2, 2.6, hz * 2, PROP.room, [s, L.style, 0], s);
            taken.push([x, z, Math.hypot(hx, hz)]);
            break;
          }
        }
      }
      // 물탱크(빌라·주택 일부)와 실외기(옥상 소품을 기록한 건물은 두지 않는다)
      const tries = L.base === STYLE.glass ? 10 : 6;
      let acs = items ? 0 : L.base === STYLE.shop ? 3 + Math.floor(rnd(s, 2) * 5) : L.base === STYLE.villa ? 1 + Math.floor(rnd(s, 2) * 3) : 2 + Math.floor(rnd(s, 2) * 4);
      if (o.L * o.W < 40) acs = Math.min(acs, 1);
      let tank = !items && (L.base === STYLE.villa || L.base === STYLE.house) && rnd(s, 4) < 0.35;
      for (let k = 0; k < tries * 3 && (acs > 0 || tank); k++) {
        const a = (rnd(s, 10 + k) - 0.5) * o.L * 0.9;
        const c = (rnd(s, 40 + k) - 0.5) * o.W * 0.9;
        const x = o.cx + o.ax * a - o.az * c;
        const z = o.cz + o.az * a + o.ax * c;
        if (tank) {
          if (fits(x, z, 0.7, 0.7, 0.5) && free(x, z, 1)) {
            push(x, roofY, z, yaw, 1.4, 1.5, 1.4, PROP.tank, rnd(s, 5) < 0.5 ? [0.92, 0.93, 0.94] : [0.35, 0.55, 0.78], s);
            taken.push([x, z, 1]);
            tank = false;
          }
          continue;
        }
        if (fits(x, z, 0.45, 0.2, 0.35) && free(x, z, 0.5)) {
          push(x, roofY, z, yaw + (rnd(s, 70 + k) < 0.5 ? 0 : Math.PI), 0.86, 0.66, 0.32, PROP.ac, [0.9, 0.9, 0.88], rnd(s, 80 + k));
          taken.push([x, z, 0.5]);
          acs--;
        }
      }
    }
    // 가게 앞(가게가 붙은 건물만): 1층 가게가 있으면 트인 변에 차양, 위층 가게가 있으면 돌출 간판. 난수 자리(vC.w)에 가게 종류를 더해 불 끄는 시각을 셰이더에 넘긴다
    if (!L.shopK && !L.upK) return;
    let signs = 0;
    for (let i = 0; i < n; i++) {
      if (L.open[i] === 0) continue;
      const j = (i + 1) % n;
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 3.5) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const nx = dz, nz = -dx;
      const yaw = Math.atan2(-dz, -dx);
      const r = rnd(s, 100 + i);
      const awn = L.rec?.awning;
      if (L.shopK && L.shopMask & 2 && awn !== null && (awn ? signs === 0 && i === L.open.indexOf(2) : r < 0.45)) {
        // 차양: 가게 칸 몇 개에 걸쳐
        const w = Math.min(len - 1, 3 + rnd(s, 110 + i) * 6);
        const t = 0.5 + (rnd(s, 120 + i) - 0.5) * Math.max(0, len - w - 1);
        const at = Math.max(w / 2 + 0.3, Math.min(len - w / 2 - 0.3, t * len));
        push(ax + dx * at + nx * 0.55, L.gh - 0.75, az + dz * at + nz * 0.55, yaw, w, 0.12, 1.1, PROP.awning, awn ?? AWN[Math.floor(rnd(s, 130 + i) * AWN.length)], L.shopK + 0.9 * rnd(s, 140 + i));
      }
      if (L.upK && signs < 1 && L.floors >= 3 && rnd(s, 150 + i) < 0.5) {
        const end = rnd(s, 160 + i) < 0.5 ? 0.9 : len - 0.9;
        const hgt = Math.min(L.top - L.gh - 0.8, L.fh * (2 + Math.floor(rnd(s, 170 + i) * 2.5)));
        if (hgt > 2) {
          push(ax + dx * end + nx * 0.62, L.gh + 0.4, az + dz * end + nz * 0.62, yaw, 0.16, hgt, 0.95, PROP.sign, SIGNS[L.upK][rnd(s, 180 + i) < 0.5 ? 0 : 1], L.upK + 0.9 * rnd(s, 190 + i));
          signs++;
        }
      }
    }
  });
  return out;
}

const PROP_VERT = /* glsl */ `
  attribute vec4 aP; attribute vec4 aS; attribute vec4 aC;
  uniform float uLift;
  varying vec3 vN; varying vec3 vO; varying vec4 vS; varying vec4 vC; varying vec3 vPos; varying float vDist;
  void main() {
    vec3 o = position;
    vec3 p = o * aS.xyz;
    vec3 nn = normal;
    if (aS.w > 3.5 && aS.w < 4.5) p.y -= (o.z + 0.5) * 0.5;   // 차양은 바깥으로 기운다
    if (aS.w > 6.5) {
      // 사각뿔 지붕: 윗면 네 점을 꼭대기 한 점으로 모은다
      if (o.y > 0.5) p.xz = vec2(0.0);
      if (abs(nn.y) < 0.5) nn = normalize(vec3(nn.x * aS.y, 0.5 * (abs(nn.x) > 0.5 ? aS.x : aS.z), nn.z * aS.y));
    }
    float cs = cos(aP.w), sn = sin(aP.w);
    vec3 w = vec3(aP.x + p.x * cs - p.z * sn, aP.y + p.y, aP.z + p.x * sn + p.z * cs);
    vN = vec3(nn.x * cs - nn.z * sn, nn.y, nn.x * sn + nn.z * cs);
    vO = o; vS = aS; vC = aC; vPos = w;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
    if (vDist > 900.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);   // 멀면 그리지 않는다(몇 점도 안 된다)
  }`;

const PROP_FRAG = /* glsl */ `
  uniform vec3 uBld, uRoof;
  varying vec3 vN; varying vec3 vO; varying vec4 vS; varying vec4 vC; varying vec3 vPos; varying float vDist;
  ${GLSL_COLORS}
  void main() {
    float fi = focusIn(vPos.xz);
    if (fi > 0.01 && dither(gl_FragCoord.xy) < fi * 0.82) discard;
    vec3 n = normalize(vN);
    float kind = vS.w;
    vec3 c;
    vec3 glow = vec3(0.0);
    vec3 m = vO * vS.xyz;            // 상자 안 자리(m)
    if (kind > 6.5) {
      // 사각뿔 지붕(슁글): 처마와 나란한 줄
      c = vC.rgb * uRoof;
      c *= 1.0 - 0.1 * step(0.6, fract(vO.y * vS.y / 0.32));
    } else if (kind < 0.5 || kind > 5.5) {
      // 옥탑: 건물과 같은 벽색(기록이 있으면 기록 색), 앞(+x 면)에 문, 옆에 작은 창
      c = kind > 5.5 ? vC.rgb * uBld : wallColor(vC.y, vC.x) * uBld;
      float top = step(0.5, n.y);
      float door = step(0.49, vO.x) * step(abs(m.z), 0.45) * step(m.y, 2.05);
      float win = step(0.49, abs(vO.z)) * step(abs(m.x), 0.4) * step(1.2, m.y) * step(m.y, 1.8);
      c = mix(c, vec3(0.32, 0.34, 0.37), door);
      c = mix(c, vec3(0.2, 0.24, 0.28), win);
      c = mix(c, uRoof * 0.86, top);
      glow = vec3(1.0, 0.8, 0.55) * win * step(0.6, vC.w) * 0.8;
    } else if (kind < 1.5) {
      // 실외기: 흰 몸통, 앞면에 둥근 팬 그릴
      c = vec3(0.9, 0.9, 0.88) * uBld;
      float front = step(0.49, vO.z);
      float fan = 1.0 - smoothstep(0.2, 0.24, length(vec2(m.x - 0.12, m.y - 0.33)));
      c = mix(c, vec3(0.25, 0.26, 0.28), fan * front);
    } else if (kind < 2.5) {
      // 물탱크: 1m 패널 줄
      c = vC.rgb * uBld;
      vec2 g = abs(fract(vec2(m.x + m.z, m.y) / 0.7) - 0.5);
      c *= 1.0 - 0.12 * step(0.44, max(g.x, g.y));
    } else if (kind < 3.5) {
      // 기계실: 루버 줄, 높은 건물은 지붕에 헬리포트
      c = vC.rgb * uBld;
      c *= 1.0 - 0.15 * step(abs(n.y), 0.5) * step(0.5, fract(m.y / 0.3)) * step(m.y, vS.y - 0.6);
      if (vC.w > 1.5 && n.y > 0.5) {
        float r = length(m.xz);
        float ring = step(abs(r - 4.0), 0.35);
        vec2 hq = abs(m.xz);
        float H = step(hq.y, 1.9) * step(hq.x, 1.4) * (step(1.0, hq.x) + step(hq.y, 0.25));
        c = mix(vec3(0.42, 0.46, 0.44) * uBld, vec3(0.95, 0.95, 0.9), max(ring, H));
      }
    } else if (kind < 4.5) {
      // 차양: 천 색, 반은 흰 줄무늬
      c = vC.rgb;
      float stripe = step(0.5, fract(vC.w)) * step(0.5, fract(m.x / 0.5));
      c = mix(c, vec3(0.95, 0.94, 0.9), stripe);
      glow = c * 0.25;
    } else {
      // 돌출 간판: 바탕색에 흰 글자 블록, 밤에 켜진다
      c = vC.rgb;
      float side = step(0.49, abs(vO.x));
      float gy = fract(m.y / 0.55), gz = fract((m.z + 0.5) / 0.95);
      float glyph = side * step(0.18, gz) * step(gz, 0.82) * step(0.2, gy) * step(gy, 0.8) * step(0.3, hash21(vec2(floor(m.y / 0.55), vC.w * 31.0)));
      c = mix(c, c.r + c.g + c.b > 2.2 ? vec3(0.1) : vec3(1.0), glyph);
      glow = c * 0.6 * shopOpen(floor(vC.w), fract(vC.w));
    }
    vec3 col = lit(c, n) + glow * uNight * (1.0 - fi);
    gl_FragColor = vec4(fogged(col, vDist), 1.0);
  }`;

export function makeProps(list: Building[], lk: Look[]): THREE.Mesh {
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  box.deleteAttribute('uv');
  const data = propsOf(list, lk);
  const count = data.length / 12;
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = box.index;
  geo.setAttribute('position', box.attributes.position);
  geo.setAttribute('normal', box.attributes.normal);
  const P = new Float32Array(count * 4);
  const S = new Float32Array(count * 4);
  const C = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    P.set(data.slice(i * 12, i * 12 + 4), i * 4);
    S.set(data.slice(i * 12 + 4, i * 12 + 8), i * 4);
    C.set(data.slice(i * 12 + 8, i * 12 + 12), i * 4);
  }
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(S, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
  geo.instanceCount = count;
  const mesh = new THREE.Mesh(geo, material({ vertex: PROP_VERT, fragment: PROP_FRAG, uniforms: { uBld: { value: pal.bld }, uRoof: { value: pal.roof }, uLift: { value: 0 } } }));
  mesh.frustumCulled = false;
  return mesh;
}

/** recs: 판 건물 번호 → 로드뷰 기록. 기록이 있는 건물은 기록 값을 읽는 메시로 따로 그린다(기록이 없는 건물의 꼭짓점은 늘지 않는다) */
export function makeBuildings(all: Building[], recs: Map<number, BuildingRec> = new Map()): { group: THREE.Object3D; list: Building[]; looks: Look[] } {
  const list = refine(all.map((b, i) => (recs.has(i) ? applyRec(b, recs.get(i)!) : b)));
  const lk = looks(list);
  // 로드뷰 기록에서 hide 로 적은 구조물(출구 지붕과 겹치는 작은 건물)은 그리지 않는다
  const keep = list.map((b) => b.lm === 0 && !(b as { hidden?: boolean }).hidden);
  const group = new THREE.Group();
  for (const rec of [false, true]) {
    const pick = list.map((_, i) => keep[i] && !!lk[i].rec === rec);
    if (!pick.some(Boolean)) continue;
    const mesh = new THREE.Mesh(
      prismGeometry(
        list.filter((_, i) => pick[i]),
        lk.filter((_, i) => pick[i]),
        rec,
      ),
      buildingMaterial('#ffffff', rec),
    );
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  group.add(makeProps(list.filter((_, i) => keep[i]), lk.filter((_, i) => keep[i])));
  return { group, list, looks: lk };
}

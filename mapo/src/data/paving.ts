// 포장 구역(재작업 W51, 설계 문서 59절 G8): 로드뷰 기록의 포장 사각형(붉은 벽돌 보도 등)을 상자로 하나씩 쌓으면 기울기가 다른 변이 겹치고 벌어져
// 외곽이 톱니가 되고 조각 사이에 이음새가 보인다(걷고싶은거리 218개). 같은 재질·색끼리 0.25m 칸에 칠해 1m 안 틈을 메우고(닫기) 외곽선을 따서 다각형 하나로 그린다.
// 블록 포장은 찻길 면(surface.json g) 밖만 남기고, 칠한 포장(아스팔트 색칠)은 찻길 위에도 남긴다. 심은 곳(planting)은 지금처럼 상자로 그린다(render/detail.ts).
// 로드뷰 기록은 다른 작업이 손으로 고치므로 굽지 않고 앱이 불러올 때 만든다.
import { simplifyLoop, traceLoops } from '../../tools/lib/contour.ts';
import { xz, type PropRec } from './streetview.ts';
import { BOARD_R } from '../geo.ts';
import { GCELL, GNT, GTILE, groupLoops, loopArea, type TileRings } from './surface.ts';

export interface PavingZone {
  surface: string;
  color: string | undefined;
  /** 깎은 고리(판 좌표 [x, z, ...]): 바깥 고리 넓이 양수, 구멍 음수 */
  rings: Float32Array[];
}

const CELL = 0.25;
/** 메우는 틈(칸): 2칸씩 늘였다 줄이면 1m 안 틈이 메워진다 */
const CLOSE = 2;

type Paving = Extract<PropRec, { kind: 'paving' }>;

/** 포장 사각형(가운데, w 방향 반 길이 벡터, d 방향 반 길이 벡터)의 네 꼭짓점 */
export function pavingRect(p: Paving): number[] {
  const [x, z] = xz(p.ll);
  const r = (p.yaw * Math.PI) / 180;
  const [dx, dz] = [Math.sin(r), -Math.cos(r)];
  const [ux, uz] = [(dx * p.w) / 2, (dz * p.w) / 2];
  const [vx, vz] = [(-dz * p.d) / 2, (dx * p.d) / 2];
  return [x - ux - vx, z - uz - vz, x + ux - vx, z + uz - vz, x + ux + vx, z + uz + vz, x - ux + vx, z - uz + vz];
}

/** 짝홀 규칙으로 고리들을 칸 가운데 기준으로 칠한다(격자 n×n, 원점 x0·z0) */
function fill(g: Uint8Array, n: number, x0: number, z0: number, rings: ArrayLike<number>[], v: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of rings) for (let k = 1; k < r.length; k += 2) (lo = Math.min(lo, r[k])), (hi = Math.max(hi, r[k]));
  const xs: number[] = [];
  for (let j = Math.max(0, Math.floor((lo - z0) / CELL)); j <= Math.min(n - 1, Math.ceil((hi - z0) / CELL)); j++) {
    const zc = z0 + (j + 0.5) * CELL;
    xs.length = 0;
    for (const r of rings)
      for (let i = 0, m = r.length - 2; i < r.length; m = i, i += 2) {
        if (r[m + 1] <= zc === r[i + 1] <= zc) continue;
        xs.push(r[m] + ((zc - r[m + 1]) / (r[i + 1] - r[m + 1])) * (r[i] - r[m]));
      }
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const a = Math.max(0, Math.ceil((xs[q] - x0) / CELL - 0.5));
      const b = Math.min(n - 1, Math.floor((xs[q + 1] - x0) / CELL - 0.5));
      for (let i = a; i <= b; i++) g[j * n + i] = v;
    }
  }
}

/** 0/1 판 정사각형 (2r+1) 칸 늘이기·줄이기 */
function morph(a: Uint8Array, n: number, r: number, grow: boolean): Uint8Array {
  const t = new Uint8Array(a.length);
  const o = new Uint8Array(a.length);
  for (const [src, dst, h] of [[a, t, true], [t, o, false]] as const)
    for (let q = 0; q < n; q++)
      for (let i = 0; i < n; i++) {
        let v = grow ? 0 : 1;
        for (let d = -r; d <= r && v === (grow ? 0 : 1); d++) {
          const j = i + d;
          const x = j < 0 || j >= n ? 0 : h ? src[q * n + j] : src[j * n + q];
          if (grow ? x : !x) v = grow ? 1 : 0;
        }
        if (h) dst[q * n + i] = v;
        else dst[i * n + q] = v;
      }
  return o;
}

/** 깎은 닫힌 고리(차이킨 두 번) */
function smooth(p: number[]): number[] {
  let q = p;
  for (let it = 0; it < 2; it++) {
    const o: number[] = [];
    const n = q.length / 2;
    for (let k = 0; k < n; k++) {
      const [ax, az, bx, bz] = [q[k * 2], q[k * 2 + 1], q[((k + 1) % n) * 2], q[((k + 1) % n) * 2 + 1]];
      o.push(ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25, ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75);
    }
    q = o;
  }
  return q;
}

/**
 * 포장 사각형들(심은 곳 빼고)을 재질·색마다 포장 구역 다각형으로. road 는 찻길 면 칸 층(tileRings(surface.ground)): 블록 포장은 그 밖만 남긴다.
 * 기록 구역(로드뷰 파일)마다 따로 만든다(구역 사이는 멀다)
 */
export function pavingZones(props: PropRec[], road: TileRings[] = []): PavingZone[] {
  const groups = new Map<string, Paving[]>();
  for (const p of props) {
    if (p.kind !== 'paving' || p.surface === 'planting') continue;
    const k = `${p.surface}|${p.color ?? ''}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(p);
  }
  const out: PavingZone[] = [];
  for (const list of groups.values()) {
    const rects = list.map(pavingRect);
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rects) for (let k = 0; k < r.length; k += 2) (x0 = Math.min(x0, r[k])), (x1 = Math.max(x1, r[k])), (z0 = Math.min(z0, r[k + 1])), (z1 = Math.max(z1, r[k + 1]));
    x0 -= 2;
    z0 -= 2;
    const n = Math.ceil(Math.max(x1 + 2 - x0, z1 + 2 - z0) / CELL);
    let g: Uint8Array = new Uint8Array(n * n);
    for (const r of rects) fill(g, n, x0, z0, [r], 1);
    g = morph(morph(g, n, CLOSE, true), n, CLOSE, false);
    if (list[0].surface === 'block')
      for (const t of road) {
        const S = GTILE * GCELL;
        const tx = -BOARD_R + (t.tile % GNT) * S;
        const tz = -BOARD_R + Math.floor(t.tile / GNT) * S;
        if (tx > x0 + n * CELL || tx + S < x0 || tz > z0 + n * CELL || tz + S < z0) continue;
        fill(g, n, x0, z0, t.rings, 0);
      }
    const rings: Float32Array[] = [];
    for (const loop of traceLoops(g, n)) {
      const s = simplifyLoop(loop, 0.3 / CELL);
      if (s.length < 6 || Math.abs(loopArea(s)) * CELL * CELL < 0.5) continue;
      rings.push(Float32Array.from(smooth(s), (v, k) => (k % 2 ? z0 : x0) + v * CELL));
    }
    if (rings.length) out.push({ surface: list[0].surface, color: list[0].color, rings });
  }
  return out;
}

/** 포장 구역을 그릴 다각형들(바깥 고리마다 구멍과 묶음) */
export function pavingShapes(z: PavingZone) {
  return groupLoops(z.rings);
}

// 그린 찻길 면(surface.json g, 타일마다 깎은 고리) 위 자리 묻기와 찻길 면 밖 가장 가까운 자리 찾기(재작업 W57).
// 앱(시설물 자리: 신호 기둥·정류장 쉼터·출구·엘리베이터·로드뷰 소품)과 굽기(횡단보도 줄무늬를 찻길 면 경계까지 잇기), 시험이 같은 함수를 쓴다.
// 판 전체 0.25m 칸 비트(약 2.6억 칸)는 앱에 두기 무거워, 점마다 그 점이 든 64m 타일의 고리만 짝홀 규칙으로 본다.
import { BOARD_R } from '../geo.ts';
import { GCELL, GNT, GTILE, type TileRings } from './surface.ts';

export interface GroundQuery {
  /** 그린 찻길 면 위인가 */
  onCar(x: number, z: number): boolean;
  /** 찻길 면 안, 가장자리에서 r m 넘게 안쪽인가(16방향, 시험 tools/lib/treeplace.ts deepOnCar 와 같은 정의) */
  deep(x: number, z: number, r?: number): boolean;
  /** 찻길 면 밖이고 둘레 r m(16방향)에도 찻길 면이 없는가 */
  clear(x: number, z: number, r: number): boolean;
}

const TM = GTILE * GCELL;

export function groundQuery(tiles: TileRings[]): GroundQuery {
  const byTile = new Map<number, Float32Array[]>();
  for (const t of tiles) byTile.set(t.tile, t.rings);
  const onCar = (x: number, z: number) => {
    const i = Math.floor((x + BOARD_R) / TM);
    const j = Math.floor((z + BOARD_R) / TM);
    if (i < 0 || j < 0 || i >= GNT || j >= GNT) return false;
    const rings = byTile.get(j * GNT + i);
    if (!rings) return false;
    let c = false;
    for (const r of rings)
      for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) {
        const [xa, za, xb, zb] = [r[a], r[a + 1], r[b], r[b + 1]];
        if (za > z !== zb > z && x < ((xb - xa) * (z - za)) / (zb - za) + xa) c = !c;
      }
    return c;
  };
  const ring16 = (x: number, z: number, r: number, want: boolean) => {
    for (let k = 0; k < 16; k++) if (onCar(x + Math.cos((k * Math.PI) / 8) * r, z + Math.sin((k * Math.PI) / 8) * r) !== want) return false;
    return true;
  };
  return {
    onCar,
    deep: (x, z, r = 0.3) => onCar(x, z) && ring16(x, z, r, true),
    clear: (x, z, r) => !onCar(x, z) && (r <= 0 || ring16(x, z, r, false)),
  };
}

/**
 * 바닥 점들(pts, 판 좌표)을 함께 옮겨 모든 점이 찻길 면 밖(둘레 r m 까지)이 되는 가장 짧은 옮김 [dx, dz]. 이미 그렇다면 [0, 0].
 * 0.25m 간격 동심원으로 max m 까지 찾고, ok(옮긴 가운데 자리)가 거짓인 자리(건물 안 등)는 건너뛴다. 둘 곳이 없으면 null
 */
export function shiftOffCar(q: GroundQuery, pts: ArrayLike<number>, r = 0.4, max = 8, ok: (dx: number, dz: number) => boolean = () => true): [number, number] | null {
  const fits = (dx: number, dz: number) => {
    for (let k = 0; k < pts.length; k += 2) if (!q.clear(pts[k] + dx, pts[k + 1] + dz, r)) return false;
    return ok(dx, dz);
  };
  if (fits(0, 0)) return [0, 0];
  for (let d = 0.25; d <= max + 1e-6; d += 0.25) {
    const n = Math.max(16, Math.ceil((2 * Math.PI * d) / 0.25));
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n;
      const [dx, dz] = [Math.cos(a) * d, Math.sin(a) * d];
      if (fits(dx, dz)) return [dx, dz];
    }
  }
  return null;
}

/**
 * 바닥 점(pts)을 가진 시설물: 한 점이라도 찻길 면 안(가장자리에서 inside m 넘게)이면 모든 점이 찻길 면 밖(둘레 r m)이 되게 옮긴 가운데(x, z).
 * 찻길 면 가장자리에 걸치기만 한 것은 그대로(연석 위에 붙어 선 출구 등), 둘 곳이 없으면 그대로 두고 stuck
 */
export function placeOff(q: GroundQuery, x: number, z: number, pts: ArrayLike<number>, r = 0.1, max = 6, inside = 0.3): { x: number; z: number; moved: boolean; stuck: boolean } {
  let deep = false;
  for (let k = 0; k < pts.length && !deep; k += 2) deep = q.deep(pts[k], pts[k + 1], inside);
  if (!deep) return { x, z, moved: false, stuck: false };
  const s = shiftOffCar(q, pts, r, max);
  if (!s) return { x, z, moved: false, stuck: true };
  return { x: x + s[0], z: z + s[1], moved: s[0] !== 0 || s[1] !== 0, stuck: false };
}

// 노면 표시를 그린 찻길 면 안으로 자르기(재작업 W14).
// 찻길 면(찻길 띠·교차로 면·분리대·횡단보도 밑 그리기 전용 면)을 0.25m 칸으로 칠한 뒤, 서울시 선을 0.5m 마다 짚어 면 밖(0.3m 넘게)으로 나간 부분을 잘라 낸다.
// 찻길 터널 속(땅 밑)은 면에서 빼므로 그 위 땅에 남던 선(지하차도 자리의 부채꼴 선)도 함께 지워진다. 터널 위를 다른 땅 위 찻길이 덮어도
// 터널과 나란히 터널 속을 따라가는 선은 skip 으로 뺀다(터널 차로 선이 위 길에 겹쳐 그려지지 않게).
import { BOARD_R } from '../../src/geo.ts';
import { bitsAt, fillBits, makeBits, type Bits } from './bits.ts';

/** 면 고리들(m, [x, z, ...], 구멍은 같은 목록에 넣어 짝홀로)로 칸 격자를 칠한다 */
export function drawnGround(shapes: ArrayLike<number>[][]): Bits {
  const B = makeBits(-BOARD_R, -BOARD_R, BOARD_R, BOARD_R, 0.25);
  for (const rings of shapes) fillBits(B, rings, 1);
  return B;
}

/** (x, z)가 찻길 면 안이거나 면에서 tol m 안인가 */
export function onGround(B: Bits, x: number, z: number, tol = 0.3): boolean {
  if (bitsAt(B, x, z) & 1) return true;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (bitsAt(B, x + Math.cos(a) * tol, z + Math.sin(a) * tol) & 1) return true;
  }
  return false;
}

/**
 * 선(점 [x, z] 열)을 면 안 조각들로 자른다. 0.5m 마다 짚어 면 밖인 자리에서 끊고, minLen 보다 짧은 조각은 버린다.
 * 꼭짓점은 그대로 두고 끊는 자리에만 점을 넣는다
 */
export function clipLine(B: Bits, P: [number, number][], minLen = 0.6, tol = 0.3, skip?: (x: number, z: number, ux: number, uz: number) => boolean): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  let curLen = 0;
  const flush = () => {
    if (cur.length >= 2 && curLen >= minLen) out.push(cur);
    cur = [];
    curLen = 0;
  };
  const push = (p: [number, number]) => {
    const q = cur[cur.length - 1];
    if (q) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < 1e-3) return;
      curLen += d;
    }
    cur.push(p);
  };
  let last: [number, number] | null = null; // 마지막으로 면 안이었던 짚은 점(아직 넣지 않았으면)
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / 0.5));
    const [ux, uz] = [(bx - ax) / (L || 1), (bz - az) / (L || 1)];
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      const p: [number, number] = [ax + (bx - ax) * t, az + (bz - az) * t];
      if (onGround(B, p[0], p[1], tol) && !skip?.(p[0], p[1], ux, uz)) {
        // 꼭짓점 사이 짚은 점은 끊긴 뒤 다시 시작할 때와 끊기기 직전에만 넣는다(선 모양은 꼭짓점으로)
        if (k === n || !cur.length) {
          push(p);
          last = null;
        } else last = p;
      } else {
        if (last) push(last);
        last = null;
        flush();
      }
    }
  }
  flush();
  return out;
}

/**
 * 같은 자리에 겹친 나란한 선 정리(재작업 W14): 긴 선부터 받아 두고, 뒤 선의 점이 받아 둔 선과 dist m 안에서 나란하면(cos 이상) 그 부분을 버린다.
 * 서울시 중앙선(001)은 한 자리에 여러 줄이 비스듬히 겹친 곳이 있어(합정역 1·4번 출구 사이 양화로), 중앙선끼리만 견준다
 */
export function dropOverlaps(lines: [number, number][][], dist = 2, cos = 0.94): { kept: [number, number][][]; dropped: number } {
  const CELL = 8;
  const grid = new Map<number, number[][]>();
  const ck = (x: number, z: number) => (Math.floor(x / CELL) + 1000) * 2000 + Math.floor(z / CELL) + 1000;
  const len = (P: [number, number][]) => P.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0), 0);
  const order = lines.map((_, i) => i).sort((a, b) => len(lines[b]) - len(lines[a]));
  const kept: [number, number][][] = [];
  let dropped = 0;
  const near = (x: number, z: number, ux: number, uz: number) =>
    (grid.get(ck(x, z)) ?? []).some(([ax, az, bx, bz]) => {
      const l = Math.hypot(bx - ax, bz - az) || 1;
      if (Math.abs(((bx - ax) * ux + (bz - az) * uz) / l) < cos) return false;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (l * l)));
      return Math.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z) < dist;
    });
  for (const i of order) {
    const P = lines[i];
    const pieces: [number, number][][] = [];
    let cur: [number, number][] = [];
    for (let k = 0; k + 1 < P.length; k++) {
      const [ax, az] = P[k];
      const [bx, bz] = P[k + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const [ux, uz] = [(bx - ax) / (L || 1), (bz - az) / (L || 1)];
      const n = Math.max(1, Math.ceil(L / 0.5));
      for (let q = k === 0 ? 0 : 1; q <= n; q++) {
        const p: [number, number] = [ax + (bx - ax) * (q / n), az + (bz - az) * (q / n)];
        if (near(p[0], p[1], ux, uz)) {
          if (cur.length >= 2) pieces.push(cur);
          cur = [];
          dropped++;
        } else if (q === n || !cur.length || (k + 1 < P.length && q === n)) cur.push(p);
        else if (q < n && cur.length && near(ax + (bx - ax) * ((q + 1) / n), az + (bz - az) * ((q + 1) / n), ux, uz)) cur.push(p);
      }
    }
    if (cur.length >= 2) pieces.push(cur);
    for (const q of pieces) {
      if (len(q) < 1) continue;
      kept.push(q);
      for (let k = 0; k + 1 < q.length; k++) {
        const seg = [q[k][0], q[k][1], q[k + 1][0], q[k + 1][1]];
        const seen = new Set<number>();
        for (let cx = Math.floor((Math.min(seg[0], seg[2]) - dist) / CELL); cx <= Math.floor((Math.max(seg[0], seg[2]) + dist) / CELL); cx++)
          for (let cz = Math.floor((Math.min(seg[1], seg[3]) - dist) / CELL); cz <= Math.floor((Math.max(seg[1], seg[3]) + dist) / CELL); cz++) {
            const c = (cx + 1000) * 2000 + cz + 1000;
            if (seen.has(c)) continue;
            seen.add(c);
            (grid.get(c) ?? grid.set(c, []).get(c)!).push(seg);
          }
      }
    }
  }
  return { kept, dropped };
}

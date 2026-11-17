// 걷는 면 굽기(재작업 W28, 설계 문서 55절). 사람은 걷는 길 그물의 선 띠가 아니라 이 면 안에서 움직이고, 그물은 길 찾기에만 쓴다.
// 걷는 면 = 걷는 선(보도·골목·보행로·잇는 선)에서 AREA_REACH 안이면서 몸(가운데)이 설 수 있는 칸(blockMap: 큰길 찻길에 몸 반지름 + 여유 안,
// 건물 벽 0.2m 안이 아님. 칸 가운데로 잰다. 걷는 선이 지나는 칸은 늘 넣는다) 가운데 걷는 선에 이어진 덩어리. 칸은 AREA_CELL.
// 횡단보도 통로·중앙 승강장은 면에 넣지 않는다(사람 모듈이 건너는 사람에게만 따로 허락한다).
// 노란 선을 칠한 보도 있는 작은 길(등급 4·5)의 찻길도 넣지 않는다(#55: 걷고싶은거리에서 사람이 옆 광장을 두고 어울마당로 가운데 골목 선을 걸었다).
import { decodeWalk, type WalkJson } from '../../src/sim/walknet.ts';
import { fillBits, makeBits } from './bits.ts';

/** 칸 크기(m) */
export const AREA_CELL = 0.5;
/** 걷는 선에서 면을 넓힐 거리(m) */
export const AREA_REACH = 4;

/**
 * 걷는 면을 줄마다 이어진 칸 묶음(run)으로 적는다: [칸 크기(cm), x0, z0(m), 너비, 높이(칸), 그다음 줄마다 묶음 수, (앞 묶음 끝에서 띈 칸, 길이) …]
 */
export function walkArea(json: WalkJson, blocked: (x: number, z: number) => boolean, bounds: [number, number, number, number], carOff: ArrayLike<number>[] = []): number[] {
  const g = decodeWalk(json);
  const C = AREA_CELL;
  const [x0, z0, x1, z1] = bounds;
  const W = Math.ceil((x1 - x0) / C);
  const H = Math.ceil((z1 - z0) / C);
  // 1 걷는 선에서 AREA_REACH 안, 2 걷는 선 위(덩어리 씨앗)
  const v = new Uint8Array(W * H);
  const R = AREA_REACH;
  const stroke = (ax: number, az: number, bx: number, bz: number, r: number, bit: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    const ux = L > 1e-6 ? (bx - ax) / L : 1;
    const uz = L > 1e-6 ? (bz - az) / L : 0;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - r - x0) / C));
    const i1 = Math.min(W - 1, Math.floor((Math.max(ax, bx) + r - x0) / C));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - r - z0) / C));
    const j1 = Math.min(H - 1, Math.floor((Math.max(az, bz) + r - z0) / C));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * C;
      for (let i = i0; i <= i1; i++) {
        const x = x0 + (i + 0.5) * C;
        const s = Math.max(0, Math.min(L, (x - ax) * ux + (z - az) * uz));
        if (Math.hypot(ax + ux * s - x, az + uz * s - z) <= r) v[j * W + i] |= bit;
      }
    }
  };
  for (let a = 0; a < g.adj.length; a++)
    for (const b of g.adj[a]) {
      if (b < a) continue;
      const [ax, az, bx, bz] = [g.nx[a * 2], g.nx[a * 2 + 1], g.nx[b * 2], g.nx[b * 2 + 1]];
      stroke(ax, az, bx, bz, R, 1);
      stroke(ax, az, bx, bz, C * 0.5, 2);
    }
  // 노란 선을 칠한 작은 길의 찻길(carOff, #55): 사람이 걷는 면이 아니다. 그 위 골목 선은 길 찾기에만 쓰고 사람은 옆 보도·광장으로 비켜 걷는다
  const off = makeBits(x0, z0, x1, z1, C);
  fillBits(off, carOff, 1);
  // 설 수 있는 칸: 칸 가운데가 막히지 않았거나, 걷는 선이 지나는 칸(선은 굽기에서 몸이 큰길 찻길·건물에 닿지 않게 옮기거나 잘랐다: 좁은 보도도 이어진다)
  const ok = new Uint8Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (!(v[k] & 1)) continue;
      if (off.v[k]) continue;
      if (v[k] & 2 || !blocked(x0 + (i + 0.5) * C, z0 + (j + 0.5) * C)) ok[k] = 1;
    }
  // 걷는 선 위 칸에서 이어진 덩어리만(4 이웃). 칠한 작은 길 위 골목 선 칸은 씨앗이 아니다
  const keep = new Uint8Array(W * H);
  const st: number[] = [];
  for (let k = 0; k < W * H; k++) if (v[k] & 2 && ok[k] && !keep[k]) {
    keep[k] = 1;
    st.push(k);
    while (st.length) {
      const c = st.pop()!;
      const i = c % W;
      for (const n of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, c - W, c + W]) if (n >= 0 && n < W * H && ok[n] && !keep[n]) (keep[n] = 1), st.push(n);
    }
  }
  const out: number[] = [Math.round(C * 100), x0, z0, W, H];
  for (let j = 0; j < H; j++) {
    const at = out.length;
    out.push(0);
    let end = 0;
    for (let i = 0; i < W; ) {
      if (!keep[j * W + i]) {
        i++;
        continue;
      }
      let e = i;
      while (e < W && keep[j * W + e]) e++;
      out.push(i - end, e - i);
      out[at]++;
      end = e;
      i = e;
    }
  }
  return out;
}

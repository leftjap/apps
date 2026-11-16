// 판 전체를 덮는 칸 격자(칸마다 비트 8개). 고리(짝홀 규칙)를 칸 가운데 기준으로 칠하거나 지운다.
// 보행 그래프 굽기(walknet.ts)와 걷는 자리 측정(tools/measure-walk.ts)이 함께 쓴다.

export interface Bits {
  /** 왼쪽 위 칸 모서리(m) */
  x0: number;
  z0: number;
  /** 칸 크기(m) */
  cell: number;
  w: number;
  h: number;
  v: Uint8Array;
}

export function makeBits(x0: number, z0: number, x1: number, z1: number, cell: number): Bits {
  const w = Math.ceil((x1 - x0) / cell);
  const h = Math.ceil((z1 - z0) / cell);
  return { x0, z0, cell, w, h, v: new Uint8Array(w * h) };
}

/** 고리들(m, [x, z, ...])을 한 도형(짝홀)으로 보고 그 안 칸에 bit 를 켠다(clear 면 끈다) */
export function fillBits(b: Bits, rings: ArrayLike<number>[], bit: number, clear = false): void {
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const r of rings)
    for (let k = 1; k < r.length; k += 2) {
      z0 = Math.min(z0, r[k]);
      z1 = Math.max(z1, r[k]);
    }
  const xs: number[] = [];
  const j0 = Math.max(0, Math.floor((z0 - b.z0) / b.cell));
  const j1 = Math.min(b.h - 1, Math.ceil((z1 - b.z0) / b.cell));
  for (let j = j0; j <= j1; j++) {
    const zc = b.z0 + (j + 0.5) * b.cell;
    xs.length = 0;
    for (const r of rings)
      for (let i = 0, m = r.length - 2; i < r.length; m = i, i += 2) {
        const az = r[m + 1];
        const bz = r[i + 1];
        if (az <= zc === bz <= zc) continue;
        xs.push(r[m] + ((zc - az) / (bz - az)) * (r[i] - r[m]));
      }
    xs.sort((p, q) => p - q);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const a = Math.max(0, Math.ceil((xs[q] - b.x0) / b.cell - 0.5));
      const e = Math.min(b.w - 1, Math.floor((xs[q + 1] - b.x0) / b.cell - 0.5));
      for (let i = j * b.w + a, end = j * b.w + e; i <= end; i++) b.v[i] = clear ? b.v[i] & ~bit : b.v[i] | bit;
    }
  }
}

/** (x, z) 칸의 비트(판 밖이면 0) */
export function bitsAt(b: Bits, x: number, z: number): number {
  const i = Math.floor((x - b.x0) / b.cell);
  const j = Math.floor((z - b.z0) / b.cell);
  return i < 0 || j < 0 || i >= b.w || j >= b.h ? 0 : b.v[j * b.w + i];
}

/** 선(m, [x, z, ...])을 가운데에 두고 좌우 half 씩 넓힌 띠를 조각마다 사각형으로 칠한다 */
export function strokeBits(b: Bits, line: ArrayLike<number>, half: number, bit: number): void {
  for (let k = 0; k + 3 < line.length; k += 2) {
    const ax = line[k];
    const az = line[k + 1];
    const bx = line[k + 2];
    const bz = line[k + 3];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / L) * half;
    const nz = ((bx - ax) / L) * half;
    const ex = ((bx - ax) / L) * half;
    const ez = ((bz - az) / L) * half;
    fillBits(b, [[ax - ex + nx, az - ez + nz, bx + ex + nx, bz + ez + nz, bx + ex - nx, bz + ez - nz, ax - ex - nx, az - ez - nz]], bit);
  }
}

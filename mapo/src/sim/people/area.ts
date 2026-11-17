// 걷는 면(재작업 W28, 설계 문서 55절): walk.json `a`(tools/lib/walkarea.ts 가 굽는다)를 32 × 32 칸 조각으로 풀어 둔다.
// 칸 하나는 몸 가운데가 설 수 있는 자리(큰길 찻길에서 몸 반지름 + 여유, 건물 벽에서 0.2m 떨어짐)다. 빈 조각은 메모리를 쓰지 않는다.

const T = 32;

export interface WalkArea {
  /** (x, z)에 몸 가운데가 설 수 있는가 */
  at(x: number, z: number): boolean;
  /** (ax, az)에서 (bx, bz)까지 곧게 가는 길이 모두 면 안인가 */
  clear(ax: number, az: number, bx: number, bz: number): boolean;
  /** (x, z)에서 (nx, nz) 쪽으로 면 안에 남는 거리(lim 까지, 칸 반 단위) */
  room(x: number, z: number, nx: number, nz: number, lim: number): number;
}

export function decodeArea(a: ArrayLike<number> | undefined): WalkArea | null {
  if (!a || a.length < 5) return null;
  const C = a[0] / 100;
  const x0 = a[1];
  const z0 = a[2];
  const W = a[3];
  const H = a[4];
  const TW = Math.ceil(W / T);
  const TH = Math.ceil(H / T);
  const tile = new Int32Array(TW * TH).fill(-1);
  let pool = new Uint32Array(T * 1024);
  let nt = 0;
  const tileOf = (ti: number, tj: number) => {
    const key = tj * TW + ti;
    let t = tile[key];
    if (t < 0) {
      if ((nt + 1) * T > pool.length) {
        const p = new Uint32Array(pool.length * 2);
        p.set(pool);
        pool = p;
      }
      t = tile[key] = nt++;
    }
    return t;
  };
  for (let k = 5, j = 0; j < H && k < a.length; j++) {
    const n = a[k++];
    let i = 0;
    for (let q = 0; q < n; q++) {
      i += a[k++];
      const e = i + a[k++];
      for (let c = i; c < e; ) {
        const ti = c >> 5;
        const b0 = c & 31;
        const b1 = Math.min(32, b0 + (e - c));
        const mask = b1 - b0 === 32 ? 0xffffffff : ((1 << (b1 - b0)) - 1) << b0;
        pool[tileOf(ti, j >> 5) * T + (j & 31)] |= mask;
        c += b1 - b0;
      }
      i = e;
    }
  }
  pool = pool.slice(0, nt * T);
  const cellAt = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= W || j >= H) return false;
    const t = tile[(j >> 5) * TW + (i >> 5)];
    return t >= 0 && ((pool[t * T + (j & 31)] >>> (i & 31)) & 1) === 1;
  };
  const at = (x: number, z: number) => cellAt(Math.floor((x - x0) / C), Math.floor((z - z0) / C));
  const clear = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / (C * 0.5)));
    for (let k = 0; k <= n; k++) if (!at(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n)) return false;
    return true;
  };
  const room = (x: number, z: number, nx: number, nz: number, lim: number) => {
    let d = 0;
    const s = C * 0.5;
    while (d + s <= lim && at(x + nx * (d + s), z + nz * (d + s))) d += s;
    return d;
  };
  return { at, clear, room };
}

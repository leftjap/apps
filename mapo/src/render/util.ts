// 그리기 공통 도구: 부품을 합친 도형, 인스턴스 버퍼, 길을 따라가는 띠.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 도형에 부품 번호와 색을 붙인다. 셰이더가 부품 번호로 다리·꼬리 등을 따로 움직인다. */
export function part(g: THREE.BufferGeometry, id: number, color: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  const n = out.attributes.position.count;
  out.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1));
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(color, i * 3);
  out.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
  return out;
}

export const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts, false)!;

/** 인스턴스마다 달라지는 값들을 담는 도형. attrs 는 이름 → 성분 수 */
export function instanced<K extends string>(base: THREE.BufferGeometry, max: number, attrs: Record<K, number>) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  for (const k in base.attributes) geo.setAttribute(k, base.attributes[k]);
  const arr = {} as Record<K, Float32Array>;
  const attr = {} as Record<K, THREE.InstancedBufferAttribute>;
  for (const k in attrs) {
    arr[k] = new Float32Array(max * attrs[k]);
    attr[k] = new THREE.InstancedBufferAttribute(arr[k], attrs[k]);
    attr[k].setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute(k, attr[k]);
  }
  geo.instanceCount = 0;
  return { geo, arr, attr };
}

export interface Ribbon {
  pos: number[];
  /** x = 가로 위치(-1 왼쪽 ~ 1 오른쪽), y = 길을 따라간 거리(m) */
  uv: number[];
  info: number[];
  idx: number[];
}
export const ribbon = (): Ribbon => ({ pos: [], uv: [], info: [], idx: [] });

/** 중심선 p([x,y,z,...])를 따라 폭 width 의 띠를 덧붙인다. */
export function addRibbon(o: Ribbon, p: ArrayLike<number>, width: number, info: [number, number, number, number], yOff = 0, cap = 0): void {
  const n = p.length / 3;
  if (n < 2) return;
  const base = o.pos.length / 3;
  const hw = width / 2;
  let v = -cap;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1) * 3;
    const b = Math.min(n - 1, i + 1) * 3;
    let dx = p[b] - p[a];
    let dz = p[b + 2] - p[a + 2];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // 꺾이는 곳에서 폭이 줄지 않게 조금 넓힌다
    let k = 1;
    if (i > 0 && i < n - 1) {
      const c = i * 3;
      const l1 = Math.hypot(p[c] - p[a], p[c + 2] - p[a + 2]) || 1;
      const cos = ((p[c] - p[a]) * dx + (p[c + 2] - p[a + 2]) * dz) / l1;
      k = Math.min(1.7, 1 / Math.max(0.3, cos));
    }
    const c = i * 3;
    let x = p[c];
    let z = p[c + 2];
    if (i > 0) v += Math.hypot(x - p[c - 3], z - p[c - 1]);
    // 끝은 cap 만큼 늘여 이웃 조각과의 틈을 덮는다
    const ext = i === 0 ? -cap : i === n - 1 ? cap : 0;
    x += dx * ext;
    z += dz * ext;
    const y = p[c + 1] + yOff;
    const vv = v + (i === n - 1 ? cap : 0);
    o.pos.push(x + dz * hw * k, y, z - dx * hw * k, x - dz * hw * k, y, z + dx * hw * k);
    o.uv.push(-1, vv, 1, vv);
    o.info.push(...info, ...info);
    if (i > 0) {
      const q = base + i * 2;
      o.idx.push(q - 2, q - 1, q, q - 1, q + 1, q);
    }
  }
}

export function ribbonGeometry(o: Ribbon): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(o.uv, 2));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(o.info, 4));
  g.setIndex(o.idx);
  return g;
}

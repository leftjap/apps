// 역. 지하 층(UNDER_Y)에 승강장 통로와 출구로 이어지는 연결 통로를 그리고, 지상에는 출구마다 빛나는 작은 출입구를 세운다.
// 홍대입구·합정처럼 출구가 넓게 흩어진 역도 출구 하나하나가 구내로 이어져 역의 실제 범위가 드러난다.
import * as THREE from 'three';
import type { Board } from '../data/board.ts';
import { nearestS, pointAt } from '../poly.ts';
import { material, UNDER_Y } from './env.ts';
import { addRibbon, instanced, merge, part, ribbon, ribbonGeometry } from './util.ts';

/** 역별 강조색. 홍대입구·합정은 랜드마크 색을 쓴다 */
const ACCENT: Record<string, string> = { 홍대입구: '#7fe0a8', 합정: '#ffcf7a' };
const PLATFORM_HALF = 110; // 승강장 통로를 역 중심에서 앞뒤로 늘이는 길이(m)

export interface StationLabel {
  name: string;
  x: number;
  y: number;
  z: number;
  /** 지나는 노선 색 */
  colors: string[];
}

export function makeStations(board: Board) {
  const group = new THREE.Group();
  const names = board.stations.map((s) => s.name);
  const color = (name: string) => new THREE.Color(ACCENT[name] ?? '#8fd3ff');
  const floor = ribbon();
  const proxies: THREE.Object3D[] = [];
  const tmp = [0, 0, 0];
  /** 출구마다 [x, z, 방향, 역 번호] */
  const doors: [number, number, number, number][] = [];

  names.forEach((name, si) => {
    const c = color(name);
    const info: [number, number, number, number] = [c.r, c.g, c.b, si];
    const mine = ribbon();
    const corridors: { l: (typeof board.lines)[number]; a: number; b: number }[] = [];
    for (const l of board.lines) {
      const k = l.stopNames.indexOf(name);
      if (k < 0) continue;
      const len = l.cum[l.cum.length - 1];
      const a = Math.max(0, l.stops[k] - PLATFORM_HALF);
      const b = Math.min(len, l.stops[k] + PLATFORM_HALF);
      const pts: number[] = [];
      for (let s = a; s <= b + 0.1; s += 10) {
        pointAt(l.p, l.cum, Math.min(s, b), tmp);
        pts.push(tmp[0], UNDER_Y, tmp[2]);
      }
      addRibbon(floor, pts, 26, info, 0, 6);
      addRibbon(mine, pts, 34, info, 0, 6);
      corridors.push({ l, a, b });
    }
    for (const e of board.exits.filter((e) => e.st === name)) {
      // 가장 가까운 승강장 통로까지 곧게 잇는다
      let best = { d: Infinity, x: e.x, z: e.z };
      for (const { l, a, b } of corridors) {
        const r = nearestS(l.p, l.cum, e.x, e.z);
        pointAt(l.p, l.cum, Math.min(b, Math.max(a, r.s)), tmp);
        const d = Math.hypot(tmp[0] - e.x, tmp[2] - e.z);
        if (d < best.d) best = { d, x: tmp[0], z: tmp[2] };
      }
      const dir = best.d < Infinity ? Math.atan2(best.z - e.z, best.x - e.x) : 0;
      const end = best.d < Infinity ? [best.x, best.z] : [e.x + Math.cos(dir) * 12, e.z + Math.sin(dir) * 12];
      const pts = [e.x, UNDER_Y, e.z, end[0], UNDER_Y, end[1]];
      addRibbon(floor, pts, 7, info, 0, 3);
      addRibbon(mine, pts, 16, info, 0, 3);
      doors.push([e.x, e.z, dir, si]);
    }
    // 고르기용: 지표 높이에 놓은 보이지 않는 넓은 판(이 판에 노선 구간이 없는 역은 고르지 않는다)
    if (mine.pos.length && corridors.length) {
      for (let i = 1; i < mine.pos.length; i += 3) mine.pos[i] = 0.6;
      const proxy = new THREE.Mesh(ribbonGeometry(mine), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
      proxy.userData.station = name;
      group.add(proxy);
      proxies.push(proxy);
    }
  });

  const hi = new Float32Array(16);
  const uniforms = { uHi: { value: hi } };
  const floorMesh = new THREE.Mesh(
    ribbonGeometry(floor),
    material({
      under: true,
      doubleSide: true,
      uniforms,
      vertex: /* glsl */ `
        attribute vec2 aUV; attribute vec4 aInfo;
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() {
          vUV = aUV; vInfo = aInfo;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform float uHi[16];
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() {
          float h = uHi[int(vInfo.w + 0.5)];
          float x = abs(vUV.x);
          float edge = smoothstep(0.78, 0.9, x) * (1.0 - smoothstep(0.96, 1.0, x));
          float tile = step(0.92, fract(vUV.y / 6.0)) * 0.5;
          vec3 col = mix(vInfo.rgb * 0.62, mix(vInfo.rgb, vec3(1.0), 0.3), uNight) * (1.0 + 0.4 * h);
          float a = (0.26 + 0.06 * uNight + tile * 0.12 + 0.22 * h) * (1.0 - edge) + edge * (0.7 + 0.15 * uNight + 0.2 * h);
          gl_FragColor = vec4(fogged(col, vDist), a);
        }`,
    }),
  );
  floorMesh.renderOrder = -4.6;
  floorMesh.frustumCulled = false;
  group.add(floorMesh);

  // 출입구: 유리 벽과 지붕. 앞은 +x(구내 쪽)
  const door = merge([
    part(new THREE.BoxGeometry(4.2, 2.3, 2.8).translate(0, 1.15, 0), 0),
    part(new THREE.BoxGeometry(4.8, 0.3, 3.4).translate(0.1, 2.45, 0), 1),
  ]);
  const inst = instanced(door, doors.length, { aInst: 4 });
  doors.forEach((d, i) => inst.arr.aInst.set(d, i * 4));
  inst.geo.instanceCount = doors.length;
  const doorMesh = new THREE.Mesh(
    inst.geo,
    material({
      uniforms: { ...uniforms, uCols: { value: Array.from({ length: 16 }, (_, i) => (names[i] ? color(names[i]) : new THREE.Color())) } },
      vertex: /* glsl */ `
        attribute vec4 aInst; attribute float aPart;
        varying vec3 vN; varying float vPart; varying float vSt; varying float vDist; varying vec3 vO;
        void main() {
          vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
          vec3 p = position * zoomScale(-cv.z, 4.0, 9.0, 1.0, 3.4);
          float cs = cos(aInst.z), sn = sin(aInst.z);
          vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
          vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
          vPart = aPart; vSt = aInst.w; vO = position;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform float uHi[16]; uniform vec3 uCols[16];
        varying vec3 vN; varying float vPart; varying float vSt; varying float vDist; varying vec3 vO;
        void main() {
          int si = int(vSt + 0.5);
          vec3 c = uCols[si];
          float h = uHi[si];
          vec3 n = normalize(vN);
          vec3 col;
          if (vPart > 0.5) col = lit(mix(c, vec3(1.0), 0.25), n) + c * (0.25 + 0.6 * uNight + 0.5 * h);
          else {
            vec3 glass = mix(vec3(0.62, 0.74, 0.8), c, 0.35);
            col = lit(glass, n) * 0.8 + c * (0.18 + 0.85 * uNight + 0.5 * h) * smoothstep(0.2, 2.0, vO.y);
          }
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  doorMesh.frustumCulled = false;
  group.add(doorMesh);

  // 역 이름은 주변에서 가장 높은 지붕보다 위에 띄운다
  const served = board.stations.filter((s) => board.lines.some((l) => l.stopNames.includes(s.name)));
  const labels: StationLabel[] = served.map((s) => {
    let top = 0;
    for (const b of board.buildings) if (Math.abs(b.pts[0] - s.x) < 70 && Math.abs(b.pts[1] - s.z) < 70) top = Math.max(top, b.h);
    return { name: s.name, x: s.x, y: Math.max(30, top + 14), z: s.z, colors: board.lines.filter((l) => l.stopNames.includes(s.name)).map((l) => l.color) };
  });

  const want = new Float32Array(16);
  let hovered = '';
  let selected = '';
  return {
    group,
    pickables: proxies,
    labels,
    exits: board.exits.filter((e) => e.ref),
    setHover(name: string) {
      hovered = name;
    },
    setSelected(name: string) {
      selected = name;
    },
    update(dt: number) {
      names.forEach((n, i) => {
        want[i] = n === hovered ? 1 : n === selected ? 0.7 : 0;
        hi[i] += (want[i] - hi[i]) * Math.min(1, dt * 7);
      });
    },
    setUnderVisible(on: boolean) {
      floorMesh.visible = on;
    },
  };
}

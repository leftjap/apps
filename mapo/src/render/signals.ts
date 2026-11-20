// 횡단보도·신호등. 횡단보도는 서울시 교통안전시설물 횡단보도 면(구운 모형판의 crosswalks)을 실제 자리·방향·폭으로 칠하고, 건너는 길이는 그린 찻길 면 경계까지 늘인다(marks.json x, 재작업 W57).
// 정지선은 노면 표시(src/render/marks.ts)가 서울시 차선 자료 그대로 긋는다.
// 신호등: 차량 신호는 정지선(서울시 차선 자료) 오른쪽 끝 보도에 기둥을 세우고 찻길 위로 뻗은 팔 끝에 가로 3구 등을 단다. 기둥 자리가 그린 찻길 면 위면 찻길 면 밖 가장 가까운 보도·섬·분리대로 옮긴다(재작업 W57).
// 좌회전 신호가 있는 진입로(서울시 신호등 자료의 4색등)는 4구 등(빨강·노랑·좌회전 화살표·초록)이다. 등 상태는 그 진입로 직진 현시(원)와 좌회전 현시(화살표)를 따른다.
// 보행 신호는 보행 신호 횡단보도 양 끝에 2구(빨강 위, 초록 아래) 기둥으로 세운다. 불빛은 매 프레임 시뮬레이션 신호 상태로 바꾼다.
import * as THREE from 'three';
import type { Crosswalk } from '../data/board.ts';
import { laneOff, leftEdge, rightEdge, type Edge } from '../sim/graph.ts';
import { GREEN, LEFT, RED, STRAIGHT, YELLOW, type Approach, type SignalPlan as Signals } from '../sim/intersection/index.ts';
import { shiftOffCar, type GroundQuery } from '../data/offroad.ts';
import { pointAt } from '../poly.ts';
import { material } from './env.ts';
import { sizeGlsl } from './size.ts';
import { instanced, merge, part, ribbon, ribbonGeometry, type Ribbon } from './util.ts';

/** 횡단보도 면 외곽선 하나를 칠한다. 줄무늬는 건너는 축(ux, uz)을 따라 (sx, sz)에서부터 0.5m 칠하고 0.5m 띈다 */
function addStripes(o: Ribbon, ring: Float32Array, sx: number, sz: number, ux: number, uz: number) {
  const pts: THREE.Vector2[] = [];
  for (let k = 0; k < ring.length; k += 2) pts.push(new THREE.Vector2(ring[k], ring[k + 1]));
  const base = o.pos.length / 3;
  for (const p of pts) {
    o.pos.push(p.x, 0.35, p.y);
    o.uv.push(0, (p.x - sx) * ux + (p.y - sz) * uz);
    o.info.push(1, 0, 0, 0);
  }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(pts, [])) o.idx.push(base + a, base + b, base + c);
}


export interface CarPole {
  /** 진입로(들어오는 구간) 번호 */
  edge: number;
  /** 기둥 자리 */
  x: number;
  z: number;
  /** 등 자리(팔 끝) */
  hx: number;
  hz: number;
  /** 회전(셰이더 aInst.z): 앞(+x)은 진행 방향, 팔은 −z(찻길 쪽) */
  yaw: number;
  /** 팔 길이(m) */
  arm: number;
  /** 등 상태: 원(0 초록, 1 노랑, 2 빨강) + 3 × 좌회전 화살표 켬(0·1) */
  state: (tod: number) => number;
  /** 정지선 자료에서 자리를 잡았다(아니면 정지 자리로 어림) */
  fromData: boolean;
  /** 4구 등(좌회전 화살표): 좌회전 현시가 따로 있는 진입로 */
  arrow: boolean;
}

/** 진입로 ap 신호등의 등 상태: 원은 직진 현시, 좌회전 현시 노란불이면 원도 노랑, 화살표는 좌회전 현시 초록 */
export function lampState(signals: Signals, ap: Approach, tod: number): number {
  const s = signals.moveState(ap, STRAIGHT, tod);
  const l = ap.left === 1 ? signals.moveState(ap, LEFT, tod) : RED;
  const separate = ap.left === 1 && signals.list[ap.c].turn[ap.group] >= 0;
  const circle = separate && s === RED && l === YELLOW ? YELLOW : s;
  return circle + (separate && l === GREEN ? 3 : 0);
}
export interface PedPole {
  /** 횡단보도 번호 */
  xw: number;
  x: number;
  z: number;
  /** 회전: 등(−x 면)이 건너편을 본다 */
  yaw: number;
}

/** 보행 신호 색: 그 횡단보도를 건너는 방향이 쓰는 무리가 초록이면 GREEN, 아니면 RED */
export function pedState(signals: Signals, i: number, xw: Crosswalk, tod: number): number {
  void xw;
  return signals.walkState(i, tod) === GREEN ? GREEN : RED;
}

/** 기둥을 세울 때 찻길 면 가장자리에서 띄우는 거리(m, 기둥 반지름 + 여유) */
const POLE_CLEAR = 0.4;

/**
 * 신호등 자리. stopLines 는 그린 정지선 [x0, z0, x1, z1, ...](src/data/marks.ts stopSegments, 재작업 W49). 빗금 안 조각을 지우기 전 정지선이다(지운 정지선으로 세우면 기둥 하나가 빗금 칠한 찻길 면 위로 옮겨 간다, 재작업 W60 순서 3).
 * ground 가 있으면 찻길 면 위(가장자리 POLE_CLEAR 안쪽)에 선 기둥을 찻길 면 밖 가장 가까운 자리(보도·섬·분리대)로 옮기고, 차량 신호 팔은 등 자리를 그대로 두고 새 기둥에서 다시 뻗는다(재작업 W57).
 * 8m 안에 둘 곳이 없으면 그 자리에 두고 stuck 에 적는다
 */
export function signalPoles(edges: Edge[], signals: Signals, crosswalks: Crosswalk[], stopLines: Float32Array, ground?: GroundQuery) {
  const car: CarPole[] = [];
  const inner: number[] = [];
  const stuck: { kind: 'car' | 'ped'; x: number; z: number; id: number }[] = [];
  const moved = { car: 0, ped: 0 };
  /** 찻길 면 밖으로 옮긴 자리(옮길 곳이 없으면 그대로) */
  const off = (kind: 'car' | 'ped', id: number, x: number, z: number): [number, number] => {
    if (!ground) return [x, z];
    const s = shiftOffCar(ground, [x, z], POLE_CLEAR);
    if (!s) {
      stuck.push({ kind, x, z, id });
      return [x, z];
    }
    if (s[0] || s[1]) moved[kind]++;
    return [x + s[0], z + s[1]];
  };
  const P = [0, 0, 0];
  for (const [id, ap] of signals.approach) {
    const e = edges[id];
    const seg = pointAt(e.p, e.cum, Math.max(0, e.len - ap.setback), P);
    const hl = Math.hypot(e.p[seg * 3 + 3] - e.p[seg * 3], e.p[seg * 3 + 5] - e.p[seg * 3 + 2]) || 1;
    const hx = (e.p[seg * 3 + 3] - e.p[seg * 3]) / hl;
    const hz = (e.p[seg * 3 + 5] - e.p[seg * 3 + 2]) / hl;
    // 진행 방향 오른쪽 r = (−hz, hx). 이 방향 차로 가운데
    const at = Math.max(0, e.len - ap.setback);
    const mid = (laneOff(e, 0, at) + laneOff(e, e.lanes - 1, at)) / 2;
    const cx = P[0] - hz * mid;
    const cz = P[2] + hx * mid;
    // 이 방향 차로를 가로지르는 가장 가까운 정지선
    let best = 6;
    let ax = 0, az = 0, bx = 0, bz = 0;
    for (let k = 0; k < stopLines.length; k += 4) {
      const [x0, z0, x1, z1] = [stopLines[k], stopLines[k + 1], stopLines[k + 2], stopLines[k + 3]];
      const l = Math.hypot(x1 - x0, z1 - z0) || 1;
      if (Math.abs(((x1 - x0) * hx + (z1 - z0) * hz) / l) > 0.5) continue;
      const t = Math.max(0, Math.min(1, ((cx - x0) * (x1 - x0) + (cz - z0) * (z1 - z0)) / (l * l)));
      const d = Math.hypot(x0 + t * (x1 - x0) - cx, z0 + t * (z1 - z0) - cz);
      if (d < best) (best = d), ([ax, az, bx, bz] = [x0, z0, x1, z1]);
    }
    let ux: number, uz: number, rx: number, rz: number, len: number;
    if (best < 6) {
      // 오른쪽 끝(R)에서 왼쪽 끝으로: u 는 왼쪽 끝 → 오른쪽 끝
      const flip = (bx - ax) * -hz + (bz - az) * hx < 0;
      if (flip) [ax, az, bx, bz] = [bx, bz, ax, az];
      len = Math.hypot(bx - ax, bz - az) || 1;
      ux = (bx - ax) / len;
      uz = (bz - az) / len;
      rx = bx;
      rz = bz;
    } else {
      // 정지선 자료가 없는 진입로: 정지 자리에서 이 방향 차로를 가로지르는 선으로 친다
      ux = -hz;
      uz = hx;
      len = rightEdge(e, at) - leftEdge(e, at);
      rx = cx + ux * (len / 2);
      rz = cz + uz * (len / 2);
    }
    // 교차로 안쪽 연결 구간(큰길 분리대 사이 노드끼리 잇는 짧은 구간): 정지선 자료가 없고 정지 자리가 노드에서 6m 안이면 실제 신호등이 없으므로 세우지 않는다
    if (best >= 6 && ap.setback < 6) {
      inner.push(id);
      continue;
    }
    const x0 = rx + ux * 0.8;
    const z0 = rz + uz * 0.8;
    const arm0 = Math.min(10, 0.8 + len * 0.5);
    const [lx, lz] = [x0 - ux * arm0, z0 - uz * arm0];
    // 정지선이 찻길 면 안에서 끝나면 그 끝은 찻길 위다: 기둥은 찻길 면 밖 가장 가까운 자리로, 등은 그 자리에 둔 채 팔을 새 기둥에서 등까지 뻗는다
    const [x, z] = off('car', id, x0, z0);
    let arm = arm0;
    if (x !== x0 || z !== z0) {
      const d = Math.hypot(lx - x, lz - z) || 1;
      arm = Math.min(10, Math.max(0.8, d));
      ux = (x - lx) / d;
      uz = (z - lz) / d;
    }
    car.push({ edge: id, x, z, hx: x - ux * arm, hz: z - uz * arm, yaw: Math.atan2(-ux, uz), arm, state: (tod) => lampState(signals, ap, tod), fromData: best < 6, arrow: ap.left === 1 && signals.list[ap.c].turn[ap.group] >= 0 });
  }
  const ped: PedPole[] = [];
  crosswalks.forEach((c, i) => {
    if (!c.sig || signals.crossSite[i] < 0) return;
    // 양 끝 보도, 횡단보도 한쪽 옆(폭의 반 + 0.4m)에 세운다
    for (const sgn of [1, -1]) {
      const vx = -c.uz, vz = c.ux;
      const side = c.wid / 2 + 0.4;
      const [x, z] = off('ped', i, c.x + sgn * c.ux * (c.half + 0.3) + vx * side, c.z + sgn * c.uz * (c.half + 0.3) + vz * side);
      ped.push({ xw: i, x, z, yaw: Math.atan2(sgn * c.uz, sgn * c.ux) });
    }
  });
  return { car, ped, inner, stuck, moved };
}

/**
 * faces 는 그리기용 횡단보도 면(marks.json x, 서울시 면을 그린 찻길 면 경계까지 늘인 것, 재작업 W57): 든 횡단보도는 그 면을, 나머지는 서울시 면을 그린다.
 * ground 가 있으면 찻길 면 위에 선 신호 기둥을 찻길 면 밖으로 옮긴다(signalPoles)
 */
export function makeSignalMarks(edges: Edge[], signals: Signals, crosswalks: Crosswalk[], crossMarks: Float32Array[] = [], stopLines: Float32Array = new Float32Array(), faces?: Map<number, Float32Array[]>, ground?: GroundQuery) {
  const group = new THREE.Group();
  const marks = ribbon();
  // 횡단보도: 서울시 횡단보도 면 자리·방향·폭(사다리꼴·평행사변형, 두 단 횡단보도는 조각마다), 건너는 길이는 찻길 면 경계까지. 줄무늬는 건너는 축을 따라 한쪽 끝에서부터 잇는다
  crosswalks.forEach((c, i) => {
    for (const r of faces?.get(i) ?? c.rings) addStripes(marks, r, c.x - c.ux * c.half, c.z - c.uz * c.half, c.ux, c.uz);
  });
  // 판에 없는 골목·진입로 입구의 횡단보도: 가장 긴 변을 건너는 방향으로 본다
  for (const r of crossMarks) {
    let best = 0;
    let ux = 1;
    let uz = 0;
    for (let k = 0; k < r.length; k += 2) {
      const dx = r[(k + 2) % r.length] - r[k];
      const dz = r[(k + 3) % r.length] - r[k + 1];
      const l = Math.hypot(dx, dz);
      if (l > best) (best = l), (ux = dx / l), (uz = dz / l);
    }
    addStripes(marks, r, r[0], r[1], ux, uz);
  }
  const markMesh = new THREE.Mesh(
    ribbonGeometry(marks),
    material({
      transparent: true,
      depthWrite: false,
      offset: 5,
      doubleSide: true,
      vertex: /* glsl */ `
        attribute vec2 aUV; attribute vec4 aInfo;
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() { vUV = aUV; vInfo = aInfo; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragment: /* glsl */ `
        varying vec2 vUV; varying vec4 vInfo; varying float vDist;
        void main() {
          float zebra = vInfo.x * step(0.5, fract(vUV.y)) * (1.0 - smoothstep(0.9, 1.0, abs(vUV.x)));
          float a = zebra * (1.0 - smoothstep(1200.0, 2200.0, vDist));
          gl_FragColor = vec4(vec3(0.96, 0.96, 0.94) * (0.8 + 0.25 * (1.0 - uNight)), a * 0.85);
        }`,
    }),
  );
  markMesh.renderOrder = -2.5;
  markMesh.frustumCulled = false;
  group.add(markMesh);

  const poles = signalPoles(edges, signals, crosswalks, stopLines, ground);
  // 차량 신호: 0 기둥·팔·등 상자, 1 빨강, 2 노랑, 3 초록. 기둥이 원점, 팔은 −z 로 길이 1(셰이더가 aInst.w 배), 등 상자는 팔 끝(z = 0 에 두고 셰이더가 −aInst.w 로 민다). 등은 −x(다가오는 차 쪽)를 본다
  const lamp = (z: number, id: number) => part(new THREE.CircleGeometry(0.15, 8).rotateY(-Math.PI / 2).translate(-0.24, 5.55, z), id);
  const carGeo = merge([
    part(new THREE.CylinderGeometry(0.11, 0.14, 5.9, 6, 1, true).translate(0, 2.95, 0), 0),
    part(new THREE.BoxGeometry(0.1, 0.12, 1).translate(0, 5.8, -0.5), 4),
    part(new THREE.BoxGeometry(0.42, 0.42, 1.3).translate(0, 5.55, 0), 5),
    lamp(-0.42, 1),
    lamp(0, 2),
    lamp(0.42, 3),
  ]);
  // 4구 등: 왼쪽(팔 쪽, −z)부터 빨강·노랑·좌회전 화살표(왼쪽을 가리키는 세모)·초록
  const carGeo4 = merge([
    part(new THREE.CylinderGeometry(0.11, 0.14, 5.9, 6, 1, true).translate(0, 2.95, 0), 0),
    part(new THREE.BoxGeometry(0.1, 0.12, 1).translate(0, 5.8, -0.5), 4),
    part(new THREE.BoxGeometry(0.42, 0.42, 1.72).translate(0, 5.55, 0), 5),
    lamp(-0.63, 1),
    lamp(-0.21, 2),
    part(new THREE.CircleGeometry(0.16, 3).rotateZ(Math.PI).rotateY(-Math.PI / 2).translate(-0.24, 5.55, 0.21), 6),
    lamp(0.63, 3),
  ]);
  // 보행 신호: 3m 기둥에 2구 상자(빨강 위, 초록 아래)
  const pedGeo = merge([
    part(new THREE.CylinderGeometry(0.06, 0.07, 2.9, 5, 1, true).translate(0, 1.45, 0), 0),
    part(new THREE.BoxGeometry(0.3, 0.75, 0.38).translate(0, 2.55, 0), 0),
    part(new THREE.CircleGeometry(0.13, 8).rotateY(-Math.PI / 2).translate(-0.16, 2.74, 0), 1),
    part(new THREE.CircleGeometry(0.13, 8).rotateY(-Math.PI / 2).translate(-0.16, 2.36, 0), 3),
  ]);
  const meshOf = (geo: THREE.BufferGeometry, list: { x: number; z: number; yaw: number; arm?: number }[]) => {
    const inst = instanced(geo, Math.max(1, list.length), { aInst: 4, aState: 1 });
    list.forEach((p, i) => inst.arr.aInst.set([p.x, p.z, p.yaw, p.arm ?? 0], i * 4));
    inst.geo.instanceCount = list.length;
    const mesh = new THREE.Mesh(
      inst.geo,
      material({
        vertex: /* glsl */ `
          attribute vec4 aInst; attribute float aPart; attribute float aState;
          varying vec3 vN; varying float vPart; varying float vState; varying float vDist;
          void main() {
            vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
            float s = ${sizeGlsl('signal')};
            // 팔 길이는 실제 찻길 위 길이 그대로, 굵기·높이·등만 멀리서 키운다
            vec3 p = position * s;
            if (aPart > 3.5 && aPart < 4.5) p.z = position.z * aInst.w;
            else if (aPart > 0.5 && aInst.w > 0.0) p.z -= aInst.w;
            float cs = cos(aInst.z), sn = sin(aInst.z);
            vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y, aInst.y + p.x * sn + p.z * cs);
            vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
            vPart = aPart; vState = aState;
            vec4 mv = viewMatrix * vec4(w, 1.0);
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragment: /* glsl */ `
          varying vec3 vN; varying float vPart; varying float vState; varying float vDist;
          void main() {
            vec3 col = lit(vec3(0.22, 0.24, 0.27), normalize(vN));
            // 1 빨강, 2 노랑, 3 초록, 6 좌회전 화살표. 켜진 불만 밝다(상태: 원 0 초록·1 노랑·2 빨강, 화살표가 켜지면 3 을 더한다)
            float circle = mod(vState + 0.1, 3.0);
            float arrowOn = step(2.5, vState);
            float red = step(0.5, vPart) * step(vPart, 1.5);
            float yel = step(1.5, vPart) * step(vPart, 2.5);
            float grn = step(2.5, vPart) * step(vPart, 3.5);
            float arw = step(5.5, vPart) * step(vPart, 6.5);
            float on = red * step(1.5, circle) + yel * step(0.5, circle) * step(circle, 1.5) + grn * step(circle, 0.5) + arw * arrowOn;
            vec3 lamp = red * vec3(1.0, 0.15, 0.1) + yel * vec3(1.0, 0.75, 0.1) + (grn + arw) * vec3(0.2, 1.0, 0.55);
            col = mix(col, lamp * mix(0.18, 1.3 + uNight * 0.6, on), red + yel + grn + arw);
            gl_FragColor = vec4(fogged(col, vDist), 1.0);
          }`,
      }),
    );
    mesh.frustumCulled = false;
    group.add(mesh);
    return inst;
  };
  const car3 = poles.car.filter((p) => !p.arrow);
  const car4 = poles.car.filter((p) => p.arrow);
  const carInst = meshOf(carGeo, car3);
  const car4Inst = meshOf(carGeo4, car4);
  const pedInst = meshOf(pedGeo, poles.ped);

  return {
    group,
    poles,
    update(tod: number) {
      car3.forEach((p, i) => (carInst.arr.aState[i] = p.state(tod)));
      car4.forEach((p, i) => (car4Inst.arr.aState[i] = p.state(tod)));
      poles.ped.forEach((p, i) => (pedInst.arr.aState[i] = pedState(signals, p.xw, crosswalks[p.xw], tod)));
      carInst.attr.aState.needsUpdate = true;
      car4Inst.attr.aState.needsUpdate = true;
      pedInst.attr.aState.needsUpdate = true;
    },
  };
}

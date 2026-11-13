// 학교. OSM 학교 부지마다 바닥을 옅은 라벤더색으로 칠하고 테두리를 긋는다. 부지 안 건물(구운 자료의 6번)도 같은 색으로 칠한다.
// 부지 판은 고르기에도 쓰고, 이름표는 ui/tags.ts 가 그린다.
import * as THREE from 'three';
import type { Board } from '../data/board.ts';
import { buildingMaterial, prismGeometry } from './buildings.ts';
import { material } from './env.ts';
import { addRibbon, ribbon, ribbonGeometry } from './util.ts';

export const SCHOOL_COLOR = '#c4b2f2';

export interface SchoolLabel {
  i: number;
  name: string;
  x: number;
  y: number;
  z: number;
}

export function makeSchools(board: Board) {
  const group = new THREE.Group();
  const col = new THREE.Color(SCHOOL_COLOR);
  const tint = new THREE.Color('#ffffff').lerp(col, 0.7);
  const bmat = buildingMaterial(`#${tint.getHexString()}`);
  bmat.uniforms.uGlow.value = 0.1;
  const blds = board.buildings.filter((b) => b.lm === 6);
  if (blds.length) {
    const mesh = new THREE.Mesh(prismGeometry(blds), bmat);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  const hi = new Float32Array(64);
  const pickables: THREE.Object3D[] = [];
  const labels: SchoolLabel[] = [];
  const pos: number[] = [];
  const sid: number[] = [];
  const idx: number[] = [];
  const edge = ribbon();
  board.schools.forEach((sc, i) => {
    const ring: THREE.Vector2[] = [];
    for (let k = 0; k < sc.ring.length; k += 2) ring.push(new THREE.Vector2(sc.ring[k], sc.ring[k + 1]));
    // 닫는 점(첫 점과 같은 끝점)은 삼각 분할 전에 뺀다
    if (ring.length > 3 && ring[0].distanceTo(ring[ring.length - 1]) < 0.01) ring.pop();
    if (ring.length < 3) return;
    const base = pos.length / 3;
    for (const p of ring) pos.push(p.x, 0.28, p.y), sid.push(i);
    for (const f of THREE.ShapeUtils.triangulateShape(ring, [])) idx.push(base + f[0], base + f[1], base + f[2]);
    const loop = ring.flatMap((p) => [p.x, 0.3, p.y]);
    loop.push(loop[0], loop[1], loop[2]);
    addRibbon(edge, loop, 1.6, [col.r, col.g, col.b, i]);
    // 고르기용 판(보이지 않는다)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ring.flatMap((p) => [p.x, 0.8, p.y]), 3));
    g.setIndex(THREE.ShapeUtils.triangulateShape(ring, []).flat());
    const proxy = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    proxy.userData.school = i;
    group.add(proxy);
    pickables.push(proxy);
    // 이름표: 부지 가운데, 부지 안 가장 높은 지붕보다 위
    const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
    const cz = ring.reduce((s, p) => s + p.y, 0) / ring.length;
    let top = 0;
    for (const b of blds) if (Math.abs(b.pts[0] - cx) < 90 && Math.abs(b.pts[1] - cz) < 90) top = Math.max(top, b.h);
    labels.push({ i, name: sc.name, x: cx, y: top + 6, z: cz });
  });

  const uniforms = { uCol: { value: col }, uHi: { value: hi } };
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSchool', new THREE.Float32BufferAttribute(sid, 1));
    g.setIndex(idx);
    const plate = new THREE.Mesh(
      g,
      material({
        transparent: true,
        depthWrite: false,
        offset: 4,
        doubleSide: true,
        uniforms,
        vertex: /* glsl */ `attribute float aSchool; varying float vS;
          void main() { vS = aSchool; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragment: /* glsl */ `uniform vec3 uCol; uniform float uHi[64]; varying float vS;
          void main() {
            float h = uHi[int(vS + 0.5)];
            gl_FragColor = vec4(uCol * (0.95 + 0.35 * uNight + 0.3 * h), 0.2 + 0.06 * uNight + 0.2 * h);
          }`,
      }),
    );
    plate.renderOrder = -2.8;
    plate.frustumCulled = false;
    group.add(plate);
    const outline = new THREE.Mesh(
      ribbonGeometry(edge),
      material({
        transparent: true,
        depthWrite: false,
        offset: 5,
        doubleSide: true,
        uniforms,
        vertex: /* glsl */ `attribute vec4 aInfo; varying vec4 vInfo; void main() { vInfo = aInfo; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragment: /* glsl */ `uniform float uHi[64]; varying vec4 vInfo;
          void main() { gl_FragColor = vec4(vInfo.rgb, 0.5 + 0.25 * uNight + 0.3 * uHi[int(vInfo.w + 0.5)]); }`,
      }),
    );
    outline.renderOrder = -2.7;
    outline.frustumCulled = false;
    group.add(outline);
  }

  const want = new Float32Array(64);
  let hovered = -1;
  let selected = -1;
  return {
    group,
    pickables,
    labels,
    setHover(i: number) {
      hovered = i;
    },
    setSelected(i: number) {
      selected = i;
    },
    update(dt: number) {
      for (let i = 0; i < Math.min(64, board.schools.length); i++) {
        want[i] = i === hovered ? 1 : i === selected ? 0.8 : 0;
        hi[i] += (want[i] - hi[i]) * Math.min(1, dt * 7);
      }
    },
  };
}

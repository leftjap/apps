// 히어로 랜드마크: 홍익대(건물), 홍대입구역·합정역(바닥 판과 빛 기둥), 서강대교·양화대교(도로 셰이더가 색을 입힌다).
// 마우스를 올리면 솟거나 밝아지고, 누르면 사이드바에 카드가 뜬다.
import * as THREE from 'three';
import type { Board } from '../data/board.ts';
import { headingAt, nearestS, pointAt } from '../poly.ts';
import { buildingMaterial, prismGeometry } from './buildings.ts';
import { material } from './env.ts';
import { roadWidth } from './roads.ts';
import { addRibbon, ribbon, ribbonGeometry } from './util.ts';

export interface LandmarkInfo {
  id: string;
  /** 구운 자료의 랜드마크 번호 */
  n: number;
  name: string;
  kind: string;
  color: string;
  desc: string;
  /** 역 이름(역일 때) */
  station?: string;
}

export const LANDMARKS: LandmarkInfo[] = [
  { id: 'hongik', n: 1, name: '홍익대학교', kind: '캠퍼스', color: '#ffb3c6', desc: '미술과 디자인으로 이름난 대학입니다. 정문 앞에서 홍대 거리가 시작됩니다.' },
  { id: 'hongik-stn', n: 2, name: '홍대입구역', kind: '환승역', color: '#7fe0a8', desc: '2호선, 경의중앙선, 공항철도가 만나는 역입니다.', station: '홍대입구' },
  { id: 'hapjeong-stn', n: 3, name: '합정역', kind: '환승역', color: '#ffcf7a', desc: '2호선과 6호선이 만나는 역입니다. 양화대교 북단과 이어집니다.', station: '합정' },
  { id: 'seogang-br', n: 4, name: '서강대교', kind: '한강 다리', color: '#ff8d78', desc: '밤섬 위를 지나는 다리입니다. 붉은 아치가 표지입니다.' },
  { id: 'yanghwa-br', n: 5, name: '양화대교', kind: '한강 다리', color: '#8ec5ff', desc: '합정과 영등포를 잇는 다리입니다. 가운데에 선유도가 있습니다.' },
];
export const LM_COLORS = ['#ffffff', ...LANDMARKS.map((l) => l.color)];

const PLATE = { len: 230, wid: 34 };

export function makeLandmarks(board: Board, roadGlow: number[]) {
  const group = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const hover = LANDMARKS.map(() => 0);
  let hovered = '';
  let selected = '';

  // 홍익대: 건물 메시를 따로 만들어 고유 색을 입힌다
  const campusMat = buildingMaterial(LANDMARKS[0].color);
  const campus = new THREE.Mesh(prismGeometry(board.buildings.filter((b) => b.lm === 1)), campusMat);
  campus.frustumCulled = false;
  campus.userData.id = 'hongik';
  group.add(campus);
  pickables.push(campus);

  // 역: 2호선 방향으로 놓은 바닥 판과, 올렸을 때 솟는 빛 기둥
  const line2 = board.lines.find((l) => l.id === '2')!;
  const tmp = [0, 0, 0];
  const plates = LANDMARKS.filter((l) => l.station).map((info) => {
    const c = board.landmarks.find((l) => l.id === info.id)!;
    const near = nearestS(line2.p, line2.cum, c.x, c.z);
    const yaw = headingAt(line2.p, pointAt(line2.p, line2.cum, near.s, tmp));
    const uniforms = { uCol: { value: new THREE.Color(info.color) }, uHover: { value: 0 } };
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(PLATE.len, PLATE.wid).rotateX(-Math.PI / 2),
      material({
        transparent: true,
        depthWrite: false,
        offset: 5,
        uniforms,
        vertex: /* glsl */ `varying vec2 vP; varying float vDist;
          void main() { vP = (uv * 2.0 - 1.0) * vec2(${(PLATE.len / 2).toFixed(1)}, ${(PLATE.wid / 2).toFixed(1)});
            vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragment: /* glsl */ `uniform vec3 uCol; uniform float uHover; varying vec2 vP; varying float vDist;
          void main() {
            vec2 q = abs(vP) - vec2(${(PLATE.len / 2 - 15).toFixed(1)}, ${(PLATE.wid / 2 - 15).toFixed(1)});
            float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 13.0;       // 모서리가 둥근 사각형까지의 거리
            float inside = smoothstep(0.5, -0.5, d);
            float line = smoothstep(2.6, 1.2, abs(d + 1.6));
            float pulse = 0.5 + 0.5 * sin(uTime * 1.6 - abs(vP.x) * 0.05);
            float a = inside * (0.20 + 0.12 * pulse + 0.25 * uHover) + line * (0.7 + 0.3 * uHover);
            gl_FragColor = vec4(uCol * (0.95 + 0.5 * uNight + 0.4 * uHover), a * inside);
          }`,
      }),
    );
    plate.renderOrder = -3;
    const column = new THREE.Mesh(
      new THREE.BoxGeometry(PLATE.len - 8, 70, PLATE.wid - 8).translate(0, 35, 0),
      material({
        transparent: true,
        additive: true,
        depthWrite: false,
        doubleSide: true,
        uniforms,
        vertex: /* glsl */ `varying float vY;
          void main() { vY = position.y / 70.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragment: /* glsl */ `uniform vec3 uCol; uniform float uHover; varying float vY;
          void main() { float f = (1.0 - vY); gl_FragColor = vec4(uCol * f * f * 0.34 * uHover * step(vY, uHover), 1.0); }`,
      }),
    );
    column.renderOrder = 4;
    // 고르기용 상자(보이지 않는다)
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(PLATE.len, 24, PLATE.wid + 20).translate(0, 12, 0), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.userData.id = info.id;
    for (const m of [plate, column, proxy]) {
      m.position.set(c.x, 0.5, c.z);
      m.rotation.y = -yaw;
      group.add(m);
    }
    pickables.push(proxy);
    return { info, uniforms };
  });

  // 다리: 보이는 것은 도로 메시가 그린다. 여기서는 고르기용 넓은 띠만 만든다
  for (const info of LANDMARKS.filter((l) => l.kind === '한강 다리')) {
    const r = ribbon();
    for (const road of board.roads) if (road.lm === info.n) addRibbon(r, road.p, roadWidth(road) * 2.2, [0, 0, 0, 0], 1);
    const proxy = new THREE.Mesh(ribbonGeometry(r), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    proxy.userData.id = info.id;
    group.add(proxy);
    pickables.push(proxy);
  }

  return {
    group,
    pickables,
    setHover(id: string) {
      hovered = id;
    },
    setSelected(id: string) {
      selected = id;
    },
    update(dt: number) {
      LANDMARKS.forEach((l, i) => {
        const want = l.id === hovered ? 1 : l.id === selected ? 0.6 : 0;
        hover[i] += (want - hover[i]) * Math.min(1, dt * 7);
        roadGlow[l.n] = hover[i];
      });
      campusMat.uniforms.uLift.value = hover[0] * 9;
      campusMat.uniforms.uGlow.value = 0.3 + hover[0] * 0.8;
      plates.forEach((p) => (p.uniforms.uHover.value = hover[LANDMARKS.indexOf(p.info)]));
    },
  };
}

// 랜드마크: 홍익대·학교·공공기관·문화·역사 건물(이름으로 고른 건물에 옅은 고유 색과 이름표), 서강대교·양화대교(도로 셰이더가 색을 입힌다).
// 홍대입구역·합정역의 모습과 고르기는 stations.ts 가 맡고, 여기에는 카드에 쓸 정보만 둔다.
// 마우스를 올리면 솟거나 밝아지고, 누르면 사이드바에 카드가 뜬다.
import * as THREE from 'three';
import type { Board } from '../data/board.ts';
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
  { id: 'kyungsung', n: 6, name: '경성중·고등학교', kind: '학교', color: '#c9b8f0', desc: '경성중학교와 서울경성고등학교입니다.' },
  { id: 'hongbu', n: 7, name: '홍익대 사범대 부속학교', kind: '학교', color: '#c9b8f0', desc: '홍익대학교 사범대학 부속 초등학교·여자중학교·여자고등학교입니다.' },
  { id: 'fire', n: 8, name: '마포소방서', kind: '공공기관', color: '#f0907e', desc: '마포구를 맡는 소방서입니다.' },
  { id: 'library', n: 9, name: '마포중앙도서관', kind: '공공기관', color: '#86d3c3', desc: '마포구가 운영하는 공공도서관입니다.' },
  { id: 'sangsang', n: 10, name: 'KT&G 상상마당 홍대', kind: '문화 공간', color: '#f2c27a', desc: '공연장과 전시장, 영화관이 있는 복합 문화 공간입니다.' },
  { id: 'jeoldusan', n: 11, name: '절두산 순교성지', kind: '역사', color: '#f2c27a', desc: '병인박해 때 천주교 신자들이 처형된 자리에 세운 성지입니다. 양화대교 북단 한강변에 있습니다.' },
  { id: 'yanghwajin', n: 12, name: '양화진 외국인선교사묘원', kind: '역사', color: '#f2c27a', desc: '구한말 이후 한국에서 활동한 외국인 선교사와 그 가족이 묻힌 묘원입니다.' },
  { id: 'mecenat', n: 13, name: '메세나폴리스', kind: '랜드마크 건물', color: '#c9d1dc', desc: '합정역과 이어진 주상복합 단지입니다.' },
];
/** 도로 셰이더가 쓰는 랜드마크 색(번호 0~5: 일반·홍익대·두 역·두 다리) */
export const LM_COLORS = ['#ffffff', ...LANDMARKS.slice(0, 5).map((l) => l.color)];

export interface PlaceLabel {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  z: number;
}

export function makeLandmarks(board: Board, roadGlow: number[]) {
  const group = new THREE.Group();
  const pickables: THREE.Object3D[] = [];
  const hover = LANDMARKS.map(() => 0);
  const mats = new Map<number, THREE.ShaderMaterial>();
  const labels: PlaceLabel[] = [];
  let hovered = '';
  let selected = '';

  // 건물 랜드마크: 건물 메시를 따로 만들어 옅은 고유 색을 입히고, 이름표를 가장 높은 지붕 위에 띄운다
  for (const info of LANDMARKS) {
    const list = board.buildings.filter((b) => b.lm === info.n);
    if (!list.length) continue;
    // 평소에는 옅게: 흰색 쪽으로 섞는다(홍익대는 조금 진하게)
    const tint = new THREE.Color('#ffffff').lerp(new THREE.Color(info.color), info.n === 1 ? 0.8 : 0.5);
    const mat = buildingMaterial(`#${tint.getHexString()}`);
    const mesh = new THREE.Mesh(prismGeometry(list), mat);
    mesh.frustumCulled = false;
    mesh.userData.id = info.id;
    group.add(mesh);
    pickables.push(mesh);
    mats.set(info.n, mat);
    let x = 0;
    let z = 0;
    let top = 0;
    let n = 0;
    for (const b of list) {
      for (let i = 0; i < b.pts.length; i += 2) (x += b.pts[i]), (z += b.pts[i + 1]), n++;
      top = Math.max(top, b.h);
    }
    labels.push({ id: info.id, name: info.name, color: info.color, x: x / n, y: top + 10, z: z / n });
  }

  // 홍익대 캠퍼스 바닥: 외곽선 안을 옅은 분홍으로 칠하고 테두리를 긋는다
  if (board.campus.length >= 6) {
    const ring: THREE.Vector2[] = [];
    for (let i = 0; i < board.campus.length; i += 2) ring.push(new THREE.Vector2(board.campus[i], board.campus[i + 1]));
    const tri = THREE.ShapeUtils.triangulateShape(ring, []);
    const pos = ring.flatMap((p) => [p.x, 0.3, p.y]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(tri.flat());
    const col = new THREE.Color(LANDMARKS[0].color);
    const plate = new THREE.Mesh(
      g,
      material({
        transparent: true,
        depthWrite: false,
        offset: 4,
        doubleSide: true,
        uniforms: { uCol: { value: col } },
        vertex: /* glsl */ `varying float vDist; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragment: /* glsl */ `uniform vec3 uCol; varying float vDist;
          void main() { gl_FragColor = vec4(uCol * (0.9 + 0.4 * uNight), 0.16 + 0.06 * uNight); }`,
      }),
    );
    plate.renderOrder = -2.8;
    plate.frustumCulled = false;
    group.add(plate);
    const edge = ribbon();
    const loop = [...pos, pos[0], pos[1], pos[2]];
    addRibbon(edge, loop, 2.2, [col.r, col.g, col.b, 0]);
    const outline = new THREE.Mesh(
      ribbonGeometry(edge),
      material({
        transparent: true,
        depthWrite: false,
        offset: 5,
        doubleSide: true,
        vertex: /* glsl */ `attribute vec4 aInfo; varying vec4 vInfo; void main() { vInfo = aInfo; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragment: /* glsl */ `varying vec4 vInfo; void main() { gl_FragColor = vec4(vInfo.rgb, 0.55 + 0.3 * uNight); }`,
      }),
    );
    outline.renderOrder = -2.7;
    outline.frustumCulled = false;
    group.add(outline);
  }

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
    labels,
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
        if (l.n <= 5) roadGlow[l.n] = hover[i];
        const mat = mats.get(l.n);
        if (mat) {
          mat.uniforms.uLift.value = hover[i] * (l.n === 1 ? 9 : 5);
          mat.uniforms.uGlow.value = (l.n === 1 ? 0.3 : 0.12) + hover[i] * 0.8;
        }
      });
    },
  };
}

// 히어로 랜드마크: 홍익대(건물), 서강대교·양화대교(도로 셰이더가 색을 입힌다).
// 홍대입구역·합정역의 모습과 고르기는 stations.ts 가 맡고, 여기에는 카드에 쓸 정보만 둔다.
// 마우스를 올리면 솟거나 밝아지고, 누르면 사이드바에 카드가 뜬다.
import * as THREE from 'three';
import type { Board } from '../data/board.ts';
import { buildingMaterial, prismGeometry } from './buildings.ts';
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
    },
  };
}

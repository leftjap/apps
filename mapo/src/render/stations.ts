// 역. 지하 층(UNDER_Y)에 승강장 통로와 출구로 이어지는 연결 통로를 그리고(역을 골라 지하 들여다보기가 켜졌을 때만 보인다), 지상에는 출구마다 서울 지하철 출구 모양(화강석 난간·유리 벽·유리 지붕을 씌운
// 내려가는 계단, 띠 간판, 폴사인)과 역 엘리베이터(유리 상자)를 세운다. 출구는 보도에 길과 나란히 놓이고 역 쪽으로 내려간다(구울 때 정한 방향).
// 홍대입구·합정처럼 출구가 넓게 흩어진 역도 출구 하나하나가 구내로 이어져 역의 실제 범위가 드러난다.
// 열차가 역에 서면(그 역 출구에서 사람이 나오는 때) 그 역 출구 지붕이 그 열차의 노선 색으로 잠깐 밝아진다(trainLight.ts exitFlash).
import * as THREE from 'three';
import type { Board, Exit } from '../data/board.ts';
import { exitLook, type ExitKind } from '../data/exits.ts';
import { exitBody, exitOutline } from '../data/exitFit.ts';
import { placeOff, type GroundQuery } from '../data/offroad.ts';
import { nearestS, pointAt } from '../poly.ts';
import { material, UNDER_Y } from './env.ts';
import { sizeGlsl } from './size.ts';
import { exitFlash } from './trainLight.ts';
import { addRibbon, instanced, merge, part, ribbon, ribbonGeometry } from './util.ts';

/** 엘리베이터 지붕(2.8m 정사각형) 바닥을 0.7m 간격으로 찍은 점 [x, z, ...](방향은 보지 않는다) */
export function liftFootprint(x: number, z: number): number[] {
  const out: number[] = [];
  for (let a = -1.4; a <= 1.41; a += 0.7) for (let b = -1.4; b <= 1.41; b += 0.7) out.push(x + a, z + b);
  return out;
}
/** 그려질 출구 자리: 출구 모형 바닥(exitOutline)이 찻길 면 안이면 찻길 면 밖으로 옮긴 출구(방향·길이 그대로) */
export function placedExit(e: Exit, station: string, ground: GroundQuery): Exit {
  if (!Number.isFinite(e.yaw)) return e;
  const r = placeOff(ground, e.x, e.z, exitOutline(e, exitLook(station, e.ref)).flat());
  return r.moved ? { ...e, x: r.x, z: r.z } : e;
}

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

/** 출구 모형 부품 번호(셰이더가 부품마다 색을 칠한다) */
export const EXIT_PARTS = { STAIR: 0, GRANITE: 1, GLASS: 2, ROOF: 3, FASCIA: 4, POST: 5, COPING: 6, STEP: 7, SIGN: 8, POLE: 9, VAULT: 13, SLOPE: 14, KIOSK: 15, MURAL: 16 } as const;
const P = EXIT_PARTS;
const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// 출구 모형은 폭 3m(벽 안쪽)·길이 9m 기준으로 만들고, 출구마다 실제 폭·길이로 늘인다(셰이더의 aSize). 앞(+x)이 내려가는 쪽, 입구는 −x.
/** 모든 출구: 계단 바닥, 입구 앞 두 단 턱(노란 점자블록), 입구 옆 폴사인 */
const common = () => [
  part(B(7.9, 0.04, 3.0, 0.3, 0.04, 0), P.STAIR),
  part(B(1.3, 0.3, 3.64, -4.95, 0.15, 0), P.STEP),
  part(B(0.5, 0.15, 3.64, -5.85, 0.075, 0), P.STEP),
  part(B(0.1, 2.0, 0.1, -6.3, 1.0, 1.75), P.POLE),
  part(B(0.2, 1.8, 0.5, -6.3, 2.85, 1.75), P.SIGN),
];
/** 양옆과 뒤의 화강석 벽(높이 h)과 갓돌 */
const walls = (h: number) => [
  ...[1.66, -1.66].map((z) => part(B(8.9, h, 0.32, 0, h / 2, z), P.GRANITE)),
  part(B(0.32, h, 3.64, 4.29, h / 2, 0), P.GRANITE),
  ...[1.66, -1.66].map((z) => part(B(9.0, 0.08, 0.44, 0, h + 0.04, z), P.COPING)),
  part(B(0.44, 0.08, 3.76, 4.29, h + 0.04, 0), P.COPING),
];
/** 벽 위 유리(y0~y1) 양옆과 뒤 */
const glass = (y0: number, y1: number) => [
  ...[1.66, -1.66].map((z) => part(B(8.6, y1 - y0, 0.04, 0.1, (y0 + y1) / 2, z), P.GLASS)),
  part(B(0.04, y1 - y0, 3.3, 4.29, (y0 + y1) / 2, 0), P.GLASS),
];
/** 네 모서리 기둥(높이 h) */
const posts = (h: number) => [[-4.35, 1.66], [-4.35, -1.66], [4.35, 1.66], [4.35, -1.66]].map(([x, z]) => part(B(0.14, h, 0.14, x, h / 2, z), P.POST));
/** 입구 위 띠 간판(셰이더가 1.93~2.53m 높이에 그림을 칠한다) */
const fascia = () => part(B(0.12, 0.6, 3.5, -4.62, 2.23, 0), P.FASCIA);
/** 반원통 유리 지붕(반지름 1.75m, 1.9m 높이에서 시작)과 뒤 끝의 반원 유리 */
const vault = () => [
  part(new THREE.CylinderGeometry(1.75, 1.75, 9.5, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).translate(-0.15, 1.9, 0), P.VAULT),
  part(new THREE.CircleGeometry(1.75, 12, 0, Math.PI).rotateY(Math.PI / 2).translate(4.4, 1.9, 0), P.GLASS),
];
/** 계단을 따라 낮아지는 유리 옆벽(입구 2.55m → 뒤 1.47m, 아래 0.35m 부터) */
const slopeGlass = () =>
  [1.66, -1.66].map((z) => {
    const s = new THREE.Shape([new THREE.Vector2(-4.4, 0.35), new THREE.Vector2(4.4, 0.35), new THREE.Vector2(4.4, 1.47), new THREE.Vector2(-4.4, 2.55)]);
    return part(new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false }).translate(0, 0, z - 0.02), P.GLASS);
  });

/** 출구 모양별 모형(exits.ts 의 ExitKind) */
export const EXIT_SHAPES: Record<ExitKind, () => THREE.BufferGeometry> = {
  // 지붕 없는 개방형: 화강석 벽 위에 스테인리스 난간
  open: () => merge([...common(), ...walls(0.95), ...[1.66, -1.66].map((z) => part(B(8.8, 0.05, 0.05, 0, 1.75, z), P.POST)), part(B(0.05, 0.05, 3.3, 4.29, 1.75, 0), P.POST)]),
  // 1984년형: 화강석 벽 위 기둥에 얇은 평지붕, 옆은 트였다
  old: () => merge([...common(), ...walls(1.0), ...posts(2.55), part(B(9.5, 0.16, 4.0, -0.15, 2.63, 0), P.ROOF), fascia()]),
  // 2000년 둘레 신형: 낮은 화강석 벽, 유리 옆벽, 반원통 유리 지붕
  vault: () => merge([...common(), ...walls(0.8), ...glass(0.88, 1.9), ...vault(), fascia()]),
  // 표준형: 화강석 벽, 유리 벽, 진회색 틀의 평평한 유리 지붕
  box: () => merge([...common(), ...walls(1.05), ...glass(1.13, 2.55), part(B(9.5, 0.26, 4.1, -0.15, 2.68, 0), P.ROOF), ...posts(2.56), fascia()]),
  // 도시형: 낮은 턱 위 유리 옆벽, 계단을 따라 낮아지는 얇은 지붕
  slim: () =>
    merge([
      ...common(),
      ...walls(0.35),
      ...slopeGlass(),
      part(B(0.04, 1.1, 3.3, 4.29, 0.92, 0), P.GLASS),
      part(B(9.6, 0.1, 3.9, 0, 0, 0).rotateZ(-Math.atan2(1.08, 8.8)).translate(-0.05, 2.06, 0), P.SLOPE),
      fascia(),
    ]),
  // 기타(상자형): 문이 난 작은 건물
  kiosk: () =>
    merge([
      ...common(),
      ...[1.66, -1.66].map((z) => part(B(8.9, 2.7, 0.3, 0, 1.35, z), P.KIOSK)),
      part(B(0.3, 2.7, 3.64, 4.29, 1.35, 0), P.KIOSK),
      ...[1.36, -1.36].map((z) => part(B(0.3, 2.7, 0.6, -4.3, 1.35, z), P.KIOSK)),
      part(B(9.4, 0.3, 4.0, 0, 2.85, 0), P.ROOF),
      fascia(),
    ]),
  // 공항철도·경의중앙선: 낮은 벽 위 유리, 강철 트러스를 댄 큰 반원통(높이는 aSize 로 키운다)
  grand: () => merge([...common(), ...walls(0.6), ...glass(0.68, 1.9), ...vault(), fascia()]),
  // 홍대입구 3번: 낮은 턱 위 그림 판(계단 따라 낮아진다), 바깥에 흰 V자 버팀대, 얇은 흰 평지붕
  mural: () =>
    merge([
      ...common(),
      ...walls(0.35),
      ...slopeGlass().map((g) => part(g, P.MURAL)),
      part(B(0.04, 1.1, 3.3, 4.29, 0.92, 0), P.MURAL),
      ...[1.78, -1.78].flatMap((z) => [-3.3, -1.1, 1.1, 3.3].map((x, k) => part(B(0.14, 2.5, 0.12, 0, 0, 0).rotateZ(k % 2 ? 0.62 : -0.62).translate(x, 1.45 - x * 0.06, z), P.POST))),
      part(B(9.6, 0.12, 3.9, 0, 0, 0).rotateZ(-Math.atan2(1.08, 8.8)).translate(-0.05, 2.06, 0), P.ROOF),
    ]),
};
const KIND_NO: Record<ExitKind, number> = { open: 0, old: 1, vault: 2, box: 3, slim: 4, kiosk: 5, grand: 6, mural: 7 };

/** ground 가 있으면 출구 모형·엘리베이터 바닥이 그린 찻길 면 안(가장자리에서 0.3m 넘게)일 때 찻길 면 밖 가장 가까운 자리로 옮겨 그린다(재작업 W57. 사람이 드나드는 출구 자리는 그대로) */
export function makeStations(board: Board, ground?: GroundQuery) {
  const group = new THREE.Group();
  const names = board.stations.map((s) => s.name);
  const color = (name: string) => new THREE.Color(ACCENT[name] ?? '#8fd3ff');
  const floor = ribbon();
  const proxies: THREE.Object3D[] = [];
  const tmp = [0, 0, 0];
  /** 출구마다 [x, z, 내려가는 방향, 역 번호] 와 번호판 글자, 모양 */
  const doors: [number, number, number, number][] = [];
  const looks: ReturnType<typeof exitLook>[] = [];
  const refs: string[] = [];

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
    for (const e0 of board.exits.filter((e) => e.st === name)) {
      const e = ground ? placedExit(e0, name, ground) : e0;
      // 가장 가까운 승강장 통로까지 곧게 잇는다
      let best = { d: Infinity, x: e.x, z: e.z };
      for (const { l, a, b } of corridors) {
        const r = nearestS(l.p, l.cum, e.x, e.z);
        pointAt(l.p, l.cum, Math.min(b, Math.max(a, r.s)), tmp);
        const d = Math.hypot(tmp[0] - e.x, tmp[2] - e.z);
        if (d < best.d) best = { d, x: tmp[0], z: tmp[2] };
      }
      const toCorridor = best.d < Infinity ? Math.atan2(best.z - e.z, best.x - e.x) : 0;
      const end = best.d < Infinity ? [best.x, best.z] : [e.x + Math.cos(toCorridor) * 12, e.z + Math.sin(toCorridor) * 12];
      const pts = [e.x, UNDER_Y, e.z, end[0], UNDER_Y, end[1]];
      addRibbon(floor, pts, 7, info, 0, 3);
      addRibbon(mine, pts, 16, info, 0, 3);
      // 출구 점(OSM)은 계단 입구 자리다. 모형 가운데는 내려가는 쪽으로 (길이 9m 기준 3.5m 를 실제 길이에 맞춰)
      const dir = Number.isFinite(e.yaw) ? e.yaw : toCorridor;
      const look = exitLook(name, e.ref);
      const body = exitBody({ ...e, yaw: dir }, look.l);
      doors.push([body.cx, body.cz, dir, si]);
      // 외곽선으로 잰 출구는 지붕(모형 몸체 9.5m)이 외곽선 길이에 맞게
      looks.push({ ...look, l: e.len ? (body.len * 9) / 9.5 : look.l });
      refs.push(e.ref);
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
  /** 역마다 출구 지붕 밝기와 그 색(막 선 열차의 노선 색) */
  const flash = new Float32Array(16);
  const flashAge = new Float32Array(16).fill(Infinity);
  const flashCol = Array.from({ length: 16 }, () => new THREE.Color());
  const uniforms = { uHi: { value: hi } };
  const flashUniforms = { uFlash: { value: flash }, uFlashCol: { value: flashCol } };
  const floorMesh = new THREE.Mesh(
    ribbonGeometry(floor),
    material({
      under: true,
      doubleSide: true,
      uniforms,
      vertex: /* glsl */ `
        attribute vec2 aUV; attribute vec4 aInfo;
        varying vec2 vUV; varying vec4 vInfo; varying float vDist; varying vec2 vXZ;
        void main() {
          vUV = aUV; vInfo = aInfo; vXZ = position.xz;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform float uHi[16];
        varying vec2 vUV; varying vec4 vInfo; varying float vDist; varying vec2 vXZ;
        void main() {
          // 평소에는 지상에 비치지 않고, 역을 골라 지하 들여다보기가 켜진 원 안에서만 보인다
          float fi = focusIn(vXZ);
          if (fi < 0.01) discard;
          float h = max(uHi[int(vInfo.w + 0.5)], fi);
          float x = abs(vUV.x);
          float edge = smoothstep(0.78, 0.9, x) * (1.0 - smoothstep(0.96, 1.0, x));
          float tile = step(0.92, fract(vUV.y / 6.0)) * 0.5;
          vec3 col = mix(vInfo.rgb * 0.62, mix(vInfo.rgb, vec3(1.0), 0.3), uNight) * (1.0 + 0.4 * h);
          float a = (0.26 + 0.06 * uNight + tile * 0.12 + 0.22 * h) * (1.0 - edge) + edge * (0.7 + 0.15 * uNight + 0.2 * h);
          gl_FragColor = vec4(fogged(col, vDist), a * fi);
        }`,
    }),
  );
  floorMesh.renderOrder = -4.6;
  floorMesh.frustumCulled = false;
  group.add(floorMesh);

  // 엘리베이터 출입구: 유리 상자와 지붕(부품 10 유리 11 지붕 12 틀)
  const lift = merge([
    part(new THREE.BoxGeometry(2.4, 2.6, 2.4).translate(0, 1.3, 0), 10),
    part(new THREE.BoxGeometry(2.8, 0.3, 2.8).translate(0, 2.75, 0), 11),
    ...[[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2]].map(([x, z]) => part(new THREE.BoxGeometry(0.12, 2.6, 0.12).translate(x, 1.3, z), 12)),
  ]);

  // 간판 그림: 출구마다 띠 간판(512×64)과 폴사인(64×256) 한 칸씩
  const SHORT: Record<string, string> = { '2': '2', '6': '6', A: '공항', K: '경의' };
  const N = Math.max(1, refs.length);
  const fascia = document.createElement('canvas');
  fascia.width = 512;
  fascia.height = 64 * N;
  const pole = document.createElement('canvas');
  pole.width = 64 * N;
  pole.height = 256;
  const fc = fascia.getContext('2d')!;
  const pc = pole.getContext('2d')!;
  const font = (w: number, px: number) => `${w} ${px}px system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
  const numBox = (g: CanvasRenderingContext2D, ref: string, x: number, y: number, s: number) => {
    g.fillStyle = '#f7c21a';
    g.fillRect(x, y, s, s);
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font(800, ref.length > 1 ? s * 0.62 : s * 0.78);
    g.fillText(ref || '·', x + s / 2, y + s * 0.54);
  };
  refs.forEach((ref, i) => {
    const st = names[doors[i][3]];
    const lines = board.lines.filter((l) => l.stopNames.includes(st));
    // 띠 간판: 짙은 회색 바탕, 왼쪽에 노선 원, 역 이름, 오른쪽 끝에 노란 출구 번호
    const y = i * 64;
    fc.fillStyle = '#2b333b';
    fc.fillRect(0, y, 512, 64);
    fc.fillStyle = '#56616b';
    fc.fillRect(0, y, 512, 3);
    fc.fillRect(0, y + 61, 512, 3);
    let x = 14;
    for (const l of lines) {
      fc.fillStyle = l.color;
      fc.beginPath();
      fc.arc(x + 17, y + 32, 17, 0, Math.PI * 2);
      fc.fill();
      fc.fillStyle = '#fff';
      fc.textAlign = 'center';
      fc.textBaseline = 'middle';
      const t = SHORT[l.id] ?? l.id;
      fc.font = font(800, t.length > 1 ? 13 : 22);
      fc.fillText(t, x + 17, y + 33);
      x += 40;
    }
    fc.textAlign = 'left';
    fc.fillStyle = '#fff';
    fc.font = font(800, 30);
    fc.fillText(st, x + 8, y + 30);
    const w = fc.measureText(st).width;
    fc.font = font(600, 13);
    fc.fillStyle = '#c9d2da';
    fc.fillText('Station', x + 14 + w, y + 36);
    numBox(fc, ref, 452, y + 8, 48);
    // 폴사인: 파란 바탕, 위에 노란 지하철 표시, 출구 번호, 세로 역 이름, 노선 원
    const px = i * 64;
    pc.fillStyle = '#2a64b2';
    pc.fillRect(px, 0, 64, 256);
    pc.fillStyle = '#f7c21a';
    pc.fillRect(px + 4, 4, 56, 50);
    pc.fillStyle = '#111';
    pc.fillRect(px + 18, 12, 28, 26);
    pc.fillStyle = '#f7c21a';
    pc.fillRect(px + 22, 16, 9, 9);
    pc.fillRect(px + 33, 16, 9, 9);
    pc.fillStyle = '#111';
    pc.fillRect(px + 20, 40, 6, 6);
    pc.fillRect(px + 38, 40, 6, 6);
    pc.fillStyle = '#fff';
    pc.textAlign = 'center';
    pc.textBaseline = 'middle';
    pc.font = font(800, ref.length > 1 ? 30 : 38);
    pc.fillText(ref, px + 32, 78);
    pc.font = font(800, 26);
    [...st].slice(0, 5).forEach((ch, k) => pc.fillText(ch, px + 32, 116 + k * 28));
    lines.forEach((l, k) => {
      pc.fillStyle = l.color;
      pc.beginPath();
      pc.arc(px + 32, 236 - k * 22, 9, 0, Math.PI * 2);
      pc.fill();
    });
  });
  const fasciaTex = new THREE.CanvasTexture(fascia);
  const poleTex = new THREE.CanvasTexture(pole);
  fasciaTex.anisotropy = poleTex.anisotropy = 4;

  const lineCol = (name: string) => new THREE.Color(board.lines.find((l) => l.stopNames.includes(name))?.color ?? '#3a6fb0');
  const exitMat = (kind: number) => material({
    uniforms: {
      ...uniforms,
      ...flashUniforms,
      uKind: { value: kind },
      uCols: { value: Array.from({ length: 16 }, (_, i) => (names[i] ? color(names[i]) : new THREE.Color())) },
      uLine: { value: Array.from({ length: 16 }, (_, i) => (names[i] ? lineCol(names[i]) : new THREE.Color())) },
      uFascia: { value: fasciaTex },
      uPole: { value: poleTex },
      uSignN: { value: N },
    },
    vertex: /* glsl */ `
      attribute vec4 aInst; attribute float aPart; attribute float aSign; attribute vec3 aSize;
      varying vec3 vN; varying float vPart; varying float vSt; varying float vDist; varying vec3 vO; varying vec3 vNO; varying float vSign; varying vec3 vW;
      void main() {
        vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
        // 출구마다 실제 길이(x)·폭(z)·높이 배율로 늘인다
        vec3 p = position * vec3(aSize.x, aSize.z, aSize.y) * ${sizeGlsl('exit')};
        float cs = cos(aInst.z), sn = sin(aInst.z);
        vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
        vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
        vPart = aPart; vSt = aInst.w; vO = position; vNO = normal; vSign = aSign; vW = w;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: /* glsl */ `
      uniform float uHi[16]; uniform vec3 uCols[16]; uniform vec3 uLine[16]; uniform float uFlash[16]; uniform vec3 uFlashCol[16]; uniform sampler2D uFascia; uniform sampler2D uPole; uniform float uSignN;
      uniform float uKind;   // 0 개방형 1 구형 2 신형 3 표준형 4 도시형 5 상자형 6 공항철도·경의중앙선 7 그림형, −1 엘리베이터
      varying vec3 vN; varying float vPart; varying float vSt; varying float vDist; varying vec3 vO; varying vec3 vNO; varying float vSign; varying vec3 vW;
      vec3 granite(vec3 o) {
        // 화강석: 회색 바탕에 잔점, 0.6m 마다 판 줄눈
        float speck = hash21(floor(o.xz * 18.0 + o.y * 31.0));
        float joint = step(0.96, fract((o.x + o.z) / 0.6));
        return vec3(0.6, 0.6, 0.59) * (0.9 + 0.16 * speck) * (1.0 - 0.12 * joint);
      }
      // 틀 색: 표준형·도시형은 진회색, 그림형은 흰색, 나머지는 은색
      vec3 frame() { return abs(uKind - 7.0) < 0.5 ? vec3(0.93) : (abs(uKind - 3.0) < 0.5 || abs(uKind - 4.0) < 0.5) ? vec3(0.24, 0.25, 0.27) : vec3(0.78, 0.8, 0.82); }
      void main() {
        int si = int(vSt + 0.5);
        vec3 c = uCols[si];
        float h = uHi[si];
        vec3 n = normalize(vN);
        vec3 col;
        vec3 glow = vec3(0.0);
        if (vPart < 0.5) {
          // 계단: 안쪽(+x)으로 갈수록 깊어 어둡고, 0.3m 마다 디딤판 끝(미끄럼막이)이 밝다
          float deep = smoothstep(-3.6, 4.0, vO.x);
          float nose = step(fract(vO.x / 0.3), 0.14);
          col = mix(vec3(0.6, 0.6, 0.58), vec3(0.06, 0.07, 0.09), deep) * (0.85 + 0.3 * nose * (1.0 - deep));
          col += vec3(1.0, 0.92, 0.75) * 0.35 * uNight * (1.0 - deep * 0.6);
        } else if (vPart < 1.5) {
          col = lit(granite(vO), n);
        } else if (vPart < 2.5) {
          // 유리 벽: 1.4m 마다 세로 틀, 안쪽 계단실 불빛이 밤에 비친다
          float mull = step(0.94, fract((vO.x + vO.z + 4.3) / 1.43));
          vec3 glass = vec3(0.55, 0.68, 0.72);
          col = lit(glass, n) * 0.8 + vec3(0.2, 0.25, 0.27) * 0.4;
          col = mix(col, lit(frame(), n), clamp(mull, 0.0, 1.0));
          glow = vec3(1.0, 0.95, 0.85) * 0.55;
        } else if (vPart < 3.5) {
          // 유리 지붕: 은색 테와 1.1m 마다 살, 그 사이 유리는 아래 계단이 비쳐 어둡다
          float top = step(0.5, n.y);
          float rim = 1.0 - step(abs(vO.x + 0.15), 4.45) * step(abs(vO.z), 1.75);
          float rib = step(0.9, fract((vO.x + 4.9) / 1.1));
          vec3 glass = mix(vec3(0.42, 0.55, 0.6), vec3(0.22, 0.3, 0.34), smoothstep(-3.0, 3.0, vO.x));
          vec3 metal = frame();
          if (abs(uKind - 1.0) < 0.5) glass = vec3(0.74, 0.75, 0.76);        // 구형: 불투명 금속 지붕
          if (abs(uKind - 5.0) < 0.5) glass = metal = vec3(0.3, 0.31, 0.33); // 상자형: 평평한 지붕
          if (abs(uKind - 7.0) < 0.5) glass = metal = vec3(0.9, 0.91, 0.92); // 그림형: 얇은 흰 지붕
          col = top > 0.5 ? mix(glass, metal, max(rim, rib)) : metal * 0.92;
          col = lit(col, n) + (top > 0.5 ? vec3(0.08, 0.1, 0.11) * (1.0 - max(rim, rib)) : vec3(0.0));
          glow = vec3(1.0, 0.95, 0.85) * 0.25 * (1.0 - max(rim, rib)) * top + c * 0.2 * h;
        } else if (vPart < 4.5) {
          // 띠 간판: 입구 쪽(−x) 면에 그림, 밤에는 뒤에서 불이 켜진다
          float front = step(vNO.x, -0.5);
          vec2 uv = vec2(clamp((vO.z + 1.75) / 3.5, 0.0, 1.0), clamp((vO.y - 1.93) / 0.6, 0.0, 1.0));
          vec3 t = texture2D(uFascia, vec2(uv.x, 1.0 - (vSign + 1.0 - uv.y) / uSignN)).rgb;
          col = mix(lit(vec3(0.3, 0.34, 0.38), n), t * (0.85 + 0.25 * uNight), front);
          glow = t * 0.65 * front;
        } else if (vPart < 5.5) {
          col = lit(frame(), n);
        } else if (vPart < 6.5) {
          col = lit(granite(vO) * 1.12, n);
        } else if (vPart < 7.5) {
          // 입구 턱: 윗면 끝에 노란 점자블록 줄
          col = granite(vO);
          float tactile = step(0.5, n.y) * step(abs(vO.x + 4.45), 0.22) * step(abs(vO.z), 1.45);
          col = mix(col, vec3(0.95, 0.76, 0.12), tactile);
          col = lit(col, n);
        } else if (vPart < 8.5) {
          // 폴사인 판: 길 따라 보이는 두 면(±x)에 그림
          float face = step(0.5, abs(vNO.x));
          vec2 uv = vec2(clamp((vO.z - 2.1) / 0.5, 0.0, 1.0), clamp((vO.y - 1.95) / 1.8, 0.0, 1.0));
          if (vNO.x > 0.0) uv.x = 1.0 - uv.x;
          vec3 t = texture2D(uPole, vec2((vSign + uv.x) / uSignN, uv.y)).rgb;
          col = mix(lit(vec3(0.16, 0.36, 0.66), n), t * (0.9 + 0.2 * uNight), face);
          glow = t * 0.55 * face;
        } else if (vPart < 9.5) {
          col = lit(vec3(0.24, 0.26, 0.29), n);
        } else if (vPart > 12.5 && vPart < 13.5) {
          // 반원통 유리 지붕: 1.1m 마다 은색 아치, 공항철도·경의중앙선은 굵은 강철 트러스가 비스듬히 지난다
          float rib = step(0.88, fract((vO.x + 4.9) / 1.1));
          float ang = atan(vO.y - 1.9, vO.z);
          float truss = step(6.0, uKind) * max(step(0.82, fract((vO.x + ang * 1.6) / 2.4)), step(0.82, fract((vO.x - ang * 1.6) / 2.4)));
          vec3 glass = vec3(0.5, 0.66, 0.7);
          col = mix(lit(glass, n) * 0.85 + vec3(0.06, 0.09, 0.1), lit(vec3(0.84, 0.86, 0.88), n), max(rib, truss));
          glow = vec3(1.0, 0.95, 0.85) * 0.3 * (1.0 - max(rib, truss));
        } else if (vPart > 13.5 && vPart < 14.5) {
          // 도시형 경사 지붕: 진회색 틀의 얇은 판
          col = lit(mix(vec3(0.3, 0.36, 0.4), frame(), step(0.9, fract((vO.x + 4.8) / 1.2))), n);
        } else if (vPart > 15.5 && vPart < 16.5) {
          // 그림 판: 하늘색 바탕, 아래 짙은 파랑 띠, 가운데 주황·흰 열차 줄
          float y = vO.y;
          vec3 sky = mix(vec3(0.66, 0.8, 0.9), vec3(0.8, 0.88, 0.94), smoothstep(0.6, 2.4, y));
          sky = mix(sky, vec3(0.2, 0.36, 0.62), 1.0 - smoothstep(0.55, 0.75, y));
          float train = smoothstep(0.82, 0.86, y) * (1.0 - smoothstep(1.3, 1.34, y)) * step(-1.5, vO.x) * step(vO.x, 3.6);
          sky = mix(sky, mix(vec3(0.94, 0.52, 0.16), vec3(0.95), step(1.08, y)), train);
          col = lit(sky, n);
        } else if (vPart > 14.5 && vPart < 15.5) {
          // 상자형 벽: 짙은 석재
          col = lit(granite(vO) * 0.62, n);
        } else if (vPart < 10.5) {
          // 엘리베이터 유리 상자
          col = lit(vec3(0.5, 0.64, 0.7), n) * 0.85 + vec3(0.06, 0.08, 0.09);
          col = mix(col, lit(vec3(0.3, 0.32, 0.35), n), step(0.92, fract(vO.y / 0.87)));
          glow = vec3(1.0, 0.95, 0.85) * 0.5;
        } else if (vPart < 11.5) {
          col = lit(vec3(0.8, 0.82, 0.84), n);
        } else {
          col = lit(vec3(0.35, 0.37, 0.4), n);
        }
        col += (glow * uNight + c * 0.35 * h * step(1.5, vPart) * step(vPart, 3.5));
        // 위에서 내려다볼 때 출구로 읽히게: 지붕(평지붕·반원통·경사 지붕) 윗면 긴 두 가장자리에 노선 색 띠, 입구 쪽 끝에 노란 출구 번호
        float roof = max(step(2.5, vPart) * step(vPart, 3.5), step(12.5, vPart) * step(vPart, 14.5));
        float up = step(0.3, n.y);
        float band = roof * up * step(1.3, abs(vO.z)) * step(abs(vO.x + 0.1), 4.6);
        col = mix(col, lit(uLine[si] * 0.95, vec3(0.0, 1.0, 0.0)) + uLine[si] * 0.25 * uNight, band);
        vec2 nb = vec2((vO.x + 4.1) / 1.2, (vO.z + 0.6) / 1.2);
        float num = roof * step(0.6, n.y) * step(0.0, nb.x) * step(nb.x, 1.0) * step(0.0, nb.y) * step(nb.y, 1.0);
        if (num > 0.5) col = texture2D(uFascia, vec2((452.0 + 48.0 * nb.y) / 512.0, 1.0 - (vSign + (8.0 + 48.0 * nb.x) / 64.0) / uSignN)).rgb * (0.9 + 0.2 * uNight);
        // 열차가 막 섰다: 노선 색 띠(지붕 없는 개방형은 갓돌 윗면)만 잠깐 밝아진다
        float edge = max(band, step(5.5, vPart) * step(vPart, 6.5) * step(uKind, 0.5) * up);
        col += uFlashCol[si] * uFlash[si] * edge * (0.45 + 0.3 * uNight);
        gl_FragColor = vec4(fogged(col, vDist), 1.0);
      }`,
  });
  // 출구는 모양마다 한 덩어리(인스턴싱). 출구마다 실제 길이·폭(폭 2m 아래는 벽이 겹쳐 2m 로)·높이 배율을 넘긴다
  (Object.keys(EXIT_SHAPES) as ExitKind[]).forEach((kind) => {
    const mine = doors.map((_, i) => i).filter((i) => looks[i].kind === kind);
    if (!mine.length) return;
    const inst = instanced(EXIT_SHAPES[kind](), mine.length, { aInst: 4, aSign: 1, aSize: 3 });
    mine.forEach((i, k) => {
      inst.arr.aInst.set(doors[i], k * 4);
      inst.arr.aSign[k] = i;
      inst.arr.aSize.set([looks[i].l / 9, Math.max(2, looks[i].w) / 3, looks[i].h ?? 1], k * 3);
    });
    inst.geo.instanceCount = mine.length;
    const mesh = new THREE.Mesh(inst.geo, exitMat(KIND_NO[kind]));
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  // 엘리베이터: 가장 가까운 역의 색, 방향은 가장 가까운 출구를 따른다
  const lifts = instanced(lift, Math.max(1, board.elevators.length / 2), { aInst: 4, aSign: 1, aSize: 3 });
  lifts.arr.aSize.fill(1);
  for (let k = 0; k < board.elevators.length / 2; k++) {
    let x = board.elevators[k * 2];
    let z = board.elevators[k * 2 + 1];
    if (ground) ({ x, z } = placeOff(ground, x, z, liftFootprint(x, z)));
    let best = 0;
    for (let i = 1; i < doors.length; i++) if (Math.hypot(doors[i][0] - x, doors[i][1] - z) < Math.hypot(doors[best][0] - x, doors[best][1] - z)) best = i;
    lifts.arr.aInst.set([x, z, doors[best]?.[2] ?? 0, doors[best]?.[3] ?? 0], k * 4);
  }
  lifts.geo.instanceCount = board.elevators.length / 2;
  const liftMesh = new THREE.Mesh(lifts.geo, exitMat(-1));
  liftMesh.frustumCulled = false;
  group.add(liftMesh);

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
    /** 출구 번호 자리: 모형 가운데 지붕 위, 그리고 번호가 건물에 가렸는지 볼 주변 건물(150m 안) */
    exits: board.exits
      .filter((e) => e.ref)
      .map((e) => {
        const look = exitLook(e.st, e.ref);
        const b = Number.isFinite(e.yaw) ? exitBody(e, look.l) : { cx: e.x, cz: e.z };
        const occ = board.buildings.filter((B) => B.h > 3 && Math.abs(B.pts[0] - b.cx) < 150 && Math.abs(B.pts[1] - b.cz) < 150);
        return { st: e.st, ref: e.ref, x: b.cx, y: 3.4 * (look.h ?? 1), z: b.cz, occ };
      }),
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
        flashAge[i] += dt;
        flash[i] = exitFlash(flashAge[i]);
      });
    },
    /** 열차가 역 name 에 섰다: 그 역 출구 지붕을 노선 색 color 로 잠깐 밝힌다 */
    flash(name: string, color: string) {
      const i = names.indexOf(name);
      if (i < 0) return;
      flashAge[i] = 0;
      flashCol[i].set(color);
    },
    setUnderVisible(on: boolean) {
      floorMesh.visible = on;
    },
  };
}

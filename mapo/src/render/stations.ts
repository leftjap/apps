// 역. 지하 층(UNDER_Y)에 승강장 통로와 출구로 이어지는 연결 통로를 그리고(역을 골라 지하 들여다보기가 켜졌을 때만 보인다), 지상에는 출구마다 서울 지하철 출구 모양(화강석 난간·유리 벽·유리 지붕을 씌운
// 내려가는 계단, 띠 간판, 폴사인)과 역 엘리베이터(유리 상자)를 세운다. 출구는 보도에 길과 나란히 놓이고 역 쪽으로 내려간다(구울 때 정한 방향).
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
  /** 출구마다 [x, z, 내려가는 방향, 역 번호] 와 번호판 글자 */
  const doors: [number, number, number, number][] = [];
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
    for (const e of board.exits.filter((e) => e.st === name)) {
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
      // 출구 점(OSM)은 계단 입구 자리다. 모형 가운데는 내려가는 쪽으로 3.5m
      const dir = Number.isFinite(e.yaw) ? e.yaw : toCorridor;
      doors.push([e.x + Math.cos(dir) * 3.5, e.z + Math.sin(dir) * 3.5, dir, si]);
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
  const uniforms = { uHi: { value: hi } };
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

  // 출구(서울 지하철 출입구 사진 대조: 홍대입구 1·3·7·8번, 합정 8번, 상수 1번): 앞(+x)이 내려가는 쪽, 입구는 −x.
  // 입구 앞 두 단 올라선 화강석 턱과 노란 점자블록, 양옆과 뒤의 화강석 난간 벽(갓돌), 그 위 유리 벽, 네 모서리 은색 기둥,
  // 유리 지붕(은색 테와 살), 입구 위 띠 간판(노선 원·역 이름·노란 바탕 출구 번호), 입구 옆 폴사인(노란 지하철 표시, 번호, 역 이름).
  // 부품 번호: 0 계단 바닥 1 화강석 벽 2 유리 벽 3 유리 지붕 4 띠 간판 5 기둥 6 갓돌 7 입구 턱 8 폴사인 판 9 폴사인 기둥
  const door = merge([
    part(new THREE.BoxGeometry(7.9, 0.04, 3.0).translate(0.3, 0.04, 0), 0),
    part(new THREE.BoxGeometry(8.9, 1.05, 0.32).translate(0, 0.52, 1.66), 1),
    part(new THREE.BoxGeometry(8.9, 1.05, 0.32).translate(0, 0.52, -1.66), 1),
    part(new THREE.BoxGeometry(0.32, 1.05, 3.64).translate(4.29, 0.52, 0), 1),
    part(new THREE.BoxGeometry(9.0, 0.08, 0.44).translate(0, 1.09, 1.66), 6),
    part(new THREE.BoxGeometry(9.0, 0.08, 0.44).translate(0, 1.09, -1.66), 6),
    part(new THREE.BoxGeometry(0.44, 0.08, 3.76).translate(4.29, 1.09, 0), 6),
    part(new THREE.BoxGeometry(8.6, 1.42, 0.04).translate(0.1, 1.84, 1.66), 2),
    part(new THREE.BoxGeometry(8.6, 1.42, 0.04).translate(0.1, 1.84, -1.66), 2),
    part(new THREE.BoxGeometry(0.04, 1.42, 3.3).translate(4.29, 1.84, 0), 2),
    part(new THREE.BoxGeometry(9.5, 0.26, 4.1).translate(-0.15, 2.68, 0), 3),
    part(new THREE.BoxGeometry(0.12, 0.6, 3.5).translate(-4.62, 2.23, 0), 4),
    ...[[-4.35, 1.66], [-4.35, -1.66], [4.35, 1.66], [4.35, -1.66]].map(([x, z]) => part(new THREE.BoxGeometry(0.14, 2.56, 0.14).translate(x, 1.28, z), 5)),
    part(new THREE.BoxGeometry(1.3, 0.3, 3.64).translate(-4.95, 0.15, 0), 7),
    part(new THREE.BoxGeometry(0.5, 0.15, 3.64).translate(-5.85, 0.075, 0), 7),
    part(new THREE.BoxGeometry(0.1, 2.0, 0.1).translate(-6.3, 1.0, 2.35), 9),
    part(new THREE.BoxGeometry(0.2, 1.8, 0.5).translate(-6.3, 2.85, 2.35), 8),
  ]);
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
  const exitMat = material({
    uniforms: {
      ...uniforms,
      uCols: { value: Array.from({ length: 16 }, (_, i) => (names[i] ? color(names[i]) : new THREE.Color())) },
      uLine: { value: Array.from({ length: 16 }, (_, i) => (names[i] ? lineCol(names[i]) : new THREE.Color())) },
      uFascia: { value: fasciaTex },
      uPole: { value: poleTex },
      uSignN: { value: N },
    },
    vertex: /* glsl */ `
      attribute vec4 aInst; attribute float aPart; attribute float aSign;
      varying vec3 vN; varying float vPart; varying float vSt; varying float vDist; varying vec3 vO; varying vec3 vNO; varying float vSign; varying vec3 vW;
      void main() {
        vec4 cv = viewMatrix * vec4(aInst.x, 0.0, aInst.y, 1.0);
        vec3 p = position * zoomScale(-cv.z, 4.0, 9.0, 1.0, 3.4);
        float cs = cos(aInst.z), sn = sin(aInst.z);
        vec3 w = vec3(aInst.x + p.x * cs - p.z * sn, p.y + 0.05, aInst.y + p.x * sn + p.z * cs);
        vN = vec3(normal.x * cs - normal.z * sn, normal.y, normal.x * sn + normal.z * cs);
        vPart = aPart; vSt = aInst.w; vO = position; vNO = normal; vSign = aSign; vW = w;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: /* glsl */ `
      uniform float uHi[16]; uniform vec3 uCols[16]; uniform vec3 uLine[16]; uniform sampler2D uFascia; uniform sampler2D uPole; uniform float uSignN;
      varying vec3 vN; varying float vPart; varying float vSt; varying float vDist; varying vec3 vO; varying vec3 vNO; varying float vSign; varying vec3 vW;
      vec3 granite(vec3 o) {
        // 화강석: 회색 바탕에 잔점, 0.6m 마다 판 줄눈
        float speck = hash21(floor(o.xz * 18.0 + o.y * 31.0));
        float joint = step(0.96, fract((o.x + o.z) / 0.6));
        return vec3(0.6, 0.6, 0.59) * (0.9 + 0.16 * speck) * (1.0 - 0.12 * joint);
      }
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
          col = mix(col, lit(vec3(0.78, 0.8, 0.82), n), clamp(mull, 0.0, 1.0));
          glow = vec3(1.0, 0.95, 0.85) * 0.55;
        } else if (vPart < 3.5) {
          // 유리 지붕: 은색 테와 1.1m 마다 살, 그 사이 유리는 아래 계단이 비쳐 어둡다
          float top = step(0.5, n.y);
          float rim = 1.0 - step(abs(vO.x + 0.15), 4.45) * step(abs(vO.z), 1.75);
          float rib = step(0.9, fract((vO.x + 4.9) / 1.1));
          vec3 glass = mix(vec3(0.42, 0.55, 0.6), vec3(0.22, 0.3, 0.34), smoothstep(-3.0, 3.0, vO.x));
          vec3 metal = vec3(0.82, 0.84, 0.86);
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
          col = lit(vec3(0.78, 0.8, 0.83), n);
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
        gl_FragColor = vec4(fogged(col, vDist), 1.0);
      }`,
  });
  const inst = instanced(door, doors.length, { aInst: 4, aSign: 1 });
  doors.forEach((d, i) => {
    inst.arr.aInst.set(d, i * 4);
    inst.arr.aSign[i] = i;
  });
  inst.geo.instanceCount = doors.length;
  const doorMesh = new THREE.Mesh(inst.geo, exitMat);
  doorMesh.frustumCulled = false;
  group.add(doorMesh);
  // 엘리베이터: 가장 가까운 역의 색, 방향은 가장 가까운 출구를 따른다
  const lifts = instanced(lift, Math.max(1, board.elevators.length / 2), { aInst: 4, aSign: 1 });
  for (let k = 0; k < board.elevators.length / 2; k++) {
    const x = board.elevators[k * 2];
    const z = board.elevators[k * 2 + 1];
    let best = 0;
    for (let i = 1; i < doors.length; i++) if (Math.hypot(doors[i][0] - x, doors[i][1] - z) < Math.hypot(doors[best][0] - x, doors[best][1] - z)) best = i;
    lifts.arr.aInst.set([x, z, doors[best]?.[2] ?? 0, doors[best]?.[3] ?? 0], k * 4);
  }
  lifts.geo.instanceCount = board.elevators.length / 2;
  const liftMesh = new THREE.Mesh(lifts.geo, exitMat);
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

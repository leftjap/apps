// 로드뷰 기록으로 더 자세히 그리는 것: 층마다 내민 발코니와 난간·실외기, 원통 계단실, 처마 띠, 벽의 세로 띠, 주차장 입구(detailOf),
// 담·철제 펜스·정문 기둥·포장·주차 칸 선·퍼걸러·가로등·계단식 좌석·옛 철길(siteOf). 사선 격자 외피는 기울인 상자로 그린다. 모두 상자 하나(원통 계단실은 원통 하나)를 인스턴스로 그린다.
// 기록이 있는 구역에만 생기므로 판 전체 정점은 거의 늘지 않는다. 멀면(900m 넘게) 그리지 않는다.
import * as THREE from 'three';
import type { Building } from '../data/board.ts';
import { faceOf, xz, type Face, type PropRec } from '../data/streetview.ts';
import type { Look } from './buildings.ts';
import { material, pal } from './env.ts';

/** 소품 종류(셰이더의 kind) */
export const DK = { slab: 0, rail: 1, ac: 2, eave: 3, band: 4, wallBase: 5, ironFence: 6, pillar: 7, paving: 8, line: 9, wood: 10, pole: 11, lamp: 12, stair: 13, opening: 14, glassBay: 15, glassRail: 16, screen: 17, strut: 18 } as const;

const hexRGB = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const rnd = (a: number, b = 0) => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** 외곽선 변: 시작점, 방향(단위), 길이, 바깥 법선, 면 방향(8방위) */
function edges(p: Float32Array) {
  const out: { ax: number; az: number; dx: number; dz: number; len: number; nx: number; nz: number; face: Face; i: number }[] = [];
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], az = p[i * 2 + 1];
    const len = Math.hypot(p[j * 2] - ax, p[j * 2 + 1] - az) || 1;
    const dx = (p[j * 2] - ax) / len, dz = (p[j * 2 + 1] - az) / len;
    const nx = dz, nz = -dx;
    out.push({ ax, az, dx, dz, len, nx, nz, face: faceOf(nx, nz), i });
  }
  return out;
}

/** 기록한 건물 하나의 세부. box·cyl: 인스턴스마다 [x, y, z, 방향, 너비, 높이, 깊이, 종류, r, g, b, 덤] */
export function detailOf(b: Building, L: Look): { box: number[]; cyl: number[] } {
  const box: number[] = [];
  const cyl: number[] = [];
  const d = L.rec?.detail;
  if (!d) return { box, cyl };
  const push = (o: number[], x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, kind: number, c: [number, number, number], e = 0) =>
    o.push(x, y, z, yaw, sx, sy, sz, kind, c[0], c[1], c[2], e);
  const y0 = b.minH ?? 0;
  const ring = L.tiers[0].ring;
  const E = edges(ring);
  const floorY = (f: number) => (L.gh > 0 ? (f === 0 ? y0 : y0 + L.gh + (f - 1) * L.fh) : y0 + f * L.fh);
  const seed = L.seed * 1000;

  const sb = d.setback;
  /** 꼭대기 층을 들인 면이면 들인 층 수 */
  const cut = (face: Face) => (sb && sb.faces.includes(face) ? sb.floors : 0);
  if (d.balconies) {
    const bc = d.balconies;
    const rail = hexRGB(bc.rail);
    const slabs = bc.slab.map(hexRGB);
    const gb = bc.glassBays;
    for (const e of E) {
      if (!bc.faces.includes(e.face) || e.len < 3 || L.open[e.i] === 0) continue;
      // 외벽 셰이더의 아파트 칸(2.9m)과 같은 칸
      const nb = Math.max(1, Math.round(e.len / 2.9));
      const bw = e.len / nb;
      const yaw = Math.atan2(e.dz, e.dx);
      const glassFace = !!gb && gb.faces.includes(e.face);
      for (let k = 0; k < nb; k++) {
        const t = (k + 0.5) * bw;
        const mx = e.ax + e.dx * t, mz = e.az + e.dz * t;
        for (let f = bc.from; f < L.floors - cut(e.face); f++) {
          const y = floorY(f);
          if (glassFace && k % 2 === 0) {
            // 푸른 유리로 막은 발코니 칸: 아래 남색 띠, 위 유리(밤에는 세대마다 불), 앞에 실외기
            push(box, mx + e.nx * 0.22, y - 0.25, mz + e.nz * 0.22, yaw, bw - 0.2, L.fh, 0.44, DK.glassBay, hexRGB(gb!.glass), rnd(seed + k * 7.1, f * 3.3));
            if (rnd(seed + e.i * 17 + k, f + 3) < gb!.ac) push(box, mx + e.dx * (bw / 2 - 0.75) + e.nx * 0.62, y + 0.05, mz + e.dz * (bw / 2 - 0.75) + e.nz * 0.62, yaw, 0.82, 0.58, 0.3, DK.ac, [0.92, 0.92, 0.9]);
            continue;
          }
          const out = bc.depth / 2;
          push(box, mx + e.nx * out, y - 0.18, mz + e.nz * out, yaw, bw - 0.25, 0.18, bc.depth, DK.slab, slabs[k % slabs.length]);
          push(box, mx + e.nx * (bc.depth - 0.03), y, mz + e.nz * (bc.depth - 0.03), yaw, bw - 0.25, 1.05, 0.05, DK.rail, rail, bc.rails === 'bars' ? 1 : 0);
          if (rnd(seed + e.i * 31 + k, f) < bc.ac) {
            const s = (rnd(seed + k, f + 7) < 0.5 ? -1 : 1) * (bw / 2 - 0.7);
            push(box, mx + e.dx * s + e.nx * 0.28, y, mz + e.dz * s + e.nz * 0.28, yaw, 0.82, 0.58, 0.3, DK.ac, [0.92, 0.92, 0.9]);
          }
        }
      }
    }
  }
  if (sb && sb.rail === 'glass') {
    // 들인 꼭대기 층 앞(아래층 지붕 끝) 유리 난간
    for (const e of E) {
      if (!cut(e.face) || e.len < 1.5 || L.open[e.i] === 0) continue;
      const mx = e.ax + e.dx * (e.len / 2), mz = e.az + e.dz * (e.len / 2);
      push(box, mx - e.nx * 0.05, floorY(L.floors - sb.floors), mz - e.nz * 0.05, Math.atan2(e.dz, e.dx), e.len, 1.1, 0.06, DK.glassRail, [0.72, 0.84, 0.88]);
    }
  }
  if (d.eave) {
    const c = hexRGB(d.eave.color);
    // 처마는 맨 위 덩어리(들인 꼭대기 층) 변에서 내민다
    for (const e of edges(L.tiers[L.tiers.length - 1].ring)) {
      if (!d.eave.faces.includes(e.face) || e.len < 1.5) continue;
      const mx = e.ax + e.dx * (e.len / 2), mz = e.az + e.dz * (e.len / 2);
      push(box, mx + e.nx * (d.eave.depth / 2 - 0.1), b.h - 0.12, mz + e.nz * (d.eave.depth / 2 - 0.1), Math.atan2(e.dz, e.dx), e.len + 0.3, 0.12, d.eave.depth, DK.eave, c, d.eave.drop);
    }
  }
  if (d.band) {
    const bd = d.band;
    const e = E.filter((q) => q.face === bd.face).sort((p, q) => q.len - p.len)[0];
    if (e) {
      const t = e.len * bd.at;
      push(box, e.ax + e.dx * t + e.nx * 0.07, bd.y0, e.az + e.dz * t + e.nz * 0.07, Math.atan2(e.dz, e.dx), bd.w, bd.y1 - bd.y0, 0.14, DK.band, hexRGB(bd.color));
    }
  }
  for (const bb of d.billboards ?? []) {
    // 대형 LED 광고판: 벽에서 0.25m 띄운 0.4m 두께 틀, 앞면이 화면
    const e = E.filter((q) => q.face === bb.face).sort((p, q) => q.len - p.len)[0];
    if (!e) continue;
    const t = e.len * bb.at;
    push(box, e.ax + e.dx * t + e.nx * 0.45, bb.y0, e.az + e.dz * t + e.nz * 0.45, Math.atan2(e.dz, e.dx), bb.w, bb.y1 - bb.y0, 0.4, DK.screen, hexRGB(bb.color ?? '#1d2430'), (bb.w * 7.3 + bb.y0) % 1);
  }
  if (d.lattice) {
    // 사선 격자 외피: 면마다 반 주기(period/2) 높이마다 면 끝에서 끝으로 가는 사선 골조 두 방향. 덤 칸에 기운 각도(라디안)를 싣고, 셰이더가 상자를 면 안에서 돌린다
    const lt = d.lattice;
    const c = hexRGB(lt.color);
    const top = b.h;
    const half = lt.period / 2;
    for (const e of E) {
      if (e.len < 2 || (lt.faces && !lt.faces.includes(e.face))) continue;
      const yaw = Math.atan2(e.dz, e.dx);
      const n = Math.ceil((top - y0) / half - 1e-6);
      for (const dir of [1, -1])
        for (let k = 0; k < n; k++) {
          // k 번째 칸: 아래 ya 에서 위 yb 까지, 방향 dir 이 바뀌며 지그재그. 지붕을 넘는 칸은 그만큼 짧게
          const ya = y0 + k * half;
          const yb = Math.min(top, ya + half);
          const f = (yb - ya) / half;
          const up = (k % 2 === 0) === (dir === 1);
          const s0 = up ? 0 : e.len, s1 = up ? e.len * f : e.len * (1 - f);
          const sm = (s0 + s1) / 2;
          const run = s1 - s0;
          const len = Math.hypot(run, yb - ya);
          const roll = Math.atan2(yb - ya, run);
          const ang = roll > Math.PI / 2 ? roll - Math.PI : roll < -Math.PI / 2 ? roll + Math.PI : roll;
          push(box, e.ax + e.dx * sm + e.nx * 0.2, (ya + yb) / 2, e.az + e.dz * sm + e.nz * 0.2, yaw, len, lt.bar, 0.3, DK.strut, c, ang);
        }
    }
  }
  if (d.opening) {
    const op = d.opening;
    const e = E.filter((q) => q.face === op.face).sort((p, q) => q.len - p.len)[0];
    if (e) {
      const t = e.len / 2;
      push(box, e.ax + e.dx * t + e.nx * 0.03, y0, e.az + e.dz * t + e.nz * 0.03, Math.atan2(e.dz, e.dx), Math.min(op.w, e.len - 0.6), op.h, 0.06, DK.opening, [0.1, 0.1, 0.11]);
    }
  }
  if (d.stair) {
    const [x, z] = xz(d.stair.ll);
    const [g0, g1, g2] = hexRGB(d.stair.bands[1]).map((v) => Math.round(v * 255));
    // 방향 칸에 유리 색을 24비트 정수로 싣는다(원통은 돌리지 않는다)
    push(cyl, x, y0, z, g0 * 65536 + g1 * 256 + g2, d.stair.r * 2, b.h - y0 + d.stair.top, d.stair.r * 2, DK.stair, hexRGB(d.stair.bands[0]), L.fh);
  }
  return { box, cyl };
}

/** 단지 바닥 소품(나무는 나무 모형이 따로 그린다) */
export function siteOf(props: PropRec[]): number[] {
  const out: number[] = [];
  const push = (x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, kind: number, c: [number, number, number], e = 0) =>
    out.push(x, y, z, yaw, sx, sy, sz, kind, c[0], c[1], c[2], e);
  /** 방위각(도) → 판 좌표 방향과 상자 방향 */
  const dir = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    const dx = Math.sin(r), dz = -Math.cos(r);
    return { dx, dz, yaw: Math.atan2(dz, dx) };
  };
  for (const p of props) {
    if (p.kind === 'fence') {
      for (let i = 0; i + 1 < p.line.length; i++) {
        const [ax, az] = xz(p.line[i]);
        const [bx, bz] = xz(p.line[i + 1]);
        const len = Math.hypot(bx - ax, bz - az);
        const yaw = Math.atan2(bz - az, bx - ax);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        push(mx, 0, mz, yaw, len, p.baseH, 0.2, DK.wallBase, hexRGB(p.baseColor), p.base === 'brick' ? 1 : 0);
        if (p.fence === 'iron') push(mx, p.baseH, mz, yaw, len, p.fenceH, 0.04, DK.ironFence, hexRGB(p.fenceColor));
      }
    } else if (p.kind === 'gate') {
      const [x, z] = xz(p.ll);
      push(x, 0, z, 0, p.w, p.h, p.d, DK.pillar, hexRGB(p.color), p.top === 'arch' ? 1 : 0);
    } else if (p.kind === 'paving') {
      const [x, z] = xz(p.ll);
      const c: Record<typeof p.surface, [number, number, number]> = { asphalt: [0.36, 0.37, 0.38], concrete: [0.68, 0.68, 0.66], planting: [0.36, 0.42, 0.27], block: [0.66, 0.63, 0.59] };
      push(x, 0.02, z, dir(p.yaw).yaw, p.w, 0.06, p.d, DK.paving, p.color ? hexRGB(p.color) : c[p.surface], p.surface === 'planting' ? 1 : 0);
    } else if (p.kind === 'parking') {
      const [x, z] = xz(p.ll);
      const { dx, dz, yaw } = dir(p.yaw);
      // perp: 칸 너비 w 가 줄 방향, 깊이 d 가 가로. parallel: 칸 길이 w 가 줄 방향, 폭 d 가 가로. 어느 쪽이든 칸 사이 선은 줄을 가로지른다
      for (let k = 0; k <= p.n; k++) {
        const s = (k - p.n / 2) * p.w;
        push(x + dx * s, 0.085, z + dz * s, yaw, 0.12, 0.02, p.d, DK.line, [0.93, 0.93, 0.9]);
      }
    } else if (p.kind === 'pergola') {
      const [x, z] = xz(p.ll);
      const { dx, dz, yaw } = dir(p.yaw);
      const c = hexRGB(p.color);
      const nx = -dz, nz = dx;
      for (const a of [-1, 1]) for (const b of [-1, 1]) push(x + dx * a * (p.w / 2 - 0.2) + nx * b * (p.d / 2 - 0.2), 0, z + dz * a * (p.w / 2 - 0.2) + nz * b * (p.d / 2 - 0.2), yaw, 0.16, p.h, 0.16, DK.wood, c);
      for (const b of [-1, 1]) push(x + nx * b * (p.d / 2 - 0.2), p.h - 0.16, z + nz * b * (p.d / 2 - 0.2), yaw, p.w + 0.4, 0.16, 0.14, DK.wood, c);
      const slats = Math.max(3, Math.round(p.w / 0.6));
      for (let k = 0; k < slats; k++) {
        const s = (k / (slats - 1) - 0.5) * p.w;
        push(x + dx * s, p.h, z + dz * s, yaw, 0.08, 0.1, p.d + 0.5, DK.wood, c);
      }
    } else if (p.kind === 'lamp') {
      const [x, z] = xz(p.ll);
      const c: [number, number, number] = p.color ? hexRGB(p.color) : [0.36, 0.37, 0.39];
      push(x, 0, z, 0, 0.14, p.h, 0.14, DK.pole, c);
      if (p.type === 'pole') push(x + 0.55, p.h - 0.1, z, 0, 1.2, 0.14, 0.32, DK.lamp, [0.85, 0.85, 0.82]);
      else push(x, p.h, z, 0, 0.42, 0.42, 0.42, DK.lamp, [0.95, 0.95, 0.92]);
    } else if (p.kind === 'track') {
      // 옛 철길: 레일 두 줄(조각마다 하나)과 0.6m 마다 침목. 침목은 레일보다 낮다
      const g = (p.gauge ?? 1.435) / 2 + 0.035;
      for (let i = 0; i + 1 < p.line.length; i++) {
        const [ax, az] = xz(p.line[i]);
        const [bx, bz] = xz(p.line[i + 1]);
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const ux = (bx - ax) / len, uz = (bz - az) / len;
        const yaw = Math.atan2(uz, ux);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        for (const s of [-1, 1]) push(mx - uz * g * s, 0.02, mz + ux * g * s, yaw, len, 0.13, 0.07, DK.slab, [0.42, 0.4, 0.38]);
        for (let t = 0; t <= len + 1e-6; t += 0.6) push(ax + ux * t, 0.02, az + uz * t, yaw, 0.22, 0.09, 2.4, DK.wood, [0.36, 0.29, 0.23]);
      }
    } else if (p.kind === 'booth') {
      const [x, z] = xz(p.ll);
      const yaw = dir(p.yaw).yaw;
      const bh = p.base ? (p.baseH ?? 0.5) : 0;
      if (p.base) push(x, 0, z, yaw, p.w, bh, p.d, DK.slab, hexRGB(p.base));
      push(x, bh, z, yaw, p.w, p.h - bh, p.d, DK.slab, hexRGB(p.color));
    } else if (p.kind === 'steps') {
      // 단 k 는 앞에서 k·d/n 뒤부터 맨 뒤까지 덮는 상자 하나(층층이 쌓는다). 윗면이 밝은 slab 으로 디딤면과 챌면이 갈린다
      const [x, z] = xz(p.ll);
      const { dx, dz, yaw } = dir(p.yaw);
      const c = hexRGB(p.color);
      for (let k = 0; k < p.n; k++) {
        const s = (k * p.d) / p.n / 2;
        push(x + dx * s, (k * p.h) / p.n, z + dz * s, yaw, p.d * (1 - k / p.n), p.h / p.n, p.w, DK.slab, c);
      }
    }
  }
  return out;
}

const VERT = /* glsl */ `
  attribute vec4 aP; attribute vec4 aS; attribute vec4 aC;
  varying vec3 vN; varying vec3 vO; varying vec4 vS; varying vec4 vC; varying vec3 vPos; varying float vDist; varying float vYaw;
  void main() {
    vec3 o = position;
    vec3 p = o * aS.xyz;
    float k = aS.w;
    if (k > 2.5 && k < 3.5) p.y -= (0.5 - o.z) * aC.w;   // 처마: 바깥(−z)으로 갈수록 내려간다
    vec3 nn = normal;
    if (k > 17.5) {
      // 사선 골조: 가운데(aP.y)를 축으로 면 안(x·y)에서 aC.w 만큼 기울인다
      float cr = cos(aC.w), sr = sin(aC.w);
      p.y -= 0.5 * aS.y;
      p = vec3(p.x * cr - p.y * sr, p.x * sr + p.y * cr, p.z);
      nn = vec3(nn.x * cr - nn.y * sr, nn.x * sr + nn.y * cr, nn.z);
    }
    float yaw = k > 12.5 && k < 13.5 ? 0.0 : aP.w;
    float cs = cos(yaw), sn = sin(yaw);
    vec3 w = vec3(aP.x + p.x * cs - p.z * sn, aP.y + p.y, aP.z + p.x * sn + p.z * cs);
    vN = vec3(nn.x * cs - nn.z * sn, nn.y, nn.x * sn + nn.z * cs);
    vO = o; vS = aS; vC = aC; vPos = w; vYaw = aP.w;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
    if (vDist > 900.0) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform vec3 uBld;
  varying vec3 vN; varying vec3 vO; varying vec4 vS; varying vec4 vC; varying vec3 vPos; varying float vDist; varying float vYaw;
  void main() {
    float fi = focusIn(vPos.xz);
    if (fi > 0.01 && dither(gl_FragCoord.xy) < fi * 0.82) discard;
    vec3 n = normalize(vN);
    float k = vS.w;
    vec3 m = vO * vS.xyz;                       // 상자 안 자리(m)
    vec3 c = vC.rgb * uBld;
    vec3 glow = vec3(0.0);
    float side = 1.0 - step(0.5, abs(n.y));
    if (k < 0.5) {
      // 발코니 바닥: 윗면은 조금 밝게
      c *= n.y > 0.5 ? 1.05 : 0.95;
    } else if (k < 1.5) {
      // 난간: 위 손잡이와 아래 띠 사이는 세로 살(0.12m 간격)만 남긴다
      float bars = vC.w > 0.5 ? step(0.32, fract((m.x + 50.0) / 0.12)) : 0.0;
      float rail = step(0.94, vO.y) + step(vO.y, 0.07);
      if (bars > 0.5 && rail < 0.5 && side > 0.5) discard;
    } else if (k < 2.5) {
      // 실외기: 앞면 팬
      float fan = 1.0 - smoothstep(0.17, 0.21, length(vec2(m.x - 0.12, m.y - 0.29)));
      c = mix(c, vec3(0.25, 0.26, 0.28), fan * step(0.49, abs(vO.z)));
    } else if (k < 3.5) {
      // 처마: 0.3m 골
      c *= 1.0 - 0.1 * step(0.5, fract(m.x / 0.3));
    } else if (k < 4.5) {
      // 세로 띠
    } else if (k < 5.5) {
      // 담 받침: 벽돌이면 줄눈, 콘크리트면 1.8m 판 이음
      if (vC.w > 0.5) c *= 1.0 + 0.1 * max(step(0.88, fract(m.y / 0.075)), step(0.92, fract(m.x / 0.21 + 0.5 * floor(m.y / 0.075)))) - 0.04 * hash21(floor(vec2(m.x / 0.21, m.y / 0.075)));
      else c *= 1.0 - 0.08 * step(0.985, fract(m.x / 1.8)) - 0.05 * step(0.92, vO.y);
    } else if (k < 6.5) {
      // 철제 펜스: 위·아래 띠와 0.14m 세로 살, 1.8m 마다 기둥
      float post = step(0.95, fract(m.x / 1.8));
      float bars = step(0.3, fract(m.x / 0.14));
      float rail = step(0.9, vO.y) + step(vO.y, 0.08);
      if (bars > 0.5 && rail < 0.5 && post < 0.5) discard;
    } else if (k < 7.5) {
      // 정문 기둥: 벽돌 줄눈
      c *= 1.0 + 0.1 * max(step(0.88, fract(m.y / 0.075)), step(0.92, fract((m.x + m.z) / 0.21 + 0.5 * floor(m.y / 0.075))));
    } else if (k < 8.5) {
      // 포장·화단: 화단은 얼룩진 흙과 풀
      c *= 0.92 + 0.12 * hash21(floor(vPos.xz / (vC.w > 0.5 ? 0.8 : 2.0)));
    } else if (k < 9.5) {
      // 주차 칸 선
    } else if (k < 10.5) {
      // 퍼걸러 나무
      c *= 0.9 + 0.1 * step(0.5, fract(m.y * 20.0 + m.x * 3.0));
    } else if (k < 11.5) {
      // 가로등 기둥
    } else if (k < 12.5) {
      // 가로등 머리: 밤에 켜진다
      glow = vec3(1.0, 0.86, 0.62) * (0.6 + 0.6 * step(n.y, -0.5));
    } else if (k < 13.5) {
      // 원통 계단실: 층마다 아래 남색 띠(1.1m)와 위 유리 띠, 밤에는 계단 불빛
      float fh = max(2.4, vC.w);
      float fy = fract(m.y / fh);
      vec3 glass = vec3(floor(vYaw / 65536.0), mod(floor(vYaw / 256.0), 256.0), mod(vYaw, 256.0)) / 255.0;
      float g = step(1.1 / fh, fy) * step(fy, 0.92) * side * step(m.y, vS.y - 0.6);
      vec3 view = normalize(vPos - cameraPosition);
      float fres = 0.35 + 0.65 * pow(1.0 - abs(dot(view, n)), 3.0);
      c = mix(c, glass * uBld * 0.75 + mix(uFogCol, uSkyCol, 0.5) * fres * 0.25, g);
      if (n.y > 0.5) c = vec3(0.86, 0.86, 0.84) * uBld;
      glow = vec3(0.95, 0.9, 0.78) * g * 0.3;
    } else if (k < 14.5) {
      // 주차장 입구: 어둡게
      c = vec3(0.08, 0.08, 0.09);
    } else if (k < 15.5) {
      // 유리 발코니 칸: 아래 0.45m 남색 띠(바닥 끝), 위는 푸른 유리와 흰 창살(1m), 밤에는 세대마다 불
      float band = step(m.y, 0.45);
      float mull = step(0.94, fract(m.x / 1.0 + 0.5)) * side;
      vec3 view = normalize(vPos - cameraPosition);
      float fres = 0.35 + 0.65 * pow(1.0 - abs(dot(view, n)), 3.0);
      vec3 gl = vC.rgb * uBld * 0.72 + mix(uFogCol, uSkyCol, 0.5) * fres * 0.3 * (1.0 - 0.6 * uNight);
      c = mix(gl, vec3(0.9, 0.92, 0.92) * uBld, mull);
      c = mix(c, vec3(0.17, 0.27, 0.39) * uBld, band);
      if (n.y > 0.5) c = vec3(0.17, 0.27, 0.39) * uBld;
      float on = step(vC.w, clamp(uLit * 1.2 + 0.045 * uNight, 0.0, 1.0));
      glow = mix(vec3(1.0, 0.8, 0.52), vec3(0.86, 0.9, 1.0), step(0.7, fract(vC.w * 13.0))) * on * (1.0 - band) * (1.0 - mull) * side * 0.8;
    } else if (k < 16.5) {
      // 유리 난간: 흰 손잡이와 1.5m 마다 기둥, 그 사이 옅은 푸른 유리
      float post = step(0.96, fract(m.x / 1.5));
      c = mix(c * uBld, vec3(0.94) * uBld, max(step(0.9, vO.y), post));
    } else if (k > 17.5) {
      // 사선 골조: 칠한 색 그대로
    } else {
      // LED 광고판: 검은 틀(0.3m) 안 앞면이 화면. 낮에도 빛나고 밤에 더 밝다. 몇 초마다 다른 장면(색 덩어리)으로 바뀐다
      float front = step(vO.z, -0.49) * side;   // 바깥(벽 반대쪽)이 상자의 -z 면
      float inner = step(0.3, m.x + vS.x * 0.5) * step(m.x + vS.x * 0.5, vS.x - 0.3) * step(0.3, m.y) * step(m.y, vS.y - 0.3);
      float scene = floor(uTime / 7.0 + vC.w * 13.0);
      vec2 uv = vec2((m.x + vS.x * 0.5) / vS.x, m.y / vS.y);
      vec3 a = 0.5 + 0.5 * cos(6.2832 * (hash21(vec2(scene, 1.0) + vC.w) + vec3(0.0, 0.33, 0.67)));
      vec3 b2 = 0.5 + 0.5 * cos(6.2832 * (hash21(vec2(scene, 2.0) + vC.w) + vec3(0.0, 0.33, 0.67)));
      vec3 img = mix(a, b2, smoothstep(0.3, 0.7, uv.x + 0.3 * sin(uv.y * 3.0 + scene)));
      img = mix(vec3(dot(img, vec3(0.33))), img, 0.55);   // 광고 화면은 밝지만 원색 덩어리는 아니다
      img = mix(vC.rgb, img, 0.8);
      c = mix(vec3(0.06, 0.06, 0.07), img * 0.55, front * inner);
      glow = img * front * inner * 0.9;
      vec3 col0 = lit(c, n) + glow * (0.35 + 0.65 * uNight) * (1.0 - fi);
      gl_FragColor = vec4(fogged(col0, vDist), 1.0);
      return;
    }
    vec3 col = lit(c, n) + glow * uNight * (1.0 - fi);
    gl_FragColor = vec4(fogged(col, vDist), 1.0);
  }`;

function instancedMesh(base: THREE.BufferGeometry, data: number[], center: THREE.Vector3, radius: number): THREE.Mesh | null {
  const count = data.length / 12;
  if (!count) return null;
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('normal', base.attributes.normal);
  const P = new Float32Array(count * 4), S = new Float32Array(count * 4), C = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    P.set(data.slice(i * 12, i * 12 + 4), i * 4);
    S.set(data.slice(i * 12 + 4, i * 12 + 8), i * 4);
    C.set(data.slice(i * 12 + 8, i * 12 + 12), i * 4);
  }
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
  geo.setAttribute('aS', new THREE.InstancedBufferAttribute(S, 4));
  geo.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
  geo.instanceCount = count;
  // 기록 구역만 감싸는 공으로 화면 밖이면 그리지 않는다
  geo.boundingSphere = new THREE.Sphere(center, radius);
  return new THREE.Mesh(geo, material({ vertex: VERT, fragment: FRAG, uniforms: { uBld: { value: pal.bld } } }));
}

/** 기록한 건물들의 세부와 기록 구역 바닥 소품을 그린다. idx: 세부를 그릴 건물 번호 */
export function makeDetail(list: Building[], lk: Look[], idx: number[], props: PropRec[]): { group: THREE.Group; boxes: number; cylinders: number } {
  const box: number[] = [];
  const cyl: number[] = [];
  for (const i of idx) {
    const d = detailOf(list[i], lk[i]);
    box.push(...d.box);
    cyl.push(...d.cyl);
  }
  box.push(...siteOf(props));
  const group = new THREE.Group();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const a of [box, cyl]) for (let i = 0; i < a.length; i += 12) (minX = Math.min(minX, a[i])), (maxX = Math.max(maxX, a[i])), (minZ = Math.min(minZ, a[i + 2])), (maxZ = Math.max(maxZ, a[i + 2]));
  const center = new THREE.Vector3((minX + maxX) / 2, 15, (minZ + maxZ) / 2);
  const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 40;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const cylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1).translate(0, 0.5, 0);
  for (const m of [instancedMesh(boxGeo, box, center, radius), instancedMesh(cylGeo, cyl, center, radius)]) if (m) group.add(m);
  return { group, boxes: box.length / 12, cylinders: cyl.length / 12 };
}

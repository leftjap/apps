// 차로 띠 바닥(재작업 W44, 설계 문서 58절). 찻길 면(surface.json·surface-polys.json)은 OSM 가운데선과 연석선으로 굽고 차로(road.json)는
// 서울시 차선으로 굽어, 차로가 지나는 자리의 2.6% 가 보도색으로 칠해졌다(이음매·교차로 앞뒤·중앙버스차로). 차가 달리는 자리를 찻길로 칠하기 위해
// 길 정본 차로에서 띠를 만든다: 차 그래프 구간마다 맨 왼쪽(중앙버스차로가 있으면 그 차로) 가장자리부터 맨 오른쪽 차로 가장자리까지 + 여유.
// 렌더러는 이 띠를 찻길 면과 같은 칠로 그리고 그 안의 연석을 지우며, 시험(tools/measure-junction.ts offRoad)은 이 띠를 '그린 찻길 면'에 넣는다.
// 땅 위 구간(높이 0.3m 안)만 만든다(다리·터널은 따로 그린다).
import { pointAt } from '../poly.ts';
import { headingNear, laneOff, laneWidth, leftEdge, MED, rightEdge, type Edge } from '../sim/graph.ts';

/** 차로 띠 바깥 여유(m) */
export const BAND_MARGIN = 0.3;
/** 단면 간격(m) */
const STEP = 3;

/** 구간마다 차로 띠(단면은 진행 방향 순서). 땅 위가 아닌 구간은 빼고. margin: 차로 가장자리 바깥 여유(음수면 안쪽) */
export interface Band {
  /** 도로 등급(칠 색) */
  cls: number;
  /** 단면 [왼쪽 x, z, 오른쪽 x, z, ...] */
  sec: Float32Array;
}

export function laneBands(edges: Edge[], margin = BAND_MARGIN): Band[] {
  const out: Band[] = [];
  const P = [0, 0, 0];
  for (const e of edges) {
    if (e.len < 0.5) continue;
    const ss = new Set<number>([0, e.len]);
    for (let k = 1; k + 1 < e.cum.length; k++) ss.add(e.cum[k]);
    for (const v of e.st) if (v > 0 && v < e.len) ss.add(v);
    for (let s = STEP; s < e.len; s += STEP) ss.add(s);
    const list = [...ss].sort((a, b) => a - b);
    // 땅 위 단면이 이어지는 토막마다 띠 하나. 토막 앞뒤의 땅 위가 아닌 단면 하나씩까지 넣어(그 단면도 땅 높이로 그린다, 경사로 밑에 가려진다) 이음 자리에 틈이 없게 한다
    const ground = list.map((s) => (pointAt(e.p, e.cum, s, P), Math.abs(P[1]) <= 0.3));
    let sec: number[] = [];
    const flush = () => {
      if (sec.length >= 8) out.push({ cls: e.cls, sec: Float32Array.from(sec) });
      sec = [];
    };
    list.forEach((s, i) => {
      if (!ground[i] && !ground[i - 1] && !ground[i + 1]) return flush();
      pointAt(e.p, e.cum, s, P);
      let l = leftEdge(e, s);
      if (e.mo.length || e.med) l = Math.min(l, laneOff(e, MED, s) - laneWidth(e, 0, s) / 2);
      const r = rightEdge(e, s);
      // 양쪽 가장자리마다 그 옆 거리의 진행 방향으로 옮긴다(차 자리와 같은 방향: 가운데선에서 멀수록 꺾인 곳에서 방향을 넓게 잰다)
      const yl = headingNear(e, s, l), yr = headingNear(e, s, r);
      sec.push(P[0] - Math.sin(yl) * (l - margin), P[2] + Math.cos(yl) * (l - margin), P[0] - Math.sin(yr) * (r + margin), P[2] + Math.cos(yr) * (r + margin));
      if (!ground[i] && ground[i - 1] && !ground[i + 1]) flush();
    });
    flush();
  }
  return out;
}

/** 띠 단면 k 와 k+1 사이 사각형 고리 [x, z × 4] */
export function bandQuad(b: Float32Array, k: number): Float32Array {
  const o = k * 4;
  return Float32Array.of(b[o], b[o + 1], b[o + 4], b[o + 5], b[o + 6], b[o + 7], b[o + 2], b[o + 3]);
}

/** 점이 띠 안인가(8m 칸으로 사각형을 찾는다) */
export function bandTest(bands: Band[]): (x: number, z: number) => boolean {
  const C = 8;
  const grid = new Map<number, Float32Array[]>();
  const key = (i: number, j: number) => (i + 1000) * 2000 + (j + 1000);
  for (const { sec } of bands)
    for (let k = 0; k + 1 < sec.length / 4; k++) {
      const q = bandQuad(sec, k);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let m = 0; m < 8; m += 2) (x0 = Math.min(x0, q[m])), (x1 = Math.max(x1, q[m])), (z0 = Math.min(z0, q[m + 1])), (z1 = Math.max(z1, q[m + 1]));
      for (let i = Math.floor(x0 / C); i <= Math.floor(x1 / C); i++) for (let j = Math.floor(z0 / C); j <= Math.floor(z1 / C); j++) (grid.get(key(i, j)) ?? grid.set(key(i, j), []).get(key(i, j))!).push(q);
    }
  return (x, z) => {
    for (const q of grid.get(key(Math.floor(x / C), Math.floor(z / C))) ?? []) {
      let c = false;
      for (let a = 0, j = 6; a < 8; j = a, a += 2) if (q[a + 1] > z !== q[j + 1] > z && x < q[a] + ((z - q[a + 1]) / (q[j + 1] - q[a + 1])) * (q[j] - q[a])) c = !c;
      if (c) return true;
    }
    return false;
  };
}

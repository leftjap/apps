// 끝점이 맞닿는 선로 조각들을 한 줄로 잇는다. 갈라지거나 떨어진 조각이 있으면 가장 긴 줄을 돌려준다.
type Pt = number[];
interface Way {
  id: number;
  pts: Pt[];
}

const key = (p: Pt) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
const length = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

export function stitch(ways: Way[]): Pt[] {
  const left = new Set(ways);
  let best: Pt[] = [];
  let bestLen = -1;
  while (left.size) {
    const first = left.values().next().value as Way;
    left.delete(first);
    let chain = first.pts.slice();
    let grew = true;
    while (grew) {
      grew = false;
      for (const w of left) {
        const a = key(w.pts[0]);
        const b = key(w.pts[w.pts.length - 1]);
        const head = key(chain[0]);
        const tail = key(chain[chain.length - 1]);
        if (a === tail) chain = chain.concat(w.pts.slice(1));
        else if (b === tail) chain = chain.concat(w.pts.slice(0, -1).reverse());
        else if (b === head) chain = w.pts.slice(0, -1).concat(chain);
        else if (a === head) chain = w.pts.slice(1).reverse().concat(chain);
        else continue;
        left.delete(w);
        grew = true;
        break;
      }
    }
    const len = length(chain);
    if (len > bestLen) {
      bestLen = len;
      best = chain;
    }
  }
  return best;
}

// ───────────────────────── 노선 높이 ─────────────────────────
// 높이는 OSM 태그로 정한다: 터널(tunnel, layer<0, location=underground)은 땅 밑, 다리(bridge)는 띄우고, 태그 없는 구간은 땅높이다.
// 터널 조각에 닿은 꼭짓점은 터널 입구 깊이(PORTAL_Y)보다 깊게 두므로, 화면은 터널 시작점에 입구를 내고 그 앞 지상 구간만 터파기로 판다.
// 찻길과 엇갈리는 곳은 굽기가 lo(그 위로)·hi(그 아래로) 조건으로 넘긴다.
// 판은 평평한데 실제 땅은 한강 둔치에서 합정 쪽으로 올라가므로, 당산철교 북단처럼 다리와 터널 입구 사이가 짧은 곳은
// 실제 노선(3.5%)보다 가파른 경사(GRADE)로 잇는다.

type Tags = Record<string, string>;
/** 터널 입구 깊이(m): 입구 높이 6.2m 와 지붕 두께. 터널 조각의 꼭짓점은 이보다 깊다 */
export const PORTAL_Y = -6.5;
export const TUNNEL_Y = -14;
export const BRIDGE_Y = 12;
/** 이웃한 꼭짓점 사이 경사 한계 */
export const GRADE = 0.06;
/** 앞뒤 이 거리(m) 안 목표 높이를 평균해 구간 사이를 고르게 잇는다 */
const WINDOW = 90;

/** −1 터널, 1 다리, 0 지상 */
export function railKind(t: Tags): -1 | 0 | 1 {
  if ((t.tunnel && t.tunnel !== 'no') || Number(t.layer) < 0 || t.location === 'underground') return -1;
  if (t.bridge && t.bridge !== 'no') return 1;
  return 0;
}

/**
 * 꼭짓점 높이. s 는 꼭짓점의 노선 거리, kind 는 꼭짓점 i 와 i+1 사이 조각의 종류(railKind),
 * lo·hi 는 꼭짓점마다 높이 아래·위 한계(없으면 ∓Infinity). 조건을 함께 지킬 수 없으면 오류를 낸다.
 */
export function railProfile(s: ArrayLike<number>, kind: ArrayLike<number>, lo: number[], hi: number[]): number[] {
  const n = s.length;
  const up = hi.slice();
  for (let i = 0; i + 1 < n; i++) if (kind[i] === -1) (up[i] = Math.min(up[i], PORTAL_Y)), (up[i + 1] = Math.min(up[i + 1], PORTAL_Y));
  const want = (k: number) => (k === -1 ? TUNNEL_Y : k === 1 ? BRIDGE_Y : 0);
  const target = Array.from({ length: n }, (_, i) => (want(kind[Math.max(0, i - 1)]) + want(kind[Math.min(n - 2, i)])) / 2);
  // 경사 한계로 넓힌 아래·위 한계
  const L = new Array<number>(n).fill(-Infinity);
  const U = new Array<number>(n).fill(Infinity);
  for (let i = 0; i < n; i++) {
    if (lo[i] > -Infinity) for (let j = 0; j < n; j++) L[j] = Math.max(L[j], lo[i] - GRADE * Math.abs(s[j] - s[i]));
    if (up[i] < Infinity) for (let j = 0; j < n; j++) U[j] = Math.min(U[j], up[i] + GRADE * Math.abs(s[j] - s[i]));
  }
  for (let j = 0; j < n; j++) if (L[j] > U[j] + 1e-6) throw new Error(`철도 높이 조건이 맞지 않습니다: 노선 거리 ${s[j].toFixed(0)}m 에서 아래 한계 ${L[j].toFixed(1)}m > 위 한계 ${U[j].toFixed(1)}m`);
  const y = Array.from({ length: n }, (_, i) => {
    let sum = 0;
    let c = 0;
    for (let j = i; j >= 0 && s[i] - s[j] <= WINDOW; j--) (sum += target[j]), c++;
    for (let j = i + 1; j < n && s[j] - s[i] <= WINDOW; j++) (sum += target[j]), c++;
    return Math.min(U[i], Math.max(L[i], sum / c));
  });
  // 경사 한계: 앞으로 한 번, 뒤로 한 번(L·U 가 같은 경사 한계 안이라 한계를 벗어나지 않는다)
  const lim = (i: number, j: number) => {
    const g = GRADE * Math.abs(s[i] - s[j]);
    y[i] = Math.min(y[j] + g, Math.max(y[j] - g, y[i]));
  };
  for (let i = 1; i < n; i++) lim(i, i - 1);
  for (let i = n - 2; i >= 0; i--) lim(i, i + 1);
  return y;
}

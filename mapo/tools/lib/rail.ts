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

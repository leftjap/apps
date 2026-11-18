/** 씨앗으로 정해지는 난수(0~1). 같은 씨앗이면 같은 순서가 나온다. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 정수 하나로 정해지는 0~1 값 */
export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 정수 셋을 섞은 32비트 값(W46: 사람·문·차 열쇠로 정하는 난수) */
export function mix3(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0x7f4a7c15, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) ^ Math.imul(c ^ 0x165667b1, 0x297a2d39);
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 가중치 배열에서 하나를 고른다 */
export function pick(weights: ArrayLike<number>, r: number): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let x = r * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

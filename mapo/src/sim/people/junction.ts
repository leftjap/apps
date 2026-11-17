// 갈래 영역 입장 게이트(재작업 W31 S4, 설계 mapo-w31-people-design.md 4절 S4 행, W36).
// 짧은 선이 뭉친 갈래 길(굽기 tools/lib/walkwidth.ts 의 갈래 영역, walk.json j)을 노드마다 갈아타며 지나면 맞흐름이 영역 한가운데에서 만나
// 앞으로 갈 걸음이 없는 교착이 생겼다(어울마당로 Y 갈림에 막힌 사람의 23%). 차가 교차로에서 하는 것(W25: 게이트에서만 들어가기·나갈 자리 먼저 확인)을 사람에게 둔다.
//  - 영역에 들어가기 전에 나갈 선을 고르고, 영역 안 인원이 정원 아래이고 나갈 선 첫머리 오른쪽(우측통행) 자리가 비었을 때만 들어간다. 아니면 영역 앞에서 선다.
//  - 영역 안에서는 노드를 거치지 않고 나갈 선 위 자리로 곧장, 앞으로만(목표에서 멀어지는 걸음 없이) 걷는다.
// 이 파일은 영역 자료와 게이트 규칙을 맡고, 걸음은 사람 모듈(index.ts)이 한다.

/** 한 사람 몫 넓이(m²): 정원 = 넓이 / PER_HEAD (굽기와 같은 값) */
export const PER_HEAD = 1.2;
/** 정원 하한: 노드가 모두 걷는 면 밖(칠한 작은 길 위)이라 넓이가 0 인 영역도 막힌 곳이 아니다(S2 기록) */
export const MIN_CAP = 6;
/** 나갈 선 첫머리 자리: 나갈 선을 따라 이만큼(m, 선이 짧으면 끝) */
export const EXIT_S = 1.2;
/** 영역 앞 이 거리(m)에서 게이트를 본다(들어가거나 선다). 나갈 자리(EXIT_S 둘레 몸 하나)보다 멀어야 기다리는 사람이 맞은편 사람의 나갈 자리를 막지 않는다 */
export const ENTER_D = 3;

export interface Junctions {
  /** 노드 → 영역 번호(−1 없음) */
  of: Int32Array;
  /** 영역마다 정원 */
  cap: Int32Array;
  /** 영역마다 나가는 방향 있는 선(시작 노드가 영역 안, 끝 노드가 밖) */
  exits: number[][];
  /** 영역마다 안쪽 방향 있는 선(두 끝 모두 영역 안) */
  inner: number[][];
  /** 방향 있는 선마다 1 이면 막힌 나갈 선: 그 선 끝에서 영역을 거치지 않고는 영역 노드에서 LOOP_R 넘게 멀어질 수 없다(영역에 붙은 작은 고리·같은 두 노드를 잇는 겹선·막다른 길).
   *  이런 선으로 나가면 곧 같은 영역으로 되들어와 2m 안을 몇 초마다 돌았다 */
  loop: Uint8Array;
  /** 영역마다 지금 안에 있는 사람 수(단계마다 다시 센다) */
  inside: Int32Array;
}

/** 막힌 나갈 선을 가리는 거리(m) */
export const LOOP_R = 12;

/** walk.json j([노드 수, 넓이 m², 첫 노드, 차이 …] 되풀이)를 풀어 그물(방향 있는 선 hes, 노드마다 나가는 선 out, 노드 자리 nx)에 붙인다 */
export function makeJunctions(j: number[] | undefined, hes: { a: number; b: number }[], out: number[][], nx: ArrayLike<number>): Junctions {
  const of = new Int32Array(out.length).fill(-1);
  const caps: number[] = [];
  for (let k = 0; j && k < j.length; k += 2 + j[k]) {
    const r = caps.length;
    let n = 0;
    for (let q = 0; q < j[k]; q++) {
      n += j[k + 2 + q];
      if (n < of.length) of[n] = r;
    }
    caps.push(Math.max(MIN_CAP, Math.floor(j[k + 1] / PER_HEAD)));
  }
  const R = caps.length;
  const exits: number[][] = Array.from({ length: R }, () => []);
  const inner: number[][] = Array.from({ length: R }, () => []);
  for (let a = 0; a < out.length; a++) {
    const r = of[a];
    if (r < 0) continue;
    for (const k of out[a]) (of[hes[k].b] === r ? inner : exits)[r].push(k);
  }
  // 막힌 나갈 선: 선 끝에서 영역 노드를 밟지 않고 넓이 우선으로 60노드까지 펼쳐 나갈 노드에서 LOOP_R 넘게 먼 노드가 없으면
  const loop = new Uint8Array(hes.length);
  const seen = new Set<number>();
  for (let r = 0; r < R; r++)
    for (const k of exits[r]) {
      const a = hes[k].a;
      seen.clear();
      const q = [hes[k].b];
      seen.add(q[0]);
      let far = false;
      for (let qi = 0; qi < q.length && q.length < 60 && !far; qi++) {
        const n = q[qi];
        if (Math.hypot(nx[n * 2] - nx[a * 2], nx[n * 2 + 1] - nx[a * 2 + 1]) > LOOP_R) far = true;
        for (const k2 of out[n]) {
          const b = hes[k2].b;
          if (of[b] === r || seen.has(b)) continue;
          seen.add(b);
          q.push(b);
        }
      }
      if (!far) loop[k] = 1;
    }
  return { of, cap: Int32Array.from(caps), exits, inner, loop, inside: new Int32Array(R) };
}

/** 게이트: 영역 r 에 나갈 선 k 로 지나가려고 들어가도 되는가. 0 이면 들어간다, 아니면 막힌 까닭(1 정원, 3 나갈 자리에 사람).
 *  (W36: 같은 선으로 나갈 사람이 안에 '나갈 옆자리 × 줄 칸'만큼 있으면 막던 조건은 홍대 토21 에서 게이트 앞 정체의 1/3 을 만들어 뺐다)
 *  free(u) 는 나갈 선 첫머리 옆자리 u(오른쪽 +, m)가 비었는가, lanes 는 그 선 오른쪽에 설 수 있는 옆자리 목록 */
export function gateOpen(J: Junctions, r: number, lanes: number[], free: (u: number) => boolean): number {
  if (J.inside[r] >= J.cap[r]) return 1;
  for (const u of lanes) if (free(u)) return 0;
  return 3;
}

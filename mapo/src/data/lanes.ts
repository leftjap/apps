// 차로 가운데선 자료(public/data/lanes.json, tools/lanes.ts 가 서울시 차선으로 굽는다. tools/lib/carlanes.ts)
// 도로 조각마다 [진행 방향, 반대 방향] 차로. 방향 s 는 그 방향으로 간 거리이고, 옆 거리는 그 방향 가운데선에서 오른쪽으로 잰다.

export interface LanesJson {
  v: 1;
  /** 도로 조각마다 0(자료 없음) 또는 [진행 방향, 반대 방향], 방향마다 0 또는 encodeDir 꼴 */
  r: (0 | (0 | number[])[])[];
}

/** 차로 수가 같은 구간: 방향 s 의 s0~s1, 단면 자리 st 마다 차로 가운데 옆 거리 off[k × n + l](l = 0 이 왼쪽), 중앙버스차로 가운데 med[k](없으면 빈 배열) */
export interface Run {
  s0: number;
  s1: number;
  n: number;
  st: number[];
  off: number[];
  med: number[];
}

export interface DirLanes {
  /** 차로 선을 처음·마지막으로 읽은 자리(방향 s): 교차로를 빠져나와 차로가 시작하는 자리와 교차로 앞에서 차로가 끝나는 자리 */
  a: number;
  b: number;
  runs: Run[];
}

/** 도로 조각마다 [진행 방향, 반대 방향] 차로(없으면 null) */
export type RoadLanes = ([DirLanes | null, DirLanes | null] | null)[];

export function decodeDir(a: ArrayLike<number>): DirLanes {
  let k = 0;
  const d: DirLanes = { a: a[k++] / 10, b: a[k++] / 10, runs: [] };
  for (let r = a[k++]; r > 0; r--) {
    const run: Run = { s0: a[k++] / 10, s1: a[k++] / 10, n: a[k++], st: [], off: [], med: [] };
    const m = a[k++];
    const hasMed = a[k++] === 1;
    for (let i = 0; i < m; i++) {
      run.st.push(a[k++] / 10);
      for (let l = 0; l < run.n; l++) run.off.push(a[k++] / 100);
      if (hasMed) run.med.push(a[k++] / 100);
    }
    d.runs.push(run);
  }
  return d;
}

export function decodeLanes(j: LanesJson): RoadLanes {
  return j.r.map((r) => (r ? [r[0] ? decodeDir(r[0]) : null, r[1] ? decodeDir(r[1]) : null] : null));
}

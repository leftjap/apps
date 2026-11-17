// 길 정본(public/data/road.json, tools/road.ts 가 굽는다. 설계 문서 51절). 차·사람·그리기·신호는 길 모양을 이 파일에서만 읽는다.
// 지금 든 것: 차로(lanes). 찻길·보도 면, 횡단보도 양끝, 걷는 그물은 아직 따로 있다(51절 남은 것). 도로 조각마다 [진행 방향, 반대 방향] 차로. 방향 s 는 그 방향으로 간 거리이고, 옆 거리는 그 방향 가운데선에서 오른쪽으로 잰다.

export interface RoadJson {
  v: 1;
  /** 도로 조각마다 0(차가 다니지 않음) 또는 [진행 방향, 반대 방향], 방향마다 0 또는 encodeDir 꼴 */
  lanes: (0 | (0 | number[])[])[];
}

/** 차로 수가 같은 구간(차 그래프의 구간 하나): 방향 s 의 s0~s1, 단면 자리 st(방향 s)마다 차로 가운데 옆 거리 off[k × n + l](l = 0 이 왼쪽),
 *  중앙버스차로 가운데 옆 거리 med[k](중앙버스차로가 없으면 빈 배열) */
export interface Run {
  s0: number;
  s1: number;
  n: number;
  st: number[];
  off: number[];
  med: number[];
  /** 정본: 중앙버스차로가 일반 차로 왼쪽 가장자리에서 떨어진 거리(차 그래프 구간의 med, 0 = 중앙버스차로 없음). 읽기에는 없다 */
  medv?: number;
  /** 정본: 차로 폭 대푯값(차 그래프 구간의 lw, 길이·폭 어림에만 쓴다). 읽기에는 없다 */
  lwv?: number;
}

export interface DirLanes {
  /** 차로 선을 처음·마지막으로 읽은 자리(방향 s): 교차로를 빠져나와 차로가 시작하는 자리와 교차로 앞에서 차로가 끝나는 자리. 모르면 −1 */
  a: number;
  b: number;
  runs: Run[];
  /** 서울시 선으로 읽었거나 이웃에서 이어받은 차로인가(아니면 찻길 폭을 고르게 나눈 자리) */
  read?: boolean;
}

/** 도로 조각마다 [진행 방향, 반대 방향] 차로(없으면 null) */
export type RoadLanes = ([DirLanes | null, DirLanes | null] | null)[];

/** 굽기가 정한 최종 차로(정본). 실행 중에는 고치지 않고 그대로 쓴다 */
export interface CanonLanes {
  canon: true;
  dirs: RoadLanes;
}

export const isCanon = (l: unknown): l is CanonLanes => !!l && (l as CanonLanes).canon === true;

/** 한 방향 차로를 파일 꼴로: [읽음 1·0, a, b, 구간 수, (s0, s1, n, 단면 수, 중앙버스차로 표 1·0, medv, lwv, (st, off×n, med?)...)...](m).
 *  차 그래프가 실행 중에 정하던 때와 같은 수가 되게 옆 거리(32비트 실수)는 유효 숫자 9자리, 단면 자리는 12자리, 나머지는 그대로 적는다 */
export function encodeDir(d: DirLanes): number[] {
  const f9 = (v: number) => Number(v.toPrecision(9));
  const f12 = (v: number) => Number(v.toPrecision(12));
  const out = [d.read === false ? 0 : 1, d.a, d.b, d.runs.length];
  for (const r of d.runs) {
    out.push(r.s0, r.s1, r.n, r.st.length, r.med.length ? 1 : 0, r.medv ?? 0, r.lwv ?? 0);
    r.st.forEach((s, i) => {
      out.push(f12(s));
      for (let l = 0; l < r.n; l++) out.push(f9(r.off[i * r.n + l]));
      if (r.med.length) out.push(f9(r.med[i]));
    });
  }
  return out;
}

export function decodeDir(a: ArrayLike<number>): DirLanes {
  let k = 0;
  const d: DirLanes = { read: a[k++] === 1, a: a[k++], b: a[k++], runs: [] };
  for (let r = a[k++]; r > 0; r--) {
    const run: Run = { s0: a[k++], s1: a[k++], n: a[k++], st: [], off: [], med: [] };
    const m = a[k++];
    const hasMed = a[k++] === 1;
    run.medv = a[k++];
    run.lwv = a[k++];
    for (let i = 0; i < m; i++) {
      run.st.push(a[k++]);
      for (let l = 0; l < run.n; l++) run.off.push(a[k++]);
      if (hasMed) run.med.push(a[k++]);
    }
    d.runs.push(run);
  }
  return d;
}

export function encodeLanes(c: CanonLanes): RoadJson['lanes'] {
  return c.dirs.map((r) => (r && (r[0] || r[1]) ? r.map((d) => (d ? encodeDir(d) : 0)) : 0));
}

export function decodeLanes(j: RoadJson['lanes']): CanonLanes {
  return { canon: true, dirs: j.map((r) => (r ? [r[0] ? decodeDir(r[0]) : null, r[1] ? decodeDir(r[1]) : null] : null)) };
}

import { beforeAll, describe, expect, it } from 'vitest';
import { runW31, type W31Res } from './w31-run.ts';

// 재작업 W31 한 차림 측정(w31-run.ts)의 판정. W41: 씨앗을 여섯으로 늘려 차림마다 시험 파일 하나(w31-people·w31-people2~5)가 부른다(파일마다 다른 일꾼에서 돈다.
// 차림 셋을 한 파일에 두었더니 CI 에서 그 파일 하나가 25분 걸렸다).
// ── 한 차림 측정 ──
// 한 판 값은 씨앗마다 ±30% 흔들려(W33: 같은 변형 안에서 맴돌기 131~254) 작은 고침도 어느 씨앗에서든 상한을 넘긴다. 0 규칙은 판마다 보고,
// 맴돌기·10초 흐름·20초 정체는 차림마다 씨앗 평균으로 본다(W34 씨앗 셋 11·12·13).
// W41: 씨앗 여섯(11~16). 씨앗 셋 평균의 맴돌기 표준오차가 9~16(차림 안 씨앗 표준편차 15.9~28 / √3)이라, 공유 난수 차례가 바뀌는 작은 고침만으로 차림 하나가
// 상한을 넘나들었다(W41 중간 판: 걷고싶은거리 씨앗 셋 171.3 → 188.0, 맴돈 사람은 거의 모두 목적지 없이 돌아다니는 사람, 같은 판 씨앗 여섯 평균 175.0).
// 상한은 그대로 두고 씨앗 여섯 평균과 견준다. HEAD 36a8f2d8 은 씨앗 여섯 평균으로 걷고싶은거리 맴돌기 172.0(상한 171.5)·연트럴파크 되돌아감 4.83(상한 4)을 넘지 못한다
const SEEDS = [11, 12, 13, 14, 15, 16];
// [이름, 요일, 시, 보는 곳 x, z]
const SETUPS: [string, number, number, number, number][] = [
  ['홍대 토 21시', 6, 21, 330, -300],
  ['홍대 화 15시', 2, 15, 330, -300],
  ['클럽거리 토 21시', 6, 21, 290, 40],
  ['걷고싶은거리 토 21시', 6, 21, 330, -350],
  ['연트럴파크 토 21시', 6, 21, 380, -1110],
];
const casesOf = (names: string[]) => SETUPS.filter((s) => names.includes(s[0])).flatMap(([name, dow, hour, fx, fz]) => SEEDS.map((seed) => [name, seed, dow, hour, fx, fz] as [string, number, number, number, number, number]));
const runs = new Map<string, W31Res>();
const res = (name: string, seed: number) => {
  const [, dow, hour, fx, fz] = SETUPS.find((s) => s[0] === name)!;
  const key = `${name}/${seed}`;
  return runs.get(key) ?? runs.set(key, runW31(seed, dow, hour, fx, fz)).get(key)!;
};
// 차림마다 씨앗 11·12·13 평균의 상한·하한 [맴돌기 3,000명당, 10초 3m 흐름, 20초 정체]. 고칠 때마다 측정값으로 좁히기만 한다.
// 값 = HEAD 10b21892 평균(2026-11-18 01:16) ± 세 씨앗 평균의 표준오차(차림 안 씨앗 사이 표준편차를 다섯 차림으로 모아 √3 으로 나눔:
// 맴돌기 10.5, 흐름 0.67%p, 정체 0.47%p). 평균과 똑같은 상한은 사람 코드와 관계없는 차 고침(W32)만으로도 깨졌다(홍대 토21 흐름 75.80 → 75.66%).
// 목표(설계 2-4절 6번): 맴돌기 15 아래, 10초 흐름 70% 이상(S4·S5 75%), 20초 정체 2% 아래
// W38: 흐름·정체는 갈래 영역 게이트 앞에서 차례를 기다리는 사람을 신호 대기처럼 '서 있는 사람'으로 빼고 잰다(w31-run.ts walking). HEAD 10b21892 에는 게이트가 없어 아래 값은 그대로다.
// 게이트 대기는 순환 대기(Y 갈림 교착)를 끊는 짧은 차례 기다림이라, 걷는 사람으로 세면 교착을 그대로 둔 HEAD 보다 흐름이 낮게 나왔다
const SE: [number, number, number] = [10.5, 0.0067, 0.0047];
const AVG: Record<string, [number, number, number]> = Object.fromEntries(
  (
    [
      // HEAD 10b21892 평균: 맴돌기, 10초 흐름, 20초 정체
      ['홍대 토 21시', 165.7, 0.7567, 0.1076],
      ['홍대 화 15시', 163.6, 0.7653, 0.101],
      ['클럽거리 토 21시', 176.7, 0.7783, 0.0868],
      ['걷고싶은거리 토 21시', 161.0, 0.7723, 0.0922],
      ['연트럴파크 토 21시', 147.3, 0.8033, 0.081],
    ] as [string, number, number, number][]
  ).map(([k, p, f, s]) => [k, [+(p + SE[0]).toFixed(1), +(f - SE[1]).toFixed(4), +(s + SE[2]).toFixed(4)]]),
);
/** 되돌아감 상한(차림마다 씨앗 평균. 목표 0: S5 에서 도착 문까지 정한 길을 따라가면 0 을 요구한다). 한 판 값은 0~5명으로 흔들린다(HEAD 48efa3c7 홍대 화 15시 씨앗 11 이 5).
 *  W41: HEAD 36a8f2d8 은 연트럴파크 씨앗 여섯 평균 4.83(4·2·4·9·7·3)으로 넘지 못했다. 큰 갈래(목적지가 생길 때 반대쪽으로 걷던 사람이 갈래 없는 선 사슬로 계속 멀어짐)를
 *  고친 뒤 차림마다 0~2 라 상한은 그대로 둔다 */
const BACK_MAX = 4;
// 클럽거리 토 21시 씨앗 12 는 미리 돌리기에서 두 사람(0.32m)이 겹친 채 시작했다(미리 돌리기 2초 걸음에서 겹침 확인 격자가 단계 처음 자리라 먼저 2~3m 옮긴 사람을 못 찾았다).
// 칸을 옮긴 사람을 둘째 격자에 넣어(W33 준비, W38 에 넣음) 15판 모두 0 이다

/** 차림 names 를 씨앗마다(0 규칙)·씨앗 평균으로(맴돌기·흐름·정체·되돌아감) 판정한다 */
/** 오가기 한 판 상한(사람 약 3,000명 가운데, W26 시험에서 옮김). 목표는 0, 적어도 W21 수준(50 아래)이다. W26 끝 263·259·290·244·311·283(W26 앞 586·533·498·424·442·465).
 *  W28(걷는 면) 끝에 잰 값 토 21시 166·152·149, 화 15시 157·152·158, W27 차로 정본(58fe47f8)과 함께 191·148·162, 161·160·159 에 여유를 둔 값으로
 *  늘지 않는지만 본다. 목표에 못 미쳤다(설계 문서 55절). W41: W26 시험(test/w26-pacing.test.ts)은 홍대 토 21시·화 15시 씨앗 11·12·13 을 이 차림과 똑같이
 *  (같은 보는 곳·인원·차·미리 돌리기·60초) 따로 한 번 더 돌렸다. 같은 판을 두 번 돌리지 않게 그 판들에서 이 상한만 여기서 본다 */
const PACE_MAX = 200;
const PACE_RUNS = new Set(['홍대 토 21시/11', '홍대 토 21시/12', '홍대 토 21시/13', '홍대 화 15시/11', '홍대 화 15시/12', '홍대 화 15시/13']);

export function describeW31(names: string[]) {
  describe.each(casesOf(names))('W31 한 차림: %s(씨앗 %i)', (name, seed) => {
    let R: W31Res;
    beforeAll(() => {
      R = res(name, seed);
    }, 400_000);
    it('사람이 있다', () => expect(R.people).toBeGreaterThan(1500));
    if (PACE_RUNS.has(`${name}/${seed}`)) it(`10m 안에서 30초 넘게 오가기 ${PACE_MAX} 명 아래(W26)`, () => expect(R.pace.length, R.pace.slice(0, 10).join('\n')).toBeLessThanOrEqual(PACE_MAX));
    it('출구·정류장·문 밖에서 생기거나 사라짐 0', () => expect([...R.born, ...R.gone]).toEqual([]));
    it('몸통 겹침 0', () => expect(R.overlap).toEqual([]));
    it('찻길 면 안 자리 0', () => expect(R.road).toEqual([]));
    it('한 프레임 1m 넘는 이동 0', () => expect(R.jump).toEqual([]));
    // W39: 일반 걷기는 막혔을 때만 '줄 선 사람'(게이트 앞 줄 뒤)을 정하고 다시 걸을 때 지우지 않았다(W36~W38). 표시가 남은 사람은 선 붐빔으로 세지 않았고,
    // 그 뒤에 막힌 사람은 줄을 선 것으로 보고 돌아서지 않았다
    it('걷는 사람에게 줄 선 표시가 남음 0', () => expect(R.staleQ).toEqual([]));
  });

  describe.each(SETUPS.filter((s) => names.includes(s[0])))('W31 한 차림 씨앗 평균: %s', (name) => {
    const [paceMax, flowMin, stillMax] = AVG[name];
    let rs: W31Res[];
    beforeAll(() => {
      rs = SEEDS.map((seed) => res(name, seed));
    }, 2_400_000);
    const avg = (f: (R: W31Res) => number) => rs.reduce((a, R) => a + f(R), 0) / rs.length;
    it(`맴돌기 3,000명당 평균 ${paceMax} 아래`, () => expect(avg((R) => (R.pace.length * 3000) / R.people)).toBeLessThanOrEqual(paceMax));
    it(`10초 3m 흐름 평균 ${(flowMin * 100).toFixed(1)}% 이상`, () => expect(avg((R) => R.flow10[0] / R.flow10[1])).toBeGreaterThanOrEqual(flowMin));
    it(`20초 정체 평균 ${(stillMax * 100).toFixed(2)}% 아래`, () => expect(avg((R) => R.still20[0] / R.still20[1])).toBeLessThanOrEqual(stillMax));
    it(`되돌아감 평균 ${BACK_MAX}명 아래`, () =>
      expect(
        avg((R) => R.back.length),
        rs.flatMap((R) => R.back).join('\n'),
      ).toBeLessThanOrEqual(BACK_MAX));
  });
}

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
// 차림마다 씨앗 여섯(11~16) 평균의 상한·하한 [맴돌기 3,000명당, 10초 3m 흐름, 20초 정체, 되돌아감, 오가기(홍대 두 차림만)]. 고칠 때마다 측정값으로 좁히기만 한다.
// W46: 사람 난수를 사람·자리 열쇠로 바꾸며(설계 60절) 같은 규칙에서도 표본이 한 번 바뀌었다. 상한 = 난수만 바꾼 판의 씨앗 11~16 평균 ± 그 평균의 표준오차
// (씨앗 여섯 표준편차 / √6, 계획 세션 결정 11-18). 옛 상한 = HEAD 10b21892 평균 ± 모은 표준오차(맴돌기 10.5, 흐름 0.67%p, 정체 0.47%p), 되돌아감 4,
// 오가기 한 판 200. 22개 가운데 20개는 좁아졌고, 홍대 토 21시 맴돌기(176.2 → 187.9)·걷고싶은거리 맴돌기(171.5 → 184.6)는 넓어졌다(두 차림은 Y 갈림 칸 막힘이
// 터지는 씨앗이 있어 표준오차가 15.2·8.3 으로 크다. 걷고싶은거리 171.5 는 HEAD 36a8f2d8 도 씨앗 여섯 평균 172.0 으로 넘던 값). 옛 값·새 값·HEAD 씨앗 열둘 평균은 W46 커밋 본문에 있다.
// 목표(설계 2-4절 6번): 맴돌기 15 아래, 10초 흐름 70% 이상(S4·S5 75%), 20초 정체 2% 아래
// W38: 흐름·정체는 갈래 영역 게이트 앞에서 차례를 기다리는 사람을 신호 대기처럼 '서 있는 사람'으로 빼고 잰다(w31-run.ts walking).
// 게이트 대기는 순환 대기(Y 갈림 교착)를 끊는 짧은 차례 기다림이라, 걷는 사람으로 세면 교착을 그대로 둔 HEAD 보다 흐름이 낮게 나왔다
const LIM: Record<string, [number, number, number, number, number?]> = {
  '홍대 토 21시': [187.9, 0.766, 0.089, 0.73, 187.9],
  '홍대 화 15시': [168.9, 0.7825, 0.0856, 0.34, 167.2],
  '클럽거리 토 21시': [171.2, 0.7812, 0.0786, 0.55],
  '걷고싶은거리 토 21시': [184.6, 0.7764, 0.0836, 0.55],
  '연트럴파크 토 21시': [132.4, 0.8537, 0.0535, 1.24],
};
/* 되돌아감 상한(LIM 넷째, 차림마다 씨앗 평균. 목표 0: S5 에서 도착 문까지 정한 길을 따라가면 0 을 요구한다). 한 판 값은 0~5명으로 흔들린다(HEAD 48efa3c7 홍대 화 15시 씨앗 11 이 5).
 *  W41: HEAD 36a8f2d8 은 연트럴파크 씨앗 여섯 평균 4.83(4·2·4·9·7·3)으로 넘지 못했다. 큰 갈래(목적지가 생길 때 반대쪽으로 걷던 사람이 갈래 없는 선 사슬로 계속 멀어짐)를
 *  고친 뒤 차림마다 0~2 였다. W46 에서 차림마다 씨앗 평균 + 표준오차로 좁혔다 */
// 클럽거리 토 21시 씨앗 12 는 미리 돌리기에서 두 사람(0.32m)이 겹친 채 시작했다(미리 돌리기 2초 걸음에서 겹침 확인 격자가 단계 처음 자리라 먼저 2~3m 옮긴 사람을 못 찾았다).
// 칸을 옮긴 사람을 둘째 격자에 넣어(W33 준비, W38 에 넣음) 15판 모두 0 이다

/** 차림 names 를 씨앗마다(0 규칙)·씨앗 평균으로(맴돌기·흐름·정체·되돌아감) 판정한다 */
/* 오가기(W26: 10m 안에서 30초 넘게 오가기, 맴돌기와 같은 잣대의 명수)는 홍대 토 21시·화 15시 씨앗 11·12·13 한 판마다 200 아래를 봤다. 한 판 값은 어울마당로 Y 갈림 칸
 * 막힘이 터지는 판인지에 따라 그 칸 맴돌기만 0~81명씩 흔들려(W46: HEAD 씨앗 11~34 가운데 15·30 이 213·206) 판정으로 쓸 수 없어, W46 에서 씨앗 여섯 평균으로 바꿨다(LIM 다섯째) */

export function describeW31(names: string[]) {
  describe.each(casesOf(names))('W31 한 차림: %s(씨앗 %i)', (name, seed) => {
    let R: W31Res;
    beforeAll(() => {
      R = res(name, seed);
    }, 400_000);
    it('사람이 있다', () => expect(R.people).toBeGreaterThan(1500));
    it('출구·정류장·문 밖에서 생기거나 사라짐 0', () => expect([...R.born, ...R.gone]).toEqual([]));
    it('몸통 겹침 0', () => expect(R.overlap).toEqual([]));
    it('찻길 면 안 자리 0', () => expect(R.road).toEqual([]));
    it('한 프레임 1m 넘는 이동 0', () => expect(R.jump).toEqual([]));
    // W39: 일반 걷기는 막혔을 때만 '줄 선 사람'(게이트 앞 줄 뒤)을 정하고 다시 걸을 때 지우지 않았다(W36~W38). 표시가 남은 사람은 선 붐빔으로 세지 않았고,
    // 그 뒤에 막힌 사람은 줄을 선 것으로 보고 돌아서지 않았다
    it('걷는 사람에게 줄 선 표시가 남음 0', () => expect(R.staleQ).toEqual([]));
  });

  describe.each(SETUPS.filter((s) => names.includes(s[0])))('W31 한 차림 씨앗 평균: %s', (name) => {
    const [paceMax, flowMin, stillMax, backMax, paceN] = LIM[name];
    let rs: W31Res[];
    beforeAll(() => {
      rs = SEEDS.map((seed) => res(name, seed));
    }, 2_400_000);
    const avg = (f: (R: W31Res) => number) => rs.reduce((a, R) => a + f(R), 0) / rs.length;
    it(`맴돌기 3,000명당 평균 ${paceMax} 아래`, () => expect(avg((R) => (R.pace.length * 3000) / R.people)).toBeLessThanOrEqual(paceMax));
    it(`10초 3m 흐름 평균 ${(flowMin * 100).toFixed(1)}% 이상`, () => expect(avg((R) => R.flow10[0] / R.flow10[1])).toBeGreaterThanOrEqual(flowMin));
    it(`20초 정체 평균 ${(stillMax * 100).toFixed(2)}% 아래`, () => expect(avg((R) => R.still20[0] / R.still20[1])).toBeLessThanOrEqual(stillMax));
    it(`되돌아감 평균 ${backMax}명 아래`, () =>
      expect(
        avg((R) => R.back.length),
        rs.flatMap((R) => R.back).join('\n'),
      ).toBeLessThanOrEqual(backMax));
    if (paceN !== undefined) it(`10m 안에서 30초 넘게 오가기 평균 ${paceN} 명 아래(W26)`, () => expect(avg((R) => R.pace.length)).toBeLessThanOrEqual(paceN));
  });
}

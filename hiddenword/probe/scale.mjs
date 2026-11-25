// 채점 기준표의 점수를 화면에 보이는 유사도 눈금으로 바꾼다.
// 기준표는 관계의 종류별 구간(같은 말 93~99, 아주 가까운 말 70~92, 함께 쓰이는 말 50~69 …)이고,
// 화면의 눈금은 아주 가까운 말이 95점 이상으로 나오는 눈금이다(첫 단서가 95점 이상).
const POINTS = [
  [0, 0],
  [10, 30],
  [30, 60],
  [50, 80],
  [70, 95],
  [93, 99],
  [100, 99],
];

export function toDisplay(raw) {
  for (let i = 1; i < POINTS.length; i++) {
    const [x0, y0] = POINTS[i - 1];
    const [x1, y1] = POINTS[i];
    if (raw <= x1) return Math.min(99, Math.round(y0 + ((raw - x0) / (x1 - x0)) * (y1 - y0)));
  }
  return 99;
}

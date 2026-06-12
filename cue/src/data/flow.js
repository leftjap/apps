/* flow.js — 타임라인 클러스터·라벨 배치 순수 로직 (v8 Hero 에서 사용, 작업지시서 §3.3).
   점은 실제 시각 위치에 그대로 두고, 라벨만 클러스터 단위로 묶어 한 줄 배치.
   구 staggerLane(세로 행 내림)은 작업지시서 금지 사항이 되어 폐기. */

/** 점 x좌표(px) 오름차순 정렬 후, 인접 간격이 clusterPx 이하면 같은 클러스터.
    items: [{id, x, ...}] → [{key: 첫 점 id, items, xs, cx: 평균}] */
export function clusterPoints(items, clusterPx = 60) {
  const out = [];
  items
    .slice()
    .sort((a, b) => a.x - b.x)
    .forEach((a) => {
      const last = out[out.length - 1];
      if (last && a.x - last.xs[last.xs.length - 1] <= clusterPx) {
        last.items.push(a);
        last.xs.push(a.x);
      } else {
        out.push({ key: a.id, items: [a], xs: [a.x] });
      }
    });
  out.forEach((c) => { c.cx = c.xs.reduce((s, v) => s + v, 0) / c.xs.length; });
  return out;
}

/** 클러스터 라벨 left 좌표 — 중앙 정렬에서 시작해 좌→우 스윕(최소 간격 gap),
    우→좌 패스로 컨테이너 [0, W] 클램프. centers/widths 동일 길이 → lefts. */
export function sweepLefts(centers, widths, W, gap = 26) {
  const lefts = centers.map((cx, i) => cx - widths[i] / 2);
  for (let i = 0; i < lefts.length; i++) {
    if (i === 0) lefts[i] = Math.max(0, lefts[i]);
    else lefts[i] = Math.max(lefts[i], lefts[i - 1] + widths[i - 1] + gap);
  }
  for (let i = lefts.length - 1; i >= 0; i--) {
    const maxL = i === lefts.length - 1 ? W - widths[i] : lefts[i + 1] - gap - widths[i];
    lefts[i] = Math.min(lefts[i], maxL);
    if (i === 0) lefts[i] = Math.max(0, lefts[i]);
  }
  return lefts;
}

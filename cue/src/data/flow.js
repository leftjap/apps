/* flow.js — 타임라인 라벨 충돌 회피 순수 로직 (v8 Hero 에서 사용, QA §11-2).
   v8 전환으로 fmt/remainLabel/nextOf 는 폐기 — due 판정은 transforms.dueOf(§6). */

/** 같은 레인 안에서 라벨이 겹치면 줄을 내려 배치 (결정론적 충돌 회피).
    pos 오름차순 정렬 후 직전 라벨과 minGap(%p) 미만이면 다음 줄 — 최대 3줄. */
export function staggerLane(stops, minGap = 19) {
  const rows = [-Infinity, -Infinity, -Infinity];
  return stops
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .map((s) => {
      let r = 0;
      while (r < 2 && s.pos - rows[r] < minGap) r++;
      rows[r] = s.pos;
      return { ...s, row: r };
    });
}

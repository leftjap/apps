/* flow.js — '오늘 흐름' 시간 밴드 순수 로직 (flow 작업지시서 §3.3·§3.4).
   시안 design-ref/flow/src/flow/flow-band.jsx 의 헬퍼를 ES 모듈로 이식 — 단위 테스트 대상. */
import { p2 } from './transforms.js';

/** 분 → "HH:MM" */
export const fmt = (min) => `${p2(Math.floor(min / 60) % 24)}:${p2(Math.round(min) % 60)}`;

/** 남은 시간 문구 — "7시간 32분" / "45분" (자정 기준, 음수 클램프) */
export function remainLabel(nowMin) {
  const r = Math.max(0, 1440 - nowMin);
  const h = Math.floor(r / 60), m = Math.round(r % 60);
  return h > 0 ? `${h}시간 ${p2(m)}분` : `${m}분`;
}

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

/** 미실행 중 "다음" — 밀린 것(평소 시각 ≤ 지금) 우선 그중 가장 이른 것,
    없으면 가장 가까운 예정. 도어 [다음] 태그·밴드가 같은 소스 공유. */
export function nextOf(pend, nowMin) {
  const due = pend.filter((p) => p.h.usualMin <= nowMin).sort((a, b) => a.h.usualMin - b.h.usualMin);
  const up = pend.filter((p) => p.h.usualMin > nowMin).sort((a, b) => a.h.usualMin - b.h.usualMin);
  return (due[0] || up[0] || { h: {} }).h.id || null;
}

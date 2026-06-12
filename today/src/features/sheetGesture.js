/**
 * 바텀 시트(댓글·가계부 타임라인) 스와이프의 순수 결정 로직.
 *
 * 사이드바 드로어 제스처(mocks/today-mac.html L7872~)의 "손가락 1:1 추적 + 관성 snap" 을
 * 세로축으로 포팅한 것. 드로어와 동일 상수를 써서 두 스와이프의 질감을 일치시킨다.
 * 좌표계: progress 0 = peek(닫힘), 1 = 열림. 여는 방향 = 위(dy<0), 닫는 방향 = 아래(dy>0).
 *
 * mock 인라인 스크립트(initMobileSheet)가 window.__todaySheetGesture 로 이 함수들을 사용한다
 * (app.js 가 모듈 로드 시점에 노출 → injectMocks 보다 먼저 준비됨).
 */

export const SHEET_GESTURE = {
  DECIDE_PX: 6, // 이 거리 넘기 전엔 방향 미결정 (드로어와 동일)
  ANGLE: 1.2, // 세로:가로 비 — 가로 우세면 시트 제스처 포기
  SNAP_RATIO: 0.4, // 이동거리/range 가 이 값 초과면 상태 전환
  VEL_RATIO: 0.2, // 빠른 플릭 시 최소 이동 비율
  VEL_TH: 0.5, // px/ms — 이 속도 넘으면 짧게 끌어도 전환
  CURVE: 'cubic-bezier(.25,.46,.45,.94)',
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 손가락 위치 → progress (0=peek, 1=열림).
 * @param {number} dy 시작점 대비 세로 이동 (위 음수, 아래 양수)
 * @param {number} range peek↔열림 이동 거리 (sheetH - peek)
 * @param {boolean} startOpen 제스처 시작 시 열림 여부
 */
export function sheetProgress(dy, range, startOpen) {
  if (!range) return startOpen ? 1 : 0;
  return clamp01(startOpen ? 1 - dy / range : -dy / range);
}

/**
 * touchend 시 속도·거리로 최종 상태 결정 (드로어 snapTo 판정과 동일 식).
 * @returns {{ targetOpen: boolean, velocity: number, pct: number, passed: boolean }}
 */
export function sheetSnap({ dy, range, elapsedMs, startOpen }) {
  const { SNAP_RATIO, VEL_RATIO, VEL_TH } = SHEET_GESTURE;
  const velocity = elapsedMs > 0 ? Math.abs(dy) / elapsedMs : 0;
  const pct = range > 0 ? Math.abs(dy) / range : 0;
  const passed = pct > SNAP_RATIO || (velocity > VEL_TH && pct > VEL_RATIO);
  return { targetOpen: startOpen ? !passed : passed, velocity, pct, passed };
}

/**
 * 결정 시점(첫 6px)에 제스처 종류 분류 — 리스트 스크롤 ↔ 시트 드래그 조율 포함.
 *  - 'pending': 아직 임계 미달
 *  - 'none'   : 시트 제스처 아님 (가로 우세 / peek 아래로 / 리스트 스크롤 우선)
 *  - 'open'   : 닫힘에서 위로 → 여는 드래그
 *  - 'close'  : 열림에서 아래로 → 닫는 드래그
 *
 * 사이드바 닫기처럼 "핸들·헤더(스크롤 불가 영역)를 잡으면 어디서든 닫힘". 스크롤 조율은
 * 리스트 위에서 시작한 드래그(fromList)에만 적용 — 리스트가 더 위로 스크롤 가능하면 양보.
 * (열면 리스트가 바닥으로 가므로, fromList 조율을 핸들에까지 적용하면 핸들로도 못 닫는 버그가 됐음.)
 * @param {boolean} fromList 터치가 스크롤 리스트 위에서 시작했는지
 * @returns {'pending'|'none'|'open'|'close'}
 */
export function classifySheetGesture({ dx, dy, startOpen, listScrollTop, fromList }) {
  const { DECIDE_PX, ANGLE } = SHEET_GESTURE;
  if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return 'pending';
  if (Math.abs(dx) > Math.abs(dy) * ANGLE) return 'none'; // 가로 우세 → 시트 무관
  if (!startOpen) return dy < 0 ? 'open' : 'none';
  // 열림 + 아래로 → 닫기. 단 리스트 위에서 시작했고(fromList) 더 위로 스크롤 가능하면 리스트 양보.
  if (dy > 0 && (!fromList || (listScrollTop || 0) <= 0)) return 'close';
  return 'none';
}

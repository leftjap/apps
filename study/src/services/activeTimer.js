/**
 * activeTimer — 세션 중 '실제 활동 시간'만 누적하는 타이머.
 *
 * 벽시계(Date.now() - startTime)는 탭 방치·스냅샷 복원 시 폭주한다
 * (예: 발화 0회인데 study_time_sec 7시간 — 2026-07-04 진단). 그래서
 * ① 페이지 가시(visible) ② 마지막 활동(입력·녹음·듣기) 후 IDLE_MS 이내
 * 두 게이트를 모두 통과하는 경과만 센다. 스냅샷엔 activeSec 로 저장/복원 —
 * 복원 세션이 옛 startTime 을 승계해도 방치 구간은 0.
 */

export const IDLE_MS = 5 * 60 * 1000; // 무활동 5분까지 유예(듣기 등 무입력 학습 보호), 초과분 미계상

export function createActiveTimer(now = Date.now) {
  let accMs = 0; // 누적 활성 ms
  let last = now(); // 마지막 샘플 시각
  let lastActivity = now();
  let hidden = false;

  // 경과를 정산 — [last, t] 구간 중 활성으로 인정되는 부분만 누적.
  // 유휴 경계에 걸친 구간은 (lastActivity + IDLE_MS) 까지만 인정.
  const sample = () => {
    const t = now();
    if (!hidden) {
      const activeEnd = Math.min(t, lastActivity + IDLE_MS);
      if (activeEnd > last) accMs += activeEnd - last;
    }
    last = t;
  };

  return {
    /** 사용자 활동(입력·녹음·듣기) 기록 — 유휴 시계 리셋 */
    activity() { sample(); lastActivity = now(); },
    /** visibilitychange 반영 — hidden 구간 미계상 */
    setHidden(h) { sample(); hidden = !!h; },
    /** 누적 활성 초 (정산 포함) */
    seconds() { sample(); return Math.floor(accMs / 1000); },
    /** 스냅샷 복원 — 누적 시드 (비정상값은 0) */
    restore(sec) {
      sample();
      const v = Math.floor(Number(sec));
      accMs = Number.isFinite(v) && v > 0 ? v * 1000 : 0;
    },
  };
}

// owner 별 추천 재생성 코얼레싱 — claude -p 동시 2개 방지 + 진행 중 들어온 요청 누락 방지.
// 타이머·exec 없음(데몬이 run 주입). run(ownerId) => Promise. 순수/테스트 가능.
//
// 규칙:
//  - idle owner 요청 → 즉시 run.
//  - 실행 중 같은 owner 재요청(버튼 연타·평가 연속) → pending 표시, 끝나면 정확히 1회만 더 run(흡수).
//  - owner 끼리는 격리(동시 실행 가능).
//  - run 이 throw 해도 pending 은 이어서 처리하고, 끝나면 깨끗이 idle.
export function createScheduler(run) {
  const running = new Set();   // 현재 claude -p 실행 중 owner
  const pending = new Set();   // 실행 중 들어온 재요청 owner

  function request(ownerId) {
    if (running.has(ownerId)) { pending.add(ownerId); return; }
    void loop(ownerId);
  }

  async function loop(ownerId) {
    running.add(ownerId);
    try {
      do {
        pending.delete(ownerId);            // 이번 run 이 흡수
        try { await run(ownerId); } catch (_) { /* 데몬이 로깅 */ }
      } while (pending.has(ownerId));        // 진행 중 새 요청 있었으면 1회 더
    } finally {
      running.delete(ownerId);
      pending.delete(ownerId);
    }
  }

  return {
    request,
    isRunning: (o) => running.has(o),
    isPending: (o) => pending.has(o),
  };
}

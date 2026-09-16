/**
 * 앱의 "오늘 날짜" 단일 소스 (Wave 11.6A · Wave 11.20+ 동적화).
 *
 * Wave 11.6A: 고정 '2026-04-15' (seed fixture 와 일치 — 데모용).
 * Wave 11.20+: 사용자 default Chrome 실 검증에서 발견 — TODAY_ISO 고정 시
 *   사용자가 학습 후 nextReview 미래로 갱신된 카드들이 dueToday 계산에서 제외됨 (4-15 ≤ nextReview 항상 false).
 *   → 동적 `new Date()` 로 교체. seed fixture 의 nextReview='2026-04-15' 는 항상 dueToday 통과 (오늘 ≥ 4-15).
 *   한 곳만 바꾸면 home/stats/session/seed 전부 전파되도록 단일화 유지.
 * 2026-06-22: UTC(`toISOString`) → 로컬(KST) 귀속으로 교체. UTC 는 KST 새벽(0~9시) 학습을 전날로
 *   기록해 cue 가 활동을 엉뚱한 날에 반영(gym 은 로컬 `getFullYear/getMonth/getDate` 라 정상이었음).
 * 2026-09-17: 모듈 로드 시점에 한 번 계산하던 `TODAY_ISO` 상수를 폐기. 그 값을 main.js 가
 *   `window.studyDay.TODAY_ISO` 로 박아 앱 전역이 읽었기 때문에, 탭·PWA 를 닫지 않고 며칠 쓰면
 *   "오늘"이 첫 로드 날짜에 묶였다. 실측(서버 기록): 9/15 18:53 학습이 date=2026-09-14 로,
 *   9/12 21:11 학습이 date=2026-09-08 로 저장됐고 홈 캘린더는 그 굳은 날짜 뒤를 미래 칸으로 비웠다.
 *   → 호출 시점 계산으로 바꾸고, 떠 있는 화면을 위해 watchDayChange 를 둔다.
 */

/** Date → 로컬 시간대 기준 'YYYY-MM-DD' (gym `toISODate` 와 동일 — 기기 시간대=KST 전제). */
export function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 지금 이 순간의 오늘. 상수로 굳히지 말 것 — 앱은 며칠씩 열린 채로 쓰인다. */
export function todayISO() {
  return localISODate();
}

/** 'YYYY-MM-DD' → 날짜(숫자). UI 의 주간 캘린더 TODAY 숫자 필드용. */
export function todayDayNumber() {
  return parseInt(todayISO().slice(-2), 10);
}

/**
 * 떠 있는 화면이 날짜 전환을 따라가게 한다.
 *
 * 날짜를 호출 시점에 계산해도, 이미 그려진 홈 캘린더는 다시 그리기 전까지 어제 것 그대로다.
 * 탭 복귀(visibilitychange)·창 포커스에 더해 주기 점검을 두는 이유는, 화면을 켜 둔 채 자정을
 * 넘기는 경우엔 두 이벤트가 아예 발생하지 않기 때문이다.
 *
 * @param {(iso: string) => void} onChange 바뀐 날짜로 호출된다 (같은 날 반복 호출 없음).
 * @returns {() => void} 정리 함수.
 */
export function watchDayChange(onChange, opts = {}) {
  const win = opts.win ?? (typeof window !== 'undefined' ? window : null);
  const doc = opts.doc ?? (typeof document !== 'undefined' ? document : null);
  if (!win && !doc) return () => {};

  let last = localISODate();
  const check = () => {
    const now = localISODate();
    if (now === last) return;
    last = now;
    onChange(now);
  };

  doc?.addEventListener('visibilitychange', check);
  win?.addEventListener('focus', check);
  const timer = setInterval(check, opts.intervalMs ?? 60000);

  return () => {
    clearInterval(timer);
    doc?.removeEventListener('visibilitychange', check);
    win?.removeEventListener('focus', check);
  };
}

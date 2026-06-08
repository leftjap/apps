/* launch.js — 카드 탭 행동 결정 (Door 에서 사용).
   데모: 상태순환(onDemo) / 실모드 url 있음: 앱 열기 / url 없음(운동 iPhone): 무동작.
   순수 함수로 분리 — DOM/로그인 없이 단위 테스트 (실모드 클릭은 로그인 필요해 라이브 불가). */
export function launchHabit({ habit, demoMode, onDemo, open }) {
  if (demoMode) { onDemo(); return 'demo'; }
  if (habit.url) { open(habit.url, '_blank', 'noopener'); return 'open'; }
  return 'device-only';
}

/**
 * formatElapsed — 경과 ms 를 "MM:SS" 로 포맷.
 * - 음수/NaN/Infinity → "00:00" 폴백
 * - 60분 초과는 MM 자리수 확장 (e.g. 75:30) — spec §8-6 세션 1시간 만료라 이론상 60 초과 드물지만 안전.
 */
export function formatElapsed(ms) {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const total = Math.floor(safe / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

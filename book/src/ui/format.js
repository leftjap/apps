/**
 * 날짜/시간 포맷 — 어구록 메타 표시.
 * 저장된 wall-clock(UTC로 보존된 시드/작성 시각)을 그대로 표시하기 위해 UTC 컴포넌트 사용.
 */
const p2 = (n) => String(n).padStart(2, '0');

/** ISO → "2026.05.15 14:32" */
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}.${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

/** ISO → "2026.05.15" */
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}.${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCDate())}`;
}

/** ISO → "05.15" (월.일) */
export function fmtMonthDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${p2(d.getUTCMonth() + 1)}.${p2(d.getUTCDate())}`;
}

export default { fmtDateTime, fmtDate, fmtMonthDay };

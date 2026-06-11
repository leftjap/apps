/**
 * 하이라이트(드래그 형광펜) 순수 로직 — 시안 library3 이식 (SCREEN 02 잔여분).
 * marks: [{ s, e, c }] — 본문 텍스트 오프셋 [s,e), c='y'|'p'|'g'|'b'.
 * 불변식: s<e, 오름차순 정렬, 상호 비겹침 (applyMark/removeRange 가 보장).
 * 저장은 Dexie quote_highlights 테이블(로컬 전용 — queries.js) — 서버 동기화 없음.
 */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** 본문을 mark 기준 세그먼트로 분할 → [{ text, c|null }]. 렌더러가 mark 요소로 변환. */
export function segmentText(text, marks = []) {
  const len = text.length;
  const segs = [];
  let cur = 0;
  for (const m of marks) {
    const s = clamp(m.s, 0, len);
    const e = clamp(m.e, 0, len);
    if (e <= s) continue;
    if (s > cur) segs.push({ text: text.slice(cur, s), c: null });
    segs.push({ text: text.slice(s, e), c: m.c });
    cur = e;
  }
  if (cur < len) segs.push({ text: text.slice(cur), c: null });
  if (!segs.length) segs.push({ text, c: null });
  return segs;
}

/** 구간 [s,e) 를 기존 마크에서 도려낸다 — 걸친 마크는 양쪽 조각 보존. */
export function removeRange(marks, { s, e }) {
  if (!(e > s)) return marks.slice();
  const out = [];
  for (const m of marks) {
    if (m.e <= s || m.s >= e) { out.push({ ...m }); continue; } // 무관
    if (m.s < s) out.push({ s: m.s, e: s, c: m.c }); // 앞 조각
    if (m.e > e) out.push({ s: e, e: m.e, c: m.c }); // 뒤 조각
  }
  return out;
}

/** 새 마크 적용 — 겹침 도려내고 삽입, 같은 색 인접(맞닿음 포함) 병합, 정렬 유지. */
export function applyMark(marks, { s, e, c }) {
  if (!(e > s)) return marks.slice();
  const cut = removeRange(marks, { s, e });
  cut.push({ s, e, c });
  cut.sort((a, b) => a.s - b.s || a.e - b.e);
  const out = [];
  for (const m of cut) {
    const last = out[out.length - 1];
    if (last && last.c === m.c && m.s <= last.e) last.e = Math.max(last.e, m.e);
    else out.push({ ...m });
  }
  return out;
}

/** 선택 [s,e) 가 같은 색 마크들로 빈틈없이 덮여 있으면 그 색, 아니면 null (활성 스와치 판정). */
export function coveredColor(marks, s, e) {
  let cur = s;
  let color = null;
  for (const m of marks) {
    if (m.e <= cur) continue;
    if (m.s > cur) return null; // 빈틈
    if (color == null) color = m.c;
    else if (color !== m.c) return null; // 혼합 색
    cur = Math.min(e, m.e);
    if (cur >= e) return color;
  }
  return cur >= e ? color : null;
}

export default { segmentText, applyMark, removeRange, coveredColor };

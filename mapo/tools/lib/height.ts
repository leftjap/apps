// 건물 높이(m). 태그가 있으면 쓰고, 없으면 용도와 바닥 면적으로 추정한다.
// 추정값은 건물 id로 정해지므로 구울 때마다 같다.

/** id로 정해지는 0~1 값 */
export function hash01(id: number, salt = 0): number {
  let h = (id ^ (salt * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const FLOOR = 3.2;

export function estimateHeight(tags: Record<string, string>, area: number, id: number): number {
  const h = parseFloat(tags.height ?? '');
  if (h > 0) return h;
  const lv = parseFloat(tags['building:levels'] ?? '');
  if (lv > 0) return Math.round((lv * FLOOR + 1) * 10) / 10;

  const r = hash01(id);
  const kind = tags.building ?? 'yes';
  let floors: number;
  if (kind === 'apartments') floors = area > 500 ? 12 + Math.floor(r * 12) : 5 + Math.floor(r * 4);
  else if (kind === 'house' || kind === 'detached' || kind === 'hut' || kind === 'shed' || kind === 'garage')
    floors = 1 + Math.floor(r * 2.5);
  else if (kind === 'residential') floors = 2 + Math.floor(r * 3.5);
  else if (kind === 'office' || kind === 'hotel') floors = 6 + Math.floor(r * 10);
  else if (kind === 'university' || kind === 'school' || kind === 'college') floors = 3 + Math.floor(r * 4);
  else if (kind === 'roof' || kind === 'kiosk') floors = 1;
  else {
    // 상가·미분류: 대부분 2~6층, 바닥이 넓으면 더 높인다
    floors = 2 + Math.floor(r * r * 5);
    if (area > 1500) floors += 4 + Math.floor(hash01(id, 1) * 8);
    else if (area > 600) floors += Math.floor(hash01(id, 1) * 5);
  }
  return Math.round((floors * FLOOR + 1) * 10) / 10;
}

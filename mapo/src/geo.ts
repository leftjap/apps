// 위경도 ↔ 판 좌표(m). x 동쪽, z 남쪽. 판이 4km라 평면 근사로 충분하다.
export const ORIGIN = { lat: 37.5515, lon: 126.919 };
export const BOARD_R = 2000;

const M_LAT = 110_950; // 북위 37.55도에서 위도 1도의 길이(m)
const M_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function toXZ(lat: number, lon: number): [number, number] {
  return [(lon - ORIGIN.lon) * M_LON, -(lat - ORIGIN.lat) * M_LAT];
}

export function toLatLon(x: number, z: number): [number, number] {
  return [ORIGIN.lat - z / M_LAT, ORIGIN.lon + x / M_LON];
}

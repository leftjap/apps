import { ORIGIN, toLatLon } from '../geo.ts';

export type LonLat = readonly [number, number];
export type Tile = { x: number; y: number };

export const AERIAL_DEV_PORT = 5198;
export const AERIAL_DEV_ORIGIN = `http://localhost:${AERIAL_DEV_PORT}`;

const TILE_ZOOM = 19;
const matrixSize = 2 ** TILE_ZOOM;
const radians = Math.PI / 180;
// Apply one local scale to both axes so the WMTS and the footprints still share exact edges.
const localCircumference = 2 * Math.PI * 6_378_137 * Math.cos(ORIGIN.lat * radians);
export const TILE_METRES = localCircumference / matrixSize;

function mercatorFraction([lon, lat]: LonLat): [number, number] {
  return [(lon + 180) / 360, (1 - Math.asinh(Math.tan(lat * radians)) / Math.PI) / 2];
}

const [originX, originY] = mercatorFraction([ORIGIN.lon, ORIGIN.lat]);

export function groundPoint(point: LonLat): [number, number] {
  const [x, y] = mercatorFraction(point);
  return [(x - originX) * localCircumference, (y - originY) * localCircumference];
}

export function tileAtGround(x: number, z: number): Tile {
  return {
    x: Math.floor((x / localCircumference + originX) * matrixSize),
    y: Math.floor((z / localCircumference + originY) * matrixSize),
  };
}

export function tileBounds({ x, y }: Tile) {
  return {
    west: (x / matrixSize - originX) * localCircumference,
    north: (y / matrixSize - originY) * localCircumference,
    east: ((x + 1) / matrixSize - originX) * localCircumference,
    south: ((y + 1) / matrixSize - originY) * localCircumference,
  };
}

export function vworldTileUrl(key: string, { x, y }: Tile): string {
  return `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(key)}/Satellite/${TILE_ZOOM}/${y}/${x}.jpeg`;
}

export function buildingHeight(height: number | null, floors: number | null) {
  if (height !== null && Number.isFinite(height) && height > 0) return { metres: height, estimated: false };
  if (floors !== null && Number.isFinite(floors) && floors > 0) return { metres: floors * 3, estimated: true };
  return null;
}

function crossingCentre(x: number, z: number): LonLat {
  const [lat, lon] = toLatLon(x, z);
  return [lon, lat];
}

// Reuse the crossing centres documented for the original QA cameras.
export const PILOT_SITES = {
  seogyo: crossingCentre(-70, -130),
  hapjeong: crossingCentre(-490, 245),
};

// Public source anchors for the 60m corridor comparison cameras.
export const CORRIDOR_VIEWS = {
  'alley-east': { label: '양화로12길 입구', at: [126.9169743, 37.5516929] },
  'alley-west': { label: '양화로7길 입구', at: [126.9154903, 37.5508189] },
  crossing: { label: '구간 중간 횡단보도', at: [126.9166891, 37.5513413] },
  bus: { label: '우리은행서교동지점 정류장', at: [126.9176946, 37.5521948] },
  island: { label: '합정역 북동쪽 교통섬', at: [126.9135794, 37.549519] },
  hapjeong: { label: '합정 사거리', at: PILOT_SITES.hapjeong },
} as const satisfies Record<string, { label: string; at: LonLat }>;

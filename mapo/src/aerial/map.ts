import { ORIGIN, toLatLon } from '../geo.ts';

export type LonLat = readonly [number, number];
export type Tile = { x: number; y: number };

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

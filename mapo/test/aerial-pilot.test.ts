import { describe, expect, it } from 'vitest';
import { buildingHeight, groundPoint, tileBounds, tileAtGround, vworldTileUrl } from '../src/aerial/map';

// Independently calculated EPSG:3857 z19 tile 446982/203057 NW corner.
const corner = [126.91818237304688, 37.552743280459694] as const;
const tile = { x: 446982, y: 203057 };

describe('aerial pilot map', () => {
  it('places the Seogyo and Hapjeong crossings in their north-origin WMTS tiles', () => {
    expect(tileAtGround(...groundPoint([126.91820684511595, 37.55267169896349]))).toEqual(tile);
    expect(tileAtGround(...groundPoint([126.91344791581167, 37.549291798107255]))).toEqual({ x: 446975, y: 203063 });
  });

  it('projects building coordinates onto tile edges, with north at the top', () => {
    const point = groundPoint(corner);
    const bounds = tileBounds(tile);
    expect(point[0]).toBeCloseTo(bounds.west, 3);
    expect(point[1]).toBeCloseTo(bounds.north, 3);
    expect(bounds.east - bounds.west).toBeCloseTo(60.6, 1);
    expect(tileBounds({ x: tile.x + 1, y: tile.y }).west).toBe(bounds.east);
    expect(tileBounds({ x: tile.x, y: tile.y + 1 }).north).toBe(bounds.south);
  });

  it('uses row before column and the JPEG extension in the VWorld tile URL', () => {
    expect(vworldTileUrl('test-key', tile)).toBe(
      'https://api.vworld.kr/req/wmts/1.0.0/test-key/Satellite/19/203057/446982.jpeg',
    );
  });

  it('keeps recorded height distinct from floor-based estimates and missing values', () => {
    expect(buildingHeight(12.7, 2)).toEqual({ metres: 12.7, estimated: false });
    expect(buildingHeight(0, 2)).toEqual({ metres: 6, estimated: true });
    expect(buildingHeight(null, 0)).toBeNull();
  });
});

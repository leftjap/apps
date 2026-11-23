import { Mesh, PlaneGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createRoadOverlay, ROAD_OVERLAY_ASSETS } from '../src/aerial/road-overlay';

function corner(mesh: Mesh<PlaneGeometry>, u: number, v: number) {
  const positions = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  for (let idx = 0; idx < uv.count; idx++) {
    if (uv.getX(idx) === u && uv.getY(idx) === v) {
      return mesh.localToWorld(new Vector3().fromBufferAttribute(positions, idx));
    }
  }
  throw new Error('Missing texture corner');
}

describe('the Seogyo road comparison', () => {
  it('places both 156m images at the ground centre with right facing east and south', () => {
    const { group } = createRoadOverlay(() => {});
    const layers = group.children as Mesh<PlaneGeometry>[];
    expect(layers).toHaveLength(2);
    for (const mesh of layers) {
      const topLeft = corner(mesh, 0, 1);
      const topRight = corner(mesh, 1, 1);
      const bottomLeft = corner(mesh, 0, 0);
      const bottomRight = corner(mesh, 1, 0);
      const centre = topLeft.clone().add(bottomRight).multiplyScalar(0.5);
      expect(centre.x).toBeCloseTo(-70, 1);
      expect(centre.z).toBeCloseTo(-130.43, 1);
      expect(centre.y).toBeCloseTo(0);
      expect(topRight.clone().sub(topLeft).toArray()).toEqual([
        expect.closeTo(115.9306, 3), expect.closeTo(0), expect.closeTo(104.3844, 3),
      ]);
      expect(bottomLeft.clone().sub(topLeft).toArray()).toEqual([
        expect.closeTo(-104.3844, 3), expect.closeTo(0), expect.closeTo(115.9306, 3),
      ]);
      expect(mesh.visible).toBe(false);
    }
  });

  it('loads the opaque drawing and transparent annotations from distinct pilot assets', () => {
    expect(ROAD_OVERLAY_ASSETS).toEqual({
      road: 'data/v2/seogyo-road.svg',
      overlay: 'data/v2/seogyo-lines.svg',
    });
  });
});

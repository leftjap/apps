import * as THREE from 'three';
import { buildingHeight, groundPoint } from './map';
import type { LonLat } from './map';

type Building = { rings: LonLat[][]; height: number | null; floors: number | null };

export async function loadBuildings(group: THREE.Group) {
  const response = await fetch(`${import.meta.env.BASE_URL}data/aerial-pilot.json`);
  if (!response.ok) throw new Error('Cannot load building data');
  const { buildings } = await response.json() as { buildings: Building[] };
  const walls = [new THREE.MeshLambertMaterial({ color: '#b9b1a6' }), new THREE.MeshLambertMaterial({ color: '#83a6b4' })];
  const roofs = [new THREE.MeshLambertMaterial({ color: '#eddfcb' }), new THREE.MeshLambertMaterial({ color: '#b8d9e4' })];
  const outlineMaterial = new THREE.LineBasicMaterial({ color: '#f6cf83' });
  const totals = { recorded: 0, estimated: 0, outlines: 0 };

  for (const { rings, height, floors } of buildings) {
    const size = buildingHeight(height, floors);
    if (!rings[0] || rings[0].length < 3) continue;
    if (!size) {
      for (const ring of rings) {
        const points = ring.map(point => {
          const [x, z] = groundPoint(point);
          return new THREE.Vector3(x, 0.025, z);
        });
        group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), outlineMaterial));
      }
      totals.outlines++;
      continue;
    }
    const [outline, ...holes] = rings.map(ring => ring.map(point => {
      const [x, z] = groundPoint(point);
      return new THREE.Vector2(x, -z);
    }));
    const footprint = new THREE.Shape(outline);
    for (const hole of holes) footprint.holes.push(new THREE.Path(hole));
    const geometry = new THREE.ExtrudeGeometry(footprint, { depth: size.metres, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const index = size.estimated ? 1 : 0;
    group.add(new THREE.Mesh(geometry, [roofs[index], walls[index]]));
    totals[size.estimated ? 'estimated' : 'recorded']++;
  }

  return totals;
}

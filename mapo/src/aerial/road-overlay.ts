import * as THREE from 'three';
import { arrowShape, lineStyle } from '../data/marks.ts';
import { PAINT_DASHES } from './ground-paint.ts';
import { groundPoint, PILOT_SITES, type LonLat } from './map.ts';

export type SurfaceMode = 'photo' | 'road' | 'overlay' | 'hand';
type DrawnSurface = Exclude<SurfaceMode, 'photo'>;
type Site = keyof typeof PILOT_SITES;
type Status = 'loading' | 'ready' | 'error';
type Path = LonLat[];
type Line = { kind: number; subtype: number; parts: Path[]; stripes?: [Path[], Path[]]; phase?: number[]; photo: string };
interface Ground {
  version: number;
  frame: Path;
  road: Path[];
  curbs: { parts: Path[] }[];
  lines: Line[];
  crossings: { stripes: Path[]; estimatedStripes?: number[] }[];
  arrows: {
    kind: number;
    bearing: number;
    at: LonLat;
    paint?: Path[];
    photo: string;
    conflicts?: { type: 'arrow' | 'stop'; with: string; squareMetres: number }[];
    duplicateOf?: string;
  }[];
}

export const AERIAL_BEARING = -42 * Math.PI / 180;
export const ROAD_OVERLAY_ASSETS = {
  road: 'data/v2/seogyo-ground.json',
  overlay: 'data/v2/seogyo-ground.json',
  hand: 'data/v2/seogyo-lines.svg',
};

const PAINT = ['#f1f0e9', '#efbd52', '#6395c8'];
type XZ = [number, number];

function drawGround(ground: Ground, mode: 'road' | 'overlay') {
  const standalone = mode === 'road';
  const group = new THREE.Group();
  const batches = new Map<string, { y: number; color: string; positions: number[] }>();
  function fill(ring: XZ[], color: string, y: number) {
    const key = `${color}/${y}`;
    if (!batches.has(key)) batches.set(key, { y, color, positions: [] });
    const { positions } = batches.get(key)!;
    const points = ring.map(([x, z]) => new THREE.Vector2(x, z));
    for (const face of THREE.ShapeUtils.triangulateShape(points, [])) {
      for (const i of face) positions.push(points[i].x, y, points[i].y);
    }
  }

  function stroke(path: Path, color: string, y: number, width: number, offset = 0, dash = 0, phase = 0) {
    strokeXZ(path.map(groundPoint), color, y, width, offset, dash, phase);
  }

  function strokeXZ(p: XZ[], color: string, y: number, width: number, offset = 0, dash = 0, phase = 0) {
    const [on, off] = PAINT_DASHES[dash];
    let along = phase;
    for (let i = 1; i < p.length; i++) {
      const [a, b] = [p[i - 1], p[i]];
      const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
      const length = Math.hypot(dx, dz);
      if (!length) continue;
      const [ux, uz] = [dx / length, dz / length];
      const point = (distance: number, lateral: number): XZ =>
        [a[0] + distance * ux - lateral * uz, a[1] + distance * uz + lateral * ux];
      const band = (start: number, end: number) => fill([
        point(start, offset - width / 2), point(end, offset - width / 2),
        point(end, offset + width / 2), point(start, offset + width / 2),
      ], color, y);
      if (on === 0) band(0, length);
      else {
        const cycle = on + off;
        for (let t = Math.floor(along / cycle) * cycle; t < along + length; t += cycle) {
          const start = Math.max(0, t - along);
          const end = Math.min(length, t + on - along);
          if (end > start) band(start, end);
        }
      }
      along += length;
    }
  }

  if (standalone) {
    fill(ground.frame.map(groundPoint), '#d1c6b1', 0.011);
    for (const ring of ground.road) fill(ring.map(groundPoint), '#50585c', 0.018);
  }
  for (const curb of ground.curbs) {
    for (const path of curb.parts) stroke(path, standalone ? '#e3d9c3' : '#69f3c6', 0.030, .15);
  }
  for (const line of ground.lines) {
    const style = lineStyle(line.kind, line.subtype);
    const occluded = line.photo === 'occluded';
    const color = standalone ? PAINT[style.color] : occluded ? '#ffae55'
      : line.photo === 'reference-mismatch' ? '#ef9bc9' : '#68dfff';
    const dash = (value: number) => !standalone && occluded ? 2 : value;
    if (line.stripes) {
      line.stripes.forEach((pieces, i) => {
        for (const p of pieces) stroke(p, color, 0.040, style.w, 0, dash(i === 0 ? style.dashL : style.dashR));
      });
    } else {
      line.parts.forEach((path, i) => {
        stroke(path, color, 0.040, style.w, -style.sep, dash(style.dashL), line.phase?.[i]);
        if (style.sep) stroke(path, color, 0.040, style.w, style.sep, dash(style.dashR), line.phase?.[i]);
      });
    }
  }
  for (const crosswalk of ground.crossings) {
    const estimated = new Set(crosswalk.estimatedStripes);
    crosswalk.stripes.forEach((stripe, index) => {
      const color = standalone ? '#f4f1e5' : estimated.has(index) ? '#ffae55' : '#8be5ff';
      fill(stripe.map(groundPoint), color, 0.044);
    });
  }
  for (const arrow of ground.arrows) {
    if (arrow.duplicateOf) continue;
    const hiddenPaint = !standalone && arrow.photo === 'occluded';
    const conflicts = !standalone && Boolean(arrow.conflicts?.length);
    const color = standalone ? '#eeeae2' : hiddenPaint ? '#ffae55' : conflicts ? '#ef9bc9' : '#b7d5f6';
    const paintArrow = (points: XZ[]) => {
      fill(points, color, 0.048);
      if (conflicts && hiddenPaint) strokeXZ([...points, points[0]], '#ef9bc9', 0.050, .075);
    };
    if (arrow.paint) {
      for (const part of arrow.paint) paintArrow(part.map(groundPoint));
      continue;
    }
    const angle = arrow.bearing * Math.PI / 180;
    const [fx, fz] = [Math.cos(angle), -Math.sin(angle)];
    const [x, z] = groundPoint(arrow.at);
    for (const poly of arrowShape(arrow.kind) ?? []) {
      const points: XZ[] = [];
      for (let i = 0; i < poly.length; i += 2) {
        const [u, v] = [poly[i], poly[i + 1]];
        points.push([x + fx * u + fz * v, z + fz * u - fx * v]);
      }
      paintArrow(points);
    }
  }
  for (const { y, color, positions } of batches.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const faded = !standalone;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide, transparent: faded,
      depthWrite: !faded, opacity: faded && y === 0.044 ? .56 : faded ? .90 : 1,
    }));
    mesh.renderOrder = 1;
    group.add(mesh);
  }
  return group;
}

export function createRoadOverlay(onChange: () => void, anisotropy = 1) {
  const group = new THREE.Group();
  const cache = new Map<string, { state: Status; mesh?: THREE.Object3D }>();
  const dataCache = new Map<Site, Promise<Ground>>();
  let active = '';

  async function hand() {
    const [x, z] = groundPoint(PILOT_SITES.seogyo);
    const geometry = new THREE.PlaneGeometry(156, 156).rotateX(-Math.PI / 2).rotateY(AERIAL_BEARING);
    const map = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}${ROAD_OVERLAY_ASSETS.hand}`);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
    mesh.position.set(x, .05, z);
    return mesh;
  }

  function ground(site: Site) {
    if (!dataCache.has(site)) {
      const path = site === 'seogyo' ? ROAD_OVERLAY_ASSETS.road : 'data/v2/hapjeong-ground.json';
      dataCache.set(site, fetch(`${import.meta.env.BASE_URL}${path}`).then(async response => {
        if (!response.ok) throw new Error('Ground file unavailable');
        const value = await response.json() as Ground;
        if (value.version !== 1) throw new Error('Unsupported ground format');
        return value;
      }).catch(error => {
        dataCache.delete(site);
        throw error;
      }));
    }
    return dataCache.get(site)!;
  }

  async function load(site: Site, mode: DrawnSurface, key: string) {
    const entry: { state: Status; mesh?: THREE.Object3D } = { state: 'loading' };
    cache.set(key, entry);
    try {
      entry.mesh = mode === 'hand' ? await hand() : drawGround(await ground(site), mode);
      entry.state = 'ready';
      entry.mesh.visible = key === active;
      group.add(entry.mesh);
    } catch {
      entry.state = 'error';
    }
    onChange();
  }

  return {
    group,
    setMode(mode: SurfaceMode, site: Site = 'seogyo') {
      active = mode === 'photo' ? '' : `${site}/${mode}`;
      for (const [key, entry] of cache) if (entry.mesh) entry.mesh.visible = key === active;
      const current = cache.get(active);
      if (mode !== 'photo' && (!current || current.state === 'error')) void load(site, mode, active);
    },
    state: () => active ? cache.get(active)?.state ?? 'loading' : 'ready',
  };
}

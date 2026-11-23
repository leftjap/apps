import type { Crosswalk } from '../data/board.ts';
import { cumLen } from '../poly.ts';
import type { BusRoute } from '../sim/buses.ts';
import type { Edge } from '../sim/graph.ts';
import { makeIntersections } from '../sim/intersection/index.ts';
import type { XZ } from './hapjeong-vehicles.ts';

type Link = {
  id: string;
  kind: '1' | '4' | '6';
  rank: number;
  points: XZ[];
  len: number;
  next: number[];
  stop: { id: string; at: number } | null;
  duplicateOf: string | null;
};

export type HapjeongCars = {
  links: Link[];
  bundles: { lanes: number[]; at: number[]; offsets: number[] }[];
  bus: number[];
  central: number[];
  window: [number, number, number, number];
  stopLines: number[];
  crosswalks: { id: string; ends: [XZ, XZ]; width: number; faces: XZ[][][]; sig: boolean; lamps: string[] }[];
};

export function hapjeongCarGraph(data: HapjeongCars, selected?: ReadonlySet<number>, entries = new Set<number>()) {
  const volume = new Map(data.bundles.flatMap(bundle => bundle.lanes.map(i => [i, bundle.lanes.length] as const)));
  const central = new Set(data.central);
  const ids = data.links.map((_, i) => i).filter(i => !selected || selected.has(i));
  const index = new Map(ids.map((id, i) => [id, i]));
  const links = ids.map(i => data.links[i]);
  const busSet = new Set(data.bus);
  const edges: Edge[] = ids.map((source, id) => {
    const link = data.links[source];
    const p = Float32Array.from(link.points.flatMap(([x, z]) => [x, 0, z]));
    const cum = cumLen(p);
    const len = cum[cum.length - 1];
    const next = link.next.filter(i => index.has(i) && (data.links[i].kind !== '4' || busSet.has(source))).map(i => index.get(i)!);
    // The lane bundle supplies demand. A2 lane nodes supply routing, so one
    // directed A2 line is one Edge with zero offset in the legacy engine.
    const vol = volume.get(source) ?? 1;
    const major = link.next.some(n => central.has(n));
    return {
      id, p, cum, len, cls: major ? Math.min(link.rank, 3) : Math.min(link.rank, 4),
      lanes: 1, vol, lw: 3, st: Float32Array.of(0), lo: Float32Array.of(0), mo: new Float32Array(),
      plain: false, la: -1, lb: -1, s0: 0, full: len, next, nextW: next.map(() => 1),
      lmap: next.map(() => Int8Array.of(0, 1)), turns: new Uint8Array(1), entry: entries.has(source),
      name: '', key: source, road: source, rev: false, bus: link.kind === '4' ? 0 : -1, med: 0,
    };
  });
  const crosswalks: Crosswalk[] = data.crosswalks.map(row => {
    const [[ax, az], [bx, bz]] = row.ends;
    const length = Math.hypot(bx - ax, bz - az);
    return {
      x: (ax + bx) / 2, z: (az + bz) / 2, ux: (bx - ax) / length, uz: (bz - az) / length,
      half: length / 2, wid: row.width, sig: row.sig, sigUnknown: false,
      verts: Float32Array.of(ax, az, bx, bz),
      rings: row.faces.map(([outer]) => Float32Array.from(outer.flat())),
    };
  });
  const stopAt = new Map(links.flatMap((link, i) => link.stop ? [[i, link.stop.at] as const] : []));
  const stopLines = Float32Array.from(data.stopLines);
  const inter = makeIntersections(edges, { crosswalks, stopLines }, {
    links: new Set(ids.filter(i => central.has(i)).map(i => index.get(i)!)),
    stopAt,
  });
  const busEdges = data.bus.map(i => index.get(i)!);
  let len = 0;
  const start = busEdges.map(id => {
    const at = len;
    len += edges[id].len;
    return at;
  });
  const bus: BusRoute = { ref: '합정', to: '', kind: 0, edges: busEdges, start, len,
    stops: [], stopNames: [], shift: [], med: [], usesMed: false };
  return { edges, inter, bus, links, crosswalks, stopLines };
}

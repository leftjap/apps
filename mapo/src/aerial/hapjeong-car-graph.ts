import type { Crosswalk } from '../data/board.ts';
import { cumLen, pointAt } from '../poly.ts';
import type { BusRoute } from '../sim/buses.ts';
import type { Edge } from '../sim/graph.ts';
import { makeIntersections } from '../sim/intersection/index.ts';
import { hapjeongArea } from './survey-area.ts';
import type { HapjeongPlatform } from './hapjeong-people.ts';
export type XZ = [number, number];

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
  walkSignalGroups?: string[][];
  crosswalks: { id: string; ends: [XZ, XZ]; width: number; faces: XZ[][][]; sig: boolean; lamps: string[] }[];
};

export function hapjeongCarGraph(data: HapjeongCars, selected?: ReadonlySet<number>, entries = new Set<number>(), margin = 0,
                                busChains = [data.bus], platforms: HapjeongPlatform[] = [], busName = hapjeongArea.replay.busName) {
  const volume = new Map(data.bundles.flatMap(bundle => bundle.lanes.map(i => [i, bundle.lanes.length] as const)));
  const central = new Set(data.central);
  const ids = data.links.map((_, i) => i).filter(i => !selected || selected.has(i));
  const index = new Map(ids.map((id, i) => [id, i]));
  const [x0, z0, x1, z1] = data.window;
  const boundary = ([x, z]: XZ) => Math.min(x - x0, x1 - x, z - z0, z1 - z) < .001;
  const links = ids.map(i => {
    const row = data.links[i];
    const head = boundary(row.points[0]) ? Math.min(margin, Math.max(0, row.len - 1)) : 0;
    const tail = boundary(row.points.at(-1)!) ? Math.min(margin, Math.max(0, row.len - head - 1)) : 0;
    if (!head && !tail) return row;
    const original = row.points.flatMap(([x, z]) => [x, 0, z]);
    const cum = cumLen(original), end = cum[cum.length - 1] - tail;
    const point = (at: number): XZ => {
      const xyz = [0, 0, 0];
      pointAt(original, cum, at, xyz);
      return [xyz[0], xyz[2]];
    };
    return {
      ...row, stop: row.stop && { ...row.stop, at: row.stop.at - head },
      points: [point(head), ...row.points.filter((_, k) => cum[k] > head && cum[k] < end), point(end)],
    };
  });
  const busSet = new Set(busChains.flat());
  const edges: Edge[] = ids.map((source, id) => {
    const link = links[id];
    const p = Float32Array.from(link.points.flatMap(([x, z]) => [x, 0, z]));
    const cum = cumLen(p);
    const len = cum[cum.length - 1];
    const next = link.next.filter(i => index.has(i) && (data.links[i].kind !== '4' || busSet.has(source))).map(i => index.get(i)!);
    // The lane bundle supplies demand. A2 lane nodes supply routing, so one
    // directed A2 line is one Edge with zero offset in the legacy engine.
    const vol = volume.get(source) ?? 1;
    const major = central.has(source) || link.next.some(n => central.has(n)) ||
      data.central.some(n => data.links[n].next.includes(source)) || vol >= 2;
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
  const parallel = new Map<number, number[]>();
  for (const bundle of data.bundles) {
    const members = bundle.lanes.flatMap(id => index.has(id) ? [index.get(id)!] : []);
    for (const id of members) parallel.set(id, members);
  }
  const inter = makeIntersections(edges, { crosswalks, stopLines }, {
    links: new Set(ids.filter(i => central.has(i)).map(i => index.get(i)!)),
    stopAt, parallel,
    walkTogether: data.walkSignalGroups?.map(group => group.map(id => data.crosswalks.findIndex(c => c.id === id))),
  });
  const buses: BusRoute[] = busChains.map(chain => {
    const busEdges = chain.map(i => index.get(i)!);
    let len = 0;
    const start = busEdges.map(id => {
      const at = len;
      len += edges[id].len;
      return at;
    });
    const stops = busEdges.flatMap((id,k) => platforms.filter(stop => stop.link===links[id].id)
      .map(stop => ({key:stop.key, at:start[k]+stop.at-(boundary(data.links[chain[k]].points[0]) ? margin : 0)})))
      .sort((a,b)=>a.at-b.at);
    return { ref: busName, to: '', kind: 0, edges: busEdges, start, len,
      stops: stops.map(stop=>stop.at), stopNames: stops.map(stop=>stop.key), shift: [],
      med: stops.map(()=>false), usesMed: false };
  });
  return { edges, inter, buses, links, crosswalks, stopLines };
}

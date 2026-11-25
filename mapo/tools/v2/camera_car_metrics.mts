// Count visible lane use, stopped queues and vehicle overlaps during a replay.
import { cumLen, pointAt } from '../../src/poly.ts';
import { GREEN, RED, LEFT, RIGHT, STRAIGHT, UTURN, CYCLE } from '../../src/sim/intersection/index.ts';
import { CAR_TICK, type carPlayback } from '../../src/aerial/hapjeong-car-playback.ts';
import type { HapjeongCars, XZ } from '../../src/aerial/hapjeong-car-graph.ts';
import type { Body, CameraView } from './camera_car_view.mts';

type Run = ReturnType<typeof carPlayback>;
type Sim = ReturnType<Run['at']>;
type Debug = ReturnType<Sim['debug']>;
export type Sample = Body & { edge: number; lane: number; at: number; speed: number; model: number; visible: boolean };
type Episode = { uid: number; link: string; lane: number; move: number; from: number; until: number;
  x: number; z: number; maxBehind: number; following: Set<number>; reasons: Map<number, number> };

const steps = [3, 5, 10];
const reasonNames = ['없음', '같은 차로 앞차', '다음 구간 앞차', '차로 합침', '다른 구간 차',
  '게이트·신호', '다음 구간 신호', '횡단보도 사람', '8', '돌발 서행', '정류장',
  '횡단 진입 대기', '몸통 겹침', '앞길 사람', '합류 진입 대기'];
const moves = [LEFT, STRAIGHT, RIGHT, UTURN];

const quantile = (numbers: number[], p: number) => {
  const sorted = numbers.slice().sort((a,b) => a-b);
  if (!sorted.length) return null;
  const k = (sorted.length - 1) * p, lo = Math.floor(k);
  return sorted[lo] + (sorted[Math.ceil(k)] - sorted[lo]) * (k - lo);
};
export const distribution = (values: number[]) => ({
  min: values.reduce((min,n) => Math.min(min,n), Infinity),
  mean: values.reduce((sum,n) => sum + n, 0) / values.length,
  median: quantile(values, .5),
  p95: quantile(values, .95),
  max: values.reduce((max,n) => Math.max(max,n), -Infinity),
});
const count = (hist: Map<number, number>, key: number) => hist.set(key, (hist.get(key) ?? 0) + 1);

function distanceAlong(points: XZ[], cumulative: ArrayLike<number>, [x,z]: XZ) {
  let best = Infinity, distance = 0;
  for (let i = 1; i < points.length; i++) {
    const [a,b] = points[i-1], [c,d] = points[i];
    const dx = c-a, dz = d-b, square = dx*dx + dz*dz;
    if (!square) continue;
    const t = Math.max(0,Math.min(1,((x-a)*dx + (z-b)*dz) / square));
    const error = (x-a-t*dx)**2 + (z-b-t*dz)**2;
    if (error < best) {
      best = error;
      distance = cumulative[i-1] + t * Math.sqrt(square);
    }
  }
  return distance;
}

export class LaneUse {
  private edgeBins: ({ from: number; size: number; metres: number; offset: number } | undefined)[];
  private bins: { x: number; z: number; road: number; metres: number; seen: boolean; used: boolean; inside: boolean }[] = [];
  private roads: string[];
  private edgeRoad: number[];
  private edgeLength: number[];
  private sums: { lane: number; vehicles: number }[];
  private frameLane: Float64Array;
  private frameCars: Uint32Array;
  private frames = 0;
  private last = new Map<number, Sample>();

  constructor(data: Pick<HapjeongCars, 'links'>,
              graph: { links: Pick<HapjeongCars['links'][number], 'id'|'points'|'duplicateOf'>[]; edges: {len: number}[] },
              names: Record<string, string>) {
    this.roads = [...new Set(['(이름 미대조)', ...Object.values(names)])].sort();
    const roadOf = (id: string) => this.roads.indexOf(names[id] ?? '(이름 미대조)');
    this.edgeLength = graph.edges.map(edge => edge.len);
    this.edgeRoad = graph.links.map(link => roadOf(link.id));
    this.sums = this.roads.map(() => ({lane: 0, vehicles: 0}));
    this.frameLane = new Float64Array(this.roads.length);
    this.frameCars = new Uint32Array(this.roads.length);
    const position = [0, 0, 0];
    const source = new Map<string,{ from: number; size: number; metres: number; points: XZ[]; cum: ArrayLike<number> }>();
    for (const link of data.links) {
      if (link.kind !== '6' || link.duplicateOf) continue;
      const xyz = link.points.flatMap(([x,z]) => [x,0,z]);
      const cum = cumLen(xyz);
      const len = cum.at(-1)!;
      const size = Math.ceil(len / 5), metres = len / size;
      if (!size) continue;
      source.set(link.id, {from:this.bins.length,size,metres,points:link.points,cum});
      const road = roadOf(link.id);
      for (let k = 0; k < size; k++) {
        pointAt(xyz, cum, (k + .5) * metres, position);
        this.bins.push({x:position[0],z:position[2],road,metres,seen:false,used:false,inside:false});
      }
    }
    this.edgeBins = graph.links.map(link => {
      const bins = source.get(link.duplicateOf ?? link.id);
      if (!bins) return undefined;
      const {from,size,metres,points,cum} = bins;
      return {from,size,metres,offset:distanceAlong(points,cum,link.points[0])};
    });
  }

  add(rows: Sample[], view: CameraView, moved: boolean) {
    this.frames++;
    if (moved) {
      this.frameLane.fill(0);
      for (const bin of this.bins) {
        bin.inside = view.point(bin.x, bin.z);
        if (bin.inside) {
          bin.seen = true;
          this.frameLane[bin.road] += bin.metres;
        }
      }
    }
    this.frameCars.fill(0);
    const now = new Map<number, Sample>();
    for (const row of rows) {
      now.set(row.uid, row);
      if (row.model >= 5) continue;
      if (row.visible) this.frameCars[this.edgeRoad[row.edge]]++;
      const prev = this.last.get(row.uid);
      if (!prev) continue;
      if (prev.edge === row.edge) this.mark(row.edge,prev.at,row.at);
      else {
        this.mark(prev.edge,prev.at,this.edgeLength[prev.edge]);
        this.mark(row.edge,0,row.at);
      }
    }
    this.last = now;
    for (const [i, sum] of this.sums.entries()) {
      sum.lane += this.frameLane[i];
      sum.vehicles += this.frameCars[i];
    }
  }

  private mark(edge: number, from: number, to: number) {
    const bins = this.edgeBins[edge];
    if (!bins || to <= from) return;
    const index = (at: number) => Math.max(0,Math.min(bins.size-1,Math.floor((at+bins.offset)/bins.metres)));
    const end = index(to);
    for (let i = index(from); i <= end; i++) {
      const bin = this.bins[bins.from+i];
      if (bin.inside) bin.used = true;
    }
  }

  result() {
    const lengths = this.roads.map(() => ({visibleM: 0, usedM: 0}));
    for (const bin of this.bins) {
      if (bin.seen) lengths[bin.road].visibleM += bin.metres;
      if (bin.used) lengths[bin.road].usedM += bin.metres;
    }
    const result = (visibleM: number, usedM: number, laneSum: number, carsSum: number) => ({
      visibleM, usedM, coveragePct: visibleM ? 100 * usedM / visibleM : null,
      meanLaneKm: laneSum / this.frames / 1000, meanCars: carsSum / this.frames,
      carsPerLaneKm: laneSum ? 1000 * carsSum / laneSum : null,
    });
    const byRoad = Object.fromEntries(this.roads.flatMap((name,i) => {
      const {visibleM,usedM} = lengths[i], {lane,vehicles} = this.sums[i];
      return visibleM || vehicles ? [[name, result(visibleM,usedM,lane,vehicles)]] : [];
    }));
    const total = result(lengths.reduce((n,r) => n+r.visibleM,0), lengths.reduce((n,r) => n+r.usedM,0),
      this.sums.reduce((n,r) => n+r.lane,0), this.sums.reduce((n,r) => n+r.vehicles,0));
    return {...total, byRoad};
  }
}

function bumper(a: Sample, b: Sample, centreDistance: number) {
  return centreDistance - (a.len + b.len) / 2;
}

export class Queues {
  private run: Run;
  private active = new Map<number, Episode>();
  private episodes: Episode[] = [];
  private anchors = new Map<number, { x: number; z: number; frame: number }>();
  private stalls = new Map<number, { time: number; uid: number; link: string; seconds: number; x: number; z: number }>();
  private redEnds: { time: number; link: string; lane: number; vehicles: number }[] = [];
  private redSchedule = new Map<number, {edge: number; mask: number}[]>();
  private lastRows: Sample[] = [];
  private lastMoves: number[] = [];

  constructor(run: Run) {
    this.run = run;
    const { S } = run.graph.inter;
    const c0 = run.clock(0).tod;
    const cycleFrames = Math.round(CYCLE / CAR_TICK);
    for (const [edge, ap] of S.approach) {
      const site = S.list[ap.c];
      for (const phase of site.steps) {
        const mask = (phase.green.get(edge) ?? 0) & ap.moves;
        if (!mask) continue;
        let delta = (phase.start - site.offset - c0) % CYCLE;
        if (delta < 0) delta += CYCLE;
        let frame = Math.ceil(delta / CAR_TICK - 1e-7);
        // Use the actual signal clock at the boundary, including float rounding.
        for (let k = 0; k < 2; k++, frame++) {
          const tod = run.clock(frame * CAR_TICK).tod;
          const turned = moves.reduce((m,move) => m | ((mask & move) &&
            S.moveState(ap,move,run.clock((frame-1)*CAR_TICK).tod) === RED &&
            S.moveState(ap,move,tod) === GREEN ? move : 0), 0);
          if (!turned) continue;
          const key = frame % cycleFrames;
          const list = this.redSchedule.get(key) ?? [];
          list.push({edge,mask:turned});
          this.redSchedule.set(key,list);
          break;
        }
      }
    }
  }

  add(frame: number, rows: Sample[], d: Debug, view: CameraView) {
    const time = frame * CAR_TICK;
    const { edges, links, inter: { S, X } } = this.run.graph;
    const tod = this.run.clock(time).tod;
    const redEnds = frame ? this.redSchedule.get(frame % Math.round(CYCLE / CAR_TICK)) : undefined;
    for (const {edge,mask} of redEnds ?? []) {
      const e = edges[edge], ap = S.approach.get(edge)!;
      const gate = Math.max(0, e.len - ap.setback);
      const end = [0,0,0];
      pointAt(e.p,e.cum,gate,end);
      const waiting = this.lastRows.filter((r,i) => r.edge === edge && r.speed < .12 &&
        r.at <= gate + 1 && !!(this.lastMoves[i] & mask) && r.visible);
      if (view.point(end[0],end[2]) || waiting.length)
        this.redEnds.push({time,link:links[edge].id,lane:0,vehicles:waiting.length});
    }

    const laneRows = new Map<number, number[]>();
    const live = new Set<number>();
    const rowMoves = new Array<number>(rows.length);
    for (const [i, row] of rows.entries()) {
      live.add(row.uid);
      const key = row.edge * 16 + row.lane;
      const list = laneRows.get(key) ?? [];
      list.push(i);
      laneRows.set(key,list);
      const path = d.jp[i] >= 0 ? X.paths[d.jp[i]] : undefined;
      rowMoves[i] = S.midApproach.has(row.edge) ? STRAIGHT : path?.move ?? STRAIGHT;
      if (!row.visible) { this.anchors.delete(row.uid); continue; }
      let a = this.anchors.get(row.uid);
      if (!a || (row.x-a.x)**2 + (row.z-a.z)**2 > .8**2) {
        a = {x:row.x,z:row.z,frame};
        this.anchors.set(row.uid,a);
      }
      const seconds = (frame - a.frame) * CAR_TICK;
      if (seconds > 120 && (this.stalls.get(row.uid)?.seconds ?? 0) < seconds)
        this.stalls.set(row.uid,{time,uid:row.uid,link:row.link,seconds,x:row.x,z:row.z});
    }

    const current = new Map<number, Episode>();
    for (const indices of laneRows.values()) {
      const first = rows[indices[0]], ap = S.approach.get(first.edge);
      if (!ap || !S.list[ap.c].steps.length) continue;
      indices.sort((a,b) => rows[b].at - rows[a].at);
      for (const [rank, i] of indices.entries()) {
        const row = rows[i], move = rowMoves[i];
        if (!row.visible || row.speed >= .12 || row.at > edges[row.edge].len - ap.setback + 1 ||
          (!S.midApproach.has(row.edge) && d.past[i]) ||
          S.moveState(ap,move,tod) !== GREEN) continue;
        const lead = rank ? rows[indices[rank-1]] : undefined;
        if (lead && bumper(row,lead,lead.at-row.at) <= 10) continue;
        // If the gap crosses the link end, include cars on the selected successor.
        const rest = edges[row.edge].len - row.at;
        if (!lead && rest < 20 && d.nextE[i] >= 0) {
          const successor = laneRows.get(d.nextE[i] * 16) ?? [];
          if (successor.some(j => bumper(row,rows[j],rest + rows[j].at) <= 10)) continue;
        }
        let old = this.active.get(row.uid);
        if (old && (old.link !== row.link || old.lane !== row.lane || old.move !== move)) {
          this.finish(old);
          old = undefined;
        }
        const ep = old ?? {uid:row.uid,link:row.link,lane:row.lane,move,from:time,until:time,
          x:row.x,z:row.z,maxBehind:0,following:new Set(),reasons:new Map()};
        ep.until = time;
        count(ep.reasons, d.aheadWhy[i]);
        let behind = 0, ahead = row;
        for (let j = rank+1; j < indices.length; j++) {
          const follower = rows[indices[j]];
          if (follower.speed >= .12 || bumper(follower,ahead,ahead.at-follower.at) > 10) break;
          if (follower.visible) { behind++; ep.following.add(follower.uid); }
          ahead = follower;
        }
        ep.maxBehind = Math.max(ep.maxBehind,behind);
        current.set(row.uid,ep);
      }
    }
    for (const [uid, ep] of this.active) if (!current.has(uid)) this.finish(ep);
    for (const row of this.lastRows) if (!live.has(row.uid)) this.anchors.delete(row.uid);
    this.active = current;
    this.lastRows = rows;
    this.lastMoves = rowMoves;
  }

  private finish(ep: Episode) {
    if (ep.until - ep.from > steps[0]) this.episodes.push(ep);
  }

  result() {
    for (const ep of this.active.values()) this.finish(ep);
    const describe = (ep: Episode) => {
      const reasons = [...ep.reasons.entries()].sort((a,b) => b[1]-a[1] || a[0]-b[0]);
      const dominant = reasons[0][0];
      return { ...ep, following:[...ep.following], reason:reasonNames[dominant] ?? String(dominant),
        reasonSeconds:Object.fromEntries(reasons.map(([reason,frames]) => [reason,frames*CAR_TICK])),
        seconds:ep.until-ep.from };
    };
    const episodes = this.episodes.map(describe).map(({reasons,...ep}) => ep);
    const greenStops = steps.map(seconds => {
      const selected = episodes.filter(ep => ep.seconds > seconds);
      const byReason: Record<string,number> = {}, byLane: Record<string,Record<string,number>> = {};
      let maxBehind = 0;
      for (const ep of selected) {
        const reasons = byLane[`${ep.link}:${ep.lane}`] ??= {};
        reasons[ep.reason] = (reasons[ep.reason] ?? 0) + 1;
        byReason[ep.reason] = (byReason[ep.reason] ?? 0) + 1;
        maxBehind = Math.max(maxBehind,ep.maxBehind);
      }
      return {seconds,episodes:selected.length,vehicles:new Set(selected.map(ep=>ep.uid)).size,byReason,byLane,
        maxBehind, vehiclesBehind:new Set(selected.flatMap(ep=>ep.following)).size};
    });
    const lanes = new Map<string,number[]>();
    for (const r of this.redEnds) {
      const key = `${r.link}:${r.lane}`, values = lanes.get(key) ?? [];
      values.push(r.vehicles);
      lanes.set(key,values);
    }
    return {greenStops, greenStopEpisodes:episodes, stalls:[...this.stalls.values()],
      redEnds:{median:quantile(this.redEnds.map(r=>r.vehicles),.5),
        byLane:Object.fromEntries([...lanes].map(([key,values]) => [key,quantile(values,.5)])), samples:this.redEnds}};
  }
}

export class Overlaps {
  frames = 0;
  pairs = new Set<string>();
  contacts = new Set<string>();
  episodes = 0;

  add(rows: Sample[]) {
    const cells = new Map<number, {r: Sample; c: number; s: number}[]>();
    const contacts = new Set<string>();
    for (const r of rows) {
      if (!r.visible) continue;
      const x = Math.floor(r.x/16), z = Math.floor(r.z/16);
      const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
      for (let dx=-1; dx<=1; dx++) for (let dz=-1; dz<=1; dz++) {
        for (const {r:b,c:bc,s:bs} of cells.get((x+dx)*65536+z+dz) ?? []) {
          const rx=b.x-r.x, rz=b.z-r.z;
          const a=r.len/2, f=b.len/2;
          if (Math.abs(r.y-b.y) >= 2.5 || rx*rx+rz*rz > (a+f+2)**2) continue;
          const dot=Math.abs(c*bc+s*bs), cross=Math.abs(c*bs-s*bc);
          if (Math.abs(rx*c+rz*s) >= a + dot*f + cross*b.halfWidth ||
              Math.abs(-rx*s+rz*c) >= r.halfWidth + cross*f + dot*b.halfWidth ||
              Math.abs(rx*bc+rz*bs) >= f + dot*a + cross*r.halfWidth ||
              Math.abs(-rx*bs+rz*bc) >= b.halfWidth + cross*a + dot*r.halfWidth) continue;
          const key = `${Math.min(r.uid,b.uid)}:${Math.max(r.uid,b.uid)}`;
          if (!this.contacts.has(key)) this.episodes++;
          contacts.add(key);
          this.pairs.add(key);
        }
      }
      const key=x*65536+z, cell=cells.get(key) ?? [];
      cell.push({r,c,s});
      cells.set(key,cell);
    }
    this.frames += Number(!!contacts.size);
    this.contacts = contacts;
  }

  result() { return {frames:this.frames,episodes:this.episodes,pairs:this.pairs.size}; }
}

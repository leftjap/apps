// Compare the legacy walk asset within the same survey window.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groundPoint } from '../../src/aerial/map.ts';
import { toLatLon } from '../../src/geo.ts';
import { decodeWalk, type WalkJson } from '../../src/sim/walknet.ts';
import { edgeWidths, junctions, WIDTH_UNIT } from '../lib/walkwidth.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), 'utf8'));
const local: WalkJson = read('v2/hapjeong-hd-walk');
const [xmin, zmin, xmax, zmax] = read('v2/hapjeong-hd-cars').window;
const q = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return [0.1, 0.5, 0.9].map(f => sorted[Math.floor(f * (sorted.length - 1))] ?? null);
};

function profile(json: WalkJson, basic: boolean) {
  const g = decodeWalk(json);
  const point = (i: number) => {
    const [x, z] = [g.nx[2*i], g.nx[2*i+1]];
    if (!basic) return [x, z];
    const [lat, lon] = toLatLon(x, z);
    return groundPoint([lon, lat]);
  };
  const inside = g.adj.map((_, i) => {
    const [x, z] = point(i);
    return x >= xmin && x <= xmax && z >= zmin && z <= zmax;
  });
  const widths: number[] = [], bands: number[] = [];
  for (let i = 0; i < json.e.length / 5; i++) {
    const [a, k] = g.edgeAt.subarray(2*i, 2*i+2);
    if (!inside[a] || !inside[g.adj[a][k]]) continue;
    if (json.w) widths.push(json.w[i] * WIDTH_UNIT);
    bands.push((json.e[5*i+4] - json.e[5*i+3]) / 10);
  }
  const links = g.links.filter(l => inside[l.na] && inside[l.nb]);
  const ends = links.flatMap(l => [l.na, l.nb]);
  const connections = ends.map(i => Math.max(0, ...g.band[i].map(([lo, hi]) => hi - lo)));
  const wait = links.flatMap(l => [(Math.max(0,l.aHi)-Math.min(0,l.aLo))*.8,
    (Math.max(0,l.bHi)-Math.min(0,l.bLo))*.8]);
  const areas: number[] = [];
  for (let i = 0; json.j && i < json.j.length; i += 2 + json.j[i]) {
    let node = 0, inWindow = false;
    for (let k = i + 2; k < i + 2 + json.j[i]; k++) {
      node += json.j[k];
      inWindow ||= inside[node];
    }
    if (inWindow) areas.push(json.j[i+1]);
  }
  return { counts:{nodes:inside.filter(Boolean).length, edges:bands.length, crossings:links.length, junctions:areas.length,
    doors:json.d?.length === 0 ? 0 : undefined }, fields:{widths, bands, connections, wait, areas,
    radii:inside.flatMap((yes,i) => yes ? [g.rad[i]] : []), landingRadii:ends.map(i => g.rad[i])} };
}
const basic = profile(read('walk'), true), survey = profile(local, false);
console.log(JSON.stringify({ counts:{basic:basic.counts, survey:survey.counts},
  fields:Object.fromEntries(Object.entries(basic.fields).map(([name, values]) => {
    const samples = survey.fields[name as keyof typeof survey.fields];
    const [lo, , hi] = q(values);
    return [name,{basic:q(values), survey:q(samples), count:samples.length,
      below:lo === null ? null : samples.filter(x => x < lo - .001).length,
      above:hi === null ? null : samples.filter(x => x > hi + .001).length}];
  })) }, null, 2));
assert.ok(Array.isArray(local.d), 'door slots must be explicit even when unavailable');
assert.deepEqual(local.w, edgeWidths(local), 'widths must use the legacy three-sample rule');
assert.deepEqual(local.j, junctions(local, local.w), 'junctions must use the legacy graph rule');
assert.ok(survey.fields.connections.every(w => w > 0), 'each crossing end needs a walkable connection');
assert.ok(survey.fields.landingRadii.some(r => Math.abs(r - .3) > .001), 'landing radius must respond to local clearance');

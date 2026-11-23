// Same board, traffic provider, seed and 30-second timeline before/after the A2 adapter.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeBoard } from '../../src/data/board.ts';
import { decodeMarks } from '../../src/data/marks.ts';
import { decodeLanes } from '../../src/data/road.ts';
import { makeBusRoutes } from '../../src/sim/buses.ts';
import { makeCars } from '../../src/sim/cars.ts';
import { buildCarGraph } from '../../src/sim/graph.ts';
import { makeIntersections } from '../../src/sim/intersection/index.ts';
import { makeSimProvider } from '../../src/sim/provider.ts';

const read = (name: string) => JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), 'utf8'));
const board = decodeBoard(read('board'));
const edges = buildCarGraph(board.roads, decodeLanes(read('road').lanes), decodeMarks(read('marks')).arrows);
const inter = makeIntersections(edges, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: read('signals') });
const sim = makeCars(edges, makeSimProvider(), 11, 256, makeBusRoutes(board.buses, edges, undefined, board.crosswalks), inter);
const now = { tod: 14 * 3600, dow: 6, doy: 175 };
sim.setFocus(0, 0, 300, () => false);
sim.fill(sim.target(now));
sim.fillBuses(now);
const hash = createHash('sha256');
for (let i = 1; i <= 300; i++) {
  sim.step(.1, {...now, tod: now.tod + i / 10});
  for (const a of [sim.cars.uid, sim.cars.x, sim.cars.y, sim.cars.z, sim.cars.yaw]) {
    hash.update(Buffer.from(a.buffer, a.byteOffset, sim.cars.n * a.BYTES_PER_ELEMENT));
  }
}
console.log(JSON.stringify({cars:sim.cars.n, digest:hash.digest('hex')}));

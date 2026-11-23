// Compare the original basic-board pedestrian run against the current engine.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeBoard } from '../../src/data/board.ts';
import { decodeMarks } from '../../src/data/marks.ts';
import { decodeLanes } from '../../src/data/road.ts';
import { busStopPortals, makeBusRoutes } from '../../src/sim/buses.ts';
import { buildCarGraph } from '../../src/sim/graph.ts';
import { makeIntersections } from '../../src/sim/intersection/index.ts';
import { makePeople } from '../../src/sim/people/index.ts';
import { makeSimProvider } from '../../src/sim/provider.ts';
import { decodeWalk } from '../../src/sim/walknet.ts';

const root = new URL('../../', import.meta.url);
const read = (name: string) => JSON.parse(readFileSync(new URL(`public/data/${name}.json`, root), 'utf8'));
const board = decodeBoard(read('board'));
const edges = buildCarGraph(board.roads, decodeLanes(read('road').lanes), decodeMarks(read('marks')).arrows);
const { S } = makeIntersections(edges, { crosswalks: board.crosswalks, stopLines: board.stopLines, lamps: read('signals') });
const exits = board.exits.map(e => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z }));
const stops = busStopPortals(makeBusRoutes(board.buses, edges, undefined, board.crosswalks), edges).portals;
const walk = read('walk');
const now = { tod: 14 * 3600, dow: 6, doy: 175 };

function snapshot(make: typeof makePeople) {
  const people = make(decodeWalk(walk), [...exits, ...stops], makeSimProvider(), 5, 256, {
    buildings: board.buildings,
    walkLeft: (xw, tod) => S.crossSite[xw] < 0 ? -1 : S.walkLeft(xw, tod),
    busy: new Uint32Array(board.crosswalks.length),
  });
  people.setFocus(0, 0, 300);
  people.warm(30, now);
  const hash = createHash('sha256');
  let samples = 0;
  for (let i = 1; i <= 300; i++) {
    people.step(.1, { ...now, tod: now.tod + i / 10 }, true);
    const { w } = people;
    samples += w.n;
    hash.update(`${w.n}:`);
    for (const values of [w.id, w.x, w.z, w.yaw]) {
      hash.update(Buffer.from(values.buffer, values.byteOffset, w.n * values.BYTES_PER_ELEMENT));
    }
  }
  if (!samples) throw Error('기본 판에서 보행자가 생성되지 않았습니다.');
  return { people: people.w.n, samples, digest: hash.digest('hex') };
}

const dir = mkdtempSync(join(tmpdir(), 'mapo-legacy-people-'));
try {
  cpSync(new URL('src/', root), join(dir, 'src'), { recursive: true });
  const original = join(dir, 'src/sim/people/index.ts');
  writeFileSync(original, execFileSync('git', ['show', 'e90f6b7a:mapo/src/sim/people/index.ts'], {cwd: fileURLToPath(root)}));
  const old = await import(pathToFileURL(original).href) as { makePeople: typeof makePeople };
  const before = snapshot(old.makePeople), after = snapshot(makePeople);
  console.log(JSON.stringify({ before, after }));
  if (before.digest !== after.digest) process.exitCode = 1;
} finally {
  rmSync(dir, { recursive:true, force:true });
}

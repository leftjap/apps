// Use exactly the basic-board width and junction rules on the surveyed pavement.
import { readFileSync } from 'node:fs';
import type { WalkJson } from '../../src/sim/walknet.ts';
import { edgeWidths, junctions } from '../lib/walkwidth.ts';

const walk: WalkJson = JSON.parse(readFileSync(0, 'utf8'));
const w = edgeWidths(walk);
console.log(JSON.stringify({ w, j: junctions(walk, w) }));

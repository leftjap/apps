import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import type { SurveyArea } from '../../src/aerial/survey-area.ts';
import type { HapjeongEntrances } from '../../src/aerial/hapjeong-people.ts';

type Bounds = [number, number, number, number];
type Area = SurveyArea & {
  fetch: Record<'core' | 'expanded' | 'vehicleAudit' | 'vehicleSeams', Bounds>;
  frame: { origin: [number, number] };
  sources: { hd: string; board: string };
  platforms?: { name: string; keys: string[] };
  busService?: HapjeongEntrances['busService'];
};

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

export function loadArea(): Area {
  const i = process.argv.indexOf('--area');
  const path = i === -1 ? join(here, 'areas/hapjeong.json') : process.argv[i + 1];
  if (!path || path.startsWith('--')) throw Error('--area requires a JSON file');
  return JSON.parse(readFileSync(path, 'utf8'));
}

export const areaPath = (path: string) => resolve(root, path);
export const assetPath = (area: Area, suffix = '') => join(areaPath(area.output.directory), `${area.output.stem}${suffix}.json`);

export function readAsset(area: Area, name: string) {
  const path = assetPath(area, `-${name}`);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  return JSON.parse(gunzipSync(readFileSync(`${path}.gz`)).toString('utf8'));
}

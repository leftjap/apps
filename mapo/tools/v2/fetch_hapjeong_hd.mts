import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { parseEnv } from 'node:util';

const key = parseEnv(await readFile(`${homedir()}/.config/mapo/.env`, 'utf8')).VWORLD_API_KEY;
if (!key) throw Error('VWORLD_API_KEY is missing');
const apiKey = key;
const core = [126.9119, 37.5481, 126.915, 37.5505];
const expanded = [126.9102, 37.54675, 126.9167, 37.55185];
const dir = new URL('../raw/ngii/hapjeong-hd/', import.meta.url);
const types = {
  b2: 'lt_l_b2surfacelinemark', b3: 'lt_c_b3surfacemark',
  a2: 'lt_l_a2link', a1: 'lt_p_a1node',
  a4: 'lt_c_a4subsidiarysection', c1: 'lt_p_c1trafficlight',
} as const;
await mkdir(dir, { recursive: true });
async function fetchLayer(layer: keyof typeof types, bbox: number[], suffix = '') {
  const query = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '1.1.0', REQUEST: 'GetFeature', TYPENAME: types[layer],
    BBOX: bbox.join(','), MAXFEATURES: '1000', OUTPUT: 'application/json',
    SRSNAME: 'EPSG:4326', KEY: apiKey,
  });
  let response;
  try {
    response = await fetch(`https://api.vworld.kr/req/wfs?${query}`, {
      headers: { Referer: 'http://localhost:5198/apps/mapo/aerial.html' }, signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw Error(`WFS ${layer}${suffix} request failed`);
  }
  if (!response.ok) throw Error(`WFS ${layer}${suffix} HTTP ${response.status}`);
  const body = await response.text();
  let data;
  try { data = JSON.parse(body); }
  catch { throw Error(`WFS ${layer}${suffix} returned a non-JSON response`); }
  if (!Array.isArray(data.features)) throw Error(`WFS ${layer}${suffix} returned no feature collection`);
  if (data.features.length === 1000) throw Error(`WFS ${layer}${suffix} reached the request cap`);
  await writeFile(new URL(`${layer}${suffix}.json`, dir), body);
  console.log(layer+suffix, data.features.length, bbox.join(','));
}

const audit = [126.9075, 37.5460, 126.9190, 37.5540];
const seams = [126.9050, 37.5445, 126.9215, 37.5555];
const requests = process.argv.includes('--vehicle-seams') ? [
  ['a1', seams, '-vehicle-seams'] as const,
] : process.argv.includes('--vehicle-audit') ? [
  ['a1', audit, '-vehicle-audit'] as const, ['a2', audit, '-vehicle-audit'] as const,
] : process.argv.includes('--crossing-audit') ? [
  ['b3', expanded, '-expanded'] as const, ['a4', expanded, '-expanded'] as const,
] : [
  ...Object.keys(types).map(layer => [layer as keyof typeof types, core, ''] as const),
  ['a2', expanded, '-expanded'] as const, ['a1', expanded, '-expanded'] as const,
];
const results = await Promise.allSettled(requests.map(([type, box, suffix]) => fetchLayer(type, box, suffix)));
for (const result of results) if (result.status === 'rejected') {
  console.error(result.reason.message);
  process.exitCode = 1;
}

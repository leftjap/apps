import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { parseEnv } from 'node:util';
import { AERIAL_DEV_ORIGIN, tileAtGround, tileBounds, vworldTileUrl, type Tile } from '../../src/aerial/map.ts';
import { areaPath, loadArea } from './area.mts';

const [west, north, east, south] = loadArea().window;
const first = tileAtGround(west, north), last = tileAtGround(east, south);
const tiles: (Tile & { path: string })[] = [];
for (let y = first.y; y <= last.y; y++) for (let x = first.x; x <= last.x; x++) {
  tiles.push({ x, y, path: areaPath(`tools/raw/aerial/19/${y}/${x}.jpeg`) });
}

let key: string | undefined;
async function cache(tile: typeof tiles[number]) {
  const valid = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  const cached = await readFile(tile.path).catch(() => null);
  if (cached && valid(cached)) return true;
  key ??= await readFile(`${homedir()}/.config/mapo/.env`, 'utf8')
    .then(env => parseEnv(env).VWORLD_API_KEY).catch(() => undefined);
  if (!key) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(vworldTileUrl(key, tile), {
        headers: { Referer: `${AERIAL_DEV_ORIGIN}/apps/mapo/aerial.html` },
        redirect: 'error', signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/jpeg')) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!valid(bytes)) continue;
      await mkdir(dirname(tile.path), { recursive: true });
      const temp = `${tile.path}.${process.pid}.tmp`;
      await writeFile(temp, bytes);
      await rename(temp, tile.path);
      return true;
    } catch {
      // A missing tile cannot supply a roof colour.
    }
  }
  return false;
}

const available = [];
for (let i = 0; i < tiles.length; i += 8) {
  const batch = await Promise.all(tiles.slice(i, i + 8).map(async tile =>
    await cache(tile) ? { ...tile, ...tileBounds(tile) } : null));
  available.push(...batch.filter(tile => tile !== null));
}
console.log(JSON.stringify({ requested: tiles.length, tiles: available }));

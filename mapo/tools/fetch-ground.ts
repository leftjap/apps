// OSM(Overpass)에서 바닥 면 자료(땅 쓰임새·운동장·놀이터·주차장·광장·보행 면·물가 등)를 받아 tools/raw/areas.json 에 저장한다.
// 실행: node tools/fetch-ground.ts   (다시 받으려면 tools/raw/areas.json 을 지운다)
import { existsSync, writeFileSync } from 'node:fs';
import { BOARD_R, toLatLon } from '../src/geo.ts';

const file = new URL('./raw/areas.json', import.meta.url);
if (existsSync(file)) {
  console.log('areas: 이미 있음');
  process.exit(0);
}
const r = BOARD_R + 150;
const [n, w] = toLatLon(-r, -r);
const [s, e] = toLatLon(r, r);
const b = `(${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)})`;
const KINDS = [
  `["landuse"]`,
  `["leisure"]`,
  `["amenity"~"^(parking|school|kindergarten|university|college|hospital|place_of_worship|community_centre|townhall|police|fire_station|library|marketplace|fountain|bicycle_parking|motorcycle_parking|parking_space)$"]`,
  `["area:highway"]`,
  `["highway"]["area"="yes"]`,
  `["place"="square"]`,
  `["man_made"~"^(bridge|pier|breakwater|embankment|wastewater_plant|water_works|works|reservoir_covered|pumping_station)$"]`,
  `["natural"~"^(sand|beach|bare_rock|scree|wetland|grassland|heath|scrub|wood|water|shingle)$"]`,
  `["waterway"~"^(dock|riverbank)$"]`,
  `["surface"]["area"="yes"]`,
];
const body = `[out:json][timeout:180];(${KINDS.flatMap((k) => [`way${k}${b};`, `relation${k}${b};`]).join('')});out geom;`;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
for (let attempt = 0; attempt < 3; attempt++)
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'mapo-live-3d-bake/0.1' },
        body: 'data=' + encodeURIComponent(body),
        signal: AbortSignal.timeout(200_000),
      });
      if (!res.ok) {
        console.log(`  ${new URL(url).host} → ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { elements: unknown[] };
      const text = JSON.stringify({ elements: json.elements });
      writeFileSync(file, text);
      console.log(`areas: ${json.elements.length}개, ${(text.length / 1e6).toFixed(1)}MB`);
      process.exit(0);
    } catch (err) {
      console.log(`  ${new URL(url).host} → ${(err as Error).message}`);
    }
    await new Promise((res) => setTimeout(res, 5000 * (attempt + 1)));
  }
throw new Error('Overpass에서 받지 못함');

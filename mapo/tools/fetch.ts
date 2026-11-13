// OSM(Overpass)에서 모형판 원자료를 받아 tools/raw/ 에 저장한다. 이미 받은 파일은 건너뛴다.
// 실행: node tools/fetch.ts   (다시 받으려면 tools/raw/ 의 해당 파일을 지운다)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { BOARD_R, toLatLon } from '../src/geo.ts';

/** 판 중심에서 r(m)까지 덮는 사각형을 nx×ny 조각으로 나눈 Overpass bbox 문자열들 */
function boxes(r: number, n = 1): string[] {
  const out: string[] = [];
  const step = (2 * r) / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const [n1, w] = toLatLon(-r + i * step, -r + j * step);
      const [s1, e] = toLatLon(-r + (i + 1) * step, -r + (j + 1) * step);
      out.push(`(${s1.toFixed(6)},${w.toFixed(6)},${n1.toFixed(6)},${e.toFixed(6)})`);
    }
  return out;
}

const R = BOARD_R;
/** 이름 → [조각 수, bbox를 받아 질의문을 만드는 함수] */
const QUERIES: Record<string, [number, (b: string) => string]> = {
  buildings: [3, (b) => `(way["building"]${b};relation["building"]${b};);out geom;`],
  highways: [
    2,
    (b) =>
      `way["highway"~"^(motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|unclassified|residential|living_street|service|pedestrian|footway|path|cycleway|steps)$"]${b};out geom;`,
  ],
  railways: [1, (b) => `way["railway"~"^(subway|rail|light_rail)$"]${b};out geom;`],
  routes: [1, (b) => `relation["route"~"^(subway|train|light_rail)$"]${b};out body;`],
  stations: [
    1,
    (b) => `(node["railway"~"^(station|halt|subway_entrance)$"]${b};node["public_transport"="stop_position"]${b};);out;`,
  ],
  water: [
    1,
    (b) =>
      `(way["natural"="water"]${b};relation["natural"="water"]${b};way["waterway"~"^(riverbank|river|stream|canal)$"]${b};);out geom;`,
  ],
  green: [
    1,
    (b) =>
      `(way["leisure"~"^(park|garden|pitch|playground)$"]${b};relation["leisure"~"^(park|garden)$"]${b};way["landuse"~"^(grass|forest|meadow|recreation_ground|village_green)$"]${b};relation["landuse"~"^(grass|forest|meadow)$"]${b};way["natural"~"^(wood|scrub|grassland)$"]${b};relation["natural"~"^(wood|scrub)$"]${b};);out geom;`,
  ],
  campus: [1, (b) => `(way["amenity"="university"]${b};relation["amenity"="university"]${b};);out geom;`],
  // 버스 노선은 판 근처 구간의 선형만 받는다(out geom 뒤의 bbox 가 선형을 자른다)
  buses: [1, (b) => `relation["route"~"^(bus|minibus)$"]${b};out geom${b};`],
  busstops: [1, (b) => `node["highway"="bus_stop"]${b};out;`],
  // 학교 부지(초·중·고). 이름표와 부지 바닥을 칠하는 데 쓴다
  schools: [1, (b) => `(way["amenity"="school"]${b};relation["amenity"="school"]${b};);out geom;`],
};
const RADIUS: Record<string, number> = { buses: R + 300, busstops: R + 100, railways: R + 400, routes: R + 400, stations: R + 400, water: R + 600, green: R + 300 };

const ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ask(body: string): Promise<{ elements: { type: string; id: number }[] }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'mapo-live-3d-bake/0.1' },
          body: 'data=' + encodeURIComponent(`[out:json][timeout:120];${body}`),
          signal: AbortSignal.timeout(150_000),
        });
        if (res.ok) return await res.json();
        console.log(`  ${new URL(url).host} → ${res.status}`);
      } catch (e) {
        console.log(`  ${new URL(url).host} → ${(e as Error).message}`);
      }
      await sleep(3000);
    }
    await sleep(10_000 * (attempt + 1));
  }
  throw new Error('Overpass에서 받지 못함');
}

mkdirSync(new URL('./raw/', import.meta.url), { recursive: true });
for (const [name, [n, make]] of Object.entries(QUERIES)) {
  const file = new URL(`./raw/${name}.json`, import.meta.url);
  if (existsSync(file)) {
    console.log(`${name}: 이미 있음`);
    continue;
  }
  const seen = new Map<string, unknown>();
  for (const b of boxes(RADIUS[name] ?? R + 60, n)) {
    const json = await ask(make(b));
    for (const el of json.elements) seen.set(`${el.type}${el.id}`, el);
    await sleep(2000);
  }
  const text = JSON.stringify({ elements: [...seen.values()] });
  writeFileSync(file, text);
  console.log(`${name}: ${seen.size}개, ${(text.length / 1e6).toFixed(1)}MB`);
}

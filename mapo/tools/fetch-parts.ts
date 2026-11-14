// 건물 모양을 다듬는 데 쓰는 OSM 원자료를 받아 tools/raw/ 에 저장한다. 이미 받은 파일은 건너뛴다.
// parts: 건물 부분(building:part, 층이 나뉜 건물의 덩어리별 높이·min_height·지붕 모양)
// elevators: 엘리베이터 노드(역 둘레의 지하↔지상 엘리베이터를 출구 모형으로 세운다)
// 실행: node tools/fetch-parts.ts   (다시 받으려면 tools/raw/ 의 해당 파일을 지운다)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { BOARD_R, toLatLon } from '../src/geo.ts';

const [n, w] = toLatLon(-BOARD_R - 60, -BOARD_R - 60);
const [s, e] = toLatLon(BOARD_R + 60, BOARD_R + 60);
const box = `(${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)})`;
const QUERIES: Record<string, string> = {
  parts: `(way["building:part"]${box};relation["building:part"]${box};);out geom;`,
  elevators: `node["highway"="elevator"]${box};out;`,
};
const ENDPOINTS = ['https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

async function ask(body: string): Promise<{ elements: unknown[] }> {
  for (let attempt = 0; attempt < 4; attempt++)
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
      } catch (err) {
        console.log(`  ${new URL(url).host} → ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
    }
  throw new Error('Overpass에서 받지 못함');
}

mkdirSync(new URL('./raw/', import.meta.url), { recursive: true });
for (const [name, q] of Object.entries(QUERIES)) {
  const file = new URL(`./raw/${name}.json`, import.meta.url);
  if (existsSync(file)) {
    console.log(`${name}: 이미 있음`);
    continue;
  }
  const json = await ask(q);
  const text = JSON.stringify({ elements: json.elements });
  writeFileSync(file, text);
  console.log(`${name}: ${json.elements.length}개, ${(text.length / 1e6).toFixed(2)}MB`);
}

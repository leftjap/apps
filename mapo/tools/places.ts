// 지명 바닥 글씨 자리를 굽는다: 행정동 이름(넓게 볼 때)과 이름난 거리·공원 이름(가까이 볼 때).
// OSM 원자료(행정동 경계 admin_level 8, 공원·발전소·도로명 주소)를 tools/raw/ 에 받아 두고, 이름과 자리만 public/data/places.json 에 쓴다.
// 실행: node tools/places.ts   (다시 받으려면 tools/raw/dongs.json · placefeats.json 을 지운다)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { BOARD_R, toLatLon, toXZ } from '../src/geo.ts';
import { axis, roomiest } from './lib/label.ts';

interface LL {
  lat: number;
  lon: number;
}
interface El {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  geometry?: LL[];
  members?: { type: string; role: string; geometry?: LL[] }[];
}

const R = BOARD_R;
const [n, w] = toLatLon(-R, -R);
const [s, e] = toLatLon(R, R);
const BOX = `(${s.toFixed(6)},${w.toFixed(6)},${n.toFixed(6)},${e.toFixed(6)})`;
const QUERIES: Record<string, string> = {
  dongs: `relation["boundary"="administrative"]["admin_level"="8"]${BOX};out geom;`,
  placefeats: `(way["leisure"="park"]["name"~"경의선|한강공원"]${BOX};way["power"="plant"]${BOX};node["natural"="peak"]${BOX};node["place"="quarter"]${BOX};nwr["addr:street"~"^(어울마당로|포은로)$"]["addr:housenumber"]${BOX};);out geom;`,
};
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

async function ask(body: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++)
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
      await new Promise((r) => setTimeout(r, 3000));
    }
  throw new Error('Overpass에서 받지 못함');
}

const raw = async (name: string): Promise<El[]> => {
  const file = new URL(`./raw/${name}.json`, import.meta.url);
  if (!existsSync(file)) writeFileSync(file, JSON.stringify(await ask(QUERIES[name])));
  return JSON.parse(readFileSync(file, 'utf8')).elements;
};
const xz = (g: LL[]) => g.map((p) => toXZ(p.lat, p.lon));
/** 짝홀 규칙의 점 포함 판정(고리 조각들이 합쳐서 닫혀 있으면 된다) */
function inside(rings: [number, number][][], x: number, z: number): boolean {
  let c = false;
  for (const r of rings)
    for (let i = 0; i + 1 < r.length; i++) {
      const [ax, az] = r[i];
      const [bx, bz] = r[i + 1];
      if (az > z !== bz > z && x < ax + ((z - az) / (bz - az)) * (bx - ax)) c = !c;
    }
  return c;
}
const ringsOf = (el: El) => (el.type === 'way' && el.geometry ? [xz(el.geometry)] : (el.members ?? []).filter((m) => m.geometry).map((m) => xz(m.geometry!)));
const r1 = (v: number) => Math.round(v * 10) / 10;

// 물(한강 등): 동 경계는 강 한가운데까지 가므로 물 위에는 이름을 두지 않는다(tools/bake.ts 의 마스크와 같은 자료)
const water = JSON.parse(readFileSync(new URL('./raw/water.json', import.meta.url), 'utf8'))
  .elements.filter((el: El) => !el.tags?.tunnel && el.tags?.covered !== 'yes' && (!el.tags?.waterway || el.tags.waterway === 'riverbank'))
  .map(ringsOf)
  .filter((r: unknown[]) => r.length);
const wet = (x: number, z: number) => water.some((r: [number, number][][]) => inside(r, x, z));

// ── 행정동: 판 안 땅에서 가장 넓게 빈 자리(판 가장자리에서 120m 안쪽) ──
const MIN_ROOM = 150; // 이보다 좁게 걸친 동(판 가장자리에 조금만 들어온 동)은 쓰지 않는다
const dongs: { name: string; x: number; z: number; r: number }[] = [];
for (const el of await raw('dongs')) {
  const name = el.tags?.name;
  if (!name) continue;
  const rings = ringsOf(el);
  const at = roomiest([-R, -R, R, R], 20, (x, z) => Math.hypot(x, z) < R - 120 && inside(rings, x, z) && !wet(x, z));
  console.log(`${name}: ${at ? `(${Math.round(at.x)}, ${Math.round(at.z)}) 여유 ${Math.round(at.r)}m` : '판 밖'}`);
  if (at && at.r >= MIN_ROOM) dongs.push({ name, x: r1(at.x), z: r1(at.z), r: Math.round(at.r) });
}

// ── 이름난 곳 ──
const feats = await raw('placefeats');
const byId = (type: string, id: number) => feats.find((f) => f.type === type && f.id === id);
/** 도로명 주소 [from, to] 번(가지 번호 무시)인 건물·점의 자리: 길 양쪽에 놓이므로 늘어선 방향이 곧 길 방향이다 */
const addresses = (street: string, from: number, to: number): [number, number][] =>
  feats.flatMap((f) => {
    const no = parseInt(f.tags?.['addr:housenumber'] ?? '', 10);
    if (f.tags?.['addr:street'] !== street || !(no >= from && no <= to)) return [];
    const g = f.geometry ?? (f.lat !== undefined ? [{ lat: f.lat, lon: f.lon! }] : []);
    const p = xz(g);
    return p.length ? [[p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length] as [number, number]] : [];
  });
const outline = (type: string, id: number) => {
  const f = byId(type, id);
  const g = f?.geometry ?? (f?.lat !== undefined ? [{ lat: f.lat, lon: f.lon! }, { lat: f.lat, lon: f.lon! }] : null);
  if (!g) throw new Error(`${type}/${id} 없음`);
  return xz(g);
};
/** [이름, 점들, 글줄을 점들이 늘어선 방향으로 둘지] */
const PLACES: [string, [number, number][], boolean][] = [
  // 경의선숲길공원 연남동 구간(OSM alt_name=연트럴파크)
  ['연트럴파크', outline('way', 477482749), true],
  // 경의선숲길: 연남동 구간은 연트럴파크로 쓰고, 이 이름은 홍대입구역 동쪽 와우교~서강대 쪽 두 구간에 쓴다
  ['경의선숲길', [...outline('way', 471699519), ...outline('way', 471701656)], true],
  // 걷고싶은거리: 어울마당로 107~155-1, 약 500m(서울시 조성, 2016~2017)
  ['걷고싶은거리', addresses('어울마당로', 107, 155), true],
  // 레드로드는 경의선숲길~당인리발전소 약 2km. 걷고싶은거리와 겹치지 않게 남쪽 어울마당로에 쓴다
  ['레드로드', addresses('어울마당로', 17, 100), true],
  // 망리단길: 망원동 포은로 상권(가게 주소 포은로 71·78·87·112 둘레)
  ['망리단길', addresses('포은로', 60, 112), true],
  // 당인리 발전소: OSM 서울화력발전소(old_name=당인리화력발전소) 부지
  ['당인리 발전소', outline('way', 306198188), false],
  // 상수동 카페거리: 공식 구간이 없어 OSM 의 상수동 자리(상수역 북동쪽 골목)에 쓴다
  ['상수동 카페거리', outline('node', 415153949), false],
  ['와우산', outline('node', 10252999064), false],
  ['망원한강공원', outline('way', 330666503), false],
  // 성미산은 OSM 에 이름 붙은 산·공원 자료가 없어 대략의 가운데에 쓴다
  ['성미산', [toXZ(37.5665, 126.9105), toXZ(37.5665, 126.9105)], false],
];
const places: { text: string; x: number; z: number; turn: number }[] = [];
for (const [text, pts, along] of PLACES) {
  if (pts.length < 2) throw new Error(`${text}: 자리 자료 없음`);
  const a = axis(pts);
  places.push({ text, x: r1(a.x), z: r1(a.z), turn: along ? Math.round(a.turn * 1000) / 1000 : 0 });
  console.log(`${text}: (${Math.round(a.x)}, ${Math.round(a.z)}) 길이 ${Math.round(a.len)}m, 점 ${pts.length}개`);
}

writeFileSync(new URL('../public/data/places.json', import.meta.url), JSON.stringify({ dongs, places }));
console.log(`동 ${dongs.length}곳(${dongs.map((d) => d.name).join('·')}), 이름난 곳 ${places.length}곳`);

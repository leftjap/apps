// 마포 라이브 3D 실시간 도시데이터 중계. 서울 열린데이터광장 '실시간 도시데이터'(한 번에 한 장소, 응답 약 130KB)를
// 서버에서 받아 화면에 필요한 값(장소 인구·나이대, 둘레 도로 구간 속도, 강수 형태·강수량, 대기질, 사고통제, 문화행사)만 추려 한 번에 돌려준다.
// 도시데이터의 사고통제는 장소 둘레만 다루므로 TOPIS 돌발정보(AccInfo, 서울 전역)도 받아 판 둘레(반경 2.3km)만 더한다.
// 인증키는 Supabase secret SEOUL_OPENAPI_KEY 에 두고 브라우저로 보내지 않는다(키가 없으면 503).
// 실시간 도시데이터 주소는 http 라서 https 인 GitHub Pages 에서는 직접 부를 수 없다는 점도 이 중계가 맡는다.
// 같은 결과를 5분 동안 메모리에 두어 상류 호출을 줄인다(인구는 5분, 도로는 수 분 간격으로 바뀐다).
// 단위 테스트: index_test.ts (deno test --allow-env, 저장소 루트에서)
const PLACES = ['홍대 관광특구', '홍대입구역(2호선)', '연남동', '합정역', '망원한강공원'];
const ORIGIN = 'https://leftjap.github.io';
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120' } });

export interface LivePlace {
  name: string;
  level: string;
  min: number;
  max: number;
  /** 0~9세, 10대, … 70대 이상 비율(%) */
  ages: number[];
  female: number;
  time: string;
}
export interface LiveRoad {
  id: string;
  /** 원활·서행·정체 */
  idx: string;
  /** km/h */
  spd: number;
  /** [경도, 위도] 출발 노드부터 도착 노드까지 */
  xy: [number, number][];
}

export interface LiveWeather {
  /** 강수 형태: 없음·비·비/눈·눈·빗방울·빗방울/눈날림·눈날림 */
  type: string;
  /** 1시간 강수량 글: '-', '1mm 미만', '2.0' 같은 */
  mm: string;
  time: string;
}

export interface LiveAir {
  pm10: number;
  pm10Idx: string;
  pm25: number;
  pm25Idx: string;
  time: string;
}
/** 사고·공사·통제 한 건 */
export interface LiveAccident {
  id: string;
  /** city: 도시데이터 사고통제, topis: TOPIS 돌발정보 */
  src: string;
  /** 유형(교통사고·공사·행사 등) */
  kind: string;
  /** 세부 유형 */
  detail: string;
  info: string;
  start: string;
  end: string;
  lon: number;
  lat: number;
  /** TOPIS 도로 구간 번호(도시데이터 도로 구간과 같은 번호 체계) */
  link?: string;
}
export interface LiveEvent {
  name: string;
  /** 'YYYY-MM-DD~YYYY-MM-DD' */
  period: string;
  place: string;
  lon: number;
  lat: number;
}

// deno-lint-ignore no-explicit-any
type Raw = any;
const num = (v: unknown) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;

// ── GRS80 중부원점 TM(TOPIS 좌표: 원점 38N 127E, 동 200000, 북 500000) → 경위도 ──
const A = 6378137.0;
const F = 1 / 298.257222101;
const E2 = 2 * F - F * F;
const EP2 = E2 / (1 - E2);
const LAT0 = (38 * Math.PI) / 180;
const LON0 = (127 * Math.PI) / 180;
const meridian = (p: number) =>
  A *
  ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * p -
    ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * p) +
    ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * p) -
    ((35 * E2 ** 3) / 3072) * Math.sin(6 * p));
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
/** TM (x, y) → [경도, 위도] */
export function tmToLonLat(x: number, y: number, fe = 200000, fn = 500000): [number, number] {
  const mu = (meridian(LAT0) + (y - fn)) / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const p1 = mu + ((3 * E1) / 2 - (27 * E1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * E1 ** 2) / 16 - (55 * E1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * E1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * E1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1);
  const c = Math.cos(p1);
  const t = Math.tan(p1);
  const c1 = EP2 * c * c;
  const t1 = t * t;
  const n1 = A / Math.sqrt(1 - E2 * s * s);
  const r1 = (A * (1 - E2)) / (1 - E2 * s * s) ** 1.5;
  const d = (x - fe) / n1;
  const lat = p1 - ((n1 * t) / r1) * ((d * d) / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 + ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720);
  const lon = LON0 + (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) / c;
  return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
}

/** 판 가운데(37.5515, 126.919)에서 m 단위 거리 */
const fromBoard = (lon: number, lat: number) => Math.hypot((lon - 126.919) * 88_200, (lat - 37.5515) * 111_000);
const NEAR = 2300;
const tag = (row: string, name: string) => (new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(row)?.[1] ?? '').trim();
const unxml = (v: string) => v.replace(/&#13;|&#10;|\r|\n/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const ymdhm = (d: string, t: string) => (d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.padStart(4, '0').slice(0, 2)}:${t.padStart(4, '0').slice(2, 4)}` : '');

/** TOPIS 돌발정보(AccInfo) XML 에서 판 둘레 것만 추린다. 오류 응답이면 null, 자료가 없으면 [] */
export function trimAcc(xml: string, types: Record<string, string>, dtypes: Record<string, string>): LiveAccident[] | null {
  const code = /<CODE>([^<]*)<\/CODE>/.exec(xml)?.[1] ?? '';
  if (code === 'INFO-200') return [];
  if (code !== 'INFO-000') return null;
  const out: LiveAccident[] = [];
  for (const m of xml.matchAll(/<row>([\s\S]*?)<\/row>/g)) {
    const r = m[1];
    const [lon, lat] = tmToLonLat(Number(tag(r, 'grs80tm_x')), Number(tag(r, 'grs80tm_y')));
    if (!(fromBoard(lon, lat) < NEAR)) continue;
    const t = tag(r, 'acc_type');
    const dt = tag(r, 'acc_dtype');
    out.push({
      id: `t:${tag(r, 'acc_id')}`,
      src: 'topis',
      kind: types[t] ?? t,
      detail: dtypes[dt] ?? dt,
      info: unxml(tag(r, 'acc_info')),
      start: ymdhm(tag(r, 'occr_date'), tag(r, 'occr_time')),
      end: ymdhm(tag(r, 'exp_clr_date'), tag(r, 'exp_clr_time')),
      lon,
      lat,
      link: tag(r, 'link_id'),
    });
  }
  return out;
}
/** 코드표(AccMainCode·AccSubCode) XML → { 코드: 이름 } */
export function codeTable(xml: string, code: string, name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of xml.matchAll(/<row>([\s\S]*?)<\/row>/g)) out[tag(m[1], code)] = unxml(tag(m[1], name));
  return out;
}
const pt = (s: string): [number, number] => s.split('_').map(Number) as [number, number];

/** 실시간 도시데이터 응답 하나에서 장소 인구와 도로 구간만 추린다 */
export function trim(raw: Raw): {
  place: LivePlace | null;
  roads: LiveRoad[];
  roadTime: string;
  weather: LiveWeather | null;
  air: LiveAir | null;
  accidents: LiveAccident[];
  events: LiveEvent[];
} {
  const c = raw?.CITYDATA;
  const w = c?.WEATHER_STTS?.[0];
  const weather: LiveWeather | null = w ? { type: String(w.PRECPT_TYPE ?? ''), mm: String(w.PRECIPITATION ?? ''), time: String(w.WEATHER_TIME ?? '') } : null;
  const air: LiveAir | null = w && w.PM10_INDEX ? { pm10: num(w.PM10), pm10Idx: String(w.PM10_INDEX), pm25: num(w.PM25), pm25Idx: String(w.PM25_INDEX ?? ''), time: String(w.WEATHER_TIME ?? '') } : null;
  const accidents: LiveAccident[] = (Array.isArray(c?.ACDNT_CNTRL_STTS) ? c.ACDNT_CNTRL_STTS : [])
    .map((a: Raw) => ({
      id: `c:${a.ACDNT_X},${a.ACDNT_Y},${a.ACDNT_OCCR_DT}`,
      src: 'city',
      kind: String(a.ACDNT_TYPE ?? ''),
      detail: String(a.ACDNT_DTYPE ?? ''),
      info: String(a.ACDNT_INFO ?? '').replace(/\s+/g, ' ').trim(),
      start: String(a.ACDNT_OCCR_DT ?? ''),
      end: String(a.EXP_CLR_DT ?? ''),
      lon: Number(a.ACDNT_X),
      lat: Number(a.ACDNT_Y),
    }))
    .filter((a: LiveAccident) => Number.isFinite(a.lon) && Number.isFinite(a.lat));
  const events: LiveEvent[] = (Array.isArray(c?.EVENT_STTS) ? c.EVENT_STTS : [])
    .map((e: Raw) => ({ name: String(e.EVENT_NM ?? ''), period: String(e.EVENT_PERIOD ?? ''), place: String(e.EVENT_PLACE ?? ''), lon: Number(e.EVENT_X), lat: Number(e.EVENT_Y) }))
    .filter((e: LiveEvent) => e.name);
  const p = c?.LIVE_PPLTN_STTS?.[0];
  const place: LivePlace | null = p
    ? {
        name: String(c.AREA_NM),
        level: String(p.AREA_CONGEST_LVL),
        min: Number(p.AREA_PPLTN_MIN),
        max: Number(p.AREA_PPLTN_MAX),
        ages: [0, 10, 20, 30, 40, 50, 60, 70].map((a) => Number(p[`PPLTN_RATE_${a}`])),
        female: Number(p.FEMALE_PPLTN_RATE),
        time: String(p.PPLTN_TIME),
      }
    : null;
  const links: Raw[] = c?.ROAD_TRAFFIC_STTS?.ROAD_TRAFFIC_STTS ?? [];
  const roads = links.map((l) => {
    let xy = String(l.XYLIST).split('|').map(pt);
    // 좌표열이 도착 노드부터 적혀 있으면 출발 노드부터로 뒤집는다(속도는 출발→도착 방향의 값)
    const s = pt(String(l.START_ND_XY));
    const d = (q: [number, number]) => Math.hypot(q[0] - s[0], q[1] - s[1]);
    if (d(xy[0]) > d(xy[xy.length - 1])) xy = xy.reverse();
    return { id: String(l.LINK_ID), idx: String(l.IDX), spd: Number(l.SPD), xy };
  });
  return { place, roads, roadTime: String(c?.ROAD_TRAFFIC_STTS?.AVG_ROAD_DATA?.ROAD_TRAFFIC_TIME ?? ''), weather, air, accidents, events };
}

let cache: { at: number; body: unknown } | null = null;
let codes: { at: number; types: Record<string, string>; dtypes: Record<string, string> } | null = null;

/** TOPIS 돌발정보: [판 둘레 돌발, 진단(건수 또는 오류 코드)]. 코드표는 하루 동안 둔다 */
async function topis(key: string): Promise<[LiveAccident[] | null, string | number]> {
  const base = `http://openapi.seoul.go.kr:8088/${key}/xml`;
  const get = (path: string) => fetch(`${base}/${path}`, { signal: AbortSignal.timeout(8_000) }).then((r) => r.text());
  try {
    if (!codes || Date.now() - codes.at > 86_400_000) {
      const [m, d] = await Promise.all([get('AccMainCode/1/100/'), get('AccSubCode/1/500/')]);
      codes = { at: Date.now(), types: codeTable(m, 'acc_type', 'acc_type_nm'), dtypes: codeTable(d, 'acc_dtype', 'acc_dtype_nm') };
    }
    const xml = await get('AccInfo/1/1000/');
    const list = trimAcc(xml, codes.types, codes.dtypes);
    // 진단: 판 둘레 건수/서울 전체 건수, 또는 오류 코드
    return [list, list ? `${list.length}/${/<list_total_count>(\d+)/.exec(xml)?.[1] ?? 0}` : /<CODE>([^<]*)<\/CODE>/.exec(xml)?.[1] ?? 'parse'];
  } catch {
    return [null, 'timeout'];
  }
}

if (import.meta.main)
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const key = Deno.env.get('SEOUL_OPENAPI_KEY');
    if (!key) return json(503, { error: 'no api key' });
    if (cache && Date.now() - cache.at < 5 * 60_000) return json(200, cache.body);
    const acc = topis(key);
    const got = await Promise.all(
      PLACES.map(async (name) => {
        try {
          const res = await fetch(`http://openapi.seoul.go.kr:8088/${key}/json/citydata/1/5/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8_000) });
          return res.ok ? trim(await res.json()) : null;
        } catch {
          return null;
        }
      }),
    );
    const ok = got.filter((g) => g?.place);
    if (!ok.length) return json(502, { error: 'upstream unavailable' });
    // 여러 장소가 같은 도로 구간을 함께 주므로 구간 번호로 하나만 남긴다
    const roads = new Map<string, LiveRoad>();
    for (const g of ok) for (const r of g!.roads) roads.set(r.id, r);
    // 다섯 장소가 모두 마포구라 날씨는 처음 받은 값 하나만 준다
    const weather = ok.find((g) => g!.weather)?.weather ?? null;
    const air = ok.find((g) => g!.air)?.air ?? null;
    // 사고통제: 도시데이터 것과 TOPIS 판 둘레 것을 함께(같은 자리·같은 시작 시각이면 하나만). 문화행사는 이름으로 하나만
    const [topisAcc, topisDiag] = await acc;
    const accidents = new Map<string, LiveAccident>();
    for (const a of topisAcc ?? []) accidents.set(`${a.lon.toFixed(4)},${a.lat.toFixed(4)},${a.start}`, a);
    for (const g of ok) for (const a of g!.accidents) if (fromBoard(a.lon, a.lat) < NEAR) accidents.set(`${a.lon.toFixed(4)},${a.lat.toFixed(4)},${a.start}`, accidents.get(`${a.lon.toFixed(4)},${a.lat.toFixed(4)},${a.start}`) ?? a);
    const events = new Map<string, LiveEvent>();
    for (const g of ok) for (const e of g!.events) events.set(e.name, e);
    const body = {
      places: ok.map((g) => g!.place),
      roads: [...roads.values()],
      roadTime: ok[0]!.roadTime,
      weather,
      air,
      accidents: [...accidents.values()],
      events: [...events.values()],
      diag: { topis: topisDiag, city: ok.reduce((n, g) => n + g!.accidents.length, 0) },
      at: Date.now(),
    };
    cache = { at: Date.now(), body };
    return json(200, body);
  });

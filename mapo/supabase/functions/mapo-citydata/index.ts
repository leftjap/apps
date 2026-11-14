// 마포 라이브 3D 실시간 도시데이터 중계. 서울 열린데이터광장 '실시간 도시데이터'(한 번에 한 장소, 응답 약 130KB)를
// 서버에서 받아 화면에 필요한 값(장소 인구·나이대, 둘레 도로 구간 속도)만 추려 한 번에 돌려준다.
// 인증키는 Supabase secret SEOUL_OPENAPI_KEY 에 두고 브라우저로 보내지 않는다(키가 없으면 503).
// 실시간 도시데이터 주소는 http 라서 https 인 GitHub Pages 에서는 직접 부를 수 없다는 점도 이 중계가 맡는다.
// 같은 결과를 4분 동안 메모리에 두어 상류 호출을 줄인다(인구는 5분, 도로는 수 분 간격으로 바뀐다).
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

// deno-lint-ignore no-explicit-any
type Raw = any;
const pt = (s: string): [number, number] => s.split('_').map(Number) as [number, number];

/** 실시간 도시데이터 응답 하나에서 장소 인구와 도로 구간만 추린다 */
export function trim(raw: Raw): { place: LivePlace | null; roads: LiveRoad[]; roadTime: string } {
  const c = raw?.CITYDATA;
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
  return { place, roads, roadTime: String(c?.ROAD_TRAFFIC_STTS?.AVG_ROAD_DATA?.ROAD_TRAFFIC_TIME ?? '') };
}

let cache: { at: number; body: unknown } | null = null;

if (import.meta.main)
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const key = Deno.env.get('SEOUL_OPENAPI_KEY');
    if (!key) return json(503, { error: 'no api key' });
    if (cache && Date.now() - cache.at < 4 * 60_000) return json(200, cache.body);
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
    const body = { places: ok.map((g) => g!.place), roads: [...roads.values()], roadTime: ok[0]!.roadTime, at: Date.now() };
    cache = { at: Date.now(), body };
    return json(200, body);
  });

// 마포 라이브 3D 실시간 지하철 위치 중계. 서울 열린데이터광장 '실시간 열차 위치'를 판 위 네 노선(2호선, 6호선, 경의중앙선, 공항철도)마다 받아
// 판 안 역과 그 바로 바깥 역에 있는 열차만 추려 한 번에 돌려준다. 인증키는 Supabase secret SEOUL_SUBWAY_KEY(없으면 503).
// 실시간 지하철 키는 하루 1,000번까지라, 같은 결과를 110초 동안 메모리에 두어 여러 사람이 봐도 2분에 네 번만 부른다.
// 한도를 넘거나 상류가 실패하면 502 를 주고, 화면은 시간표 열차로 돌아간다.
// 단위 테스트: index_test.ts (deno test --allow-env, 저장소 루트에서)
const LINES: [string, string][] = [
  ['2', '2호선'],
  ['6', '6호선'],
  ['K', '경의중앙선'],
  ['A', '공항철도'],
];
/** 노선마다 판 안 역과 판 바로 바깥 역 */
const STATIONS: Record<string, string[]> = {
  '2': ['당산', '합정', '홍대입구', '신촌', '이대'],
  '6': ['대흥', '광흥창', '상수', '합정', '망원', '마포구청', '월드컵경기장'],
  K: ['가좌', '홍대입구', '서강대', '공덕'],
  A: ['공덕', '홍대입구', '디지털미디어시티'],
};
const ORIGIN = 'https://leftjap.github.io';
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });

export interface LiveTrain {
  /** 판의 노선 id: 2, 6, K, A */
  line: string;
  no: string;
  /** 지금(또는 막 지난) 역, 괄호를 뗀 이름 */
  stn: string;
  /** 상하행(2호선은 0 내선, 1 외선) */
  updn: string;
  /** 0 진입, 1 도착, 2 출발, 3 전역 출발 */
  st: string;
  /** 이 위치를 받은 시각(epoch ms) */
  rcv: number;
}

// deno-lint-ignore no-explicit-any
type Raw = any;
const bare = (s: string) => String(s).replace(/\(.*\)/, '').trim();

/** 실시간 열차 위치 응답 하나에서 판 둘레 역의 열차만 추린다. 오류 응답이면 null */
export function trim(line: string, raw: Raw): LiveTrain[] | null {
  const list: Raw[] | undefined = raw?.realtimePositionList;
  if (!Array.isArray(list)) return null;
  const near = new Set(STATIONS[line] ?? []);
  return list
    .filter((t) => near.has(bare(t.statnNm)))
    .map((t) => ({
      line,
      no: String(t.trainNo),
      stn: bare(t.statnNm),
      updn: String(t.updnLine),
      st: String(t.trainSttus),
      rcv: Date.parse(String(t.recptnDt).replace(' ', 'T') + '+09:00'),
    }));
}

let cache: { at: number; body: unknown } | null = null;

if (import.meta.main)
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const key = Deno.env.get('SEOUL_SUBWAY_KEY');
    if (!key) return json(503, { error: 'no api key' });
    if (cache && Date.now() - cache.at < 110_000) return json(200, cache.body);
    const got = await Promise.all(
      LINES.map(async ([id, name]) => {
        try {
          const res = await fetch(`http://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimePosition/0/200/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8_000) });
          return res.ok ? trim(id, await res.json()) : null;
        } catch {
          return null;
        }
      }),
    );
    if (got.every((g) => g === null)) return json(502, { error: 'upstream unavailable' });
    const body = { trains: got.flatMap((g) => g ?? []), at: Date.now() };
    cache = { at: Date.now(), body };
    return json(200, body);
  });

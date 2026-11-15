// 마포 라이브 3D 실시간 지하철 위치 중계. 서울 열린데이터광장 '실시간 열차 위치'를 판 위 네 노선(2호선, 6호선, 경의중앙선, 공항철도)마다 받아
// 판 안 역과 그 바로 바깥 역에 있는 열차만 추려 한 번에 돌려준다. 인증키는 Supabase secret SEOUL_SUBWAY_KEY(없으면 503).
// 역 안내판에 쓰려고 '실시간 도착 정보'(realtimeStationArrival/ALL, 한 번에 서울 전역)도 함께 받아 판 안 역 것만 추린다.
// 열차 위치만으로는 판 밖 먼 열차의 도착 시각을 알 수 없어 공식 안내와 달랐다(2026-11-15 홍대입구 외선: 화면 시간표 7분, 공식 4분).
// 실시간 지하철 키는 하루 1,000번까지라, 같은 결과를 110초 동안 메모리에 두어 여러 사람이 봐도 2분에 다섯 번만 부른다.
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
/** 판 안 역(역 안내판이 있는 역) */
const INSIDE: Record<string, string[]> = { '2': ['합정', '홍대입구', '신촌'], '6': ['광흥창', '상수', '합정', '망원', '마포구청'], K: ['홍대입구', '서강대'], A: ['홍대입구'] };
/** 도착 정보의 subwayId → 판의 노선 id */
const SUBWAY_ID: Record<string, string> = { '1002': '2', '1006': '6', '1063': 'K', '1065': 'A' };
/** 열차 위치 응답에서 상행(2호선은 내선)의 updnLine 코드. 공항철도만 거꾸로다(2026-11-15 같은 열차 번호를 두 응답에서 맞춰 봄) */
const UP_CODE: Record<string, string> = { '2': '0', '6': '0', K: '0', A: '1' };
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

export interface LiveArrival {
  line: string;
  stn: string;
  /** 열차 위치와 같은 상하행 코드(UP_CODE) */
  updn: string;
  /** 0 진입, 1 도착, 2 출발, 3 전역 출발, 4 전역 진입, 5 전역 도착, 99 운행 중 */
  cd: string;
  /** 도착까지 남은 초(0 이면 알 수 없음) */
  sec: number;
  msg: string;
  cur: string;
  ord: string;
  no: string;
  rcv: number;
}

// deno-lint-ignore no-explicit-any
type Raw = any;
const bare = (s: string) => String(s).replace(/\(.*\)/, '').trim();
const when = (s: string) => Date.parse(String(s).replace(/\.\d+$/, '').replace(' ', 'T') + '+09:00');

/** 실시간 도착 정보 응답에서 판 안 역의 네 노선만 추린다. 오류 응답이면 null */
export function trimArrivals(raw: Raw): LiveArrival[] | null {
  const list: Raw[] | undefined = raw?.realtimeArrivalList;
  if (!Array.isArray(list)) return null;
  const out: LiveArrival[] = [];
  for (const a of list) {
    const line = SUBWAY_ID[String(a.subwayId)];
    const stn = bare(a.statnNm);
    if (!line || !INSIDE[line].includes(stn)) continue;
    out.push({
      line,
      stn,
      updn: /상행|내선/.test(String(a.updnLine)) === (UP_CODE[line] === '0') ? '0' : '1',
      cd: String(a.arvlCd),
      sec: Number(a.barvlDt) || 0,
      msg: String(a.arvlMsg2 ?? ''),
      cur: String(a.arvlMsg3 ?? ''),
      ord: String(a.ordkey ?? ''),
      no: String(a.btrainNo ?? ''),
      rcv: when(a.recptnDt),
    });
  }
  return out;
}

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
      rcv: when(t.recptnDt),
    }));
}

let cache: { at: number; body: unknown } | null = null;

if (import.meta.main)
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const key = Deno.env.get('SEOUL_SUBWAY_KEY');
    if (!key) return json(503, { error: 'no api key' });
    if (cache && Date.now() - cache.at < 110_000) return json(200, cache.body);
    // 노선마다 상류가 준 열차 수(판 둘레만 고르기 전)와 오류 코드도 함께 준다(자료가 비었을 때 원인을 보려고)
    const all: Record<string, number | string> = {};
    const got = await Promise.all(
      LINES.map(async ([id, name]) => {
        try {
          const res = await fetch(`http://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimePosition/0/200/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8_000) });
          const raw = res.ok ? await res.json() : null;
          all[id] = Array.isArray(raw?.realtimePositionList) ? raw.realtimePositionList.length : String(raw?.code ?? raw?.errorMessage?.code ?? res.status);
          return raw ? trim(id, raw) : null;
        } catch {
          all[id] = 'timeout';
          return null;
        }
      }),
    );
    // 역 도착 정보(실패해도 열차 위치는 준다)
    let arrivals: LiveArrival[] | null = null;
    try {
      const res = await fetch(`http://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeStationArrival/ALL`, { signal: AbortSignal.timeout(8_000) });
      const raw = res.ok ? await res.json() : null;
      arrivals = raw ? trimArrivals(raw) : null;
      all.arrival = arrivals ? arrivals.length : String(raw?.code ?? raw?.errorMessage?.code ?? res.status);
    } catch {
      all.arrival = 'timeout';
    }
    if (got.every((g) => g === null)) return json(502, { error: 'upstream unavailable', all });
    const body = { trains: got.flatMap((g) => g ?? []), arrivals, all, at: Date.now() };
    cache = { at: Date.now(), body };
    return json(200, body);
  });

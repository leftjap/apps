import * as THREE from 'three';
import { makeAmbience } from './audio.ts';
import { loadBoard } from './data/board.ts';
import { decodeSurface, type SurfaceJson } from './data/surface.ts';
import { decodeMarks, type MarksJson } from './data/marks.ts';
import { toXZ } from './geo.ts';
import { makeBoats, makePicnic } from './render/boats.ts';
import { makeBuildings } from './render/buildings.ts';
import { makeDetail } from './render/detail.ts';
import { makeCarMeshes } from './render/cars.ts';
import { makeCatMeshes } from './render/cats.ts';
import { env, updateEnv, weather } from './render/env.ts';
import { makeGround } from './render/ground.ts';
import { LANDMARKS, LM_COLORS, makeLandmarks } from './render/landmarks.ts';
import { makeRails, type TrainSpot } from './render/rails.ts';
import { makeGroundLabels, makeMarker, makeRings, type GroundLabel } from './render/rings.ts';
import { makeRoads } from './render/roads.ts';
import { makeMarks } from './render/marks.ts';
import { makeSignalMarks } from './render/signals.ts';
import { makeFlow } from './render/flow.ts';
import { makeBusIslands, makeBusStops } from './render/busstops.ts';
import { NEAR_VIEW, sizeAt } from './render/size.ts';
import { makeView } from './render/scene.ts';
import { makeSchools } from './render/schools.ts';
import { makeStations } from './render/stations.ts';
import { makeTrees } from './render/trees.ts';
import { makeWalkerMesh } from './render/walkers.ts';
import { makeRain } from './render/weather.ts';
import { makeIncidents } from './render/incidents.ts';
import { BUS_KINDS, busStopPortals, makeBusRoutes } from './sim/buses.ts';
import { makeCars } from './sim/cars.ts';
import { makeCatReactor } from './sim/catReact.ts';
import { CAT_SPOTS, catAt, catName, feeders, makeCats, PERSONALITY_KO, type CatState } from './sim/cats.ts';
import { makeClock } from './sim/clock.ts';
import { sunAngles } from './sim/curves.ts';
import { buildCarGraph } from './sim/graph.ts';
import { decodeLanes, type LanesJson } from './data/lanes.ts';
import { decodeWalk, type WalkJson } from './sim/walknet.ts';
import { makeSimProvider } from './sim/provider.ts';
import { makeLiveProvider } from './data/live.ts';
import { makeLiveSubway } from './data/subway.ts';
import { loadStreetview, matchBuildings, treeKind, xz as llToXZ } from './data/streetview.ts';
import { BOATS, boatAt } from './sim/boats.ts';
import { picnicOn, seasonOf, type Season } from './sim/season.ts';
import { makeSignals } from './sim/signals.ts';
import { arrivals, stationBoard, trainsAt } from './sim/trains.ts';
import { matchIncidents, spotXZ, type Incident } from './sim/incidents.ts';
import { doorWanted, makeWalkers, underpasses, walkerScale, ZONES } from './sim/walkers.ts';
import { makeHud, type Card, type CardLine, type Layer, type SeasonPick, type Weather } from './ui/hud.ts';
import { arrivalBadge, makeTags } from './ui/tags.ts';
import './ui/hud.css';

const BASE = import.meta.env.BASE_URL;
const query = new URLSearchParams(location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const sky = document.querySelector<HTMLElement>('#sky')!;
const stage = document.querySelector<HTMLElement>('#stage')!;
const small = matchMedia('(max-width: 760px)').matches;
const MAX_PEOPLE = small ? 2000 : 8000;
const MAX_CARS = small ? 1500 : 5000;

const view = makeView(canvas);
const clock = makeClock(location.search);
// 실시간 도시데이터: 중계 함수 주소(VITE_CITYDATA_URL)가 빌드에 들어 있을 때만 5분마다 받아 시뮬레이션 위에 덧씌운다(지금 시각으로 볼 때만)
const live = makeLiveProvider(makeSimProvider());
const provider = live.provider;
live.use(clock.live);
const LIVE_URL = import.meta.env.VITE_CITYDATA_URL as string | undefined;
if (LIVE_URL) {
  const pull = () =>
    fetch(LIVE_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.places?.length && live.set(d))
      .catch(() => {});
  pull();
  setInterval(pull, 5 * 60_000);
}
const ambience = makeAmbience();
const loading = document.querySelector<HTMLElement>('#loading')!;
// 지명 자리(tools/places.ts 가 OSM 행정동 경계·공원·도로명 주소로 굽는다)
type Named = { dongs: { name: string; x: number; z: number }[]; places: { text: string; x: number; z: number; turn: number }[] };
// 로드뷰 기록(data-src/streetview/*.json, 구역마다 따로): 기록한 건물은 난수 색·무늬 대신 기록 값으로 그린다
const [board, mask, named, streetview, surface, marks, walkJson, roadLanes] = await Promise.all([
  loadBoard(BASE),
  new THREE.TextureLoader().loadAsync(`${BASE}data/mask.png`),
  fetch(`${BASE}data/places.json`).then((r) => r.json() as Promise<Named>),
  loadStreetview().catch(() => []),
  // 찻길 바닥(교차로 면·띠 구간, tools/lib/surface.ts 가 굽는다)
  fetch(`${BASE}data/surface.json`).then((r) => r.json() as Promise<SurfaceJson>).then(decodeSurface),
  // 노면 표시(서울시 차선 선·안전지대·노면 화살표, tools/bake.ts 가 굽는다)
  fetch(`${BASE}data/marks.json`).then((r) => r.json() as Promise<MarksJson>).then(decodeMarks),
  // 걷는 길 그래프(보도 면 안의 보도 선·골목·보행로와 횡단보도 연결, tools/lib/walknet.ts 가 굽는다)
  fetch(`${BASE}data/walk.json`).then((r) => r.json() as Promise<WalkJson>),
  // 차로 가운데선(서울시 차선으로 읽은 방향별 차로, tools/lanes.ts 가 굽는다)
  fetch(`${BASE}data/lanes.json`).then((r) => r.json() as Promise<LanesJson>).then(decodeLanes),
]).catch((e) => {
  loading.textContent = '자료를 불러오지 못했습니다. 새로고침해 주세요.';
  throw e;
});

// ── 시뮬레이션 ──
const start = clock.now();
const walkGraph = decodeWalk(walkJson);
const carGraph = buildCarGraph(board.roads, roadLanes, marks.arrows);
// 신호는 보행 신호 횡단보도가 있는 교차로·길 중간 횡단보도에 두고, 정지선은 서울시 차선 자료의 정지선 자리를 쓴다
const signals = makeSignals(carGraph, { crosswalks: board.crosswalks, stopLines: board.stopLines });
// 횡단보도마다 지금 사람이 건너고 있는 자리(축 2m 칸 비트): 차는 자기 차로 앞에 사람이 있으면 서고, 사람은 신호 없는 횡단보도에서 차가 다가오면 기다린다
const crossBusy = new Uint32Array(board.crosswalks.length);
const cars = makeCars(carGraph, provider, 11, MAX_CARS, makeBusRoutes(board.buses, carGraph, undefined, board.crosswalks), signals, { list: board.crosswalks, busy: crossBusy });
// 차는 보는 곳(카메라가 겨눈 자리 둘레) 위주로 실제 밀도에 가깝게 채우고, 화면 밖에서만 놓고 뺀다
const onScreenP = new THREE.Vector3();
const onScreen = (x: number, z: number) => {
  onScreenP.set(x, 0, z).project(view.camera);
  return onScreenP.z < 1 && Math.abs(onScreenP.x) < 1.15 && Math.abs(onScreenP.y) < 1.15;
};
const focusR = () => Math.min(2200, Math.max(250, view.viewDist() * 1.2));
let focusAt = { x: view.controls.target.x, z: view.controls.target.z, r: focusR(), age: 0 };
view.camera.updateMatrixWorld();
cars.setFocus(focusAt.x, focusAt.z, focusAt.r, onScreen);
cars.fill(cars.target(start));
cars.fillBuses(start);
// 사람은 역 출구와 버스 정류장에서만 나타나고 사라진다
const stops = busStopPortals(cars.routes, carGraph);
const medStop = new Set(stops.portals.filter((p) => p.median).map((p) => p.key));
const walkers = makeWalkers(
  walkGraph,
  [
    ...board.exits.map((e) => ({ kind: 'exit' as const, key: e.st, x: e.x, z: e.z })),
    // 버스 정류장. 중앙 정류장(길 가운데 승강장)은 승강장 끝 횡단보도를 건너 오간다
    ...stops.portals,
    // 망원한강공원 인구는 공원 안에 있는 사람이다. 공원 안(피크닉 자리)에서 나타나 공원 길을 걷고, 일부만 강변북로 밑 나들목으로 들고 난다
    ...underpasses(board.roads, ...ZONES.mangwon).map(([x, z]) => ({ kind: 'exit' as const, key: '망원나들목', x, z })),
    ...Array.from({ length: board.picnic.length / 2 }, (_, i) => ({ kind: 'exit' as const, key: '망원한강공원', x: board.picnic[i * 2], z: board.picnic[i * 2 + 1] })),
    // 구역 안과 명소 둘레 건물(바닥 40㎡ 넘는 것)의 출입구: 구역 인구 대부분은 가게·집 안에 있다가 드나든다(망원 구역 안 건물은 공원 밖 주택가라 쓰지 않는다)
    ...board.buildings.flatMap((b) => {
      let x = 0;
      let z = 0;
      for (let k = 0; k < b.pts.length; k += 2) (x += b.pts[k]), (z += b.pts[k + 1]);
      x /= b.pts.length / 2;
      z /= b.pts.length / 2;
      let a = 0;
      for (let i = 0, j = b.pts.length - 2; i < b.pts.length; j = i, i += 2) a += b.pts[j] * b.pts[i + 1] - b.pts[i] * b.pts[j + 1];
      return doorWanted(x, z) && Math.abs(a) / 2 > 40 ? [{ kind: 'door' as const, key: '', x, z, poly: b.pts, h: b.h }] : [];
    }),
  ],
  provider,
  5,
  MAX_PEOPLE,
  undefined,
  signals,
  { busy: crossBusy, traffic: (l) => cars.approaching(l.xw) },
);
// 처음부터 길에 사람이 있도록 5분쯤 미리 돌려 둔다(신호가 바뀌도록 시각도 함께 흘린다)
for (let i = 0; i < 600; i++) walkers.step(0.5, { ...start, tod: (start.tod - 300 + i * 0.5 + 86400) % 86400 });
const cats = makeCats(CAT_SPOTS, walkGraph, board.buildings);
const reactor = makeCatReactor(cats);

// ── 장면 ──
const roads = makeRoads(board.roads, surface, LM_COLORS);
// 노면 표시: 서울시 차선 선·안전지대·노면 화살표 그대로(src/render/marks.ts)
const roadMarks = makeMarks(marks);
const landmarks = makeLandmarks(board, roads.glow);
const rails = makeRails(board.lines);
const stations = makeStations(board);
const schools = makeSchools(board);
const rings = makeRings(board.exits);
const carMeshes = makeCarMeshes(MAX_CARS);
const walkerMesh = makeWalkerMesh(MAX_PEOPLE);
const catMeshes = makeCatMeshes(cats, feeders(cats));
const signalMarks = makeSignalMarks(carGraph, signals, board.crosswalks, board.crosswalkMarks, board.stopLines);
const flow = makeFlow(carGraph, signals.junctions, surface.cut);
flow.update(provider, start);
// 로드뷰 기록 구역의 나무: 판 나무 뒤에 붙이고, 수종은 기록 값으로 정한다
const svTreeRecs = streetview.flatMap((a) => a.props.flatMap((p) => (p.kind === 'tree' ? [p] : [])));
const svTrees = svTreeRecs.flatMap((p) => llToXZ(p.ll));
const svKinds = svTreeRecs.map((p) => treeKind(p.species));
const trees = makeTrees(svTrees.length ? Float32Array.from([...board.trees, ...svTrees]) : board.trees, seasonOf(start.doy));
// 수종(tools/trees.ts 가 board.json 나무 순서대로 굽는다). 오기 전에는 모두 '그 밖 활엽' 모형으로 그린다
trees.setKinds([...Array.from({ length: board.trees.length / 2 }, () => 5), ...svKinds]);
fetch(`${BASE}data/trees.json`).then((r) => r.json() as Promise<{ k: string }>).then((j) => trees.setKinds([...Array.from(j.k, Number), ...svKinds])).catch(() => {});
const svMatch = matchBuildings(board.buildings, streetview);
const buildings = makeBuildings(board.buildings, svMatch.byIndex);
const detail = makeDetail(buildings.list, buildings.looks, [...svMatch.byIndex.keys()], streetview.flatMap((a) => a.props));
const rain = makeRain(small ? 3500 : 6000);
// 실시간 돌발정보(사고·공사·통제): 차로를 막거나 구간을 통제하고, 도로 위 점멸등(공사면 라바콘)으로만 보인다
const incidentMarks = makeIncidents();
const incidentLayer = new THREE.Group();
incidentLayer.add(incidentMarks.group);
let incList: Incident[] = [];
let incEdge = new Map<string, number>();
let incKey = '';
function applyIncidents() {
  const list = clock.live ? live.incidents() : [];
  const key = list.map((q) => q.id).join('|');
  if (key === incKey) return;
  incKey = key;
  incList = list;
  const m = matchIncidents(carGraph, list);
  cars.setIncidents(m);
  incEdge = new Map(m.spots.map((sp) => [sp.id, sp.edge]));
  incidentMarks.set(
    m.spots.map((sp) => {
      const e = carGraph[sp.edge];
      const [x, z, yaw] = spotXZ(e, sp);
      const q = list.find((o) => o.id === sp.id)!;
      return { id: sp.id, x, z, yaw, width: e.lanes * e.lw, effect: sp.effect, cones: /공사/.test(q.kind + q.detail) };
    }),
  );
}
const marker = makeMarker();
const labels: GroundLabel[] = [
  { text: '한강', x: -260, z: 1560, size: 130, turn: -0.05 },
  { text: '밤섬', x: 1010, z: 1600, size: 44 },
  { text: '선유도', x: -1290, z: 1250, size: 44 },
];
// 지명(설정에서 끌 수 있다): 행정동 이름은 크게 써서 넓게 볼 때, 거리·공원 이름은 작게 써서 가까이 볼 때 읽히게 하고,
// 화면 글자 높이가 범위를 벗어나면 감춰 둘이 한꺼번에 보이지 않게 한다
const nameLabels: GroundLabel[] = [
  ...named.dongs.map((d): GroundLabel => ({ text: d.name, x: d.x, z: d.z, size: 150, fade: [9, 44] })),
  ...named.places.map((p): GroundLabel => ({ text: p.text, x: p.x, z: p.z, size: 24, turn: p.turn, fade: [12, 90] })),
];
const namesMesh = makeGroundLabels(nameLabels, true);
const boats = makeBoats(board.river, board.riverCum);
const picnic = makePicnic(board.picnic);
view.scene.add(
  makeGround(mask, board.groundAreas),
  roads.group,
  roadMarks,
  flow.mesh,
  signalMarks.group,
  // 길가 정류장은 보도 위 쉼터, 중앙 정류장은 길 가운데 승강장
  makeBusStops(walkers.docks.flatMap((d, k) => (d.kind === 'stop' && !medStop.has(d.key) ? [walkers.dockPoint(k)] : []))),
  makeBusIslands(stops.portals.filter((p) => p.median)),
  stations.group,
  rails.group,
  rings.mesh,
  makeGroundLabels(labels),
  namesMesh,
  boats.group,
  picnic,
  buildings.group,
  detail.group,
  landmarks.group,
  schools.group,
  trees.mesh,
  carMeshes.group,
  walkerMesh.mesh,
  walkerMesh.flash,
  catMeshes.group,
  rain.mesh,
  incidentLayer,
  marker.mesh,
);

// ── 고르기 대상과 카드 ──
type Target =
  | { kind: 'landmark'; id: string }
  | { kind: 'station'; name: string }
  | { kind: 'cat'; i: number }
  | { kind: 'train'; key: number }
  | { kind: 'bus'; uid: number }
  | { kind: 'boat'; i: number }
  | { kind: 'school'; i: number }
  | { kind: 'incident'; id: string }
  | { kind: 'area'; id: string };
let selected: Target | null = null;
let followed: Target | null = null;
const same = (a: Target | null, b: Target | null) => JSON.stringify(a) === JSON.stringify(b);

const hud = makeHud({
  onPreset: (name) => {
    stopTour();
    view.flyTo(name);
  },
  onClose: () => select(null),
  onFollow: () => (followed && same(followed, selected) ? unfollow() : selected && followTarget(selected)),
  onDrone: () => (view.droning ? stopTour() : startTour()),
  onSound: () => hud.setSound(ambience.toggle()),
  onTime: (tod) => {
    if (tod === null) clock.setLive();
    else clock.set(tod);
    prevTod = clock.now().tod;
  },
  onTimePreset: (name) => {
    if (name === 'live') clock.setLive();
    else clock.set(name === 'morning' ? 8 * 3600 : name === 'noon' ? 13 * 3600 : name === 'night' ? 22 * 3600 : sunsetTod() - 8 * 60);
    prevTod = clock.now().tod;
  },
  onWeather: setWeather,
  onLayer: setLayer,
  onSeason: (s) => {
    seasonPick = s;
    hud.setSeason(s);
    applySeason();
  },
  onArea: (id) => select({ kind: 'area', id }),
  onRandomCat: () => {
    let i = Math.floor(Math.random() * cats.length);
    if (selected?.kind === 'cat' && selected.i === i) i = (i + 1) % cats.length;
    select({ kind: 'cat', i });
    followTarget({ kind: 'cat', i });
  },
});

/** 오늘 해 지는 시각(초): 해 고도가 0 아래로 내려가는 때 */
function sunsetTod() {
  const doy = clock.now().doy;
  for (let t = 15 * 3600; t < 21 * 3600; t += 60) if (sunAngles(t, doy).elev < 0) return t;
  return 18 * 3600;
}

// 계절: 실시간이면 오늘 날짜, 아니면 고른 계절
let seasonPick: SeasonPick = 'live';
let season: Season = seasonOf(start.doy);
function applySeason() {
  season = seasonPick === 'live' ? seasonOf(clock.now().doy) : seasonPick;
  trees.setSeason(season);
}

// 날씨: '실시간'이면 실시간 도시데이터의 강수 형태·강수량으로 비 세기를 정한다(자료가 없거나 시험 시각이면 맑음)
let weatherPick: Weather = 'live';
function applyWeather() {
  // 눈과 미세먼지는 '실시간'일 때만 자료를 따르고, 맑음·비·안개를 고르면 고른 것만 보인다
  const real = weatherPick === 'live' && clock.live;
  const r = real ? live.rain() : null;
  weather.wantRain = weatherPick === 'live' ? (r ?? 0) : weatherPick === 'rain' ? 1 : 0;
  weather.wantFog = weatherPick === 'fog' ? 1 : 0;
  weather.wantSnow = real ? (live.snow() ?? 0) : 0;
  weather.wantDust = real ? (live.air()?.dust ?? 0) : 0;
}
function setWeather(w: Weather) {
  weatherPick = w;
  applyWeather();
  hud.setWeather(w);
}
const layers: Record<Layer, boolean> = { flow: true, cats: true, people: true, cars: true, subway: true, names: true, incidents: true };
function setLayer(l: Layer, on: boolean) {
  layers[l] = on;
  catMeshes.group.visible = layers.cats;
  walkerMesh.mesh.visible = layers.people;
  walkerMesh.flash.visible = layers.people;
  carMeshes.group.visible = layers.cars;
  rails.setUnderVisible(layers.subway);
  stations.setUnderVisible(layers.subway);
  namesMesh.visible = layers.names;
  incidentLayer.visible = layers.incidents;
  flow.mesh.visible = layers.flow;
}
setWeather(({ rain: 'rain', fog: 'fog', clear: 'clear' } as Record<string, Weather>)[query.get('weather') ?? ''] ?? 'live');
hud.setSeason('live');

function select(t: Target | null) {
  // 역을 고르면 그 역 위로 날아가 둘레의 땅과 건물을 걷어 내고 지하를 보여 준다. 출구 자리는 바닥 링이 몇 초 동안 퍼져 알린다
  if (t?.kind === 'station' && !same(t, selected)) {
    const st = board.stations.find((s) => s.name === t.name);
    if (st) view.flyAt(st.x, st.z, 720, 50);
    rings.flash(t.name);
  }
  selected = t;
  landmarks.setSelected(t?.kind === 'landmark' ? t.id : '');
  stations.setSelected(t?.kind === 'station' ? t.name : '');
  schools.setSelected(t?.kind === 'school' ? t.i : -1);
  catMeshes.setPicked(t?.kind === 'cat' ? t.i : -1);
  if (!t && followed) unfollow();
  refreshCard();
}

// 열차는 매 프레임 놓을 때 받은 가운데 칸 위치로 고르고 따라간다
let trainSpots: TrainSpot[] = [];
let boatSpots: ({ x: number; z: number } | null)[] = [];
const lineOf = new Map(board.lines.map((l) => [l.id, l]));
const busIndex = (uid: number) => {
  for (let i = 0; i < cars.cars.n; i++) if (cars.cars.uid[i] === uid) return i;
  return -1;
};

const SPEED = ['막힘', '느림', '조금 느림', '원활'];
function refreshCard() {
  if (!selected) return hud.setCard(null);
  const now = clock.now();
  const following = !!followed && same(followed, selected) && view.following;
  let card: Card | null = null;
  if (selected.kind === 'cat') {
    const c = cats[selected.i];
    card = {
      tag: `길고양이 · ${PERSONALITY_KO[c.personality]}`,
      title: catName(c),
      color: '#f2b35d',
      lines: [catStates[selected.i].status],
      note: `${c.personality === 'shy' ? '사람이 다가오면 골목 틈이나 수풀로 숨습니다.' : '사람을 보면 다가가고, 사람들은 멈춰 서서 사진을 찍습니다.'} 고양이와 급식소는 연출이며 실제 위치와는 관계없습니다.`,
      follow: following,
    };
  } else if (selected.kind === 'station') {
    const name = selected.name;
    const info = LANDMARKS.find((l) => l.station === name);
    const sim = stationBoard(board.lines, name, now.tod);
    const rows: CardLine[] = (liveRail ? subway.board(name, sim, Date.now()) : sim).map((r) => ({ dot: lineOf.get(r.line)!.color, text: `${lineOf.get(r.line)!.name} ${r.toward} · ${r.state}` }));
    rows.push(`최근 5분 하차 약 ${provider.alighting(now, name).toLocaleString('ko-KR')}명`);
    const when = liveRail
      ? '도착 안내는 서울시 실시간 도착 정보를 받은 뒤 지난 시간만큼 줄인 값이고, 그 정보가 없는 방향은 판 위 실제 열차로 어림하며, 그것도 없으면 시간표 값(시간표 표시)입니다.'
      : '열차 도착 시각은 배차 간격으로 만든 시뮬레이션입니다.';
    card = { tag: info?.kind ?? '지하철역', title: `${name}역`, color: info?.color ?? '#8fd3ff', lines: rows, note: `${info ? `${info.desc} ` : ''}${when}` };
  } else if (selected.kind === 'train') {
    const key = selected.key;
    const spot = trainSpots.find((t) => t.key === key);
    const tp = lastTrains.find((t) => t.key === key);
    if (!spot || !tp) {
      selected = null;
      return hud.setCard(null);
    }
    const l = lineOf.get(spot.line)!;
    const row = l.stopNames.length ? stationBoard([l], l.stopNames[0], now.tod).find((r) => r.dir === spot.dir) : undefined;
    // 진행 방향 앞쪽의 가장 가까운 역
    const ahead = l.stops.map((s, i) => ({ s, n: l.stopNames[i] })).filter((x) => (spot.dir ? x.s < tp.s + 5 : x.s > tp.s - 5));
    const next = spot.dir ? ahead[ahead.length - 1] : ahead[0];
    const stopped = next && Math.abs(next.s - tp.s) < 6;
    card = {
      tag: '지하철',
      title: `${l.name} 열차`,
      color: l.color,
      lines: [row?.toward ?? '', next ? (stopped ? `${next.n}역 정차 중` : `다음 역 ${next.n}`) : '판 밖으로 나가는 중'],
      note: liveRail ? '열차 위치는 서울시 실시간 열차 위치(1~4분 전 값)에서 역마다 서며 이어 움직인 것입니다.' : '열차 위치는 배차 간격과 주행 곡선으로 만든 시뮬레이션입니다.',
      follow: following,
    };
  } else if (selected.kind === 'area') {
    const id = selected.id;
    const a = provider.areas(now).find((o) => o.id === id);
    if (!a) {
      selected = null;
      return hud.setCard(null);
    }
    // 오늘 진행 중인 문화행사(실시간 도시데이터, 몇 달씩 하는 실내 전시도 많아 화면에 따로 표시하지 않고 이름과 기간만 적는다)
    const evs = clock.live ? live.events(id) : [];
    const short = (p: string) => p.replace(/\d{4}-(\d{2})-(\d{2})/g, (_, m, d) => `${Number(m)}.${Number(d)}`).replace('~', ' ~ ');
    const isLive = provider.mode === 'live';
    card = {
      tag: isLive ? '실시간 도시데이터 구역' : '구역 · 시뮬레이션',
      title: a.name,
      color: ['#5fd08a', '#f0cf5a', '#f59b4b', '#f0605d'][a.level],
      lines: [
        `${a.label} · 약 ${a.pplMin.toLocaleString('ko-KR')}~${a.pplMax.toLocaleString('ko-KR')}명`,
        ...evs.slice(0, 3).map((e) => `행사 · ${e.name} (${short(e.period)}${e.place ? `, ${e.place}` : ''})`),
        ...(evs.length > 3 ? [`행사 외 ${evs.length - 3}건`] : []),
        ...(isLive && !evs.length ? ['오늘 진행 중인 문화행사 없음'] : []),
      ],
      note: isLive
        ? '인구·혼잡과 문화행사는 서울시 실시간 도시데이터 값입니다(인구는 30분쯤 늦은 값). 행사로 모인 사람은 인구에 이미 들어 있습니다.'
        : '인구·혼잡은 시간대 패턴으로 만든 시뮬레이션입니다.',
    };
  } else if (selected.kind === 'incident') {
    const id = selected.id;
    const q = incList.find((o) => o.id === id);
    if (!q) {
      selected = null;
      return hud.setCard(null);
    }
    const e = carGraph[incEdge.get(id) ?? -1];
    card = {
      tag: `${q.kind || '돌발'}${q.detail && q.detail !== q.kind ? ` · ${q.detail}` : ''}`,
      title: e?.name || '이름 없는 길',
      color: q.effect === 'close' ? '#ff6a5a' : '#ffa53a',
      lines: [
        q.info.length > 110 ? `${q.info.slice(0, 108)}…` : q.info,
        q.start ? `시작 ${q.start}` : '',
        q.end ? `끝날 예정 ${q.end}` : '',
        q.effect === 'close' ? '화면에서는 이 둘레 구간에 차를 들이지 않습니다.' : e && e.lanes >= 2 ? '화면에서는 차로 하나를 막아 차가 옆 차로로 비켜 갑니다.' : '화면에서는 이 자리를 천천히 지나갑니다.',
      ].filter(Boolean),
      note: '서울시 실시간 돌발정보(TOPIS)와 실시간 도시데이터 사고통제 자료입니다. 자리는 가장 가까운 차로에 맞췄습니다.',
    };
  } else if (selected.kind === 'school') {
    const sc = board.schools[selected.i];
    card = { tag: '학교', title: sc.name, color: '#c4b2f2', lines: [], note: '학교 부지와 이름은 OpenStreetMap 자료입니다.' };
  } else if (selected.kind === 'boat') {
    const b = BOATS[selected.i];
    const at = boatAt(b, now.tod, board.riverCum[board.riverCum.length - 1] ?? 0);
    if (!at) {
      selected = null;
      return hud.setCard(null);
    }
    card = {
      tag: `${b.name} · 연출`,
      title: b.name,
      color: '#7cc4ff',
      lines: [at.dir > 0 ? '서강대교 쪽으로 가는 중' : '양화대교 쪽으로 가는 중'],
      note: '배의 모양과 위치, 운항 시각은 지어낸 연출입니다.',
      follow: following,
    };
  } else if (selected.kind === 'bus') {
    const i = busIndex(selected.uid);
    if (i < 0) {
      selected = null;
      return hud.setCard(null);
    }
    const r = cars.routes[cars.cars.route[i]];
    const kind = BUS_KINDS[r.kind] ?? BUS_KINDS[1];
    const toward = r.to || r.stopNames[r.stopNames.length - 1] || '';
    const next = cars.nextStop(i);
    card = {
      tag: kind.name,
      title: `${r.ref}번`,
      color: kind.color,
      lines: [toward ? `${toward} 방면` : '', next ? `다음 정류장 ${next}` : '판 밖으로 나가는 중'].filter(Boolean),
      note: '노선과 정류장은 OpenStreetMap 자료입니다. 버스 위치와 배차는 시뮬레이션입니다.',
      follow: following,
    };
  } else {
    const id = selected.id;
    const info = LANDMARKS.find((l) => l.id === id)!;
    const lines: string[] = [];
    if (info.kind === '한강 다리') {
      const k = provider.roadSpeed(now, 1, info.n * 31);
      lines.push(`차량 흐름 ${SPEED[k < 0.45 ? 0 : k < 0.65 ? 1 : k < 0.85 ? 2 : 3]}`);
    } else if (info.id === 'hongik') {
      const a = provider.areas(now).find((a) => a.id === 'hongdae')!;
      lines.push(`홍대 일대 ${a.label} · 약 ${a.pplMin.toLocaleString('ko-KR')}~${a.pplMax.toLocaleString('ko-KR')}명`);
    }
    card = { tag: info.kind, title: info.name, color: info.color, lines, note: info.desc };
  }
  hud.setCard(card);
}

// ── 따라가기·드론 산책 ──
const followPos = new THREE.Vector3();
function positionOf(t: Target): THREE.Vector3 | null {
  if (t.kind === 'cat') {
    const s = catStates[t.i];
    return followPos.set(s.x, 0, s.z);
  }
  if (t.kind === 'train') {
    const s = trainSpots.find((x) => x.key === t.key);
    return s ? followPos.set(s.x, 0, s.z) : null;
  }
  if (t.kind === 'bus') {
    const i = busIndex(t.uid);
    return i < 0 ? null : followPos.set(cars.cars.x[i], 0, cars.cars.z[i]);
  }
  if (t.kind === 'boat') {
    const b = boatSpots[t.i];
    return b ? followPos.set(b.x, 0, b.z) : null;
  }
  return null;
}
function followTarget(t: Target) {
  if (t.kind !== 'cat' && t.kind !== 'train' && t.kind !== 'bus' && t.kind !== 'boat') return;
  stopTour();
  followed = t;
  view.follow(() => (followed ? positionOf(followed) : null), t.kind === 'cat' ? 60 : t.kind === 'bus' ? 190 : t.kind === 'boat' ? 280 : 320);
  refreshCard();
}
function unfollow() {
  followed = null;
  view.unfollow();
  refreshCard();
}

/** 드론 산책 경로: 홍대 거리 → 홍대입구역 → 연트럴파크 → 망원 → 강변북로 → 당산철교 → 합정 */
const tourPoints = (() => {
  const st = (n: string) => board.stations.find((s) => s.name === n)!;
  const deck = board.lines.find((l) => l.id === '2')!;
  let dx = 0;
  let dz = 0;
  let dn = 0;
  for (let i = 0; i < deck.p.length; i += 3) if (deck.p[i + 1] > 6) (dx += deck.p[i]), (dz += deck.p[i + 2]), dn++;
  const bridge: [number, number] = dn ? [dx / dn, dz / dn] : [-900, 1300];
  const pts: [number, number][] = [
    [350, -250],
    [st('홍대입구').x, st('홍대입구').z],
    toXZ(37.5622, 126.9232),
    toXZ(37.5575, 126.9075),
    toXZ(37.5535, 126.8985),
    toXZ(37.5465, 126.9025),
    bridge,
    [st('합정').x, st('합정').z],
  ];
  return pts;
})();
let idle = 0;
function startTour() {
  if (followed) unfollow();
  view.startDrone(tourPoints);
  hud.setDrone(true);
}
function stopTour() {
  if (!view.droning) return;
  view.stopDrone();
  hud.setDrone(false);
}

// ── 고르기: 고양이·버스·열차는 화면에서의 거리로, 랜드마크·역은 광선으로 ──
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const proj = new THREE.Vector3();
let catStates: CatState[] = cats.map((c) => catAt(c, start));
let lastTrains = trainsAt(board.lines, start.tod);
// 실시간 열차 위치: 중계 함수 주소(VITE_SUBWAY_URL)가 빌드에 들어 있을 때만, 화면을 보고 있는 동안 2분마다 받는다(실시간 지하철 키는 하루 1,000번까지)
const subway = makeLiveSubway(board.lines);
let liveRail = false;
const SUBWAY_URL = import.meta.env.VITE_SUBWAY_URL as string | undefined;
if (SUBWAY_URL) {
  const pull = () => {
    if (document.visibilityState !== 'visible') return;
    fetch(SUBWAY_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.trains) return;
        subway.set(d.trains, Date.now());
        if (Array.isArray(d.arrivals)) subway.setArrivals(d.arrivals, Date.now());
      })
      .catch(() => {});
  };
  pull();
  setInterval(pull, 120_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && !subway.ready(Date.now()) && pull());
}
function nearestOnScreen(pts: { x: number; y: number; z: number }[], px: number, py: number, r: DOMRect, lim: number): [number, number] {
  let best = -1;
  let bd = lim;
  pts.forEach((p, i) => {
    proj.set(p.x, p.y, p.z).project(view.camera);
    if (proj.z > 1) return;
    const d = Math.hypot(((proj.x + 1) / 2) * r.width - px, ((1 - proj.y) / 2) * r.height - py);
    if (d < bd) (bd = d), (best = i);
  });
  return [best, bd];
}
function pickAt(clientX: number, clientY: number): Target | null {
  const r = canvas.getBoundingClientRect();
  const px = clientX - r.left;
  const py = clientY - r.top;
  const lim = small ? 34 : 26;
  if (layers.incidents && incidentMarks.spots.length) {
    const sp = incidentMarks.spots;
    const [i] = nearestOnScreen(sp, px, py, r, lim);
    if (i >= 0) return { kind: 'incident', id: sp[i].id };
  }
  if (layers.cats) {
    const [i] = nearestOnScreen(catStates.map((s) => ({ x: s.x, y: 1, z: s.z })), px, py, r, lim);
    if (i >= 0) return { kind: 'cat', i };
  }
  if (layers.cars) {
    const buses: { x: number; y: number; z: number; uid: number }[] = [];
    const c = cars.cars;
    for (let i = 0; i < c.n; i++) if (c.route[i] >= 0) buses.push({ x: c.x[i], y: c.y[i] + 2, z: c.z[i], uid: c.uid[i] });
    const [i] = nearestOnScreen(buses, px, py, r, lim);
    if (i >= 0) return { kind: 'bus', uid: buses[i].uid };
  }
  if (layers.subway) {
    const [i] = nearestOnScreen(trainSpots, px, py, r, lim);
    if (i >= 0) return { kind: 'train', key: trainSpots[i].key };
  }
  {
    const pts = boatSpots.map((b) => (b ? { x: b.x, y: 3, z: b.z } : { x: 0, y: -1e5, z: 0 }));
    const [i] = nearestOnScreen(pts, px, py, r, lim * 1.5);
    if (i >= 0 && boatSpots[i]) return { kind: 'boat', i };
  }
  ndc.set((px / r.width) * 2 - 1, 1 - (py / r.height) * 2);
  ray.setFromCamera(ndc, view.camera);
  const hit = ray.intersectObjects([...landmarks.pickables, ...stations.pickables, ...schools.pickables], false)[0];
  if (!hit) return null;
  const u = hit.object.userData;
  if (u.station) return { kind: 'station', name: u.station };
  if (u.school !== undefined) return { kind: 'school', i: u.school };
  return { kind: 'landmark', id: u.id };
}

let downAt: [number, number] | null = null;
const touches = new Set<number>();
const poke = () => {
  idle = 0;
  stopTour();
};
canvas.addEventListener('pointerdown', (e) => {
  touches.add(e.pointerId);
  downAt = [e.clientX, e.clientY];
  view.cancelFly();
  poke();
});
canvas.addEventListener('wheel', () => {
  view.cancelFly();
  view.keepZoom();
  poke();
}, { passive: true });
window.addEventListener('keydown', poke);
// 사이드바를 만지는 동안에도 드론 산책이 저절로 시작되지 않게 한다(진행 중인 산책은 그 버튼으로만 멈춘다)
document.addEventListener('pointerdown', () => (idle = 0));
canvas.addEventListener('pointerup', (e) => {
  touches.delete(e.pointerId);
  // 끌지 않고 뗀 것만 누른 것으로 본다
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) select(pickAt(e.clientX, e.clientY));
  downAt = null;
});
canvas.addEventListener('pointercancel', (e) => touches.delete(e.pointerId));
canvas.addEventListener('pointermove', (e) => {
  // 한 손가락·왼쪽 버튼으로 끌면 지도를 옮기는 것이므로 따라가기를 멈춘다(돌리기·확대는 그대로 따라간다)
  if (downAt && followed && touches.size === 1 && (e.buttons & 1) && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) unfollow();
  if (e.pointerType !== 'mouse' || e.buttons) return;
  const t = pickAt(e.clientX, e.clientY);
  landmarks.setHover(t?.kind === 'landmark' ? t.id : '');
  stations.setHover(t?.kind === 'station' ? t.name : '');
  schools.setHover(t?.kind === 'school' ? t.i : -1);
  canvas.style.cursor = t ? 'pointer' : '';
});
canvas.addEventListener('pointerleave', () => {
  landmarks.setHover('');
  stations.setHover('');
  schools.setHover(-1);
});
const tags = makeTags(
  stage,
  stations.labels,
  board.lines,
  stations.exits,
  landmarks.labels,
  schools.labels,
  (name) => {
    poke();
    select({ kind: 'station', name });
  },
  (id) => {
    poke();
    select({ kind: 'landmark', id });
  },
  (i) => {
    poke();
    select({ kind: 'school', i });
  },
);

// 개발 중 화면 확인용 손잡이(배포본에는 들어가지 않는다)
if (import.meta.env.DEV) Object.assign(window, { __dbg: { view, cats, states: () => catStates, cars, walkers, board, select, followTarget, clock, signals, trains: () => trainSpots } });

// ── 프레임 ──
view.resize();
view.jumpTo(query.get('view') ?? 'all');
new ResizeObserver(() => view.resize()).observe(canvas);
if (query.has('tour')) startTour();

loading.remove();
let last = performance.now();
let time = 0;
let prevTod = start.tod;
let hudAge = Infinity;
let frames = 0;
let fpsAt = last;
function frame(t: number) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  time += dt;
  clock.tick(dt);
  const now = clock.now();

  // 열차가 역에 서면 출구에서 사람들이 나온다. 보는 곳 가까운 역이면 먼 전철 소리를 낸다
  const target = view.controls.target;
  // 실시간 열차 위치가 있고 지금 시각으로 볼 때는 실제 열차를, 아니면 시간표 열차를 쓴다
  liveRail = clock.live && subway.ready(Date.now());
  subway.step(dt);
  const arrived = liveRail ? subway.takeArrivals() : (subway.takeArrivals(), arrivals(board.lines, prevTod, now.tod));
  for (const a of arrived.slice(0, 12)) {
    walkers.burst(a.name, Math.max(1, Math.min(14, Math.round(provider.alighting(now, a.name) / 150))));
    // 사람이 나오는 그 순간 그 역 출구 지붕이 열차의 노선 색으로 잠깐 밝아진다
    if (layers.subway) stations.flash(a.name, lineOf.get(a.line)?.color ?? '#ffffff');
    const st = board.stations.find((s) => s.name === a.name);
    if (st) ambience.train(1 - Math.hypot(st.x - target.x, st.z - target.z) / 1600);
  }
  prevTod = now.tod;
  // 보는 곳이 바뀌면(1초에 한 번 살펴서, 겨눈 자리가 반지름의 1/5 넘게 옮겨졌거나 거리가 1/5 넘게 바뀌었으면) 초점을 다시 정한다
  focusAt.age += dt;
  if (focusAt.age > 1) {
    focusAt.age = 0;
    const r = focusR();
    if (Math.hypot(target.x - focusAt.x, target.z - focusAt.z) > focusAt.r * 0.2 || Math.abs(r - focusAt.r) > focusAt.r * 0.2) {
      focusAt = { x: target.x, z: target.z, r, age: 0 };
      cars.setFocus(focusAt.x, focusAt.z, focusAt.r, onScreen);
    }
  }
  cars.step(dt, now);
  // 버스가 정류장에 서면 기다리던 사람이 타고 몇 명이 내린다
  for (const [r, k, i] of cars.dwells) {
    const key = stops.keyOf(r, k);
    const [dx, dz] = cars.door(i);
    walkers.board(key, dx, dz);
    walkers.alight(key, Math.floor(Math.random() * 4), dx, dz);
  }
  // 눈이 와도 우산을 쓰고 밖에 나온 사람이 준다(비의 0.7배로 친다)
  walkers.setRain(Math.max(weather.rain, weather.snow * 0.7));
  walkers.step(dt, now);
  // 고양이: 일정대로의 자리에 사람에 대한 반응을 덧씌운다(사람 층을 끄면 반응하지 않는다).
  // 고양이와 사람은 멀리서 볼수록 키워 그리므로, 발치에 앉는 거리도 그 배율만큼 띄운다(셰이더와 같은 크기 기준, render/size.ts)
  reactor.setGap((0.27 + 0.32) * sizeAt('mover', view.viewDist()));
  catStates = reactor.step(dt, cats.map((c) => catAt(c, now)), layers.people ? walkers.w : { ...walkers.w, n: 0 }, walkers.hold);

  updateEnv(now, time, sky, dt);
  // 지하 들여다보기: 고른 역이나 지하 열차 둘레
  {
    const f = env.uFocus.value;
    let want = 0;
    if (selected?.kind === 'station') {
      const name = selected.name;
      const st = board.stations.find((s) => s.name === name);
      if (st) (f.x = st.x), (f.y = st.z), (f.z = 230), (want = 1);
    } else if (selected?.kind === 'train') {
      const key = selected.key;
      const sp = trainSpots.find((x) => x.key === key);
      if (sp?.under) (f.x = sp.x), (f.y = sp.z), (f.z = 150), (want = 1);
    }
    f.w += (want - f.w) * Math.min(1, dt * 3);
  }
  lastTrains = liveRail ? subway.positions() : trainsAt(board.lines, now.tod);
  trainSpots = rails.update(lastTrains);
  {
    const len = board.riverCum[board.riverCum.length - 1] ?? 0;
    boatSpots = boats.update(BOATS.map((b) => boatAt(b, now.tod, len)), BOATS.map((b) => b.kind));
  }
  picnic.visible = picnicOn(now, season, Math.max(weather.rain, weather.snow));
  carMeshes.update(cars.cars, selected?.kind === 'bus' ? selected.uid : 0);
  walkerMesh.update(walkers.w, view.camera, season);
  trees.update(view.camera);
  catMeshes.update(catStates, dt);
  rings.update(dt);
  signalMarks.update(now.tod);
  landmarks.update(dt);
  stations.update(dt);
  schools.update(dt);
  view.update(dt);
  if (followed && !view.following) unfollow();
  const dist = view.viewDist();
  rain.update(target, dist);
  // 고른 고양이·버스·열차 자리에 고리를 띄운다(지하 열차는 지하 층 높이에)
  if (selected && (selected.kind === 'cat' || selected.kind === 'bus' || selected.kind === 'train')) {
    const sel = selected;
    const p = positionOf(sel);
    const spot = sel.kind === 'train' ? trainSpots.find((x) => x.key === sel.key) : undefined;
    const color = sel.kind === 'cat' ? '#f2b35d' : sel.kind === 'bus' ? BUS_KINDS[cars.routes[cars.cars.route[busIndex(sel.uid)]]?.kind ?? 1].color : (lineOf.get(spot?.line ?? '')?.color ?? '#ffffff');
    marker.set(p ? { x: p.x, y: spot?.y ?? 0, z: p.z } : null, color);
  } else marker.set(null);
  view.renderer.render(view.scene, view.camera);
  tags.update(view.camera, canvas.clientWidth, canvas.clientHeight, dist, true);
  ambience.update({ night: 1 - Math.min(1, Math.max(0, sunAngles(now.tod, now.doy).elev / 6 + 0.5)), rain: weather.rain }, dt);

  // 한동안 손대지 않으면 드론 산책을 시작한다
  idle += dt;
  if (idle > 120 && !view.droning && !followed) startTour();

  hudAge += dt;
  if (hudAge > 0.5) {
    hudAge = 0;
    live.use(clock.live);
    const pplTime = live.data?.places[0]?.time.slice(11);
    const source = provider.mode === 'live' ? `실시간 · 인구 ${pplTime} 기준` : liveRail ? '시뮬레이션' : undefined;
    hud.setClock(now, clock.live, source && liveRail ? `${source} · 지하철 실시간` : source);
    hud.setSources(provider.mode === 'live', liveRail);
    applyWeather();
    applyIncidents();
    hud.setAir(clock.live ? (live.air()?.text ?? null) : null);
    if (seasonPick === 'live' && seasonOf(now.doy) !== season) applySeason();
    hud.setAreas(provider.areas(now));
    hud.setScale(walkerScale(provider, now, MAX_PEOPLE, Math.max(weather.rain, weather.snow * 0.7)), cars.scale()[0]);
    // 역 이름표 도착 표시(가까운 보기에서만 보인다): 그 역에 선 열차는 '도착', 90초 안에 설 열차는 '곧 도착'
    for (const l of stations.labels) {
      const b = layers.subway && dist < NEAR_VIEW[1] ? arrivalBadge(liveRail ? subway.board(l.name, stationBoard(board.lines, l.name, now.tod), Date.now()) : stationBoard(board.lines, l.name, now.tod)) : null;
      tags.setArrival(l.name, b?.text ?? '', b ? (lineOf.get(b.line)?.color ?? '#3a6fb0') : '');
    }
    flow.update(provider, now);
    refreshCard();
  }
  if (import.meta.env.DEV) {
    frames++;
    if (t - fpsAt > 2000) {
      Object.assign(window, { __mapo: { fps: (frames * 1000) / (t - fpsAt), cars: cars.cars.n, walkers: walkers.w.n } });
      frames = 0;
      fpsAt = t;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
